/**
 * P0-3 acceptance: nine-domain triage table. Legitimate businesses (B2C
 * included) must not hard-block; only Gushwork itself, a real SEO-services
 * competitor, and a placeholder domain may return do_not_take.
 * Run: npx tsx scripts/test-triage-policy.ts  (dev server on :3000)
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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// expect: "block" = do_not_take required; "pass" = go or caution required
const CASES: { company: string; website: string; expect: "block" | "pass" }[] = [
  { company: "Gushwork", website: "gushwork.ai", expect: "block" },
  { company: "Example Holdings", website: "example.com", expect: "block" }, // placeholder page
  { company: "Single Grain", website: "singlegrain.com", expect: "block" }, // real SEO-services agency
  { company: "Practo", website: "practo.com", expect: "pass" },
  { company: "Licious", website: "licious.in", expect: "pass" },
  { company: "Urban Company", website: "urbancompany.com", expect: "pass" },
  { company: "Delhivery", website: "delhivery.com", expect: "pass" },
  { company: "Elgi Test Run", website: "elgi.com", expect: "pass" },
  { company: "Vercel", website: "vercel.com", expect: "pass" },
];

async function main() {
  // Optional domain filter args to re-test a subset without burning quota
  const filter = process.argv.slice(2);
  const cases = filter.length ? CASES.filter((c) => filter.includes(c.website)) : CASES;
  const createdIds: string[] = [];
  let failures = 0;
  const rows: string[] = [];
  try {
    for (const c of cases) {
      const res = await fetch("http://localhost:3000/api/prospects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_name: c.company, website: c.website, meeting_type: "discovery" }),
      });
      const data = await res.json();
      if (data.prospect?.id) createdIds.push(data.prospect.id);
      const verdict = data.meeting?.triage_verdict ?? "(none)";
      const ok = c.expect === "block" ? verdict === "do_not_take" : verdict === "go" || verdict === "caution";
      if (!ok) failures++;
      rows.push(
        `${ok ? "✓" : "✗"} ${c.website.padEnd(18)} ${verdict.padEnd(12)} (want ${c.expect === "block" ? "do_not_take" : "go/caution"}) — ${(data.meeting?.triage_reason ?? "").slice(0, 90)}`
      );
      await sleep(3000);
    }
  } finally {
    for (const id of createdIds) await db.from("prospects").delete().eq("id", id);
  }
  console.log("\nNine-domain triage table:");
  for (const r of rows) console.log(" " + r);
  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURES`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
