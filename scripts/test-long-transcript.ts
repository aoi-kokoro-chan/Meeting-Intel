/**
 * P0-2 acceptance: a 60k-char transcript with a distinctive fact in the final
 * 5% must extract successfully and surface the tail fact.
 * Run: npx tsx scripts/test-long-transcript.ts  (dev server on :3000)
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

try {
  const env = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch {}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
});

// Build a plausible ~60k-char call transcript
const FILLER_TURNS = [
  "Rep: So walk me through how enquiries reach the sales team today.",
  "Prospect: Mostly it's the distributors calling in, honestly. The website form gets maybe two or three submissions a month and half of those are students or job seekers.",
  "Rep: And when a plant manager in the US searches for your product category, where do you show up?",
  "Prospect: We checked last quarter — page three, page four. Our competitors have whole resource centers, calculators, sizing guides. We have a brochure PDF from 2019.",
  "Prospect: Marketing here is two people and an agency that sends us four blog posts a month. The engineers refuse to review them anymore because the drafts get basic terminology wrong.",
  "Rep: What would a qualified enquiry be worth, roughly, if it converted?",
  "Prospect: A first order lands around six to eight lakh typically, and a converted OEM account compounds from there. So the math isn't the problem, visibility is.",
  "Rep: Who besides you would care about fixing this?",
  "Prospect: Our VP of sales complains about pipeline every review, and the MD keeps asking why our smaller competitor outranks us. So there's air cover, it just needs a concrete plan.",
];

function buildTranscript(targetChars: number, tailFact: string): string {
  const lines: string[] = ["Discovery call transcript — recorded and auto-transcribed.\n"];
  let i = 0;
  while (lines.join("\n").length < targetChars * 0.95) {
    lines.push(FILLER_TURNS[i % FILLER_TURNS.length]);
    i++;
  }
  lines.push(`Prospect: One more thing before we wrap — ${tailFact}`);
  lines.push("Rep: Understood, noted. Thanks for the time, I'll follow up with the recap.");
  return lines.join("\n");
}

async function main() {
  const TAIL_FACT = "our legal team requires a SOC2 report from any vendor before signing, that's non-negotiable.";
  const transcript = buildTranscript(60000, TAIL_FACT);
  console.log(`transcript length: ${transcript.length} chars`);

  await db.from("prospects").delete().ilike("company_name", "Long Transcript Test Co");
  const { data: prospect } = await db
    .from("prospects")
    .insert({ company_name: "Long Transcript Test Co", owner_rep: "Sales Rep A", stage: "discovery" })
    .select()
    .single();
  const { data: meeting } = await db
    .from("meetings")
    .insert({ prospect_id: prospect!.id, meeting_type: "discovery", rep_name: "Sales Rep A", status: "upcoming" })
    .select()
    .single();

  try {
    const t0 = Date.now();
    const res = await fetch("http://localhost:3000/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meeting_id: meeting!.id, raw_notes: transcript }),
    });
    const data = await res.json();
    const secs = ((Date.now() - t0) / 1000).toFixed(0);

    const blob = JSON.stringify(data.extracted ?? {}).toLowerCase();
    const checks = {
      "extraction succeeded (not null)": data.extracted !== null,
      "no ai_unavailable flag": !data.ai_unavailable,
      "tail fact (SOC2) captured": blob.includes("soc2") || blob.includes("soc 2"),
    };
    const ok = Object.values(checks).every(Boolean);
    console.log(`\n[60k transcript] ${ok ? "PASS" : "FAIL"} (${secs}s)`);
    for (const [k, v] of Object.entries(checks)) console.log(`  ${v ? "✓" : "✗"} ${k}`);
    console.log(`  warnings: ${JSON.stringify(data.warnings)}`);
    console.log(`  error_class: ${data.error_class ?? "—"}`);
    console.log(`  summary: ${(data.extracted?.summary ?? "").slice(0, 200)}`);
    const soc2Items = Object.entries(data.extracted ?? {})
      .filter(([, v]) => JSON.stringify(v).toLowerCase().includes("soc"))
      .map(([k]) => k);
    console.log(`  SOC2 appears in fields: ${soc2Items.join(", ") || "(none)"}`);
    process.exit(ok ? 0 : 1);
  } finally {
    await db.from("prospects").delete().eq("id", prospect!.id);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
