import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://kwrsbpiseruzbfwjpvsp.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3cnNicGlzZXJ1emJmd2pwdnNwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MDg1NzkzOCwiZXhwIjoyMDU2NDMzOTM4fQ.zPd4fS8kqnwGXif54aJe7zbcSdFf5-t7GXewSSfeNcE"
);

const SOURCES = [
  // ── OCEAN & SHIPPING ──
  { name: "DNV — Energy Transition Outlook (Maritime)", url: "https://www.dnv.com/maritime", tier: 2, description: "World's leading maritime classification society. Annual Energy Transition Outlook for shipping, alt fuel readiness indices, vessel decarbonization pathways.", transport_modes: ["ocean"], topic_tags: ["emissions", "fuels", "transport"], jurisdictions: ["global"], domains: [1, 2, 4] },
  { name: "Lloyd's Register Marine — Sustainability Research", url: "https://www.lr.org/en/marine-shipping", tier: 2, description: "Classification society. Zero-carbon shipping research, fuel transition assessments, vessel safety standards.", transport_modes: ["ocean"], topic_tags: ["fuels", "transport"], jurisdictions: ["global"], domains: [1, 7] },
  { name: "BIMCO — Baltic and International Maritime Council", url: "https://www.bimco.org", tier: 2, description: "World's largest international shipping association. Standard contracts, fleet data, decarbonization guidance.", transport_modes: ["ocean"], topic_tags: ["emissions", "transport"], jurisdictions: ["global"], domains: [1, 4] },
  { name: "Intercargo — Dry Bulk Shipowners", url: "https://www.intercargo.org", tier: 3, description: "Represents dry bulk carriers — coal, grain, ore, minerals. Carbon intensity data for bulk shipping.", transport_modes: ["ocean"], topic_tags: ["emissions"], vertical_tags: ["bulk-commodity"], jurisdictions: ["global"], domains: [1] },
  { name: "INTERTANKO — Independent Tanker Owners", url: "https://www.intertanko.com", tier: 3, description: "Tanker fleet — crude oil, chemical, LNG carriers. Fuel consumption data, CII compliance tracking.", transport_modes: ["ocean"], topic_tags: ["emissions", "fuels"], vertical_tags: ["oil-gas", "chemicals"], jurisdictions: ["global"], domains: [1] },
  { name: "Clean Shipping Coalition", url: "https://www.cleanshipping.org", tier: 4, description: "NGO with IMO observer status. Most influential civil society voice on shipping fuel standards.", transport_modes: ["ocean"], topic_tags: ["emissions", "fuels"], jurisdictions: ["global"], domains: [7] },
  { name: "Sea Cargo Charter", url: "https://www.seacargocharter.org", tier: 3, description: "Voluntary alignment framework for charterers to align shipping portfolios with IMO GHG strategy.", transport_modes: ["ocean"], topic_tags: ["emissions", "reporting"], jurisdictions: ["global"], domains: [1] },
  { name: "Korea Register of Shipping — KR", url: "https://www.krs.co.kr/en", tier: 2, description: "Korean classification society. S. Korea is world's largest shipbuilder. Vessel certification and alt fuel readiness.", transport_modes: ["ocean"], topic_tags: ["transport", "fuels"], jurisdictions: ["asia"], domains: [1, 2] },

  // ── AVIATION ──
  { name: "ATAG — Air Transport Action Group", url: "https://www.atag.org", tier: 3, description: "Aviation industry sustainability body. Aviation Climate Solutions report, net-zero 2050 roadmap.", transport_modes: ["air"], topic_tags: ["emissions", "fuels"], jurisdictions: ["global"], domains: [1, 7] },
  { name: "IATA Sustainability Centre", url: "https://www.iata.org/en/programs/environment", tier: 2, description: "SAF registry, carbon offsetting standards (CORSIA), net-zero tracker, airline emissions reporting.", transport_modes: ["air"], topic_tags: ["emissions", "fuels", "reporting"], jurisdictions: ["global"], domains: [1, 4] },
  { name: "RMI — Rocky Mountain Institute Aviation", url: "https://rmi.org/our-work/aviation", tier: 4, description: "Leading SAF demand signal research, airline procurement commitments, aviation decarbonization finance.", transport_modes: ["air"], topic_tags: ["fuels"], jurisdictions: ["us", "global"], domains: [7] },
  { name: "SkyNRG SAF Market Outlook", url: "https://www.skynrg.com", tier: 4, description: "Leading independent SAF producer. SAF availability by airport, feedstock pathway analysis, cost data.", transport_modes: ["air"], topic_tags: ["fuels"], jurisdictions: ["global"], domains: [4] },
  { name: "Sustainable Aviation UK", url: "https://www.sustainableaviation.co.uk", tier: 3, description: "UK aviation industry body. SAF roadmaps, CO2 reduction trajectories. UK regulatory divergence context.", transport_modes: ["air"], topic_tags: ["fuels", "emissions"], jurisdictions: ["uk"], domains: [1] },
  { name: "EASA — Aviation Environment", url: "https://www.easa.europa.eu/en/domains/environment", tier: 2, description: "EU aviation safety and environmental regulation. Aviation environmental review, climate impact assessments.", transport_modes: ["air"], topic_tags: ["emissions", "transport"], jurisdictions: ["eu"], domains: [1] },

  // ── ROAD FREIGHT ──
  { name: "ACEA — European Automobile Manufacturers", url: "https://www.acea.auto/statistics", tier: 2, description: "Quarterly ZEV truck registration data, fleet transition progress, EU charging infrastructure deployment.", transport_modes: ["road"], topic_tags: ["transport", "emissions"], jurisdictions: ["eu"], domains: [1, 4] },
  { name: "Japan MLIT", url: "https://www.mlit.go.jp/en", tier: 1, description: "Japan freight decarbonization targets, ZEV truck policy, modal shift programs.", transport_modes: ["road", "ocean", "rail"], topic_tags: ["transport", "emissions"], jurisdictions: ["asia"], domains: [1, 3] },
  { name: "US DOT FMCSA", url: "https://www.fmcsa.dot.gov", tier: 1, description: "US federal commercial truck safety, hours of service, driver qualifications, interstate trucking compliance.", transport_modes: ["road"], topic_tags: ["transport"], jurisdictions: ["us"], domains: [1] },
  { name: "ZEV Alliance", url: "https://www.zevalliance.org", tier: 3, description: "Intergovernmental coalition committed to 100% ZEV sales. Tracks ZEV policy adoption globally.", transport_modes: ["road"], topic_tags: ["transport"], jurisdictions: ["global"], domains: [1] },

  // ── SUPPLY CHAIN & SCOPE 3 ──
  { name: "WBCSD Pathfinder Framework", url: "https://www.wbcsd.org/programs/climate-and-energy/pathfinder-framework", tier: 2, description: "Emerging standard for product-level carbon data exchange across supply chains. Critical for CountEmissions EU.", transport_modes: ["air", "road", "ocean"], topic_tags: ["reporting", "emissions"], jurisdictions: ["global"], domains: [1] },
  { name: "PACT — Partnership for Carbon Transparency", url: "https://carbon-transparency.com", tier: 3, description: "Industry implementation body for Pathfinder Framework. Tracks business adoption of product carbon footprint exchange.", transport_modes: ["air", "road", "ocean"], topic_tags: ["reporting"], jurisdictions: ["global"], domains: [1] },
  { name: "EFRAG — European Financial Reporting", url: "https://www.efrag.org/sustainability-reporting", tier: 2, description: "Develops ESRS under CSRD. ESRS E1 (climate) and G1 (governance) require supply chain emissions data.", transport_modes: ["air", "road", "ocean"], topic_tags: ["reporting"], jurisdictions: ["eu"], domains: [1] },
  { name: "SEC Climate Disclosure Rule", url: "https://www.sec.gov/climate-disclosure", tier: 1, description: "US SEC climate disclosure requirements. Scope 1, 2, and material Scope 3 for publicly listed companies.", transport_modes: ["air", "road", "ocean"], topic_tags: ["reporting"], jurisdictions: ["us"], domains: [1] },

  // ── CARBON MARKETS — ASIA PACIFIC ──
  { name: "Korea ETS — KETS", url: "https://www.kcredit.or.kr", tier: 1, description: "Korea Emissions Trading Scheme. One of Asia's most mature ETS systems, launched 2015.", transport_modes: ["ocean", "road"], topic_tags: ["emissions"], jurisdictions: ["asia"], domains: [1, 4] },
  { name: "China National ETS — MEE", url: "https://english.mee.gov.cn", tier: 1, description: "World's largest carbon market by coverage. Currently power sector, expanding to industry/transport.", transport_modes: ["ocean", "road"], topic_tags: ["emissions"], jurisdictions: ["asia"], domains: [1, 4] },
  { name: "Singapore Carbon Tax — NEA", url: "https://www.nea.gov.sg/our-services/climate-change-energy-efficiency/climate-change/carbon-tax", tier: 1, description: "Singapore carbon tax authority. S$25/tCO2 rising to S$50-80 by 2030. Connected to MPA Green Shipping.", transport_modes: ["ocean", "air"], topic_tags: ["emissions"], jurisdictions: ["asia"], domains: [1, 4] },
  { name: "Australia ACCU — Clean Energy Regulator", url: "https://www.cleanenergyregulator.gov.au", tier: 1, description: "Australian carbon credit and Safeguard Mechanism authority. Major Asia-Pacific carbon policy.", transport_modes: ["road", "ocean"], topic_tags: ["emissions"], jurisdictions: ["asia"], domains: [1, 4] },
  { name: "Japan GX League", url: "https://gx-league.go.jp", tier: 2, description: "Japan's voluntary carbon market transitioning to mandatory ETS from 2026.", transport_modes: ["road", "ocean"], topic_tags: ["emissions"], jurisdictions: ["asia"], domains: [1, 4] },

  // ── BIODIVERSITY & NATURE ──
  { name: "TNFD — Taskforce on Nature-related Financial Disclosures", url: "https://tnfd.global", tier: 3, description: "Nature equivalent of TCFD. Frameworks already appearing in EU supply chain due diligence requirements.", transport_modes: ["air", "road", "ocean"], topic_tags: ["reporting"], jurisdictions: ["global"], domains: [1] },
  { name: "SBTN — Science Based Targets Network", url: "https://sciencebasedtargetsnetwork.org", tier: 3, description: "Nature equivalent of SBTi. Targets for land, freshwater, ocean, biodiversity. Becoming mandatory under CSRD.", transport_modes: ["air", "road", "ocean"], topic_tags: ["reporting"], jurisdictions: ["global"], domains: [1, 7] },

  // ── SOCIAL, LABOR & HUMAN RIGHTS ──
  { name: "ILO Maritime Labour Convention", url: "https://www.ilo.org/global/standards/maritime-labour-convention", tier: 1, description: "Binding international seafarer working conditions standard. Compliance required for vessel port access.", transport_modes: ["ocean"], topic_tags: ["transport"], jurisdictions: ["global"], domains: [1] },
  { name: "US CBP Forced Labor — UFLPA", url: "https://www.cbp.gov/trade/forced-labor", tier: 1, description: "Uyghur Forced Labor Prevention Act enforcement. Entity List — goods barred from US import.", transport_modes: ["air", "road", "ocean"], topic_tags: ["customs", "sanctions"], jurisdictions: ["us"], domains: [1] },
  { name: "EU CSDDD — Corporate Sustainability Due Diligence", url: "https://ec.europa.eu/growth/corporate-sustainability-due-diligence", tier: 1, description: "Supply chain human rights and environmental due diligence. Affects freight procurement directly.", transport_modes: ["air", "road", "ocean"], topic_tags: ["reporting"], jurisdictions: ["eu"], domains: [1] },

  // ── CUSTOMS & BORDER CONTROL ──
  { name: "WCO — World Customs Organization", url: "https://www.wcoomd.org", tier: 1, description: "Harmonized System (HS codes), customs procedures, Revised Kyoto Convention, SAFE Framework.", transport_modes: ["air", "road", "ocean"], topic_tags: ["customs"], jurisdictions: ["global"], domains: [1] },
  { name: "US CBP — Customs & Border Protection", url: "https://www.cbp.gov", tier: 1, description: "US customs authority. Entry requirements, HTS classification, ACE system, C-TPAT.", transport_modes: ["air", "road", "ocean"], topic_tags: ["customs"], jurisdictions: ["us"], domains: [1] },
  { name: "EU DG TAXUD — Customs Union", url: "https://taxation-customs.ec.europa.eu", tier: 1, description: "EU customs law. Union Customs Code, EU Single Window, AEO programme.", transport_modes: ["air", "road", "ocean"], topic_tags: ["customs"], jurisdictions: ["eu"], domains: [1] },
  { name: "Singapore Customs", url: "https://www.customs.gov.sg", tier: 1, description: "Singapore customs authority. TradeNet single window, FTZ regulations, Secure Trade Partnership.", transport_modes: ["air", "ocean"], topic_tags: ["customs"], jurisdictions: ["asia"], domains: [1] },
  { name: "Japan Customs — MOF", url: "https://www.customs.mof.go.jp/english", tier: 1, description: "Japan customs authority. AEO program, advance ruling, import/export procedures.", transport_modes: ["air", "ocean", "road"], topic_tags: ["customs"], jurisdictions: ["asia"], domains: [1] },
  { name: "China Customs — GACC", url: "https://english.customs.gov.cn", tier: 1, description: "China customs. Import/export regulations, CIFER food safety, GACC registration.", transport_modes: ["air", "ocean", "road"], topic_tags: ["customs"], jurisdictions: ["asia"], domains: [1] },

  // ── SANCTIONS & EXPORT CONTROLS ──
  { name: "OFAC — US Treasury Sanctions", url: "https://ofac.treas.gov", tier: 1, description: "US sanctions lists (SDN List, Sectoral Sanctions). All transactions must be screened.", transport_modes: ["air", "road", "ocean"], topic_tags: ["sanctions"], jurisdictions: ["us"], domains: [1] },
  { name: "BIS — Bureau of Industry and Security", url: "https://www.bis.doc.gov", tier: 1, description: "US export controls (EAR). Entity List, dual-use item controls.", transport_modes: ["air", "road", "ocean"], topic_tags: ["sanctions"], jurisdictions: ["us"], domains: [1] },
  { name: "EU Sanctions Map", url: "https://sanctionsmap.eu", tier: 1, description: "European Commission official sanctions tracker. All active EU restrictive measures.", transport_modes: ["air", "road", "ocean"], topic_tags: ["sanctions"], jurisdictions: ["eu"], domains: [1] },
  { name: "UN Security Council Sanctions", url: "https://www.un.org/securitycouncil/sanctions", tier: 1, description: "UN consolidated sanctions list. All member states legally obligated to implement.", transport_modes: ["air", "road", "ocean"], topic_tags: ["sanctions"], jurisdictions: ["global"], domains: [1] },

  // ── DANGEROUS GOODS ──
  { name: "IATA DGR — Dangerous Goods Regulations", url: "https://www.iata.org/en/programs/cargo/dgr", tier: 1, description: "Mandatory standard for transporting dangerous goods by air. Published annually.", transport_modes: ["air"], topic_tags: ["dangerous-goods"], vertical_tags: ["dangerous-goods", "chemicals"], jurisdictions: ["global"], domains: [1] },
  { name: "IMDG Code — IMO Dangerous Goods", url: "https://www.imo.org/en/OurWork/Safety/Pages/DangerousGoods.aspx", tier: 1, description: "Mandatory code for transporting dangerous goods by sea. Classification, packing, labeling.", transport_modes: ["ocean"], topic_tags: ["dangerous-goods"], vertical_tags: ["dangerous-goods", "chemicals"], jurisdictions: ["global"], domains: [1] },
  { name: "ADR — Dangerous Goods by Road (UNECE)", url: "https://unece.org/transport/dangerous-goods", tier: 1, description: "UN ECE agreement for road transport of dangerous goods across Europe.", transport_modes: ["road"], topic_tags: ["dangerous-goods"], vertical_tags: ["dangerous-goods"], jurisdictions: ["eu"], domains: [1] },
  { name: "US DOT PHMSA — Hazardous Materials", url: "https://www.phmsa.dot.gov", tier: 1, description: "US federal hazardous materials transport regulations across all modes.", transport_modes: ["air", "road", "ocean", "rail"], topic_tags: ["dangerous-goods"], vertical_tags: ["dangerous-goods"], jurisdictions: ["us"], domains: [1] },

  // ── FOOD SAFETY & COLD CHAIN ──
  { name: "Codex Alimentarius — FAO/WHO", url: "https://www.fao.org/fao-who-codexalimentarius", tier: 1, description: "International food safety standards. Referenced in WTO SPS Agreement.", transport_modes: ["air", "road", "ocean"], topic_tags: ["food-safety"], vertical_tags: ["cold-chain", "agriculture"], jurisdictions: ["global"], domains: [1] },
  { name: "US FDA — FSMA Sanitary Transportation", url: "https://www.fda.gov/food/food-safety-modernization-act-fsma", tier: 1, description: "FSMA Sanitary Transportation Rule — temperature control, vehicle cleanliness for food freight.", transport_modes: ["road", "air", "ocean"], topic_tags: ["food-safety"], vertical_tags: ["cold-chain"], jurisdictions: ["us"], domains: [1] },
  { name: "EU GDP — Good Distribution Practice (EMA)", url: "https://www.ema.europa.eu/en/human-regulatory-overview/manufacturing-medicines/good-manufacturing-practice/good-distribution-practice", tier: 1, description: "EU pharmaceutical distribution guidelines. GDP compliance mandatory for all pharma freight in EU.", transport_modes: ["air", "road", "ocean"], topic_tags: ["pharmaceutical"], vertical_tags: ["pharma"], jurisdictions: ["eu"], domains: [1] },
  { name: "GCCA — Global Cold Chain Alliance", url: "https://www.gcca.org", tier: 3, description: "Cold chain logistics industry association. Capacity data, energy benchmarks, sustainability guidance.", transport_modes: ["air", "road", "ocean"], topic_tags: ["food-safety"], vertical_tags: ["cold-chain"], jurisdictions: ["global"], domains: [4] },

  // ── CARGO SECURITY ──
  { name: "US TSA — Air Cargo Security", url: "https://www.tsa.gov/for-industry/air-cargo", tier: 1, description: "TSA cargo security regulations. Known Shipper, Certified Cargo Screening, 100% screening.", transport_modes: ["air"], topic_tags: ["security"], jurisdictions: ["us"], domains: [1] },
  { name: "C-TPAT — Customs-Trade Partnership", url: "https://www.cbp.gov/border-security/ports-entry/cargo-security/c-tpat-customs-trade-partnership-against-terrorism", tier: 1, description: "US CBP voluntary supply chain security program. Expedited processing for certified companies.", transport_modes: ["air", "road", "ocean"], topic_tags: ["security", "customs"], jurisdictions: ["us"], domains: [1] },
  { name: "IMO ISPS Code", url: "https://www.imo.org/en/OurWork/Security/Pages/SOLAS-XI-2%20ISPS%20Code.aspx", tier: 1, description: "Mandatory IMO security for ships and port facilities. SOLAS Chapter XI-2.", transport_modes: ["ocean"], topic_tags: ["security"], jurisdictions: ["global"], domains: [1] },

  // ── CABOTAGE & MARKET ACCESS ──
  { name: "US FMC — Federal Maritime Commission", url: "https://www.fmc.gov", tier: 1, description: "US ocean transportation regulator. OSRA 2022, detention & demurrage, tariff filing.", transport_modes: ["ocean"], topic_tags: ["cabotage"], jurisdictions: ["us"], domains: [1] },

  // ── LABOR & DRIVER REGULATIONS ──
  { name: "US FMCSA Hours of Service", url: "https://www.fmcsa.dot.gov/regulations/hours-of-service", tier: 1, description: "US federal hours of service for commercial truck drivers. ELD requirements.", transport_modes: ["road"], topic_tags: ["labor"], jurisdictions: ["us"], domains: [1] },
  { name: "OSHA — Transport Safety", url: "https://www.osha.gov/transportation", tier: 1, description: "US workplace safety for transport workers. Loading dock, forklift, warehouse ergonomics.", transport_modes: ["road"], topic_tags: ["labor"], jurisdictions: ["us"], domains: [1] },

  // ── PORT & AIRPORT ──
  { name: "IAPH — World Ports", url: "https://www.iaphworldports.org", tier: 3, description: "Global port authority association. World Ports Sustainability Program. 180 member ports.", transport_modes: ["ocean"], topic_tags: ["corridors"], jurisdictions: ["global"], domains: [1] },
  { name: "ACI — Airports Council International", url: "https://www.aci.aero", tier: 3, description: "Airport Carbon Accreditation program. Tracks airport net-zero pathways.", transport_modes: ["air"], topic_tags: ["corridors"], jurisdictions: ["global"], domains: [1] },

  // ── DIGITAL & DATA COMPLIANCE ──
  { name: "EU AI Act", url: "https://artificialintelligenceact.eu", tier: 1, description: "World's first comprehensive AI regulation. Affects AI-powered freight pricing and risk scoring.", transport_modes: ["air", "road", "ocean"], topic_tags: ["digital"], jurisdictions: ["eu"], domains: [1] },

  // ── PACKAGING ──
  { name: "Ellen MacArthur Foundation — Circular Economy", url: "https://ellenmacarthurfoundation.org", tier: 4, description: "Leading circular economy body. Global Commitment on plastic packaging signed by major shippers.", transport_modes: ["air", "road", "ocean"], topic_tags: ["packaging"], jurisdictions: ["global"], domains: [7] },
  { name: "EUROPEN — European Packaging Environment", url: "https://europen-packaging.eu", tier: 3, description: "EU packaging industry body. PPWR compliance guidance, EPR schemes, recyclability standards.", transport_modes: ["air", "road", "ocean"], topic_tags: ["packaging"], jurisdictions: ["eu"], domains: [1] },
];

async function run() {
  console.log(`\n=== SOURCE REGISTRY EXPANSION ===`);
  console.log(`Sources to add: ${SOURCES.length}`);

  let inserted = 0;
  let skipped = 0;

  for (const src of SOURCES) {
    // Check for existing by URL
    const { data: existing } = await supabase
      .from("sources")
      .select("id")
      .eq("url", src.url)
      .limit(1);

    if (existing?.length) {
      console.log(`SKIP: ${src.name} (URL exists)`);
      skipped++;
      continue;
    }

    // Also check by name
    const { data: byName } = await supabase
      .from("sources")
      .select("id")
      .eq("name", src.name)
      .limit(1);

    if (byName?.length) {
      console.log(`SKIP: ${src.name} (name exists)`);
      skipped++;
      continue;
    }

    const { error } = await supabase.from("sources").insert({
      name: src.name,
      url: src.url,
      tier: src.tier,
      tier_at_creation: src.tier,
      description: src.description,
      transport_modes: src.transport_modes || [],
      topic_tags: src.topic_tags || [],
      vertical_tags: src.vertical_tags || [],
      jurisdictions: src.jurisdictions || ["global"],
      domains: src.domains || [1],
      status: "provisional",
      intelligence_types: ["REG"],
      update_frequency: "varies",
      notes: "Added from comprehensive source registry expansion — April 2026. Requires verification.",
    });

    if (error) {
      console.log(`ERROR: ${src.name} — ${error.message}`);
    } else {
      console.log(`OK: ${src.name}`);
      inserted++;
    }
  }

  const { count } = await supabase.from("sources").select("*", { count: "exact", head: true });
  console.log(`\n=== COMPLETE ===`);
  console.log(`Inserted: ${inserted}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Total sources in registry: ${count}`);
}

run();
