import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { askLLMJson, LLMUnavailableError } from "@/lib/groq";
import { scrapeSite } from "@/lib/scrape";
import type { Memory } from "@/lib/memory";

export const maxDuration = 60;

const TYPE_GUIDANCE: Record<string, string> = {
  discovery:
    "This is a DISCOVERY call: focus on qualification — their current lead sources, who owns the marketing budget, what they've already tried for SEO/inbound, whether they can plausibly afford ~$800-2000/mo.",
  demo:
    "This is a DEMO call: map Gushwork's capabilities (AI-powered SEO/AEO, technical content at scale, ranking for buyer-intent industrial keywords) directly to the pains they have STATED in earlier meetings. Every capability mentioned should tie to a known pain.",
  closing:
    "This is a CLOSING call: focus on blockers, pricing conversation, decision process, who signs, outstanding commitments the rep owes, and concrete next steps to signature.",
};

const BRIEF_SYSTEM = `You write pre-call briefs for sales reps at Gushwork, an AI-powered SEO/AEO agency (~$800-2000/mo) selling to B2B SMBs: manufacturers, industrial brands, logistics and engineering firms.

Be specific and concrete. Use ONLY facts from the provided context — never invent stakeholders, quotes, or history. If this is meeting 2 or later, you MUST reference concrete facts from earlier meetings (names, objections, commitments, exact pains).

Return JSON with exactly these keys:
{
  "headline": "<one punchy sentence framing this meeting>",
  "company_snapshot": "<2-3 sentences on who they are, from site + context>",
  "what_we_know": ["<bullet>", ...],
  "last_meeting_recap": "<2-3 sentences, or empty string if first meeting>",
  "open_threads": ["<unresolved item or owed commitment>", ...],
  "likely_objections": ["<objection + suggested handling>", ...],
  "talk_track": ["<bullet 1>", "<bullet 2>", "<bullet 3>"],
  "questions_to_ask": ["<specific question 1>", "<q2>", "<q3>"],
  "watch_out": "<one sentence on the biggest risk in this meeting>"
}`;

export type Brief = {
  headline: string;
  company_snapshot: string;
  what_we_know: string[];
  last_meeting_recap: string;
  open_threads: string[];
  likely_objections: string[];
  talk_track: string[];
  questions_to_ask: string[];
  watch_out: string;
  ai_unavailable?: boolean;
  generated_at?: string;
};

function memoryOnlyBrief(companyName: string, memory: Partial<Memory> | null): Brief {
  const stakeholders = (memory?.stakeholders ?? []).map((s) => `${s.name}${s.role ? ` (${s.role})` : ""}`);
  return {
    headline: `AI briefly rate-limited — showing what we know about ${companyName}`,
    company_snapshot: "",
    what_we_know: [
      ...(memory?.pains ?? []).map((p: string) => `Pain: ${p}`),
      ...stakeholders.map((s) => `Stakeholder: ${s}`),
      ...(memory?.facts ?? []),
    ],
    last_meeting_recap: "",
    open_threads: (memory?.commitments ?? []).map((c) => `${c.who}: ${c.what}${c.when ? ` (${c.when})` : ""}`),
    likely_objections: memory?.objections ?? [],
    talk_track: [],
    questions_to_ask: [],
    watch_out: memory?.next_step ? `Agreed next step: ${memory.next_step}` : "",
    ai_unavailable: true,
    generated_at: new Date().toISOString(),
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { meeting_id } = body ?? {};
    if (!meeting_id) {
      return NextResponse.json({ error: "meeting_id is required" }, { status: 400 });
    }

    const db = supabaseAdmin();
    const warnings: string[] = [];

    const { data: meeting, error: mErr } = await db.from("meetings").select("*").eq("id", meeting_id).single();
    if (mErr || !meeting) return NextResponse.json({ error: "Meeting not found" }, { status: 404 });

    const { data: prospect, error: pErr } = await db
      .from("prospects")
      .select("*")
      .eq("id", meeting.prospect_id)
      .single();
    if (pErr || !prospect) return NextResponse.json({ error: "Prospect not found" }, { status: 404 });

    const { data: pastMeetings } = await db
      .from("meetings")
      .select("meeting_type, status, scheduled_at, raw_notes, extracted, created_at")
      .eq("prospect_id", prospect.id)
      .neq("id", meeting.id)
      .order("created_at", { ascending: true });

    const siteText = await scrapeSite(prospect.website);
    if (!siteText && prospect.website) warnings.push("couldn't read their site");

    const meetingNumber = (pastMeetings?.length ?? 0) + 1;
    const guidance = TYPE_GUIDANCE[meeting.meeting_type] ?? TYPE_GUIDANCE.discovery;

    const context = {
      meeting_number: meetingNumber,
      meeting_type: meeting.meeting_type,
      company: {
        name: prospect.company_name,
        website: prospect.website,
        contact: prospect.contact_name,
        contact_role: prospect.contact_role,
        stage: prospect.stage,
        deal_health: prospect.deal_health,
      },
      persistent_memory: prospect.memory ?? {},
      past_meetings: (pastMeetings ?? []).map((m, i) => ({
        n: i + 1,
        type: m.meeting_type,
        status: m.status,
        when: m.scheduled_at,
        notes: m.raw_notes,
        extracted: m.extracted,
      })),
      website_content: siteText || "(couldn't read their site)",
    };

    let brief: Brief;
    try {
      brief = await askLLMJson<Brief>(`${BRIEF_SYSTEM}\n\n${guidance}`, JSON.stringify(context));
      brief.generated_at = new Date().toISOString();
    } catch (err) {
      if (err instanceof LLMUnavailableError) {
        brief = memoryOnlyBrief(prospect.company_name, prospect.memory);
        warnings.push("AI briefly rate-limited — showing what we know");
      } else {
        throw err;
      }
    }

    await db.from("meetings").update({ brief }).eq("id", meeting_id);

    return NextResponse.json({ brief, meeting_number: meetingNumber, warnings });
  } catch (err) {
    return NextResponse.json({ error: `Unexpected error: ${(err as Error).message}` }, { status: 500 });
  }
}
