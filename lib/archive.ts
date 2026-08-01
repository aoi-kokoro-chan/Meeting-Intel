import type { SupabaseClient } from "@supabase/supabase-js";

// Opportunistic sweep: pre-triage rows that were never actioned (no completed
// call, no brief, no notes on any meeting) auto-archive after 24h so
// un-actioned triage checks don't pile up as permanent pipeline rows.
export async function sweepProvisional(db: SupabaseClient): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data } = await db
      .from("prospects")
      .select("id, created_at, meetings(status, brief, raw_notes)")
      .is("archived_at", null)
      .lt("created_at", cutoff);
    const stale = (data ?? []).filter(
      (p) =>
        !(p.meetings ?? []).some(
          (m: { status: string; brief: unknown; raw_notes: string | null }) =>
            m.status === "done" || m.brief != null || (m.raw_notes ?? "").trim() !== ""
        )
    );
    if (stale.length > 0) {
      await db
        .from("prospects")
        .update({ archived_at: new Date().toISOString() })
        .in("id", stale.map((p) => p.id));
    }
  } catch {
    // sweep is best-effort — never block a page load on it
  }
}
