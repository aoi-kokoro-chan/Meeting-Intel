import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { runSeed } from "@/lib/seed";

export const maxDuration = 60;

// Token-gated demo reset: wipes all data and restores the three demo
// prospects. There is no auth in this app, so the token is the only gate —
// never expose this in the UI.
export async function POST(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token");
    const expected = process.env.SEED_TOKEN;
    if (!expected || !token || token !== expected) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const result = await runSeed(supabaseAdmin());
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: `Seed failed: ${(err as Error).message}` }, { status: 500 });
  }
}
