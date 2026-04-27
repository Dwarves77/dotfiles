import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Domain 3: Regional Operations Intelligence
const REGIONAL_ITEMS = [
  { title: "Dubai / UAE Regional Operations Profile", domain: 3, category: "regional", transport_modes: ["air", "ocean", "road"], jurisdictions: ["meaf"], what_is_it: "Dubai/UAE operational environment for freight forwarding. DEWA Shams net metering for commercial solar. Industrial electricity ~AED 0.38/kWh. UAE Green Agenda 2030. Free zone regulations for logistics operations. Dubai South logistics hub development.", why_matters: "Dubai is a primary transshipment hub for Middle East, Africa, and South Asia trade lanes. Warehouse energy costs, labor regulations, and green building requirements directly affect operational costs for freight forwarders with Dubai facilities.", key_data: ["DEWA Shams: commercial solar with net metering permitted", "Industrial electricity: ~AED 0.38/kWh", "UAE Net Zero 2050 strategy", "Free zone customs advantages for logistics", "Dubai South: emerging logistics hub with sustainability standards"], source_url: "https://www.dewa.gov.ae/en/consumer/solar-community", priority: "HIGH" },
  { title: "United Kingdom Regional Operations Profile", domain: 3, category: "regional", transport_modes: ["air", "road", "ocean"], jurisdictions: ["uk"], what_is_it: "UK operational environment post-Brexit. UK ETS separate from EU ETS (~GBP 35-50/tCO2). UK SAF mandate (2% from 2025). UK EPR for packaging differs from EU PPWR. ULEZ and Clean Air Zones affecting urban logistics. Smart Export Guarantee for commercial solar.", why_matters: "UK-EU regulatory divergence creates dual compliance requirements for cross-Channel operators. UK ZEV mandate, UK ETS, and UK SAF mandate are separate instruments from EU equivalents requiring separate tracking.", key_data: ["UK ETS: ~GBP 35-50/tCO2, no linkage to EU ETS", "UK SAF mandate: 2% (2025) rising to 22% (2040)", "ULEZ and Clean Air Zones: expanding urban restrictions", "UK EPR packaging: differs from EU PPWR", "Smart Export Guarantee: solar export tariff"], source_url: "https://www.gov.uk/government/publications/transport-decarbonisation-plan", priority: "HIGH" },
  { title: "EU Core Markets Regional Operations Profile", domain: 3, category: "regional", transport_modes: ["road", "ocean", "air"], jurisdictions: ["eu"], what_is_it: "EU core markets (Germany, Netherlands, Belgium, France, Italy) operational environment. Highest regulatory density globally. EU ETS, FuelEU Maritime, ReFuelEU Aviation, CSRD, PPWR, CBAM, EUDR all apply. Industrial electricity varies significantly by member state. TEN-T corridor infrastructure for EV charging (AFIR).", why_matters: "EU is the most regulated freight market in the world. Every regulation tracked in this platform applies here first. Operators in EU core markets face the full stack of sustainability compliance requirements simultaneously.", key_data: ["Germany industrial electricity: ~EUR 0.18-0.22/kWh", "Netherlands: major port operations (Rotterdam, Amsterdam)", "Belgium: Antwerp-Bruges port complex", "France: nuclear-powered grid, lower electricity costs", "AFIR: EV charging every 60km on TEN-T by end 2025"], source_url: "https://energy.ec.europa.eu/topics/markets-and-consumers/energy-prices_en", priority: "CRITICAL" },
  { title: "United States Regional Operations Profile", domain: 3, category: "regional", transport_modes: ["road", "air", "ocean"], jurisdictions: ["us"], what_is_it: "US federal and state-level operational environment. Federal-state regulatory divergence on emissions. CARB ACT/ACF in California and Section 177 states. EPA Phase 3 under political review. IRA incentives for fleet electrification and solar. SmartWay carrier benchmarking.", why_matters: "US regulatory environment is politically volatile. Federal rollback does not eliminate state-level requirements or client ESG expectations. California and Section 177 states (~40% of US truck market) maintain independent standards.", key_data: ["CARB ACT/ACF: ZEV sales mandates for trucks", "Section 177 states: 12+ states follow CARB rules", "IRA: 30% ITC for commercial solar, EV tax credits", "SmartWay: de facto carrier environmental benchmarking", "EPA Phase 3: under political review, may be rescinded"], source_url: "https://www.epa.gov/regulations-emissions-vehicles-and-engines", priority: "HIGH" },
  { title: "Singapore Regional Operations Profile", domain: 3, category: "regional", transport_modes: ["ocean", "air"], jurisdictions: ["asia"], what_is_it: "Singapore as Asia-Pacific shipping and air cargo hub. MPA Green Shipping Programme with port incentives. Carbon tax S$25/tCO2 rising to S$50-80 by 2030. Singapore Green Plan 2030. Changi Airport SAF initiatives.", why_matters: "Singapore is the world's largest transshipment port and a major air cargo hub. Carbon tax trajectory and green shipping incentives affect operational costs and carrier selection for all Asia-Pacific trade lanes.", key_data: ["Carbon tax: S$25/tCO2, rising to S$50-80 by 2030", "MPA green shipping: port fee reductions for qualifying vessels", "Green Plan 2030: comprehensive sustainability strategy", "Changi Airport: SAF procurement and blending initiatives"], source_url: "https://www.mpa.gov.sg/maritime-singapore/sustainability", priority: "HIGH" },
  { title: "China (PRC) Regional Operations Profile", domain: 3, category: "regional", transport_modes: ["ocean", "road", "rail"], jurisdictions: ["asia"], what_is_it: "China operational environment. National ETS covering power sector (~CNY 70-90/tCO2). Extension to transport under discussion. Belt and Road logistics corridors. NEV mandates for commercial vehicles. Dual carbon goals (peak 2030, neutral 2060).", why_matters: "China is the world's largest manufacturing exporter and a major shipping origin. National ETS expansion to transport would add carbon cost to China-origin trade lanes. NEV mandates affect domestic trucking and drayage.", key_data: ["National ETS: ~CNY 70-90/tCO2 (power sector)", "ETS extension to transport: under discussion", "NEV mandates for commercial vehicles", "Dual carbon: peak 2030, neutral 2060", "Belt and Road: logistics corridor development"], source_url: "https://flk.npc.gov.cn/", priority: "HIGH" },
  { title: "India Regional Operations Profile", domain: 3, category: "regional", transport_modes: ["ocean", "road", "air"], jurisdictions: ["asia"], what_is_it: "India operational environment. Carbon Credit Trading Scheme launching. National Logistics Policy with carbon intensity standards. Rapidly growing air cargo market. Port modernization under Sagarmala programme.", why_matters: "India is a rapidly growing trade partner with emerging environmental regulations. Carbon credit scheme and logistics policy carbon standards will add new compliance layers for India trade lanes.", key_data: ["Carbon Credit Trading Scheme: launching", "National Logistics Policy: carbon intensity standards", "Sagarmala: port modernization programme", "Air cargo: fastest growing market globally"], source_url: "https://egazette.gov.in/", priority: "MODERATE" },
  { title: "Japan Regional Operations Profile", domain: 3, category: "regional", transport_modes: ["ocean", "road"], jurisdictions: ["asia"], what_is_it: "Japan operational environment. GX-ETS launching 2026, carbon surcharge from 2028. Hydrogen port investments at Kobe and Yokohama. 2024 driver working hours cap ('2024 Problem') constraining road freight capacity.", why_matters: "GX-ETS from 2026 adds carbon pricing to Japanese operations. Hydrogen bunkering at Japanese ports signals green shipping infrastructure. Driver shortage from working hours cap constrains road freight capacity.", key_data: ["GX-ETS: launches 2026, carbon surcharge from 2028", "Hydrogen ports: Kobe, Yokohama investments", "2024 Problem: driver working hours cap", "Green Growth Strategy: hydrogen economy"], source_url: "https://www.mlit.go.jp/en/", priority: "MODERATE" },
  { title: "Australia Regional Operations Profile", domain: 3, category: "regional", transport_modes: ["ocean", "road"], jurisdictions: ["asia"], what_is_it: "Australia operational environment. Safeguard Mechanism reform tightening emissions baselines for large facilities. National Electric Vehicle Strategy with freight provisions. Major mining export logistics.", why_matters: "Safeguard Mechanism affects large warehouse and port operations. EV strategy includes freight electrification targets. Australia is a major bulk commodity origin for Asia-Pacific trade.", key_data: ["Safeguard Mechanism: tightening emissions baselines", "National EV Strategy: freight electrification targets", "Major mining export logistics hub", "ISSB adoption for climate disclosure"], source_url: "https://www.climatechangeauthority.gov.au/", priority: "MODERATE" },
  { title: "Brazil Regional Operations Profile", domain: 3, category: "regional", transport_modes: ["ocean", "road"], jurisdictions: ["latam"], what_is_it: "Brazil operational environment. PNRS reverse logistics mandate for packaging. National carbon market under development. COP30 in Belem expected to accelerate environmental requirements. Major agricultural export logistics.", why_matters: "Brazil's reverse logistics mandate affects freight operations for any company shipping into the Brazilian market. Carbon market development signals new cost layers ahead for Brazil trade lanes.", key_data: ["PNRS: reverse logistics take-back mandate", "Carbon market: under development", "COP30 Belem: expected to accelerate requirements", "Major agricultural commodity exporter"], source_url: "https://www.gov.br/pt-br/servicos/acessar-o-diario-oficial-da-uniao", priority: "MODERATE" },
];

// Domain 6: Facility Optimization
const FACILITY_ITEMS = [
  { title: "Industrial Electricity Tariff Benchmarks by Jurisdiction", domain: 6, category: "facility", transport_modes: ["road"], what_is_it: "Industrial electricity tariffs across key logistics jurisdictions. US average ~$0.08/kWh. UK ~GBP 0.21/kWh. Germany ~EUR 0.18-0.22/kWh. Dubai ~AED 0.38/kWh. Singapore ~SGD 0.20/kWh. Tariffs determine warehouse operating costs and solar ROI calculations.", why_matters: "Electricity is 15-25% of warehouse operating cost. Jurisdiction-level tariff data determines where solar+BESS investment has the fastest payback and where energy cost creates competitive advantage or disadvantage.", key_data: ["US average: ~$0.08/kWh", "UK: ~GBP 0.21/kWh", "Germany: ~EUR 0.18-0.22/kWh", "Netherlands: ~EUR 0.12-0.15/kWh", "Dubai/UAE: ~AED 0.38/kWh", "Singapore: ~SGD 0.20/kWh", "Hong Kong: ~HKD 1.20/kWh"], source_url: "https://www.iea.org/data-and-statistics", priority: "HIGH" },
  { title: "Warehouse Solar & BESS ROI Analysis", domain: 6, category: "facility", transport_modes: ["road"], what_is_it: "Rooftop solar and battery energy storage ROI for warehouse operations. Utility-scale solar LCOE $30-50/MWh. US IRA 30% ITC. Dubai DEWA net metering. UK SEG export tariff. BESS 4-hour systems for peak shaving. Payback 5-8 years depending on jurisdiction.", why_matters: "Solar+BESS reduces Scope 2 emissions and operating costs simultaneously. Operators with solar-powered warehouses can offer clients lower-carbon logistics with verifiable emissions reductions.", key_data: ["Utility-scale solar LCOE: $30-50/MWh", "US IRA ITC: 30% for commercial solar", "Dubai DEWA: net metering permitted", "UK SEG: export tariff for surplus generation", "BESS payback: 5-8 years for peak shaving applications"], source_url: "https://www.nrel.gov/solar/market-research-analysis.html", priority: "MODERATE" },
  { title: "Green Building Certification Standards for Logistics", domain: 6, category: "facility", transport_modes: ["road"], what_is_it: "Green building certifications affecting warehouse and logistics facility design. BREEAM (UK/international). LEED (US/international). Estidama Pearl (UAE). Green Mark (Singapore). BCA Green Mark (Hong Kong). Certifications increasingly required by institutional landlords and ESG-driven tenants.", why_matters: "Green building certification is becoming a lease condition for institutional-grade logistics facilities. Operators in non-certified buildings may face higher energy costs and reduced tenant demand.", key_data: ["BREEAM: UK/international, most common in EU logistics", "LEED: US/international, common in Americas", "Estidama Pearl: UAE mandatory for new buildings", "Green Mark: Singapore government buildings", "Certification increasingly required by institutional landlords"], source_url: "https://www.breeam.com/", priority: "MODERATE" },
  { title: "Logistics Labor Cost & Availability Benchmarks", domain: 6, category: "facility", transport_modes: ["road"], what_is_it: "Warehouse and logistics labor cost benchmarks by jurisdiction. Includes minimum wage, skilled logistics labor rates, overtime regulations, and driver availability constraints. Japan 2024 Problem (driver hours cap) as benchmark for labor constraint impact.", why_matters: "Labor is 40-60% of warehouse operating cost. Driver shortages and working time regulations constrain road freight capacity. Jurisdictions with tight labor markets or restrictive regulations face capacity constraints and cost pressure.", key_data: ["US warehouse labor: $18-25/hour average", "UK warehouse labor: GBP 12-16/hour", "Germany: minimum wage EUR 12.82/hour", "Japan 2024 Problem: driver working hours cap", "Driver shortages across EU, US, and Japan"], source_url: "https://www.bls.gov/oes/current/oes537065.htm", priority: "HIGH" },
];

// Domain 7: Research & Intelligence Pipeline
const RESEARCH_ITEMS = [
  { title: "MIT ClimateMachine — Live Music & Freight Emissions Research", domain: 7, category: "research", transport_modes: ["air", "road"], what_is_it: "MIT ClimateMachine research programme on live music industry emissions including freight logistics. Phase 1 published: UK live music 4.0 MtCO2e, US live music 14.3 MtCO2e total emissions (2023). Phase 2 forthcoming: freight-specific emissions breakdown by transport mode.", why_matters: "First academic baseline for live music logistics emissions. Phase 2 will provide freight-specific data that touring operators and live events forwarders can use for Scope 3 reporting and client sustainability questionnaires.", key_data: ["UK live music total emissions: 4.0 MtCO2e (2023)", "US live music total emissions: 14.3 MtCO2e (2023)", "Phase 2: freight-specific breakdown forthcoming", "Research partner for Caro's Ledge"], source_url: "https://climatemachine.mit.edu/", priority: "HIGH" },
  { title: "MIT Center for Transportation & Logistics — Sustainable Trucking", domain: 7, category: "research", transport_modes: ["road", "ocean", "air"], what_is_it: "MIT CTL Sustainable Trucking Consortium research on fleet electrification pathways, supply chain carbon analytics, and intermodal freight optimization. Provides evidence-based fleet transition planning data.", why_matters: "CTL trucking research provides evidence-based data for fleet electrification decision-making. Supply chain carbon analytics methodologies feed into ISO 14083 and GLEC Framework development.", key_data: ["Sustainable Trucking Consortium (2025)", "Fleet electrification pathway research", "Supply chain carbon analytics", "Findings cited in regulatory impact assessments"], source_url: "https://ctl.mit.edu/", priority: "HIGH" },
  { title: "Tyndall Centre for Climate Research — Transport Decarbonisation", domain: 7, category: "research", transport_modes: ["air", "ocean"], what_is_it: "Tyndall Centre research on aviation and shipping decarbonisation including SAF lifecycle analysis, maritime fuel pathways, and carbon budget modelling for transport sectors.", why_matters: "Tyndall research informs UK and EU policy on aviation and maritime decarbonisation. SAF lifecycle analysis affects how SAF credits are valued in emissions accounting.", key_data: ["Aviation decarbonisation pathway research", "SAF lifecycle analysis", "Maritime fuel pathway assessment", "Carbon budget modelling for transport"], source_url: "https://www.tyndall.ac.uk/", priority: "MODERATE" },
  { title: "Centre for Sustainable Road Freight — UK Heavy Vehicle Research", domain: 7, category: "research", transport_modes: ["road"], what_is_it: "CSRF research on UK heavy goods vehicle decarbonisation including battery-electric, hydrogen fuel cell, and overhead catenary technologies for long-haul freight.", why_matters: "CSRF research informs UK DfT policy on truck fleet transition. Technology readiness assessments help operators plan fleet procurement timelines.", key_data: ["Battery-electric HGV viability assessment", "Hydrogen fuel cell truck research", "Overhead catenary (eHighway) feasibility", "UK DfT policy input"], source_url: "https://www.csrf.ac.uk/", priority: "MODERATE" },
];

async function run() {
  const allItems = [...REGIONAL_ITEMS, ...FACILITY_ITEMS, ...RESEARCH_ITEMS];

  console.log(`\n=== DOMAIN 3/6/7 DATA MIGRATION ===`);
  console.log(`Regional (domain 3): ${REGIONAL_ITEMS.length}`);
  console.log(`Facility (domain 6): ${FACILITY_ITEMS.length}`);
  console.log(`Research (domain 7): ${RESEARCH_ITEMS.length}`);
  console.log(`Total: ${allItems.length}`);

  let inserted = 0;
  let skipped = 0;

  for (const item of allItems) {
    const { data: existing } = await supabase
      .from("intelligence_items")
      .select("id")
      .eq("title", item.title)
      .limit(1);

    if (existing?.length) {
      console.log(`SKIP: ${item.title}`);
      skipped++;
      continue;
    }

    const { error } = await supabase.from("intelligence_items").insert({
      title: item.title,
      domain: item.domain,
      category: item.category,
      item_type: item.domain === 7 ? "research_finding" : "tool",
      transport_modes: item.transport_modes,
      jurisdictions: item.jurisdictions || ["global"],
      what_is_it: item.what_is_it,
      why_matters: item.why_matters,
      key_data: item.key_data,
      source_url: item.source_url,
      priority: item.priority,
      status: "monitoring",
      confidence: "confirmed",
      added_date: new Date().toISOString().slice(0, 10),
      is_archived: false,
    });

    if (error) {
      console.log(`ERROR: ${item.title} — ${error.message}`);
    } else {
      console.log(`OK: ${item.title}`);
      inserted++;
    }
  }

  // Now restructure synopses for new items (no API calls)
  console.log(`\nRestructuring synopses for new items...`);
  const { data: newItems } = await supabase
    .from("intelligence_items")
    .select("id, legacy_id, title, summary, what_is_it, why_matters, key_data, full_brief, source_url, priority, jurisdictions, transport_modes, confidence")
    .in("domain", [3, 6, 7])
    .eq("is_archived", false);

  const { data: sectors } = await supabase
    .from("sector_contexts")
    .select("sector, display_name")
    .order("sector");

  let synopsesCreated = 0;
  for (const item of newItems || []) {
    // Check if already has synopses
    const { data: existing } = await supabase.from("intelligence_summaries").select("id").eq("item_id", item.id).limit(1);
    if (existing?.length) continue;

    const rows = sectors.map(s => ({
      item_id: item.id,
      sector: s.sector,
      summary: buildBasicSynopsis(item, s),
      urgency_score: null,
      generated_at: new Date().toISOString(),
      model_version: "restructured-local",
    }));

    const { error } = await supabase.from("intelligence_summaries").insert(rows);
    if (!error) synopsesCreated += rows.length;
  }

  const { count } = await supabase.from("intelligence_items").select("*", { count: "exact", head: true });
  const { count: synCount } = await supabase.from("intelligence_summaries").select("*", { count: "exact", head: true });
  console.log(`\n=== COMPLETE ===`);
  console.log(`Inserted: ${inserted} | Skipped: ${skipped}`);
  console.log(`Synopses created: ${synopsesCreated}`);
  console.log(`Total intelligence_items: ${count}`);
  console.log(`Total synopses: ${synCount}`);
}

function buildBasicSynopsis(item, sector) {
  const s1 = `## Section 1 — REGULATION IDENTIFICATION\n\n${item.title}. ${(item.what_is_it || "").split(".").slice(0, 3).join(". ")}.${item.source_url ? ` Source: ${item.source_url}` : ""} Jurisdiction: ${(item.jurisdictions || ["global"]).join(", ")}. Transport modes: ${(item.transport_modes || []).join(", ") || "all"}.`;
  const s3 = `## Section 3 — IMMEDIATE ACTION ITEMS\n\n${(item.summary || "").includes("ACTION NOW") ? (item.summary.match(/ACTION NOW[:\s]*(.*?)(?:Owner:|$)/i)?.[1] || "Review current posture.").trim() : "No immediate action required. Monitor for developments."}`;
  const s4 = `## Section 4 — COMPLIANCE CHAIN MAPPING\n\n${item.why_matters || "Compliance chain analysis pending."}`;
  const s6 = `## Section 6 — FORMAT OR OPERATION ANALYSIS\n\n${(item.key_data || []).length ? "Key data:\n- " + (item.key_data || []).join("\n- ") : "No format-specific data available."}`;
  const s8 = `## Section 8 — COMPETITIVE INTELLIGENCE\n\n${item.priority === "CRITICAL" ? "CRITICAL priority. Early action creates preferred supplier status." : item.priority === "HIGH" ? "HIGH priority. Early movers gain tender advantage." : "Monitor for competitive positioning opportunities."}`;
  const s9 = `## Section 9 — INDUSTRY-SPECIFIC TRANSLATION\n\n${item.why_matters || "Industry-specific analysis pending for " + sector.display_name + "."}`;
  const s10 = `## Section 10 — LEGAL CONFIRMATION REQUIRED ITEMS\n\n- Confirm applicability to your specific operations\n- Verify compliance deadlines against your operational calendar`;
  return [s1, s3, s4, s6, s8, s9, s10].join("\n\n---\n\n");
}

run();
