import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const maxDuration = 60;

const STAGES = ["discovery", "demo", "closing", "closed_won", "closed_lost", "disqualified"];

// PATCH handles rep-confirmed stage moves, manager ownership transfers, and
// soft-archiving ({archived: true} — same archived_at semantics as before).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const db = supabaseAdmin();

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body?.stage !== undefined) {
      if (!STAGES.includes(body.stage)) {
        return NextResponse.json({ error: `stage must be one of: ${STAGES.join(", ")}` }, { status: 400 });
      }
      updates.stage = body.stage;
    }

    if (body?.archived === true) {
      // Soft archive: the row stays queryable for triage patterns but leaves
      // counts and default views.
      updates.archived_at = new Date().toISOString();
    } else if (body?.archived === false) {
      // Restore from the archived view.
      updates.archived_at = null;
    }

    if (body?.owner_rep !== undefined) {
      const newOwner = String(body.owner_rep ?? "").trim();
      if (!newOwner) return NextResponse.json({ error: "owner_rep must be a non-empty name" }, { status: 400 });
      const { data: current } = await db.from("prospects").select("owner_rep, memory").eq("id", id).single();
      if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (current.owner_rep !== newOwner) {
        updates.owner_rep = newOwner;
        // History stays honest: meetings keep their original rep_name; the
        // transfer itself is recorded in memory for the timeline and briefs.
        updates.memory = {
          ...(current.memory ?? {}),
          ownership_log: [
            ...((current.memory?.ownership_log as unknown[]) ?? []),
            { from: current.owner_rep ?? null, to: newOwner, at: new Date().toISOString() },
          ],
        };
      }
    }

    if (Object.keys(updates).length === 1) {
      return NextResponse.json({ error: "Nothing to update — pass stage, owner_rep, or archived" }, { status: 400 });
    }

    const { data, error } = await db.from("prospects").update(updates).eq("id", id).select().single();
    if (error || !data) return NextResponse.json({ error: error?.message ?? "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, prospect: data });
  } catch (err) {
    return NextResponse.json({ error: `Unexpected error: ${(err as Error).message}` }, { status: 500 });
  }
}

// Hard delete — only while no real call activity exists. Generated briefs and
// triage verdicts are artifacts of OUR system, not activity; saved notes or a
// completed meeting lock the record (archive remains the only removal path).
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = supabaseAdmin();

    const { data: meetings, error: mErr } = await db
      .from("meetings")
      .select("status, raw_notes")
      .eq("prospect_id", id);
    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });

    const hasActivity = (meetings ?? []).some(
      (m) => m.status === "done" || (m.raw_notes ?? "").trim() !== ""
    );
    if (hasActivity) {
      return NextResponse.json({ error: "Has call activity — archive instead" }, { status: 409 });
    }

    // FK cascade removes the not-yet-held meeting rows.
    const { data, error } = await db.from("prospects").delete().eq("id", id).select("id, company_name").single();
    if (error || !data) return NextResponse.json({ error: error?.message ?? "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, deleted: data });
  } catch (err) {
    return NextResponse.json({ error: `Unexpected error: ${(err as Error).message}` }, { status: 500 });
  }
}
