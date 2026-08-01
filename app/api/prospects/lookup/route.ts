import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const maxDuration = 60;

function normalizeDomain(raw: string): string {
  return raw
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0]
    .trim()
    .toLowerCase();
}

// Exact case-insensitive name/domain match only — no fuzzy matching by design.
export async function GET(req: NextRequest) {
  try {
    const name = req.nextUrl.searchParams.get("name")?.trim() ?? "";
    const website = req.nextUrl.searchParams.get("website")?.trim() ?? "";
    if (name.length < 3 && !website) return NextResponse.json({ match: null });

    const db = supabaseAdmin();
    let prospect = null;

    if (name.length >= 3) {
      const { data } = await db.from("prospects").select("*").ilike("company_name", name).is("archived_at", null).maybeSingle();
      prospect = data;
    }
    if (!prospect && website) {
      const domain = normalizeDomain(website);
      if (domain) {
        const { data } = await db.from("prospects").select("*").ilike("website", domain).is("archived_at", null).maybeSingle();
        prospect = data;
      }
    }
    if (!prospect) return NextResponse.json({ match: null });

    const { data: meetings } = await db
      .from("meetings")
      .select("meeting_type, rep_name, status, scheduled_at, created_at")
      .eq("prospect_id", prospect.id)
      .order("created_at", { ascending: false });

    const last = (meetings ?? []).find((m) => m.status === "done") ?? (meetings ?? [])[0] ?? null;
    const lastDate = last ? new Date(last.scheduled_at ?? last.created_at) : null;
    const daysAgo = lastDate ? Math.max(0, Math.floor((Date.now() - lastDate.getTime()) / 86400000)) : null;

    return NextResponse.json({
      match: {
        company_name: prospect.company_name,
        owner_rep: prospect.owner_rep,
        stage: prospect.stage,
        next_step: prospect.memory?.next_step ?? null,
        last_meeting: last ? { type: last.meeting_type, rep: last.rep_name, days_ago: daysAgo } : null,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: `Unexpected error: ${(err as Error).message}` }, { status: 500 });
  }
}
