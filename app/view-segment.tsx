"use client";

import { useRouter } from "next/navigation";
import { PERSONA_COOKIE } from "@/lib/reps";

// Rep | Manager segmented control shown in both headers. Switching views also
// updates the persona cookie so the first-visit gate never reappears.
export default function ViewSegment({ active }: { active: "rep" | "manager" }) {
  const router = useRouter();

  function go(view: "rep" | "manager") {
    document.cookie = `${PERSONA_COOKIE}=${view === "rep" ? "rep" : "manager"}; path=/; max-age=31536000; SameSite=Lax`;
    router.push(view === "rep" ? "/" : "/manager");
  }

  const seg = (view: "rep" | "manager", label: string) => (
    <button
      onClick={() => view !== active && go(view)}
      className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
        active === view ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
      }`}
      aria-pressed={active === view}
    >
      {label}
    </button>
  );

  return (
    <div className="flex gap-0.5 rounded-xl bg-slate-200/70 p-1">
      {seg("rep", "Rep")}
      {seg("manager", "Manager")}
    </div>
  );
}
