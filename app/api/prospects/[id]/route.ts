import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const maxDuration = 60;

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
