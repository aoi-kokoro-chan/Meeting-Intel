# Meeting Intelligence

Briefs before the call. Memory after. A meeting-prep + pipeline-memory system for Gushwork's sales team.

- **Rep view** (`/`) — enter who you're meeting, get a triaged, memory-aware pre-call brief; paste post-call notes to update persistent deal memory.
- **Manager view** (`/manager`) — pipeline stats, at-risk-first deal table with meeting timelines, and plain-code coaching signals.

## Stack

Next.js 15 (App Router) · Supabase (persistence) · Groq `llama-3.3-70b-versatile` (briefs, triage, note extraction) · Jina Reader (site scraping).

## Setup

1. `npm install`
2. Create `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
   SUPABASE_SECRET_KEY=
   GROQ_API_KEY=
   ```
3. Run `supabase/schema.sql` in the Supabase SQL editor.
4. Seed demo data: `npx tsx scripts/seed.ts`
5. `npm run dev`

## Known gaps

- **No authentication** — rep identity is a cookie-based switcher by design (demo), which means all prospect data is world-readable/writable through the public API. Do not put real customer data in this deployment. An SSO layer in front of the API is the intended production path.
