"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { repColor, repInitial } from "@/lib/reps";
import type { Memory } from "@/lib/memory";
import ArchiveButton from "../archive-button";
import DeleteButton from "../delete-button";
import ReassignOwner from "../reassign-owner";

type MeetingRow = {
  id: string;
  meeting_type: string;
  rep_name: string | null;
  raw_notes: string | null;
  scheduled_at: string | null;
  status: string;
  triage_verdict: string | null;
  triage_reason: string | null;
  brief: Record<string, unknown> | null;
  extracted: { summary?: string; deal_signal?: string } | null;
  created_at: string;
};

export type ProspectRow = {
  id: string;
  company_name: string;
  website: string | null;
  owner_rep: string | null;
  stage: string;
  deal_health: string;
  memory: Partial<Memory> | null;
  updated_at: string;
  archived_at: string | null;
  meetings: MeetingRow[];
};

const HEALTH_CHIP: Record<string, string> = {
  advancing: "bg-emerald-100 text-emerald-800",
  stalling: "bg-amber-100 text-amber-800",
  at_risk: "bg-red-100 text-red-800",
  unknown: "bg-slate-100 text-slate-600",
};
// Worst first
const HEALTH_SORT: Record<string, number> = { at_risk: 0, stalling: 1, unknown: 2, advancing: 3 };
const HEALTH_OPTIONS = ["advancing", "stalling", "at_risk", "unknown"];
const STAGE_OPTIONS = ["discovery", "demo", "closing", "closed_won", "disqualified"];

const label = (v: string) => v.replace(/_/g, " ");

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days > 1) return `${days} days ago`;
  if (days === 1) return "yesterday";
  if (diff >= 0) return "today";
  const ahead = Math.ceil(-diff / 86400000);
  return ahead <= 1 ? "tomorrow" : `in ${ahead} days`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

// "Activity" = latest of notes saved / meeting completed / meeting created /
// reassignment. updated_at bumps on notes and reassignment; meeting
// created_at covers creation; a done meeting's scheduled_at covers completion.
function lastTrackedAt(p: ProspectRow): number {
  const now = Date.now();
  const times = [new Date(p.updated_at).getTime()];
  for (const m of p.meetings) {
    times.push(new Date(m.created_at).getTime());
    if (m.status === "done" && m.scheduled_at) {
      const t = new Date(m.scheduled_at).getTime();
      if (t <= now) times.push(t);
    }
  }
  for (const t of p.memory?.ownership_log ?? []) times.push(new Date(t.at).getTime());
  return Math.max(...times.filter((t) => !Number.isNaN(t)));
}

function latestSignalReason(p: ProspectRow): string {
  if (p.stage === "disqualified" && p.memory?.fit_reason) return `Disqualified: ${p.memory.fit_reason}`;
  if (p.memory?.health_reason && (p.deal_health === "stalling" || p.deal_health === "at_risk")) {
    return p.memory.health_reason;
  }
  const doneWithExtract = p.meetings.filter((m) => m.extracted?.summary);
  if (doneWithExtract.length > 0) return doneWithExtract[0].extracted!.summary!;
  const flagged = p.meetings.find((m) => m.triage_verdict === "do_not_take" || m.triage_verdict === "caution");
  if (flagged?.triage_reason) return flagged.triage_reason;
  return "No calls logged yet";
}

const isFlaggedOnly = (p: ProspectRow) =>
  !p.meetings.some((m) => m.status === "done") && p.meetings[0]?.triage_verdict === "do_not_take";
const isActiveDeal = (p: ProspectRow) =>
  !["disqualified", "closed_lost"].includes(p.stage) && !isFlaggedOnly(p);
const isDeletable = (p: ProspectRow) =>
  !p.meetings.some((m) => m.status === "done" || (m.raw_notes ?? "").trim() !== "");

function RepStack({ name }: { name: string | null }) {
  if (!name) return null;
  return (
    <span className="mt-0.5 flex items-center gap-1.5">
      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white ${repColor(name)}`}>
        {repInitial(name)}
      </span>
      <span className="text-xs font-normal text-slate-500">{name}</span>
    </span>
  );
}

function BriefInline({ brief }: { brief: Record<string, unknown> }) {
  const str = (k: string) => (typeof brief[k] === "string" && (brief[k] as string).trim() ? (brief[k] as string) : null);
  const arr = (k: string) => (Array.isArray(brief[k]) ? (brief[k] as string[]).filter(Boolean) : []);
  const sections: { title: string; text?: string | null; items?: string[] }[] = [
    { title: "Headline", text: str("headline") },
    { title: "What we know", items: arr("what_we_know") },
    { title: "Open loops", items: arr("open_loops") },
    { title: "Talk track", items: arr("talk_track") },
    { title: "Questions to ask", items: arr("questions_to_ask") },
    { title: "Watch out", text: str("watch_out") },
  ];
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs font-medium text-blue-600 hover:underline [&::-webkit-details-marker]:hidden">
        View brief
      </summary>
      <div className="mt-2 space-y-2 rounded-lg bg-slate-50 p-3">
        {sections.map(
          (s) =>
            (s.text || (s.items && s.items.length > 0)) && (
              <div key={s.title}>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{s.title}</p>
                {s.text && <p className="text-sm text-slate-700">{s.text}</p>}
                {s.items && s.items.length > 0 && (
                  <ul className="mt-0.5 list-disc pl-4 text-sm text-slate-700">
                    {s.items.map((it, i) => (
                      <li key={i}>{it}</li>
                    ))}
                  </ul>
                )}
              </div>
            )
        )}
      </div>
    </details>
  );
}

// Restores an archived prospect (PATCH {archived: false}).
function RestoreButton({ prospectId }: { prospectId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function restore() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/prospects/${prospectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: false }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      onClick={restore}
      disabled={busy}
      className="text-xs font-medium text-slate-400 hover:text-emerald-700 hover:underline disabled:opacity-50"
    >
      {busy ? "Restoring…" : "Restore"}
    </button>
  );
}

const ACTIVITY_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "Activity: All" },
  { value: "active", label: "Active (last 7 days)" },
  { value: "quiet", label: "No activity 7+ days" },
];
const ACTIVITY_CHIP_LABEL: Record<string, string> = {
  active: "Active (last 7 days)",
  quiet: "No activity 7+ days",
};

const selectCls =
  "rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-slate-900 focus:outline-none";

// Checkbox multi-select dropdown: stays open while selecting, closes on
// outside click. Within one filter selections are OR; filters AND together.
function MultiSelect({
  name,
  options,
  selected,
  onChange,
  format = (v: string) => v,
}: {
  name: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  format?: (v: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const triggerText =
    selected.length === 0
      ? `${name}: All`
      : selected.length === 1
      ? `${name} · ${format(selected[0])}`
      : `${name} · ${selected.length}`;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`${selectCls} flex items-center gap-1`}
        aria-label={name}
        aria-expanded={open}
      >
        {triggerText} <span className="text-slate-400">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-20 mt-1 max-h-64 w-48 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
            {options.map((o) => (
              <label
                key={o}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(o)}
                  onChange={() =>
                    onChange(selected.includes(o) ? selected.filter((x) => x !== o) : [...selected, o])
                  }
                  className="accent-slate-900"
                />
                {format(o)}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
const chipOn = "border-slate-900 bg-slate-900 text-white";
const chipOff = "border-slate-300 bg-white text-slate-600 hover:border-slate-500";

export default function DealsTable({ prospects, roster }: { prospects: ProspectRow[]; roster: string[] }) {
  const [search, setSearch] = useState("");
  const [owners, setOwners] = useState<string[]>([]);
  const [healths, setHealths] = useState<string[]>([]);
  const [stages, setStages] = useState<string[]>([]);
  const [activity, setActivity] = useState<"all" | "active" | "quiet">("all");
  const [showArchived, setShowArchived] = useState(false);
  const [density, setDensity] = useState<"compact" | "full">("compact");
  const [sort, setSort] = useState<{ key: "activity" | "health"; dir: "asc" | "desc" }>({ key: "activity", dir: "desc" });

  // Density persists for the tab session; compact on every fresh load.
  useEffect(() => {
    const saved = sessionStorage.getItem("managerTableDensity");
    if (saved === "full") setDensity("full");
  }, []);
  function toggleDensity() {
    const next = density === "compact" ? "full" : "compact";
    setDensity(next);
    sessionStorage.setItem("managerTableDensity", next);
  }

  const filtered = useMemo(() => {
    const now = Date.now();
    const WEEK = 7 * 86400000;
    return prospects.filter((p) => {
      if (!showArchived && p.archived_at) return false;
      if (activity === "active" && now - lastTrackedAt(p) >= WEEK) return false;
      if (activity === "quiet" && now - lastTrackedAt(p) < WEEK) return false;
      if (search.trim() && !p.company_name.toLowerCase().includes(search.trim().toLowerCase())) return false;
      if (owners.length > 0 && !owners.includes(p.owner_rep ?? "")) return false;
      if (healths.length > 0 && !healths.includes(p.deal_health)) return false;
      if (stages.length > 0 && !stages.includes(p.stage)) return false;
      return true;
    });
  }, [prospects, search, owners, healths, stages, activity, showArchived]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    rows.sort((a, b) => {
      let cmp: number;
      if (sort.key === "health") {
        cmp = (HEALTH_SORT[a.deal_health] ?? 2) - (HEALTH_SORT[b.deal_health] ?? 2);
        if (sort.dir === "desc") cmp = -cmp;
        if (cmp === 0) cmp = lastTrackedAt(b) - lastTrackedAt(a);
      } else {
        cmp = lastTrackedAt(b) - lastTrackedAt(a);
        if (sort.dir === "asc") cmp = -cmp;
      }
      return cmp;
    });
    return rows;
  }, [filtered, sort]);

  const scopeTotal = prospects.filter((p) => showArchived || !p.archived_at).length;

  // Stat cards respect the active filters.
  const stats = [
    { label: "Active deals", value: filtered.filter(isActiveDeal).length, cls: "text-slate-900" },
    { label: "Advancing", value: filtered.filter((p) => isActiveDeal(p) && p.deal_health === "advancing").length, cls: "text-emerald-600" },
    {
      label: "Stalling / At-risk",
      value: filtered.filter((p) => isActiveDeal(p) && (p.deal_health === "stalling" || p.deal_health === "at_risk")).length,
      cls: "text-amber-600",
    },
    {
      label: "Flagged by triage",
      value: filtered
        .flatMap((p) => p.meetings)
        .filter((m) => m.triage_verdict === "do_not_take" || m.triage_verdict === "caution").length,
      cls: "text-red-600",
    },
  ];

  const activeFilterChips: { key: string; text: string; clear: () => void }[] = [];
  if (search.trim()) activeFilterChips.push({ key: "search", text: `"${search.trim()}"`, clear: () => setSearch("") });
  for (const o of owners)
    activeFilterChips.push({ key: `owner-${o}`, text: `Owner: ${o}`, clear: () => setOwners(owners.filter((x) => x !== o)) });
  for (const h of healths)
    activeFilterChips.push({ key: `health-${h}`, text: `Health: ${label(h)}`, clear: () => setHealths(healths.filter((x) => x !== h)) });
  for (const s of stages)
    activeFilterChips.push({ key: `stage-${s}`, text: `Stage: ${label(s)}`, clear: () => setStages(stages.filter((x) => x !== s)) });
  if (activity !== "all")
    activeFilterChips.push({ key: "activity", text: ACTIVITY_CHIP_LABEL[activity], clear: () => setActivity("all") });
  if (showArchived)
    activeFilterChips.push({ key: "archived", text: "Showing archived", clear: () => setShowArchived(false) });
  const clearAll = () => {
    setSearch("");
    setOwners([]);
    setHealths([]);
    setStages([]);
    setActivity("all");
    setShowArchived(false);
  };

  const sortArrow = (key: "activity" | "health") =>
    sort.key === key ? (sort.dir === "desc" ? " ▼" : " ▲") : "";
  function clickSort(key: "activity" | "health") {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: key === "health" ? "asc" : "desc" }
    );
  }

  const full = density === "full";
  const gridCols = full
    ? "md:grid-cols-[1.6fr_0.8fr_0.8fr_0.5fr_0.8fr_1.2fr_1.4fr_0.7fr]"
    : "md:grid-cols-[2fr_0.9fr_0.9fr_1.8fr]";
  const clamp1 =
    "overflow-hidden [-webkit-box-orient:vertical] [-webkit-line-clamp:1] [display:-webkit-box] hover:[-webkit-line-clamp:unset]";

  return (
    <>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className={`text-3xl font-bold ${s.cls}`}>{s.value}</p>
            <p className="mt-1 text-sm text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Deals <span className="font-normal normal-case text-slate-400">({sorted.length} shown of {scopeTotal})</span>
          </h2>
          <button onClick={toggleDensity} className="text-xs font-medium text-blue-600 hover:underline">
            {full ? "⊟ Compact table" : "⊞ Expand table"}
          </button>
        </div>

        {/* Filter bar */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search company…"
            className="w-40 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
          />
          <MultiSelect name="Owner" options={roster} selected={owners} onChange={setOwners} />
          <MultiSelect name="Health" options={HEALTH_OPTIONS} selected={healths} onChange={setHealths} format={label} />
          <MultiSelect name="Stage" options={STAGE_OPTIONS} selected={stages} onChange={setStages} format={label} />
          <select
            value={activity}
            onChange={(e) => setActivity(e.target.value as typeof activity)}
            className={selectCls}
            aria-label="Activity"
          >
            {ACTIVITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-600">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="accent-slate-900"
            />
            Show archived
          </label>
        </div>

        {activeFilterChips.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {activeFilterChips.map((c) => (
              <button
                key={c.key}
                onClick={c.clear}
                className="flex items-center gap-1 rounded-full bg-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-300"
              >
                {c.text} <span aria-hidden>✕</span>
              </button>
            ))}
            <button onClick={clearAll} className="text-[11px] font-medium text-blue-600 hover:underline">
              Clear all
            </button>
          </div>
        )}

        {sorted.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
            {owners.length > 0 ? (
              <>
                <p className="font-medium text-slate-700">
                  No deals assigned to {owners.length === 1 ? owners[0] : "the selected owners"} yet.
                </p>
                <p className="mt-1 text-sm text-slate-500">Reassign one from the table — clear the Owner filter, expand a deal, and use Reassign owner.</p>
              </>
            ) : (
              <>
                <p className="font-medium text-slate-700">No deals match the current filters.</p>
                <p className="mt-1 text-sm text-slate-500">Adjust or clear the filters above.</p>
              </>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div
              className={`hidden gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid ${gridCols}`}
            >
              <span>Company</span>
              <button onClick={() => clickSort("health")} className="text-left uppercase tracking-wide hover:text-slate-800">
                Health{sortArrow("health")}
              </button>
              {full && <span>Stage</span>}
              {full && <span>Calls</span>}
              <button onClick={() => clickSort("activity")} className="text-left uppercase tracking-wide hover:text-slate-800">
                Last activity{sortArrow("activity")}
              </button>
              <span>Next step</span>
              {full && <span>Latest signal</span>}
              {full && <span>Actions</span>}
            </div>
            {sorted.map((p) => (
              <details key={p.id} className={`group border-b border-slate-100 last:border-b-0 ${p.archived_at ? "opacity-60" : ""}`}>
                <summary
                  className={`grid cursor-pointer grid-cols-2 gap-3 px-5 py-4 hover:bg-slate-50 md:items-center [&::-webkit-details-marker]:hidden ${gridCols}`}
                >
                  <span className="font-semibold text-slate-900">
                    {p.company_name}
                    {p.archived_at && (
                      <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                        Archived
                      </span>
                    )}
                    {(p.memory?.competitors?.length ?? 0) > 0 && (
                      <span className="ml-1.5 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700">
                        ⚔ {p.memory!.competitors!.map((c) => c.name).join(", ")}
                      </span>
                    )}
                    <RepStack name={p.owner_rep} />
                  </span>
                  <span>
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${HEALTH_CHIP[p.deal_health] ?? HEALTH_CHIP.unknown}`}>
                      {label(p.deal_health)}
                    </span>
                  </span>
                  {full && <span className="hidden text-sm capitalize text-slate-600 md:block">{label(p.stage)}</span>}
                  {full && <span className="hidden text-sm text-slate-600 md:block">{p.meetings.length}</span>}
                  <span className="flex items-center gap-1.5 text-sm text-slate-600">
                    <span
                      className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                        Date.now() - lastTrackedAt(p) < 7 * 86400000 ? "bg-emerald-500" : "bg-slate-300"
                      }`}
                      title={`Last activity ${relativeTime(new Date(lastTrackedAt(p)).toISOString())}`}
                    />
                    {relativeTime(new Date(lastTrackedAt(p)).toISOString())}
                  </span>
                  <span className={`text-sm text-slate-600 ${clamp1}`} title={p.memory?.next_step ?? undefined}>
                    {p.memory?.next_step ?? <span className="text-slate-400">— none captured</span>}
                  </span>
                  {full && (
                    <span className={`hidden text-sm text-slate-500 md:[display:-webkit-box] ${clamp1}`} title={latestSignalReason(p)}>
                      {latestSignalReason(p)}
                    </span>
                  )}
                  {full && (
                    <span className="hidden items-center gap-2 md:flex" onClick={(e) => e.preventDefault()}>
                      {isDeletable(p) && <DeleteButton prospectId={p.id} company={p.company_name} />}
                      {p.archived_at ? <RestoreButton prospectId={p.id} /> : <ArchiveButton prospectId={p.id} />}
                    </span>
                  )}
                </summary>
                <div className="bg-slate-50 px-5 py-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Meeting timeline</p>
                    <span className="flex items-center gap-3">
                      <ReassignOwner prospectId={p.id} current={p.owner_rep} roster={roster} />
                      {isDeletable(p) && <DeleteButton prospectId={p.id} company={p.company_name} />}
                      {p.archived_at ? <RestoreButton prospectId={p.id} /> : <ArchiveButton prospectId={p.id} />}
                    </span>
                  </div>
                  {(p.memory?.ownership_log?.length ?? 0) > 0 &&
                    p.memory!.ownership_log!.map((t, i) => (
                      <p key={i} className="mb-2 text-xs italic text-slate-500">
                        Reassigned from {t.from ?? "unassigned"} to {t.to} · {fmtDate(t.at)}
                      </p>
                    ))}
                  <div className="space-y-2">
                    {p.meetings.length === 0 && <p className="text-sm text-slate-500">No meetings recorded.</p>}
                    {[...p.meetings].reverse().map((m) => (
                      <div key={m.id} className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold capitalize">{m.meeting_type}</span>
                          <span className="text-xs text-slate-400">{fmtDate(m.scheduled_at ?? m.created_at)}</span>
                          {m.rep_name && <span className="text-xs text-slate-400">· {m.rep_name}</span>}
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${
                              m.triage_verdict === "do_not_take"
                                ? "bg-red-100 text-red-700"
                                : m.triage_verdict === "caution"
                                ? "bg-amber-100 text-amber-700"
                                : m.status === "done"
                                ? "bg-slate-100 text-slate-600"
                                : "bg-blue-100 text-blue-700"
                            }`}
                          >
                            {m.triage_verdict === "do_not_take" ? "⛔ do not take" : m.triage_verdict === "caution" ? "⚠ caution" : m.status}
                          </span>
                        </div>
                        {m.triage_reason && (m.triage_verdict === "do_not_take" || m.triage_verdict === "caution") && (
                          <p className="mt-1.5 text-xs text-slate-600">{m.triage_reason}</p>
                        )}
                        {m.extracted?.summary && <p className="mt-1.5 text-sm text-slate-700">{m.extracted.summary}</p>}
                        {m.brief && <BriefInline brief={m.brief} />}
                      </div>
                    ))}
                  </div>
                </div>
              </details>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
