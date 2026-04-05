"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import {
  Zap, Battery, Fuel, Wind, Sun, Truck, Ship,
  ChevronDown, ExternalLink, TrendingUp, AlertCircle,
} from "lucide-react";

// ── Technology Categories ──
// These are the category-level items Domain 2 tracks.
// Not individual companies — categories of technology.

interface TechCategory {
  id: string;
  label: string;
  icon: typeof Battery;
  description: string;
  modes: string[];
  trl_range: string;
  cost_trajectory: string;
  key_metrics: {
    label: string;
    value: string;
    previous_value?: string;
    trajectory: string;
    decision_threshold: string;
    what_to_do: string;
    trend: "up" | "down" | "stable";
    source: string;
    source_url: string;
    update_frequency: string;
  }[];
  policy_signals: { signal: string; source: string; source_url: string }[];
  freight_relevance: string;
}

const TECH_CATEGORIES: TechCategory[] = [
  {
    id: "battery-ev",
    label: "Battery & Electric Vehicles",
    icon: Battery,
    description: "Battery technology trajectories, EV commercial vehicles (Class 4-8), charging infrastructure including MCS (Megawatt Charging System), and range/payload economics by region.",
    modes: ["road"],
    trl_range: "TRL 7-9 (light duty deployed, heavy duty scaling)",
    cost_trajectory: "Battery pack costs declining — approaching $100/kWh for LFP. Solid-state commercial timelines 2027-2030.",
    key_metrics: [
      { label: "Li-ion pack cost (2024)", value: "$115/kWh", previous_value: "$139/kWh (2023)", trajectory: "Declining ~15% annually. Was $1,200/kWh in 2010. LFP chemistry approaching $100/kWh — the threshold where electric trucks become cost-competitive with diesel on a TCO basis.", decision_threshold: "Below $100/kWh: EV fleet transition becomes financially advantageous for most drayage and last-mile operations without subsidies.", what_to_do: "If you operate drayage or last-mile fleets, begin TCO modelling for EV replacement now. If $115/kWh is already competitive on your routes, start procurement conversations. If not, monitor — parity is 12-18 months away at current trajectory.", trend: "down", source: "BloombergNEF", source_url: "https://about.bnef.com/energy-storage/", update_frequency: "Annual (BNEF Battery Price Survey, December)" },
      { label: "Class 8 EV range", value: "150-300 mi", previous_value: "100-200 mi (2022)", trajectory: "Range increasing ~30% every 2 years as battery density improves. 500+ mile range expected by 2028-2030 for long-haul applications.", decision_threshold: "300+ miles: viable for most regional distribution. 500+ miles: viable for long-haul trucking. Current range limits EV trucks to drayage, port-to-warehouse, and urban delivery.", what_to_do: "Map your route distances. If 80%+ of your truck routes are under 200 miles round-trip, EV trucks are viable today. For routes over 300 miles, plan for 2028-2030 transition or evaluate hydrogen alternatives.", trend: "up", source: "ICCT / OEM specifications", source_url: "https://theicct.org/sector/freight/", update_frequency: "Continuous (as OEMs release specs)" },
      { label: "MCS chargers deployed", value: "~200 globally", previous_value: "~50 (2023)", trajectory: "Megawatt Charging System (MCS) enables 1MW+ charging for heavy trucks — 80% charge in 30-45 minutes. Deployment doubling annually but still sparse outside EU and US highway corridors.", decision_threshold: "1,000+ chargers on your operating corridors: MCS-dependent EV trucks become operationally feasible for regional haul. Below that, depot charging only.", what_to_do: "Check MCS deployment on your key corridors via CharIN map. If coverage exists, include MCS-capable trucks in fleet procurement. If not, specify depot charging infrastructure and plan routes around overnight charging.", trend: "up", source: "CharIN MCS Working Group", source_url: "https://www.charin.global/", update_frequency: "Quarterly deployment reports" },
      { label: "EV truck TCO parity", value: "2026-2028 est.", previous_value: "2028-2030 (estimated in 2023)", trajectory: "Parity date moving forward as battery costs fall and diesel costs rise. California and EU already at parity for urban drayage when incentives are included.", decision_threshold: "TCO parity = the year when owning and operating an EV truck costs the same or less than diesel over the vehicle lifetime. After parity, every new diesel purchase is a stranded asset risk.", what_to_do: "Do not sign long-term diesel fleet contracts extending past 2028 without an exit clause. Begin pilot EV deployment now on your shortest, highest-frequency routes to build operational experience before parity hits.", trend: "down", source: "ICCT / RMI", source_url: "https://theicct.org/sector/freight/", update_frequency: "Annual analysis updates" },
    ],
    policy_signals: [
      { signal: "EU CO2 standards for HDVs (2030/2040 targets)", source: "EUR-Lex", source_url: "https://eur-lex.europa.eu" },
      { signal: "CARB Advanced Clean Trucks mandate", source: "CARB", source_url: "https://ww2.arb.ca.gov/our-work/programs/advanced-clean-trucks" },
      { signal: "UK ZEV mandate for trucks", source: "UK DfT", source_url: "https://www.gov.uk/government/organisations/department-for-transport" },
      { signal: "US IRA commercial vehicle credits", source: "IRS / Federal Register", source_url: "https://www.federalregister.gov" },
    ],
    freight_relevance: "Direct impact on drayage and last-mile delivery fleet. MCS infrastructure determines viability of long-haul electric. Key for warehouse-to-port corridors.",
  },
  {
    id: "saf",
    label: "Sustainable Aviation Fuel",
    icon: Fuel,
    description: "SAF production capacity by feedstock pathway (HEFA, Fischer-Tropsch, alcohol-to-jet, e-fuels), cost premium by region, and mandate compliance timelines.",
    modes: ["air"],
    trl_range: "TRL 8-9 (HEFA deployed, PtL scaling)",
    cost_trajectory: "HEFA SAF at 2-3x conventional jet fuel. E-fuel/PtL at 5-8x but declining. Production capacity lagging mandate volumes.",
    key_metrics: [
      { label: "Global SAF production (2024)", value: "~0.5Mt", previous_value: "~0.3Mt (2023)", trajectory: "Production growing ~50% annually but still represents less than 0.2% of global jet fuel demand (~300Mt). Massive gap between production and mandate requirements.", decision_threshold: "Mandate compliance requires SAF to be available AND affordable at departure airports. If your air freight originates from airports with no SAF supply, carriers will pass through procurement costs to source it elsewhere.", what_to_do: "Ask your air cargo carriers which airports have SAF supply today. Factor SAF surcharges into air freight quotes. Clients requesting 'green air freight' need to understand the cost premium and that SAF availability is route-dependent.", trend: "up", source: "IEA / ICAO", source_url: "https://www.iea.org/energy-system/transport/aviation", update_frequency: "Annual (IEA World Energy Outlook)" },
      { label: "SAF % of jet fuel", value: "<1%", previous_value: "<0.1% (2022)", trajectory: "Growing but far below mandate targets. ReFuelEU requires 2% by 2025, 6% by 2030, 20% by 2035, 70% by 2050. Current production cannot meet even the 2025 target globally.", decision_threshold: "When SAF exceeds 5% of jet fuel: expect meaningful air cargo rate impact. Below 5%: surcharges exist but are manageable. Above 20%: structural shift in air freight pricing.", what_to_do: "Build SAF surcharge pass-through into all air freight contracts now. It will only increase. Offer clients modal shift (air → ocean) with quantified emissions savings as an alternative.", trend: "up", source: "IATA", source_url: "https://www.iata.org/en/programs/environment/sustainable-aviation-fuels/", update_frequency: "Annual" },
      { label: "HEFA premium vs conventional", value: "2-3x", previous_value: "3-5x (2022)", trajectory: "HEFA (waste oil-based) SAF is the cheapest pathway. Premium declining as production scales. E-fuels (Power-to-Liquid) remain 5-8x and unlikely to compete before 2035.", decision_threshold: "At 1.5x premium: SAF becomes a standard fuel component, no longer a premium product. At 2x: competitive for mandated blending. Above 3x: only used for compliance, not voluntarily.", what_to_do: "When quoting air cargo, include a SAF cost line showing the current premium. Clients need visibility. Track HEFA feedstock prices (used cooking oil) as a leading indicator of SAF cost.", trend: "down", source: "ICCT", source_url: "https://theicct.org/sector/freight/", update_frequency: "Annual cost analysis" },
      { label: "ReFuelEU 2025 mandate", value: "2%", previous_value: "N/A (new regulation)", trajectory: "Fixed legislative escalation: 2% (2025) → 6% (2030) → 20% (2035) → 34% (2040) → 42% (2045) → 70% (2050). Sub-mandate for synthetic fuels from 2030.", decision_threshold: "Each escalation step will increase air cargo costs. The 6% (2030) step is the first where most air freight operators will see material cost impact.", what_to_do: "Include ReFuelEU mandate timeline in all long-term air freight contract negotiations. Ensure escalation clauses cover SAF cost pass-through. Advise clients that ex-EU air cargo will carry increasing carbon cost.", trend: "up", source: "EUR-Lex (Reg. 2023/2405)", source_url: "https://eur-lex.europa.eu/eli/reg/2023/2405/oj", update_frequency: "Fixed legislative schedule" },
    ],
    policy_signals: [
      { signal: "ReFuelEU Aviation: 2% (2025) → 6% (2030) → 70% (2050)", source: "EUR-Lex", source_url: "https://eur-lex.europa.eu/eli/reg/2023/2405/oj" },
      { signal: "UK SAF mandate: 2% (2025) → 10% (2030) → 50% (2050)", source: "UK DfT", source_url: "https://www.gov.uk/government/publications/sustainable-aviation-fuel-mandate" },
      { signal: "ICAO CORSIA eligible fuels list", source: "ICAO", source_url: "https://www.icao.int/CORSIA" },
      { signal: "US IRA SAF tax credit ($1.25-1.75/gal)", source: "IRS", source_url: "https://www.irs.gov/credits-deductions/businesses/sustainable-aviation-fuel-credit" },
    ],
    freight_relevance: "Air cargo rates directly affected by SAF blend mandates. Carriers pass through SAF costs as surcharges. Clients requesting SAF certificates for Scope 3 reporting.",
  },
  {
    id: "hydrogen",
    label: "Green Hydrogen",
    icon: Wind,
    description: "Green H2 cost curves by production pathway, refueling infrastructure by corridor, and application readiness for heavy transport and marine fuels.",
    modes: ["road", "ocean"],
    trl_range: "TRL 5-7 (production proven, distribution scaling)",
    cost_trajectory: "Green H2 at $4-6/kg (2024). Target <$2/kg by 2030 for transport competitiveness. Infrastructure is the bottleneck.",
    key_metrics: [
      { label: "Green H2 cost (2024)", value: "$4-6/kg", previous_value: "$6-10/kg (2022)", trajectory: "Declining as electrolyzer costs fall and renewable electricity gets cheaper. Target: below $2/kg by 2030 for transport competitiveness. Grey H2 (from natural gas) is $1-2/kg — green must approach this to compete.", decision_threshold: "Below $3/kg: hydrogen trucks become TCO-competitive with diesel for long-haul. Below $2/kg: hydrogen becomes viable across most freight applications.", what_to_do: "Hydrogen is not ready for fleet deployment at current costs. Monitor for regional subsidies that close the gap. If you operate long-haul routes where EV range is insufficient, hydrogen is the alternative to watch.", trend: "down", source: "IEA Global Hydrogen Review", source_url: "https://www.iea.org/reports/global-hydrogen-review-2025", update_frequency: "Annual (IEA flagship report)" },
      { label: "Electrolyzer capacity (2024)", value: "~4 GW global", previous_value: "~1 GW (2022)", trajectory: "Quadrupled in 2 years. Pipeline of 300+ GW announced but only ~10% at final investment decision. Actual deployment will determine if H2 cost targets are met.", decision_threshold: "50+ GW deployed: green H2 supply becomes reliable enough for logistics infrastructure planning. Below that: spot market only.", what_to_do: "Track electrolyzer deployment in regions where you operate. Early H2 supply = early mover advantage for green freight corridors.", trend: "up", source: "IEA Global Hydrogen Review", source_url: "https://www.iea.org/reports/global-hydrogen-review-2025", update_frequency: "Annual" },
      { label: "H2 refueling stations", value: "~1,000 global", previous_value: "~700 (2022)", trajectory: "Growing but concentrated in Japan, South Korea, Germany, and California. Most are for passenger vehicles — heavy-duty truck refueling is almost nonexistent.", decision_threshold: "Until H2 refueling exists on your freight corridors, hydrogen trucks are depot-return only. Corridor coverage determines operational viability.", what_to_do: "Do not procure hydrogen trucks unless refueling exists on your routes or you operate from a depot with on-site H2. Check national H2 infrastructure roadmaps for your operating jurisdictions.", trend: "up", source: "IEA / H2 Council", source_url: "https://hydrogencouncil.com/", update_frequency: "Annual deployment count" },
      { label: "H2 truck models available", value: "3-5 OEMs", previous_value: "1-2 OEMs (2022)", trajectory: "Hyundai XCIENT (deployed in Switzerland/Germany), Nikola FCEV, Toyota/Hino prototypes. More models coming 2025-2027 but volumes are tiny vs EV trucks.", decision_threshold: "When 5+ OEMs offer production-ready H2 trucks with established service networks: consider for fleet planning. Currently: pilot-only.", what_to_do: "Participate in H2 truck pilot programmes if available in your region (EU, Korea, California) to build operational knowledge. Do not commit to fleet conversion until refueling infrastructure exists.", trend: "up", source: "ICCT / OEM announcements", source_url: "https://theicct.org/sector/freight/", update_frequency: "Continuous" },
    ],
    policy_signals: [
      { signal: "EU Hydrogen Strategy: 10Mt domestic + 10Mt import by 2030", source: "European Commission", source_url: "https://ec.europa.eu/commission/presscorner/home/en" },
      { signal: "US DOE Hydrogen Shot: $1/kg target", source: "US DOE", source_url: "https://www.energy.gov/eere/fuelcells/hydrogen-shot" },
      { signal: "Japan Green Growth Strategy: hydrogen backbone", source: "METI", source_url: "https://www.meti.go.jp/english/" },
      { signal: "IMO alternative fuels framework includes hydrogen carriers", source: "IMO", source_url: "https://www.imo.org" },
    ],
    freight_relevance: "Long-haul trucking alternative where battery-electric range is insufficient. Marine fuel pathway via ammonia/methanol. Infrastructure corridor development determines route planning.",
  },
  {
    id: "marine-fuels",
    label: "Marine Alternative Fuels",
    icon: Ship,
    description: "Ammonia, methanol, biofuels, LNG — vessel order books, fuel availability by port, and FuelEU Maritime compliance pathways.",
    modes: ["ocean"],
    trl_range: "TRL 6-8 (LNG deployed, ammonia/methanol scaling)",
    cost_trajectory: "LNG established but transitional. Green methanol at 2-4x conventional. Ammonia infrastructure nascent. Dual-fuel vessels ordered at record pace.",
    key_metrics: [
      { label: "Alt-fuel capable orders (2024)", value: "~45% of new tonnage", previous_value: "~30% (2022)", trajectory: "Nearly half of all new vessel orders can run on alternative fuels (LNG, methanol, ammonia). This fleet turnover will take 20-25 years to fully replace conventional vessels.", decision_threshold: "When 50%+ of active fleet (not just orders) is alt-fuel capable: expect green shipping premium to decrease as supply normalises. Currently <5% of active fleet.", what_to_do: "Ask your ocean carriers what percentage of their fleet is alt-fuel capable and what their transition timeline is. Carriers investing ahead will offer competitive green freight rates sooner.", trend: "up", source: "DNV Alternative Fuels Insight", source_url: "https://www.dnv.com/services/alternative-fuels-insight/", update_frequency: "Quarterly order book updates" },
      { label: "Methanol-ready vessels", value: "~200 on order", previous_value: "~50 (2022)", trajectory: "Methanol emerging as the leading alternative marine fuel — Maersk, CMA CGM, and others ordering methanol-capable container ships. Green methanol supply is the bottleneck, not vessel availability.", decision_threshold: "When green methanol is available at major bunkering ports on your trade lanes: green ocean freight becomes a procurement option, not just a marketing claim.", what_to_do: "Monitor green methanol bunkering availability at your key ports. Request methanol-fueled vessel allocation from carriers when available. Include fuel pathway in Scope 3 reporting.", trend: "up", source: "DNV / Clarksons", source_url: "https://www.dnv.com/services/alternative-fuels-insight/", update_frequency: "Quarterly" },
      { label: "LNG bunker ports", value: "~200 globally", previous_value: "~150 (2022)", trajectory: "LNG bunkering is the most mature alternative fuel infrastructure. However, LNG is a transitional fuel — it reduces CO2 by ~20% vs conventional fuel but methane slip is a concern.", decision_threshold: "LNG is available now on most major trade lanes. The question is whether to invest in LNG or skip to methanol/ammonia. IMO Net-Zero Framework may disadvantage LNG post-2030.", what_to_do: "LNG-fueled vessels are a short-term decarbonization option. For contracts beyond 2030, evaluate whether LNG will remain compliant under evolving IMO regulations before committing.", trend: "up", source: "SEA-LNG / DNV", source_url: "https://sea-lng.org/", update_frequency: "Quarterly" },
      { label: "Green methanol premium", value: "2-4x conv.", previous_value: "4-6x (2022)", trajectory: "Premium declining as production scales. Grey methanol is abundant and cheap (~$300/tonne). Green methanol from renewable sources is $800-1,200/tonne. Needs to reach $500/tonne for wide adoption.", decision_threshold: "At 1.5x premium: green methanol becomes a standard bunkering option. At 2x: viable for mandated compliance. Above 3x: compliance-only use.", what_to_do: "Include FuelEU Maritime compliance cost projections in ocean freight contracts. Green methanol surcharges will appear on EU port-touching voyages as FuelEU GHG intensity targets tighten.", trend: "down", source: "IRENA / Methanol Institute", source_url: "https://www.irena.org/Publications", update_frequency: "Annual" },
    ],
    policy_signals: [
      { signal: "FuelEU Maritime: GHG intensity limits from 2025", source: "EUR-Lex (Reg. 2023/1805)", source_url: "https://eur-lex.europa.eu/eli/reg/2023/1805/oj" },
      { signal: "IMO Net-Zero Framework fuel standard", source: "IMO", source_url: "https://www.imo.org/en/ourwork/environment/pages/2023-imo-strategy-on-reduction-of-ghg-emissions-from-ships.aspx" },
      { signal: "EU ETS maritime: phased surrender obligation", source: "EC DG CLIMA", source_url: "https://climate.ec.europa.eu/eu-action/transport-decarbonisation/reducing-emissions-shipping-sector_en" },
      { signal: "Getting to Zero Coalition green corridors", source: "Global Maritime Forum", source_url: "https://www.getzerocoalition.org/" },
    ],
    freight_relevance: "Carrier fuel choices directly impact surcharge structures. Green corridor availability affects routing. FuelEU penalties passed through to shippers.",
  },
  {
    id: "solar-bess",
    label: "Rooftop Solar & Battery Storage",
    icon: Sun,
    description: "Commercial/industrial rooftop solar permitting, ROI by jurisdiction, and battery energy storage systems for warehouse and facility optimization.",
    modes: ["air", "road", "ocean"],
    trl_range: "TRL 9 (fully deployed)",
    cost_trajectory: "Solar PV LCOE at historic lows. BESS costs declining 10-15% annually. Warehouse rooftop solar ROI typically 4-7 years depending on jurisdiction.",
    key_metrics: [
      { label: "Utility-scale solar LCOE", value: "$0.03-0.05/kWh", previous_value: "$0.05-0.08/kWh (2020)", trajectory: "Solar is now the cheapest electricity source in history in most regions. Costs continue declining 5-8% annually. Warehouse rooftop solar pays for itself in 4-7 years.", decision_threshold: "Below your local grid tariff: solar installation has positive ROI from day one. In most jurisdictions this threshold is already met.", what_to_do: "Get a PVWatts estimate for your warehouse rooftops. If payback is under 6 years, proceed with installation. If you lease your warehouse, negotiate solar clause with landlord or use a PPA (Power Purchase Agreement) model.", trend: "down", source: "IRENA Renewable Power Generation Costs", source_url: "https://www.irena.org/Energy-Transition/Technology/Power-generation-costs", update_frequency: "Annual (July publication)" },
      { label: "BESS cost (2024)", value: "$150-200/kWh", previous_value: "$300/kWh (2020)", trajectory: "Battery storage halved in 4 years. At $100/kWh (expected 2027-2028), warehouse BESS becomes viable for peak demand shaving and EV fleet charging without grid upgrades.", decision_threshold: "Below $120/kWh: BESS pays for itself through demand charge reduction at most commercial electricity rates. Currently viable in high-tariff jurisdictions (California, Germany, UK).", what_to_do: "Model BESS economics using your electricity bill demand charges. If peak charges exceed $15/kW/month, BESS is likely already viable. Combine with solar for maximum ROI.", trend: "down", source: "BloombergNEF", source_url: "https://about.bnef.com/energy-storage/", update_frequency: "Annual (December battery price survey)" },
      { label: "Commercial solar ROI", value: "4-7 years", previous_value: "6-10 years (2020)", trajectory: "Payback shortening as panel costs fall and electricity tariffs rise. Some jurisdictions (Australia, California) see 3-4 year payback. Middle East has excellent irradiance but regulations vary.", decision_threshold: "Under 5 years: strong investment case. Under 7 years: solid. Over 10 years: wait for costs to decline further or incentives to improve.", what_to_do: "Run NREL PVWatts or SAM model for each warehouse location. Compare payback across your portfolio to prioritize installations. Start with highest-tariff locations.", trend: "down", source: "NREL / IRENA", source_url: "https://pvwatts.nrel.gov", update_frequency: "Continuous (model updates)" },
      { label: "Global solar capacity added (2024)", value: "~440 GW", previous_value: "~270 GW (2022)", trajectory: "World added more solar in 2024 than the entire installed base existed in 2018. China alone added ~217 GW. Supply chain constraints have eased — panels are abundant and cheap.", decision_threshold: "This metric indicates market maturity. At 440 GW/year additions, solar equipment supply is not a constraint. Procurement lead times are weeks, not months.", what_to_do: "There is no supply-side reason to delay solar installation. The constraint is now permitting, grid connection, and building suitability — not panel availability.", trend: "up", source: "IRENA Data Portal", source_url: "https://www.irena.org/Data", update_frequency: "Annual (March capacity data)" },
    ],
    policy_signals: [
      { signal: "DEWA Shams Dubai: commercial net metering (verify current status)", source: "DEWA", source_url: "https://www.dewa.gov.ae/en/consumers/innovation/shams-dubai" },
      { signal: "EU Energy Performance of Buildings Directive (EPBD recast)", source: "EUR-Lex", source_url: "https://eur-lex.europa.eu" },
      { signal: "US IRA Investment Tax Credit (30%)", source: "US DOE", source_url: "https://www.energy.gov/eere/solar/federal-solar-tax-credits-businesses" },
      { signal: "Various national feed-in tariffs and net metering programs", source: "IEA Policies Database", source_url: "https://www.iea.org/policies/about" },
    ],
    freight_relevance: "Warehouse electricity cost reduction. On-site charging infrastructure for EV fleet. Client sustainability requirements for facility operations. Green building certifications.",
  },
  {
    id: "autonomous-freight",
    label: "Autonomous Freight",
    icon: Truck,
    description: "Regulatory status of autonomous trucking by jurisdiction, commercial deployment timelines, and infrastructure readiness.",
    modes: ["road"],
    trl_range: "TRL 6-7 (limited commercial deployment)",
    cost_trajectory: "Hub-to-hub autonomous trucking approaching commercial viability on select US corridors. Last-mile autonomy still 5+ years out.",
    key_metrics: [
      { label: "Autonomous truck permits (US)", value: "TX, NM, AZ active", previous_value: "TX only (2022)", trajectory: "State-by-state permitting. No federal standard. Texas, New Mexico, Arizona allow driverless operations. California, New York have restrictive frameworks. Fragmented regulation creates corridor-specific viability.", decision_threshold: "When your operating corridors have autonomous permits AND commercial operators running: evaluate for hub-to-hub linehaul. Until then: monitor only.", what_to_do: "Track which states your freight routes cross. If Texas-to-California corridor or Sun Belt corridors are relevant, autonomous trucks may affect your competitive landscape within 3-5 years.", trend: "up", source: "State DOTs / FMCSA", source_url: "https://www.fmcsa.dot.gov/", update_frequency: "Ad hoc (state permit announcements)" },
      { label: "Commercial deployments", value: "3-5 operators", previous_value: "1 (2022)", trajectory: "Aurora, Kodiak, Gatik, TuSimple (restructured) operating limited commercial routes. All hub-to-hub only — no last-mile autonomy. Total autonomous truck-miles are <0.01% of US trucking.", decision_threshold: "When autonomous operators offer commercial capacity on routes you use: evaluate for cost and reliability. Currently: pilot-stage only.", what_to_do: "No immediate action required. This is a 5-10 year planning horizon. Monitor for route-specific commercial availability. The first impact will be on long-haul US interstate corridors.", trend: "up", source: "Industry announcements / FreightWaves", source_url: "https://www.freightwaves.com/news/category/autonomous", update_frequency: "Continuous" },
      { label: "EU regulatory framework", value: "In development", previous_value: "No framework (2022)", trajectory: "EU Automated Vehicles Regulation in legislative process. Will set type-approval and operational requirements. UK passed Automated Vehicles Act 2024. EU expected 2026-2027.", decision_threshold: "Until EU/UK frameworks are finalized: autonomous trucking is not legally possible in Europe. After framework adoption: 2-3 year implementation period before commercial operations.", what_to_do: "For European operations: no action needed now. Track the EU legislative timeline. For UK: monitor AV Act implementation guidance.", trend: "stable", source: "European Commission", source_url: "https://ec.europa.eu/commission/presscorner/home/en", update_frequency: "Ad hoc (legislative process)" },
      { label: "Driver cost share of trucking", value: "~35-40%", previous_value: "~35-40% (stable)", trajectory: "Driver wages are the largest single cost in trucking. Chronic driver shortage in US and EU is pushing wages up. Autonomous trucks eliminate this cost for hub-to-hub segments.", decision_threshold: "This metric explains WHY autonomous trucking attracts investment. At 35-40% of total cost, removing the driver is a larger savings than any fuel efficiency improvement.", what_to_do: "Factor driver availability and cost escalation into your 5-year trucking procurement strategy. If you rely on subcontracted trucking, understand your carriers' exposure to driver shortage.", trend: "stable", source: "American Trucking Associations", source_url: "https://www.trucking.org/", update_frequency: "Annual cost analysis" },
    ],
    policy_signals: [
      { signal: "US state-by-state permit framework (no federal standard)", source: "FMCSA / State DOTs", source_url: "https://www.fmcsa.dot.gov/" },
      { signal: "EU Automated Vehicles Regulation (in progress)", source: "European Commission", source_url: "https://ec.europa.eu/commission/presscorner/home/en" },
      { signal: "UK Automated Vehicles Act 2024", source: "UK legislation.gov.uk", source_url: "https://www.legislation.gov.uk/" },
      { signal: "China highway pilot programs", source: "MIIT / MOT China", source_url: "https://www.miit.gov.cn/" },
    ],
    freight_relevance: "Long-term labor cost and capacity planning. Route planning for autonomous-capable corridors. Insurance and liability framework implications.",
  },
];

// ── Tech Category Card ──

function TechCategoryCard({ category }: { category: TechCategory }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = category.icon;

  return (
    <div
      className="border rounded-lg overflow-hidden transition-all duration-200"
      style={{
        borderColor: expanded ? "var(--color-border-strong)" : "var(--color-border)",
        backgroundColor: "var(--color-surface)",
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-4 p-4 text-left cursor-pointer hover:bg-[var(--color-surface-raised)] transition-colors duration-150"
      >
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: "var(--color-active-bg)" }}
        >
          <Icon size={20} style={{ color: "var(--color-primary)" }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
              {category.label}
            </h3>
            <ChevronDown
              size={14}
              className={cn("shrink-0 transition-transform duration-200", expanded && "rotate-180")}
              style={{ color: "var(--color-text-muted)" }}
            />
          </div>
          <p className="text-xs mt-1 line-clamp-2" style={{ color: "var(--color-text-secondary)" }}>
            {category.description}
          </p>
          <div className="flex items-center gap-2 mt-2">
            {category.modes.map((m) => (
              <span
                key={m}
                className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-md"
                style={{
                  color: "var(--color-text-secondary)",
                  backgroundColor: "var(--color-surface-raised)",
                  border: "1px solid var(--color-border)",
                }}
              >
                {m}
              </span>
            ))}
            <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
              {category.trl_range}
            </span>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t" style={{ borderColor: "var(--color-border-subtle)" }}>
          {/* Key Metrics */}
          <div className="pt-3">
            <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
              Key Metrics
            </span>
            <div className="space-y-3 mt-2">
              {category.key_metrics.map((metric, i) => (
                <MetricCard key={i} metric={metric} />
              ))}
            </div>
          </div>

          {/* Cost Trajectory */}
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
              Cost Trajectory
            </span>
            <p className="text-xs mt-1" style={{ color: "var(--color-text-secondary)" }}>
              {category.cost_trajectory}
            </p>
          </div>

          {/* Policy Signals */}
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
              Policy Acceleration Signals
            </span>
            <ul className="mt-1 space-y-1.5">
              {category.policy_signals.map((ps, i) => (
                <li key={i} className="text-xs flex items-start gap-2" style={{ color: "var(--color-text-secondary)" }}>
                  <AlertCircle size={10} className="shrink-0 mt-0.5" style={{ color: "var(--color-primary)" }} />
                  <div>
                    <span>{ps.signal}</span>
                    <a
                      href={ps.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1.5 text-[10px] hover:underline"
                      style={{ color: "var(--color-primary)" }}
                    >
                      ({ps.source})
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Freight Relevance */}
          <div
            className="p-3 rounded-lg border-l-3"
            style={{
              backgroundColor: "var(--color-active-bg)",
              borderLeftWidth: 3,
              borderLeftColor: "var(--color-primary)",
            }}
          >
            <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-primary)" }}>
              Freight Forwarding Relevance
            </span>
            <p className="text-xs mt-1" style={{ color: "var(--color-text-primary)" }}>
              {category.freight_relevance}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ──

// ── Metric Card with full context ──

function MetricCard({ metric }: { metric: TechCategory["key_metrics"][0] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="p-3 rounded-lg"
      style={{ backgroundColor: "var(--color-surface-raised)" }}
    >
      {/* Header: label + value + trend */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left cursor-pointer"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>
            {metric.label}
          </span>
          <div className="flex items-center gap-2">
            <TrendingUp
              size={10}
              style={{
                color: metric.trend === "down" ? "var(--color-success)" : metric.trend === "up" ? "var(--color-primary)" : "var(--color-text-muted)",
                transform: metric.trend === "down" ? "rotate(180deg)" : undefined,
              }}
            />
          </div>
        </div>
        <div className="flex items-baseline gap-2 mt-0.5">
          <span className="text-lg font-bold tabular-nums" style={{ color: "var(--color-text-primary)" }}>
            {metric.value}
          </span>
          {metric.previous_value && (
            <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
              was {metric.previous_value}
            </span>
          )}
        </div>
      </button>

      {/* Expanded context */}
      {expanded && (
        <div className="mt-3 space-y-2.5 border-t pt-3" style={{ borderColor: "var(--color-border-subtle)" }}>
          {/* Trajectory */}
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
              Trajectory
            </span>
            <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
              {metric.trajectory}
            </p>
          </div>

          {/* Decision threshold */}
          <div
            className="p-2 rounded border-l-2"
            style={{
              borderLeftColor: "var(--color-warning)",
              backgroundColor: "rgba(217, 119, 6, 0.04)",
            }}
          >
            <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-warning)" }}>
              Decision Threshold
            </span>
            <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "var(--color-text-primary)" }}>
              {metric.decision_threshold}
            </p>
          </div>

          {/* What to do */}
          <div
            className="p-2 rounded border-l-2"
            style={{
              borderLeftColor: "var(--color-primary)",
              backgroundColor: "var(--color-active-bg)",
            }}
          >
            <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-primary)" }}>
              What To Do
            </span>
            <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "var(--color-text-primary)" }}>
              {metric.what_to_do}
            </p>
          </div>

          {/* Data source + frequency */}
          <div className="flex items-center justify-between text-[10px]" style={{ color: "var(--color-text-muted)" }}>
            <a
              href={metric.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
              style={{ color: "var(--color-primary)" }}
            >
              Data: {metric.source}
            </a>
            <span>Updates: {metric.update_frequency}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function TechnologyTracker() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>
          Energy & Technology Innovation
        </h2>
        <p className="text-sm mt-1" style={{ color: "var(--color-text-secondary)" }}>
          Category-level tracking across transport energy and technology. Cost curves, deployment status, and policy signals.
        </p>
      </div>

      <div className="space-y-3">
        {TECH_CATEGORIES.map((cat) => (
          <TechCategoryCard key={cat.id} category={cat} />
        ))}
      </div>
    </div>
  );
}
