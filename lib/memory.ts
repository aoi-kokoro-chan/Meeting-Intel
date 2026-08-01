export type Stakeholder = { name: string; role?: string; notes?: string };
export type Commitment = { who: string; what: string; when?: string };
export type Competitor = { name: string; context?: string; mentioned_at?: string };

export type Extracted = {
  summary: string;
  pains: string[];
  stakeholders: Stakeholder[];
  objections: string[];
  commitments: Commitment[];
  resolved_commitments?: string[];
  addressed_objections?: string[];
  verbatim_phrases?: string[];
  competitors?: Competitor[];
  process_facts?: string[];
  relationship_notes?: string[];
  blockers?: string[];
  fit?: Record<string, string>;
  fit_reason?: string | null;
  resolved_fit_unknowns?: string[];
  next_step: string | null;
  sentiment: string;
  deal_signal: "advancing" | "stalling" | "at_risk";
  stage_suggestion?: string | null;
};

export type Memory = {
  pains: string[];
  stakeholders: Stakeholder[];
  objections: string[];
  commitments: Commitment[];
  resolutions?: string[];
  resolution_log?: { text: string; date: string }[];
  verbatim_phrases?: string[];
  competitors?: Competitor[];
  process_facts?: string[];
  relationship_notes?: string[];
  blockers?: string[];
  health_reason?: string | null;
  ownership_log?: { from: string | null; to: string; at: string }[];
  fit?: Record<string, string>;
  fit_reason?: string | null;
  fit_unknowns?: string[];
  next_step: string | null;
  last_sentiment?: string;
  facts?: string[];
};

export const SENIOR_ROLE =
  /\b(head|director|vp|chief|cfo|ceo|cmo|coo|founder|owner|president|gm)\b|general manager|vice president/i;

export function hasSeniorStakeholder(memory: Partial<Memory> | null): boolean {
  return (memory?.stakeholders ?? []).some((s) => s.role && SENIOR_ROLE.test(s.role));
}

const STAGE_ORDER = ["discovery", "demo", "closing", "closed_won"];

// Loose semantic match for resolution subtraction: normalized equality,
// containment either way, or high token overlap — not exact string equality.
function normalizeLoose(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

export function looselyMatches(a: string, b: string): boolean {
  const na = normalizeLoose(a);
  const nb = normalizeLoose(b);
  if (!na || !nb) return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  const ta = new Set(na.split(" "));
  const tb = new Set(nb.split(" "));
  const overlap = [...ta].filter((t) => tb.has(t)).length;
  return overlap / Math.min(ta.size, tb.size) >= 0.7;
}

// Sane growth caps per memory array — newest entries win on overflow.
const ARRAY_CAPS: Record<string, number> = {
  pains: 15,
  stakeholders: 15,
  objections: 12,
  commitments: 15,
  resolutions: 30,
  resolution_log: 30,
  verbatim_phrases: 10,
  competitors: 10,
  process_facts: 15,
  relationship_notes: 10,
  blockers: 10,
  facts: 15,
  fit_unknowns: 3,
};

function dedupeStrings(arr: string[]): string[] {
  const seen = new Set<string>();
  return arr.filter((s) => {
    const k = s.trim().toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function mergeMemory(existing: Partial<Memory> | null, extracted: Extracted): Memory {
  const mem: Memory = {
    pains: existing?.pains ?? [],
    stakeholders: existing?.stakeholders ?? [],
    objections: existing?.objections ?? [],
    commitments: existing?.commitments ?? [],
    resolutions: existing?.resolutions ?? [],
    verbatim_phrases: existing?.verbatim_phrases ?? [],
    fit: existing?.fit ?? {},
    fit_reason: existing?.fit_reason ?? null,
    fit_unknowns: existing?.fit_unknowns ?? [],
    next_step: existing?.next_step ?? null,
    last_sentiment: existing?.last_sentiment,
    facts: existing?.facts ?? [],
  };

  mem.pains = dedupeStrings([...mem.pains, ...(extracted.pains ?? [])]);
  mem.objections = dedupeStrings([...mem.objections, ...(extracted.objections ?? [])]);

  // Stakeholders dedupe by name; newer role/notes win when provided.
  const byName = new Map<string, Stakeholder>();
  for (const s of [...mem.stakeholders, ...(extracted.stakeholders ?? [])]) {
    if (!s?.name?.trim()) continue;
    const k = s.name.trim().toLowerCase();
    const prev = byName.get(k);
    byName.set(k, {
      name: s.name.trim(),
      role: s.role || prev?.role,
      notes: s.notes || prev?.notes,
    });
  }
  mem.stakeholders = [...byName.values()];

  const seenC = new Set(mem.commitments.map((c) => `${c.who}|${c.what}`.toLowerCase()));
  for (const c of extracted.commitments ?? []) {
    if (!c?.what) continue;
    const k = `${c.who}|${c.what}`.toLowerCase();
    if (!seenC.has(k)) {
      seenC.add(k);
      mem.commitments.push(c);
    }
  }

  // Resolved loops: delivered commitments + addressed objections stop rolling
  // forward — recorded in resolutions AND subtracted from the open arrays via
  // loose semantic matching, so memory doesn't only accumulate.
  mem.resolutions = dedupeStrings([
    ...(mem.resolutions ?? []),
    ...(extracted.resolved_commitments ?? []),
    ...(extracted.addressed_objections ?? []),
  ]);
  const resolvedNow = [...(extracted.resolved_commitments ?? []), ...(extracted.addressed_objections ?? [])];
  mem.resolution_log = [
    ...(existing?.resolution_log ?? []),
    ...resolvedNow.map((text) => ({ text, date: new Date().toISOString() })),
  ];
  const allResolutions = mem.resolutions ?? [];
  mem.objections = (mem.objections ?? []).filter((o) => !allResolutions.some((r) => looselyMatches(o, r)));
  mem.commitments = (mem.commitments ?? []).filter(
    (c) => !allResolutions.some((r) => looselyMatches(`${c.who}: ${c.what}`, r) || looselyMatches(c.what ?? "", r))
  );

  // The prospect's own words, capped so the list stays sharp.
  mem.verbatim_phrases = dedupeStrings([
    ...(mem.verbatim_phrases ?? []),
    ...(extracted.verbatim_phrases ?? []),
  ]).slice(0, 10);

  // Competitors dedupe by name; first sighting date sticks, newer context wins.
  const compByName = new Map<string, Competitor>();
  for (const c of [...(existing?.competitors ?? []), ...(extracted.competitors ?? [])]) {
    if (!c?.name?.trim()) continue;
    const k = c.name.trim().toLowerCase();
    const prev = compByName.get(k);
    compByName.set(k, {
      name: c.name.trim(),
      context: c.context || prev?.context,
      mentioned_at: prev?.mentioned_at || c.mentioned_at,
    });
  }
  mem.competitors = [...compByName.values()];
  mem.process_facts = dedupeStrings([...(existing?.process_facts ?? []), ...(extracted.process_facts ?? [])]);
  mem.relationship_notes = dedupeStrings([
    ...(existing?.relationship_notes ?? []),
    ...(extracted.relationship_notes ?? []),
  ]);
  mem.blockers = dedupeStrings([...(existing?.blockers ?? []), ...(extracted.blockers ?? [])]);

  // Fit resolutions: answered questions overwrite, resolved unknowns drop off.
  mem.fit = existing?.fit ?? {};
  if (extracted.fit && typeof extracted.fit === "object") {
    mem.fit = { ...mem.fit, ...extracted.fit };
  }
  if (extracted.fit_reason?.trim()) mem.fit_reason = extracted.fit_reason.trim();
  const resolvedUnknowns = new Set((extracted.resolved_fit_unknowns ?? []).map((u) => u.trim().toLowerCase()));
  mem.fit_unknowns = (existing?.fit_unknowns ?? []).filter((u) => !resolvedUnknowns.has(u.trim().toLowerCase()));
  if (Object.keys(extracted.fit ?? {}).length > 0 && resolvedUnknowns.size === 0) {
    // Fit facts arrived without explicit matches — the unknowns are stale either way.
    mem.fit_unknowns = [];
  }

  if (extracted.next_step?.trim()) mem.next_step = extracted.next_step.trim();
  if (extracted.sentiment) mem.last_sentiment = extracted.sentiment;

  // Cap array growth — keep the newest entries when a list overflows.
  const memRecord = mem as unknown as Record<string, unknown>;
  for (const [key, cap] of Object.entries(ARRAY_CAPS)) {
    const v = memRecord[key];
    if (Array.isArray(v) && v.length > cap) memRecord[key] = v.slice(-cap);
  }
  return mem;
}

// Only ever move a deal forward; never silently regress the stage.
export function advanceStage(current: string, suggestion?: string | null): string {
  if (!suggestion) return current;
  const s = suggestion.trim().toLowerCase();
  if (s === "closed_lost" || s === "disqualified") return s;
  const cur = STAGE_ORDER.indexOf(current);
  const next = STAGE_ORDER.indexOf(s);
  if (next > cur) return s;
  return current;
}

export function healthFromSignal(signal: string | undefined): string | null {
  if (signal === "advancing" || signal === "stalling" || signal === "at_risk") return signal;
  return null;
}
