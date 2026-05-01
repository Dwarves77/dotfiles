import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SOURCES = [
  { name: "ENERGY STAR Portfolio Manager", url: "https://www.energystar.gov/buildings/benchmark", tier: 1, description: "EPA tool required by most US cities for energy benchmarking filings.", jurisdictions: ["us"], domains: [6] },
  { name: "Building Performance Standards Coalition", url: "https://www.buildingperformancestandards.org", tier: 3, description: "Tracks all 60+ US/Canada building performance and benchmarking programs.", jurisdictions: ["us"], domains: [6] },
  { name: "NYC Local Law 84/97 — Benchmarking & Carbon Limits", url: "https://www.nyc.gov/site/buildings/codes/benchmarking.page", tier: 1, description: "NYC building energy benchmarking (LL84) and carbon emissions caps (LL97).", jurisdictions: ["us"], domains: [1, 6] },
  { name: "LA Existing Buildings Energy & Water Efficiency (EWEO)", url: "https://www.ladbs.org/services/green-building/existing-buildings", tier: 1, description: "LA mandatory energy/water benchmarking and audit. Commercial buildings >20,000 sqft.", jurisdictions: ["us"], domains: [1, 6] },
  { name: "Nashville Building Energy Programs", url: "https://www.nashville.gov/departments/general-services/energy-programs", tier: 1, description: "Nashville Metro energy benchmarking. Currently voluntary for private commercial.", jurisdictions: ["us"], domains: [1, 6] },
  { name: "UK MEES — Minimum Energy Efficiency Standards", url: "https://www.gov.uk/guidance/domestic-private-rented-property-minimum-energy-efficiency-standard-landlord-guidance", tier: 1, description: "UK mandatory minimum EPC rating for commercial leases. EPC E now, EPC C by 2027, EPC B by 2030.", jurisdictions: ["uk"], domains: [1, 6] },
  { name: "Australia NABERS", url: "https://www.nabers.gov.au", tier: 1, description: "Australian building energy rating. Mandatory for offices >1,000 sqm. Warehouse expansion under consultation.", jurisdictions: ["asia"], domains: [1, 6] },
  { name: "EU EPBD Recast — Energy Performance of Buildings", url: "https://energy.ec.europa.eu/topics/energy-efficiency/energy-efficient-buildings/energy-performance-buildings-directive_en", tier: 1, description: "EU directive requiring all buildings to reach zero-emission by 2050.", jurisdictions: ["eu"], domains: [1, 6] },
  { name: "IMT — Institute for Market Transformation", url: "https://www.imt.org", tier: 3, description: "Tracks all US city benchmarking policies. Policy database and compliance guidance.", jurisdictions: ["us"], domains: [6] },
  { name: "Measurabl — Building Benchmarking Tracker", url: "https://www.measurabl.com/ordinance-filing", tier: 4, description: "Commercial benchmarking compliance service. Tracks 60+ US/Canada programs with deadlines.", jurisdictions: ["us"], domains: [6] },
];

const ITEMS = [
  {
    title: "NYC Local Law 97 — Building Carbon Emissions Caps",
    domain: 1, category: "facility", item_type: "regulation",
    transport_modes: ["road"], jurisdictions: ["us"], priority: "CRITICAL",
    what_is_it: "NYC Local Law 97 sets carbon emissions caps for buildings over 25,000 sqft starting 2024, with tighter limits in 2030 and 2035. Fines of $268 per metric ton CO2 over the cap. LL84 requires annual energy benchmarking via ENERGY STAR Portfolio Manager by May 1. Enforced by NYC Department of Buildings.",
    why_matters: "As a warehouse tenant in NYC: (1) landlords pass LL97 compliance costs through in lease terms as operating expenses, (2) landlords facing penalties will mandate energy retrofits that may disrupt warehouse operations — expect HVAC upgrades, lighting replacements, building envelope work, (3) your warehouse energy data feeds into building-level filing and your Scope 2 reporting, (4) buildings failing LL97 caps become less attractive — affects lease renewal leverage.",
    key_data: ["LL84 filing deadline: May 1 annually via ENERGY STAR Portfolio Manager", "LL97 penalty: $268/metric ton CO2 over cap", "Threshold: buildings >25,000 sqft", "Period 1 caps: 2024-2029 (current)", "Period 2 caps: 2030-2034 (significantly tighter)", "Tenant impact: lease cost pass-through + retrofit disruption"],
    source_url: "https://www.nyc.gov/site/buildings/codes/benchmarking.page",
    summary: "ACTION REQUIRED — WINDOW CLOSING. LL84 annual filing deadline is May 1 — 18 days away. Your NYC warehouse landlord files but needs your energy data. Provide utility data immediately if requested. Review lease for LL97 cost pass-through clauses. Owner: Operations + Legal.",
  },
  {
    title: "LA EWEO — Existing Buildings Energy & Water Efficiency",
    domain: 1, category: "facility", item_type: "regulation",
    transport_modes: ["road"], jurisdictions: ["us"], priority: "HIGH",
    what_is_it: "LA Existing Buildings Energy and Water Efficiency Ordinance requires commercial buildings over 20,000 sqft to benchmark energy and water use annually and complete energy audits on a compliance schedule. LA is developing mandatory building performance standards (BPS) with emissions caps.",
    why_matters: "As an LA warehouse tenant: (1) your landlord must benchmark annually — they may request utility data or submetering access, (2) energy audit requirements may trigger operational disruptions, (3) LA is developing BPS emissions caps similar to NYC LL97 — expect lease cost increases when activated, (4) your Scope 2 emissions from LA use the same energy data as the EWEO filing.",
    key_data: ["Threshold: commercial buildings >20,000 sqft", "Benchmarking: annual via ENERGY STAR Portfolio Manager", "Energy audit: required on compliance schedule", "BPS: under development — expect emissions caps", "Tenant impact: utility data sharing + retrofit disruption"],
    source_url: "https://www.ladbs.org/services/green-building/existing-buildings",
    summary: "MONITORING. EWEO benchmarking ongoing. LA developing BPS emissions caps. Provide utility data to landlord when requested. Review lease for retrofit cost pass-through. Owner: Operations.",
  },
  {
    title: "UK MEES — Commercial Building Minimum Energy Efficiency",
    domain: 1, category: "facility", item_type: "regulation",
    transport_modes: ["road"], jurisdictions: ["uk"], priority: "CRITICAL",
    what_is_it: "UK Minimum Energy Efficiency Standards prohibit landlords from granting new leases or renewing existing leases on commercial properties with EPC rating below E (current). Proposed tightening to EPC C by 2027 and EPC B by 2030. Non-compliant buildings cannot be legally leased. Fines up to GBP 150,000 per property.",
    why_matters: "This directly affects your London warehouse lease: (1) if the building EPC drops below minimum, your landlord CANNOT legally renew your lease — forced relocation risk, (2) landlords anticipating EPC C/B tightening will invest in major retrofits NOW — expect construction disruption and service charge increases, (3) retrofit costs passed through in lease renewals — budget 10-25% occupancy cost increase, (4) your Scope 2 emissions should improve after retrofit but transition period creates operational risk.",
    key_data: ["Current minimum: EPC E for commercial leases", "Proposed: EPC C by 2027, EPC B by 2030", "Penalty: up to GBP 150,000 per non-compliant property", "Non-compliant buildings: CANNOT be legally leased", "Tenant impact: forced relocation risk + retrofit disruption + 10-25% cost increase"],
    source_url: "https://www.gov.uk/guidance/domestic-private-rented-property-minimum-energy-efficiency-standard-landlord-guidance",
    summary: "ACTION REQUIRED — WINDOW CLOSING. EPC C by 2027 means your London warehouse landlord must upgrade within 12 months. Expect retrofit disruption and 10-25% service charge increase. Verify building EPC rating NOW. Owner: Operations + Legal.",
  },
  {
    title: "Melbourne NABERS & Victorian Building Efficiency Standards",
    domain: 1, category: "facility", item_type: "regulation",
    transport_modes: ["road"], jurisdictions: ["asia"], priority: "HIGH",
    what_is_it: "NABERS is Australia's mandatory energy rating for commercial office buildings over 1,000 sqm. Victoria expanding efficiency requirements. Melbourne City Council targeting zero net emissions by 2040. NABERS expansion to warehouses and industrial buildings under consultation.",
    why_matters: "As a Melbourne warehouse tenant: (1) NABERS warehouse expansion under consultation — when passed your building will need a rating, (2) Victorian Energy Upgrades program may trigger landlord retrofit activity, (3) Melbourne 2040 zero net target drives local planning requirements, (4) Scope 2 improving as Victoria grid decarbonizes.",
    key_data: ["NABERS: mandatory for offices >1,000 sqm, warehouse expansion under consultation", "Victorian Energy Upgrades: incentive program", "Melbourne zero net emissions: 2040 target", "Tenant impact: future NABERS requirement + landlord retrofit activity"],
    source_url: "https://www.nabers.gov.au",
    summary: "MONITORING. NABERS warehouse expansion under consultation. Victorian incentives may trigger landlord retrofit. No immediate deadline. Owner: Operations.",
  },
  {
    title: "Nashville Building Energy Programs",
    domain: 1, category: "facility", item_type: "regulation",
    transport_modes: ["road"], jurisdictions: ["us"], priority: "MODERATE",
    what_is_it: "Nashville Metro has energy benchmarking for municipal buildings and is developing expanded requirements for commercial buildings. Tennessee does not mandate private building benchmarking. Better Buildings Nashville provides technical assistance and incentives.",
    why_matters: "Nashville currently has no mandatory benchmarking for your warehouse. However: (1) Nashville is developing expanded requirements — trend across US cities is toward mandatory, (2) Better Buildings Nashville incentives may benefit your landlord, (3) voluntary participation builds Scope 2 data before mandate arrives.",
    key_data: ["Current: voluntary for private commercial", "Municipal: mandatory benchmarking", "Better Buildings Nashville: incentives available", "Trend: expansion under development"],
    source_url: "https://www.nashville.gov/departments/general-services/energy-programs",
    summary: "MONITORING. No mandatory benchmarking for private buildings in Nashville. Voluntary program available. Monitor for expansion. Owner: Operations.",
  },
];

async function run() {
  console.log("=== BUILDING PERFORMANCE STANDARDS ===\n");

  // Add sources
  let srcAdded = 0;
  for (const src of SOURCES) {
    const { data: existing } = await supabase.from("sources").select("id").eq("url", src.url).limit(1);
    if (existing?.length) { console.log("SKIP SRC:", src.name); continue; }
    const { error } = await supabase.from("sources").insert({
      ...src, tier_at_creation: src.tier, status: "active",
      intelligence_types: ["REG"], update_frequency: "annual",
      access_method: "scrape", transport_modes: ["road"],
      topic_tags: ["facility"], vertical_tags: [],
      notes: "Building performance standards — warehouse compliance.",
    });
    if (error) console.log("ERR:", src.name, error.message);
    else { console.log("OK SRC:", src.name); srcAdded++; }
  }
  console.log("Sources added:", srcAdded);

  // Add intelligence items
  let itemAdded = 0;
  for (const item of ITEMS) {
    const { data: existing } = await supabase.from("intelligence_items").select("id").eq("title", item.title).limit(1);
    if (existing?.length) { console.log("SKIP ITEM:", item.title); continue; }
    const { data: inserted, error } = await supabase.from("intelligence_items").insert({
      ...item, status: "monitoring", confidence: "confirmed",
      added_date: new Date().toISOString().slice(0, 10), is_archived: false,
    }).select("id").single();
    if (error) { console.log("ERR:", item.title, error.message); continue; }
    console.log("OK ITEM:", item.title);
    itemAdded++;

    // Build full_brief
    const brief = `# ${item.title}\n\n**Priority:** ${item.priority} | **Jurisdiction:** ${item.jurisdictions.join(", ")}\n**Source:** [Primary source](${item.source_url})\n\n---\n\n## What This Regulation Is and Why It Applies\n\n${item.what_is_it}\n\n## Current Status\n\n${item.summary}\n\n---\n\n## Why It Matters\n\n${item.why_matters}\n\n---\n\n## Key Data and Figures\n\n| Parameter | Detail |\n|---|---|\n${item.key_data.map(d => { const p = d.split(":"); return `| ${p[0].trim()} | ${p.slice(1).join(":").trim()} |`; }).join("\n")}\n\n---\n\n## Sources\n\n| Source | URL |\n|---|---|\n| Primary source | ${item.source_url} |`;

    await supabase.from("intelligence_items").update({ full_brief: brief }).eq("id", inserted.id);

    // Build synopses
    const { data: sectors } = await supabase.from("sector_contexts").select("sector, display_name").order("sector");
    const rows = (sectors || []).map(s => ({
      item_id: inserted.id, sector: s.sector,
      summary: `## Section 1 — REGULATION IDENTIFICATION\n\n${item.title}. ${item.what_is_it.split(".").slice(0, 2).join(".")}.\n\n---\n\n## Section 9 — INDUSTRY-SPECIFIC TRANSLATION\n\n${item.why_matters}`,
      urgency_score: null, generated_at: new Date().toISOString(), model_version: "restructured-local",
    }));
    await supabase.from("intelligence_summaries").insert(rows);
  }

  const { count: srcCount } = await supabase.from("sources").select("*", { count: "exact", head: true });
  const { count: itemCount } = await supabase.from("intelligence_items").select("*", { count: "exact", head: true }).eq("is_archived", false);
  console.log("\nItems added:", itemAdded);
  console.log("Total sources:", srcCount);
  console.log("Total items:", itemCount);
}

run();
