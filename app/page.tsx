"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

type Meeting = {
  id: string;
  meeting_type: string;
  scheduled_at: string | null;
  status: string;
  triage_verdict: string | null;
  triage_reason: string | null;
  brief: Brief | null;
  raw_notes: string | null;
  extracted: { summary?: string; deal_signal?: string } | null;
  created_at: string;
};

type Prospect = {
  id: string;
  company_name: string;
  website: string | null;
  contact_name: string | null;
  contact_role: string | null;
  stage: string;
  deal_health: string;
  memory: Record<string, unknown>;
  updated_at: string;
  meetings: Meeting[];
};

type Brief = {
  headline?: string;
  company_snapshot?: string;
  what_we_know?: string[];
  last_meeting_recap?: string;
  open_threads?: string[];
  likely_objections?: string[];
  talk_track?: string[];
  questions_to_ask?: string[];
  watch_out?: string;
  ai_unavailable?: boolean;
};

const LOADING_MESSAGES = ["Checking their site…", "Reading past meetings…", "Writing your brief…"];
const MEETING_TYPES = [
  { key: "discovery", label: "Discovery", hint: "First call — qualify them" },
  { key: "demo", label: "Demo", hint: "Show how Gushwork helps" },
  { key: "closing", label: "Closing", hint: "Pricing & next steps" },
];

const HEALTH_DOT: Record<string, string> = {
  advancing: "bg-emerald-500",
  stalling: "bg-amber-500",
  at_risk: "bg-red-500",
  unknown: "bg-slate-300",
};

const SIGNAL_BADGE: Record<string, string> = {
  advancing: "bg-emerald-100 text-emerald-800",
  stalling: "bg-amber-100 text-amber-800",
  at_risk: "bg-red-100 text-red-800",
};

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

function BriefSection({ title, items, text }: { title: string; items?: string[]; text?: string }) {
  const hasItems = items && items.length > 0;
  if (!hasItems && !text?.trim()) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      {text?.trim() && <p className="text-sm leading-relaxed text-slate-800">{text}</p>}
      {hasItems && (
        <ul className="space-y-1.5">
          {items!.map((it, i) => (
            <li key={i} className="flex gap-2 text-sm leading-relaxed text-slate-800">
              <span className="mt-0.5 shrink-0 text-slate-400">•</span>
              <span>{it}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BriefView({ brief }: { brief: Brief }) {
  return (
    <div className="space-y-3">
      {brief.ai_unavailable && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          AI briefly rate-limited — showing what we know. Try again in a minute for a full brief.
        </div>
      )}
      {brief.headline && (
        <div className="rounded-xl bg-slate-900 p-4 text-white">
          <p className="text-base font-semibold leading-snug">{brief.headline}</p>
        </div>
      )}
      <BriefSection title="Company snapshot" text={brief.company_snapshot} />
      <BriefSection title="What we know" items={brief.what_we_know} />
      <BriefSection title="Last meeting recap" text={brief.last_meeting_recap} />
      <BriefSection title="Open threads" items={brief.open_threads} />
      <BriefSection title="Likely objections" items={brief.likely_objections} />
      <BriefSection title="Talk track" items={brief.talk_track} />
      <BriefSection title="Questions to ask" items={brief.questions_to_ask} />
      {brief.watch_out?.trim() && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-red-600">Watch out</h3>
          <p className="text-sm text-red-900">{brief.watch_out}</p>
        </div>
      )}
    </div>
  );
}

export default function RepView() {
  const [company, setCompany] = useState("");
  const [website, setWebsite] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactRole, setContactRole] = useState("");
  const [meetingType, setMeetingType] = useState("discovery");

  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState(LOADING_MESSAGES[0]);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const [triage, setTriage] = useState<{ verdict: string; reason: string } | null>(null);
  const [blockedMeetingId, setBlockedMeetingId] = useState<string | null>(null);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [briefCompany, setBriefCompany] = useState("");
  const [activeMeetingId, setActiveMeetingId] = useState<string | null>(null);

  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesResult, setNotesResult] = useState<{ summary: string; signal?: string; aiDown?: boolean } | null>(null);

  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [listLoaded, setListLoaded] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const resultRef = useRef<HTMLDivElement>(null);

  const loadProspects = useCallback(async () => {
    try {
      const res = await fetch("/api/prospects");
      const data = await res.json();
      if (res.ok) setProspects(data.prospects ?? []);
    } catch {
      // list is non-critical; leave as-is
    } finally {
      setListLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadProspects();
  }, [loadProspects]);

  useEffect(() => {
    if (!loading) return;
    let i = 0;
    setLoadingMsg(LOADING_MESSAGES[0]);
    const t = setInterval(() => {
      i = (i + 1) % LOADING_MESSAGES.length;
      setLoadingMsg(LOADING_MESSAGES[i]);
    }, 2500);
    return () => clearInterval(t);
  }, [loading]);

  async function generateBrief(meetingId: string, companyName: string) {
    const res = await fetch("/api/brief", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meeting_id: meetingId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Brief generation failed");
    setBrief(data.brief);
    setBriefCompany(companyName);
    setActiveMeetingId(meetingId);
    setWarnings((w) => [...w, ...(data.warnings ?? [])]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!company.trim() || loading) return;
    setLoading(true);
    setError(null);
    setWarnings([]);
    setTriage(null);
    setBrief(null);
    setNotes("");
    setNotesResult(null);
    setBlockedMeetingId(null);
    try {
      const res = await fetch("/api/prospects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: company.trim(),
          website: website.trim() || undefined,
          contact_name: contactName.trim() || undefined,
          contact_role: contactRole.trim() || undefined,
          meeting_type: meetingType,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create the meeting");
      setWarnings(data.warnings ?? []);
      const meeting = data.meeting;
      if (meeting.triage_verdict) {
        setTriage({ verdict: meeting.triage_verdict, reason: meeting.triage_reason });
      }
      if (meeting.triage_verdict === "do_not_take") {
        setBlockedMeetingId(meeting.id);
        setBriefCompany(data.prospect.company_name);
      } else {
        await generateBrief(meeting.id, data.prospect.company_name);
      }
      loadProspects();
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleBriefAnyway() {
    if (!blockedMeetingId || loading) return;
    setLoading(true);
    setError(null);
    try {
      await generateBrief(blockedMeetingId, briefCompany);
      setBlockedMeetingId(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveNotes() {
    if (!activeMeetingId || !notes.trim() || savingNotes) return;
    setSavingNotes(true);
    setError(null);
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meeting_id: activeMeetingId, raw_notes: notes.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save notes");
      if (data.ai_unavailable) {
        setNotesResult({
          summary: "Notes saved. AI briefly rate-limited — memory will catch up when you save again.",
          aiDown: true,
        });
      } else {
        setNotesResult({ summary: data.extracted?.summary ?? "Notes processed.", signal: data.extracted?.deal_signal });
      }
      loadProspects();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingNotes(false);
    }
  }

  function reopenBrief(m: Meeting, p: Prospect) {
    if (!m.brief) return;
    setBrief(m.brief);
    setBriefCompany(p.company_name);
    setActiveMeetingId(m.id);
    setTriage(m.triage_verdict ? { verdict: m.triage_verdict, reason: m.triage_reason ?? "" } : null);
    setBlockedMeetingId(null);
    setNotes(m.raw_notes ?? "");
    setNotesResult(null);
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  }

  function addNotesToLatest(p: Prospect) {
    const latest = p.meetings[0];
    if (!latest) return;
    setBrief(latest.brief);
    setBriefCompany(p.company_name);
    setActiveMeetingId(latest.id);
    setTriage(null);
    setBlockedMeetingId(null);
    setNotes(latest.raw_notes ?? "");
    setNotesResult(null);
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  }

  const inputCls =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none";

  return (
    <main className="mx-auto max-w-xl px-4 pb-24 pt-6">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Meeting Intelligence</h1>
          <p className="mt-1 text-sm text-slate-500">Briefs before the call. Memory after.</p>
        </div>
        <Link href="/manager" className="mt-1 shrink-0 text-sm font-medium text-blue-600 hover:underline">
          Manager view →
        </Link>
      </header>

      {/* Primary card: prep a brief */}
      <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-base font-semibold">Who are you meeting?</h2>
        <div className="space-y-3">
          <input
            className={inputCls}
            placeholder="Company name (e.g. Elgi Equipments)"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            required
          />
          <input
            className={inputCls}
            placeholder="Website — optional (e.g. elgi.com)"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              className={inputCls}
              placeholder="Contact (e.g. Arjun Nair)"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
            />
            <input
              className={inputCls}
              placeholder="Role (e.g. GM Marketing)"
              value={contactRole}
              onChange={(e) => setContactRole(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-3 gap-2 pt-1">
            {MEETING_TYPES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setMeetingType(t.key)}
                className={`rounded-xl border-2 px-2 py-3 text-center transition ${
                  meetingType === t.key
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
                }`}
              >
                <span className="block text-sm font-semibold">{t.label}</span>
                <span className={`mt-0.5 block text-[11px] leading-tight ${meetingType === t.key ? "text-slate-300" : "text-slate-400"}`}>
                  {t.hint}
                </span>
              </button>
            ))}
          </div>
          <button
            type="submit"
            disabled={loading || !company.trim()}
            className="w-full rounded-xl bg-blue-600 py-3.5 text-base font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? loadingMsg : "Prep my brief"}
          </button>
        </div>
      </form>

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-medium">Something went wrong</p>
          <p className="mt-1">{error}</p>
        </div>
      )}

      {/* Triage + brief + notes */}
      <div ref={resultRef} className="scroll-mt-4">
        {triage?.verdict === "do_not_take" && blockedMeetingId && (
          <div className="mt-4 rounded-xl border border-red-300 bg-red-50 p-4">
            <p className="font-semibold text-red-800">⛔ Skip this meeting — {triage.reason}</p>
            <button onClick={handleBriefAnyway} disabled={loading} className="mt-2 text-sm font-medium text-red-700 underline">
              {loading ? loadingMsg : "Generate brief anyway"}
            </button>
          </div>
        )}
        {triage?.verdict === "caution" && (
          <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
            <p className="font-semibold text-amber-800">⚠️ Caution — {triage.reason}</p>
          </div>
        )}
        {warnings.some((w) => w.includes("site")) && brief && (
          <p className="mt-3 text-xs text-slate-400">Note: couldn&apos;t read their site — brief built from memory and your inputs.</p>
        )}

        {brief && (
          <section className="mt-4">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Your brief · {briefCompany}
            </h2>
            <BriefView brief={brief} />
          </section>
        )}

        {activeMeetingId && (
          <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold">After the call</h2>
            <textarea
              className={`${inputCls} mt-3 min-h-28`}
              placeholder="After the call, paste your notes here — shorthand is fine."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <button
              onClick={handleSaveNotes}
              disabled={savingNotes || !notes.trim()}
              className="mt-3 w-full rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50"
            >
              {savingNotes ? "Updating memory…" : "Save notes"}
            </button>
            {notesResult && (
              <div className={`mt-3 rounded-xl p-4 ${notesResult.aiDown ? "bg-amber-50" : "bg-emerald-50"}`}>
                <div className="flex items-center gap-2">
                  <p className={`font-semibold ${notesResult.aiDown ? "text-amber-800" : "text-emerald-800"}`}>
                    ✓ {notesResult.aiDown ? "Notes saved" : "Memory updated"}
                  </p>
                  {notesResult.signal && (
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SIGNAL_BADGE[notesResult.signal] ?? "bg-slate-100 text-slate-700"}`}>
                      {notesResult.signal.replace("_", " ")}
                    </span>
                  )}
                </div>
                <p className={`mt-1 text-sm ${notesResult.aiDown ? "text-amber-800" : "text-emerald-900"}`}>{notesResult.summary}</p>
              </div>
            )}
          </section>
        )}
      </div>

      {/* Prospect list */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Your pipeline</h2>
        {!listLoaded ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : prospects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5">
            <p className="text-sm font-medium text-slate-700">No prospects yet — here&apos;s what it looks like:</p>
            <div className="mt-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
              <p><span className="font-semibold text-slate-700">Elgi Equipments</span> · elgi.com</p>
              <p className="mt-0.5">Arjun Nair, GM Marketing · Discovery call</p>
              <p className="mt-2 text-xs">
                Type a company above, pick the meeting type, and hit &ldquo;Prep my brief&rdquo;. After the call, paste your
                notes and the system remembers everything for meeting #2.
              </p>
            </div>
          </div>
        ) : (
          <ul className="space-y-2">
            {prospects.map((p) => (
              <li key={p.id} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <button
                  className="flex w-full items-center gap-3 p-4 text-left"
                  onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                >
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${HEALTH_DOT[p.deal_health] ?? HEALTH_DOT.unknown}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{p.company_name}</span>
                    <span className="block text-xs text-slate-400">
                      {p.meetings.length} meeting{p.meetings.length === 1 ? "" : "s"} · last activity {relativeTime(p.updated_at)}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium capitalize text-slate-600">
                    {p.stage.replace("_", " ")}
                  </span>
                  <span className="text-slate-300">{expanded === p.id ? "▾" : "▸"}</span>
                </button>
                {expanded === p.id && (
                  <div className="border-t border-slate-100 px-4 pb-4">
                    {p.meetings.map((m) => (
                      <div key={m.id} className="mt-3 rounded-xl bg-slate-50 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium capitalize">
                            {m.meeting_type} · <span className="font-normal text-slate-500">{relativeTime(m.scheduled_at ?? m.created_at)}</span>
                          </p>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              m.triage_verdict === "do_not_take"
                                ? "bg-red-100 text-red-700"
                                : m.triage_verdict === "caution"
                                ? "bg-amber-100 text-amber-700"
                                : m.status === "done"
                                ? "bg-slate-200 text-slate-600"
                                : "bg-blue-100 text-blue-700"
                            }`}
                          >
                            {m.triage_verdict === "do_not_take" ? "⛔ flagged" : m.triage_verdict === "caution" ? "⚠ caution" : m.status}
                          </span>
                        </div>
                        {m.extracted?.summary && <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{m.extracted.summary}</p>}
                        <div className="mt-2 flex gap-3">
                          {m.brief && (
                            <button onClick={() => reopenBrief(m, p)} className="text-xs font-medium text-blue-600 hover:underline">
                              Open brief
                            </button>
                          )}
                          {m.id === p.meetings[0]?.id && (
                            <button onClick={() => addNotesToLatest(p)} className="text-xs font-medium text-blue-600 hover:underline">
                              {m.raw_notes ? "Edit notes" : "Add notes"}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
