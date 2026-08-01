/**
 * P0-5 acceptance: open_loops must be derived from stored memory only — for a
 * prospect whose sole commitment is "will review pilot scope and case studies",
 * open_loops contains that item (with a real-timestamp age) and nothing else.
 * Run: npx tsx scripts/test-open-loops.ts  (dev server on :3000)
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

const COMMITMENT = { who: "Prospect", what: "will review pilot scope and case studies", when: "this week" };
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

async function main() {
  await db.from("prospects").delete().ilike("company_name", "Open Loop Test Co");
  const fiveDaysAgo = new Date(Date.now() - 5 * 86400000).toISOString();
  const { data: prospect } = await db
    .from("prospects")
    .insert({
      company_name: "Open Loop Test Co",
      owner_rep: "Sales Rep A",
      stage: "discovery",
      memory: { commitments: [COMMITMENT], objections: [], resolutions: [], pains: ["weak inbound"] },
    })
    .select()
    .single();
  await db.from("meetings").insert({
    prospect_id: prospect!.id,
    meeting_type: "discovery",
    rep_name: "Sales Rep A",
    status: "done",
    scheduled_at: fiveDaysAgo,
    created_at: fiveDaysAgo,
    raw_notes: "Good call. They will review pilot scope and case studies this week.",
    extracted: { summary: "Prospect agreed to review pilot scope and case studies.", commitments: [COMMITMENT], objections: [], pains: ["weak inbound"] },
  });
  const { data: meeting } = await db
    .from("meetings")
    .insert({ prospect_id: prospect!.id, meeting_type: "demo", rep_name: "Sales Rep A", status: "upcoming" })
    .select()
    .single();

  try {
    const res = await fetch("http://localhost:3000/api/brief", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: "rep=Sales%20Rep%20A" },
      body: JSON.stringify({ meeting_id: meeting!.id }),
    });
    const brief = (await res.json()).brief;
    const loops: string[] = brief.open_loops ?? [];

    // Programmatic grounding assertion: every loop maps to a stored entry.
    const storedNorms = [norm(`${COMMITMENT.who}: ${COMMITMENT.what}`), norm(COMMITMENT.what)];
    const allMap = loops.every((l) => storedNorms.some((s) => norm(l).includes(s)));

    const checks = {
      "exactly one open loop": loops.length === 1,
      "contains the stored commitment": loops.some((l) => l.includes("review pilot scope and case studies")),
      "age from real timestamp (5 days)": loops.some((l) => l.includes("5 days ago")),
      "every loop maps to a stored memory entry": allMap,
    };
    const ok = Object.values(checks).every(Boolean);
    console.log(`\n[open loops grounding] ${ok ? "PASS" : "FAIL"}`);
    for (const [k, v] of Object.entries(checks)) console.log(`  ${v ? "✓" : "✗"} ${k}`);
    console.log(`  open_loops: ${JSON.stringify(loops)}`);
    process.exit(ok ? 0 : 1);
  } finally {
    await db.from("prospects").delete().eq("id", prospect!.id);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
