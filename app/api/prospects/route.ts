import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { askLLMJson, LLMUnavailableError } from "@/lib/groq";
import { scrapeSite } from "@/lib/scrape";
import { REP_COOKIE, resolveRep } from "@/lib/reps";

export const maxDuration = 60;

const TRIAGE_SYSTEM = `You are a meeting-triage assistant for Gushwork, an AI-powered SEO/AEO agency selling services (~$800-2000/mo) to B2B SMBs: manufacturers, industrial brands, logistics and engineering firms.

Decide whether a sales rep should take an upcoming meeting. Rules:
- Flag companies that THEMSELVES sell SEO, content marketing, or AI-marketing tooling/services — that is competitor recon against Gushwork, verdict "do_not_take".
- Flag clearly unqualified prospects: no plausible budget for ~$800+/mo services, students, B2C hobbyists, wrong buyer persona.
- Flag the wrong stakeholder for a closing call (e.g. a junior contact with no buying authority).
- Prefer "caution" over "do_not_take" when uncertain.
- Use your own knowledge of this company if it is well-known (industry, size, what they do), even if the scrape returned nothing. Only treat a company as unknown if it is genuinely obscure AND the scrape failed — a famous brand must never come back as "unknown".

ABSENCE OF A WEBSITE (or a weak web presence) IS AN AMBIGUOUS SIGNAL — never a verdict driver by itself. It can mean "invisible online and losing deals" (a STRONG fit for Gushwork) or "demand isn't their problem" (poor fit). Poor-fit archetypes behind a weak web presence: relationship- or subcontract-locked shops, businesses at full capacity with long backlogs, marketplace-native sellers (Thomasnet, Grainger, IndiaMART), tender-driven contractors, sub-scale operators where ~$800/mo doesn't pencil, and wind-down businesses. When the signals are ambiguous, keep the verdict at "go" or "caution" and put the unresolved questions into fit_unknowns (0-3 short items), e.g. "Unknown: where does their demand come from today?", "Unknown: do they have capacity appetite for more orders?", "Unknown: can they sustain ~$800/mo with a month-4 payback?". Leave fit_unknowns empty when fit is clear.

If no website was provided, infer the most likely official domain from the company name (e.g. "American Express" -> "americanexpress.com").
Return JSON: {"verdict": "go" | "caution" | "do_not_take", "reason": "<one sentence>", "fit_unknowns": ["<short unresolved fit question>", ...], "inferred_domain": "<official domain like example.com, only when no website was provided, else null>"}`;

type TriageResult = { verdict: string; reason: string; fit_unknowns?: string[]; inferred_domain?: string | null };

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { company_name, website, contact_name, contact_role, meeting_type, scheduled_at } = body ?? {};
    if (!company_name?.trim() || !meeting_type?.trim()) {
      return NextResponse.json({ error: "company_name and meeting_type are required" }, { status: 400 });
    }

    const db = supabaseAdmin();
    const warnings: string[] = [];
    const currentRep = resolveRep(req.cookies.get(REP_COOKIE)?.value);

    // Upsert prospect by case-insensitive company name
    const { data: existing } = await db
      .from("prospects")
      .select("*")
      .ilike("company_name", company_name.trim())
      .maybeSingle();

    let prospect = existing;
    if (existing) {
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (website?.trim()) updates.website = website.trim();
      if (contact_name?.trim()) updates.contact_name = contact_name.trim();
      if (contact_role?.trim()) updates.contact_role = contact_role.trim();
      const { data: updated } = await db.from("prospects").update(updates).eq("id", existing.id).select().single();
      prospect = updated ?? existing;
    } else {
      const { data: created, error: insErr } = await db
        .from("prospects")
        .insert({
          company_name: company_name.trim(),
          website: website?.trim() || null,
          contact_name: contact_name?.trim() || null,
          contact_role: contact_role?.trim() || null,
          owner_rep: currentRep,
        })
        .select()
        .single();
      if (insErr || !created) {
        return NextResponse.json({ error: `Could not save prospect: ${insErr?.message}` }, { status: 500 });
      }
      prospect = created;
    }

    // Create the upcoming meeting
    const { data: meeting, error: mErr } = await db
      .from("meetings")
      .insert({
        prospect_id: prospect.id,
        meeting_type,
        rep_name: currentRep,
        scheduled_at: scheduled_at || new Date().toISOString(),
        status: "upcoming",
      })
      .select()
      .single();
    if (mErr || !meeting) {
      return NextResponse.json({ error: `Could not create meeting: ${mErr?.message}` }, { status: 500 });
    }

    // TRIAGE: scrape + memory + past meetings -> verdict
    let triage: TriageResult | null = null;
    const siteText = await scrapeSite(prospect.website);
    if (!siteText && prospect.website) warnings.push("couldn't read their site");
    try {
      const { data: pastMeetings } = await db
        .from("meetings")
        .select("meeting_type, status, raw_notes, extracted, created_at")
        .eq("prospect_id", prospect.id)
        .neq("id", meeting.id)
        .order("created_at", { ascending: true });

      const context = {
        company_name: prospect.company_name,
        website: prospect.website,
        contact_name: prospect.contact_name,
        contact_role: prospect.contact_role,
        upcoming_meeting_type: meeting_type,
        what_we_remember: prospect.memory ?? {},
        past_meetings: (pastMeetings ?? []).map((m) => ({
          type: m.meeting_type,
          status: m.status,
          extracted: m.extracted,
        })),
        website_content: siteText ? siteText.slice(0, 4000) : "(site could not be read)",
      };

      triage = await askLLMJson<TriageResult>(TRIAGE_SYSTEM, JSON.stringify(context));
      if (!["go", "caution", "do_not_take"].includes(triage?.verdict)) triage = null;
    } catch (err) {
      if (err instanceof LLMUnavailableError) {
        warnings.push("AI briefly rate-limited — triage skipped");
      } else {
        warnings.push("triage failed");
      }
    }

    let finalMeeting = meeting;
    let websiteInferred = false;
    if (triage) {
      const { data: updatedMeeting } = await db
        .from("meetings")
        .update({ triage_verdict: triage.verdict, triage_reason: triage.reason })
        .eq("id", meeting.id)
        .select()
        .single();
      if (updatedMeeting) finalMeeting = updatedMeeting;

      // Unresolved fit questions live in memory so the discovery brief can
      // put them at the top of questions_to_ask.
      if (Array.isArray(triage.fit_unknowns) && triage.fit_unknowns.length > 0) {
        const memoryWithUnknowns = {
          ...(prospect.memory ?? {}),
          fit_unknowns: triage.fit_unknowns.filter((u) => typeof u === "string" && u.trim()).slice(0, 3),
        };
        const { data: pU } = await db
          .from("prospects")
          .update({ memory: memoryWithUnknowns })
          .eq("id", prospect.id)
          .select()
          .single();
        if (pU) prospect = pU;
      }

      // No website given: save the LLM-inferred domain (marked as inferred) and
      // warm the scrape best-effort so the brief call has a readable site.
      if (!prospect.website && triage.inferred_domain) {
        const domain = String(triage.inferred_domain)
          .replace(/^https?:\/\//i, "")
          .replace(/^www\./i, "")
          .split("/")[0]
          .trim()
          .toLowerCase();
        if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(domain)) {
          websiteInferred = true;
          const memory = { ...(prospect.memory ?? {}), website_inferred: true };
          const { data: p2 } = await db
            .from("prospects")
            .update({ website: domain, memory })
            .eq("id", prospect.id)
            .select()
            .single();
          if (p2) prospect = p2;
          await scrapeSite(domain);
        }
      }
    }

    return NextResponse.json({
      prospect,
      meeting: finalMeeting,
      warnings,
      website_inferred: websiteInferred,
      // Company-level shared brain: another rep's account still gets this
      // meeting attached, but ownership never silently transfers.
      account_owner: prospect.owner_rep ?? null,
    });
  } catch (err) {
    return NextResponse.json({ error: `Unexpected error: ${(err as Error).message}` }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const db = supabaseAdmin();
    const currentRep = resolveRep(req.cookies.get(REP_COOKIE)?.value);
    const { data: prospects, error } = await db
      .from("prospects")
      .select("*, meetings(*)")
      .eq("owner_rep", currentRep)
      .order("updated_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const p of prospects ?? []) {
      (p.meetings ?? []).sort(
        (a: { created_at: string }, b: { created_at: string }) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }
    return NextResponse.json({ prospects: prospects ?? [] });
  } catch (err) {
    return NextResponse.json({ error: `Unexpected error: ${(err as Error).message}` }, { status: 500 });
  }
}
