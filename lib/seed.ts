import type { SupabaseClient } from "@supabase/supabase-js";

// Shared demo-seed logic: wipes prospects/meetings and inserts the three demo
// prospects (Elgi + Scalenut under Sales Rep A, Safexpress under Sales Rep B).
// Used by scripts/seed.ts (CLI) and POST /api/seed (token-gated reset).
export async function runSeed(db: SupabaseClient): Promise<{ prospects: number; meetings: number }> {
  const now = Date.now();
  const daysAgo = (d: number) => new Date(now - d * 86400000).toISOString();
  const daysAhead = (d: number) => new Date(now + d * 86400000).toISOString();

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
    // The "burned by current agency" objection was addressed during the demo —
    // it lives in resolutions/resolution_log, NOT in the open objections list.
    objections: ["CFO office wants cost-per-lead comparison against trade-show spend before approving"],
    commitments: [
      { who: "Rep", what: "Send ROI sheet + case study of a similar industrial manufacturer with pricing in both $ and ₹", when: "by Friday" },
      { who: "Arjun Nair", what: "Get Priya Venkat from CFO office to join the closing call", when: "next call" },
    ],
    resolutions: [
      "Burned by current agency's generic content — skeptical any agency can write credible technical content",
    ],
    resolution_log: [
      {
        text: "Burned by current agency's generic content — addressed at the demo with technical samples",
        date: daysAgo(9),
      },
    ],
    verbatim_phrases: [
      "we're invisible where our buyers actually look",
      "engineers bounce off fluffy content",
      "close before the Diwali freeze",
    ],
    next_step: "Closing call with Arjun + CFO office in 2 days — bring ROI sheet, case study and dual-currency pricing",
    last_sentiment: "positive",
    facts: [
      "Expanding aggressively in US/EU markets; Coimbatore HQ",
      "Wants to close before Diwali budget freeze",
      "Decision process: Arjun recommends, CFO office signs off on annual contracts",
    ],
  };

  const { data: elgi, error: e1 } = await db
    .from("prospects")
    .insert({
      company_name: "Elgi Equipments",
      website: "elgi.com",
      owner_rep: "Sales Rep A",
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
      rep_name: "Sales Rep A",
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
      rep_name: "Sales Rep A",
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
          { who: "Rep", what: "Send ROI sheet + case study of a similar industrial manufacturer with pricing in both $ and ₹", when: "by Friday" },
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
      rep_name: "Sales Rep A",
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
    resolutions: [],
    verbatim_phrases: [
      "leadership will review after Diwali",
      "the website brings us nothing, referrals bring everything",
      "no one really owns digital here",
    ],
    next_step: null,
    last_sentiment: "mixed",
    facts: ["Delhi NCR-based B2B logistics & supply chain company", "No budget owner identified after two calls"],
  };

  const { data: safex, error: e2 } = await db
    .from("prospects")
    .insert({
      company_name: "Safexpress",
      website: "safexpress.com",
      owner_rep: "Sales Rep B",
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
      rep_name: "Sales Rep B",
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
      rep_name: "Sales Rep B",
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
      owner_rep: "Sales Rep A",
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
      rep_name: "Sales Rep A",
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
      rep_name: "Sales Rep A",
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

  // ─── 4. Ador Welding — closed_won, archived: the complete healthy loop ────
  console.log("Seeding Ador Welding…");
  const ADOR_OBJECTION = "Tried a content agency in 2023 — generic output, skeptical any agency understands welding";
  const ADOR_COMMITMENT = "Share pilot scope document with keyword clusters, deliverables and $/₹ pricing";
  const adorMemory = {
    pains: [
      "Distributors find them easily, but end customers searching \"welding automation suppliers\" never do",
      "Product pages rank for brand terms only — zero visibility on category and application keywords",
    ],
    stakeholders: [
      { name: "Sameer Kulkarni", role: "Head of Marketing", notes: "Champion. Owns budget, pushed the pilot internally." },
      { name: "Deepa Iyer", role: "Procurement Lead", notes: "Ran vendor onboarding — completed before the closing call." },
    ],
    objections: [],
    commitments: [],
    resolutions: [ADOR_OBJECTION, `Rep: ${ADOR_COMMITMENT}`],
    resolution_log: [
      { text: `${ADOR_OBJECTION} — addressed at demo with welding-specific technical samples`, date: daysAgo(24) },
      { text: `Rep: ${ADOR_COMMITMENT} — delivered before closing`, date: daysAgo(14) },
    ],
    verbatim_phrases: [
      "distributors find us, end customers don't",
      "we sell automation but rank for nothing automated",
      "burn me once with generic content, never again",
    ],
    next_step: "Kickoff — onboarding call with Sameer's marketing team",
    last_sentiment: "positive",
    facts: [
      "Mumbai-based welding equipment & consumables manufacturer",
      "Verbal go-ahead at $1,000/mo; procurement completed before closing call",
    ],
  };

  const { data: ador, error: e4 } = await db
    .from("prospects")
    .insert({
      company_name: "Ador Welding",
      website: "adorwelding.com",
      owner_rep: "Sales Rep B",
      contact_name: "Sameer Kulkarni",
      contact_role: "Head of Marketing",
      stage: "closed_won",
      deal_health: "advancing",
      memory: adorMemory,
      created_at: daysAgo(35),
      updated_at: daysAgo(5),
      archived_at: daysAgo(5),
    })
    .select()
    .single();
  if (e4 || !ador) throw new Error(`ador: ${e4?.message}`);

  const { error: e4m } = await db.from("meetings").insert([
    {
      prospect_id: ador.id,
      rep_name: "Sales Rep B",
      meeting_type: "discovery",
      scheduled_at: daysAgo(35),
      status: "done",
      triage_verdict: "go",
      triage_reason: "Mumbai welding equipment manufacturer — squarely in ICP with a clear category-visibility gap.",
      brief: {
        headline: "First call with Ador — a welding leader invisible to the buyers who search",
        company_snapshot:
          "Ador Welding is a Mumbai-based manufacturer of welding equipment and consumables with a strong distributor network and decades of brand equity.",
        what_we_know: ["Established welding equipment & consumables brand", "Distribution-led sales; digital presence is brand-only"],
        last_meeting_recap: "",
        open_threads: [],
        likely_objections: ["'Our distributors bring the business — why invest in search?'"],
        talk_track: [
          "End customers research automation suppliers online before asking distributors",
          "Category keywords are winnable — competitors' content is thin",
          "Quantify what a ranked application page is worth",
        ],
        questions_to_ask: [
          "When a fabricator searches for welding automation, where do you show up?",
          "Who owns digital marketing budget?",
          "What have you tried before for content or SEO?",
        ],
        watch_out: "Don't let distributor strength mask the end-customer visibility gap.",
      },
      raw_notes:
        "Solid first call w Sameer (Head of Mktg). Distributors find them fine but end customers searching welding automation suppliers never see them — his words: 'distributors find us, end customers don't'. Big sore point: tried a content agency in 2023, output was generic, engineers rejected everything — skeptical any agency gets welding. Budget exists w him. Wants a demo w technical samples.",
      extracted: {
        summary:
          "Discovery with Sameer Kulkarni (Head of Marketing): strong distributor sales but zero end-customer search visibility; burned by a generic content agency in 2023. Demo agreed with technical samples.",
        pains: [
          "Distributors find them easily, but end customers searching \"welding automation suppliers\" never do",
          "Product pages rank for brand terms only",
        ],
        stakeholders: [{ name: "Sameer Kulkarni", role: "Head of Marketing", notes: "Champion, owns budget" }],
        objections: [ADOR_OBJECTION],
        commitments: [{ who: "Rep", what: "Demo with welding-specific technical content samples", when: "next week" }],
        verbatim_phrases: ["distributors find us, end customers don't"],
        next_step: "Demo next week with technical samples",
        sentiment: "positive",
        deal_signal: "advancing",
      },
      created_at: daysAgo(35),
    },
    {
      prospect_id: ador.id,
      rep_name: "Sales Rep B",
      meeting_type: "demo",
      scheduled_at: daysAgo(24),
      status: "done",
      triage_verdict: "go",
      triage_reason: "Qualified champion, demo with technical samples requested.",
      brief: {
        headline: "Demo for Ador: prove an agency can write welding content engineers respect",
        company_snapshot: "Mumbai welding equipment & consumables manufacturer; distribution-led, invisible on category search.",
        what_we_know: [
          "From Sales Rep B's discovery call: end customers searching \"welding automation suppliers\" never find them",
          "From Sales Rep B's discovery call: burned by a generic content agency in 2023 — engineers rejected the output",
        ],
        last_meeting_recap:
          "Discovery surfaced the category-visibility gap and the 2023 agency burn; Sameer agreed to a demo with welding-specific technical samples.",
        open_threads: ["Prove technical credibility with real welding content"],
        likely_objections: ["'Your samples will be generic like the 2023 agency' — lead with application-specific depth"],
        talk_track: [
          "Open with the WPS/automation sample pack",
          "Map content clusters to their product lines",
          "Close on a bounded pilot scope",
        ],
        questions_to_ask: [
          "Which product line hurts most from invisibility?",
          "Who needs to approve a pilot?",
          "What did the 2023 agency get wrong, specifically?",
        ],
        watch_out: "The 2023 burn is the deal — every sample must survive an engineer's read.",
      },
      raw_notes:
        "Demo strong. Walked welding-specific samples — Sameer visibly relieved, said 'burn me once with generic content, never again' but agreed ours is different, 2023 objection basically dead. Agreed I'll send pilot scope doc w keyword clusters, deliverables, $/₹ pricing this week. He'll loop procurement (Deepa Iyer) in parallel. Closing call after.",
      extracted: {
        summary:
          "Demo landed: welding-specific samples dissolved the 2023 generic-agency objection, pilot scope document promised, procurement being looped in for a closing call.",
        pains: [],
        stakeholders: [{ name: "Deepa Iyer", role: "Procurement Lead", notes: "Being looped in for vendor onboarding" }],
        objections: [],
        addressed_objections: [ADOR_OBJECTION],
        commitments: [{ who: "Rep", what: ADOR_COMMITMENT, when: "this week" }],
        verbatim_phrases: ["burn me once with generic content, never again"],
        next_step: "Send pilot scope doc, then closing call with Sameer + procurement",
        sentiment: "positive",
        deal_signal: "advancing",
        stage_suggestion: "closing",
      },
      created_at: daysAgo(24),
    },
    {
      prospect_id: ador.id,
      rep_name: "Sales Rep B",
      meeting_type: "closing",
      scheduled_at: daysAgo(12),
      status: "done",
      triage_verdict: "go",
      triage_reason: "Champion + procurement in the room, pilot scope already delivered — right room to close.",
      brief: {
        headline: "Close Ador: scope delivered, procurement done, bring the paperwork",
        company_snapshot: "Mumbai welding manufacturer; pilot scope delivered and procurement onboarding complete.",
        what_we_know: [
          "From Sales Rep B's demo call: 2023 generic-agency objection resolved with technical samples",
          "From Sales Rep B's demo call: pilot scope doc with $/₹ pricing delivered",
        ],
        last_meeting_recap: "Demo resolved the credibility objection; pilot scope document was delivered as promised.",
        open_threads: [],
        likely_objections: ["Pricing tier confirmation — anchor on the $1,000/mo pilot"],
        talk_track: ["Confirm scope acceptance", "Agree start date and onboarding", "Confirm $1,000/mo commercial terms"],
        questions_to_ask: ["Any final concerns before we start?", "Kickoff date?", "Who joins onboarding?"],
        watch_out: "Procurement is done — don't reopen scope, just land the start date.",
      },
      raw_notes:
        "Closed! Verbal go-ahead at $1000/mo. Deepa confirmed procurement/vendor onboarding complete, PO next week. Sameer wants kickoff w his marketing team in 2 wks. Scope doc accepted as-is.",
      extracted: {
        summary:
          "Verbal go-ahead at $1,000/mo with procurement complete; pilot scope accepted as delivered and kickoff planned with the marketing team.",
        pains: [],
        stakeholders: [],
        objections: [],
        resolved_commitments: [`Rep: ${ADOR_COMMITMENT}`],
        commitments: [{ who: "Sameer Kulkarni", what: "Kickoff with marketing team", when: "in 2 weeks" }],
        verbatim_phrases: [],
        next_step: "Kickoff — onboarding call with Sameer's marketing team",
        sentiment: "positive",
        deal_signal: "advancing",
        stage_suggestion: "closed_won",
      },
      created_at: daysAgo(12),
    },
  ]);
  if (e4m) throw new Error(`ador meetings: ${e4m.message}`);

  const { count: pCount } = await db.from("prospects").select("*", { count: "exact", head: true });
  const { count: mCount } = await db.from("meetings").select("*", { count: "exact", head: true });
  console.log(`Done. ${pCount} prospects, ${mCount} meetings seeded.`);
  return { prospects: pCount ?? 0, meetings: mCount ?? 0 };
}
