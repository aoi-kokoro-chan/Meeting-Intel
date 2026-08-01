import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import type { Memory } from "@/lib/memory";
import { deriveRoster, repColor, repInitial } from "@/lib/reps";
import { sweepProvisional } from "@/lib/archive";
import ViewSegment from "../view-segment";
import ArchiveButton from "../archive-button";
import DeleteButton from "../delete-button";
import ReassignOwner from "../reassign-owner";

export const dynamic = "force-dynamic";

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

type ProspectRow = {
  id: string;
  company_name: string;
  website: string | null;
  owner_rep: string | null;
  stage: string;
  deal_health: string;
  memory: Partial<Memory> | null;
  updated_at: string;
  meetings: MeetingRow[];
};

const HEALTH_CHIP: Record<string, string> = {
  advancing: "bg-emerald-100 text-emerald-800",
  stalling: "bg-amber-100 text-amber-800",
  at_risk: "bg-red-100 text-red-800",
  unknown: "bg-slate-100 text-slate-600",
};

const HEALTH_SORT: Record<string, number> = { at_risk: 0, stalling: 1, unknown: 2, advancing: 3 };

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

function latestSignalReason(p: ProspectRow): string {
  if (p.stage === "disqualified" && p.memory?.fit_reason) {
    return `Disqualified: ${p.memory.fit_reason}`;
  }
  // Code-derived health downgrade reason: shows WHY a deal isn't advancing.
  if (p.memory?.health_reason && (p.deal_health === "stalling" || p.deal_health === "at_risk")) {
    return p.memory.health_reason;
  }
  const doneWithExtract = p.meetings.filter((m) => m.extracted?.summary);
  if (doneWithExtract.length > 0) return doneWithExtract[0].extracted!.summary!;
  const flagged = p.meetings.find((m) => m.triage_verdict === "do_not_take" || m.triage_verdict === "caution");
  if (flagged?.triage_reason) return flagged.triage_reason;
  return "No calls logged yet";
}

function RepBadge({ name, size = "h-6 w-6 text-[11px]" }: { name: string | null; size?: string }) {
  if (!name) return <span className="text-sm text-slate-400">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white ${size} ${repColor(name)}`}>
        {repInitial(name)}
      </span>
      <span className="text-sm text-slate-700">{name}</span>
    </span>
  );
}

export default async function ManagerView({
  searchParams,
}: {
  searchParams: Promise<{ rep?: string; archived?: string }>;
}) {
  const { rep: repParam, archived: archivedParam } = await searchParams;
  const showArchived = archivedParam === "1";
  let prospects: ProspectRow[] = [];
  let archivedCount = 0;
  let loadError: string | null = null;
  try {
    const db = supabaseAdmin();
    await sweepProvisional(db);
    let query = db.from("prospects").select("*, meetings(*)").order("updated_at", { ascending: false });
    // Read-only archived surface: archive mechanics themselves are unchanged.
    query = showArchived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
    const { data, error } = await query;
    const { count } = await db
      .from("prospects")
      .select("*", { count: "exact", head: true })
      .not("archived_at", "is", null);
    archivedCount = count ?? 0;
    if (error) loadError = error.message;
    prospects = (data ?? []) as ProspectRow[];
    for (const p of prospects) {
      p.meetings.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
  } catch (err) {
    loadError = (err as Error).message;
  }

  const roster = deriveRoster(prospects, prospects.flatMap((p) => p.meetings));
  const repFilter = repParam && roster.includes(repParam) ? repParam : null;

  // Table + stat cards respect the rep filter; signal cards stay global.
  const visible = repFilter ? prospects.filter((p) => p.owner_rep === repFilter) : prospects;

  // A prospect whose only history is a do_not_take flag with no completed call
  // is not a deal — it belongs in "Flagged by triage" only.
  const isFlaggedOnly = (p: ProspectRow) =>
    !p.meetings.some((m) => m.status === "done") && p.meetings[0]?.triage_verdict === "do_not_take";
  const isActiveDeal = (p: ProspectRow) =>
    !["disqualified", "closed_lost"].includes(p.stage) && !isFlaggedOnly(p);

  const active = visible.filter(isActiveDeal);
  const advancing = visible.filter((p) => isActiveDeal(p) && p.deal_health === "advancing");
  const troubled = visible.filter(
    (p) => isActiveDeal(p) && (p.deal_health === "stalling" || p.deal_health === "at_risk")
  );
  const flaggedMeetings = visible
    .flatMap((p) => p.meetings)
    .filter((m) => m.triage_verdict === "do_not_take" || m.triage_verdict === "caution");

  const allActive = prospects.filter(isActiveDeal);

  const sorted = [...visible].sort((a, b) => {
    const h = (HEALTH_SORT[a.deal_health] ?? 2) - (HEALTH_SORT[b.deal_health] ?? 2);
    if (h !== 0) return h;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });

  // Manager signal sections — plain code, no LLM
  const WEEK_MS = 7 * 86400000;
  const SENIOR_ROLE =
    /\b(head|director|vp|chief|cfo|ceo|cmo|coo|founder|owner|president|gm)\b|general manager|vice president/i;
  const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
  const doneCount = (p: ProspectRow) => p.meetings.filter((m) => m.status === "done").length;
  const hasSeniorStakeholder = (p: ProspectRow) =>
    (p.memory?.stakeholders ?? []).some((s) => s.role && SENIOR_ROLE.test(s.role));

  const repOf = (p: ProspectRow) => p.owner_rep ?? "Unassigned";

  const highlights: string[] = [];
  for (const p of allActive) {
    if (p.deal_health === "advancing") {
      highlights.push(`${repOf(p)} — ${p.company_name} is advancing${p.memory?.next_step ? `: ${p.memory.next_step}` : "."}`);
    }
  }
  for (const p of allActive) {
    if (p.stage !== "discovery" && Date.now() - new Date(p.updated_at).getTime() < WEEK_MS) {
      highlights.push(`${repOf(p)} — ${p.company_name} progressed to ${p.stage.replace("_", " ")} stage this week.`);
    }
  }
  for (const p of allActive) {
    const n = (p.memory?.commitments ?? []).length;
    if (n > 0) {
      highlights.push(`${repOf(p)} — ${n} commitment${n === 1 ? "" : "s"} on the table at ${p.company_name}.`);
    }
  }

  const watchouts: string[] = [];
  for (const p of allActive) {
    if (p.deal_health === "stalling" || p.deal_health === "at_risk") {
      watchouts.push(
        `${repOf(p)} — ${p.company_name} is ${p.deal_health.replace("_", " ")}, ${daysSince(p.updated_at)} days since last activity.`
      );
    }
  }
  for (const p of allActive) {
    const stakeholders = p.memory?.stakeholders ?? [];
    if (doneCount(p) >= 2 && stakeholders.length < 2) {
      const only = stakeholders[0]
        ? `${stakeholders[0].name}${stakeholders[0].role ? ` (${stakeholders[0].role})` : ""}`
        : "one contact";
      watchouts.push(`${repOf(p)} — single-threaded at ${p.company_name}: only ${only} in the deal.`);
    }
  }
  for (const p of allActive) {
    if (!p.memory?.next_step && doneCount(p) > 0) {
      watchouts.push(`${repOf(p)} — no next step recorded at ${p.company_name} after ${doneCount(p)} call${doneCount(p) === 1 ? "" : "s"}.`);
    }
  }
  for (const p of prospects) {
    if (p.meetings.some((m) => m.triage_verdict === "do_not_take" && m.status === "upcoming")) {
      watchouts.push(`${repOf(p)} — meeting at ${p.company_name} flagged "do not take" is still on the calendar.`);
    }
  }

  // Rep learnings grouped by rep so a manager sees who needs coaching on what.
  const learningsByRep = new Map<string, string[]>();
  const addLearning = (rep: string, text: string) => {
    if (!learningsByRep.has(rep)) learningsByRep.set(rep, []);
    learningsByRep.get(rep)!.push(text);
  };
  for (const p of allActive) {
    if (doneCount(p) >= 2 && !hasSeniorStakeholder(p)) {
      addLearning(repOf(p), `No budget owner identified after ${doneCount(p)} meetings (${p.company_name}).`);
    }
    if (doneCount(p) > 0 && (p.memory?.commitments ?? []).length === 0) {
      addLearning(repOf(p), `No commitments captured in ${doneCount(p)} call${doneCount(p) === 1 ? "" : "s"} (${p.company_name}).`);
    }
    if (p.meetings.some((m) => m.meeting_type === "closing" && m.status === "upcoming") && !hasSeniorStakeholder(p)) {
      addLearning(repOf(p), `Closing call booked without a decision-maker present (${p.company_name}).`);
    }
  }
  // Cap at 3 items total across all reps, preserving grouping.
  let learningBudget = 3;
  const learningGroups: { rep: string; items: string[] }[] = [];
  for (const [rep, items] of learningsByRep) {
    if (learningBudget <= 0) break;
    const take = items.slice(0, learningBudget);
    learningBudget -= take.length;
    learningGroups.push({ rep, items: take });
  }

  const stringSections = [
    {
      title: "Key highlights",
      icon: "✦",
      items: highlights.slice(0, 3),
      card: "border-emerald-200 bg-emerald-50",
      heading: "text-emerald-700",
      text: "text-emerald-900",
    },
    {
      title: "Watchouts",
      icon: "⚠",
      items: watchouts.slice(0, 3),
      card: "border-amber-300 bg-amber-50",
      heading: "text-amber-700",
      text: "text-amber-900",
    },
  ].filter((s) => s.items.length > 0);
  const hasSignals = stringSections.length > 0 || learningGroups.length > 0;

  const stats = [
    { label: "Active deals", value: active.length, cls: "text-slate-900" },
    { label: "Advancing", value: advancing.length, cls: "text-emerald-600" },
    { label: "Stalling / At-risk", value: troubled.length, cls: "text-amber-600" },
    { label: "Flagged by triage", value: flaggedMeetings.length, cls: "text-red-600" },
  ];

  return (
    <main className="mx-auto max-w-6xl px-6 pb-24 pt-8">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pipeline Intelligence</h1>
          <p className="mt-1 text-slate-500">Every deal, every call, one brain.</p>
        </div>
        <div className="mt-2 shrink-0">
          <ViewSegment active="manager" />
        </div>
      </header>

      {loadError && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Couldn&apos;t load pipeline data: {loadError}
        </div>
      )}

      {!showArchived && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className={`text-3xl font-bold ${s.cls}`}>{s.value}</p>
              <p className="mt-1 text-sm text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            {showArchived ? "Archived prospects" : "Deals — at-risk first"}
          </h2>
          <div className="flex items-center gap-1.5">
            <Link
              href={showArchived ? "/manager" : "/manager?archived=1"}
              className="mr-2 text-xs font-medium text-blue-600 hover:underline"
            >
              {showArchived ? "← Back to active" : `Archived (${archivedCount}) →`}
            </Link>
            <Link
              href="/manager"
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                !repFilter ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-600 hover:border-slate-500"
              }`}
            >
              All
            </Link>
            {roster.map((r) => (
              <Link
                key={r}
                href={`/manager?rep=${encodeURIComponent(r)}`}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
                  repFilter === r ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-600 hover:border-slate-500"
                }`}
              >
                <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white ${repColor(r)}`}>
                  {repInitial(r)}
                </span>
                {r}
              </Link>
            ))}
          </div>
        </div>
        {sorted.length === 0 && !loadError ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="font-medium text-slate-700">{repFilter ? `No deals owned by ${repFilter} yet.` : "No deals yet."}</p>
            <p className="mt-1 text-sm text-slate-500">
              Head to the{" "}
              <Link href="/" className="font-medium text-blue-600 hover:underline">
                rep view
              </Link>{" "}
              and prep a brief for your first meeting — deals show up here automatically.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="hidden grid-cols-[1.3fr_0.8fr_0.7fr_0.8fr_0.4fr_0.8fr_1.1fr_1.4fr] gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid">
              <span>Company</span>
              <span>Owner</span>
              <span>Stage</span>
              <span>Health</span>
              <span>Calls</span>
              <span>Last activity</span>
              <span>Next step</span>
              <span>Latest signal</span>
            </div>
            {sorted.map((p) => (
              <details key={p.id} className="group border-b border-slate-100 last:border-b-0">
                <summary className="grid cursor-pointer grid-cols-2 gap-3 px-5 py-4 hover:bg-slate-50 md:grid-cols-[1.3fr_0.8fr_0.7fr_0.8fr_0.4fr_0.8fr_1.1fr_1.4fr] md:items-center [&::-webkit-details-marker]:hidden">
                  <span className="font-semibold text-slate-900">
                    {p.company_name}
                    {p.website && <span className="ml-2 hidden text-xs font-normal text-slate-400 lg:inline">{p.website}</span>}
                    {(p.memory?.competitors?.length ?? 0) > 0 && (
                      <span className="mt-0.5 flex flex-wrap gap-1">
                        {p.memory!.competitors!.map((c) => (
                          <span
                            key={c.name}
                            className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700"
                            title={c.context ?? undefined}
                          >
                            ⚔ {c.name}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                  <span>
                    <RepBadge name={p.owner_rep} />
                  </span>
                  <span className="text-sm capitalize text-slate-600">{p.stage.replace("_", " ")}</span>
                  <span>
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${HEALTH_CHIP[p.deal_health] ?? HEALTH_CHIP.unknown}`}>
                      {p.deal_health.replace("_", " ")}
                    </span>
                  </span>
                  <span className="text-sm text-slate-600">{p.meetings.length}</span>
                  <span className="text-sm text-slate-600">{relativeTime(p.updated_at)}</span>
                  <span
                    className="overflow-hidden text-sm text-slate-600 [-webkit-box-orient:vertical] [-webkit-line-clamp:1] [display:-webkit-box] hover:[-webkit-line-clamp:unset]"
                    title={p.memory?.next_step ?? undefined}
                  >
                    {p.memory?.next_step ?? <span className="text-slate-400">— none captured</span>}
                  </span>
                  <span
                    className="col-span-2 overflow-hidden text-sm text-slate-500 [-webkit-box-orient:vertical] [-webkit-line-clamp:1] [display:-webkit-box] hover:[-webkit-line-clamp:unset] md:col-span-1"
                    title={latestSignalReason(p)}
                  >
                    {latestSignalReason(p)}
                  </span>
                </summary>
                <div className="bg-slate-50 px-5 py-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Meeting timeline</p>
                    <span className="flex items-center gap-3">
                      <ReassignOwner prospectId={p.id} current={p.owner_rep} roster={roster} />
                      {!p.meetings.some((m) => m.status === "done" || (m.raw_notes ?? "").trim() !== "") && (
                        <DeleteButton prospectId={p.id} company={p.company_name} />
                      )}
                      {!showArchived && <ArchiveButton prospectId={p.id} />}
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
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${
                            m.triage_verdict === "do_not_take"
                              ? "bg-red-100 text-red-700"
                              : m.triage_verdict === "caution"
                              ? "bg-amber-100 text-amber-700"
                              : m.status === "done"
                              ? "bg-slate-100 text-slate-600"
                              : "bg-blue-100 text-blue-700"
                          }`}>
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

      {hasSignals && (
        <section className="mt-8">
          <div className="grid gap-4 md:grid-cols-3">
            {stringSections.map((s) => (
              <div key={s.title} className={`rounded-2xl border p-5 ${s.card}`}>
                <h2 className={`mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide ${s.heading}`}>
                  <span aria-hidden>{s.icon}</span>
                  {s.title}
                </h2>
                <ul className="space-y-2">
                  {s.items.map((item, i) => (
                    <li key={i} className={`text-sm leading-relaxed ${s.text}`}>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {learningGroups.length > 0 && (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-blue-700">
                  <span aria-hidden>💡</span>
                  Rep learnings
                </h2>
                <div className="space-y-3">
                  {learningGroups.map((g) => (
                    <div key={g.rep}>
                      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-blue-800">
                        <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white ${repColor(g.rep)}`}>
                          {repInitial(g.rep)}
                        </span>
                        {g.rep}
                      </p>
                      <ul className="space-y-1">
                        {g.items.map((item, i) => (
                          <li key={i} className="text-sm leading-relaxed text-blue-900">
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </main>
  );
}

function BriefInline({ brief }: { brief: Record<string, unknown> }) {
  const str = (k: string) => (typeof brief[k] === "string" && (brief[k] as string).trim() ? (brief[k] as string) : null);
  const arr = (k: string) => (Array.isArray(brief[k]) ? (brief[k] as string[]).filter(Boolean) : []);
  const sections: { title: string; text?: string | null; items?: string[] }[] = [
    { title: "Headline", text: str("headline") },
    { title: "What we know", items: arr("what_we_know") },
    { title: "Open threads", items: arr("open_threads") },
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
