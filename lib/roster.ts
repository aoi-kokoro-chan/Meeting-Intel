import type { SupabaseClient } from "@supabase/supabase-js";

// THE single source of truth for the rep roster: reps registry table ∪
// distinct owner_rep ∪ distinct rep_name (the union keeps legacy names alive).
// Every surface (persona screen, header switcher, manager owner filter,
// reassign dropdown) goes through this so they can never disagree.
export async function fetchRoster(db: SupabaseClient): Promise<string[]> {
  const [repsRes, prospectsRes, meetingsRes] = await Promise.all([
    db.from("reps").select("name"),
    db.from("prospects").select("owner_rep"),
    db.from("meetings").select("rep_name"),
  ]);
  // Case-insensitive dedupe; registry spelling wins as canonical.
  const byLower = new Map<string, string>();
  const add = (n?: string | null) => {
    const t = n?.trim();
    if (!t) return;
    const k = t.toLowerCase();
    if (!byLower.has(k)) byLower.set(k, t);
  };
  for (const r of repsRes.data ?? []) add(r.name);
  for (const p of prospectsRes.data ?? []) add(p.owner_rep);
  for (const m of meetingsRes.data ?? []) add(m.rep_name);
  return [...byLower.values()].sort((a, b) => a.localeCompare(b));
}

const escapeIlike = (s: string) => s.replace(/[%_\\]/g, (m) => `\\${m}`);

// Registers a rep at creation. Case-insensitive reuse: "kiran" returns the
// existing "Kiran" instead of creating a near-duplicate.
export async function registerRep(
  db: SupabaseClient,
  rawName: string
): Promise<{ name: string; created: boolean } | { error: string }> {
  const name = (rawName ?? "").trim();
  if (!name) return { error: "Name is required" };
  if (name.length > 40) return { error: "Name must be 40 characters or fewer" };

  const { data: existing } = await db.from("reps").select("name").ilike("name", escapeIlike(name)).maybeSingle();
  if (existing) return { name: existing.name, created: false };

  const { data, error } = await db.from("reps").insert({ name }).select().single();
  if (error) {
    // Lost a race against the case-insensitive unique index — reuse canonical.
    const { data: again } = await db.from("reps").select("name").ilike("name", escapeIlike(name)).maybeSingle();
    if (again) return { name: again.name, created: false };
    return { error: error.message };
  }
  return { name: data.name, created: true };
}
