/**
 * Seed script — wipes prospects/meetings and inserts 3 realistic India-based
 * prospects for Gushwork's ICP. All dates are relative to run time.
 * Run: npx tsx scripts/seed.ts
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import { runSeed } from "../lib/seed";

// Load .env.local manually (tsx doesn't auto-load env files)
try {
  const env = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch {
  // fall through — env vars may already be set
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY (check .env.local)");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

runSeed(db)
  .then(({ prospects, meetings }) => console.log(`Done. ${prospects} prospects, ${meetings} meetings seeded.`))
  .catch((err) => {
    console.error("Seed failed:", err.message);
    process.exit(1);
  });
