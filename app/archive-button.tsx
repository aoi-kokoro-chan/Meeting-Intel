"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Soft-archives a prospect (DELETE /api/prospects/:id) and refreshes the view.
export default function ArchiveButton({ prospectId, onDone }: { prospectId: string; onDone?: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function archive() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/prospects/${prospectId}`, { method: "DELETE" });
      if (res.ok) {
        if (onDone) onDone();
        else router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={archive}
      disabled={busy}
      className="text-xs font-medium text-slate-400 hover:text-red-600 hover:underline disabled:opacity-50"
    >
      {busy ? "Archiving…" : "Archive"}
    </button>
  );
}
