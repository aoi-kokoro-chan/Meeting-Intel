import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { fetchRoster, registerRep } from "@/lib/roster";

export const maxDuration = 60;

export async function GET() {
  try {
    return NextResponse.json({ reps: await fetchRoster(supabaseAdmin()) });
  } catch (err) {
    return NextResponse.json({ error: `Unexpected error: ${(err as Error).message}` }, { status: 500 });
  }
}

// Registers a rep created via "+ I'm new" so the roster includes them before
// they own any data. Returns the canonical name (case-insensitive reuse).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const result = await registerRep(supabaseAdmin(), String(body?.name ?? ""));
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: `Unexpected error: ${(err as Error).message}` }, { status: 500 });
  }
}
