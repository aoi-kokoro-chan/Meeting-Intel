"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Hard delete — only offered while a prospect has no saved notes and no
// completed meetings (the server enforces this with a 409 regardless).
export default function DeleteButton({
  prospectId,
  company,
  onDone,
}: {
  prospectId: string;
  company: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function hardDelete() {
    if (busy) return;
    if (!window.confirm(`Permanently remove ${company}? No calls have happened yet.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/prospects/${prospectId}`, { method: "DELETE" });
      if (res.ok) {
        if (onDone) onDone();
        else router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        window.alert(data.error ?? "Could not delete");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={hardDelete}
      disabled={busy}
      className="text-xs font-medium text-slate-400 hover:text-red-600 hover:underline disabled:opacity-50"
    >
      {busy ? "Deleting…" : "Delete"}
    </button>
  );
}
