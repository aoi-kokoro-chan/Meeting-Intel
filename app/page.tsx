"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import ViewSegment from "./view-segment";
import ArchiveButton from "./archive-button";
import DeleteButton from "./delete-button";
import { DEFAULT_REP, REP_COOKIE, PERSONA_COOKIE, repColor, repInitial } from "@/lib/reps";

function getCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; SameSite=Lax`;
}

// Registers a new rep so the roster includes them before they own any data.
// Returns the canonical name ("kiran" reuses an existing "Kiran"), "" to abort,
// or falls back to the typed name if the API is unreachable.
async function registerRepName(raw: string): Promise<string> {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    const res = await fetch("/api/reps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    const data = await res.json();
    if (res.ok && data.name) return data.name;
    if (data.error) {
      window.alert(data.error);
      return "";
    }
  } catch {
    // network hiccup — proceed with the typed name; the roster union keeps it
  }
  return trimmed;
}

function RepAvatar({ name, size = "h-7 w-7 text-xs" }: { name: string; size?: string }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white ${size} ${repColor(name)}`}>
      {repInitial(name)}
    </span>
  );
}

function RepSwitcher({ rep, roster, onSwitch }: { rep: string; roster: string[]; onSwitch: (r: string) => void }) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const names = roster.includes(rep) ? roster : [rep, ...roster];

  function close() {
    setOpen(false);
    setAdding(false);
    setNewName("");
  }

  return (
    <div className="relative">
      <button
        onClick={() => (open ? close() : setOpen(true))}
        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm hover:border-slate-400"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <RepAvatar name={rep} />
        <span className="text-left">
          <span className="block text-sm font-semibold leading-tight">{rep}</span>
          <span className="block text-[11px] leading-tight text-slate-400">Your deals</span>
        </span>
        <span className="text-xs text-slate-400">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={close} />
          <div className="absolute right-0 z-20 mt-1 w-48 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
            {names.map((r) => (
              <button
                key={r}
                onClick={() => {
                  close();
                  if (r !== rep) onSwitch(r);
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-50 ${r === rep ? "font-semibold" : ""}`}
              >
                <RepAvatar name={r} size="h-6 w-6 text-[11px]" />
                <span className="flex-1">{r}</span>
                {r === rep && <span className="text-slate-400">✓</span>}
              </button>
            ))}
            <div className="my-1 border-t border-slate-100" />
            {adding ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const name = await registerRepName(newName);
                  if (!name) return;
                  close();
                  if (name !== rep) onSwitch(name);
                }}
                className="flex gap-1 p-1"
              >
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Your name"
                  className="w-full min-w-0 rounded-lg border border-slate-300 px-2 py-1 text-sm focus:border-slate-900 focus:outline-none"
                />
                <button type="submit" className="shrink-0 rounded-lg bg-slate-900 px-2 py-1 text-xs font-semibold text-white">
                  Go
                </button>
              </form>
            ) : (
              <button
                onClick={() => setAdding(true)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-slate-500 hover:bg-slate-50"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-dashed border-slate-400 text-[11px] font-bold text-slate-400">
                  +
                </span>
                Add new rep
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function PersonaGate({
  roster,
  repExpanded,
  onPickRep,
}: {
  roster: string[] | null;
  repExpanded: boolean;
  onPickRep: (name: string) => void;
}) {
  const router = useRouter();
  const [showReps, setShowReps] = useState(repExpanded);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  function pickManager() {
    setCookie(PERSONA_COOKIE, "manager");
    router.push("/manager");
  }

  function pickRep(name: string) {
    const n = name.trim();
    if (!n) return;
    setCookie(PERSONA_COOKIE, "rep");
    setCookie(REP_COOKIE, n);
    onPickRep(n);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        <h1 className="text-center text-3xl font-bold tracking-tight">Meeting Intelligence</h1>
        <p className="mt-2 text-center text-slate-500">
          Briefs before the call. Memory after. One brain across the team.
        </p>
        <div className="mt-8 space-y-3">
          <button
            onClick={() => setShowReps(true)}
            className={`w-full rounded-2xl border-2 bg-white p-5 text-left shadow-sm transition ${
              showReps ? "border-slate-900" : "border-slate-200 hover:border-slate-400"
            }`}
          >
            <p className="text-lg font-bold">I&apos;m a Sales Rep</p>
            <p className="mt-1 text-sm text-slate-500">Get a brief before your call, drop notes after.</p>
          </button>
          {showReps && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold">Who are you?</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {roster === null ? (
                  <span className="text-sm text-slate-400">Loading team…</span>
                ) : (
                  roster.map((r) => (
                    <button
                      key={r}
                      onClick={() => pickRep(r)}
                      className="flex items-center gap-2 rounded-full border border-slate-300 bg-white py-1.5 pl-1.5 pr-3.5 text-sm font-medium hover:border-slate-900"
                    >
                      <RepAvatar name={r} size="h-6 w-6 text-[11px]" />
                      {r}
                    </button>
                  ))
                )}
                {!adding && (
                  <button
                    onClick={() => setAdding(true)}
                    className="rounded-full border border-dashed border-slate-400 px-3.5 py-1.5 text-sm font-medium text-slate-500 hover:border-slate-900 hover:text-slate-900"
                  >
                    + I&apos;m new
                  </button>
                )}
              </div>
              {adding && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const name = await registerRepName(newName);
                    if (name) pickRep(name);
                  }}
                  className="mt-3 flex gap-2"
                >
                  <input
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Your name"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!newName.trim()}
                    className="shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Continue
                  </button>
                </form>
              )}
            </div>
          )}
          <button
            onClick={pickManager}
            className="w-full rounded-2xl border-2 border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-slate-400"
          >
            <p className="text-lg font-bold">I&apos;m a Sales Manager</p>
            <p className="mt-1 text-sm text-slate-500">See every deal across all reps.</p>
          </button>
        </div>
      </div>
    </main>
  );
}

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
  open_loops?: string[];
  open_threads?: string[];
  likely_objections?: string[];
  talk_track?: string[];
  questions_to_ask?: string[];
  watch_out?: string;
  intel_from?: string[];
  readiness_gaps?: string[];
  verbatim_phrases?: string[];
  cold_start?: boolean;
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

const CLOSED_STAGES = ["closed_won", "disqualified", "closed_lost"];

// Same activity notion as the manager view: latest of notes saved / meeting
// completed / meeting created / reassignment.
function lastTrackedAt(p: Prospect): number {
  const now = Date.now();
  const times = [new Date(p.updated_at).getTime()];
  for (const m of p.meetings) {
    times.push(new Date(m.created_at).getTime());
    if (m.status === "done" && m.scheduled_at) {
      const t = new Date(m.scheduled_at).getTime();
      if (t <= now) times.push(t);
    }
  }
  const log = (p.memory as { ownership_log?: { at: string }[] })?.ownership_log ?? [];
  for (const t of log) times.push(new Date(t.at).getTime());
  return Math.max(...times.filter((t) => !Number.isNaN(t)));
}

// Soonest upcoming meeting time, or null if none.
function nextUpcomingAt(p: Prospect): number | null {
  const times = p.meetings
    .filter((m) => m.status === "upcoming")
    .map((m) => new Date(m.scheduled_at ?? m.created_at).getTime())
    .filter((t) => !Number.isNaN(t));
  return times.length ? Math.min(...times) : null;
}

function hasMeetingToday(p: Prospect): boolean {
  const today = new Date().toDateString();
  return p.meetings.some(
    (m) => m.status === "upcoming" && m.scheduled_at && new Date(m.scheduled_at).toDateString() === today
  );
}

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

const PANEL_SECTIONS = [
  { id: "snapshot", label: "Snapshot" },
  { id: "loops", label: "Open loops" },
  { id: "know", label: "What we know" },
  { id: "last", label: "Last time" },
  { id: "objections", label: "Objections" },
  { id: "talk", label: "Talk track" },
  { id: "questions", label: "Questions" },
  { id: "watch", label: "Watch out" },
];

function BriefPanel({
  meeting,
  company,
  onClose,
  initialSection,
}: {
  meeting: Meeting;
  company: string;
  onClose: () => void;
  initialSection?: string;
}) {
  const [highlight, setHighlight] = useState<string | null>(null);
  const panelScrollRef = useRef<HTMLDivElement>(null);
  const brief = meeting.brief;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const scrollToSection = useCallback((id: string) => {
    const el = document.getElementById(`brief-sec-${id}`);
    const container = panelScrollRef.current;
    if (!el || !container) return;
    // scrollIntoView({behavior:"smooth"}) is unreliable while body scroll is
    // locked, so scroll the panel's own container directly.
    const top = Math.max(0, container.scrollTop + el.getBoundingClientRect().top - container.getBoundingClientRect().top - 48);
    container.scrollTo({ top, behavior: "smooth" });
    // Some environments silently drop smooth programmatic scrolls — jump if so.
    setTimeout(() => {
      if (Math.abs(container.scrollTop - top) > 4) container.scrollTo({ top });
    }, 350);
  }, []);

  useEffect(() => {
    if (!initialSection) return;
    const t = setTimeout(() => {
      scrollToSection(initialSection);
      setHighlight(initialSection);
      setTimeout(() => setHighlight(null), 1600);
    }, 150);
    return () => clearTimeout(t);
  }, [initialSection, scrollToSection]);

  if (!brief) return null;

  const hasContent: Record<string, boolean> = {
    snapshot: Boolean(brief.headline?.trim() || brief.company_snapshot?.trim()),
    loops: (brief.open_loops?.length ?? 0) > 0,
    know: (brief.what_we_know?.length ?? 0) > 0 || (brief.verbatim_phrases?.length ?? 0) > 0,
    last: Boolean(brief.last_meeting_recap?.trim()),
    objections: (brief.likely_objections?.length ?? 0) > 0,
    talk: (brief.talk_track?.length ?? 0) > 0,
    questions: (brief.questions_to_ask?.length ?? 0) > 0,
    watch: Boolean(brief.watch_out?.trim()),
  };

  const wrap = (id: string, node: React.ReactNode) => (
    <div
      id={`brief-sec-${id}`}
      className={`scroll-mt-14 rounded-xl transition-shadow duration-500 ${highlight === id ? "ring-2 ring-blue-400" : ""}`}
    >
      {node}
    </div>
  );

  const dateStr = new Date(meeting.scheduled_at ?? meeting.created_at).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="absolute right-0 top-0 flex h-full w-full flex-col bg-slate-50 shadow-2xl sm:w-[480px]">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              <span className="capitalize">{meeting.meeting_type}</span> brief · {company}
            </p>
            <p className="text-xs text-slate-400">{dateStr}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close brief"
            className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            ✕
          </button>
        </div>
        <div ref={panelScrollRef} className="flex-1 overflow-y-auto">
          <div className="sticky top-0 z-10 flex gap-1.5 overflow-x-auto border-b border-slate-200 bg-slate-50/95 px-4 py-2 backdrop-blur">
            {PANEL_SECTIONS.filter((s) => hasContent[s.id]).map((s) => (
              <button
                key={s.id}
                onClick={() => scrollToSection(s.id)}
                className="shrink-0 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:border-slate-500 hover:text-slate-900"
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="space-y-3 p-4">
            {brief.ai_unavailable && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                AI briefly rate-limited when this brief was generated — it shows what we knew at the time.
              </div>
            )}
            {brief.cold_start && (
              <div className="rounded-xl border border-slate-300 bg-slate-100 p-3 text-sm text-slate-600">
                No prior calls and we couldn&apos;t read their site — this brief is starting cold. It will get sharper
                after your first call notes.
              </div>
            )}
            {(brief.readiness_gaps?.length ?? 0) > 0 && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
                <h3 className="mb-1.5 text-sm font-bold text-amber-800">Ready to close?</h3>
                <ul className="space-y-1">
                  {brief.readiness_gaps!.map((g, i) => (
                    <li key={i} className="flex gap-2 text-sm text-amber-900">
                      <span className="shrink-0">•</span>
                      <span>{g}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(brief.intel_from?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {brief.intel_from!.map((r) => (
                  <span key={r} className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-800">
                    <RepAvatar name={r} size="h-4 w-4 text-[9px]" />
                    Includes intel from {r}&apos;s earlier calls
                  </span>
                ))}
              </div>
            )}
            {hasContent.snapshot &&
              wrap(
                "snapshot",
                <div className="space-y-3">
                  {brief.headline && (
                    <div className="rounded-xl bg-slate-900 p-4 text-white">
                      <p className="text-base font-semibold leading-snug">{brief.headline}</p>
                    </div>
                  )}
                  <BriefSection title="Company snapshot" text={brief.company_snapshot} />
                </div>
              )}
            {hasContent.loops &&
              wrap(
                "loops",
                <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-orange-700">Open loops</h3>
                  <ul className="space-y-1.5">
                    {brief.open_loops!.map((l, i) => (
                      <li key={i} className="flex gap-2 text-sm leading-relaxed text-orange-900">
                        <span className="mt-0.5 shrink-0">↻</span>
                        <span>{l}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            {hasContent.know &&
              wrap(
                "know",
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">What we know</h3>
                  {(brief.what_we_know?.length ?? 0) > 0 && (
                    <ul className="space-y-1.5">
                      {brief.what_we_know!.map((it, i) => (
                        <li key={i} className="flex gap-2 text-sm leading-relaxed text-slate-800">
                          <span className="mt-0.5 shrink-0 text-slate-400">•</span>
                          <span>{it}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {(brief.verbatim_phrases?.length ?? 0) > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {brief.verbatim_phrases!.map((v, i) => (
                        <span key={i} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs italic text-slate-600">
                          &ldquo;{v}&rdquo;
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            {hasContent.last && wrap("last", <BriefSection title="Last meeting recap" text={brief.last_meeting_recap} />)}
            {(brief.open_threads?.length ?? 0) > 0 && wrap("threads", <BriefSection title="Open threads" items={brief.open_threads} />)}
            {hasContent.objections && wrap("objections", <BriefSection title="Likely objections" items={brief.likely_objections} />)}
            {hasContent.talk && wrap("talk", <BriefSection title="Talk track" items={brief.talk_track} />)}
            {hasContent.questions && wrap("questions", <BriefSection title="Questions to ask" items={brief.questions_to_ask} />)}
            {hasContent.watch &&
              wrap(
                "watch",
                <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-red-600">Watch out</h3>
                  <p className="text-sm text-red-900">{brief.watch_out}</p>
                </div>
              )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RepView() {
  const router = useRouter();
  const [boot, setBoot] = useState<"loading" | "gate" | "app">("loading");
  const [gateRepExpanded, setGateRepExpanded] = useState(false);
  const [roster, setRoster] = useState<string[] | null>(null);
  const [rep, setRep] = useState(DEFAULT_REP);
  const [ownerNotice, setOwnerNotice] = useState<string | null>(null);
  const [company, setCompany] = useState("");
  const [companyError, setCompanyError] = useState<string | null>(null);
  const [website, setWebsite] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactRole, setContactRole] = useState("");
  const [meetingType, setMeetingType] = useState("discovery");

  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState(LOADING_MESSAGES[0]);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const [triage, setTriage] = useState<{ verdict: string; reason: string } | null>(null);
  const [blockedMeeting, setBlockedMeeting] = useState<Meeting | null>(null);
  const [currentMeeting, setCurrentMeeting] = useState<Meeting | null>(null);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [briefCompany, setBriefCompany] = useState("");
  const [inferredSite, setInferredSite] = useState<string | null>(null);
  const [activeMeetingId, setActiveMeetingId] = useState<string | null>(null);
  const [panel, setPanel] = useState<{ meeting: Meeting; company: string; section?: string } | null>(null);

  const [lookup, setLookup] = useState<{
    company_name: string;
    owner_rep: string | null;
    stage: string;
    next_step: string | null;
    last_meeting: { type: string; rep: string | null; days_ago: number | null } | null;
  } | null>(null);

  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesResult, setNotesResult] = useState<{ summary: string; signal?: string; aiDown?: boolean } | null>(null);
  const [stagePrompt, setStagePrompt] = useState<{ prospectId: string; suggested: string; current: string } | null>(null);

  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [listLoaded, setListLoaded] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pipelineSearch, setPipelineSearch] = useState("");
  const [pipelineScope, setPipelineScope] = useState<"active" | "all">("active");

  const resultRef = useRef<HTMLDivElement>(null);
  const companyRef = useRef<HTMLInputElement>(null);

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
    // First-visit gate: no persona cookie → welcome screen; manager → redirect.
    const persona = getCookie(PERSONA_COOKIE);
    const repCookie = getCookie(REP_COOKIE);
    if (persona === "manager") {
      router.replace("/manager");
      return;
    }
    if (persona === "rep" && repCookie) {
      setRep(repCookie);
      setBoot("app");
      loadProspects();
    } else {
      setGateRepExpanded(persona === "rep");
      setBoot("gate");
    }
    // Roster loads after first paint — never blocks the gate rendering.
    fetch("/api/reps")
      .then((r) => r.json())
      .then((d) => setRoster(d.reps ?? []))
      .catch(() => setRoster([]));
  }, [loadProspects, router]);

  function enterAsRep(name: string) {
    setRep(name);
    setBoot("app");
    loadProspects();
  }

  // Debounced existing-prospect check while typing (exact name/domain match
  // only). The query is committed as ONE snapshot object per debounce tick so
  // name and website can never come from different submissions.
  useEffect(() => {
    if (boot !== "app") return;
    const query = { name: company.trim(), website: website.trim() };
    if (query.name.length < 3 && !query.website) {
      setLookup(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (query.name.length >= 3) params.set("name", query.name);
        if (query.website) params.set("website", query.website);
        const res = await fetch(`/api/prospects/lookup?${params}`);
        const data = await res.json();
        setLookup(res.ok ? data.match : null);
      } catch {
        setLookup(null);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [company, website, boot]);

  function switchRep(next: string) {
    setCookie(REP_COOKIE, next);
    setCookie(PERSONA_COOKIE, "rep");
    setRep(next);
    // Clear rep-specific transient state and reload scoped data.
    setBrief(null);
    setTriage(null);
    setBlockedMeeting(null);
    setCurrentMeeting(null);
    setActiveMeetingId(null);
    setNotes("");
    setNotesResult(null);
    setStagePrompt(null);
    setOwnerNotice(null);
    setInferredSite(null);
    setWarnings([]);
    setError(null);
    setPanel(null);
    setLookup(null);
    setExpanded(null);
    setListLoaded(false);
    setProspects([]);
    loadProspects();
  }

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

  async function generateBrief(meeting: Meeting, companyName: string) {
    const res = await fetch("/api/brief", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meeting_id: meeting.id }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Brief generation failed");
    const withBrief: Meeting = { ...meeting, brief: data.brief };
    setBrief(data.brief);
    setBriefCompany(companyName);
    setActiveMeetingId(meeting.id);
    setCurrentMeeting(withBrief);
    setPanel({ meeting: withBrief, company: companyName });
    setWarnings((w) => [...w, ...(data.warnings ?? [])]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    if (!company.trim()) {
      setCompanyError("Company name is required");
      companyRef.current?.focus();
      return;
    }
    setCompanyError(null);
    setLoading(true);
    setError(null);
    setWarnings([]);
    setTriage(null);
    setBrief(null);
    setNotes("");
    setNotesResult(null);
    setStagePrompt(null);
    setBlockedMeeting(null);
    setCurrentMeeting(null);
    setInferredSite(null);
    setOwnerNotice(null);
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
      if (data.website_inferred && data.prospect?.website) setInferredSite(data.prospect.website);
      if (data.account_owner && data.account_owner !== rep) setOwnerNotice(data.account_owner);
      const meeting = data.meeting;
      if (meeting.triage_verdict) {
        setTriage({ verdict: meeting.triage_verdict, reason: meeting.triage_reason });
      }
      if (meeting.triage_verdict === "do_not_take") {
        setBlockedMeeting(meeting);
        setBriefCompany(data.prospect.company_name);
      } else {
        await generateBrief(meeting, data.prospect.company_name);
      }
      loadProspects();
      // Reset the entire form so nothing leaks into the next prospect.
      setCompany("");
      setWebsite("");
      setContactName("");
      setContactRole("");
      setMeetingType("discovery");
      setLookup(null);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleBriefAnyway() {
    if (!blockedMeeting || loading) return;
    setLoading(true);
    setError(null);
    try {
      await generateBrief(blockedMeeting, briefCompany);
      setBlockedMeeting(null);
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
        const suggested = data.extracted?.stage_suggestion;
        if (suggested && data.prospect && suggested !== data.prospect.stage) {
          setStagePrompt({ prospectId: data.prospect.id, suggested, current: data.prospect.stage });
        } else {
          setStagePrompt(null);
        }
      }
      loadProspects();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingNotes(false);
    }
  }

  function reopenBrief(m: Meeting, p: Prospect, section?: string) {
    if (!m.brief) return;
    setPanel({ meeting: m, company: p.company_name, section });
  }

  function addNotesToLatest(p: Prospect) {
    const latest = p.meetings[0];
    if (!latest) return;
    setBrief(latest.brief);
    setBriefCompany(p.company_name);
    setActiveMeetingId(latest.id);
    setCurrentMeeting(latest);
    setTriage(null);
    setBlockedMeeting(null);
    setNotes(latest.raw_notes ?? "");
    setNotesResult(null);
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  }

  const inputCls =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none";

  // Findability, not filters: scope toggle + (for long lists) search, with
  // upcoming meetings first, then recent activity, closed deals always last.
  const pipelineList = prospects
    .filter((p) => (pipelineScope === "all" ? true : !CLOSED_STAGES.includes(p.stage)))
    .filter((p) =>
      pipelineSearch.trim() ? p.company_name.toLowerCase().includes(pipelineSearch.trim().toLowerCase()) : true
    )
    .sort((a, b) => {
      const rank = (p: Prospect) =>
        CLOSED_STAGES.includes(p.stage) ? 2 : nextUpcomingAt(p) !== null ? 0 : 1;
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      if (ra === 0) return (nextUpcomingAt(a) ?? 0) - (nextUpcomingAt(b) ?? 0); // soonest first
      return lastTrackedAt(b) - lastTrackedAt(a);
    });

  if (boot === "loading") return null;
  if (boot === "gate") {
    return <PersonaGate roster={roster} repExpanded={gateRepExpanded} onPickRep={enterAsRep} />;
  }

  return (
    <main className="mx-auto max-w-xl px-4 pb-24 pt-6">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Meeting Intelligence</h1>
          <p className="mt-1 text-sm text-slate-500">Briefs before the call. Memory after.</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <ViewSegment active="rep" />
          <RepSwitcher rep={rep} roster={roster ?? []} onSwitch={switchRep} />
        </div>
      </header>

      {/* Primary card: prep a brief */}
      <form onSubmit={handleSubmit} noValidate className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-base font-semibold">Who are you meeting?</h2>
        <div className="space-y-3">
          <div>
            <label htmlFor="company-name" className="mb-1 block text-sm font-medium text-slate-700">
              Company name<span className="ml-0.5 text-red-500">*</span>
            </label>
            <input
              id="company-name"
              ref={companyRef}
              className={`${inputCls} ${companyError ? "border-red-400" : ""}`}
              placeholder="e.g. Elgi Equipments"
              value={company}
              onChange={(e) => {
                setCompany(e.target.value);
                if (companyError && e.target.value.trim()) setCompanyError(null);
              }}
              required
              aria-invalid={Boolean(companyError)}
            />
            {companyError && <p className="mt-1 text-xs text-red-600">{companyError}</p>}
            {lookup && (
              <div className="mt-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                <p>
                  <span className="font-semibold">{lookup.company_name} is already in the system</span>
                  {lookup.last_meeting && (
                    <>
                      {" — "}
                      {lookup.owner_rep ?? "someone"} ran a {lookup.last_meeting.type} call
                      {lookup.last_meeting.days_ago != null &&
                        ` ${lookup.last_meeting.days_ago === 0 ? "today" : `${lookup.last_meeting.days_ago} day${lookup.last_meeting.days_ago === 1 ? "" : "s"} ago`}`}
                    </>
                  )}
                  . Deal stage: <span className="capitalize">{lookup.stage.replace("_", " ")}</span>. Your brief will
                  include everything we learned.
                </p>
                {lookup.next_step && <p className="mt-1 text-xs text-blue-700">Next step on file: {lookup.next_step}</p>}
              </div>
            )}
          </div>
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
            disabled={loading}
            className="w-full rounded-xl bg-blue-600 py-3.5 text-base font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? loadingMsg : "Prep my brief"}
          </button>
          <p className="mt-1 text-center text-xs text-slate-400">
            Briefs assume the call is happening now — prep is timestamped when you hit the button.
          </p>
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
        {ownerNotice && (
          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
            <span className="font-semibold">This account is owned by {ownerNotice}</span> — your meeting was added to
            the company&apos;s shared memory, and it stays on {ownerNotice}&apos;s pipeline.
          </div>
        )}
        {triage?.verdict === "do_not_take" && blockedMeeting && (
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
          <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">Your brief · {briefCompany}</p>
                {inferredSite && (
                  <p className="truncate text-xs text-slate-400">
                    {inferredSite} <span className="italic">(auto-detected — correct it above if wrong)</span>
                  </p>
                )}
                {brief.ai_unavailable && (
                  <p className="text-xs text-amber-700">AI briefly rate-limited — showing what we know.</p>
                )}
              </div>
              <button
                onClick={() => currentMeeting && setPanel({ meeting: currentMeeting, company: briefCompany })}
                className="shrink-0 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
              >
                Open brief
              </button>
            </div>
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
            {stagePrompt && (
              <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
                <p className="text-sm font-medium text-blue-900">
                  Move to <span className="capitalize">{stagePrompt.suggested.replace("_", " ")}</span>?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      const res = await fetch(`/api/prospects/${stagePrompt.prospectId}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ stage: stagePrompt.suggested }),
                      });
                      if (res.ok) {
                        setStagePrompt(null);
                        loadProspects();
                      }
                    }}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                  >
                    Move
                  </button>
                  <button
                    onClick={() => setStagePrompt(null)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-500"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
      </div>

      {/* Prospect list */}
      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Your pipeline</h2>
          <div className="flex gap-0.5 rounded-lg bg-slate-200/70 p-0.5">
            {(["active", "all"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setPipelineScope(s)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold capitalize transition ${
                  pipelineScope === s ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                }`}
                aria-pressed={pipelineScope === s}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        {prospects.length > 8 && (
          <input
            value={pipelineSearch}
            onChange={(e) => setPipelineSearch(e.target.value)}
            placeholder="Search companies…"
            className={`${inputCls} mb-3`}
          />
        )}
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
            <button
              onClick={() => {
                setCompany("Elgi Equipments");
                setWebsite("elgi.com");
                setContactName("Arjun Nair");
                setContactRole("GM Marketing");
                setMeetingType("discovery");
                companyRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
              className="mt-3 w-full rounded-xl border border-slate-300 bg-white py-2.5 text-sm font-semibold text-slate-700 hover:border-slate-900"
            >
              Try an example
            </button>
          </div>
        ) : pipelineList.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
            {pipelineSearch.trim() ? "No companies match your search." : "No active deals — switch to All to see closed ones."}
          </p>
        ) : (
          <ul className="space-y-2">
            {pipelineList.map((p) => (
              <li key={p.id} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <button
                  className="flex w-full items-center gap-3 p-4 text-left"
                  onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                >
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${HEALTH_DOT[p.deal_health] ?? HEALTH_DOT.unknown}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{p.company_name}</span>
                    {p.website && (p.memory as { website_inferred?: boolean })?.website_inferred && (
                      <span className="block truncate text-xs text-slate-400">{p.website} (auto-detected)</span>
                    )}
                    <span className="block text-xs text-slate-400">
                      {p.meetings.length} meeting{p.meetings.length === 1 ? "" : "s"} · last activity {relativeTime(p.updated_at)}
                    </span>
                  </span>
                  {hasMeetingToday(p) && (
                    <span className="shrink-0 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                      Today
                    </span>
                  )}
                  <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium capitalize text-slate-600">
                    {p.stage.replace("_", " ")}
                  </span>
                  <span className="text-slate-300">{expanded === p.id ? "▾" : "▸"}</span>
                </button>
                {expanded === p.id && (
                  <div className="border-t border-slate-100 px-4 pb-4">
                    <div className="mt-2 flex justify-end gap-3">
                      {!p.meetings.some((m) => m.status === "done" || (m.raw_notes ?? "").trim() !== "") && (
                        <DeleteButton prospectId={p.id} company={p.company_name} onDone={loadProspects} />
                      )}
                      <ArchiveButton prospectId={p.id} onDone={loadProspects} />
                    </div>
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

      {panel && (
        <BriefPanel
          meeting={panel.meeting}
          company={panel.company}
          initialSection={panel.section}
          onClose={() => setPanel(null)}
        />
      )}
    </main>
  );
}
