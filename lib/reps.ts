// Demo rep roster — a real deployment would source identity from SSO.
export const REPS = ["Priya", "Rohan", "Aditi"];
export const DEFAULT_REP = "Priya";
export const REP_COOKIE = "rep";

export const REP_COLORS: Record<string, string> = {
  Priya: "bg-violet-600",
  Rohan: "bg-sky-600",
  Aditi: "bg-rose-600",
};

export function resolveRep(value: string | undefined | null): string {
  return value && REPS.includes(value) ? value : DEFAULT_REP;
}
