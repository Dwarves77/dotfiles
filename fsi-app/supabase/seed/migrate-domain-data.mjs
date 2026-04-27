import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Domain 2: Technology items
const TECH_ITEMS = [
  { title: "Battery & Electric Vehicle Technology", domain: 2, category: "technology", transport_modes: ["road"], what_is_it: "Lithium-ion battery cost trajectories, Class 8 EV truck range and TCO, MCS charging infrastructure deployment. Battery pack costs have fallen from $1,200/kWh (2010) to ~$139/kWh (2024). Class 8 EV trucks achieving 150-250 mile range. TCO parity with diesel expected 2027-2028 for regional haul.", why_matters: "Fleet electrification timelines for drayage and regional trucking depend on battery cost and charging infrastructure. Operators who understand when EV trucks reach TCO parity can time fleet procurement to capture cost advantage before competitors.", key_data: ["Li-ion pack cost: ~$139/kWh (2024), target $100/kWh","Class 8 EV range: 150-250 miles (regional haul viable)","MCS chargers: deployment accelerating on TEN-T and US interstates","TCO parity: expected 2027-2028 for regional haul applications"], source_url: "https://www.iea.org/reports/global-ev-outlook-2024", priority: "HIGH" },
  { title: "Sustainable Aviation Fuel (SAF) Production & Pricing", domain: 2, category: "technology", transport_modes: ["air"], what_is_it: "Global SAF production capacity, pricing premium over Jet-A1, HEFA vs synthetic pathways, mandate compliance costs. SAF currently ~3x conventional jet fuel price. Global production ~0.3% of jet fuel demand. ReFuelEU mandates 2% from 2025, 6% from 2030.", why_matters: "SAF cost is passed directly through to air freight rates. Every air cargo shipment departing an EU airport carries SAF surcharges. Operators who understand the SAF price trajectory can forecast air freight cost escalation and advise clients on modal shift economics.", key_data: ["SAF price: ~3x conventional jet fuel (~$2,300/mt vs $750/mt)","Global SAF production: ~0.3% of total jet fuel demand","ReFuelEU mandate: 2% (2025) → 6% (2030) → 70% (2050)","HEFA dominates current production; synthetic/PtL required for growth"], source_url: "https://www.iata.org/en/programs/environment/sustainable-aviation-fuels/", priority: "CRITICAL" },
  { title: "Hydrogen & Ammonia as Maritime Fuel", domain: 2, category: "technology", transport_modes: ["ocean"], what_is_it: "Green hydrogen production costs, ammonia bunkering infrastructure, vessel orders for ammonia/hydrogen-ready ships. Green hydrogen at $4-7/kg (target $2/kg by 2030). Ammonia bunkering planned at Singapore, Rotterdam, Yokohama. ~200 methanol-ready vessels on order.", why_matters: "Alternative maritime fuels determine which carriers can comply with FuelEU Maritime and IMO Net-Zero Framework at lowest cost. Operators who track fuel infrastructure development can identify which ports and carriers will offer green shipping options first.", key_data: ["Green hydrogen: $4-7/kg current, $2/kg target by 2030","Ammonia bunkering: planned at Singapore, Rotterdam, Yokohama, Kobe","Methanol-ready vessels: ~200 on order globally","FuelEU compliance: alternative fuels reduce GHG intensity penalty exposure"], source_url: "https://www.irena.org/Energy-Transition/Technology/Hydrogen", priority: "HIGH" },
  { title: "Marine Fuel Decarbonisation Pathways", domain: 2, category: "technology", transport_modes: ["ocean"], what_is_it: "LNG, methanol, biofuels, wind-assist, and nuclear propulsion technologies for maritime decarbonisation. LNG is transitional (~20% GHG reduction). Green methanol vessels entering service (Maersk). Wind-assist retrofits showing 5-30% fuel savings.", why_matters: "Carrier fleet composition determines ETS and FuelEU cost exposure. Operators who understand which fuels and technologies reduce compliance costs can select carriers with lower surcharge trajectories.", key_data: ["LNG: ~20% GHG reduction, methane slip concerns","Green methanol: first vessels in service (Maersk), limited supply","Wind-assist: 5-30% fuel savings on suitable routes","Nuclear: SMR concepts in development, not commercially available"], source_url: "https://www.imo.org/en/OurWork/Environment/Pages/Default.aspx", priority: "HIGH" },
  { title: "Solar & Battery Energy Storage for Warehouses", domain: 2, category: "technology", transport_modes: ["road"], what_is_it: "Rooftop solar ROI for warehouse operations, battery energy storage systems (BESS) for peak shaving and resilience. Utility-scale solar LCOE at $30-50/MWh. US IRA provides 30% ITC for commercial solar. Dubai DEWA permits commercial solar with net metering.", why_matters: "Warehouse energy costs are a significant operational expense. Solar+BESS reduces electricity costs and provides resilience against grid instability. Operators with solar-powered warehouses can offer clients lower-carbon logistics with verifiable Scope 2 reductions.", key_data: ["Utility-scale solar LCOE: $30-50/MWh","US IRA Investment Tax Credit: 30% for commercial solar","BESS: 4-hour lithium-ion systems for peak shaving","ROI: 5-8 year payback depending on jurisdiction and tariff structure"], source_url: "https://www.nrel.gov/solar/market-research-analysis.html", priority: "MODERATE" },
  { title: "Autonomous & Connected Freight Technology", domain: 2, category: "technology", transport_modes: ["road","ocean"], what_is_it: "Autonomous trucking (Level 4 hub-to-hub), autonomous vessels (MASS), connected logistics platforms. Aurora and Kodiak testing Level 4 trucks on US interstates. IMO MASS framework adopted. Digital freight matching platforms reducing empty miles.", why_matters: "Autonomous trucking changes the cost structure of linehaul and drayage. Operators who understand deployment timelines can plan for carrier capacity changes and workforce transitions.", key_data: ["Level 4 trucking: hub-to-hub testing on US interstates","IMO MASS: Maritime Autonomous Surface Ships framework adopted","Connected logistics: 10-15% empty mile reduction via digital matching","Timeline: limited commercial L4 trucking operations expected 2026-2028"], source_url: "https://www.itf-oecd.org/automated-and-autonomous-driving", priority: "MODERATE" },
];

// Domain 4: Market Intelligence items (from GeopoliticalSignals)
const MARKET_ITEMS = [
  { title: "Crude Oil & Jet Fuel Price Intelligence", domain: 4, category: "energy-prices", transport_modes: ["air","ocean","road"], what_is_it: "Brent crude, WTI, and jet fuel spot prices by hub (Singapore MOPS, NWE, US Gulf). Direct input to air and ocean freight surcharges. Brent crude sets bunker fuel costs for ocean shipping. Jet fuel spot prices set air cargo fuel surcharges by region.", why_matters: "Every freight invoice has a fuel surcharge component indexed to these prices. A $10/bbl move in Brent translates to $15-25/TEU on major ocean trade lanes. Jet fuel price determines the fuel surcharge on every air cargo shipment. Operators who track these daily can forecast rate changes before carrier announcements.", key_data: ["Brent crude: international benchmark, ~$10/bbl = $15-25/TEU impact","Singapore MOPS: Asia-Pacific air cargo fuel surcharge benchmark","NWE kerosene: European air cargo fuel surcharge benchmark","US Gulf jet fuel: Americas air cargo fuel surcharge benchmark"], source_url: "https://www.eia.gov/dnav/pet/pet_pri_spt_s1_d.htm", priority: "CRITICAL" },
  { title: "Carbon Allowance Price Intelligence", domain: 4, category: "carbon-markets", transport_modes: ["ocean","air","road"], what_is_it: "ETS allowance prices across 38 carbon markets worldwide. EU ETS (EUA) ~€68-81/tCO2. UK ETS (UKA) ~£35-50/tCO2. California CCA ~$35/tCO2. Korea KAU ~₩10,000-15,000/tCO2. Singapore carbon tax S$25/tCO2 rising to S$50-80 by 2030.", why_matters: "Carbon prices determine ETS surcharge levels on ocean and aviation freight. Maritime ETS: carriers surrender EUAs for EU port calls, passed through as surcharges. Aviation ETS: airlines recover carbon costs through fuel surcharges. CBAM links import carbon costs to origin-country pricing. Operators who track carbon prices can model surcharge exposure across trade lanes.", key_data: ["EU ETS (EUA): ~€68-81/tCO2 — maritime and aviation surcharges","UK ETS (UKA): ~£35-50/tCO2 — separate from EU post-Brexit","California CCA: ~$35/tCO2 — affects CARB-regulated trucking","Singapore carbon tax: S$25/tCO2, rising to S$50-80 by 2030","38 ETS systems in force globally, 11 under development"], source_url: "https://icapcarbonaction.com/en/ets-prices", priority: "CRITICAL" },
  { title: "LNG & Natural Gas Price Intelligence", domain: 4, category: "energy-prices", transport_modes: ["ocean"], what_is_it: "Dutch TTF and JKM (Japan-Korea Marker) natural gas prices. TTF is Europe's benchmark gas price driving EU electricity costs and energy policy urgency. JKM is Asia-Pacific LNG spot benchmark. Both affect warehouse energy costs and LNG-fueled vessel economics.", why_matters: "When TTF spikes, EU electricity costs rise, warehouse operating costs increase, and political pressure for energy transition accelerates — driving faster regulatory timelines. LNG vessel fuel costs track these benchmarks. Operators with LNG-fueled carrier relationships need to understand bunkering cost exposure.", key_data: ["Dutch TTF: European gas benchmark, drives EU electricity costs","JKM: Asia-Pacific LNG benchmark, largest LNG import region","LNG as marine fuel: transitional, ~20% GHG reduction vs HFO","High gas prices accelerate EU decarbonisation policy timelines"], source_url: "https://www.eia.gov/dnav/ng/ng_pri_fut_s1_d.htm", priority: "HIGH" },
  { title: "Packaging Material Input Costs", domain: 4, category: "petrochemicals", transport_modes: ["air","ocean","road"], what_is_it: "Propylene, ethylene, and methanol feedstock prices. Propylene → polypropylene (strapping, containers, pallet wrap). Ethylene → polyethylene (stretch film, bubble wrap, foam). Methanol → both marine fuel alternative and adhesive/coating feedstock.", why_matters: "Packaging material costs affect every shipment. When propylene/ethylene prices rise, the cost of protective packaging rises across all freight sectors. EU PPWR recyclability requirements may shift material demand patterns, creating cost volatility for packaging materials that are currently standard.", key_data: ["Propylene → polypropylene: strapping, containers, protective packaging","Ethylene → polyethylene: stretch film, bubble wrap, foam inserts","Methanol: dual use — marine fuel alternative AND packaging feedstock","PPWR recyclability requirements may force material substitution"], source_url: "https://www.icis.com/explore/commodities/chemicals/propylene/", priority: "HIGH" },
  { title: "Critical Minerals & EV Supply Chain", domain: 4, category: "critical-minerals", transport_modes: ["road"], what_is_it: "Lithium carbonate, cobalt, and nickel prices — primary cost drivers for EV batteries and energy storage. Lithium costs declining. Cobalt supply concentrated in DRC (60%+). Industry shifting to cobalt-free LFP chemistry.", why_matters: "Battery mineral costs determine when EV trucks reach TCO parity with diesel. Operators planning fleet electrification need to understand battery cost trajectories. Ethical sourcing pressure on cobalt affects procurement decisions for clients with ESG commitments.", key_data: ["Lithium carbonate: declining, driving EV and BESS affordability","Cobalt: 60%+ from DRC, ethical sourcing pressure","Nickel: dual impact — battery costs AND container steel costs","LFP chemistry shift reducing cobalt dependency"], source_url: "https://www.irena.org/Energy-Transition/Technology/Power-generation-costs", priority: "MODERATE" },
  { title: "Maritime Chokepoint Monitoring", domain: 4, category: "shipping-chokepoints", transport_modes: ["ocean"], what_is_it: "Strait of Hormuz (20% global oil), Suez Canal (12-15% global trade), Panama Canal (draft restrictions during drought). Real-time vessel transit monitoring. Disruption at any chokepoint reroutes global trade lanes with immediate rate and transit time impacts.", why_matters: "Chokepoint disruption spikes freight rates within hours. Suez Canal rerouting via Cape adds 7-10 days and ~$1M fuel per voyage. Panama draft restrictions force cargo lightering or rerouting via Suez. Strait of Hormuz disruption spikes oil prices immediately affecting all fuel surcharges.", key_data: ["Strait of Hormuz: 20% global oil supply, 21-mile width","Suez Canal: 12-15% global trade, +7-10 days if rerouted via Cape","Panama Canal: draft restrictions during drought, 2023-24 cut transits 36%","Disruption → immediate rate spikes and schedule unreliability"], source_url: "https://www.marinetraffic.com", priority: "HIGH" },
  { title: "Trade Restrictions & Industrial Policy", domain: 4, category: "trade-policy", transport_modes: ["air","ocean","road"], what_is_it: "EU tariffs on Chinese EVs/batteries (7.8-35.3%), US IRA domestic content requirements, EU CBAM full application from 2026. Trade-embedded climate instruments that change procurement economics and supply chain routing.", why_matters: "Trade restrictions redirect supply chains. EU EV tariffs change where fleet electrification components are sourced. US IRA domestic content requirements affect solar/battery procurement for warehouse projects. CBAM adds carbon cost to imports of steel, aluminium, cement — affecting customs workflows and import cost models.", key_data: ["EU EV tariffs on China: 7.8-35.3% by manufacturer","US IRA domestic content: required for clean energy tax credits","EU CBAM: full application 2026, covers steel/aluminium/cement/fertiliser/hydrogen","CBAM links import carbon cost to EU ETS price"], source_url: "https://taxation-customs.ec.europa.eu/carbon-border-adjustment-mechanism_en", priority: "HIGH" },
];

async function run() {
  const allItems = [...TECH_ITEMS, ...MARKET_ITEMS];

  console.log(`\n=== DOMAIN DATA MIGRATION ===`);
  console.log(`Technology items: ${TECH_ITEMS.length}`);
  console.log(`Market items: ${MARKET_ITEMS.length}`);
  console.log(`Total: ${allItems.length}`);
  console.log(`\nInserting...\n`);

  let inserted = 0;
  let skipped = 0;

  for (const item of allItems) {
    // Check if already exists by title
    const { data: existing } = await supabase
      .from("intelligence_items")
      .select("id")
      .eq("title", item.title)
      .limit(1);

    if (existing?.length) {
      console.log(`SKIP: ${item.title} (already exists)`);
      skipped++;
      continue;
    }

    const { error } = await supabase.from("intelligence_items").insert({
      title: item.title,
      domain: item.domain,
      category: item.category,
      item_type: item.domain === 2 ? "technology" : "market_signal",
      transport_modes: item.transport_modes,
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

  const { count } = await supabase.from("intelligence_items").select("*", { count: "exact", head: true });
  console.log(`\n=== COMPLETE ===`);
  console.log(`Inserted: ${inserted}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Total intelligence_items: ${count}`);
}

run();
