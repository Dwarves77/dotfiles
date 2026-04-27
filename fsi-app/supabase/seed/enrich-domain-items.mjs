import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

process.loadEnvFile(".env.local");
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Build full_brief from the rich hardcoded TechnologyTracker data
// Each metric becomes a full section with trajectory, threshold, action, source

function buildTechBrief(cat) {
  let brief = `# ${cat.label}\n\n`;
  brief += `${cat.description}\n\n`;
  brief += `**Technology Readiness:** ${cat.trl_range}\n\n`;
  brief += `**Cost Trajectory:** ${cat.cost_trajectory}\n\n`;
  brief += `**Freight Forwarding Relevance:** ${cat.freight_relevance}\n\n`;
  brief += `---\n\n## Key Metrics\n\n`;

  for (const m of cat.key_metrics) {
    brief += `### ${m.label}: ${m.value}\n\n`;
    if (m.previous_value) brief += `Previous: ${m.previous_value}\n\n`;
    brief += `**Trajectory:** ${m.trajectory}\n\n`;
    brief += `**Decision Threshold:** ${m.decision_threshold}\n\n`;
    brief += `**Action Required — Confirm for Your Business:** ${m.what_to_do}\n\n`;
    brief += `**Source:** [${m.data_provider}](${m.data_url}) | Updates: ${m.update_frequency}\n\n`;
    brief += `---\n\n`;
  }

  brief += `## Policy Acceleration Signals\n\n`;
  for (const p of cat.policy_signals) {
    brief += `- ${p.signal} — [${p.data_provider}](${p.data_url})\n`;
  }

  return brief;
}

// Metrics from the hardcoded TechnologyTracker
const TECH_DATA = {
  "Battery & Electric Vehicle Technology": {
    trl_range: "TRL 7-9 (light duty deployed, heavy duty scaling)",
    cost_trajectory: "Battery pack costs declining — approaching $100/kWh for LFP. Solid-state commercial timelines 2027-2030.",
    freight_relevance: "Direct impact on drayage and last-mile delivery fleet. MCS infrastructure determines viability of long-haul electric. Key for warehouse-to-port corridors.",
    key_metrics: [
      { label: "Li-ion pack cost (2024)", value: "$115/kWh", previous_value: "$139/kWh (2023)", trajectory: "Declining ~15% annually. Was $1,200/kWh in 2010. LFP chemistry approaching $100/kWh — the threshold where electric trucks become cost-competitive with diesel on a TCO basis.", decision_threshold: "Below $100/kWh: EV fleet transition becomes financially advantageous for most drayage and last-mile operations without subsidies.", what_to_do: "If you operate drayage or last-mile fleets, begin TCO modelling for EV replacement now. If $115/kWh is already competitive on your routes, start procurement conversations.", data_provider: "BloombergNEF", data_url: "https://about.bnef.com/energy-storage/", update_frequency: "Annual (BNEF Battery Price Survey, December)" },
      { label: "Class 8 EV range", value: "150-300 mi", previous_value: "100-200 mi (2022)", trajectory: "Range increasing ~30% every 2 years as battery density improves. 500+ mile range expected by 2028-2030.", decision_threshold: "300+ miles: viable for most regional distribution. 500+ miles: viable for long-haul trucking.", what_to_do: "Map your route distances. If 80%+ of your truck routes are under 200 miles round-trip, EV trucks are viable today.", data_provider: "ICCT / OEM specifications", data_url: "https://theicct.org/sector/freight/", update_frequency: "Continuous" },
      { label: "MCS chargers deployed", value: "~200 globally", previous_value: "~50 (2023)", trajectory: "Megawatt Charging System enables 1MW+ charging for heavy trucks — 80% charge in 30-45 minutes. Deployment doubling annually.", decision_threshold: "1,000+ chargers on your operating corridors: MCS-dependent EV trucks become operationally feasible.", what_to_do: "Check MCS deployment on your key corridors via CharIN map. If coverage exists, include MCS-capable trucks in fleet procurement.", data_provider: "CharIN MCS Working Group", data_url: "https://www.charin.global/", update_frequency: "Quarterly deployment reports" },
      { label: "EV truck TCO parity", value: "2026-2028 est.", previous_value: "2028-2030 (estimated in 2023)", trajectory: "Parity date moving forward as battery costs fall and diesel costs rise. California and EU already at parity for urban drayage when incentives are included.", decision_threshold: "TCO parity = the year when owning and operating an EV truck costs the same or less than diesel over the vehicle lifetime.", what_to_do: "Do not sign long-term diesel fleet contracts extending past 2028 without an exit clause. Begin pilot EV deployment now.", data_provider: "ICCT / RMI", data_url: "https://theicct.org/sector/freight/", update_frequency: "Annual analysis updates" },
    ],
    policy_signals: [
      { signal: "EU CO2 standards for HDVs (2030/2040 targets)", data_provider: "EUR-Lex", data_url: "https://eur-lex.europa.eu" },
      { signal: "CARB Advanced Clean Trucks mandate", data_provider: "CARB", data_url: "https://ww2.arb.ca.gov/our-work/programs/advanced-clean-trucks" },
      { signal: "UK ZEV mandate for trucks", data_provider: "UK DfT", data_url: "https://www.gov.uk/government/organisations/department-for-transport" },
      { signal: "US IRA commercial vehicle credits", data_provider: "IRS / Federal Register", data_url: "https://www.federalregister.gov" },
    ],
  },
  "Sustainable Aviation Fuel (SAF) Production & Pricing": {
    trl_range: "TRL 8-9 (HEFA deployed, PtL scaling)",
    cost_trajectory: "HEFA SAF at 2-3x conventional jet fuel. E-fuel/PtL at 5-8x but declining. Production capacity lagging mandate volumes.",
    freight_relevance: "Air cargo rates directly affected by SAF blend mandates. Carriers pass through SAF costs as surcharges. Clients requesting SAF certificates for Scope 3 reporting.",
    key_metrics: [
      { label: "Global SAF production (2024)", value: "~0.5Mt", previous_value: "~0.3Mt (2023)", trajectory: "Production growing ~50% annually but still <0.2% of global jet fuel demand (~300Mt). Massive gap between production and mandate requirements.", decision_threshold: "Mandate compliance requires SAF to be available AND affordable at departure airports.", what_to_do: "Ask your air cargo carriers which airports have SAF supply today. Factor SAF surcharges into air freight quotes.", data_provider: "IEA / ICAO", data_url: "https://www.iea.org/energy-system/transport/aviation", update_frequency: "Annual" },
      { label: "SAF % of jet fuel", value: "<1%", previous_value: "<0.1% (2022)", trajectory: "Growing but far below mandate targets. ReFuelEU requires 2% by 2025, 6% by 2030, 70% by 2050.", decision_threshold: "When SAF exceeds 5%: expect meaningful air cargo rate impact. Above 20%: structural shift in air freight pricing.", what_to_do: "Build SAF surcharge pass-through into all air freight contracts now. Offer clients modal shift analysis as alternative.", data_provider: "IATA", data_url: "https://www.iata.org/en/programs/environment/sustainable-aviation-fuels/", update_frequency: "Annual" },
      { label: "HEFA premium vs conventional", value: "2-3x", previous_value: "3-5x (2022)", trajectory: "HEFA (waste oil-based) SAF is cheapest pathway. Premium declining as production scales.", decision_threshold: "At 1.5x premium: SAF becomes standard. At 2x: competitive for mandated blending. Above 3x: compliance-only.", what_to_do: "Include a SAF cost line in air cargo quotes showing the current premium. Track HEFA feedstock prices as leading indicator.", data_provider: "ICCT", data_url: "https://theicct.org/sector/freight/", update_frequency: "Annual cost analysis" },
      { label: "ReFuelEU 2025 mandate", value: "2%", previous_value: "N/A (new)", trajectory: "Fixed escalation: 2% (2025) -> 6% (2030) -> 20% (2035) -> 70% (2050). Sub-mandate for synthetic fuels from 2030.", decision_threshold: "Each step increases air cargo costs. The 6% (2030) step is first material impact.", what_to_do: "Include ReFuelEU timeline in long-term air freight contracts. Ensure escalation clauses cover SAF pass-through.", data_provider: "EUR-Lex (Reg. 2023/2405)", data_url: "https://eur-lex.europa.eu/eli/reg/2023/2405/oj", update_frequency: "Fixed legislative schedule" },
    ],
    policy_signals: [
      { signal: "ReFuelEU Aviation: 2% (2025) -> 6% (2030) -> 70% (2050)", data_provider: "EUR-Lex", data_url: "https://eur-lex.europa.eu/eli/reg/2023/2405/oj" },
      { signal: "UK SAF mandate: 2% (2025) -> 10% (2030) -> 50% (2050)", data_provider: "UK DfT", data_url: "https://www.gov.uk/government/publications/sustainable-aviation-fuel-mandate" },
      { signal: "ICAO CORSIA eligible fuels list", data_provider: "ICAO", data_url: "https://www.icao.int/CORSIA" },
      { signal: "US IRA SAF tax credit ($1.25-1.75/gal)", data_provider: "IRS", data_url: "https://www.irs.gov/credits-deductions/businesses/sustainable-aviation-fuel-credit" },
    ],
  },
};

async function run() {
  console.log("=== ENRICHING DOMAIN ITEMS WITH FULL BRIEFS ===\n");

  let updated = 0;

  for (const [title, data] of Object.entries(TECH_DATA)) {
    const brief = buildTechBrief({ label: title, description: "", ...data });

    const { data: item } = await supabase
      .from("intelligence_items")
      .select("id")
      .eq("title", title)
      .single();

    if (!item) {
      console.log(`NOT FOUND: ${title}`);
      continue;
    }

    const { error } = await supabase
      .from("intelligence_items")
      .update({ full_brief: brief })
      .eq("id", item.id);

    if (error) {
      console.log(`ERROR: ${title} — ${error.message}`);
    } else {
      console.log(`OK: ${title} (${brief.length} chars)`);
      updated++;
    }
  }

  // Now rebuild synopses for enriched items using existing restructure logic
  console.log("\nRestructuring synopses for enriched items...");

  const { data: enrichedItems } = await supabase
    .from("intelligence_items")
    .select("id, legacy_id, title, summary, what_is_it, why_matters, key_data, full_brief, source_url, priority, jurisdictions, transport_modes, confidence")
    .not("full_brief", "is", null)
    .in("domain", [2, 4]);

  const { data: sectors } = await supabase
    .from("sector_contexts")
    .select("sector, display_name")
    .order("sector");

  let synopsesUpdated = 0;

  for (const item of enrichedItems || []) {
    await supabase.from("intelligence_summaries").delete().eq("item_id", item.id);

    const rows = sectors.map((s) => ({
      item_id: item.id,
      sector: s.sector,
      summary: buildSynopsisFromBrief(item, s),
      urgency_score: null,
      generated_at: new Date().toISOString(),
      model_version: "restructured-enriched",
    }));

    const { error } = await supabase.from("intelligence_summaries").insert(rows);
    if (!error) synopsesUpdated += rows.length;
  }

  console.log(`\n=== COMPLETE ===`);
  console.log(`Items enriched: ${updated}`);
  console.log(`Synopses updated: ${synopsesUpdated}`);
}

function buildSynopsisFromBrief(item, sector) {
  const brief = item.full_brief || "";
  const whatIsIt = item.what_is_it || "";
  const whyMatters = item.why_matters || "";
  const keyData = (item.key_data || []).join("\n- ");

  const s1 = `## Section 1 — REGULATION IDENTIFICATION\n\n${item.title}. ${whatIsIt.split(".").slice(0, 3).join(". ")}.${item.source_url ? ` Source: ${item.source_url}` : ""} Transport modes: ${(item.transport_modes || []).join(", ") || "all"}.`;

  const s2 = `## Section 2 — SOURCE AUTHORITY HIERARCHY\n\n${item.source_url ? `- Primary source: ${item.source_url}` : "- Source authority: requires verification"}\n- All data points sourced individually — see metric-level citations in brief.`;

  const s3 = `## Section 3 — IMMEDIATE ACTION ITEMS\n\n${brief.includes("Action Required") || brief.includes("what_to_do") ? "Review the key metrics below for specific action items with decision thresholds and recommended next steps." : "No immediate regulatory deadline. Monitor metric trajectories for decision triggers."}`;

  // Extract the full brief content for sections 4-9
  const s6 = `## Section 6 — FORMAT OR OPERATION ANALYSIS\n\n${brief.length > 200 ? brief.slice(0, 8000) : keyData ? `Key data:\n- ${keyData}` : "See full brief for detailed analysis."}`;

  const s8 = `## Section 8 — COMPETITIVE INTELLIGENCE\n\n${item.priority === "CRITICAL" ? "CRITICAL priority. Operators who act on these metrics before competitors gain cost advantage, preferred supplier status, and tender differentiation." : "Operators who track these metrics and act on decision thresholds before competitors gain operational advantage."} ${whyMatters}`;

  const s9 = `## Section 9 — INDUSTRY-SPECIFIC TRANSLATION\n\n${whyMatters || "Industry-specific analysis pending for " + sector.display_name + "."}`;

  const s10 = `## Section 10 — LEGAL CONFIRMATION REQUIRED ITEMS\n\n- Verify data currency against source URLs before making procurement or investment decisions\n- Confirm jurisdiction-specific incentives and regulations with local counsel`;

  return [s1, s2, s3, s6, s8, s9, s10].join("\n\n---\n\n");
}

run();
