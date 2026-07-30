export type Stakeholder = { name: string; role?: string; notes?: string };
export type Commitment = { who: string; what: string; when?: string };

export type Extracted = {
  summary: string;
  pains: string[];
  stakeholders: Stakeholder[];
  objections: string[];
  commitments: Commitment[];
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
  next_step: string | null;
  last_sentiment?: string;
  facts?: string[];
};

const STAGE_ORDER = ["discovery", "demo", "closing", "closed_won"];

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

  if (extracted.next_step?.trim()) mem.next_step = extracted.next_step.trim();
  if (extracted.sentiment) mem.last_sentiment = extracted.sentiment;
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
