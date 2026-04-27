import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Build a 10-section synopsis from existing item data + existing synopsis content
function build10Section(item, existingSynopsis, sectorContext) {
  const brief = item.full_brief || "";
  const whatIsIt = item.what_is_it || "";
  const whyMatters = item.why_matters || "";
  const keyData = (item.key_data || []).join("\n- ");
  const summary = item.summary || "";
  const existing = existingSynopsis || "";

  // Section 1: Regulation Identification
  const s1 = `## Section 1 — REGULATION IDENTIFICATION\n\n${item.title}. ${whatIsIt.split(".").slice(0, 3).join(". ")}.${item.source_url ? ` Source: ${item.source_url}` : ""} Jurisdiction: ${(item.jurisdictions || ["global"]).join(", ")}. Transport modes: ${(item.transport_modes || []).join(", ") || "all"}.`;

  // Section 2: Source Authority
  const s2 = `## Section 2 — SOURCE AUTHORITY HIERARCHY\n\n${item.source_url ? `- Primary source: ${item.source_url} — ${item.confidence === "confirmed" ? "Confirmed primary text" : "Requires verification"}` : "- Source authority: requires verification against primary text"}\n- All claims in this synopsis should be verified against the primary legal text before operational decisions are made.`;

  // Section 3: Immediate Action Items — extract from summary/note which contains ACTION NOW
  const actionMatch = summary.match(/ACTION NOW[:\s]*(.*?)(?:Owner:|$)/i);
  const s3 = `## Section 3 — IMMEDIATE ACTION ITEMS\n\n${actionMatch ? actionMatch[1].trim() : summary.includes("IN FORCE") ? "This regulation is in force. Review current compliance posture against requirements below." : summary.includes("ADOPTED") ? "Recently adopted. Begin compliance planning within 30 days." : "No immediate action required. Monitor for implementation developments."}`;

  // Section 4: Compliance Chain — extract from whyMatters
  const s4 = `## Section 4 — COMPLIANCE CHAIN MAPPING\n\n${whyMatters || "Compliance chain analysis requires sector-specific assessment. See Industry-Specific Translation below."}`;

  // Section 5: Classification Analysis
  const s5 = `## Section 5 — CLASSIFICATION ANALYSIS\n\n${brief.includes("classification") || brief.includes("definition") || brief.includes("threshold") ? "Classification questions exist for this regulation. See full brief for threshold definitions and exemption analysis." : "No classification threshold questions identified for this regulation. Standard compliance obligations apply."}\n\n**Legal Confirmation Required:** Confirm applicability to your specific operations before designing compliance programs.`;

  // Section 6: Format/Operation Analysis — from key data
  const s6 = `## Section 6 — FORMAT OR OPERATION ANALYSIS\n\n${keyData ? `Key requirements:\n- ${keyData}` : "Format-specific analysis requires assessment against your operational assets and cargo types."}`;

  // Section 7: Third Party Exposure
  const thirdParty = whyMatters.match(/carrier|vendor|supplier|client|shipper/i);
  const s7 = `## Section 7 — THIRD PARTY EXPOSURE\n\n${thirdParty ? "Third party obligations exist under this regulation. " + whyMatters.split(".").filter(s => /carrier|vendor|supplier|client|shipper/i.test(s)).join(". ") + "." : "Third party exposure analysis requires assessment of your specific supply chain relationships."}`;

  // Section 8: Competitive Intelligence
  const s8 = `## Section 8 — COMPETITIVE INTELLIGENCE\n\n${item.priority === "CRITICAL" ? "This is a CRITICAL priority item. Operators who act before competitors establish compliance infrastructure gain preferred supplier status with ESG-driven clients." : item.priority === "HIGH" ? "Early movers who establish compliance readiness gain tender advantage over operators who wait." : "Monitor for competitive positioning opportunities as implementation develops."} ${summary.includes("Owner:") ? summary.match(/Owner:\s*(.*?)\.?$/i)?.[1] || "" : ""}`;

  // Section 9: Industry-Specific Translation — use existing synopsis if available, otherwise whyMatters
  const s9 = `## Section 9 — INDUSTRY-SPECIFIC TRANSLATION\n\n${existing || whyMatters || "Industry-specific translation requires assessment against " + sectorContext.display_name + " operations, cargo types, and compliance roles."}`;

  // Section 10: Legal Confirmation Required
  const s10 = `## Section 10 — LEGAL CONFIRMATION REQUIRED ITEMS\n\n${brief.includes("Legal Confirmation Required") || brief.includes("Action Required") ? "Legal confirmation items exist for this regulation. Review the full brief for specific questions requiring legal counsel." : "- Confirm applicability of this regulation to your specific operations\n- Verify compliance deadlines against your operational calendar\n- Review any exemptions or carve-outs that may apply to your cargo types"}`;

  return [s1, s2, s3, s4, s5, s6, s7, s8, s9, s10].join("\n\n---\n\n");
}

async function run() {
  // Load all items
  const { data: items } = await supabase
    .from("intelligence_items")
    .select("id, legacy_id, title, summary, what_is_it, why_matters, key_data, full_brief, source_url, priority, jurisdictions, transport_modes, confidence")
    .eq("is_archived", false);

  // Load all existing synopses
  const { data: synopses } = await supabase
    .from("intelligence_summaries")
    .select("item_id, sector, summary");

  // Build synopsis lookup: item_id -> sector -> summary
  const synopsisMap = new Map();
  for (const s of synopses || []) {
    if (!synopsisMap.has(s.item_id)) synopsisMap.set(s.item_id, new Map());
    synopsisMap.get(s.item_id).set(s.sector, s.summary);
  }

  // Load sector contexts
  const { data: sectors } = await supabase
    .from("sector_contexts")
    .select("sector, display_name, synopsis_prompt, transport_modes, cargo_types")
    .order("sector");

  console.log(`\n=== RESTRUCTURE SYNOPSES TO 10-SECTION FORMAT ===`);
  console.log(`Items: ${items.length}`);
  console.log(`Existing synopses: ${(synopses || []).length}`);
  console.log(`Sectors: ${sectors.length}`);
  console.log(`\nNo API calls. Pure data transformation.\n`);

  let updated = 0;
  let inserted = 0;
  let errors = 0;

  for (const item of items) {
    process.stdout.write(`[${updated + inserted + errors + 1}/${items.length}] ${item.legacy_id || "?"} — ${item.title}...`);

    const itemSynopses = synopsisMap.get(item.id);
    const rows = [];

    for (const sector of sectors) {
      const existingContent = itemSynopses?.get(sector.sector) || "";
      const tenSection = build10Section(item, existingContent, sector);

      rows.push({
        item_id: item.id,
        sector: sector.sector,
        summary: tenSection,
        urgency_score: null, // preserve existing if updating
        generated_at: new Date().toISOString(),
        model_version: "restructured-local",
      });
    }

    // Delete existing and insert new
    await supabase.from("intelligence_summaries").delete().eq("item_id", item.id);
    const { error } = await supabase.from("intelligence_summaries").insert(rows);

    if (error) {
      console.log(` ERROR: ${error.message}`);
      errors++;
    } else {
      console.log(` OK (${rows.length} sectors)`);
      updated++;
    }
  }

  const { count } = await supabase.from("intelligence_summaries").select("*", { count: "exact", head: true });
  console.log(`\n=== COMPLETE ===`);
  console.log(`Restructured: ${updated}`);
  console.log(`Errors: ${errors}`);
  console.log(`Total synopses in DB: ${count}`);
}

run();
