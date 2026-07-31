import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { askLLMJson, LLMUnavailableError } from "@/lib/groq";
import { mergeMemory, advanceStage, healthFromSignal, type Extracted } from "@/lib/memory";

export const maxDuration = 60;

const EXTRACT_SYSTEM = `You process a sales rep's raw post-call notes for Gushwork, an AI-powered SEO/AEO agency selling to B2B SMBs. Notes may be messy shorthand — expand abbreviations sensibly, but never invent facts that aren't implied.

Return JSON with exactly these keys:
{
  "summary": "<2 sentences max, plain language>",
  "pains": ["<SEO/lead-gen pain mentioned>", ...],
  "stakeholders": [{"name": "...", "role": "...", "notes": "..."}, ...],
  "objections": ["<objection raised>", ...],
  "commitments": [{"who": "<rep or prospect person>", "what": "...", "when": "..."}, ...],
  "resolved_commitments": ["<EXACT text of a prior commitment (from prior_commitments in context) these notes confirm was delivered>", ...],
  "addressed_objections": ["<EXACT text of a prior objection (from prior_objections in context) these notes show was addressed/answered>", ...],
  "verbatim_phrases": ["<short quote in the prospect's own words for their problems or processes>", ...],
  "next_step": "<the agreed next step, or null if none was agreed>",
  "sentiment": "<one word: positive/neutral/negative/mixed>",
  "deal_signal": "advancing" | "stalling" | "at_risk",
  "stage_suggestion": "discovery" | "demo" | "closing" | "closed_won" | "closed_lost" | null
}

deal_signal: "advancing" if there's momentum (next meeting booked, buying signals), "stalling" if vague/postponed ("after Diwali", no owner), "at_risk" if serious blockers or competitor threat.
stage_suggestion: only suggest a LATER stage than the current one if the notes clearly indicate it (e.g. demo scheduled -> "demo", contract/pricing sign-off discussion -> "closing"); otherwise null.
resolved_commitments / addressed_objections: copy the prior item's text EXACTLY as given in context so it can be matched; empty arrays if nothing was resolved.
verbatim_phrases: 3-6 short quotes max, only genuinely distinctive phrasing in the prospect's own words (e.g. "leadership will review after Diwali"); empty array if the notes contain none.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { meeting_id, raw_notes } = body ?? {};
    if (!meeting_id || !raw_notes?.trim()) {
      return NextResponse.json({ error: "meeting_id and raw_notes are required" }, { status: 400 });
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

    // Save notes + mark done FIRST so nothing is lost if the LLM fails.
    await db.from("meetings").update({ raw_notes, status: "done" }).eq("id", meeting_id);

    let extracted: Extracted | null = null;
    try {
      const mem = prospect.memory ?? {};
      const context = {
        company: prospect.company_name,
        current_stage: prospect.stage,
        known_memory: mem,
        prior_commitments: (mem.commitments ?? []).map((c: { who: string; what: string }) => `${c.who}: ${c.what}`),
        prior_objections: mem.objections ?? [],
        meeting_type: meeting.meeting_type,
        raw_notes,
      };
      extracted = await askLLMJson<Extracted>(EXTRACT_SYSTEM, JSON.stringify(context));
    } catch (err) {
      if (err instanceof LLMUnavailableError) {
        warnings.push("AI briefly rate-limited — showing what we know");
      } else {
        warnings.push("extraction failed");
      }
    }

    if (!extracted) {
      // Memory-only degradation: notes are saved, memory untouched.
      return NextResponse.json({
        extracted: null,
        memory: prospect.memory ?? {},
        ai_unavailable: true,
        warnings,
      });
    }

    const memory = mergeMemory(prospect.memory, extracted);
    const stage = advanceStage(prospect.stage, extracted.stage_suggestion);
    const health = healthFromSignal(extracted.deal_signal) ?? prospect.deal_health;

    await db.from("meetings").update({ extracted }).eq("id", meeting_id);
    const { data: updatedProspect } = await db
      .from("prospects")
      .update({ memory, stage, deal_health: health, updated_at: new Date().toISOString() })
      .eq("id", prospect.id)
      .select()
      .single();

    return NextResponse.json({
      extracted,
      memory,
      prospect: updatedProspect ?? prospect,
      warnings,
    });
  } catch (err) {
    return NextResponse.json({ error: `Unexpected error: ${(err as Error).message}` }, { status: 500 });
  }
}
