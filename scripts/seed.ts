/**
 * Seed script — wipes prospects/meetings and inserts 3 realistic India-based
 * prospects for Gushwork's ICP. All dates are relative to run time.
 * Run: npx tsx scripts/seed.ts
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

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

const now = Date.now();
const daysAgo = (d: number) => new Date(now - d * 86400000).toISOString();
const daysAhead = (d: number) => new Date(now + d * 86400000).toISOString();

async function main() {
  console.log("Wiping tables…");
  // Deleting prospects cascades to meetings, but clear meetings first for safety.
  const { error: delM } = await db.from("meetings").delete().not("id", "is", null);
  if (delM) throw new Error(`wipe meetings: ${delM.message}`);
  const { error: delP } = await db.from("prospects").delete().not("id", "is", null);
  if (delP) throw new Error(`wipe prospects: ${delP.message}`);

  // ─── 1. Elgi Equipments — demo stage, advancing ───────────────────────────
  console.log("Seeding Elgi Equipments…");
  const elgiMemory = {
    pains: [
      "Strong distributor network but weak inbound — almost no organic leads from the website",
      'US buyers searching "industrial air compressor suppliers" find Atlas Copco and Ingersoll Rand first, never Elgi',
      "Current agency produces generic blog content with no technical depth — engineers bounce off it",
    ],
    stakeholders: [
      { name: "Arjun Nair", role: "GM Marketing", notes: "Champion. Owns digital budget, wants to look good on US/EU expansion." },
      { name: "Priya Venkat", role: "CFO office", notes: "Wants cost-per-lead proof vs what they spend on trade shows." },
    ],
    objections: [
      "Burned by current agency's generic content — skeptical any agency can write credible technical content",
      "CFO office wants cost-per-lead comparison against trade-show spend before approving",
    ],
    commitments: [
      { who: "Rep", what: "Send case study of a similar industrial manufacturer + pricing in both $ and ₹", when: "by Friday" },
      { who: "Arjun Nair", what: "Get Priya Venkat from CFO office to join the closing call", when: "next call" },
    ],
    next_step: "Closing call with Arjun + CFO office in 2 days — bring case study and dual-currency pricing",
    last_sentiment: "positive",
    facts: [
      "Expanding aggressively in US/EU markets; Coimbatore HQ",
      "Wants to close before Diwali budget freeze",
    ],
  };

  const { data: elgi, error: e1 } = await db
    .from("prospects")
    .insert({
      company_name: "Elgi Equipments",
      website: "elgi.com",
      contact_name: "Arjun Nair",
      contact_role: "GM Marketing",
      stage: "demo",
      deal_health: "advancing",
      memory: elgiMemory,
      created_at: daysAgo(18),
      updated_at: daysAgo(9),
    })
    .select()
    .single();
  if (e1 || !elgi) throw new Error(`elgi: ${e1?.message}`);

  const { error: e1m } = await db.from("meetings").insert([
    {
      prospect_id: elgi.id,
      meeting_type: "discovery",
      scheduled_at: daysAgo(18),
      status: "done",
      triage_verdict: "go",
      triage_reason: "Industrial manufacturer expanding into US/EU — squarely in Gushwork's ICP with clear inbound gap.",
      brief: {
        headline: "First call with Elgi — a compressor giant with a distributor-shaped blind spot online",
        company_snapshot:
          "Elgi Equipments is a Coimbatore-based air-compressor manufacturer selling in 120+ countries, pushing hard into US/EU markets where its brand recognition lags its product quality.",
        what_we_know: [
          "Major India air-compressor player expanding in US/EU",
          "Sells primarily through distributors — inbound is an afterthought",
        ],
        last_meeting_recap: "",
        open_threads: [],
        likely_objections: ["'Our distributors bring the deals — why invest in SEO?'"],
        talk_track: [
          "US buyers research suppliers online long before contacting a distributor",
          "Technical content is Gushwork's wedge — AI + engineering-aware writers",
          "Ask about lead sources to quantify the inbound gap",
        ],
        questions_to_ask: [
          "When a US plant engineer searches for compressor suppliers today, where do you show up?",
          "Who owns the digital marketing budget — and what did you spend on trade shows last year?",
          "What has your current agency shipped in the last quarter?",
        ],
        watch_out: "Don't let it stay a 'brand awareness' chat — anchor on lead gen economics.",
      },
      raw_notes:
        "Great first call w Arjun (GM Mktg). Elgi expanding US/EU, distributor network strong but inbound basically zero. He literally googled 'industrial air compressor suppliers' during the call — Atlas Copco, Ingersoll Rand everywhere, Elgi nowhere. Current agency does generic blogs, engineers hate them. Budget exists, he owns it but CFO office (Priya Venkat) will want cost-per-lead vs trade shows. Wants a demo next week w his content lead.",
      extracted: {
        summary:
          "Strong discovery with GM Marketing Arjun Nair: Elgi has a real inbound gap in US/EU expansion and budget exists, with a demo agreed for next week.",
        pains: [
          "Strong distributor network but weak inbound — almost no organic leads from the website",
          'US buyers searching "industrial air compressor suppliers" find Atlas Copco and Ingersoll Rand first, never Elgi',
          "Current agency produces generic blog content with no technical depth — engineers bounce off it",
        ],
        stakeholders: [
          { name: "Arjun Nair", role: "GM Marketing", notes: "Champion, owns digital budget" },
          { name: "Priya Venkat", role: "CFO office", notes: "Will want cost-per-lead proof vs trade shows" },
        ],
        objections: ["Skeptical any agency can write credible technical content after being burned"],
        commitments: [{ who: "Rep", what: "Set up product demo with Arjun and his content lead", when: "next week" }],
        next_step: "Demo call next week with Arjun and content lead",
        sentiment: "positive",
        deal_signal: "advancing",
      },
      created_at: daysAgo(18),
    },
    {
      prospect_id: elgi.id,
      meeting_type: "demo",
      scheduled_at: daysAgo(9),
      status: "done",
      triage_verdict: "go",
      triage_reason: "Qualified champion returning with content lead — right room for a demo.",
      brief: {
        headline: "Demo day: show Elgi technical content their engineers would actually respect",
        company_snapshot:
          "Elgi Equipments, Coimbatore-based compressor manufacturer expanding in US/EU, with strong distributor sales but near-zero inbound.",
        what_we_know: [
          "US buyers find Atlas Copco and Ingersoll Rand first — Elgi invisible for supplier searches",
          "Current agency ships generic content with no technical depth",
          "Arjun Nair (GM Marketing) is champion and owns budget; CFO office wants cost-per-lead proof",
        ],
        last_meeting_recap:
          "Discovery surfaced a stark inbound gap — Arjun googled supplier terms live and Elgi was nowhere. He committed to a demo with his content lead.",
        open_threads: ["CFO office (Priya Venkat) needs cost-per-lead vs trade-show comparison"],
        likely_objections: [
          "'Your AI content will be as generic as our current agency's' — show industrial-depth samples",
          "Cost-per-lead skepticism — bring trade-show benchmark math",
        ],
        talk_track: [
          "Demo AEO answers for 'industrial air compressor suppliers USA'-type queries",
          "Show a technical piece written for engineers, not marketers",
          "Frame $ pricing against one trade-show booth cost",
        ],
        questions_to_ask: [
          "What would make your engineers say 'finally, an agency that gets it'?",
          "What does a qualified lead cost you at a US trade show today?",
          "If the demo lands, what does your sign-off process look like?",
        ],
        watch_out: "The content lead may defend the incumbent agency — make them a hero, not a loser.",
      },
      raw_notes:
        "Demo went well. Showed AEO + technical content samples, Arjun visibly impressed, content lead warmed up after the compressor-sizing article example. Pricing discussed at high level ($1500/mo tier) — Arjun wants it in ₹ too for finance. Priya from CFO office joined last 10 min, asked hard qs on cost-per-lead vs their Hannover Messe spend. I owe them a similar-manufacturer case study + dual currency pricing by Fri. They want to close before Diwali budget freeze. Closing call set.",
      extracted: {
        summary:
          "Demo landed well with both Arjun and his content lead; CFO office joined and pushed on cost-per-lead, with a closing call scheduled before their Diwali budget freeze.",
        pains: ["Trade-show-heavy lead gen with unclear cost-per-lead economics"],
        stakeholders: [{ name: "Priya Venkat", role: "CFO office", notes: "Joined demo, wants cost-per-lead proof vs trade shows" }],
        objections: ["Cost-per-lead must beat or justify itself against trade-show spend"],
        commitments: [
          { who: "Rep", what: "Send case study of a similar industrial manufacturer + pricing in both $ and ₹", when: "by Friday" },
          { who: "Arjun Nair", what: "Get Priya Venkat to join the closing call", when: "next call" },
        ],
        next_step: "Closing call with Arjun + CFO office — bring case study and dual-currency pricing",
        sentiment: "positive",
        deal_signal: "advancing",
        stage_suggestion: "demo",
      },
      created_at: daysAgo(9),
    },
    {
      prospect_id: elgi.id,
      meeting_type: "closing",
      scheduled_at: daysAhead(2),
      status: "upcoming",
      triage_verdict: "go",
      triage_reason: "Right stakeholders confirmed (champion + CFO office) with pricing already socialized — take this call.",
      created_at: daysAgo(2),
    },
  ]);
  if (e1m) throw new Error(`elgi meetings: ${e1m.message}`);

  // ─── 2. Safexpress — discovery stage, stalling ────────────────────────────
  console.log("Seeding Safexpress…");
  const safexpressMemory = {
    pains: [
      "Enterprise logistics deals come from referrals; website generates almost no qualified freight/3PL leads",
      'Ranking poorly for high-intent terms like "supply chain solutions India" against Delhivery and Blue Dart',
      "Marketing team writes ad-hoc blog posts with no keyword strategy",
    ],
    stakeholders: [
      {
        name: "Rohan Taneja",
        role: "Digital Marketing Executive",
        notes: "Junior; enthusiastic but has no budget authority and can't name who owns marketing spend",
      },
    ],
    objections: ["'Leadership will review after Diwali' — no committed budget owner or timeline"],
    commitments: [],
    next_step: null,
    last_sentiment: "mixed",
    facts: ["Delhi NCR-based B2B logistics & supply chain company", "No budget owner identified after two calls"],
  };

  const { data: safex, error: e2 } = await db
    .from("prospects")
    .insert({
      company_name: "Safexpress",
      website: "safexpress.com",
      contact_name: "Rohan Taneja",
      contact_role: "Digital Marketing Executive",
      stage: "discovery",
      deal_health: "stalling",
      memory: safexpressMemory,
      created_at: daysAgo(25),
      updated_at: daysAgo(11),
    })
    .select()
    .single();
  if (e2 || !safex) throw new Error(`safexpress: ${e2?.message}`);

  const { error: e2m } = await db.from("meetings").insert([
    {
      prospect_id: safex.id,
      meeting_type: "discovery",
      scheduled_at: daysAgo(25),
      status: "done",
      triage_verdict: "go",
      triage_reason: "Large B2B logistics firm in ICP — worth a discovery call to find the budget owner.",
      brief: {
        headline: "Discovery with Safexpress — big logistics brand, unknown buying power in the room",
        company_snapshot:
          "Safexpress is a Delhi NCR-based B2B logistics and supply-chain company with a national distribution network — a classic Gushwork ICP if the right buyer shows up.",
        what_we_know: ["Inbound presence weak relative to brand size", "Contact is a digital marketing executive — seniority unclear"],
        last_meeting_recap: "",
        open_threads: [],
        likely_objections: ["'We get business through relationships, not the website'"],
        talk_track: [
          "Freight buyers shortlist vendors via search before RFPs",
          "Competitors like Delhivery invest heavily in content",
          "Qualify hard: who owns marketing budget?",
        ],
        questions_to_ask: [
          "Who signs off on marketing spend of this size?",
          "What share of new business comes through the website today?",
          "Which service lines need lead flow most — 3PL, express, warehousing?",
        ],
        watch_out: "Contact may be too junior — if the budget owner isn't identified, this deal will drift.",
      },
      raw_notes:
        "Met Rohan Taneja, digital mktg exec. Nice guy, gets SEO basics. Confirmed website brings ~nothing, referrals drive everything. They rank nowhere for supply chain solutions india type terms. But he couldn't say who owns budget — 'marketing head or maybe admin director'. Said leadership busy with peak season. Will try to set follow-up.",
      extracted: {
        summary:
          "Discovery confirmed a real inbound gap at Safexpress, but the contact is a junior digital-marketing exec who couldn't identify the marketing budget owner.",
        pains: [
          "Enterprise logistics deals come from referrals; website generates almost no qualified freight/3PL leads",
          'Ranking poorly for high-intent terms like "supply chain solutions India"',
        ],
        stakeholders: [{ name: "Rohan Taneja", role: "Digital Marketing Executive", notes: "Junior, no budget authority" }],
        objections: [],
        commitments: [],
        next_step: "Follow-up call once Rohan checks internally about the budget owner",
        sentiment: "mixed",
        deal_signal: "stalling",
      },
      created_at: daysAgo(25),
    },
    {
      prospect_id: safex.id,
      meeting_type: "discovery",
      scheduled_at: daysAgo(11),
      status: "done",
      triage_verdict: "caution",
      triage_reason: "Second call with the same junior contact and still no budget owner identified — qualify hard or escalate.",
      brief: {
        headline: "Second Safexpress call — get a budget owner in the room or park this deal",
        company_snapshot:
          "Delhi NCR-based B2B logistics and supply-chain company; strong brand, weak inbound, and so far only a junior digital-marketing contact.",
        what_we_know: [
          "Website generates almost no qualified leads; referrals drive business",
          "Rohan Taneja (Digital Marketing Executive) is engaged but has no budget authority",
        ],
        last_meeting_recap:
          "First discovery confirmed the inbound gap but ended without a budget owner named — Rohan promised to check internally.",
        open_threads: ["Who owns marketing budget? Still unanswered from call 1"],
        likely_objections: ["'Leadership is busy — let's talk after the festive season'"],
        talk_track: [
          "Anchor on cost of another quarter of invisible search presence",
          "Ask Rohan to broker an intro to the marketing head directly",
          "Offer a leadership-ready one-pager to make escalation easy",
        ],
        questions_to_ask: [
          "Did you find out who owns the marketing budget?",
          "Can we get 20 minutes with the marketing head on this call's follow-up?",
          "What would make this urgent for leadership before Diwali?",
        ],
        watch_out: "Two calls with no economic buyer is a stall pattern — don't book a third without one.",
      },
      raw_notes:
        "Rohan again, alone. Still no marketing head. Says leadership will review after diwali. No commitment on intro. Deal going nowhere till we find the real buyer. Parking follow-ups for now.",
      extracted: {
        summary:
          "Second call was again only with the junior exec; leadership review pushed to after Diwali and no intro to a budget owner secured.",
        pains: ["Marketing team writes ad-hoc blog posts with no keyword strategy"],
        stakeholders: [],
        objections: ["'Leadership will review after Diwali' — no committed budget owner or timeline"],
        commitments: [],
        next_step: null,
        sentiment: "mixed",
        deal_signal: "stalling",
      },
      created_at: daysAgo(11),
    },
  ]);
  if (e2m) throw new Error(`safexpress meetings: ${e2m.message}`);

  // ─── 3. Scalenut — disqualified, at_risk (competitor recon) ───────────────
  console.log("Seeding Scalenut…");
  const scalenutMemory = {
    pains: [],
    stakeholders: [{ name: "Vikram Sethi", role: "Growth Lead", notes: "Asked unusually detailed questions about Gushwork's AI content pipeline and pricing tiers" }],
    objections: [],
    commitments: [],
    next_step: null,
    last_sentiment: "negative",
    facts: [
      "Gurgaon-based AI SEO/content platform — sells AI SEO tooling themselves",
      "Questions in the first call centered on Gushwork's internal methods, not their own lead-gen needs",
    ],
  };

  const { data: scalenut, error: e3 } = await db
    .from("prospects")
    .insert({
      company_name: "Scalenut",
      website: "scalenut.com",
      contact_name: "Vikram Sethi",
      contact_role: "Growth Lead",
      stage: "disqualified",
      deal_health: "at_risk",
      memory: scalenutMemory,
      created_at: daysAgo(14),
      updated_at: daysAgo(3),
    })
    .select()
    .single();
  if (e3 || !scalenut) throw new Error(`scalenut: ${e3?.message}`);

  const { error: e3m } = await db.from("meetings").insert([
    {
      prospect_id: scalenut.id,
      meeting_type: "discovery",
      scheduled_at: daysAgo(14),
      status: "done",
      triage_verdict: "caution",
      triage_reason: "Scalenut sells AI SEO software itself — unclear why they'd buy an SEO service; probe intent carefully.",
      brief: {
        headline: "Careful with Scalenut — an AI SEO company asking about AI SEO services",
        company_snapshot:
          "Scalenut is a Gurgaon-based AI SEO and content platform. They sell AI-driven SEO tooling — which makes them a strange buyer for Gushwork's services.",
        what_we_know: ["They build and sell AI SEO/content software", "No obvious reason they'd outsource what they claim to automate"],
        last_meeting_recap: "",
        open_threads: [],
        likely_objections: [],
        talk_track: [
          "Ask what outcome they want that their own platform can't deliver",
          "Keep methodology details high-level",
          "Qualify budget and use-case before any specifics",
        ],
        questions_to_ask: [
          "What's driving you to look at an external SEO service given what you build?",
          "Which of your funnels is underperforming enough to pay $800+/mo to fix?",
          "Who would own this engagement internally?",
        ],
        watch_out: "High competitor-recon risk — if questions drift to our pipeline and pricing mechanics, wrap up.",
      },
      raw_notes:
        "Odd call. Vikram (growth lead) asked almost nothing about outcomes for scalenut — all questions about our AI pipeline, how we do AEO, team structure, pricing tiers. When I asked about their lead gen goals he was vague. Feels like recon. Not booking anything further.",
      extracted: {
        summary:
          "Call showed classic competitor-recon signals: detailed questions about Gushwork's methods and pricing with no articulation of their own lead-gen needs.",
        pains: [],
        stakeholders: [{ name: "Vikram Sethi", role: "Growth Lead", notes: "Probed Gushwork's AI pipeline and pricing in detail" }],
        objections: [],
        commitments: [],
        next_step: null,
        sentiment: "negative",
        deal_signal: "at_risk",
        stage_suggestion: "disqualified",
      },
      created_at: daysAgo(14),
    },
    {
      prospect_id: scalenut.id,
      meeting_type: "demo",
      scheduled_at: daysAhead(1),
      status: "upcoming",
      triage_verdict: "do_not_take",
      triage_reason:
        "Likely competitor recon — they sell AI SEO tooling themselves; no credible reason to buy a service they compete with.",
      created_at: daysAgo(3),
    },
  ]);
  if (e3m) throw new Error(`scalenut meetings: ${e3m.message}`);

  const { count: pCount } = await db.from("prospects").select("*", { count: "exact", head: true });
  const { count: mCount } = await db.from("meetings").select("*", { count: "exact", head: true });
  console.log(`Done. ${pCount} prospects, ${mCount} meetings seeded.`);
}

main().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
