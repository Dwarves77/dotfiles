"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import {
  Globe, Sun, Zap, Users, Building, ChevronDown,
  AlertCircle, CheckCircle, HelpCircle, ExternalLink,
} from "lucide-react";

// ── Regional Data Structure ──

interface DataPoint {
  status: string;
  details: string;
  confidence: "confirmed" | "unconfirmed";
  data_provider: string;
  data_url: string;
  last_updated: string;
  update_frequency: string;
}

interface RegionalProfile {
  id: string;
  jurisdiction: string;
  region: string;
  priority: "high" | "medium" | "low";
  data: {
    solar: DataPoint;
    electricity: DataPoint;
    labor: DataPoint;
    ev_charging: DataPoint;
    green_building: DataPoint;
    active_regulations: string[];
  };
  open_questions: string[];
}

const REGIONAL_PROFILES: RegionalProfile[] = [
  {
    id: "uae-dubai",
    jurisdiction: "Dubai / UAE",
    region: "Middle East",
    priority: "high",
    data: {
      solar: {
        status: "Permitted — DEWA Shams Dubai",
        details: "DEWA Shams Dubai program (Version 4, June 2022) explicitly permits commercial and industrial rooftop solar with net metering. Contradicts prior claim that commercial solar is prohibited. REQUIRES LIVE VERIFICATION.",
        confidence: "unconfirmed",
        data_provider: "DEWA",
        data_url: "https://www.dewa.gov.ae/en/consumers/innovation/shams-dubai",
        last_updated: "June 2022 (Version 4)",
        update_frequency: "Ad hoc regulatory updates",
      },
      electricity: {
        status: "AED 0.23-0.38/kWh commercial",
        details: "DEWA commercial tariff varies by consumption slab. Free zone tariffs may differ from mainland. Slab structure: 0-2000 kWh, 2001-4000 kWh, 4001-6000 kWh, 6000+ kWh.",
        confidence: "confirmed",
        data_provider: "DEWA Tariff Schedule",
        data_url: "https://www.dewa.gov.ae/en/consumer/billing/slab-tariff",
        last_updated: "2024",
        update_frequency: "Annual tariff review",
      },
      labor: {
        status: "AED 3,000-5,000/month (logistics roles)",
        details: "Labor costs for warehouse and monitoring roles. Subject to visa and labor law requirements. UAE Labour Law Federal Decree-Law No. 33 of 2021.",
        confidence: "confirmed",
        data_provider: "UAE MOHRE",
        data_url: "https://www.mohre.gov.ae",
        last_updated: "2024",
        update_frequency: "Annual wage surveys",
      },
      ev_charging: {
        status: "DEWA Green Charger initiative",
        details: "DEWA operates public charging network. Commercial fleet charging infrastructure expanding. Dubai Green Mobility Strategy targets 42% green trips by 2030.",
        confidence: "confirmed",
        data_provider: "DEWA / RTA Dubai",
        data_url: "https://www.dewa.gov.ae/en/consumer/ev-green-charger",
        last_updated: "2024",
        update_frequency: "Quarterly infrastructure updates",
      },
      green_building: {
        status: "Estidama Pearl (Abu Dhabi), Al Sa'fat (Dubai)",
        details: "Abu Dhabi requires Estidama Pearl for government buildings. Dubai Municipality Al Sa'fat system for new buildings.",
        confidence: "confirmed",
        data_provider: "Abu Dhabi UPC / Dubai Municipality",
        data_url: "https://www.abudhabi.ae/en/infrastructure-environment/environment/estidama",
        last_updated: "2024",
        update_frequency: "Ad hoc standard updates",
      },
      active_regulations: [
        "DEWA Shams Dubai rooftop solar (verify current status)",
        "UAE Net Zero 2050 strategy",
        "Dubai Clean Energy Strategy 2050",
      ],
    },
    open_questions: [
      "DEWA Shams Dubai: verify current program terms and any amendments since Version 4 (June 2022)",
      "Free zone vs mainland electricity tariff differential for warehouse operations",
      "Commercial fleet EV charging infrastructure in Jebel Ali Free Zone",
    ],
  },
  {
    id: "uk",
    jurisdiction: "United Kingdom",
    region: "Europe",
    priority: "high",
    data: {
      solar: {
        status: "Permitted — feed-in tariff ended, SEG active",
        details: "Smart Export Guarantee (SEG) replaced feed-in tariff. Commercial rooftop solar permitted with planning permission. ROI varies by region and DNO capacity.",
        confidence: "confirmed",
        data_provider: "Ofgem",
        data_url: "https://www.ofgem.gov.uk/environmental-and-social-schemes/smart-export-guarantee-seg",
        last_updated: "2024",
        update_frequency: "Annual Ofgem review",
      },
      electricity: {
        status: "£0.25-0.35/kWh commercial (2024)",
        details: "Electricity prices elevated post-energy crisis. Regional variation significant. Industrial contracts typically lower than published rates.",
        confidence: "confirmed",
        data_provider: "Ofgem / DESNZ",
        data_url: "https://www.gov.uk/government/statistical-data-sets/industrial-energy-prices",
        last_updated: "Q4 2024",
        update_frequency: "Quarterly",
      },
      labor: {
        status: "£25,000-35,000/year (warehouse/logistics)",
        details: "National Living Wage £11.44/hr (April 2024). London premium ~15-20%. Warehouse operative median ~£26,000/yr.",
        confidence: "confirmed",
        data_provider: "ONS Annual Survey of Hours and Earnings",
        data_url: "https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/earningsandworkinghours",
        last_updated: "November 2024",
        update_frequency: "Annual (November release)",
      },
      ev_charging: {
        status: "Expanding — ZEV mandate driving fleet adoption",
        details: "UK ZEV mandate requires increasing zero-emission vehicle sales. Rapid charging network growing. Workplace Charging Scheme provides up to £350/socket.",
        confidence: "confirmed",
        data_provider: "UK DfT / OZEV",
        data_url: "https://www.gov.uk/government/organisations/office-for-zero-emission-vehicles",
        last_updated: "2024",
        update_frequency: "Quarterly deployment stats",
      },
      green_building: {
        status: "BREEAM",
        details: "BREEAM is the primary green building standard. Not mandatory for all buildings but increasingly required by institutional investors and large tenants.",
        confidence: "confirmed",
        data_provider: "BRE Global",
        data_url: "https://www.breeam.com",
        last_updated: "2024",
        update_frequency: "Ad hoc standard updates",
      },
      active_regulations: [
        "UK ETS (post-Brexit, separate from EU ETS)",
        "UK SAF mandate (2% from 2025)",
        "ZEV mandate (trucks)",
        "UK EPR packaging",
        "Environment Act 2021",
      ],
    },
    open_questions: [
      "UK-EU ETS linkage negotiations — status and timeline",
      "Impact of UK SAF mandate on air cargo surcharges ex-UK",
    ],
  },
  {
    id: "eu-core",
    jurisdiction: "EU (Germany, Netherlands, Belgium, France, Italy)",
    region: "Europe",
    priority: "high",
    data: {
      solar: {
        status: "Permitted — varying incentive structures by member state",
        details: "Germany: EEG feed-in. Netherlands: SDE++ subsidy. Belgium: green certificates (regional). France: feed-in premium. Italy: tax deduction.",
        confidence: "confirmed",
        data_provider: "IEA Policies and Measures Database",
        data_url: "https://www.iea.org/policies/about",
        last_updated: "2024",
        update_frequency: "Quarterly policy database updates",
      },
      electricity: {
        status: "€0.15-0.35/kWh (varies by country)",
        details: "Germany highest (~€0.30), France lower (~€0.20 nuclear base). Network charges are a significant component. Industrial rates lower than commercial.",
        confidence: "confirmed",
        data_provider: "IEA Energy Prices Database",
        data_url: "https://www.iea.org/data-and-statistics/data-product/energy-prices",
        last_updated: "Q3 2024",
        update_frequency: "Quarterly (OECD countries)",
      },
      labor: {
        status: "€30,000-45,000/year (warehouse/logistics)",
        details: "Germany and Netherlands highest. Southern/Eastern EU significantly lower. Minimum wages vary: Germany €12.82/hr, France €11.65/hr, Netherlands €13.27/hr.",
        confidence: "confirmed",
        data_provider: "Eurostat Labour Cost Index",
        data_url: "https://ec.europa.eu/eurostat/web/labour-market/labour-costs",
        last_updated: "2024",
        update_frequency: "Quarterly",
      },
      ev_charging: {
        status: "AFIR mandates minimum infrastructure",
        details: "EU Alternative Fuels Infrastructure Regulation requires charging every 60km on TEN-T core network by 2025. Member state implementation varies significantly.",
        confidence: "confirmed",
        data_provider: "European Alternative Fuels Observatory",
        data_url: "https://alternative-fuels-observatory.ec.europa.eu/",
        last_updated: "2024",
        update_frequency: "Quarterly deployment statistics",
      },
      green_building: {
        status: "BREEAM / DGNB / HQE (varies by country)",
        details: "BREEAM dominant in NL/BE, DGNB in Germany, HQE in France. EPBD recast driving mandatory minimum energy performance standards across all member states.",
        confidence: "confirmed",
        data_provider: "European Commission EPBD",
        data_url: "https://energy.ec.europa.eu/topics/energy-efficiency/energy-efficient-buildings_en",
        last_updated: "2024",
        update_frequency: "Ad hoc (directive transposition deadlines)",
      },
      active_regulations: [
        "EU ETS (Phase 4, maritime included)",
        "FuelEU Maritime (from 2025)",
        "ReFuelEU Aviation",
        "CBAM (transitional, full 2026)",
        "CSRD/ESRS reporting",
        "EU PPWR packaging",
        "EUDR deforestation",
        "AFIR infrastructure",
      ],
    },
    open_questions: [
      "PPWR delegated acts for recyclability criteria — timeline for Art. 6",
      "CSRD Omnibus scope changes — verify post-Omnibus thresholds",
    ],
  },
  {
    id: "us-federal",
    jurisdiction: "US (Federal + California, New York)",
    region: "Americas",
    priority: "high",
    data: {
      solar: {
        status: "Permitted — IRA 30% ITC",
        details: "Inflation Reduction Act provides 30% Investment Tax Credit for commercial solar. State incentives are additive. Net metering rules vary by state and utility — check state PUC for specific terms.",
        confidence: "confirmed",
        data_provider: "US DOE / IRS",
        data_url: "https://www.energy.gov/eere/solar/federal-solar-tax-credits-businesses",
        last_updated: "2024",
        update_frequency: "Annual IRS guidance updates",
      },
      electricity: {
        status: "$0.08-0.20/kWh (varies by state)",
        details: "California highest (~$0.20/kWh). Texas/Southeast lowest (~$0.08/kWh). Industrial rates lower than commercial. Rates published by EIA Form 861.",
        confidence: "confirmed",
        data_provider: "US EIA Electric Power Monthly",
        data_url: "https://www.eia.gov/electricity/monthly/",
        last_updated: "Monthly",
        update_frequency: "Monthly (state-level data)",
      },
      labor: {
        status: "$35,000-55,000/year (warehouse/logistics)",
        details: "California/NY significantly higher. Federal minimum $7.25/hr but most states have higher minimums. Prevailing wage requirements apply to IRA-funded projects.",
        confidence: "confirmed",
        data_provider: "US Bureau of Labor Statistics",
        data_url: "https://www.bls.gov/oes/current/oes_nat.htm",
        last_updated: "May 2024 (annual release)",
        update_frequency: "Annual (May survey, November release)",
      },
      ev_charging: {
        status: "CARB mandates; federal NEVI program",
        details: "California CARB Advanced Clean Trucks mandate effective. Federal NEVI program deploying $7.5B for national EV charging network. 12+ states follow CARB via Section 177 waiver.",
        confidence: "confirmed",
        data_provider: "US DOT FHWA / CARB",
        data_url: "https://www.fhwa.dot.gov/environment/alternative_fuel_corridors/",
        last_updated: "2024",
        update_frequency: "Quarterly deployment updates",
      },
      green_building: {
        status: "LEED",
        details: "LEED is dominant US standard with 100,000+ certified projects. NYC Local Law 97 mandates emissions limits for buildings >25,000 sqft. California Title 24 is a de facto performance standard.",
        confidence: "confirmed",
        data_provider: "USGBC",
        data_url: "https://www.usgbc.org/projects",
        last_updated: "2024",
        update_frequency: "Continuous project database updates",
      },
      active_regulations: [
        "EPA vehicle GHG standards (volatile — state divergence)",
        "CARB Advanced Clean Trucks (Section 177 states follow)",
        "IRA clean energy tax credits",
        "SEC climate disclosure rule (litigation ongoing)",
      ],
    },
    open_questions: [
      "EPA Phase 3 rule survival — political review risk",
      "CARB waiver status — federal challenge outcome",
      "SEC climate disclosure rule litigation outcome",
    ],
  },
  {
    id: "singapore",
    jurisdiction: "Singapore",
    region: "Asia-Pacific",
    priority: "medium",
    data: {
      solar: {
        status: "Permitted — limited rooftop area, high ROI",
        details: "EMA allows solar leasing models. HDB and JTC rooftops increasingly utilized. Space constraints drive efficiency focus. SolarNova programme aggregates government rooftop demand.",
        confidence: "confirmed",
        data_provider: "Energy Market Authority (EMA)",
        data_url: "https://www.ema.gov.sg/our-energy-story/energy-supply/solar",
        last_updated: "2024",
        update_frequency: "Annual capacity reports",
      },
      electricity: {
        status: "S$0.25-0.30/kWh commercial",
        details: "Open electricity market since 2019. Carbon tax S$25/tCO2e (2024), legislated to rise to S$50-80 by 2030. Published quarterly by SP Group.",
        confidence: "confirmed",
        data_provider: "SP Group / EMA",
        data_url: "https://www.spgroup.com.sg/our-services/utilities/tariff-information",
        last_updated: "Q4 2024",
        update_frequency: "Quarterly tariff review",
      },
      labor: {
        status: "S$2,500-4,000/month (logistics roles)",
        details: "Foreign worker levy applies at S$300-950/month depending on tier. Progressive Wage Model covers cleaning, security, and some logistics roles.",
        confidence: "confirmed",
        data_provider: "Singapore MOM",
        data_url: "https://www.mom.gov.sg/employment-practices/salary",
        last_updated: "2024",
        update_frequency: "Annual wage surveys",
      },
      ev_charging: {
        status: "60,000 charging points target by 2030",
        details: "Singapore Green Plan 2030 target. LTA and URA rolling out charging infrastructure. EV Early Adoption Incentive provides 45% rebate on ARF.",
        confidence: "confirmed",
        data_provider: "Land Transport Authority",
        data_url: "https://www.lta.gov.sg/content/ltagov/en/industry_innovations/technologies/electric_vehicles.html",
        last_updated: "2024",
        update_frequency: "Quarterly deployment updates",
      },
      green_building: {
        status: "BCA Green Mark (mandatory >5,000 sqm)",
        details: "Mandatory for new buildings above 5,000 sqm. Singapore leads ASEAN in green building certification. Super Low Energy programme for best-in-class buildings.",
        confidence: "confirmed",
        data_provider: "Building and Construction Authority",
        data_url: "https://www1.bca.gov.sg/buildsg/sustainability/green-mark-certification-scheme",
        last_updated: "2024",
        update_frequency: "Ad hoc standard updates",
      },
      active_regulations: [
        "Singapore carbon tax (rising trajectory)",
        "MPA Green Shipping Programme",
        "Singapore Green Plan 2030",
        "BCA Green Mark mandatory threshold",
      ],
    },
    open_questions: [
      "Shore power infrastructure at PSA terminals — current status",
      "MPA green corridor partnerships — latest bilateral agreements",
    ],
  },
  {
    id: "hk",
    jurisdiction: "Hong Kong",
    region: "Asia-Pacific",
    priority: "medium",
    data: {
      solar: {
        status: "Feed-in tariff available",
        details: "CLP and HK Electric offer feed-in tariffs for renewable energy at HK$3-5/kWh depending on system size. Limited rooftop space in commercial districts.",
        confidence: "confirmed",
        data_provider: "CLP / HK Electric",
        data_url: "https://www.clpgroup.com/en/sustainability/feed-in-tariff",
        last_updated: "2024",
        update_frequency: "Annual tariff review",
      },
      electricity: {
        status: "HK$1.0-1.3/kWh commercial",
        details: "Two utilities: CLP (Kowloon, NT) and HK Electric (HK Island). Tariff includes fuel cost adjustment clause that fluctuates quarterly.",
        confidence: "confirmed",
        data_provider: "CLP / HK Electric published tariffs",
        data_url: "https://www.clp.com.hk/en/customer-service/tariff",
        last_updated: "2024",
        update_frequency: "Annual (with quarterly fuel clause adjustments)",
      },
      labor: {
        status: "HK$15,000-25,000/month (logistics roles)",
        details: "Statutory minimum wage HK$40/hr (May 2023). Labor market tight in logistics sector. Warehouse operatives typically HK$16,000-20,000/month.",
        confidence: "confirmed",
        data_provider: "HK Census and Statistics Department",
        data_url: "https://www.censtatd.gov.hk/en/scode200.html",
        last_updated: "2024",
        update_frequency: "Annual earnings survey",
      },
      ev_charging: {
        status: "EV First Registration Tax waiver extended",
        details: "Government extending EV incentives through 2026. Charging infrastructure in public car parks expanding. EV roadmap targets 150,000+ private chargers by 2027.",
        confidence: "confirmed",
        data_provider: "HK Environment and Ecology Bureau",
        data_url: "https://www.eeb.gov.hk/en/ev.htm",
        last_updated: "2024",
        update_frequency: "Annual policy review",
      },
      green_building: {
        status: "BEAM Plus",
        details: "Hong Kong Green Building Council BEAM Plus certification. Voluntary but increasingly adopted by major landlords and new developments.",
        confidence: "confirmed",
        data_provider: "HK Green Building Council",
        data_url: "https://www.hkgbc.org.hk/eng/beam-plus/",
        last_updated: "2024",
        update_frequency: "Ad hoc standard updates",
      },
      active_regulations: [
        "Hong Kong Climate Action Plan 2050",
        "Waste charging scheme (pending implementation)",
        "EV policy framework",
      ],
    },
    open_questions: [
      "Warehouse EV charging infrastructure in Kwai Tsing container port area",
      "Cross-border trucking EV feasibility (HK-Shenzhen)",
    ],
  },
  {
    id: "china",
    jurisdiction: "China (PRC)",
    region: "Asia-Pacific",
    priority: "high",
    data: {
      solar: { status: "World's largest solar market", details: "China installed ~217 GW of solar in 2023 alone — more than the rest of the world combined. Commercial/industrial rooftop solar widely available with provincial feed-in tariffs.", confidence: "confirmed", data_provider: "National Energy Administration (NEA)", data_url: "http://www.nea.gov.cn/", last_updated: "2024", update_frequency: "Monthly capacity statistics" },
      electricity: { status: "¥0.4-0.8/kWh commercial (varies by province)", details: "Industrial rates lower in western provinces (Xinjiang, Inner Mongolia). Eastern seaboard provinces higher. Cross-subsidisation between industrial and residential rates.", confidence: "confirmed", data_provider: "National Development and Reform Commission", data_url: "https://www.ndrc.gov.cn/", last_updated: "2024", update_frequency: "Annual (provincial tariff adjustments)" },
      labor: { status: "¥4,000-8,000/month (logistics roles)", details: "Significant regional variation: Shanghai/Shenzhen highest, inland provinces lower. Social insurance contributions add ~30-40% to base wage. Minimum wages set by province.", confidence: "confirmed", data_provider: "National Bureau of Statistics", data_url: "https://www.stats.gov.cn/english/", last_updated: "2024", update_frequency: "Annual" },
      ev_charging: { status: "World's largest EV charging network", details: "China has 8.6M+ public charging points (2024). NEV mandate requires 25% of new vehicle sales to be electric. Commercial EV adoption fastest globally.", confidence: "confirmed", data_provider: "China EV Charging Alliance (EVCIPA)", data_url: "https://www.evcipa.org.cn/", last_updated: "2024", update_frequency: "Monthly deployment statistics" },
      green_building: { status: "China Green Building Label (3-star system)", details: "Mandatory for government buildings. GB/T 50378 standard. Increasingly required for Class A logistics parks. Green building area exceeded 10 billion sqm by 2023.", confidence: "confirmed", data_provider: "Ministry of Housing and Urban-Rural Development", data_url: "https://www.mohurd.gov.cn/", last_updated: "2024", update_frequency: "Annual standard reviews" },
      active_regulations: [
        "China National ETS (power sector, expanding to transport)",
        "NEV mandate (25% of new sales)",
        "Dual Carbon Goals: peak emissions by 2030, carbon neutral by 2060",
        "GB/T 14083 national transport emissions standard (aligned with ISO 14083)",
        "Plastic pollution control regulations (phased single-use plastic bans)",
      ],
    },
    open_questions: [
      "Timeline for China national ETS expansion to transport sector",
      "Cross-border trucking electrification on HK-Shenzhen-Guangzhou corridor",
      "Free trade zone vs mainland electricity tariff differentials for logistics hubs",
    ],
  },
  {
    id: "india",
    jurisdiction: "India",
    region: "Asia-Pacific",
    priority: "high",
    data: {
      solar: { status: "Permitted — National Solar Mission", details: "India targets 500 GW renewable energy by 2030. PM-KUSUM scheme for commercial/industrial rooftop. State-level net metering policies vary significantly. Gujarat, Rajasthan, and Karnataka lead deployment.", confidence: "confirmed", data_provider: "Ministry of New and Renewable Energy", data_url: "https://mnre.gov.in/", last_updated: "2024", update_frequency: "Monthly capacity updates" },
      electricity: { status: "₹6-10/kWh commercial (varies by state)", details: "State electricity regulatory commissions set tariffs independently. Industrial rates often lower through open access and power exchanges. Cross-subsidy surcharges apply.", confidence: "confirmed", data_provider: "Central Electricity Authority", data_url: "https://cea.nic.in/", last_updated: "2024", update_frequency: "Annual (state-level tariff orders)" },
      labor: { status: "₹15,000-30,000/month (logistics roles)", details: "Minimum wages vary by state and skill category. New Labour Codes consolidate 29 laws into 4 codes. Social security contributions ~12% EPF + ESI.", confidence: "confirmed", data_provider: "Ministry of Labour and Employment", data_url: "https://labour.gov.in/", last_updated: "2024", update_frequency: "Biannual minimum wage revisions" },
      ev_charging: { status: "FAME-II scheme driving adoption", details: "Faster Adoption and Manufacturing of EVs (FAME-II) scheme provides subsidies. National target: 30% EV sales by 2030. State EV policies vary — Delhi, Maharashtra, and Karnataka most aggressive.", confidence: "confirmed", data_provider: "Ministry of Heavy Industries", data_url: "https://heavyindustries.gov.in/", last_updated: "2024", update_frequency: "Quarterly scheme updates" },
      green_building: { status: "GRIHA / IGBC Green Rating", details: "GRIHA (government-backed) and IGBC (industry-backed) are the two main systems. Not mandatory nationally but required in some states for government buildings.", confidence: "confirmed", data_provider: "IGBC / TERI", data_url: "https://igbc.in/", last_updated: "2024", update_frequency: "Ad hoc standard updates" },
      active_regulations: [
        "Carbon Credit Trading Scheme (notified 2023, operational 2025)",
        "Extended Producer Responsibility for packaging waste",
        "Bharat Stage VI emission standards (equivalent to Euro 6)",
        "National Green Hydrogen Mission (5 MMT by 2030)",
        "Plastic Waste Management Rules (single-use plastic ban)",
      ],
    },
    open_questions: [
      "India Carbon Credit Trading Scheme — timeline for transport sector inclusion",
      "Cross-state variation in EV infrastructure for logistics corridors",
      "GST implications for carbon credit trading on freight operations",
    ],
  },
  {
    id: "japan",
    jurisdiction: "Japan",
    region: "Asia-Pacific",
    priority: "medium",
    data: {
      solar: { status: "Permitted — FIT programme active", details: "Feed-in tariff for commercial solar at ¥10-12/kWh (declining annually). FIP (Feed-in Premium) replacing FIT for larger installations. Rooftop solar on logistics facilities growing.", confidence: "confirmed", data_provider: "Agency for Natural Resources and Energy", data_url: "https://www.enecho.meti.go.jp/en/", last_updated: "2024", update_frequency: "Annual FIT/FIP rate review" },
      electricity: { status: "¥15-25/kWh commercial", details: "Electricity market liberalised since 2016. Regional variation between 10 EPCO areas. Post-Fukushima nuclear restart reducing prices in some areas.", confidence: "confirmed", data_provider: "METI", data_url: "https://www.meti.go.jp/english/", last_updated: "2024", update_frequency: "Quarterly" },
      labor: { status: "¥250,000-350,000/month (logistics roles)", details: "National minimum wage ¥1,004/hr (2024). Labor shortage acute in logistics — '2024 problem' from driver working hours cap. Social insurance adds ~15% to costs.", confidence: "confirmed", data_provider: "Ministry of Health, Labour and Welfare", data_url: "https://www.mhlw.go.jp/english/", last_updated: "2024", update_frequency: "Annual wage survey" },
      ev_charging: { status: "Green Growth Strategy — hydrogen + EV focus", details: "Japan pursuing both BEV and FCEV pathways. CHAdeMO fast charging network extensive (30,000+ points). Government subsidies for commercial EV purchase.", confidence: "confirmed", data_provider: "MLIT / METI", data_url: "https://www.mlit.go.jp/en/", last_updated: "2024", update_frequency: "Annual Green Growth Strategy updates" },
      green_building: { status: "CASBEE", details: "Comprehensive Assessment System for Built Environment Efficiency. Mandatory energy reporting for large buildings (>2,000 sqm). ZEB (Zero Energy Building) target for new public buildings by 2030.", confidence: "confirmed", data_provider: "Ministry of Land, Infrastructure, Transport and Tourism", data_url: "https://www.mlit.go.jp/en/", last_updated: "2024", update_frequency: "Ad hoc" },
      active_regulations: [
        "Japan GX (Green Transformation) carbon pricing — GX-ETS from 2026",
        "GX surcharge on fossil fuels from 2028",
        "Hydrogen port investments (Kobe, Yokohama)",
        "2024 logistics driver working hours cap",
      ],
    },
    open_questions: [
      "GX-ETS impact on maritime operations at Japanese ports",
      "Hydrogen bunkering infrastructure timeline at major ports",
    ],
  },
  {
    id: "australia",
    jurisdiction: "Australia",
    region: "Asia-Pacific",
    priority: "medium",
    data: {
      solar: { status: "Highest per-capita solar adoption globally", details: "Rooftop solar on 33%+ of homes. Commercial solar booming with PPAs. State-level feed-in tariffs and renewable energy certificates (STCs/LGCs).", confidence: "confirmed", data_provider: "Clean Energy Regulator", data_url: "https://www.cleanenergyregulator.gov.au/", last_updated: "2024", update_frequency: "Monthly STC/LGC data" },
      electricity: { status: "A$0.15-0.35/kWh commercial (varies by state)", details: "National Electricity Market covers eastern states. WA has separate market. Industrial rates via PPAs significantly lower. Renewable energy zones reducing costs.", confidence: "confirmed", data_provider: "Australian Energy Regulator", data_url: "https://www.aer.gov.au/", last_updated: "2024", update_frequency: "Quarterly" },
      labor: { status: "A$55,000-75,000/year (logistics roles)", details: "National minimum wage A$24.10/hr (2024). Superannuation adds 11.5% to base wage. Award rates for transport workers set by Fair Work Commission.", confidence: "confirmed", data_provider: "Fair Work Commission", data_url: "https://www.fwc.gov.au/", last_updated: "July 2024", update_frequency: "Annual (July wage review)" },
      ev_charging: { status: "National EV Strategy launched 2023", details: "Federal New Vehicle Efficiency Standard from 2025. State-level EV incentives vary — Victoria, NSW, and QLD most active. NRMA and others building highway charging.", confidence: "confirmed", data_provider: "Department of Climate Change, Energy, the Environment and Water", data_url: "https://www.dcceew.gov.au/", last_updated: "2024", update_frequency: "Quarterly" },
      green_building: { status: "Green Star (GBCA) / NABERS", details: "Green Star voluntary certification by GBCA. NABERS energy ratings mandatory for commercial office buildings >1,000 sqm for sale/lease. Warehouse sector increasingly adopting Green Star.", confidence: "confirmed", data_provider: "Green Building Council of Australia", data_url: "https://new.gbca.org.au/", last_updated: "2024", update_frequency: "Ad hoc" },
      active_regulations: [
        "Safeguard Mechanism (facility-level emissions caps, 215 facilities)",
        "New Vehicle Efficiency Standard (CO2 g/km targets from 2025)",
        "National Reconstruction Fund — green manufacturing investment",
        "Renewable Energy Target (33,000 GWh by 2020, met)",
      ],
    },
    open_questions: [
      "Safeguard Mechanism expansion to transport sector",
      "Port electrification timelines for Sydney, Melbourne, Brisbane",
    ],
  },
  {
    id: "brazil",
    jurisdiction: "Brazil",
    region: "Americas",
    priority: "medium",
    data: {
      solar: { status: "Permitted — Net metering (Lei 14.300/2022)", details: "Marco Legal da Geração Distribuída established net metering framework. Commercial solar growing 40%+ annually. High irradiance nationwide. Transition to new tariff structure by 2045.", confidence: "confirmed", data_provider: "ANEEL", data_url: "https://www.gov.br/aneel/", last_updated: "2024", update_frequency: "Annual regulatory review" },
      electricity: { status: "R$0.50-0.90/kWh commercial (varies by state)", details: "Electricity tariffs set by ANEEL with state-level distribution charges. Tariff flag system (green/yellow/red) adjusts monthly based on hydrological conditions.", confidence: "confirmed", data_provider: "ANEEL", data_url: "https://www.gov.br/aneel/", last_updated: "2024", update_frequency: "Monthly (flag system), annual (base tariff)" },
      labor: { status: "R$2,500-5,000/month (logistics roles)", details: "National minimum wage R$1,412/month (2024). CLT employment regime with 13th salary, FGTS (8%), INSS contributions. Regional variation significant.", confidence: "confirmed", data_provider: "IBGE / Ministry of Labour", data_url: "https://www.ibge.gov.br/", last_updated: "2024", update_frequency: "Annual minimum wage adjustment (January)" },
      ev_charging: { status: "Emerging — ROTA 2030 programme", details: "ROTA 2030 automotive innovation programme includes EV incentives. Ethanol and flex-fuel vehicles dominate. EV infrastructure concentrated in São Paulo and Rio de Janeiro.", confidence: "confirmed", data_provider: "Ministry of Development, Industry and Trade", data_url: "https://www.gov.br/mdic/", last_updated: "2024", update_frequency: "Annual programme updates" },
      green_building: { status: "LEED / AQUA-HQE / Selo Casa Azul", details: "LEED widely adopted for commercial buildings. AQUA-HQE (adapted from French HQE). Selo Casa Azul (CAIXA) for residential. No mandatory national standard.", confidence: "confirmed", data_provider: "GBC Brasil", data_url: "https://www.gbcbrasil.org.br/", last_updated: "2024", update_frequency: "Ad hoc" },
      active_regulations: [
        "Política Nacional de Resíduos Sólidos (reverse logistics mandate)",
        "RenovaBio (biofuels decarbonisation credit — CBio)",
        "PROCONVE L8 vehicle emissions standards",
        "National Climate Plan update (COP30 host country 2025)",
      ],
    },
    open_questions: [
      "COP30 Belém — impact on Brazilian freight sustainability requirements",
      "Ethanol vs EV transition timeline for commercial fleets",
    ],
  },
  {
    id: "germany",
    jurisdiction: "Germany",
    region: "Europe",
    priority: "high",
    data: {
      solar: { status: "Permitted — EEG feed-in + direct marketing", details: "Energiewende driving massive solar deployment. EEG (Renewable Energy Sources Act) provides feed-in tariffs for installations <100 kW, direct marketing above. Commercial rooftop solar eligible for investment subsidies.", confidence: "confirmed", data_provider: "Bundesnetzagentur", data_url: "https://www.bundesnetzagentur.de/EN/", last_updated: "2024", update_frequency: "Monthly installation statistics" },
      electricity: { status: "€0.25-0.35/kWh commercial", details: "Among the highest in Europe. Network charges, EEG surcharge (now tax-funded), and electricity tax make up ~50% of total cost. Industrial exemptions available for energy-intensive users.", confidence: "confirmed", data_provider: "BDEW / Bundesnetzagentur", data_url: "https://www.bdew.de/english/", last_updated: "2024", update_frequency: "Quarterly" },
      labor: { status: "€35,000-50,000/year (logistics roles)", details: "Minimum wage €12.82/hr (2025). Strong collective bargaining (Tarifvertrag) in logistics sector. Social insurance contributions ~20% employer side. Driver shortage acute.", confidence: "confirmed", data_provider: "Statistisches Bundesamt (Destatis)", data_url: "https://www.destatis.de/EN/", last_updated: "2024", update_frequency: "Annual earnings survey" },
      ev_charging: { status: "Deutschlandnetz building 1,000+ fast charging hubs", details: "Federal government building national fast charging network. Masterplan Ladeinfrastruktur II targets 1M public charging points by 2030. Commercial fleet electrification incentives available.", confidence: "confirmed", data_provider: "BMDV", data_url: "https://www.bmdv.bund.de/EN/", last_updated: "2024", update_frequency: "Quarterly deployment stats" },
      green_building: { status: "DGNB (German Sustainable Building Council)", details: "DGNB certification dominant. GEG (Building Energy Act) sets minimum energy standards. EU Energy Performance of Buildings Directive transposition driving stricter requirements.", confidence: "confirmed", data_provider: "DGNB", data_url: "https://www.dgnb.de/en", last_updated: "2024", update_frequency: "Ad hoc standard updates" },
      active_regulations: [
        "EU ETS (Germany's largest compliance market)",
        "National ETS for heating and transport (nEHS) — €45/tCO2 (2024)",
        "GEG Building Energy Act (Gebäudeenergiegesetz)",
        "Lieferkettensorgfaltspflichtengesetz (Supply Chain Due Diligence Act)",
        "Packaging Act (VerpackG) — extended producer responsibility",
      ],
    },
    open_questions: [
      "nEHS carbon price trajectory — impact on German road freight costs",
      "Supply Chain Act enforcement — freight forwarder obligations",
    ],
  },
];

// ── Regional Profile Card ──

function RegionalProfileCard({ profile }: { profile: RegionalProfile }) {
  const [expanded, setExpanded] = useState(false);

  const priorityColors = {
    high: "var(--color-error)",
    medium: "var(--color-warning)",
    low: "var(--color-text-muted)",
  };

  const confidenceIcon = (c: "confirmed" | "unconfirmed") =>
    c === "confirmed"
      ? <CheckCircle size={10} style={{ color: "var(--color-success)" }} />
      : <HelpCircle size={10} style={{ color: "var(--color-warning)" }} />;

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
        className="w-full flex items-center gap-3 p-4 text-left cursor-pointer hover:bg-[var(--color-surface-raised)] transition-colors duration-150"
      >
        <Globe size={16} style={{ color: "var(--color-primary)" }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
              {profile.jurisdiction}
            </h3>
            <span
              className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-md"
              style={{
                color: priorityColors[profile.priority],
                backgroundColor: `${priorityColors[profile.priority]}12`,
                border: `1px solid ${priorityColors[profile.priority]}30`,
              }}
            >
              {profile.priority}
            </span>
          </div>
          <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{profile.region}</span>
        </div>
        <ChevronDown
          size={14}
          className={cn("shrink-0 transition-transform duration-200", expanded && "rotate-180")}
          style={{ color: "var(--color-text-muted)" }}
        />
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t" style={{ borderColor: "var(--color-border-subtle)" }}>
          {/* Data Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
            <DataCell icon={Sun} label="Solar" dataPoint={profile.data.solar} />
            <DataCell icon={Zap} label="Electricity" dataPoint={profile.data.electricity} />
            <DataCell icon={Users} label="Labor" dataPoint={profile.data.labor} />
            <DataCell icon={Zap} label="EV Charging" dataPoint={profile.data.ev_charging} />
            <DataCell icon={Building} label="Green Building" dataPoint={profile.data.green_building} />
          </div>

          {/* Active Regulations */}
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
              Active Regulations
            </span>
            <ul className="mt-1 space-y-1">
              {profile.data.active_regulations.map((reg, i) => (
                <li key={i} className="text-xs flex items-start gap-2" style={{ color: "var(--color-text-secondary)" }}>
                  <span style={{ color: "var(--color-primary)" }}>•</span>
                  {reg}
                </li>
              ))}
            </ul>
          </div>

          {/* Open Questions */}
          {profile.open_questions.length > 0 && (
            <div
              className="p-3 rounded-lg"
              style={{
                backgroundColor: "rgba(217, 119, 6, 0.06)",
                border: "1px solid rgba(217, 119, 6, 0.15)",
              }}
            >
              <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-warning)" }}>
                <AlertCircle size={10} className="inline mr-1" />
                Open Questions
              </span>
              <p className="text-[10px] mt-0.5 mb-1" style={{ color: "var(--color-text-muted)" }}>
                Unresolved data points our team is actively verifying. Treat with caution until resolved.
              </p>
              <ul className="mt-1 space-y-1">
                {profile.open_questions.map((q, i) => (
                  <li key={i} className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                    {q}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Why each data category matters to freight operators
const WHY_MATTERS: Record<string, string> = {
  "Solar": "On-site solar reduces warehouse energy costs and meets green-building lease requirements.",
  "Electricity": "Electricity rates directly impact warehouse, cold-chain, and EV fleet charging costs.",
  "Labor": "Labor costs are the largest variable in warehouse and drayage operations.",
  "EV Charging": "EV infrastructure determines feasibility of zero-emission last-mile delivery fleets.",
  "Green Building": "Green certification is increasingly required by landlords and major shipper tenants.",
};

function DataCell({
  icon: Icon,
  label,
  dataPoint,
}: {
  icon: typeof Sun;
  label: string;
  dataPoint: DataPoint;
}) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div
      className="p-3 rounded-lg"
      style={{ backgroundColor: "var(--color-surface-raised)" }}
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon size={12} style={{ color: "var(--color-primary)" }} />
        <span className="text-[11px] font-medium" style={{ color: "var(--color-text-muted)" }}>
          {label}
        </span>
        {dataPoint.confidence === "unconfirmed" && (
          <HelpCircle size={10} style={{ color: "var(--color-warning)" }} />
        )}
      </div>
      <p className="text-xs font-medium" style={{ color: "var(--color-text-primary)" }}>
        {dataPoint.status}
      </p>
      {WHY_MATTERS[label] && (
        <p className="text-[11px] mt-0.5 italic" style={{ color: "var(--color-text-muted)" }}>
          {WHY_MATTERS[label]}
        </p>
      )}
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="text-[11px] mt-1 cursor-pointer"
        style={{ color: "var(--color-primary)" }}
      >
        {showDetails ? "Less" : "More"}
      </button>
      {showDetails && (
        <div className="mt-1.5 space-y-1.5">
          <p className="text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
            {dataPoint.details}
          </p>
          <div className="flex items-center justify-between text-[10px]" style={{ color: "var(--color-text-muted)" }}>
            <a
              href={dataPoint.data_url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline flex items-center gap-1"
              style={{ color: "var(--color-primary)" }}
            >
              <ExternalLink size={8} />
              {dataPoint.data_provider}
            </a>
            <span>Updated: {dataPoint.last_updated}</span>
          </div>
          <div className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
            Refresh: {dataPoint.update_frequency}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Region Groups ──

const REGION_GROUPS = [
  { id: "all", label: "All Regions" },
  { id: "Americas", label: "Americas" },
  { id: "Europe", label: "Europe" },
  { id: "Asia-Pacific", label: "Asia-Pacific" },
  { id: "Middle East", label: "Middle East" },
  { id: "Africa", label: "Africa" },
] as const;

// ── Main Component ──

export function RegionalIntelligence() {
  const [activeRegion, setActiveRegion] = useState<string>("all");

  const filteredProfiles = activeRegion === "all"
    ? REGIONAL_PROFILES
    : REGIONAL_PROFILES.filter((p) => p.region === activeRegion);

  const profilesByRegion = REGION_GROUPS.filter((g) => g.id !== "all").map((g) => ({
    region: g.label,
    count: REGIONAL_PROFILES.filter((p) => p.region === g.label).length,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>
          Regional Operations Intelligence
        </h2>
        <p className="text-sm mt-1" style={{ color: "var(--color-text-secondary)" }}>
          Energy tariffs, labor costs, solar permitting, EV infrastructure, and green building requirements by jurisdiction.
          Each data point includes source, update frequency, and verification status.
        </p>
      </div>

      {/* Region filter */}
      <div className="flex flex-wrap gap-1.5">
        {REGION_GROUPS.map((g) => {
          const count = g.id === "all" ? REGIONAL_PROFILES.length : REGIONAL_PROFILES.filter((p) => p.region === g.label).length;
          return (
            <button
              key={g.id}
              onClick={() => setActiveRegion(g.id)}
              className="px-3 py-1.5 text-xs font-medium rounded-md border cursor-pointer transition-colors"
              style={{
                borderColor: activeRegion === g.id ? "var(--color-active-border)" : "var(--color-border)",
                backgroundColor: activeRegion === g.id ? "var(--color-active-bg)" : "transparent",
                color: activeRegion === g.id ? "var(--color-text-primary)" : "var(--color-text-secondary)",
              }}
            >
              {g.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Coverage note */}
      {filteredProfiles.length === 0 && (
        <div className="text-center py-8">
          <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
            No regional profiles for this region yet
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--color-text-secondary)" }}>
            Regional intelligence profiles are added as the source monitoring system expands coverage.
            The monitoring worker scans sources and populates regional data automatically.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {filteredProfiles.map((profile) => (
          <RegionalProfileCard key={profile.id} profile={profile} />
        ))}
      </div>
    </div>
  );
}
