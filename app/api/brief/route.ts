import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { askLLMJson, LLMUnavailableError } from "@/lib/groq";
import { scrapeSite } from "@/lib/scrape";
import { hasSeniorStakeholder, type Memory } from "@/lib/memory";
import { REP_COOKIE, resolveRep } from "@/lib/reps";

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

Be specific and concrete. For meeting history, stakeholders, and quotes, use ONLY facts from the provided context — never invent them. For general company background, also use your own knowledge of this company if it is well-known (industry, size, what they do), even if the website scrape returned nothing — a famous brand must never be described as unknown; only say information is unavailable if the company is genuinely obscure AND the scrape failed. If this is meeting 2 or later, you MUST reference concrete facts from earlier meetings (names, objections, commitments, exact pains).

ATTRIBUTE prior knowledge: every item in what_we_know and every claim in last_meeting_recap must say which rep learned it and when, using each past meeting's rep and date from the context, e.g. "From Sales Rep B's discovery call (Jul 12): no budget owner identified yet".

HONESTY RULES:
- If past_meetings is empty, this is the FIRST meeting: nothing may be attributed to any call (there were none), and last_meeting_recap must be "". what_we_know then draws only from the website content.
- If the website could not be read AND there is no meeting history or stored memory, what_we_know must be an EMPTY array. Do not pad it.
- Never present a system or tooling failure (site unreadable, scrape failed, page unavailable) as a fact about the company anywhere in the brief — that is our problem, not intelligence about them.
- Never restate the rep's own form inputs (the contact name/role, company name, or website they just typed) as intelligence in what_we_know. Omit them, or prefix explicitly with "Rep-provided:".

OPEN LOOPS: the context lists all prior commitments and objections with their meeting dates, plus a "resolutions" list of items already delivered/addressed. Every commitment NOT in resolutions and every objection NOT in resolutions must appear in open_loops with its age, e.g. "ROI sheet promised 6 days ago — unresolved". Empty array if nothing is open.

MIRROR THEIR LANGUAGE: verbatim_phrases in the context are the prospect's own words. Use these exact terms in talk_track and questions_to_ask wherever they fit naturally.

RESOLVE FIT FIRST: fit_unknowns in the context are unresolved questions about whether this prospect is even a fit. On a DISCOVERY call they OUTRANK generic discovery questions: turn each one into a natural, conversational question and put them FIRST in questions_to_ask, each prefixed with "Resolve fit first: " — e.g. "Unknown: where does their demand come from today?" becomes "Resolve fit first: How do new customers typically find you today?"; capacity appetite becomes "Resolve fit first: If 10 qualified enquiries landed next month, could you take them on?"; economics becomes "Resolve fit first: Roughly what does a new customer end up being worth to you?". Generic questions come after. If fit_unknowns is empty, no prefixed questions.

Return JSON with exactly these keys:
{
  "headline": "<one punchy sentence framing this meeting>",
  "company_snapshot": "<2-3 sentences on who they are, from site + context>",
  "what_we_know": ["<attributed bullet>", ...],
  "last_meeting_recap": "<2-3 sentences with rep + date attribution, or empty string if first meeting>",
  "open_loops": ["<unresolved commitment or unaddressed objection with age>", ...],
  "open_threads": ["<other unresolved item>", ...],
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
  open_loops?: string[];
  open_threads: string[];
  likely_objections: string[];
  talk_track: string[];
  questions_to_ask: string[];
  watch_out: string;
  intel_from?: string[];
  readiness_gaps?: string[];
  verbatim_phrases?: string[];
  cold_start?: boolean;
  ai_unavailable?: boolean;
  generated_at?: string;
};

// Generic system-failure phrasing must never appear as intelligence.
const SYSTEM_FAILURE_RE =
  /unavailab|unreadab|couldn'?t (read|load|fetch|access)|could not (be )?(read|load|fetch|access)|website (is )?(down|inaccessible)|scrape|403|404|forbidden|returned an? error/i;

function stripFailureSentences(text: string | undefined): string {
  if (!text?.trim()) return "";
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((s) => !SYSTEM_FAILURE_RE.test(s))
    .join(" ")
    .trim();
}

function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

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
      .select("meeting_type, rep_name, status, scheduled_at, raw_notes, extracted, created_at")
      .eq("prospect_id", prospect.id)
      .neq("id", meeting.id)
      .order("created_at", { ascending: true });

    const siteText = await scrapeSite(prospect.website);
    if (!siteText && prospect.website) warnings.push("couldn't read their site");

    const meetingNumber = (pastMeetings?.length ?? 0) + 1;
    const guidance = TYPE_GUIDANCE[meeting.meeting_type] ?? TYPE_GUIDANCE.discovery;
    const memory: Partial<Memory> = prospect.memory ?? {};

    // Open-loops context: commitments/objections with the date they surfaced.
    type LoopItem = { text: string; from_meeting: string };
    const loopCommitments: LoopItem[] = [];
    const loopObjections: LoopItem[] = [];
    for (const m of pastMeetings ?? []) {
      const date = fmtDay(m.scheduled_at ?? m.created_at);
      const ex = m.extracted as { commitments?: { who: string; what: string }[]; objections?: string[] } | null;
      for (const c of ex?.commitments ?? []) loopCommitments.push({ text: `${c.who}: ${c.what}`, from_meeting: date });
      for (const o of ex?.objections ?? []) loopObjections.push({ text: o, from_meeting: date });
    }
    // Memory items not captured per-meeting still roll forward (no date known).
    for (const c of memory.commitments ?? []) {
      const t = `${c.who}: ${c.what}`;
      if (!loopCommitments.some((l) => l.text.toLowerCase() === t.toLowerCase()))
        loopCommitments.push({ text: t, from_meeting: "earlier" });
    }
    for (const o of memory.objections ?? []) {
      if (!loopObjections.some((l) => l.text.toLowerCase() === o.toLowerCase()))
        loopObjections.push({ text: o, from_meeting: "earlier" });
    }

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
      persistent_memory: memory,
      today: fmtDay(new Date().toISOString()),
      all_commitments: loopCommitments,
      all_objections: loopObjections,
      resolutions: memory.resolutions ?? [],
      verbatim_phrases: memory.verbatim_phrases ?? [],
      fit_unknowns: memory.fit_unknowns ?? [],
      known_fit: memory.fit ?? {},
      past_meetings: (pastMeetings ?? []).map((m, i) => ({
        n: i + 1,
        type: m.meeting_type,
        rep: m.rep_name ?? "Unknown rep",
        date: fmtDay(m.scheduled_at ?? m.created_at),
        status: m.status,
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

    // Honesty enforcement in code: no tooling failures as facts, no padded
    // cold-start briefs.
    brief.what_we_know = (brief.what_we_know ?? []).filter((i) => !SYSTEM_FAILURE_RE.test(i));
    brief.company_snapshot = stripFailureSentences(brief.company_snapshot);
    // Meeting 1 has no history: drop any item the model attributed to a call.
    if ((pastMeetings?.length ?? 0) === 0) {
      brief.what_we_know = brief.what_we_know.filter(
        (i) => !/from .{0,40}(call|meeting)|\b(discovery|demo|closing) call\b/i.test(i)
      );
      brief.last_meeting_recap = "";
    }
    const hasHistory =
      (pastMeetings?.length ?? 0) > 0 ||
      (memory.pains?.length ?? 0) > 0 ||
      (memory.stakeholders?.length ?? 0) > 0 ||
      (memory.facts?.length ?? 0) > 0;
    if (!siteText && !hasHistory) {
      // company_snapshot may keep genuine background knowledge of a well-known
      // brand; what_we_know carries only earned intelligence, so it goes empty.
      brief.what_we_know = [];
      brief.cold_start = true;
    }

    // Cross-rep intel chip: which other reps' calls fed this brief.
    const currentRep = resolveRep(req.cookies.get(REP_COOKIE)?.value);
    const otherReps = [
      ...new Set(
        (pastMeetings ?? [])
          .map((m) => m.rep_name)
          .filter((r): r is string => Boolean(r?.trim()) && r !== currentRep)
      ),
    ];
    if (otherReps.length > 0) brief.intel_from = otherReps;

    // Single-threading alarm — code-derived, not LLM.
    const doneMeetings = (pastMeetings ?? []).filter((m) => m.status === "done");
    const stakeholders = memory.stakeholders ?? [];
    if (doneMeetings.length >= 2 && stakeholders.length < 2) {
      const only = stakeholders[0]
        ? `${stakeholders[0].name}${stakeholders[0].role ? ` (${stakeholders[0].role})` : ""}`
        : prospect.contact_name ?? "one contact";
      const alarm = `Single-threaded: you've only spoken to ${only}. No budget owner or second stakeholder in this deal.`;
      brief.watch_out = brief.watch_out?.trim() ? `${brief.watch_out.trim()} ${alarm}` : alarm;
    }

    // Closing-readiness audit — code first, never blocking.
    if (meeting.meeting_type === "closing") {
      const gaps: string[] = [];
      if (!hasSeniorStakeholder(memory)) gaps.push("No budget owner or decision-maker among known stakeholders");
      if (!/decision|sign[- ]?off|approv|procurement|purchase order/i.test(JSON.stringify(memory)))
        gaps.push("No decision-process note captured");
      const resolutions = (memory.resolutions ?? []).map((r) => r.toLowerCase());
      const unresolved = (memory.objections ?? []).filter((o) => !resolutions.includes(o.toLowerCase()));
      if (unresolved.length > 0)
        gaps.push(`${unresolved.length} objection${unresolved.length === 1 ? "" : "s"} never addressed: ${unresolved[0]}${unresolved.length > 1 ? " …" : ""}`);
      if (gaps.length > 0) brief.readiness_gaps = gaps;
    }

    // Mirror-their-language chips for the What-we-know card.
    if ((memory.verbatim_phrases ?? []).length > 0) brief.verbatim_phrases = memory.verbatim_phrases;

    await db.from("meetings").update({ brief }).eq("id", meeting_id);

    return NextResponse.json({ brief, meeting_number: meetingNumber, warnings });
  } catch (err) {
    return NextResponse.json({ error: `Unexpected error: ${(err as Error).message}` }, { status: 500 });
  }
}
