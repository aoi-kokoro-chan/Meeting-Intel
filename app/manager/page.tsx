import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import type { Memory } from "@/lib/memory";

export const dynamic = "force-dynamic";

type MeetingRow = {
  id: string;
  meeting_type: string;
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
  const doneWithExtract = p.meetings.filter((m) => m.extracted?.summary);
  if (doneWithExtract.length > 0) return doneWithExtract[0].extracted!.summary!;
  const flagged = p.meetings.find((m) => m.triage_verdict === "do_not_take" || m.triage_verdict === "caution");
  if (flagged?.triage_reason) return flagged.triage_reason;
  return "No calls logged yet";
}

export default async function ManagerView() {
  let prospects: ProspectRow[] = [];
  let loadError: string | null = null;
  try {
    const db = supabaseAdmin();
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

  const active = prospects.filter((p) => !["disqualified", "closed_lost"].includes(p.stage));
  const advancing = prospects.filter((p) => p.deal_health === "advancing");
  const troubled = prospects.filter((p) => p.deal_health === "stalling" || p.deal_health === "at_risk");
  const allMeetings = prospects.flatMap((p) => p.meetings);
  const flaggedMeetings = allMeetings.filter(
    (m) => m.triage_verdict === "do_not_take" || m.triage_verdict === "caution"
  );

  const sorted = [...prospects].sort((a, b) => {
    const h = (HEALTH_SORT[a.deal_health] ?? 2) - (HEALTH_SORT[b.deal_health] ?? 2);
    if (h !== 0) return h;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });

  // Coaching signals — plain code, no LLM
  const signals: string[] = [];
  if (flaggedMeetings.length > 0) {
    signals.push(
      `${flaggedMeetings.length} meeting${flaggedMeetings.length === 1 ? "" : "s"} flagged by triage — check reps aren't spending time on bad-fit calls.`
    );
  }
  for (const p of active) {
    if (!p.memory?.next_step && p.meetings.some((m) => m.status === "done")) {
      signals.push(`${p.company_name}: no next step captured after ${p.meetings.filter((m) => m.status === "done").length} call(s) — deal is drifting.`);
    }
  }
  for (const p of active) {
    if ((p.memory?.commitments ?? []).length === 0 && p.meetings.some((m) => m.status === "done")) {
      signals.push(`${p.company_name}: no commitments captured — nobody owes anybody anything, which usually means no momentum.`);
    }
  }
  const coachingSignals = signals.slice(0, 5);

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
        <Link href="/" className="mt-2 shrink-0 text-sm font-medium text-blue-600 hover:underline">
          Rep view →
        </Link>
      </header>

      {loadError && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Couldn&apos;t load pipeline data: {loadError}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className={`text-3xl font-bold ${s.cls}`}>{s.value}</p>
            <p className="mt-1 text-sm text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Deals — at-risk first
        </h2>
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
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="hidden grid-cols-[1.4fr_0.8fr_0.8fr_0.5fr_0.8fr_1.2fr_1.6fr] gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid">
              <span>Company</span>
              <span>Stage</span>
              <span>Health</span>
              <span>Calls</span>
              <span>Last activity</span>
              <span>Next step</span>
              <span>Latest signal</span>
            </div>
            {sorted.map((p) => (
              <details key={p.id} className="group border-b border-slate-100 last:border-b-0">
                <summary className="grid cursor-pointer grid-cols-2 gap-3 px-5 py-4 hover:bg-slate-50 md:grid-cols-[1.4fr_0.8fr_0.8fr_0.5fr_0.8fr_1.2fr_1.6fr] md:items-center [&::-webkit-details-marker]:hidden">
                  <span className="font-semibold text-slate-900">
                    {p.company_name}
                    {p.website && <span className="ml-2 hidden text-xs font-normal text-slate-400 lg:inline">{p.website}</span>}
                  </span>
                  <span className="text-sm capitalize text-slate-600">{p.stage.replace("_", " ")}</span>
                  <span>
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${HEALTH_CHIP[p.deal_health] ?? HEALTH_CHIP.unknown}`}>
                      {p.deal_health.replace("_", " ")}
                    </span>
                  </span>
                  <span className="text-sm text-slate-600">{p.meetings.length}</span>
                  <span className="text-sm text-slate-600">{relativeTime(p.updated_at)}</span>
                  <span className="truncate text-sm text-slate-600" title={p.memory?.next_step ?? undefined}>
                    {p.memory?.next_step ?? <span className="text-slate-400">— none captured</span>}
                  </span>
                  <span className="truncate text-sm text-slate-500 col-span-2 md:col-span-1" title={latestSignalReason(p)}>
                    {latestSignalReason(p)}
                  </span>
                </summary>
                <div className="bg-slate-50 px-5 py-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Meeting timeline</p>
                  <div className="space-y-2">
                    {p.meetings.length === 0 && <p className="text-sm text-slate-500">No meetings recorded.</p>}
                    {[...p.meetings].reverse().map((m) => (
                      <div key={m.id} className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold capitalize">{m.meeting_type}</span>
                          <span className="text-xs text-slate-400">{fmtDate(m.scheduled_at ?? m.created_at)}</span>
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

      {coachingSignals.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Coaching signals</h2>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <ul className="space-y-2">
              {coachingSignals.map((s, i) => (
                <li key={i} className="flex gap-2 text-sm text-amber-900">
                  <span className="shrink-0">→</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
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
