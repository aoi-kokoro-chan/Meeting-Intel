import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { deriveRoster } from "@/lib/reps";

export const maxDuration = 60;

export async function GET() {
  try {
    const db = supabaseAdmin();
    const [{ data: prospects }, { data: meetings }] = await Promise.all([
      db.from("prospects").select("owner_rep"),
      db.from("meetings").select("rep_name"),
    ]);
    return NextResponse.json({ reps: deriveRoster(prospects ?? [], meetings ?? []) });
  } catch (err) {
    return NextResponse.json({ error: `Unexpected error: ${(err as Error).message}` }, { status: 500 });
  }
}
