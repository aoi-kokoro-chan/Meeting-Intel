import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { askLLMJson, LLMUnavailableError } from "@/lib/groq";
import { scrapeSite } from "@/lib/scrape";

export const maxDuration = 60;

const TRIAGE_SYSTEM = `You are a meeting-triage assistant for Gushwork, an AI-powered SEO/AEO agency selling services (~$800-2000/mo) to B2B SMBs: manufacturers, industrial brands, logistics and engineering firms.

Decide whether a sales rep should take an upcoming meeting. Rules:
- Flag companies that THEMSELVES sell SEO, content marketing, or AI-marketing tooling/services — that is competitor recon against Gushwork, verdict "do_not_take".
- Flag clearly unqualified prospects: no plausible budget for ~$800+/mo services, students, B2C hobbyists, wrong buyer persona.
- Flag the wrong stakeholder for a closing call (e.g. a junior contact with no buying authority).
- Prefer "caution" over "do_not_take" when uncertain.
Return JSON: {"verdict": "go" | "caution" | "do_not_take", "reason": "<one sentence>"}`;

type TriageResult = { verdict: string; reason: string };

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { company_name, website, contact_name, contact_role, meeting_type, scheduled_at } = body ?? {};
    if (!company_name?.trim() || !meeting_type?.trim()) {
      return NextResponse.json({ error: "company_name and meeting_type are required" }, { status: 400 });
    }

    const db = supabaseAdmin();
    const warnings: string[] = [];

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
    if (triage) {
      const { data: updatedMeeting } = await db
        .from("meetings")
        .update({ triage_verdict: triage.verdict, triage_reason: triage.reason })
        .eq("id", meeting.id)
        .select()
        .single();
      if (updatedMeeting) finalMeeting = updatedMeeting;
    }

    return NextResponse.json({ prospect, meeting: finalMeeting, warnings });
  } catch (err) {
    return NextResponse.json({ error: `Unexpected error: ${(err as Error).message}` }, { status: 500 });
  }
}

export async function GET() {
  try {
    const db = supabaseAdmin();
    const { data: prospects, error } = await db
      .from("prospects")
      .select("*, meetings(*)")
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
