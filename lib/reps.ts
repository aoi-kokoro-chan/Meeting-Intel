// Rep identity is a cookie-based switcher, never a login wall. A real
// deployment would source identity from SSO. The roster is derived
// dynamically from the data (distinct owner_rep + meeting rep_name).
export const DEFAULT_REP = "Priya";
export const REP_COOKIE = "rep";
export const PERSONA_COOKIE = "persona";

const PALETTE = [
  "bg-violet-600",
  "bg-sky-600",
  "bg-rose-600",
  "bg-emerald-600",
  "bg-amber-600",
  "bg-indigo-600",
  "bg-teal-600",
  "bg-fuchsia-600",
];

export function repColor(name: string | null | undefined): string {
  if (!name) return "bg-slate-500";
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function resolveRep(value: string | undefined | null): string {
  const v = value?.trim();
  return v ? v : DEFAULT_REP;
}

export function deriveRoster(
  prospects: { owner_rep?: string | null }[],
  meetings: { rep_name?: string | null }[]
): string[] {
  const set = new Set<string>();
  for (const p of prospects) if (p.owner_rep?.trim()) set.add(p.owner_rep.trim());
  for (const m of meetings) if (m.rep_name?.trim()) set.add(m.rep_name.trim());
  return [...set].sort((a, b) => a.localeCompare(b));
}
