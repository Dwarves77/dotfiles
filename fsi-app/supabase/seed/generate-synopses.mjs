import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 10-section synopsis format from the environmental-policy-and-innovation skill
const SYSTEM_PROMPT = `You receive regulatory content for one intelligence item and all 15 freight forwarding sector contexts. Generate a 10-section sector-specific synopsis for EVERY sector in a single JSON response.

SOURCE AUTHORITY HIERARCHY — apply to every claim in every synopsis:
1. Confirmed primary text — Official Journal, Federal Register, IMO gazette. Cite specific articles and dates. This is the only level that confirms a legal obligation.
2. Official guidance — Commission guidance, regulator FAQ, implementing acts. Authoritative but not primary law. Cite document reference and date.
3. Secondary legal — Law firm commentary, industry association analysis. Named source, labeled as secondary.
4. Industry operator interpretation — Trade press, consultancy. Navigation only, not dispositive. Label clearly.
5. Legal Confirmation Required — Flag explicitly wherever no source has confirmed a claim. Never present an inference as fact.

QUALITY BENCHMARK: Every synopsis must match the PPWR v7 Regulatory Fact Document standard. Specific article references, penalty amounts where confirmed, cost mechanisms, legal confirmation flags, and operational impact specific to the sector being analyzed. Generic summaries that could apply to any freight operator are rejected.

COMPETITIVE INTELLIGENCE LENS — apply to every synopsis:
What does knowing this now, before competitors know it, enable this operator to do? State lead time value explicitly. Where does early compliance create preferred supplier status or tender advantage? Where does early action protect margin? Follow the signal chain: what future regulations does this regulation signal?

10-SECTION SYNOPSIS STRUCTURE — generate all 10 for high-relevance sectors (urgency >= 0.3):

Section 1 — REGULATION IDENTIFICATION: Full name, official citation, primary source URL, effective date, jurisdiction, transport modes. Source authority level for every fact. Related regulations discovered by following citations.

Section 2 — SOURCE AUTHORITY HIERARCHY: Every source classified. New sources discovered listed with URL and provisional trust tier.

Section 3 — IMMEDIATE ACTION ITEMS: What requires action NOW, not at the compliance deadline. For each: what the gap is, why it cannot wait, who must act, consequence of not acting, competitive cost of waiting. If nothing immediate, state explicitly.

Section 4 — COMPLIANCE CHAIN MAPPING: Where this sector sits in the supply chain. Role occupied. Multiple roles possible. Obligations per role. Legal obligation location versus operational consequence location.

Section 5 — CLASSIFICATION ANALYSIS: Threshold definitions to resolve before compliance program design. Exemptions or relief available. All unresolved questions labeled Legal Confirmation Required.

Section 6 — FORMAT OR OPERATION ANALYSIS: Each distinct asset type or operational mode analyzed separately. Regulatory status, confirmed obligations, unresolved questions, compliance risk level, what changes regardless of how unresolved questions answer.

Section 7 — THIRD PARTY EXPOSURE: Which third parties have obligations they may not know about. Consequence for this operator if they fail to comply. Vendor onboarding, pre-shipment verification, or contract language needed.

Section 8 — COMPETITIVE INTELLIGENCE: What knowing this now enables. Lead time window. Where early compliance creates preferred supplier status. Where early action protects margin. Where new market opportunity exists. What future regulatory signals this regulation contains.

Section 9 — INDUSTRY-SPECIFIC TRANSLATION: What this regulation means operationally for this specific sector. Which operations and cargo types are in scope. Which are exempt. Where compliance burden falls on operator versus clients. What this sector is doing today that creates exposure.

Section 10 — LEGAL CONFIRMATION REQUIRED ITEMS: Consolidated list of every unresolved question requiring legal advice. Must exist in every synopsis. If none, state explicitly.

If urgency_score is 0.1: write sections 1 and 9 only. Do not generate all 10 sections for irrelevant sectors.

URGENCY SCORING per sector (0.1 to 1.0):
1.0 — directly and explicitly affects this sector's core operations
0.9 — affects this sector's primary transport mode
0.6 — indirect cost or compliance pass-through
0.3 — adjacent sector with possible spillover
0.1 — no meaningful connection

Return ONLY valid JSON. No markdown fences. No preamble.
{
  "synopses": {
    "fine-art": { "summary": "10-section markdown synopsis", "urgency_score": 0.0 },
    "live-events": { "summary": "...", "urgency_score": 0.0 },
    "luxury-goods": { "summary": "...", "urgency_score": 0.0 },
    "film-tv": { "summary": "...", "urgency_score": 0.0 },
    "automotive": { "summary": "...", "urgency_score": 0.0 },
    "humanitarian": { "summary": "...", "urgency_score": 0.0 },
    "bulk-commodity": { "summary": "...", "urgency_score": 0.0 },
    "cold-chain": { "summary": "...", "urgency_score": 0.0 },
    "pharmaceutical": { "summary": "...", "urgency_score": 0.0 },
    "e-commerce": { "summary": "...", "urgency_score": 0.0 },
    "industrial-equipment": { "summary": "...", "urgency_score": 0.0 },
    "oil-gas": { "summary": "...", "urgency_score": 0.0 },
    "dangerous-goods": { "summary": "...", "urgency_score": 0.0 },
    "general-air": { "summary": "...", "urgency_score": 0.0 },
    "general-ocean": { "summary": "...", "urgency_score": 0.0 }
  }
}
All 15 sectors must be present. Never omit a sector. Never return partial results.`;

async function run() {
  // Load sector contexts
  const { data: sectors } = await supabase
    .from("sector_contexts")
    .select("sector, display_name, synopsis_prompt, transport_modes, cargo_types, compliance_roles, urgency_weights")
    .order("sector");

  if (!sectors?.length) { console.log("No sector contexts found"); return; }

  // Load ALL items that don't have synopses yet
  const { data: items } = await supabase
    .from("intelligence_items")
    .select("id, legacy_id, title, priority, full_brief, what_is_it, why_matters, key_data, summary")
    .eq("is_archived", false)
    .order("priority");

  // REGENERATE ALL — delete existing synopses and regenerate with 10-section format
  const needSynopses = items;

  console.log(`\n=== SYNOPSIS GENERATOR (10-SECTION FORMAT) ===`);
  console.log(`Sector contexts: ${sectors.length}`);
  console.log(`Total items to regenerate: ${needSynopses.length}`);
  console.log(`\nStarting...\n`);

  let done = 0;
  let failed = 0;

  for (const item of needSynopses) {
    process.stdout.write(`[${done + 1}/${needSynopses.length}] ${item.legacy_id || "?"} — ${item.title}...`);

    try {
      const briefContent = item.full_brief
        ? item.full_brief.slice(0, 12000)
        : `What It Is:\n${item.what_is_it || ""}\n\nWhy It Matters:\n${item.why_matters || ""}\n\nKey Data:\n${(item.key_data || []).join("\n")}\n\nStatus:\n${item.summary || ""}`;

      const userMessage = `INTELLIGENCE ITEM:
Title: ${item.title}
Priority: ${item.priority}

REGULATORY CONTENT:
${briefContent}

SECTOR CONTEXTS:
${JSON.stringify(sectors, null, 2)}`;

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      });

      const rawText = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
      let cleanText = rawText.trim();
      if (cleanText.startsWith("```")) cleanText = cleanText.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");

      let parsed;
      try {
        parsed = JSON.parse(cleanText);
      } catch {
        const start = cleanText.indexOf("{");
        const end = cleanText.lastIndexOf("}");
        if (start !== -1 && end !== -1) parsed = JSON.parse(cleanText.slice(start, end + 1));
      }

      if (!parsed?.synopses || Object.keys(parsed.synopses).length < 10) {
        console.log(` FAILED (incomplete response: ${Object.keys(parsed?.synopses || {}).length} sectors)`);
        failed++;
        continue;
      }

      // Delete any existing synopses for this item
      await supabase.from("intelligence_summaries").delete().eq("item_id", item.id);

      // Batch insert all 15 sector synopses
      const rows = Object.entries(parsed.synopses).map(([sector, data]) => ({
        item_id: item.id,
        sector,
        summary: data.summary || "",
        urgency_score: data.urgency_score ?? null,
        generated_at: new Date().toISOString(),
        model_version: "claude-sonnet-4-20250514",
      }));

      const { error } = await supabase.from("intelligence_summaries").insert(rows);
      if (error) {
        console.log(` WRITE ERROR: ${error.message}`);
        failed++;
      } else {
        console.log(` OK (${Object.keys(parsed.synopses).length} sectors)`);
        done++;
      }
    } catch (err) {
      console.log(` ERROR: ${err.message?.slice(0, 100)}`);
      failed++;
    }

    // Rate limit
    await new Promise((r) => setTimeout(r, 1500));
  }

  const { count } = await supabase.from("intelligence_summaries").select("*", { count: "exact", head: true });
  console.log(`\n=== COMPLETE ===`);
  console.log(`Generated: ${done}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total synopses in DB: ${count}`);
}

run();
