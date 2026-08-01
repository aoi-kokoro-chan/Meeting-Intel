import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { repColor, repInitial } from "@/lib/reps";
import { fetchRoster } from "@/lib/roster";
import { sweepProvisional } from "@/lib/archive";
import ViewSegment from "../view-segment";
import DealsTable, { type ProspectRow } from "./deals-table";

export const dynamic = "force-dynamic";

const SENIOR_ROLE =
  /\b(head|director|vp|chief|cfo|ceo|cmo|coo|founder|owner|president|gm)\b|general manager|vice president/i;

export default async function ManagerView() {
  let prospects: ProspectRow[] = [];
  let roster: string[] = [];
  let loadError: string | null = null;
  try {
    const db = supabaseAdmin();
    await sweepProvisional(db);
    roster = await fetchRoster(db);
    // One fetch covers active and archived; the client-side "Show archived"
    // toggle decides visibility. Archive mechanics are unchanged.
    const { data, error } = await db
      .from("prospects")
      .select("*, meetings(*)")
      .order("updated_at", { ascending: false });
    if (error) loadError = error.message;
    prospects = (data ?? []) as ProspectRow[];
    for (const p of prospects) {
      p.meetings.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
  } catch (err) {
    loadError = (err as Error).message;
  }

  const unarchived = prospects.filter((p) => !p.archived_at);

  // ── Signal sections (unchanged at-risk surfacing) — active deals only ─────
  const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
  const doneCount = (p: ProspectRow) => p.meetings.filter((m) => m.status === "done").length;
  const hasSeniorStakeholder = (p: ProspectRow) =>
    (p.memory?.stakeholders ?? []).some((s) => s.role && SENIOR_ROLE.test(s.role));
  const isFlaggedOnly = (p: ProspectRow) =>
    !p.meetings.some((m) => m.status === "done") && p.meetings[0]?.triage_verdict === "do_not_take";
  const isActiveDeal = (p: ProspectRow) =>
    !["disqualified", "closed_lost"].includes(p.stage) && !isFlaggedOnly(p);
  const allActive = unarchived.filter(isActiveDeal);
  const repOf = (p: ProspectRow) => p.owner_rep ?? "Unassigned";
  const WEEK_MS = 7 * 86400000;

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
  for (const p of unarchived) {
    if (p.meetings.some((m) => m.triage_verdict === "do_not_take" && m.status === "upcoming")) {
      watchouts.push(`${repOf(p)} — meeting at ${p.company_name} flagged "do not take" is still on the calendar.`);
    }
  }

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

      {prospects.length === 0 && !loadError ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="font-medium text-slate-700">No deals yet.</p>
          <p className="mt-1 text-sm text-slate-500">
            Head to the{" "}
            <Link href="/" className="font-medium text-blue-600 hover:underline">
              rep view
            </Link>{" "}
            and prep a brief for your first meeting — deals show up here automatically.
          </p>
        </div>
      ) : (
        <DealsTable prospects={prospects} roster={roster} />
      )}

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
