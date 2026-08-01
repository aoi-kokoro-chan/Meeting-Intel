import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { askLLMJson, LLMUnavailableError } from "@/lib/groq";
import { scrapeSite } from "@/lib/scrape";
import { REP_COOKIE, resolveRep } from "@/lib/reps";

export const maxDuration = 60;

const TRIAGE_SYSTEM = `You are a meeting-triage assistant for Gushwork, an AI-powered SEO/AEO agency selling services to B2B SMBs: manufacturers, industrial brands, logistics and engineering firms.

Decide whether a sales rep should take an upcoming meeting.

"do_not_take" is reserved for the ONLY three cases this system can establish:
1. The company IS Gushwork itself (someone booking us as a prospect).
2. A direct competitor: the SCRAPED WEBSITE CONTENT shows they sell SEO, content-marketing, or AI-marketing SERVICES to clients (competitor recon risk). Companies selling software, hosting, analytics, or other marketing-adjacent PRODUCTS are NOT competitors of an SEO services agency.
3. The domain is not a real business: a parked/for-sale page, a placeholder whose content just says the domain is reserved or for documentation examples, or an empty shell with no actual products or services.
Nothing else hard-blocks. NEVER return "do_not_take" because a company is B2C, seems small or large, or based on any guess about budget.

The competitor test is narrow: does the scraped page show them selling SEO or content-marketing SERVICES TO CLIENTS as their business? A company selling its own products or services in any other line of business — software products, developer tools, hosting, healthcare, food delivery, logistics, marketplaces — is a PROSPECT, not a competitor, no matter how many AI or marketing words appear on its site. Evidence that a company sells something other than SEO services is evidence FOR taking the meeting.

When verdict is "do_not_take" you must also set "block_category" to exactly one of: "own_company", "seo_services_competitor", "not_a_real_business". If none of those three genuinely applies, the verdict cannot be "do_not_take" — use "go" or "caution". For other verdicts, block_category is null.

BUDGET: you have no information about any company's budget. Never speculate about what a company can or cannot afford, in any field of your output.

ICP FIT: B2C or otherwise off-ICP companies get at most a soft "caution" with your reasoning stated plainly in the reason — never a block. Off-ICP deals are the rep's call to make.

EVIDENCE: a "do_not_take" reason must cite specific evidence from the scraped website content (e.g. "homepage sells SEO audits and monthly content packages"). If the website content shows "(site could not be read)" or is empty, you CANNOT establish competitor status or placeholder status — the strongest verdict allowed is "caution", with the reason noting "couldn't verify — site unreadable".

Other rules:
- Flag the wrong stakeholder for a closing call (e.g. a junior contact with no buying authority) as "caution".
- Prefer "caution" over "do_not_take" whenever uncertain.
- Use your own knowledge of a well-known company for background (industry, what they do) — but never for competitor claims, which need scraped evidence.

ABSENCE OF A WEBSITE (or a weak web presence) IS AN AMBIGUOUS SIGNAL — never a verdict driver by itself. It can mean "invisible online and losing deals" (a STRONG fit for Gushwork) or "demand isn't their problem" (poor fit). Poor-fit archetypes behind a weak web presence: relationship- or subcontract-locked shops, businesses at full capacity with long backlogs, marketplace-native sellers (Thomasnet, Grainger, IndiaMART), tender-driven contractors, sub-scale operators where ~$800/mo doesn't pencil, and wind-down businesses. When the signals are ambiguous, keep the verdict at "go" or "caution" and put the unresolved questions into fit_unknowns (0-3 short items), e.g. "Unknown: where does their demand come from today?", "Unknown: do they have capacity appetite for more orders?", "Unknown: can they sustain ~$800/mo with a month-4 payback?". Leave fit_unknowns empty when fit is clear.

If no website was provided, infer the most likely official domain from the company name (e.g. "American Express" -> "americanexpress.com").
Return JSON: {"verdict": "go" | "caution" | "do_not_take", "block_category": "own_company" | "seo_services_competitor" | "not_a_real_business" | null, "reason": "<one sentence>", "fit_unknowns": ["<short unresolved fit question>", ...], "inferred_domain": "<official domain like example.com, only when no website was provided, else null>"}`;

type TriageResult = {
  verdict: string;
  block_category?: string | null;
  reason: string;
  fit_unknowns?: string[];
  inferred_domain?: string | null;
};

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
      // Policy floor enforced in code, not just prompt: a hard block must name
      // one of the three legitimate categories AND the category's evidence
      // class must actually be present in the scraped content. This validates
      // the model's claim against the evidence, not against specific inputs.
      if (triage?.verdict === "do_not_take") {
        const cat = triage.block_category ?? "";
        const evidenceOk =
          (cat === "own_company" &&
            (/gushwork/i.test(prospect.company_name) || /gushwork/i.test(siteText))) ||
          (cat === "seo_services_competitor" &&
            /\bseo\b|\baeo\b|search engine optimi|answer engine optimi|content[- ]marketing|link[- ]building|digital[- ]marketing (agency|services)/i.test(
              siteText
            )) ||
          // Parked/placeholder pages read successfully but carry almost no
          // content; a real business's homepage never scrapes this small.
          (cat === "not_a_real_business" && siteText.length > 0 && siteText.length < 1500);
        if (!evidenceOk) {
          triage.verdict = "caution";
          triage.reason = siteText
            ? `Not a verifiable hard-block — take with judgment. ${triage.reason ?? ""}`.trim()
            : `Couldn't verify — site unreadable. ${triage.reason ?? ""}`.trim();
        }
      }
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
