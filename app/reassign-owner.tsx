"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Manager-only ownership transfer: dropdown of the current roster + confirm.
// Past meetings keep their original rep_name — only future scoping changes.
export default function ReassignOwner({
  prospectId,
  current,
  roster,
}: {
  prospectId: string;
  current: string | null;
  roster: string[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(current ?? "");
  const [busy, setBusy] = useState(false);

  async function reassign() {
    if (busy || !selected || selected === current) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/prospects/${prospectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner_rep: selected }),
      });
      if (res.ok) router.refresh();
      else window.alert((await res.json().catch(() => ({}))).error ?? "Could not reassign");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <label className="text-xs text-slate-400">Reassign owner:</label>
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="rounded-lg border border-slate-300 bg-white px-1.5 py-0.5 text-xs text-slate-700 focus:border-slate-900 focus:outline-none"
      >
        {roster.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <button
        onClick={reassign}
        disabled={busy || !selected || selected === current}
        className="rounded-lg bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white disabled:opacity-40"
      >
        {busy ? "…" : "Confirm"}
      </button>
    </span>
  );
}
