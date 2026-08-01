import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const maxDuration = 60;

const STAGES = ["discovery", "demo", "closing", "closed_won", "closed_lost", "disqualified"];

// Stage changes are rep-confirmed, never auto-written by extraction.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const stage = body?.stage;
    if (!STAGES.includes(stage)) {
      return NextResponse.json({ error: `stage must be one of: ${STAGES.join(", ")}` }, { status: 400 });
    }
    const db = supabaseAdmin();
    const { data, error } = await db
      .from("prospects")
      .update({ stage, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error || !data) return NextResponse.json({ error: error?.message ?? "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, prospect: data });
  } catch (err) {
    return NextResponse.json({ error: `Unexpected error: ${(err as Error).message}` }, { status: 500 });
  }
}

// Soft archive: the row stays queryable for triage patterns but leaves counts
// and default views.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = supabaseAdmin();
    const { data, error } = await db
      .from("prospects")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id)
      .select("id, company_name, archived_at")
      .single();
    if (error || !data) return NextResponse.json({ error: error?.message ?? "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, prospect: data });
  } catch (err) {
    return NextResponse.json({ error: `Unexpected error: ${(err as Error).message}` }, { status: 500 });
  }
}
