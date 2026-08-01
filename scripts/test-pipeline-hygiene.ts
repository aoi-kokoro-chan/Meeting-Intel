/**
 * P1-1 acceptance: 10 do_not_take-flagged prospects must not raise "Active
 * deals"; archiving removes a prospect from both surfaces and the counts.
 * Zero LLM calls — flagged rows are inserted directly.
 * Run: npx tsx scripts/test-pipeline-hygiene.ts  (dev server on :3000)
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
const BASE = "http://localhost:3000";

async function managerStats(): Promise<{ active: number; flagged: number; html: string }> {
  const html = await (await fetch(`${BASE}/manager`)).text();
  const stat = (label: string) => {
    const m = html.match(new RegExp(`>(\\d+)</p><p[^>]*>${label}`));
    return m ? parseInt(m[1], 10) : -1;
  };
  return { active: stat("Active deals"), flagged: stat("Flagged by triage"), html };
}

async function main() {
  await db.from("prospects").delete().ilike("company_name", "Flagged Test Co %");
  const before = await managerStats();
  console.log(`before: active=${before.active} flagged=${before.flagged}`);

  // 10 prospects whose only meeting is an upcoming do_not_take flag
  const ids: string[] = [];
  for (let i = 1; i <= 10; i++) {
    const { data: p } = await db
      .from("prospects")
      .insert({ company_name: `Flagged Test Co ${i}`, owner_rep: "Sales Rep A", stage: "discovery" })
      .select()
      .single();
    ids.push(p!.id);
    await db.from("meetings").insert({
      prospect_id: p!.id,
      meeting_type: "discovery",
      rep_name: "Sales Rep A",
      status: "upcoming",
      triage_verdict: "do_not_take",
      triage_reason: "Test flag",
    });
  }

  let failures = 0;
  try {
    const mid = await managerStats();
    const c1 = mid.active === before.active;
    const c2 = mid.flagged === before.flagged + 10;
    if (!c1 || !c2) failures++;
    console.log(`${c1 ? "✓" : "✗"} Active deals unchanged with 10 flagged prospects (${before.active} -> ${mid.active})`);
    console.log(`${c2 ? "✓" : "✗"} Flagged-by-triage rose by 10 (${before.flagged} -> ${mid.flagged})`);

    // Archive one via the API (PATCH {archived: true} — DELETE is hard delete)
    const res = await fetch(`${BASE}/api/prospects/${ids[0]}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: true }),
    });
    const c3 = res.ok;
    const after = await managerStats();
    const c4 = !after.html.includes("Flagged Test Co 1<") && !after.html.includes("Flagged Test Co 1 ");
    const c5 = after.flagged === mid.flagged - 1;
    const repList = await (await fetch(`${BASE}/api/prospects`, { headers: { Cookie: "rep=Sales%20Rep%20A" } })).json();
    const c6 = !repList.prospects.some((p: { id: string }) => p.id === ids[0]);
    if (!c3 || !c4 || !c5 || !c6) failures++;
    console.log(`${c3 ? "✓" : "✗"} archive via PATCH returned ok`);
    console.log(`${c4 ? "✓" : "✗"} archived prospect gone from manager table`);
    console.log(`${c5 ? "✓" : "✗"} flagged count dropped by 1 (${mid.flagged} -> ${after.flagged})`);
    console.log(`${c6 ? "✓" : "✗"} archived prospect gone from rep pipeline`);

    // Archived row remains queryable (not hard-deleted)
    const { data: archivedRow } = await db.from("prospects").select("archived_at").eq("id", ids[0]).single();
    const c7 = archivedRow?.archived_at != null;
    if (!c7) failures++;
    console.log(`${c7 ? "✓" : "✗"} archived row still in DB with archived_at set`);
  } finally {
    for (const id of ids) await db.from("prospects").delete().eq("id", id);
  }

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURES`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
