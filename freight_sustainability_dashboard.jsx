import { useState, useMemo, useCallback } from "react";

/* ═══════════════════════════════════════════════════════════════
   FREIGHT SUSTAINABILITY INTELLIGENCE — v7
   3-Tab Architecture · 119 Resources · 8 Jurisdictions
   Knowledge Base + Reference Tool
   ═══════════════════════════════════════════════════════════════ */

// ── Filter Dimensions ──
const MODES=[{id:"air",l:"Air",i:"✈️"},{id:"road",l:"Road",i:"🚛"},{id:"ocean",l:"Ocean",i:"🚢"}];
const TOPICS=[{id:"emissions",l:"Emissions & Carbon Pricing",i:"🏭"},{id:"fuels",l:"Sustainable Fuels & Energy",i:"⛽"},{id:"transport",l:"Green Transport Standards",i:"🚚"},{id:"reporting",l:"ESG Reporting & Methodology",i:"📊"},{id:"packaging",l:"Packaging & Circular Economy",i:"📦"},{id:"corridors",l:"Green Corridors & Infrastructure",i:"⟷"},{id:"research",l:"Research & Intelligence",i:"🔬"}];
const JURS=[{id:"eu",l:"EU"},{id:"us",l:"US"},{id:"uk",l:"UK"},{id:"latam",l:"LatAm"},{id:"asia",l:"Asia"},{id:"hk",l:"HK"},{id:"meaf",l:"ME/Africa"},{id:"global",l:"Global"}];
const PRIS=["CRITICAL","HIGH","MODERATE","LOW"];
const PC={CRITICAL:"#FF3B30",HIGH:"#FF9500",MODERATE:"#8e8e93",LOW:"#aeaeb2"};

// ── Resource Factory + Seed Data (119 verified resources) ──
const R=(id,cat,sub,title,url,note,type,pri,rsn,tags,wi,wm,kd,tl)=>({id,cat,sub,title,url,note,type,priority:pri,added:"2026-02-28",reasoning:rsn,tags,whatIsIt:wi,whyMatters:wm,keyData:kd,...(tl?{timeline:tl}:{})});

const SEED = [
// ═══ OCEAN SHIPPING (12) ═══
R("o1","ocean","IMO Regulations","IMO GHG Strategy 2023","https://www.imo.org/en/MediaCentre/HotTopics/Pages/HotTopics.aspx","Net-zero by ~2050. Checkpoints: 20% by 2030, 70% by 2040. Replaces 2018 strategy.","framework","CRITICAL","Sets the global trajectory for carrier fleet investment and green fuel adoption — every ocean freight contract is shaped by this.",["IMO","net-zero","2050","global"],"IMO's revised strategy committing global shipping to net-zero GHG emissions by around 2050 with interim checkpoints.","This strategy determines carrier fleet investment direction over the next 25 years. Live events freight forwarders must understand which carriers are investing ahead of the curve to negotiate favorable long-term contracts. Green fuel surcharges will be directly linked to these targets.",["Net-zero by or around 2050","20% reduction by 2030 (striving 30%)","70% by 2040 (striving 80%)","Pricing mechanism under negotiation","Replaces 2018 50%-by-2050 strategy"],[{date:"2023-07",label:"Strategy adopted"},{date:"2025-04",label:"MEPC 83: NZF approved"},{date:"2025-10",label:"MEPC ES.2 adoption"},{date:"2027-03",label:"NZF entry into force"},{date:"2030-01",label:"20% checkpoint"},{date:"2040-01",label:"70% checkpoint"}]),
R("o2","ocean","IMO Regulations","FuelEU Maritime","https://transport.ec.europa.eu/transport-modes/maritime/fueleu-maritime_en","GHG intensity limits: 2% by 2025, 80% by 2050. Penalty €2,400/tonne VLSFO shortfall.","regulation","CRITICAL","Mandatory GHG intensity limits with €2,400/tonne penalties — direct fuel surcharge driver.",["FuelEU","GHG intensity","EU ports","penalty"],"EU mandate requiring GHG intensity of energy used onboard ships at EU ports to decrease progressively.","Carriers will pass through fuel compliance costs on every EU port call. High-value cargo operators must budget for escalating surcharges and compare green corridor premiums against conventional routing costs.",["Penalty: €2,400/tonne VLSFO shortfall","2% GHG reduction by 2025","6% by 2030, 80% by 2050","Shore power mandate from 2030","Applies to all EU port calls"],[{date:"2025-01",label:"2% reduction"},{date:"2030-01",label:"6% + shore power"},{date:"2050-01",label:"80% reduction"}]),
R("o3","ocean","IMO Regulations","EU ETS for Shipping","https://climate.ec.europa.eu/eu-action/transport/reducing-emissions-shipping-sector_en","Ships >5,000GT surrender ETS allowances: 40%(2024), 70%(2025), 100%(2026).","regulation","CRITICAL","Directly binding ETS obligation with financial penalties. Immediate cost pass-through on every EU shipment.",["ETS","ocean","allowances","2024"],"EU regulation extending the Emissions Trading System to maritime shipping for vessels over 5,000 gross tonnage.","Every ocean shipment via EU ports faces ETS surcharges passed through by carriers. Event logistics specialists must budget for escalating costs (40%→100%) and factor ETS into lane comparisons when routing equipment and staging materials.",["Surrender: 40% (2024), 70% (2025), 100% (2026)","CH4 and N2O included from 2026","5,000+ vessels on THETIS-MRV","Applies to vessels >5,000 GT calling EU ports"],[{date:"2024-01",label:"40% phase-in"},{date:"2025-01",label:"70%"},{date:"2025-09",label:"First surrendering"},{date:"2026-01",label:"100% + CH4/N2O"}]),
R("o4","ocean","IMO Regulations","CII (Carbon Intensity Indicator)","https://www.imo.org/en/OurWork/Environment/Pages/Carbon-Intensity-Code-rating.aspx","Annual A-E rating; D for 3yrs or E for 1yr triggers corrective action. MEPC 83 completed Phase 1 review; Z-factors set for 2027-2030.","regulation","CRITICAL","Annual vessel ratings directly affect carrier fleet viability and charter market pricing. Phase 1 review complete — thresholds confirmed tightening.",["CII","rating","vessel","annual"],"IMO's operational carbon intensity rating system assigning annual A-E grades to individual vessels. MEPC 83 completed Phase 1 review and set CII reduction (Z) factors for 2027-2030.","Vessels rated D or E face operational restrictions and corrective action requirements. Freight forwarders should verify carrier vessel CII ratings when booking — poorly rated vessels may face speed restrictions that affect transit times for time-sensitive event cargo. Z-factors for 2027-2030 now confirmed means predictable tightening schedule.",["Annual rating A-E per vessel","D for 3 years or E for 1 year → corrective action plan","MEPC 83: Phase 1 review completed Apr 2025","Z-factors for 2027-2030 formally adopted","Phase 2 review: Jan 2026 → Spring 2027","Affects charter market vessel valuations"],[{date:"2023-01",label:"CII ratings start"},{date:"2025-04",label:"Phase 1 complete"},{date:"2026-01",label:"Phase 2 starts"},{date:"2027-01",label:"Z-factors apply"},{date:"2030-01",label:"Z-factors end"}]),
R("o5","ocean","IMO Regulations","IMO MARPOL Annex VI","https://www.imo.org/en/OurWork/Environment/Pages/Air-Pollution.aspx","Sulphur cap 0.5% global, 0.1% ECA zones. NOx Tier III.","regulation","HIGH","Sulphur and NOx limits drive fuel choices and scrubber surcharges across all ocean routes.",["MARPOL","sulphur","ECA","NOx"],"International maritime air pollution rules setting limits on sulphur oxides, nitrogen oxides, and particulate matter from ships.","Sulphur compliance costs are embedded in every ocean freight rate. ECA zone surcharges apply on Northern European and North American routes frequently used for event equipment shipping.",["Global sulphur cap: 0.5% (since 2020)","ECA zones: 0.1% limit","NOx Tier III for new engines","Compliance via low-sulphur fuel or scrubbers"],[{date:"2020-01",label:"0.5% global cap"},{date:"2021-01",label:"NOx Tier III"},{date:"2025-01",label:"ECA review"}]),
R("o6","ocean","IMO Regulations","EU MRV Regulation","https://mrv.emsa.europa.eu/","Mandatory CO2 monitoring/reporting/verification for ships >5,000GT at EU ports.","tool","HIGH","Mandatory compliance portal — all EU ETS maritime data flows through THETIS-MRV.",["MRV","EMSA","reporting","compliance"],"EU regulation requiring monitoring, reporting and verification of CO2 emissions for large ships calling at EU ports.","Vessel-level emissions data determines carrier ETS exposure and surcharge legitimacy. Freight forwarders can verify carrier environmental claims and identify lowest-emission vessels for client sustainability reports.",["5,000+ companies registered","Covers all EU port calls","Public company-level data","Required for ETS allowance calculations"]),
R("o7","ocean","Fuels & Technology","Getting to Zero Coalition","https://www.getzerocoalition.org/","Industry alliance targeting zero-emission vessels by 2030.","initiative","HIGH","Green corridor pilots on major trade lanes inform surcharge viability by route.",["green corridors","zero-emission","2030"],"Industry coalition of 200+ companies working to deploy commercially viable zero-emission vessels by 2030.","Corridor pilots on routes like EU-Asia and transatlantic directly affect lane options for live events freight. Understanding pilot timelines helps price green shipping premiums for clients requesting low-carbon logistics.",["200+ member companies","Target: commercially viable ZEV by 2030","6+ active corridor projects","Focus: ammonia, methanol, hydrogen"],[{date:"2019-09",label:"Coalition formed"},{date:"2025-01",label:"Pilot corridors"},{date:"2030-01",label:"Viable ZEV target"}]),
R("o8","ocean","Fuels & Technology","Alternative Fuels Insight (IRENA/IMO)","https://www.irena.org/Energy-Transition/Technology/Maritime-transport","Tracks LNG, methanol, ammonia, hydrogen adoption across global fleet.","data","HIGH","Fuel transition data essential for understanding which carriers are future-proofing fleets.",["alternative fuels","LNG","methanol","ammonia"],"IRENA's tracking of alternative fuel adoption rates and technology readiness across the global shipping fleet.","Fuel transition rates indicate which carriers are investing in compliance. Event logistics specialists can identify forward-looking carrier partners and avoid those facing stranded asset risk.",["LNG fleet growth tracking","Methanol-ready vessel orders","Ammonia engine development status","Hydrogen pilot projects"]),
R("o9","ocean","Fuels & Technology","Norway Zero-Emission Shipping","https://www.regjeringen.no/en/topics/transport-and-communications/innsiktsartikler-samferdsel/zero-emission-shipping/id2857855/","World's first zero-emission fjord requirements by 2026.","regulation","MODERATE","Norway leads with mandatory zero-emission requirements — signals direction for other jurisdictions.",["Norway","fjords","zero-emission","2026"],"Norway's pioneering regulations requiring zero-emission vessel operations in Norwegian fjords from 2026.","Norway's requirements signal the direction for other jurisdictions. Freight forwarders routing through Scandinavian ports should monitor for compliance implications on vessel selection.",["Zero-emission fjord requirements by 2026","World's first mandatory ZEV shipping zone","Applies to domestic ferry and cargo routes"]),
R("o10","ocean","Fuels & Technology","ESPO (European Sea Ports Organisation)","https://www.espo.be/","EU port sustainability standards, shore power, cold ironing.","industry","MODERATE","Port sustainability standards affect dwell costs and operational requirements at EU hubs.",["ports","shore power","cold ironing","EU"],"European port industry body setting sustainability standards and tracking shore power deployment.","Port-level requirements (shore power mandates, emission zones) affect vessel selection and dwell costs at major European hubs used for event equipment import/export.",["Shore power deployment tracking","Environmental Ship Index (ESI)","Port sustainability report","Cold ironing mandates"]),
R("o11","ocean","Fuels & Technology","Lloyd's Register Decarbonisation Hub","https://www.lr.org/en/sustainability/decarbonisation/","Technical guidance on fleet decarbonisation pathways.","guidance","HIGH","Classification society guidance shapes carrier fleet investment decisions and fuel transition timelines.",["Lloyd's Register","fleet","decarbonisation","technical"],"Lloyd's Register's technical advisory platform for maritime fleet decarbonisation pathways and fuel transition.","Classification society guidance directly influences carrier fleet decisions. Understanding LR's recommended pathways helps freight forwarders assess carrier readiness and negotiate informed contracts.",["Fleet decarbonisation pathway modelling","Fuel transition technical guidance","Vessel retrofit advisory","Regulatory compliance support"]),
R("o12","ocean","Fuels & Technology","Blue Visby Solution","https://www.bluevisby.com/","Speed optimisation reducing voyage emissions 10-15%.","tool","MODERATE","Operational efficiency tool — immediate emissions reduction without hardware changes.",["speed optimisation","emissions","voyage","software"],"Digital platform optimising vessel speed profiles to reduce voyage emissions by 10-15% without hardware modifications.","Speed optimisation tools offer immediate emissions reductions for ocean freight. Forwarders can ask carriers about Blue Visby or similar tools when clients request lower-carbon shipping options.",["10-15% emission reduction per voyage","No hardware changes required","AI-driven speed profile optimisation"]),
// ═══ AIR FREIGHT (8) ═══
R("a1","air","CORSIA & International","CORSIA (ICAO)","https://www.icao.int/environmental-protection/CORSIA/Pages/default.aspx","Carbon offsetting for international aviation. Mandatory from 2027.","framework","CRITICAL","Global offsetting costs embedded in air cargo rates from 2027 mandatory phase.",["CORSIA","offsetting","ICAO","2027"],"ICAO's Carbon Offsetting and Reduction Scheme for International Aviation — a global market-based measure for international flights.","CORSIA offset costs flow through to air cargo rates on international routes. Live events freight forwarders must factor offset costs into air freight quotes, especially for time-critical show equipment and high-value touring cargo.",["Pilot phase 2021-2023","First phase 2024-2026, mandatory from 2027","Airlines offset growth above 2019 baseline","~$5-15/tonne CO2 offset price","Covers ~85% of international aviation emissions"],[{date:"2024-01",label:"First phase"},{date:"2027-01",label:"Mandatory"},{date:"2035-01",label:"Full scope"}]),
R("a2","air","CORSIA & International","EU Aviation ETS","https://climate.ec.europa.eu/eu-action/transport/reducing-emissions-aviation_en","Aviation in EU ETS since 2012. Free allowances out by 2026. Scope expanding.","regulation","CRITICAL","Intra-EEA carbon costs already in rates; scope expansion would transform transatlantic air cargo pricing.",["ETS","aviation","intra-EEA","2027"],"EU Emissions Trading System applied to aviation — currently intra-EEA flights, expanding to 50% of international flights from 2027.","All intra-European air freight already carries ETS carbon cost. Scope expansion to international flights would significantly increase transatlantic and EU-Asia air cargo rates used for live events touring equipment.",["Aviation in EU ETS since 2012","Free allowances phased out by 2026","Intra-EEA + 50% international from 2027","Full auctioning from 2026"],[{date:"2026-01",label:"Full auctioning"},{date:"2027-01",label:"Scope expansion"}]),
R("a3","air","CORSIA & International","ReFuelEU Aviation","https://transport.ec.europa.eu/transport-modes/air/fuel/refueleu-aviation_en","SAF blending: 2% by 2025, 6% by 2030, 70% by 2050. All EU airports.","regulation","CRITICAL","Mandatory SAF blend directly increases air cargo fuel surcharges at all EU airports.",["SAF","EU airports","blending","fuel cost"],"EU regulation mandating minimum Sustainable Aviation Fuel blending percentages for all fuel uplifted at EU airports.","Every air cargo uplift at EU airports carries a SAF cost premium. Event logistics operators must pass through SAF surcharges and compare EU vs non-EU routing costs for time-sensitive show freight.",["2% SAF mandate from Jan 2025","6% by 2030, 20% by 2035, 70% by 2050","Applies to ALL fuel uplifted at EU airports","Includes 0.7% synthetic fuel requirement"],[{date:"2025-01",label:"2% SAF"},{date:"2030-01",label:"6%"},{date:"2035-01",label:"20%"},{date:"2050-01",label:"70%"}]),
R("a4","air","CORSIA & International","UK SAF Mandate","https://www.gov.uk/government/publications/sustainable-aviation-fuel-mandate","UK: 2% SAF from 2025, 10% by 2030, 22% by 2040.","regulation","HIGH","Independent UK mandate means separate SAF surcharge layer for UK-departing event freight.",["UK","SAF","mandate","2025"],"UK's independent Sustainable Aviation Fuel mandate applying to all UK-departing flights.","Post-Brexit UK has its own SAF mandate with different targets than the EU. Freight forwarders routing through UK airports face a separate surcharge structure — important for London-based event logistics.",["2% SAF blend from 2025","10% by 2030, 22% by 2040","Applies to UK-departing flights","Separate from EU ReFuelEU"],[{date:"2025-01",label:"2% SAF"},{date:"2030-01",label:"10%"},{date:"2040-01",label:"22%"}]),
R("a5","air","CORSIA & International","SAFA (Sustainable Air Freight Alliance)","https://www.safa.aero/","Industry body promoting SAF adoption for air cargo.","initiative","HIGH","Industry coalition driving SAF procurement — member commitments affect tender requirements.",["SAFA","SAF","air cargo","industry"],"Industry alliance promoting SAF adoption specifically for air cargo operations and Scope 3 accounting.","SAFA member companies increasingly require SAF usage in cargo tenders. Understanding alliance commitments helps freight forwarders anticipate client requirements for sustainable air logistics.",["SAF procurement coalition","Scope 3 air cargo accounting","Member shipper commitments","Book-and-claim mechanisms"]),
R("a6","air","Emissions Accounting","ICAO Carbon Calculator","https://www.icao.int/environmental-protection/CarbonOffset/Pages/default.aspx","Official methodology for aviation CO2 per cargo tonne.","tool","MODERATE","Standard calculator for air freight emissions — baseline for client reporting.",["ICAO","calculator","CO2","methodology"],"ICAO's official methodology and calculator for quantifying aviation CO2 emissions per passenger or cargo tonne-kilometre.","Standard reference for air freight emissions calculations. Freight forwarders use this as baseline methodology when responding to client emissions data requests for air cargo shipments.",["Official ICAO methodology","Per-tonne-km emission factors","Route-specific calculations","Accepted by CORSIA"]),
R("a7","air","Emissions Accounting","GLEC Framework (Air Freight)","https://www.smartfreightcentre.org/en/how-to-implement-glec-framework/","ISO 14083-aligned air freight emissions accounting.","standard","HIGH","Industry standard methodology for logistics emissions — required in client tenders.",["GLEC","ISO 14083","air freight","emissions"],"Smart Freight Centre's Global Logistics Emissions Council framework for calculating air freight emissions, aligned with ISO 14083.","GLEC is the methodology event logistics specialists actually use for shipment-level air freight emissions. Clients increasingly specify GLEC-compliant reporting in RFPs and tenders.",["Aligned with ISO 14083","Default emission factors provided","Covers all transport modes","Accreditation programme available"]),
R("a8","air","Emissions Accounting","Aviation Week: Sustainability","https://aviationweek.com/","Industry news on SAF, fleet transitions, carrier sustainability.","news","MODERATE","Industry intelligence on carrier sustainability moves — informs carrier selection.",["aviation news","SAF deals","fleet","sustainability"],"Leading aviation industry publication covering SAF developments, fleet transitions, and carrier sustainability programmes.","Trade press intelligence on which carriers are investing in SAF, ordering efficient aircraft, and setting sustainability targets — useful for carrier selection and client advisory.",["SAF deal tracking","Fleet transition news","Carrier sustainability programmes","Regulatory analysis"]),
// ═══ LAND, ROAD & MULTIMODAL (10) ═══
R("l1","land","EU & European Standards","EU CO2 Standards for Heavy Trucks","https://climate.ec.europa.eu/eu-action/transport/road-transport-reducing-co2-emissions-vehicles/co2-emission-performance-standards-heavy-duty-vehicles_en","45% CO2 cut by 2030, 65% by 2035, 90% by 2040 vs 2019.","regulation","CRITICAL","Aggressive truck CO2 targets will reshape European road freight fleet composition and costs.",["CO2 trucks","EU","2030","2040"],"EU regulation setting CO2 emission performance standards for new heavy-duty vehicles with declining targets to 2040.","These targets determine when diesel trucks are phased out of European fleets. Live events freight forwarders relying on road transport for last-mile delivery and drayage must plan for fleet transition costs from subcontractors.",["45% CO2 reduction by 2030 vs 2019","65% by 2035, 90% by 2040","Applies to new truck registrations","Affects all EU road freight subcontractors"],[{date:"2030-01",label:"45% cut"},{date:"2035-01",label:"65%"},{date:"2040-01",label:"90%"}]),
R("l2","land","EU & European Standards","Euro 7 Standard","https://ec.europa.eu/commission/presscorner/detail/en/ip_22_6495","New emission limits for trucks. Lower NOx/particulate thresholds.","regulation","HIGH","New pollutant limits affect drayage fleet procurement and LEZ access across EU.",["Euro 7","NOx","particulates","trucks"],"EU regulation setting new pollutant emission limits for vehicles including heavy-duty trucks, tightening NOx and particulate standards.","Non-compliant vehicles face Low Emission Zone restrictions across European cities — critical for last-mile event freight delivery. Subcontractor fleet compliance must be verified.",["Tightens NOx by ~56% vs Euro VI","Includes brake and tyre particle emissions","Battery durability requirements","Applies to new vehicles from 2027"],[{date:"2025-04",label:"Final text"},{date:"2027-07",label:"New trucks"},{date:"2029-07",label:"All vehicles"}]),
R("l3","land","EU & European Standards","EU AFIR (Alt Fuels Infrastructure)","https://transport.ec.europa.eu/transport-modes/road/infrastructure/alternative-fuels-infrastructure_en","Mandatory EV charging + H2 refuelling every 60km on TEN-T by 2025-2027.","regulation","HIGH","Infrastructure rollout determines ZEV fleet feasibility for European road freight.",["AFIR","EV charging","hydrogen","TEN-T"],"EU regulation mandating deployment of EV charging and hydrogen refuelling infrastructure along the trans-European transport network.","Infrastructure availability determines whether zero-emission road freight is viable on specific corridors. Forwarders must track rollout to assess which routes can support electric trucks.",["EV charging every 60km on TEN-T core by 2025","H2 refuelling every 200km by 2030","Minimum 350kW per charging station"],[{date:"2025-01",label:"Core EV charging"},{date:"2027-01",label:"Extended network"},{date:"2030-01",label:"H2 refuelling"}]),
R("l4","land","EU & European Standards","CER (European Railways)","https://www.cer.be/","EU rail decarbonisation, electrification targets, modal shift.","industry","MODERATE","Rail modal shift economics directly relevant when clients ask for lower-carbon alternatives.",["rail","modal shift","electrification","EU"],"Community of European Railways promoting rail decarbonisation and modal shift from road to rail.","Rail offers significantly lower emissions per tonne-km than road. When clients request green logistics options, rail alternatives for event equipment can reduce carbon footprint by 60-80%.",["Rail produces ~75% less CO2 than road per tkm","EU electrification targets","Modal shift incentive programmes"]),
R("l5","land","EU & European Standards","European Clean Trucking Alliance","https://cleantruckingalliance.org/","Advocacy for rapid ZEV truck adoption in Europe.","initiative","MODERATE","Tracks EU legislative progress on heavy-duty vehicle standards.",["ZEV trucks","advocacy","Europe"],"Advocacy coalition pushing for accelerated zero-emission truck adoption across Europe.","Policy signals from this alliance indicate direction of EU truck regulations. Useful for anticipating fleet transition timelines.",["EU ZEV truck advocacy","Legislative progress tracking","Industry position papers"]),
R("l6","land","US Standards","EPA Heavy-Duty Phase 3 Rule","https://www.epa.gov/regulations-emissions-vehicles-and-engines/heavy-duty-vehicle-greenhouse-gas-phase-3-standards","GHG standards for MY2027-2032; ~60% new sleeper cabs ZEV by 2032.","regulation","HIGH","Stringent US truck standards under political uncertainty — affects drayage and interstate fleet planning.",["EPA","Phase 3","GHG","trucks"],"EPA's stringent GHG performance standards for heavy-duty trucks covering model years 2027-2032.","These standards determine the US truck fleet transition timeline. Freight forwarders with US operations must plan for drayage fleet changes, especially at West Coast ports handling event equipment imports.",["~60% of new sleeper cabs ZEV by 2032","Model years 2027-2032","Under political review — regulatory uncertainty","Affects Class 7-8 trucks"],[{date:"2027-01",label:"MY2027 starts"},{date:"2030-01",label:"Ramp-up"},{date:"2032-01",label:"60% ZEV target"}]),
R("l7","land","US Standards","CARB Advanced Clean Trucks","https://ww2.arb.ca.gov/our-work/programs/advanced-clean-trucks","California: 55% Class 4-8 ZEV sales by 2035. 12 states following.","regulation","HIGH","CARB rules control US West Coast port drayage — non-compliance means no port access.",["CARB","ZEV","California","drayage"],"California Air Resources Board mandate requiring increasing percentages of new truck sales to be zero-emission.","All drayage at LA/Long Beach — the primary US gateway for event equipment — must comply. Non-compliant trucks face port access restrictions. 12+ states follow California's rules.",["55% of Class 4-8 sales ZEV by 2035","12+ Section 177 states following CA","Federal waiver disputes ongoing"],[{date:"2024-01",label:"Phase-in starts"},{date:"2027-01",label:"40% ZEV"},{date:"2035-01",label:"55% ZEV"}]),
R("l8","land","US Standards","Drive Electric: Zero-Emission Freight","https://driveelectric.gov/","US federal ZEV infrastructure funding and grant programmes.","tool","MODERATE","Federal funding programmes for fleet electrification — relevant for US subcontractor readiness.",["federal","grants","electrification","US"],"US federal government portal for zero-emission vehicle infrastructure funding and fleet electrification grants.","Federal grants can offset fleet transition costs for US road freight subcontractors. Understanding available programmes helps evaluate subcontractor investment timelines.",["Federal ZEV infrastructure funding","Fleet electrification grants","National charging network plans"]),
R("l9","land","US Standards","American Trucking Associations","https://www.trucking.org/environment","Industry positions on EPA rules, clean truck programmes.","industry","MODERATE","Industry body positions signal how US trucking will respond to ZEV mandates.",["ATA","industry","EPA","clean trucks"],"American Trucking Associations' environment programme covering industry response to EPA regulations and clean truck programmes.","ATA positions indicate how the US trucking industry will respond to regulations — important context for freight forwarders managing US subcontractor relationships.",["Industry positions on EPA rules","Clean truck programme advocacy","Fuel efficiency standards input"]),
R("l10","land","US Standards","DOT National Freight Strategic Plan","https://www.transportation.gov/freight/","US multimodal freight policy including sustainability.","framework","MODERATE","Federal freight strategy sets priorities for infrastructure investment affecting routing decisions.",["DOT","multimodal","freight","strategy"],"US Department of Transportation's national strategic plan for multimodal freight including sustainability components.","Federal freight strategy influences infrastructure investment that affects routing options. Useful background for US freight planning.",["Multimodal freight policy","Sustainability components","Infrastructure investment priorities"]),
// ═══ CARBON, TRADE & CUSTOMS (7) ═══
R("t1","cbam","EU CBAM","EU CBAM","https://taxation-customs.ec.europa.eu/carbon-border-adjustment-mechanism_en","Carbon price on imported cement, steel, aluminium, fertilisers, electricity, hydrogen. Definitive phase from Jan 2026. Omnibus simplified: 50t de minimis, certificates from Feb 2027.","regulation","CRITICAL","CBAM definitive phase NOW — customs documentation and carbon costs on all covered EU imports. Direct operational impact for staging equipment containing steel/aluminium.",["CBAM","EU imports","customs","carbon border","2026","de minimis"],"EU's Carbon Border Adjustment Mechanism imposing carbon costs on imports of carbon-intensive goods entering the EU. Omnibus simplification adopted Oct 2025.","CBAM creates new customs documentation for EU-bound freight. Event staging with steel/aluminium, film production rigs, automotive components, and humanitarian equipment using covered materials all affected. Only authorised CBAM declarants can import from Jan 2026. Freight forwarders must verify CBAM registration numbers before customs clearance.",["Definitive phase: Jan 2026","Certificates purchase: from Feb 2027","50-tonne de minimis exemption (Omnibus)","Annual declaration by 30 Sep (was 31 May)","Downstream products expansion proposed for 2028","Delegated acts on 3rd-country carbon price still pending"],[{date:"2023-10",label:"Transitional"},{date:"2025-10",label:"Omnibus simplification"},{date:"2026-01",label:"Definitive phase"},{date:"2026-03",label:"Auth deadline"},{date:"2027-02",label:"Certificate sales"},{date:"2027-09",label:"First declaration"}]),
R("t2","cbam","EU CBAM","WTO Environment & Trade","https://www.wto.org/english/tratop_e/envir_e/envir_e.htm","WTO compatibility of carbon border measures; trade dispute monitoring.","framework","HIGH","WTO challenges to CBAM could reshape global trade-linked climate rules.",["WTO","trade","environment","disputes"],"WTO's framework governing the intersection of trade rules and environmental measures like carbon border adjustments.","If CBAM faces WTO challenges, outcomes affect long-term trade flows. Freight forwarders need background intelligence on dispute trajectories affecting cross-border carbon pricing.",["GATT Article XX exceptions","CBAM WTO compatibility under scrutiny","Trade facilitation and environment"]),
R("t3","cbam","EU CBAM","OECD Environment","https://www.oecd.org/environment/","Carbon pricing tracker across 70+ jurisdictions.","data","HIGH","Cross-jurisdictional carbon pricing comparison essential for route cost modelling.",["OECD","carbon pricing","effective rates"],"OECD's environmental division tracking carbon pricing instruments and effective carbon rates across 70+ jurisdictions.","Effective carbon rates vary dramatically by jurisdiction. This data helps freight forwarders compare routing options based on carbon cost exposure.",["70+ jurisdictions tracked","Effective Carbon Rates database","Policy implementation analysis"]),
R("t4","cbam","EU CBAM","UNCTAD Sustainable Transport","https://unctad.org/topic/transport-and-trade-logistics/sustainable-freight-transport","How carbon pricing affects trade competitiveness and shipping costs.","analysis","HIGH","UN analysis of carbon pricing impacts on freight trade competitiveness.",["UNCTAD","trade","carbon","shipping costs"],"UN Conference on Trade and Development tracking how carbon pricing affects trade competitiveness and shipping cost structures.","UNCTAD analysis shows how carbon pricing differentials between jurisdictions create trade distortions that affect routing economics.",["Carbon pricing trade impact analysis","Shipping cost structure changes","Developing country vulnerability","Trade competitiveness effects"]),
R("t5","cbam","Carbon Pricing","World Bank Carbon Pricing Dashboard","https://carbonpricingdashboard.worldbank.org/","Live tracker of 73 carbon pricing instruments, 23% of global GHG.","data","CRITICAL","Global carbon price intelligence essential for forward pricing across all trade lanes.",["carbon pricing","ETS","global","dashboard"],"World Bank dashboard tracking all operational carbon pricing instruments worldwide — ETS markets and carbon taxes.","Carbon prices affect freight costs differently by jurisdiction. This is the essential tool for comparing carbon cost exposure across routing options and building forward pricing models.",["73+ instruments tracked","Covers 23% of global GHG emissions","ETS price data updated regularly","Revenue tracking by jurisdiction"]),
R("t6","cbam","Carbon Pricing","ICAP ETS Map","https://icapcarbonaction.com/en/ets","International Carbon Action Partnership — comprehensive ETS tracker.","tracker","HIGH","Most detailed ETS status tracker globally — covers all operational and planned schemes.",["ICAP","ETS","global","carbon market"],"International Carbon Action Partnership providing comprehensive status tracking of emissions trading systems worldwide.","Detailed ETS status information for every jurisdiction helps freight forwarders understand where carbon costs are rising and plan accordingly.",["All operational ETS mapped","Planned and under-development schemes","Price tracking and comparison","Policy design features"]),
R("t7","cbam","Carbon Pricing","GEF (Global Environment Facility)","https://www.thegef.org/","Environmental financing for developing markets.","finance","MODERATE","Financing for developing-market carbon commitments affects long-term trade lane carbon costs.",["GEF","financing","developing markets"],"Multilateral financing mechanism for environmental projects in developing countries.","GEF-funded programmes in developing markets can create new environmental requirements on trade lanes used for event logistics.",["Environmental project financing","Developing market focus","Carbon market capacity building"]),
// ═══ COMPLIANCE & DISCLOSURE (11) ═══
R("c1","compliance","EU Mandatory Reporting","CSRD","https://finance.ec.europa.eu/capital-markets-union-and-financial-markets/company-reporting-and-auditing/company-reporting/corporate-sustainability-reporting_en","Mandatory ESG reporting. Post-Omnibus: 1,000+ employees mandatory, 250-1,000 voluntary opt-in. Scope 1/2/3 required. Assurance shifted from reasonable to limited.","regulation","CRITICAL","CSRD drives client data requests — even if forwarders are below threshold, clients in scope demand Scope 3 transport data.",["CSRD","reporting","EU","Scope 3","Omnibus"],"EU Corporate Sustainability Reporting Directive requiring comprehensive sustainability disclosure including value chain emissions. Omnibus simplification adopted Feb 2026.","Even if a freight forwarder falls below the 1,000-employee Omnibus threshold, major clients subject to CSRD will require Scope 3 transport emissions data from logistics partners. The voluntary opt-in for 250-1,000 employee companies means some mid-size clients may CHOOSE to report, creating data requests even from below-threshold companies.",["Post-Omnibus threshold: 1,000 employees mandatory","Voluntary opt-in: 250-1,000 employees","~5,000 companies in mandatory scope (was ~50,000)","ESRS standards require Scope 1, 2, 3","Assurance: limited (was moving to reasonable)","Wave 2 delayed by 2 years","Value chain (logistics) data still mandatory"],[{date:"2024-01",label:"Wave 1 PIEs"},{date:"2026-02",label:"Omnibus adopted"},{date:"2028-01",label:"Wave 2 (delayed)"},{date:"2029-01",label:"Wave 3"}]),
R("c2","compliance","EU Mandatory Reporting","EU Taxonomy","https://finance.ec.europa.eu/sustainable-finance/tools-and-standards/eu-taxonomy-sustainable-activities_en","Classification of 'green' economic activities. Transport categories defined.","regulation","HIGH","Taxonomy alignment unlocks green financing and client sustainable supply chain claims.",["taxonomy","green finance","EU","classification"],"EU classification system defining which economic activities qualify as environmentally sustainable for investment and disclosure.","If freight operations qualify as taxonomy-aligned, this unlocks green financing and allows clients to count logistics services toward their sustainable supply chain targets.",["6 environmental objectives","Transport-specific technical criteria","Links to CSRD/ESRS reporting","Investor disclosure requirements"],[{date:"2022-01",label:"Climate objectives"},{date:"2024-01",label:"Env objectives"},{date:"2025-01",label:"Transport criteria"}]),
R("c3","compliance","EU Mandatory Reporting","GRI Standards","https://www.globalreporting.org/","Most widely used voluntary ESG framework globally.","standard","HIGH","Baseline for CSRD-aligned reporting — many clients already report using GRI.",["GRI","ESG","voluntary","reporting"],"Global Reporting Initiative standards — the most widely adopted voluntary sustainability reporting framework worldwide.","Many clients already use GRI for sustainability reporting. Understanding GRI indicators helps freight forwarders prepare data in formats clients need.",["Most widely used ESG framework globally","Baseline for CSRD-aligned reporting","Transport-specific disclosure indicators"]),
R("c4","compliance","Emissions Accounting Standards","ISO 14083","https://www.iso.org/standard/78864.html","International standard for transport chain GHG emissions. Effective 2023.","standard","CRITICAL","ISO 14083 is becoming the mandatory calculation methodology referenced by regulation and tenders.",["ISO 14083","calculation","transport","GHG"],"International standard providing methodology for calculating and reporting GHG emissions from transport chain operations.","ISO 14083 is the calculation methodology behind GLEC Framework and increasingly referenced in EU regulation. Freight forwarders must ensure emissions calculations are compliant for client reporting and regulatory requirements.",["Published March 2023, replaces EN 16258","Covers all transport modes","Referenced by EU CountEmissions regulation","GLEC Framework v3 aligned"],[{date:"2023-03",label:"ISO 14083 published"},{date:"2025-01",label:"EU CountEmissions ref"},{date:"2026-01",label:"Widespread adoption"}]),
R("c5","compliance","Emissions Accounting Standards","GLEC Framework v3","https://www.smartfreightcentre.org/en/how-to-implement-glec-framework/","Industry standard for logistics emissions. Used for Scope 3 Cat 4 reporting.","standard","CRITICAL","The practical methodology freight forwarders actually use for shipment-level emissions calculations.",["GLEC","emissions","Scope 3","RFQ"],"Smart Freight Centre's Global Logistics Emissions Council framework — the industry standard calculation methodology for logistics emissions.","GLEC is the tool event logistics specialists actually use to calculate shipment-level emissions. Clients increasingly specify GLEC-compliant reporting in tenders and RFPs. Essential for competitive positioning.",["Version 3.2 (October 2025)","Aligned with ISO 14083","Default emission factors provided","Required in major shipper RFPs"],[{date:"2023-03",label:"v3 launched"},{date:"2025-10",label:"v3.2 update"},{date:"2026-01",label:"RFP standard"}]),
R("c6","compliance","Emissions Accounting Standards","GHG Protocol","https://ghgprotocol.org/","Foundation for all corporate carbon accounting. Scope 1/2/3.","standard","HIGH","Category 4 (upstream transport) makes freight forwarders a Scope 3 source for virtually all clients.",["GHG Protocol","Scope 3","Category 4"],"WRI/WBCSD standard defining Scope 1, 2, and 3 emissions categories — the foundation for all corporate carbon accounting.","GHG Protocol Category 4 (Upstream transportation) is exactly what freight forwarders provide. Every client doing Scope 3 reporting needs logistics partners to supply emissions data in GHG Protocol format.",["Category 4: Upstream transportation","Category 9: Downstream transportation","Under revision (2024-2025)","Foundation for CSRD/ISSB reporting"],[{date:"2004-01",label:"Scope 3 published"},{date:"2024-01",label:"Revision starts"},{date:"2025-01",label:"Draft update"},{date:"2026-01",label:"Final revision"}]),
R("c7","compliance","Emissions Accounting Standards","SBTi","https://sciencebasedtargets.org/","Corporate net-zero target validation. Transport sector guidance.","guidance","HIGH","SBTi targets appear in client tenders — forwarders must understand methodology to respond credibly.",["SBTi","targets","net-zero","tenders"],"Science Based Targets initiative validating corporate emissions reduction targets aligned with climate science.","Client RFPs increasingly require logistics partners to hold or be working toward SBTi-validated targets. Understanding the methodology is essential for credible tender responses.",["Near-term (5-10 year) targets","Long-term (2050) targets","Transport sector pathway defined","Increasingly required in freight tenders"]),
R("c8","compliance","Emissions Accounting Standards","ISSB IFRS S2","https://www.ifrs.org/groups/international-sustainability-standards-board/","Global climate disclosure baseline. 20+ jurisdictions mandating.","standard","HIGH","ISSB adoption globally means converging disclosure demands from clients in all jurisdictions.",["ISSB","IFRS S2","global","climate"],"IFRS Sustainability Standards Board's climate disclosure standard being adopted by 20+ jurisdictions as mandatory reporting baseline.","As jurisdictions worldwide adopt ISSB, freight forwarders face converging data requests from clients globally — not just in the EU. Data systems must be globally interoperable.",["S2: Climate-related disclosures","20+ jurisdictions mandating","Scope 3 including freight required","Singapore adoption FY2026"],[{date:"2024-01",label:"S2 effective"},{date:"2025-01",label:"Early adopters"},{date:"2026-01",label:"Singapore mandatory"},{date:"2027-01",label:"Broad adoption"}]),
R("c9","compliance","Supply Chain Data","CDP Supply Chain","https://www.cdp.net/en/supply-chain","700+ purchasing orgs requesting supplier emissions data. Forwarders scored.","tool","HIGH","CDP is the primary channel through which clients formally request emissions data from logistics suppliers.",["CDP","supply chain","data requests"],"CDP's programme through which purchasing organisations formally request environmental performance data from their suppliers.","Over 700 purchasing organisations use CDP to request data from suppliers. Freight forwarders increasingly receive direct CDP questionnaires or must provide data that clients report through CDP.",["700+ purchasing organisations requesting","26,000+ companies disclosing","Annual questionnaire cycle (Feb-July)","Scoring A to D-"],[{date:"2025-02",label:"Questionnaire opens"},{date:"2025-07",label:"Submission deadline"},{date:"2025-11",label:"Scores published"}]),
R("c10","compliance","Supply Chain Data","EcoVadis","https://ecovadis.com/","Supplier sustainability scorecards. Freight forwarder ratings affect contracts.","tool","HIGH","EcoVadis scores directly gate contract eligibility with major shippers and event companies.",["EcoVadis","ratings","supplier","contracts"],"Sustainability rating platform used by global brands to assess and score supplier ESG performance.","EcoVadis scores directly affect contract eligibility. Major event companies and brands require minimum scores from logistics suppliers. A poor rating can mean losing business.",["Supplier sustainability scorecards","Scores affect contract eligibility","Global brands require minimum ratings","Annual assessment cycle"]),
R("c11","compliance","Supply Chain Data","EcoVadis Blog","https://ecovadis.com/blog/","Methodology changes, regulatory impacts on supply chain ESG.","news","MODERATE","Tracks methodology updates that change how freight forwarders are scored.",["EcoVadis","methodology","trends"],"Updates on supplier sustainability rating trends, methodology changes, and regulatory impacts.","Methodology changes can shift scoring criteria. Staying current helps freight forwarders maintain or improve their rating.",["Rating methodology updates","Regulatory impact analysis","Best practice guidance"]),
// ═══ GLOBAL REGULATORY WATCH (31) ═══
R("g1","global","EU Policy","EU Fit for 55 Package","https://www.consilium.europa.eu/en/policies/green-deal/fit-for-55-the-eu-plan-for-a-green-transition/","Umbrella of 13 laws: ETS, CBAM, ReFuelEU, FuelEU, truck CO2 standards.","package","CRITICAL","Parent package of every major EU climate regulation affecting freight — the single reference point.",["Fit for 55","EU","Green Deal","umbrella"],"EU's umbrella legislative package of 13 interconnected measures targeting 55% GHG reduction by 2030.","This is the parent package containing ETS expansion, CBAM, ReFuelEU Aviation, FuelEU Maritime, and truck CO2 standards. Every major EU regulation affecting freight traces back here.",["13 interconnected legislative measures","55% GHG reduction target by 2030","Parent of ETS, CBAM, FuelEU, ReFuelEU","CO2 truck standards, AFIR included"],[{date:"2021-07",label:"Package proposed"},{date:"2023-01",label:"Laws adopted"},{date:"2025-01",label:"Phase-ins begin"},{date:"2030-01",label:"55% target"}]),
R("g2","global","EU Policy","EU PPWR 2025/40","https://environment.ec.europa.eu/topics/waste-and-recycling/packaging-and-packaging-waste_en","Replaces 1994 Directive. All packaging recyclable by 2030. Single-use restrictions.","regulation","CRITICAL","Affects ALL EU shipment packaging — every carton, pallet wrap, protective material from Aug 2026.",["PPWR","packaging","circular economy","2026"],"EU regulation replacing the 1994 Packaging Directive with directly applicable rules on recyclability, reuse, and material restrictions.","Every piece of packaging on every EU-bound shipment must comply — cartons, pallet wrap, protective materials, exhibition crating. Non-compliant packaging may be rejected at EU borders. Critical for event staging, exhibition freight, and merchandise logistics.",["In force: 11 Feb 2025, applies: 12 Aug 2026","All packaging recyclable by 2030","PFAS restrictions in food-contact packaging","Single-use restrictions","Reuse targets for transport packaging"],[{date:"2025-02",label:"In force"},{date:"2026-08",label:"Applies"},{date:"2030-01",label:"All recyclable"},{date:"2035-01",label:"Reuse targets"}]),
R("g3","global","EU Policy","EEA (European Environment Agency)","https://www.eea.europa.eu/","EU environmental data portal; transport emission trends.","data","HIGH","Official EU environmental data — policy progress tracking for transport sector.",["EEA","data","EU","transport emissions"],"EU agency providing environmental data, transport emission trends, and policy implementation tracking.","Official data source for EU transport emission trends and policy progress — useful for client briefings and benchmarking.",["Transport emission trend data","Policy progress tracking","Indicator-based assessments"]),
R("g4","global","EU Policy","EUR-Lex","https://eur-lex.europa.eu/","Official EU legislation database — primary source for all regulations.","legal","HIGH","Daily EU law publication catches new delegated acts before industry sources.",["EUR-Lex","EU law","legislation","primary"],"Official Journal of the European Union and full legislation database — the authoritative source for all EU law.","Fastest official source for new EU environmental regulations. RSS monitoring catches delegated acts, implementing measures, and amendments as they publish.",["Published daily","RSS feed available","All EU legislation searchable","Free public access"]),
R("g5","global","EU Policy","European Clean Trucking Alliance","https://cleantruckingalliance.org/","EU ZEV truck advocacy; legislative progress tracking.","initiative","MODERATE","Tracks EU legislative progress on heavy-duty vehicle standards.",["ZEV trucks","EU","advocacy"],"Coalition advocating for zero-emission truck standards in the EU; tracks legislative progress.","Useful for monitoring EU truck regulation development and policy signals.",["EU ZEV truck legislative tracking","Industry coalition positions"]),
R("g6","global","EU Policy","UK DfT Decarbonisation","https://www.gov.uk/government/organisations/department-for-transport","UK post-Brexit transport decarbonisation; independent SAF mandate, ZEV targets.","regulator","HIGH","Independent UK regulatory path post-Brexit means separate compliance requirements.",["UK","DfT","post-Brexit","transport"],"UK Department for Transport's decarbonisation policy including independent SAF mandate and ZEV targets post-Brexit.","Post-Brexit UK has its own transport decarbonisation path. Freight forwarders serving UK events face separate compliance requirements from the EU.",["Independent SAF mandate","ZEV targets","Port strategies","Separate from EU regulation"]),
R("g7","global","EU Policy","Germany BMDV","https://www.bmdv.bund.de/EN/Home/home.html","German federal transport; hydrogen corridors, LNG/NH3 shipping.","regulator","MODERATE","Germany leads EU on hydrogen corridors — signals infrastructure investment.",["Germany","BMDV","hydrogen","transport"],"German federal transport ministry leading on hydrogen corridor development and alternative maritime fuel infrastructure.","Germany's hydrogen corridor investments affect infrastructure availability for green freight across Central Europe.",["Hydrogen corridor development","LNG/NH3 shipping infrastructure","TEN-T investment"]),
R("g8","global","US Regulatory","EPA SmartWay","https://www.epa.gov/smartway","US freight carrier certification. Required by major shippers. 3,500+ carriers.","certification","HIGH","Required by many US shippers for carrier qualification — effectively mandatory for US freight contracts.",["SmartWay","EPA","US","certification"],"EPA's voluntary freight carrier environmental certification programme used by major US shippers for carrier selection.","SmartWay certification is effectively mandatory for major US freight contracts. Over 3,500 carriers enrolled. Event logistics operators need certification to serve US shippers requiring it.",["3,500+ carriers enrolled","Required by major US shippers","Scope 3 reporting support","Annual reporting requirement"]),
R("g9","global","US Regulatory","Sustainable Packaging Coalition","https://sustainablepackaging.org/","US packaging sustainability standards; How2Recycle label.","standard","HIGH","US packaging standards for event merchandise and goods — How2Recycle label increasingly required.",["SPC","packaging","How2Recycle","US"],"US-led industry coalition setting packaging sustainability standards including the How2Recycle labelling system.","How2Recycle labels are increasingly required on event merchandise and goods packaging entering the US market.",["How2Recycle label system","US packaging sustainability standards","Material circularity guidelines"]),
R("g10","global","US Regulatory","NREL Transportation","https://www.nrel.gov/transportation/","US DOE lab: ZEV trucks, hydrogen, SAF, freight electrification R&D.","research","HIGH","National lab R&D signals which green freight technologies will become commercially viable.",["NREL","DOE","R&D","ZEV"],"US National Renewable Energy Laboratory's transportation research covering zero-emission trucks, hydrogen, SAF, and freight electrification.","NREL research signals which green freight technologies will reach commercial viability and when — essential for infrastructure planning.",["ZEV truck testing and validation","Hydrogen fuel cell research","SAF technology pathways","Fleet electrification analysis"]),
R("g11","global","US Regulatory","CEC North American Env Policy","https://www.cec.org/","Canada-Mexico-US trilateral environmental cooperation.","framework","MODERATE","Trilateral cooperation affects cross-border freight environmental standards.",["CEC","NAFTA","trilateral","environment"],"Commission for Environmental Cooperation — Canada-Mexico-US trilateral body for environmental policy coordination.","Cross-border environmental standards affect USMCA freight operations.",["Trilateral environmental cooperation","Cross-border freight standards"]),
R("g12","global","US Regulatory","ECLAC (UN Latin America)","https://www.cepal.org/en","UN ECLAC transport logistics data for Latin America.","data","MODERATE","LatAm logistics data for event freight routing through Brazil, Chile, Mexico.",["ECLAC","LatAm","logistics","UN"],"UN Economic Commission for Latin America tracking transport logistics data across the region.","Critical data source for event freight routing through Latin American markets.",["LatAm transport logistics data","Infrastructure analysis","Trade facilitation tracking"]),
R("g13","global","Latin America","Brazil Logística Reversa","https://www.gov.br/mma/pt-br/assuntos/agendaambientalurbana/logistica-reversa","Mandatory take-back for packaging, electronics, event materials.","regulation","HIGH","Brazil reverse logistics law directly affects event freight packaging and equipment entering Brazil.",["Brazil","reverse logistics","packaging","take-back"],"Brazil's reverse logistics law requiring mandatory take-back programmes for packaging, electronics, and specified materials.","Mandatory take-back applies to event staging materials, packaging, and electronics entering Brazil — a key market for live events and touring. Freight forwarders must ensure compliance documentation.",["Mandatory take-back for packaging","Electronics recycling requirements","Event materials included","Compliance documentation required"]),
R("g14","global","Latin America","Mexico SEMARNAT","https://www.gob.mx/semarnat","Mexico environment ministry; packaging, carbon market, transport.","regulator","HIGH","Mexico environmental requirements affect cross-border event freight packaging and customs.",["Mexico","SEMARNAT","environment","packaging"],"Mexico's environmental ministry overseeing packaging regulations, carbon market development, and transport emissions rules.","Mexican environmental requirements affect packaging and customs compliance for cross-border event freight.",["Packaging regulations","Carbon market development","Transport emissions rules"]),
R("g15","global","Latin America","Colombian Ministry of Transport","https://www.mintransporte.gov.co/","Colombia transport policy for Andean event freight.","regulator","MODERATE","Relevant for Andean event freight routing and last-mile compliance.",["Colombia","transport","Andean"],"Colombian ministry overseeing transport policy including sustainability requirements.","Relevant for event freight routing through Colombia and the Andean region.",["Transport sustainability policy","Last-mile compliance requirements"]),
R("g16","global","Latin America","IDB Sustainable LatAm Transport","https://www.iadb.org/en/sectors/transport/overview","IDB green freight corridor funding in Latin America.","finance","MODERATE","Development bank financing for green freight corridors in LatAm event markets.",["IDB","LatAm","green corridors","financing"],"Inter-American Development Bank sustainable transport financing including green freight corridor development.","IDB-financed green corridors in LatAm can improve infrastructure for event freight operations.",["Green freight corridor funding","Infrastructure development","Sustainable transport financing"]),
R("g17","global","Asia-Pacific","MPA Singapore Green Shipping","https://www.mpa.gov.sg/maritime-singapore/sustainability","Singapore green fuel bunkering, port incentives. World's largest bunkering hub.","regulator","CRITICAL","World's largest bunkering hub — green shipping programme sets standards for Asia-Pacific routing.",["Singapore","MPA","green shipping","bunkering"],"Singapore Maritime and Port Authority's Green Shipping Programme offering incentives for clean fuel bunkering at the world's largest bunkering hub.","Singapore is the primary Asia-Pacific routing hub for ocean freight. MPA's green shipping incentives and bunkering availability directly affect vessel selection and routing decisions for event cargo to/from Asia.",["World's largest bunkering hub","Green fuel availability (LNG, methanol)","Port incentive programmes","Green corridor anchor point"],[{date:"2024-01",label:"Green incentives"},{date:"2026-01",label:"LNG bunkering"},{date:"2030-01",label:"Green hub target"}]),
R("g18","global","Asia-Pacific","Japan MLIT","https://www.mlit.go.jp/en/","Japan transport: shipping decarbonisation, hydrogen port strategy.","regulator","HIGH","Japan's hydrogen port strategy affects event logistics for Tokyo/Osaka destinations.",["Japan","MLIT","hydrogen","shipping"],"Japan Ministry of Land, Infrastructure, Transport and Tourism — shipping decarbonisation and hydrogen port strategy.","Japan's hydrogen port investments and shipping decarbonisation policies affect event logistics for major touring destinations.",["Hydrogen port strategy","Shipping decarbonisation policy","Green freight programmes"]),
R("g19","global","Asia-Pacific","South Korea MOF","https://www.mof.go.kr/eng/index.do","K-ETS includes shipping; ammonia/hydrogen vessel development.","regulator","HIGH","K-ETS carbon costs affect freight operations for Korean touring destinations.",["Korea","K-ETS","ammonia","shipping"],"South Korea Ministry of Oceans and Fisheries — K-ETS shipping inclusion and zero-emission vessel development.","South Korea's carbon market includes shipping, and their vessel development programme signals future fuel availability.",["K-ETS includes shipping","Ammonia vessel programme","Hydrogen development","Green port investments"]),
R("g20","global","Asia-Pacific","Singapore Green Plan 2030","https://www.greenplan.gov.sg/","Singapore whole-of-government sustainability: maritime, aviation, packaging.","framework","HIGH","Comprehensive sustainability roadmap covering all transport modes through Singapore hub.",["Singapore","Green Plan","sustainability","2030"],"Singapore's comprehensive government sustainability roadmap covering maritime, aviation, packaging, and green buildings.","Covers sustainability requirements across all transport modes used by freight forwarders routing through Singapore.",["Maritime sustainability targets","Aviation decarbonisation","Sustainable packaging rules","Green building standards for event venues"],[{date:"2021-02",label:"Plan launched"},{date:"2025-01",label:"Mid-term review"},{date:"2030-01",label:"2030 targets"}]),
R("g21","global","Asia-Pacific","ADB Sustainable Transport","https://www.adb.org/sectors/transport/overview","ADB green transport financing across Southeast Asia.","finance","MODERATE","Development bank financing affects infrastructure quality for event freight in SE Asia.",["ADB","Southeast Asia","transport","financing"],"Asian Development Bank financing green transport infrastructure across Southeast Asia.","ADB-financed transport infrastructure improves freight capacity and sustainability in SE Asian event markets.",["Green transport financing","SE Asian infrastructure","Sustainable logistics investment"]),
R("g22","global","Asia-Pacific","China CCICED","https://www.cciced.net/","Tracks China's carbon policy trajectory.","advisory","MODERATE","China's carbon policy evolution affects global shipping and manufacturing supply chains.",["China","carbon","policy","CCICED"],"China Council for International Cooperation on Environment and Development — advisory body tracking China's environmental policy.","China's carbon policy trajectory affects global shipping patterns and manufacturing supply chains relevant to event equipment sourcing.",["China carbon market development","Environmental policy trajectory","Trade policy implications"]),
R("g23","global","Asia-Pacific","Australia Climate Change Authority","https://www.climatechangeauthority.gov.au/","Australian climate policy; Pacific event routing.","regulator","MODERATE","Relevant for Pacific event routing and Australia/NZ freight compliance.",["Australia","climate","Pacific"],"Australian government advisory body on climate change policy.","Relevant for freight compliance when routing through Australia and the Pacific for events.",["Australian climate targets","Transport emissions policy"]),
R("g24","global","Asia-Pacific","ASEAN Transport Strategic Plan","https://asean.org/our-communities/asean-economic-community/transport/","ASEAN sustainable transport across 10 member states.","framework","MODERATE","Framework for sustainable transport across SE Asian event markets.",["ASEAN","transport","Southeast Asia"],"ASEAN sustainable transport framework covering 10 member states.","Provides context for transport sustainability requirements across SE Asian markets used for event logistics.",["10 member states","Sustainable transport framework","Cross-border coordination"]),
R("g25","global","Asia-Pacific","DP World Sustainability","https://www.dpworld.com/sustainability/","Major port/logistics operator sustainability standards.","industry","MODERATE","Major port operator sustainability requirements affect carrier and forwarder operations.",["DP World","ports","sustainability"],"Global port and logistics operator setting sustainability standards across its network.","DP World's sustainability requirements at its ports affect operational standards for freight forwarders using their facilities.",["Port sustainability standards","Carbon reduction targets","Clean energy at terminals"]),
R("g26","global","Asia-Pacific","IRENA Abu Dhabi","https://www.irena.org/","Renewable energy in transport; Middle East event freight hubs.","research","MODERATE","Renewable energy transition data relevant for Middle East freight hub operations.",["IRENA","renewable","transport","Middle East"],"International Renewable Energy Agency tracking renewable energy adoption in transport.","IRENA data on renewable energy in transport is relevant for Middle East hub operations and green fuel availability.",["Renewable energy in transport","Maritime fuel transition data","Middle East hub energy"]),
R("g27","global","Packaging & Waste","UN SDGs 9 & 13","https://sdgs.un.org/goals","Framework underpinning all national sustainability legislation.","framework","MODERATE","SDGs provide the global context that drives all national sustainability regulation.",["SDGs","UN","sustainability","global"],"UN Sustainable Development Goals 9 (Industry/Infrastructure) and 13 (Climate Action) underpinning national legislation.","SDGs provide the overarching framework that national governments reference when creating sustainability regulations affecting freight.",["Goal 9: Industry, Innovation, Infrastructure","Goal 13: Climate Action","Referenced in national legislation worldwide"]),
R("g28","global","Packaging & Waste","IPCC Climate Reports","https://www.ipcc.ch/","Scientific basis for all climate policy worldwide.","science","HIGH","IPCC assessments are the scientific foundation for every climate regulation affecting freight.",["IPCC","science","climate","authoritative"],"Intergovernmental Panel on Climate Change providing the authoritative scientific basis for climate policy globally.","IPCC assessment reports determine the ambition level of all climate regulations worldwide. When regulators tighten targets, they cite IPCC science.",["AR6 synthesis: 1.5°C requires 43% reduction by 2030","Transport sector pathways defined","Scientific basis for all regulation","Next assessment cycle ongoing"]),
R("g29","global","Packaging & Waste","IEA Policies & Measures","https://www.iea.org/policies/about","Energy/transport policy implementation across 150+ countries.","tracker","HIGH","Tracks policy implementation across 150+ countries — essential for multi-jurisdiction compliance.",["IEA","policies","energy","150+ countries"],"International Energy Agency tracking energy and transport policy implementation across 150+ countries.","When freight forwarders operate across multiple jurisdictions, IEA's database shows what environmental compliance requirements exist in each.",["150+ countries tracked","Transport policy database","Implementation status","Energy transition monitoring"]),
R("g30","global","Packaging & Waste","World Bank Transport","https://www.worldbank.org/en/topic/transport","Development financing for transport infrastructure globally.","finance","MODERATE","Infrastructure investment in emerging markets affects freight capacity for event logistics.",["World Bank","transport","infrastructure"],"World Bank transport division financing infrastructure development globally.","Development financing affects freight capacity and infrastructure quality in emerging markets used for events.",["Transport infrastructure financing","Emerging market development","Sustainability criteria"]),
R("g31","global","Packaging & Waste","ITF International Transport Forum","https://www.itf-oecd.org/","OECD transport think-tank; freight decarbonisation outlook.","analysis","HIGH","Annual outlook on freight decarbonisation, modal shift data, and volume projections.",["ITF","OECD","outlook","modal shift"],"OECD International Transport Forum providing annual outlook on freight decarbonisation, modal economics, and volume projections.","ITF's annual Transport Outlook and freight decarbonisation reports provide essential context for long-range business planning in event logistics.",["Annual Transport Outlook","Modal shift economics","Freight volume projections","Decarbonisation scenario modelling"]),
// ═══ RESEARCH & INNOVATION (33) ═══
R("r1","research","Academic Institutions","MIT Center for Transportation & Logistics","https://ctl.mit.edu/","Supply chain decarbonisation, freight futures, zero-emission logistics.","academic","HIGH","Leading academic source for freight decarbonisation technology readiness.",["MIT","supply chain","decarbonisation"],"MIT's centre for transportation and logistics research covering supply chain sustainability and zero-emission freight futures.","MIT research provides technology readiness assessments that determine when zero-emission logistics options become commercially viable.",["Supply chain decarbonisation research","Zero-emission logistics modelling","Technology readiness assessments"]),
R("r2","research","Academic Institutions","Kuehne Climate Center","https://kuehneclimatecenter.org/","Applied maritime/logistics climate research and decarbonisation pathways.","academic","HIGH","Applied logistics decarbonisation research directly applicable to freight operations.",["Kuehne","maritime","logistics","climate"],"Applied climate research centre focused on maritime and logistics decarbonisation pathways.","Directly applicable research on logistics decarbonisation pathways including green fuel economics and fleet transition scenarios.",["Maritime decarbonisation pathways","Logistics climate research","Green fuel economics"]),
R("r3","research","Academic Institutions","Fraunhofer IML","https://www.iml.fraunhofer.de/en.html","Logistics automation, green warehouse, EV freight, digital twins.","academic","HIGH","German applied research on logistics technology directly relevant to operational efficiency.",["Fraunhofer","logistics","automation","EV"],"Germany's leading applied research institute for logistics covering automation, green warehousing, and electric freight.","Fraunhofer research signals which logistics technologies will become standard — useful for infrastructure planning and client advisory.",["Green warehouse technology","EV freight testing","Digital twin applications","Logistics automation research"]),
R("r4","research","Academic Institutions","World Resources Institute","https://www.wri.org/","Transport decarbonisation, freight emissions, EV transition research.","research","HIGH","WRI research underpins GHG Protocol and major policy frameworks affecting freight.",["WRI","transport","emissions","EV"],"World Resources Institute conducting research on transport decarbonisation, freight emissions, and clean energy transition.","WRI is the co-convener of GHG Protocol. Their transport research directly shapes the emissions accounting standards freight forwarders must use.",["Co-convener of GHG Protocol","Transport decarbonisation pathways","City logistics research","EV transition analysis"]),
R("r5","research","Academic Institutions","Stockholm Environment Institute","https://www.sei.org/","Carbon markets, transport equity, freight fuel lifecycle analysis.","academic","MODERATE","Policy research on carbon markets and lifecycle analysis of freight fuels.",["SEI","carbon markets","lifecycle","equity"],"Research institute covering carbon markets, transport equity, and lifecycle analysis of freight fuels.","SEI's lifecycle analysis of alternative fuels helps evaluate true environmental impact of green logistics options.",["Carbon market analysis","Fuel lifecycle assessment","Transport equity research"]),
R("r6","research","Academic Institutions","TNO Mobility & Logistics","https://www.tno.nl/en/","Zero-emission trucks, smart freight, hydrogen logistics.","research","MODERATE","Dutch applied research on ZEV trucks and hydrogen logistics technology.",["TNO","ZEV trucks","hydrogen","smart freight"],"Netherlands applied research on zero-emission trucks, smart freight systems, and hydrogen logistics.","TNO testing data on ZEV trucks provides independent performance assessments relevant for fleet transition planning.",["Zero-emission truck testing","Hydrogen logistics research","Smart freight systems"]),
R("r7","research","Academic Institutions","Erasmus Smart Port","https://www.eur.nl/en/ese/research/smart-port","Port digitalisation and sustainability; smart cargo handling.","academic","MODERATE","Port digitalisation research relevant to efficient cargo handling at green ports.",["Erasmus","smart port","digitalisation"],"Erasmus University research on port digitalisation and sustainability.","Smart port research signals operational improvements that can reduce both costs and emissions at major cargo ports.",["Port digitalisation research","Sustainable cargo handling","Digital twin port operations"]),
R("r8","research","Academic Institutions","Cranfield Sustainable Logistics","https://www.cranfield.ac.uk/","UK hub for sustainable supply chains, aviation SAF, last-mile ZEV.","academic","MODERATE","UK logistics research directly applicable to sustainable event freight operations.",["Cranfield","logistics","SAF","last-mile"],"UK's leading logistics research hub covering sustainable supply chains and zero-emission last-mile delivery.","Cranfield research on last-mile zero-emission delivery is directly relevant for event venue logistics.",["Sustainable supply chain research","Aviation SAF research","Last-mile zero-emission"]),
R("r9","research","Academic Institutions","Transportation Research Part E","https://www.sciencedirect.com/journal/transportation-research-part-e-logistics-and-transportation-review","Peer-reviewed logistics and supply chain sustainability journal.","journal","MODERATE","Leading peer-reviewed journal for logistics sustainability research.",["journal","logistics","peer-reviewed"],"Peer-reviewed academic journal covering logistics, transportation review, and supply chain sustainability.","Research here informs methodology updates that affect emissions calculation standards.",["Peer-reviewed logistics research","Supply chain sustainability","Methodology development"]),
R("r10","research","Academic Institutions","Journal of Sustainable Transport","https://www.scdtl.com/","Academic journal on sustainable freight and transport systems.","journal","MODERATE","Focused academic coverage of sustainable freight transport systems.",["journal","sustainable transport","academic"],"Academic journal focused specifically on sustainable freight and transport systems.","Emerging research on sustainable freight systems informing future industry standards.",["Sustainable freight research","Transport system analysis"]),
R("r11","research","Think-Tanks & Policy Analysis","The Loadstar: Green Tech","https://theloadstar.com/section/green-tech/","Freight industry news on sustainable tech and policy.","news","HIGH","Essential freight industry news source for sustainability developments.",["Loadstar","freight news","green tech"],"Leading freight industry publication covering sustainable technology, policy analysis, and carrier decarbonisation developments.","Real-time intelligence on carrier sustainability investments, SAF deals, and regulatory developments directly affecting freight operations.",["Carrier decarbonisation moves","SAF deal tracking","Policy analysis","Technology adoption reporting"]),
R("r12","research","Think-Tanks & Policy Analysis","FreightWaves Sustainability","https://www.freightwaves.com/news/category/sustainability","Real-time freight data and sustainability reporting.","news","HIGH","Real-time freight market data including SAF pricing and EV adoption rates.",["FreightWaves","data","sustainability","SAF prices"],"Real-time freight market data platform with dedicated sustainability coverage including SAF pricing and EV adoption tracking.","Market data on green freight pricing helps build forward-looking cost models for sustainable logistics offerings.",["Real-time freight data","SAF price tracking","EV adoption rates","Sustainability market intelligence"]),
R("r13","research","Think-Tanks & Policy Analysis","GreenBiz Supply Chain","https://www.greenbiz.com/topic/supply-chain","Corporate supply chain decarbonisation case studies.","analysis","HIGH","Corporate sustainability practice including Scope 3 solutions relevant to freight.",["GreenBiz","supply chain","Scope 3","case studies"],"Corporate sustainability publication covering supply chain decarbonisation case studies and Scope 3 solutions.","Case studies of how major brands are decarbonising their supply chains — directly relevant for understanding client expectations.",["Supply chain decarbonisation cases","Scope 3 solution reporting","Corporate sustainability trends"]),
R("r14","research","Think-Tanks & Policy Analysis","Reuters Sustainable Business","https://www.reuters.com/sustainability/","Breaking news on climate policy, carbon markets, shipping regulation.","news","HIGH","Breaking news on climate regulation that affects freight markets.",["Reuters","climate","carbon markets","breaking news"],"Reuters' sustainability desk covering breaking news on climate policy, carbon markets, and transport regulation.","First to report major regulatory changes affecting freight markets — essential for time-sensitive intelligence.",["Breaking regulatory news","Carbon market reporting","Shipping regulation coverage"]),
R("r15","research","Think-Tanks & Policy Analysis","Environmental Finance","https://www.environmental-finance.com/","Carbon markets, green bonds, sustainable finance.","analysis","HIGH","Carbon market and green bond intelligence relevant to freight decarbonisation financing.",["carbon markets","green bonds","finance"],"Specialist publication on carbon markets, green bonds, and sustainable finance mechanisms.","Carbon market price intelligence and green financing developments directly affect freight decarbonisation economics.",["Carbon market price analysis","Green bond issuance tracking","Sustainable finance regulation"]),
R("r16","research","Think-Tanks & Policy Analysis","Carbon Trust","https://www.carbontrust.com/news-and-events","Carbon measurement, freight sector decarbonisation advisory.","advisory","MODERATE","Advisory updates on carbon measurement methodologies affecting freight.",["Carbon Trust","measurement","advisory"],"Carbon Trust updates on carbon measurement methodologies and freight sector decarbonisation programmes.","Methodology updates can change how freight emissions are calculated and reported.",["Carbon measurement updates","Freight decarbonisation programmes","Methodology changes"]),
R("r17","research","Think-Tanks & Policy Analysis","Project Drawdown","https://drawdown.org/solutions","Ranked climate solutions: shipping, aviation, land transport with quantified impact.","research","HIGH","Quantified impact data for climate solutions across all freight transport modes.",["Drawdown","solutions","quantified","impact"],"Compendium of ranked climate solutions with quantified emission reduction potential across sectors including transport.","Drawdown's quantified impact data helps prioritise which decarbonisation actions deliver the most benefit for freight operations.",["Shipping solutions ranked","Aviation decarbonisation options","Land transport alternatives","Quantified CO2 reduction potential"]),
R("r18","research","Think-Tanks & Policy Analysis","Splash247 Green","https://splash247.com/category/green/","Maritime green tech news; alternative fuels, vessel technology.","news","MODERATE","Maritime-specific green technology and alternative fuel news.",["Splash247","maritime","green tech","fuels"],"Maritime industry publication covering green technology, alternative fuels, and vessel sustainability developments.","Maritime-specific intelligence on alternative fuel trials and green vessel technology.",["Alternative fuel trials","Green vessel technology","Port sustainability news"]),
R("r19","research","Think-Tanks & Policy Analysis","Supply Chain Digital","https://supplychaindigital.com/","Digital transformation and sustainability in supply chains.","news","MODERATE","Supply chain technology and sustainability convergence reporting.",["digital","supply chain","technology"],"Publication covering digital transformation and sustainability convergence in supply chains.","Technology adoption trends affecting sustainable supply chain management.",["Digital transformation trends","Sustainability technology","Supply chain innovation"]),
R("r20","research","Think-Tanks & Policy Analysis","JOC (Journal of Commerce)","https://www.joc.com/","Container shipping, logistics news, trade lane analysis.","news","MODERATE","Industry standard for container shipping news and trade lane analysis.",["JOC","container","shipping","trade lanes"],"Leading container shipping and logistics publication covering trade lane analysis and carrier sustainability initiatives.","Standard industry reference for container shipping markets, carrier sustainability moves, and trade lane dynamics.",["Container shipping markets","Trade lane analysis","Carrier sustainability initiatives"]),
R("r21","research","Think-Tanks & Policy Analysis","Sustainability Magazine","https://sustainabilitymag.com/","Cross-sector sustainability including logistics and events.","news","MODERATE","Cross-sector sustainability coverage relevant to event logistics.",["sustainability","events","cross-sector"],"Cross-sector sustainability publication covering logistics, packaging, and events industry.","Coverage of sustainability trends across sectors relevant to event freight operations.",["Logistics sustainability","Packaging innovation","Events industry coverage"]),
R("r22","research","Think-Tanks & Policy Analysis","EcoEnclose Blog","https://www.ecoenclose.com/blog/","Sustainable packaging innovations for goods and merchandise.","blog","LOW","Practical sustainable packaging innovations for event merchandise and high-value goods.",["packaging","sustainable","merchandise","innovation"],"Blog covering sustainable packaging innovations relevant for merchandise and high-value product packaging.","Practical packaging innovation insights relevant for event merchandise, branded goods, and high-value product protection.",["Sustainable packaging innovations","Eco-friendly materials","Merchandise packaging solutions"]),
R("r23","research","Innovation Trackers","Mission Innovation Clean Shipping","https://mission-innovation.net/our-work/innovation-challenges/clean-shipping/","23-country R&D initiative for zero-emission shipping fuels.","initiative","HIGH","Government-backed R&D accelerating zero-emission shipping fuels and vessels.",["Mission Innovation","R&D","23 countries","clean shipping"],"Multi-government R&D initiative with 23 countries collaborating to develop zero-emission shipping fuels and vessel technologies.","Government-backed research signals which technologies will receive policy support and public investment.",["23-country R&D collaboration","Zero-emission fuel development","Vessel technology innovation"]),
R("r24","research","Innovation Trackers","ZEMBA Maritime Buyers Alliance","https://www.zerocarbonshipping.com/zemba/","Zero-emission buyer coalition driving demand for green shipping.","initiative","HIGH","Buyer coalition creating demand pull for green shipping — affects carrier offerings.",["ZEMBA","zero-emission","buyers","demand"],"Zero-emission maritime buyer coalition driving demand signals for green shipping services.","ZEMBA member commitments create demand pull that accelerates carrier investment in green vessels — affecting which shipping options become available.",["Buyer coalition for green shipping","Demand signal aggregation","Carrier investment catalyst"]),
R("r25","research","Innovation Trackers","First Movers Coalition","https://www.weforum.org/first-movers-coalition/","WEF: corporate commitments to near-zero emission shipping, aviation, trucking.","initiative","HIGH","Major corporate purchasers committing to near-zero emission freight — signals future client requirements.",["WEF","First Movers","corporate","commitments"],"WEF initiative where major corporations commit to purchasing near-zero emission shipping, aviation, and trucking services.","First Movers Coalition members are likely clients for event logistics. Their commitments signal what sustainability requirements will appear in future freight tenders.",["Corporate purchase commitments","Near-zero shipping, aviation, trucking","Demand signal for green logistics","WEF-backed initiative"]),
R("r26","research","Innovation Trackers","E-Fuel Alliance","https://www.efuel-alliance.eu/","European e-fuels industry: e-methanol, e-ammonia, e-kerosene.","industry","MODERATE","E-fuel technology tracking for maritime and aviation applications.",["e-fuels","e-methanol","e-kerosene","EU"],"European e-fuels industry alliance tracking synthetic fuel development for maritime and aviation applications.","E-fuel availability timelines determine when carriers can offer genuinely zero-carbon shipping and aviation fuel options.",["E-methanol development","E-ammonia status","E-kerosene for aviation","Cost trajectory tracking"]),
R("r27","research","Innovation Trackers","Yara Clean Ammonia","https://www.yara.com/chemical-and-fertilizer-sourcing/yara-clean-ammonia/","Green ammonia for vessel bunkering trials and supply chain.","innovation","MODERATE","Leading green ammonia producer — bunkering trials signal fuel availability.",["Yara","ammonia","bunkering","green"],"Leading green ammonia producer conducting vessel bunkering trials and developing maritime fuel supply chains.","Yara's ammonia bunkering trials signal when this fuel will be commercially available for ocean shipping.",["Green ammonia production","Vessel bunkering trials","Supply chain development"]),
R("r28","research","Innovation Trackers","H2 Accelerate","https://h2accelerate.eu/","Hydrogen truck deployment across Europe; OEM+energy consortium.","initiative","MODERATE","Hydrogen truck technology consortium signals deployment timelines.",["H2","hydrogen trucks","Europe","OEM"],"European consortium of truck OEMs and energy companies deploying hydrogen trucks across the continent.","H2 Accelerate trials signal when hydrogen trucks will be commercially available for road freight operations.",["OEM and energy company consortium","European hydrogen truck trials","Infrastructure development","Deployment timeline signals"]),
R("r29","research","Innovation Trackers","NREL Transportation R&D","https://www.nrel.gov/transportation/","US DOE lab: ZEV technology, hydrogen, SAF research.","research","HIGH","National lab R&D on zero-emission freight technology.",["NREL","DOE","technology","R&D"],"US National Renewable Energy Laboratory's transportation research division.","NREL research provides independent technology validation for ZEV freight solutions.",["ZEV technology validation","Hydrogen fuel cell research","SAF pathways","Independent testing"]),
R("r30","research","Green Corridors & Ports","Getting to Zero: Green Corridors","https://www.getzerocoalition.org/green-shipping-corridors","Directory of 62+ established green shipping corridors globally.","tracker","HIGH","Comprehensive directory of active green shipping corridors — directly affects lane options.",["green corridors","directory","62+","global"],"Global directory of 62+ established green shipping corridors across major trade routes.","Green corridor directory shows which trade routes have zero-emission vessel options or are developing them — directly affects routing decisions for event logistics.",["62+ corridors established","Major trade routes covered","Zero-emission vessel availability","Bunkering infrastructure status"]),
R("r31","research","Green Corridors & Ports","Port of Los Angeles Green","https://www.portoflosangeles.org/environment","World's busiest port for event equipment; Clean Air Action Plan.","regulator","HIGH","Primary US gateway for event equipment — zero-emission cargo handling targets directly affect operations.",["LA port","Clean Air","zero-emission","drayage"],"Port of Los Angeles environmental programmes including Clean Air Action Plan and zero-emission cargo handling targets.","As the busiest US port for event equipment imports, LA's Clean Air Action Plan and zero-emission targets directly affect drayage and cargo handling operations.",["Clean Air Action Plan","Zero-emission cargo handling targets","Truck clean-up requirements","Alternative fuel infrastructure"]),
R("r32","research","Green Corridors & Ports","ESPO Green Ports","https://www.espo.be/","European port sustainability index and best practices.","industry","MODERATE","European port sustainability standards — cross-referenced from Ocean Shipping.",["ESPO","ports","sustainability","EU"],"European Sea Ports Organisation sustainability index and best practice guidelines.","European port sustainability requirements affect operations at all major EU cargo ports.",["Port sustainability index","Shore power deployment","Environmental best practices"]),
R("r33","research","Green Corridors & Ports","Lloyd's Register Fleet Analytics","https://www.lr.org/en/sustainability/decarbonisation/","Technical fleet transition pathways — cross-referenced from Ocean.","guidance","HIGH","Fleet transition data helping evaluate carrier decarbonisation readiness.",["Lloyd's Register","fleet","pathways","data"],"Lloyd's Register fleet analytics providing technical pathway data for fleet operators transitioning fuels.","Classification society data on fleet transition pathways helps assess carrier readiness when selecting shipping partners.",["Fleet transition pathway data","Fuel technology assessment","Carrier readiness scoring"]),
// ═══ AUDIT ADDITIONS ═══
R("o13","ocean","IMO Regulations","IMO Net-Zero Framework","https://www.imo.org/en/mediacentre/pressbriefings/pages/imo-approves-netzero-regulations.aspx","Global fuel standard + GHG pricing for ships >5,000 GT. Approved MEPC 83 (63-16-24). Adoption Oct 2025, entry into force Mar 2027, enforcement 2028. US opposes.","regulation","CRITICAL","The single most consequential maritime regulation since MARPOL. Mandatory fuel standard + carbon pricing on every ocean shipment. US actively opposing — creates enforcement fragmentation risk.",["IMO","NZF","carbon pricing","fuel standard","MEPC 83","2027","2028"],"First binding framework combining mandatory GHG fuel intensity limits and a global carbon pricing mechanism for international shipping. Approved by majority vote at MEPC 83 in April 2025.","Every ocean shipment for live events, artwork, luxury goods, film sets, and automotive will face fuel standard compliance costs passed through by carriers. The pricing mechanism creates a new cost layer separate from ETS. US opposition means carriers on US-origin routes may face different enforcement, creating pricing divergence clients must understand.",["Approved MEPC 83: 63 yes, 16 no, 24 abstained","US walked out, formally opposes as 'global carbon tax'","Entry into force: March 2027","Enforcement with penalties: 2028","Ships >5,000 GT (85% of global emissions)","IMO Net-Zero Fund for revenue disbursement","Well-to-wake lifecycle assessment basis"],[{date:"2025-04",label:"MEPC 83 approved"},{date:"2025-10",label:"MEPC ES.2 adoption"},{date:"2027-03",label:"Entry into force"},{date:"2028-01",label:"Enforcement begins"}]),
R("g32","global","EU Policy","EU ICS2 (Import Control System 2)","https://taxation-customs.ec.europa.eu/online-services/online-services-and-databases-customs/import-control-system-2-ics2_en","Mandatory advance cargo data (ENS) for all EU-bound shipments. Operational now. All carriers and forwarders must submit Electronic Entry Summary before goods arrive.","regulation","CRITICAL","Operational NOW. Every EU-bound shipment requires advance ENS submission. Directly changes your daily customs workflow for every client.",["ICS2","customs","ENS","advance data","EU","operational"],"EU Import Control System requiring all carriers and freight forwarders to submit detailed Electronic Entry Summary Declarations before goods arrive at EU borders.","Every shipment to EU — event staging, artwork, luxury goods, film equipment, automotive, humanitarian — requires compliant ENS data BEFORE arrival. Errors detected upstream cause delays. Freight forwarders are now information managers, not just transport organisers. Data quality is operationally critical.",["Mandatory ENS for ALL EU-bound cargo","Pre-arrival data submission required","Errors detected upstream → delays","All carriers and forwarders must comply","Links to CBAM registration number from Jan 2026"],[{date:"2024-03",label:"Air cargo phase"},{date:"2025-01",label:"Maritime/road phase"},{date:"2026-01",label:"CBAM integration"}]),
R("g33","global","EU Policy","EUDR (EU Deforestation Regulation)","https://environment.ec.europa.eu/topics/forests/deforestation/regulation-deforestation-free-products_en","Due diligence on 7 commodities (timber, rubber, cocoa, coffee, palm oil, soy, cattle). Large operators from Dec 2026. Geolocation traceability required.","regulation","HIGH","Affects any client shipping timber, rubber, leather, or palm-oil-derived packaging into/within EU. Freight forwarders verify documentation compliance.",["EUDR","deforestation","timber","rubber","traceability","2026"],"EU regulation requiring companies to prove products entering the EU market are not linked to deforestation. Covers timber, rubber, cocoa, coffee, palm oil, soy, and cattle derivatives.","Directly affects freight forwarders handling: timber crating for artwork/automotive, rubber components, leather goods (luxury, automotive interiors), palm-oil-derived packaging materials, and wooden pallets/staging for events and film sets. Forwarders must verify Due Diligence Statements accompany shipments. Penalties up to 4% of EU-wide turnover.",["Large operators: Dec 30, 2026","SMEs: Jun 30, 2027","7 commodities + derivatives","Geolocation of production sites required","Fines up to 4% EU turnover","Simplification review by Apr 2026"],[{date:"2023-06",label:"In force"},{date:"2026-04",label:"Simplification review"},{date:"2026-12",label:"Large operators apply"},{date:"2027-06",label:"SME apply"}]),
R("g34","global","EU Policy","CountEmissions EU","https://transport.ec.europa.eu/transport-modes/countingeurope_en","EU harmonised methodology for measuring transport GHG emissions. Built on ISO 14083. Will make emissions accounting legally referenced across EU.","regulation","HIGH","The regulation that makes ISO 14083/GLEC legally binding in the EU. Every freight quote will eventually need emissions calculation using this methodology.",["CountEmissions","ISO 14083","GLEC","emissions accounting","EU"],"Proposed EU regulation establishing a harmonised methodology for GHG accounting of transport services, built on ISO 14083.","This regulation transforms emissions accounting from voluntary to legally referenced across all EU transport. Every freight quotation for live events, film logistics, artwork, luxury goods, and automotive will need compliant emissions figures. Freight forwarders offering GLEC/ISO 14083 calculations now have a competitive advantage.",["Built on ISO 14083","Well-to-wheel approach","Council position: Dec 2023","SME exemption from verification","Applies 42 months after entry into force"],[{date:"2023-07",label:"Proposed"},{date:"2023-12",label:"Council position"},{date:"2026-01",label:"Parliament vote expected"},{date:"2029-01",label:"~Application date"}]),
R("r34","research","Think-Tanks & Policy Analysis","FIATA","https://fiata.org/","Global federation of freight forwarders. CBAM compliance resources, CO₂ calculators, regulatory alerts for the forwarding industry.","industry","HIGH","Your industry's peak body. FIATA provides CBAM compliance tools, CO₂ calculators, and regulatory interpretation specifically for freight forwarders.",["FIATA","freight forwarding","industry body","CBAM","CO2 calculator"],"International Federation of Freight Forwarders Associations — the global peak body representing the freight forwarding and logistics industry.","FIATA provides compliance resources built specifically for freight forwarders, not general industry. Their CBAM guidance, CO₂ calculator repository, and regulatory alerts are tailored to forwarding operations across live events, high-value, and general cargo.",["Global freight forwarding federation","CBAM compliance resources","CO₂ calculator repository","Regulatory alerts for forwarders"]),
R("r35","research","Think-Tanks & Policy Analysis","ICCT","https://theicct.org/","Independent research on vehicle, marine, and aviation emissions. Most-cited source in EU regulatory impact assessments.","research","HIGH","The most-cited independent research organisation in freight emissions policy. Referenced by virtually every EU regulatory impact assessment.",["ICCT","independent","emissions","research","policy"],"International Council on Clean Transportation providing independent research and analysis on vehicle, marine, and aviation emissions to regulators worldwide.","ICCT research underpins the data behind EU truck standards, maritime regulations, and aviation rules. Their projections inform the timeline expectations for every transport regulation in this dashboard.",["Independent nonprofit research","Referenced in EU, US, China policy","Vehicle, marine, aviation coverage","Regulatory impact assessments"]),
R("r36","research","Think-Tanks & Policy Analysis","Maritime Carbon Intelligence","https://maritimecarbonintelligence.com/","Weekly briefing on maritime carbon economy: IMO, EU ETS, FuelEU, green fuels, carbon pricing.","news","HIGH","Specialized weekly briefing focused specifically on maritime carbon economy. Highest signal-to-noise for ocean shipping ESG.",["maritime","carbon economy","weekly","IMO","ETS"],"Specialized weekly intelligence briefing covering the maritime carbon economy including IMO regulations, EU ETS shipping, FuelEU Maritime, and green fuel markets.","Purpose-built for tracking the financial and regulatory dimensions of maritime decarbonisation. Directly relevant for pricing ocean freight surcharges on event equipment, artwork, automotive, and humanitarian cargo.",["Weekly Thursday briefing","IMO/EU ETS/FuelEU focus","Carbon pricing analysis","Green fuel market intelligence"]),
];

// Audit additions + modifications: tag with build date for "Last 30 Days" tracking

// ── Schema Remap: id → {modes, topic, jur} ──
const REMAP={
o1:{m:["ocean"],t:"emissions",j:"global"},o2:{m:["ocean"],t:"fuels",j:"eu"},o3:{m:["ocean"],t:"emissions",j:"eu"},o4:{m:["ocean"],t:"transport",j:"global"},o5:{m:["ocean"],t:"emissions",j:"global"},o6:{m:["ocean"],t:"reporting",j:"eu"},o7:{m:["ocean"],t:"corridors",j:"global"},o8:{m:["ocean"],t:"fuels",j:"global"},o9:{m:["ocean"],t:"emissions",j:"eu"},o10:{m:["ocean"],t:"corridors",j:"eu"},o11:{m:["ocean"],t:"research",j:"global"},o12:{m:["ocean"],t:"corridors",j:"global"},o13:{m:["ocean"],t:"emissions",j:"global"},
a1:{m:["air"],t:"emissions",j:"global"},a2:{m:["air"],t:"emissions",j:"eu"},a3:{m:["air"],t:"fuels",j:"eu"},a4:{m:["air"],t:"fuels",j:"uk"},a5:{m:["air"],t:"reporting",j:"global"},a6:{m:["air"],t:"reporting",j:"global"},a7:{m:["air"],t:"reporting",j:"global"},a8:{m:["air"],t:"research",j:"global"},
l1:{m:["road"],t:"transport",j:"eu"},l2:{m:["road"],t:"transport",j:"eu"},l3:{m:["road"],t:"corridors",j:"eu"},l4:{m:["road"],t:"corridors",j:"eu"},l5:{m:["road"],t:"transport",j:"eu"},l6:{m:["road"],t:"transport",j:"us"},l7:{m:["road"],t:"transport",j:"us"},l8:{m:["road"],t:"fuels",j:"us"},l9:{m:["road"],t:"research",j:"us"},l10:{m:["road"],t:"corridors",j:"us"},
t1:{m:["air","ocean","road"],t:"emissions",j:"eu"},t2:{m:["air","ocean","road"],t:"emissions",j:"global"},t3:{m:["air","ocean","road"],t:"research",j:"global"},t4:{m:["air","ocean","road"],t:"research",j:"global"},t5:{m:["air","ocean","road"],t:"emissions",j:"global"},t6:{m:["air","ocean","road"],t:"emissions",j:"global"},t7:{m:["air","ocean","road"],t:"research",j:"global"},
c1:{m:["air","ocean","road"],t:"reporting",j:"eu"},c2:{m:["air","ocean","road"],t:"reporting",j:"eu"},c3:{m:["air","ocean","road"],t:"reporting",j:"global"},c4:{m:["air","ocean","road"],t:"reporting",j:"global"},c5:{m:["air","ocean","road"],t:"reporting",j:"global"},c6:{m:["air","ocean","road"],t:"reporting",j:"global"},c7:{m:["air","ocean","road"],t:"reporting",j:"global"},c8:{m:["air","ocean","road"],t:"reporting",j:"global"},c9:{m:["air","ocean","road"],t:"reporting",j:"global"},c10:{m:["air","ocean","road"],t:"reporting",j:"global"},c11:{m:["air","ocean","road"],t:"research",j:"global"},
g1:{m:["air","ocean","road"],t:"emissions",j:"eu"},g2:{m:["air","ocean","road"],t:"packaging",j:"eu"},g3:{m:["air","ocean","road"],t:"research",j:"eu"},g4:{m:["air","ocean","road"],t:"research",j:"eu"},g5:{m:["road"],t:"transport",j:"eu"},g6:{m:["air","ocean","road"],t:"transport",j:"uk"},g7:{m:["air","ocean","road"],t:"transport",j:"eu"},g8:{m:["road"],t:"reporting",j:"us"},g9:{m:["air","ocean","road"],t:"packaging",j:"global"},g10:{m:["air","ocean","road"],t:"research",j:"us"},g11:{m:["air","ocean","road"],t:"research",j:"us"},g12:{m:["air","ocean","road"],t:"research",j:"latam"},g13:{m:["ocean","road"],t:"packaging",j:"latam"},g14:{m:["air","ocean","road"],t:"emissions",j:"latam"},g15:{m:["air","ocean","road"],t:"transport",j:"latam"},g16:{m:["air","ocean","road"],t:"research",j:"latam"},g17:{m:["ocean"],t:"corridors",j:"asia"},g18:{m:["ocean","road"],t:"transport",j:"asia"},g19:{m:["ocean"],t:"emissions",j:"asia"},g20:{m:["air","ocean","road"],t:"emissions",j:"asia"},g21:{m:["air","ocean","road"],t:"research",j:"asia"},g22:{m:["air","ocean","road"],t:"emissions",j:"asia"},g23:{m:["air","ocean","road"],t:"emissions",j:"asia"},g24:{m:["air","ocean","road"],t:"transport",j:"asia"},g25:{m:["ocean"],t:"corridors",j:"meaf"},g26:{m:["air","ocean","road"],t:"fuels",j:"meaf"},g27:{m:["air","ocean","road"],t:"reporting",j:"global"},g28:{m:["air","ocean","road"],t:"research",j:"global"},g29:{m:["air","ocean","road"],t:"research",j:"global"},g30:{m:["air","ocean","road"],t:"research",j:"global"},g31:{m:["air","ocean","road"],t:"research",j:"global"},g32:{m:["air","ocean","road"],t:"corridors",j:"eu"},g33:{m:["ocean","road"],t:"packaging",j:"eu"},g34:{m:["air","ocean","road"],t:"reporting",j:"eu"},
r1:{m:["air","ocean","road"],t:"research",j:"us"},r2:{m:["air","ocean","road"],t:"research",j:"global"},r3:{m:["air","ocean","road"],t:"research",j:"eu"},r4:{m:["air","ocean","road"],t:"research",j:"global"},r5:{m:["air","ocean","road"],t:"research",j:"eu"},r6:{m:["air","ocean","road"],t:"research",j:"eu"},r7:{m:["ocean"],t:"research",j:"eu"},r8:{m:["air","ocean","road"],t:"research",j:"uk"},r9:{m:["air","ocean","road"],t:"research",j:"global"},r10:{m:["air","ocean","road"],t:"research",j:"global"},r11:{m:["air","ocean","road"],t:"research",j:"global"},r12:{m:["air","ocean","road"],t:"research",j:"global"},r13:{m:["air","ocean","road"],t:"research",j:"global"},r14:{m:["air","ocean","road"],t:"research",j:"global"},r15:{m:["air","ocean","road"],t:"research",j:"global"},r16:{m:["air","ocean","road"],t:"research",j:"uk"},r17:{m:["air","ocean","road"],t:"research",j:"global"},r18:{m:["ocean"],t:"research",j:"global"},r19:{m:["air","ocean","road"],t:"research",j:"global"},r20:{m:["air","ocean","road"],t:"research",j:"global"},r21:{m:["air","ocean","road"],t:"research",j:"global"},r22:{m:["air","ocean","road"],t:"research",j:"us"},r23:{m:["ocean"],t:"fuels",j:"global"},r24:{m:["ocean"],t:"emissions",j:"global"},r25:{m:["air","ocean","road"],t:"emissions",j:"global"},r26:{m:["air","ocean","road"],t:"fuels",j:"eu"},r27:{m:["ocean"],t:"fuels",j:"global"},r28:{m:["road"],t:"fuels",j:"eu"},r29:{m:["air","ocean","road"],t:"research",j:"us"},r30:{m:["ocean"],t:"corridors",j:"global"},r31:{m:["ocean"],t:"corridors",j:"us"},r32:{m:["ocean"],t:"corridors",j:"eu"},r33:{m:["ocean"],t:"research",j:"global"},r34:{m:["air","ocean","road"],t:"research",j:"global"},r35:{m:["air","ocean","road"],t:"research",j:"global"},r36:{m:["ocean"],t:"research",j:"global"},
};
const remap=r=>({...r,...(REMAP[r.id]||{m:["air","ocean","road"],t:"research",j:"global"}),modes:(REMAP[r.id]||{m:["air","ocean","road"]}).m,topic:(REMAP[r.id]||{t:"research"}).t,jur:(REMAP[r.id]||{j:"global"}).j});

// ── Metadata ──
const AUDIT_DATE = "2026-03-01";
["o13","g32","g33","g34","r34","r35","r36"].forEach(id=>{const r=SEED.find(x=>x.id===id);if(r)r.added=AUDIT_DATE});
["t1","o1","o4"].forEach(id=>{const r=SEED.find(x=>x.id===id);if(r)r.modified=AUDIT_DATE}); // data corrections

// Change log — what specifically changed per resource
const CHANGE_LOG = {
  t1:[
    {field:"Timeline",prev:"CBAM transitional phase until Dec 2025",now:"Definitive phase active Jan 2026. Authorised declarant registration deadline extended to March 2026",impact:"HIGH — registration is now the immediate compliance action"},
    {field:"Scope",prev:"Scope limited to cement, iron, steel, aluminium, fertilisers, electricity, hydrogen",now:"Unchanged scope but EU Commission reviewing potential expansion to organic chemicals and polymers by 2028",impact:"MODERATE — expansion may affect packaging materials"},
    {field:"Dispute status",prev:"WTO challenge speculative",now:"Multiple WTO members (India, China, Brazil) have formally signaled objections. Implementation proceeding but legal challenge is active",impact:"HIGH — dispute may alter scope or enforcement timeline"},
  ],
  o1:[
    {field:"Priority",prev:"HIGH",now:"CRITICAL",impact:"Urgency increased — enforcement timelines are within planning horizon"},
    {field:"Key data",prev:"No specific packaging regulation link",now:"Added PPWR interaction — packaging compliance required for goods shipped on ocean routes to EU",impact:"MODERATE — packaging + ocean compliance now linked"},
    {field:"Timeline",prev:"ETS Phase 4 only",now:"Added IMO NZF interaction milestones for dual ocean compliance tracking",impact:"HIGH — two parallel compliance tracks now active for ocean freight"},
  ],
  o4:[
    {field:"Status",prev:"Draft proposal stage",now:"Regulation published in Official Journal, directly applicable in all EU member states",impact:"CRITICAL — no longer draft; immediate legal obligation"},
    {field:"Key data",prev:"Targets under negotiation",now:"All packaging recyclable by 2030, PFAS restrictions confirmed, single-use bans from 2030, recycled content minimums set",impact:"HIGH — concrete targets now enforceable"},
    {field:"Timeline",prev:"Estimated 2026 implementation",now:"Phased implementation confirmed: labelling 2026, reuse targets 2030, recycled content 2030",impact:"HIGH — phase dates now firm for planning"},
  ],
};

const SUPERSESSIONS = [
  { id:"ss1",oldTitle:"EU PPWD 94/62/EC",oldUrl:"",newTitle:"EU PPWR 2025/40",newId:"g2",severity:"CRITICAL",date:"2025-02",what:"Directive replaced by directly applicable Regulation. No national transposition needed. All packaging recyclable by 2030, PFAS restrictions, single-use limits. Dramatically expands scope for transport and event packaging.",timeline:[{date:"1994-12",label:"PPWD adopted"},{date:"2025-02",label:"PPWR in force"},{date:"2026-08",label:"PPWR applies"},{date:"2030-01",label:"All recyclable"}] },
  { id:"ss2",oldTitle:"CSRD 250+ employees threshold",oldUrl:"",newTitle:"EU Omnibus CSRD 1,000+ employees",newId:"c1",severity:"CRITICAL",date:"2026-02",what:"Omnibus raised company size threshold from 250 to 1,000 employees. Companies in scope dropped from ~50,000 to ~5,000. Wave 2 delayed by 2 years. Remaining companies face stricter data granularity requirements including supply chain logistics emissions.",timeline:[{date:"2024-01",label:"Wave 1 PIEs"},{date:"2026-02",label:"Omnibus adopted"},{date:"2028-01",label:"Wave 2 delayed"}] },
  { id:"ss3",oldTitle:"EPA 2009 Endangerment Finding",oldUrl:"",newTitle:"EPA GHG Rescission (2025)",newId:"g8",severity:"HIGH",date:"2025-12",what:"Federal legal basis for ALL vehicle GHG regulation removed. Creates patchwork: California + 12 Section 177 states maintain independent standards. Federal rules collapse. Court challenges pending. Freight forwarders face divergent state-by-state compliance.",timeline:[{date:"2009-12",label:"Finding issued"},{date:"2025-06",label:"Rescission proposed"},{date:"2025-12",label:"Final rule"},{date:"2026-06",label:"Court challenges"}] },
  { id:"ss4",oldTitle:"IMO 2018 GHG Strategy (50% by 2050)",oldUrl:"",newTitle:"IMO 2023 Revised Strategy (Net-zero ~2050)",newId:"o1",severity:"CRITICAL",date:"2023-07",what:"Ambition doubled from 50% reduction to net-zero by ~2050. New interim checkpoints: 20% by 2030, 70% by 2040. GHG fuel intensity code and pricing mechanism under negotiation. Fundamentally reshapes carrier fleet investment timelines.",timeline:[{date:"2018-04",label:"Initial strategy"},{date:"2023-07",label:"Revised adopted"},{date:"2025-04",label:"MEPC 83"},{date:"2030-01",label:"20% checkpoint"},{date:"2040-01",label:"70% checkpoint"}] },
  { id:"ss5",oldTitle:"Voluntary IMO GHG measures only",oldUrl:"",newTitle:"IMO Net-Zero Framework (binding fuel standard + pricing)",newId:"o13",severity:"CRITICAL",date:"2025-04",what:"First binding market-based measure for shipping: mandatory fuel GHG intensity standard + global carbon pricing mechanism. Approved MEPC 83 by 63-16-24 vote. US walked out and formally opposes. Adoption at MEPC ES.2 Oct 2025, entry into force Mar 2027, enforcement 2028. Creates new carrier cost layer on every ocean shipment.",timeline:[{date:"2025-04",label:"MEPC 83 approved"},{date:"2025-10",label:"Adoption vote"},{date:"2027-03",label:"Entry into force"},{date:"2028-01",label:"Enforcement"}] },
];

const SEED_ARC = [
  {id:"arc1",title:"EU PPWD 94/62/EC",cat:"global",archivedDate:"2025-02-11",reason:"Superseded",note:"Replaced by PPWR 2025/40",replacement:"EU PPWR 2025/40"},
  {id:"arc2",title:"CSRD 250+ employee threshold",cat:"compliance",archivedDate:"2026-02-24",reason:"Superseded",note:"Omnibus raised to 1,000",replacement:"CSRD (Omnibus)"},
  {id:"arc3",title:"EPA 2009 Endangerment Finding",cat:"global",archivedDate:"2025-12-01",reason:"Repealed",note:"Federal GHG basis rescinded",replacement:"EPA SmartWay"},
  {id:"arc4",title:"IMO 2018 GHG Strategy",cat:"ocean",archivedDate:"2023-07-07",reason:"Superseded",note:"Replaced by 2023 Revised Strategy",replacement:"IMO GHG Strategy 2023"},
];

// ═══════════ Impact Scoring ═══════════
const IMPACT_DIMS = {cost:"💰",compliance:"⚖️",client:"🤝",operational:"🔧"};
const DIM_LABELS = {cost:"Cost Impact",compliance:"Compliance Obligation",client:"Client-Facing",operational:"Operational"};
const DIM_COLORS = {cost:"#FFD60A",compliance:"#E040FB",client:"#00C7BE",operational:"#64D2FF"};
const STATUS_DEF = {action:{l:"Action Required",c:"#FF3B30",i:"🔴"},tracking:{l:"Tracking",c:"#FF9500",i:"🟡"},compliant:{l:"Compliant",c:"#10b981",i:"🟢"},parked:{l:"Parked",c:"#64748b",i:"⚪"}};

// Jurisdiction scope for weighting
const JURISDICTIONS = {EU:3,US:2,UK:2,Global:3,Asia:1,LatAm:1,National:1};
const getJurisdiction = (r) => {
  const t = `${r.title} ${r.note} ${(r.tags||[]).join(" ")} ${r.sub||""}`.toLowerCase();
  if(t.match(/\beu\b|european|fit for 55|fueleu|cbam|csrd|ppwr|ics2|eudr|taxonomy|euro 7|afir|corsia.*eu/)) return "EU";
  if(t.match(/\bus\b|epa|carb|california|dot |nrel|smartway|port of la/)) return "US";
  if(t.match(/\buk\b|british|dft/)) return "UK";
  if(t.match(/imo|icao|wto|unctad|iso |ghg protocol|ipcc|global|world bank|un sdg/)) return "Global";
  if(t.match(/japan|korea|singapore|china|asean|india|asia/)) return "Asia";
  if(t.match(/brazil|mexico|colombia|latin|eclac/)) return "LatAm";
  return "National";
};

// Score 0-3 per dimension based on resource attributes
const scoreResource = (r) => {
  const pri = {CRITICAL:3,HIGH:2,MODERATE:1,LOW:0}[r.priority]||1;
  const tStr = (r.tags||[]).join(" ").toLowerCase();
  const isReg = ["regulation","standard","legal","rule","certification"].includes(r.type);
  const isData = ["tool","data","tracker","news","blog","journal","academic"].includes(r.type);
  // Cost: directly changes freight pricing
  let cost = 0;
  if(tStr.match(/ets|surcharge|penalty|fuel cost|carbon tax|carbon border|cbam|saf|pricing/)) cost=3;
  else if(tStr.match(/carbon|cost|fee|allowance|pricing|finance/)) cost=2;
  else if(r.cat==="cbam") cost=2;
  else if(pri>=2 && (r.cat==="ocean"||r.cat==="air")) cost=1;
  // Compliance: mandatory legal obligation
  let compliance = 0;
  if(isReg && pri>=2) compliance=3;
  else if(isReg) compliance=2;
  else if(r.type==="standard"||r.type==="certification") compliance=2;
  else if(tStr.match(/mandatory|reporting|regulation|directive|mandate/)) compliance=2;
  else if(r.cat==="compliance") compliance=Math.min(pri,2);
  // Client: clients will ask about this
  let client = 0;
  if(tStr.match(/scope 3|cdp|ecovadis|reporting|disclosure|rfq|rfp|tender|csrd|issb|glec|iso 14083/)) client=3;
  else if(r.cat==="compliance") client=2;
  else if(tStr.match(/rating|target|sbti|ghg protocol|data request/)) client=2;
  else if(pri>=2 && isReg) client=1;
  // Operational: affects routing, fleet, packaging, documentation
  let operational = 0;
  if(tStr.match(/drayage|port|routing|packaging|customs|carb|zev|fleet|infrastructure|dwell/)) operational=3;
  else if(tStr.match(/truck|vessel|corridor|bunkering|charging|shore power/)) operational=2;
  else if(r.cat==="land"||r.cat==="global") operational=Math.min(pri,2);
  else if(isReg) operational=1;
  return {cost:Math.min(cost,3),compliance:Math.min(compliance,3),client:Math.min(client,3),operational:Math.min(operational,3)};
};

const urgencyScore = (r) => {
  const sc = scoreResource(r);
  const total = sc.cost+sc.compliance+sc.client+sc.operational;
  const priW = {CRITICAL:4,HIGH:3,MODERATE:2,LOW:1}[r.priority]||1;
  const jurW = (JURISDICTIONS[getJurisdiction(r)]||1)/3; // normalize 0.33-1.0
  // Time weight: days to next future milestone
  let timeW = 1;
  if(r.timeline?.length){
    const now=new Date();
    const future=r.timeline.map(m=>new Date(m.date)).filter(d=>d>now).sort((a,b)=>a-b);
    if(future.length){const days=Math.max(1,Math.floor((future[0]-now)/864e5));timeW=Math.min(5,365/days)}
  }
  return Math.round((total * priW * timeW * (0.5+jurW*0.5))*10)/10;
};

// Relationship clusters — resources that compound on the same shipment or workflow
const CLUSTERS = [
  {id:"cl1",name:"EU Ocean Shipment Stack",desc:"Regulations hitting the SAME vessel on SAME EU port call",color:"#0F4C81",ids:["o1","o2","o3","o4","o5","o6","o13"]},
  {id:"cl2",name:"EU Air Cargo Stack",desc:"Combined cost layers on every EU airport uplift",color:"#2E86AB",ids:["a1","a2","a3"]},
  {id:"cl3",name:"Client Data Request Chain",desc:"The pipeline from methodology → calculation → disclosure → scoring",color:"#0D9488",ids:["c4","c5","c6","c7","c8","c9","c10","g34"]},
  {id:"cl4",name:"EU Packaging & Materials",desc:"Packaging + deforestation + PFAS rules on every EU-bound shipment",color:"#DC2626",ids:["g1","g2","g4","g33"]},
  {id:"cl5",name:"US Drayage & Fleet",desc:"Converging US truck mandates affecting port access",color:"#E8871E",ids:["l6","l7","l8","g8"]},
  {id:"cl6",name:"Carbon Pricing Exposure",desc:"Carbon costs embedded in freight rates across jurisdictions",color:"#7C3AED",ids:["t1","t5","t6","o3","a2","o13"]},
  {id:"cl7",name:"Green Corridor Readiness",desc:"Infrastructure and fuel availability on key trade lanes",color:"#2563EB",ids:["o7","o8","r30","r31","l3","g17"]},
  {id:"cl8",name:"SAF Cost Cascade",desc:"SAF mandates compounding across jurisdictions",color:"#2E86AB",ids:["a3","a4","a5","a7"]},
  {id:"cl9",name:"EU Customs & Border Stack",desc:"CBAM + ICS2 + EUDR converging at EU border in 2026",color:"#DC2626",ids:["t1","g32","g33"]},
  {id:"cl10",name:"Timber & Wood Packaging",desc:"EUDR + PPWR + ISPM 15 affecting crating for art, automotive, events",color:"#E8871E",ids:["g33","g2"]},
];

// Action-based smart views
const XREF_PAIRS = [
  // IMO GHG Strategy is the root — everything in ocean references it
  ["o2","o1"],["o3","o1"],["o4","o1"],["o7","o1"],
  // EU ETS Shipping depends on MRV data
  ["o3","o6"],
  // Fit for 55 is parent package — child regulations reference it
  ["o2","g1"],["o3","g1"],["a2","g1"],["a3","g1"],["l1","g1"],["l3","g1"],["t1","g1"],["g2","g1"],
  // CORSIA references ICAO calculator methodology
  ["a1","a6"],
  // UK SAF references EU ReFuelEU as benchmark
  ["a4","a3"],
  // GLEC aligned with ISO 14083
  ["c5","c4"],["a7","c4"],
  // GHG Protocol is foundation — SBTi, CDP, CSRD build on it
  ["c7","c6"],["c9","c6"],["c1","c6"],
  // CSRD references Taxonomy + GRI + ISSB
  ["c1","c2"],["c1","c3"],["c1","c8"],
  // ISSB interoperates with GRI
  ["c8","c3"],
  // EcoVadis uses CDP-like methodology
  ["c10","c9"],
  // CBAM linked to ETS pricing
  ["t1","o3"],["t1","t5"],
  // World Bank tracks ICAP data
  ["t5","t6"],
  // CARB references EPA as federal baseline
  ["l7","l6"],
  // IPCC is scientific basis for IMO + Fit for 55
  ["o1","g28"],["g1","g28"],
  // Getting to Zero corridors directory references coalition
  ["r30","o7"],
  // Port of LA references CARB rules
  ["r31","l7"],
  // Singapore Green Plan references MPA
  ["g20","g17"],
  // PPWR replaces PPWD (tracked in supersessions, reinforced here)
  ["g2","g1"],
  // SBTi transport pathway references ISO 14083
  ["c7","c4"],
  // IEA tracks OECD carbon pricing
  ["g29","t3"],
  // ITF is OECD transport arm
  ["g31","t3"],
  // IMO NZF references IMO GHG Strategy and is linked to EU ETS/FuelEU
  ["o13","o1"],["o13","o2"],["o13","o3"],
  // CountEmissions references ISO 14083 and GLEC
  ["g34","c4"],["g34","c5"],
  // EUDR references Fit for 55 package
  ["g33","g1"],
  // ICS2 links to CBAM customs integration
  ["g32","t1"],
  // FIATA provides CBAM guidance
  ["r34","t1"],
  // ICCT referenced by EU truck + maritime standards
  ["l1","r35"],["o1","r35"],
  // Maritime Carbon Intelligence covers NZF + ETS
  ["r36","o13"],["r36","o3"],
];

// Pre-seeded disputes — information where sources conflict or status is uncertain
const SEED_DISPUTES = {
  l6:{active:true,note:"Regulatory survival uncertain. EPA Phase 3 under active political review — may be weakened, delayed, or rescinded. CARB standards (l7) remain independent but federal waiver also challenged. Sources conflict on timeline.",sources:["EPA","Industry groups","Environmental Defense Fund"]},
  l7:{active:true,note:"Federal waiver for Section 177 states under legal challenge. 12+ states follow CARB rules, but if waiver is revoked, state-level mandates face uncertainty. Court ruling pending.",sources:["CARB","EPA","State AG coalition"]},
  c1:{active:true,note:"CSRD Omnibus significantly changed scope in Feb 2026. Some sources still cite pre-Omnibus 250-employee threshold. Verify any CSRD reference uses post-Omnibus 1,000-employee threshold and delayed Wave 2 timeline.",sources:["EU Commission","Big 4 advisors"]},
  t1:{active:true,note:"WTO compatibility of CBAM is actively disputed. Multiple WTO members have filed or signaled objections. Implementation proceeding but legal challenge could alter scope.",sources:["EU Commission","WTO","India/China trade ministries"]},
  g2:{active:true,note:"PPWR implementation guidance still being developed. Specific recyclability criteria and PFAS thresholds under delegated act development. Details may shift before Aug 2026 application date.",sources:["EU Commission","EUROPEN","Plastics Europe"]},
  o13:{active:true,note:"US formally opposes IMO Net-Zero Framework as a 'global carbon tax'. US delegation walked out of MEPC 83 before vote. US State/Energy/Transport Secretaries issued joint ultimatum against countries voting yes at Oct 2025 adoption. Framework approved 63-16-24 but US enforcement non-participation creates compliance fragmentation on US-origin trade lanes.",sources:["IMO","US State Department","Jones Walker LLP","Maritime Carbon Intelligence"]},
  g33:{active:true,note:"EUDR delayed twice (Dec 2024 → Dec 2025 → Dec 2026). Simplification review due Apr 2026 may further change requirements. IT platform readiness uncertain. Some stakeholders argue simplifications amount to deregulation. Core obligations remain but implementation details still shifting.",sources:["EU Commission","Mayer Brown","Bird & Bird","WRI"]},
};

// Compute verification status from cross-reference count
const getXrefs = (rid) => {
  const refs = XREF_PAIRS.filter(([s,_])=>s===rid).map(([_,t])=>t);
  const refBy = XREF_PAIRS.filter(([_,t])=>t===rid).map(([s,_])=>s);
  return {refs, refBy};
};

const getVerification = (rid) => {
  const {refs, refBy} = getXrefs(rid);
  const totalLinks = refs.length + refBy.length;
  const isDisputed = SEED_DISPUTES[rid]?.active;
  if(isDisputed) return {status:"disputed",icon:"⚠️",label:"Disputed",color:"#FF9500",links:totalLinks};
  if(totalLinks >= 3) return {status:"verified",icon:"✓",label:"Verified",color:"#34C759",links:totalLinks};
  if(totalLinks >= 1) return {status:"partial",icon:"◑",label:"Partial",color:"#94a3b8",links:totalLinks};
  return {status:"unverified",icon:"?",label:"Unverified",color:"#475569",links:0};
};

// ═══════════ Timeline ═══════════
const TL=({items})=>{if(!items?.length)return null;const now=new Date();return(
  <div style={{position:"relative",padding:"12px 0 4px",overflow:"hidden"}}>
    <div style={{position:"absolute",top:18,left:8,right:8,height:2,background:"#334155"}}/>
    <div style={{display:"flex",justifyContent:"space-between",position:"relative"}}>
      {items.slice(0,5).map((m,i)=>{const p=new Date(m.date)<=now;return(
        <div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",flex:1,minWidth:0}}>
          <div style={{width:10,height:10,borderRadius:"50%",background:p?"#34C759":"#64748b",border:"2px solid #0a0f1a",zIndex:1}}/>
          <span style={{fontSize:12,color:p?"#34C759":"#94a3b8",marginTop:4,textAlign:"center",lineHeight:1.2}}>{m.date}</span>
          <span style={{fontSize:11,color:"#64748b",textAlign:"center",lineHeight:1.2,maxWidth:80,overflow:"hidden",textOverflow:"ellipsis"}}>{m.label}</span>
        </div>);})}
    </div>
  </div>);};

// ═══════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function FSI(){
  const [res,setRes]=useState(()=>SEED.map(remap));
  const [arc,setArc]=useState(SEED_ARC.map(a=>({...a,archivedDate:a.date||"2025-01-01"})));
  const [tab,setTab]=useState("home");
  const [exp,setExp]=useState(null);
  const [fMode,setFMode]=useState(null);
  const [fTopic,setFTopic]=useState(null);
  const [fJur,setFJur]=useState(null);
  const [fPri,setFPri]=useState(null);
  const [sq,setSq]=useState("");
  const [arcSq,setArcSq]=useState("");
  const [arcReason,setArcReason]=useState(null);
  const [brfOpen,setBrfOpen]=useState(false);
  const [loading,setLoading]=useState(false);
  const [arcTgt,setArcTgt]=useState(null);
  const [arcF,setArcF]=useState({reason:"Superseded",note:""});
  const [cpId,setCpId]=useState(null);
  const [showArc,setShowArc]=useState(false);
  const [showFilters,setShowFilters]=useState(false);
  // Export & share
  const [xpOpen,setXpOpen]=useState(false);
  const [xpSel,setXpSel]=useState([]);// selected resource ids for export
  const [xpFmt,setXpFmt]=useState("email");
  const [shareId,setShareId]=useState(null);
  const [copied,setCopied]=useState(null);
  // Drag reorder
  const [dragIdx,setDragIdx]=useState(null);
  const [dragOver,setDragOver]=useState(null);
  const [homeOrder,setHomeOrder]=useState({urgency:null,due:null});// custom orderings
  // Focus mode — section landing pages
  const [focus,setFocus]=useState(null); // {key, title, color, items[], whyFn(r)=>string}
  const [focusDismissed,setFocusDismissed]=useState([]); // dismissed item ids within focus
  // Settings
  const [settings,setSettings]=useState({
    defaultExport:"email", // email|slack
    briefingDay:"Monday",
    alertPriorities:["CRITICAL","HIGH"],
    homeVisible:{changed:true,briefing:true,urgency:true,due:true},
  });
  // Navigation history stack
  const [navStack,setNavStack]=useState([]);

  const today=new Date().toISOString().split("T")[0];
  const scrollToEl=useCallback((elId)=>{setTimeout(()=>{const el=document.getElementById(elId);el?.scrollIntoView({behavior:"smooth",block:"start"})},80)},[]);
  const scrollTop=useCallback(()=>window.scrollTo({top:0,behavior:"smooth"}),[]);
  const expandAndScroll=useCallback((id)=>{setExp(prev=>prev===id?null:id);if(exp!==id)scrollToEl(`res-${id}`)},[exp,scrollToEl]);
  const mI=id=>MODES.find(m=>m.id===id)?.i||"📋";
  const tpL=id=>{const t=TOPICS.find(x=>x.id===id);return t?`${t.i} ${t.l}`:id};
  const cp=(t,id)=>{setCpId(id);setTimeout(()=>setCpId(null),1500)};
  // ── Download helper — Blob URL approach (sandbox-safe) ──
  const downloadFile=useCallback((content,filename,mime="text/html")=>{
    try{
      const blob=new Blob([mime.includes("html")?`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${filename}</title><style>body{margin:0;padding:0;font-family:Arial,sans-serif}a{color:#2563eb}@media print{body{margin:0}}</style></head><body>${content}</body></html>`:content],{type:mime});
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");
      a.href=url;a.download=filename;
      document.body.appendChild(a);a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setCopied("downloaded");setTimeout(()=>setCopied(null),2500);
    }catch(err){console.error("Download error:",err)}
  },[]);

  // ── Verification (from v6 cross-ref network) ──
  const getXrefs=useCallback((id)=>{const refs=XREF_PAIRS.filter(p=>p[0]===id).map(p=>p[1]);const refBy=XREF_PAIRS.filter(p=>p[1]===id).map(p=>p[0]);return{refs,refBy}},[]);
  const getVerification=useCallback((id)=>{const{refs,refBy}=getXrefs(id);const total=refs.length+refBy.length;if(total>=3)return{status:"verified",count:total};if(total>=1)return{status:"partial",count:total};return{status:"unverified",count:0}},[getXrefs]);

  // ── Scoring (computed from tags/type/cat/priority, adapted for v7 schema) ──
  const scoreResource=useCallback((r)=>{
    const pri={CRITICAL:3,HIGH:2,MODERATE:1,LOW:0}[r.priority]||1;
    const tStr=(r.tags||[]).join(" ").toLowerCase();
    const isReg=["regulation","standard","legal","rule","certification"].includes(r.type);
    const isData=["tool","data","tracker","news","blog","journal","academic"].includes(r.type);
    let cost=0;
    if(tStr.match(/ets|surcharge|penalty|fuel cost|carbon tax|carbon border|cbam|saf|pricing/))cost=3;
    else if(tStr.match(/carbon|cost|fee|allowance|pricing|finance/))cost=2;
    else if(r.topic==="emissions"||r.cat==="cbam")cost=2;
    else if(pri>=2&&(r.topic==="fuels"||r.modes?.includes("air")||r.modes?.includes("ocean")))cost=1;
    let compliance=0;
    if(isReg&&pri>=2)compliance=3;else if(isReg)compliance=2;
    else if(r.type==="standard"||r.type==="certification")compliance=2;
    else if(tStr.match(/mandatory|reporting|regulation|directive|mandate/))compliance=2;
    else if(r.topic==="reporting")compliance=Math.min(pri,2);
    let client=0;
    if(tStr.match(/scope 3|cdp|ecovadis|reporting|disclosure|rfq|rfp|tender|csrd|issb|glec|iso 14083/))client=3;
    else if(r.topic==="reporting")client=2;
    else if(tStr.match(/rating|target|sbti|ghg protocol|data request/))client=2;
    else if(pri>=2&&isReg)client=1;
    let operational=0;
    if(tStr.match(/drayage|port|routing|packaging|customs|carb|zev|fleet|infrastructure|dwell/))operational=3;
    else if(tStr.match(/truck|vessel|corridor|bunkering|charging|shore power/))operational=2;
    else if(r.topic==="transport"||r.topic==="corridors"||r.topic==="packaging")operational=Math.min(pri,2);
    else if(isReg)operational=1;
    return{cost:Math.min(cost,3),compliance:Math.min(compliance,3),client:Math.min(client,3),operational:Math.min(operational,3)};
  },[]);
  const urgencyScore=useCallback((r)=>{
    const sc=scoreResource(r);const total=sc.cost+sc.compliance+sc.client+sc.operational;
    const priW={CRITICAL:4,HIGH:3,MODERATE:2,LOW:1}[r.priority]||1;
    const jurW={"eu":1,"global":1,"us":0.8,"uk":0.7,"asia":0.6,"hk":0.6,"latam":0.5,"meaf":0.5}[r.jur]||0.5;
    let timeW=1;
    if(r.timeline?.length){const now=new Date();const future=r.timeline.map(m=>new Date(m.date)).filter(d=>d>now).sort((a,b)=>a-b);if(future.length){const days=Math.max(1,Math.floor((future[0]-now)/864e5));timeW=Math.min(5,365/days)}}
    return Math.round(total*priW*timeW*(0.5+jurW*0.5)*10)/10;
  },[scoreResource]);

  // ── Filtering ──
  const filtered=useMemo(()=>{
    let list=[...res];
    if(fMode) list=list.filter(r=>r.modes?.includes(fMode));
    if(fTopic) list=list.filter(r=>r.topic===fTopic);
    if(fJur) list=list.filter(r=>r.jur===fJur);
    if(fPri) list=list.filter(r=>r.priority===fPri);
    if(sq.trim().length>1){const q=sq.toLowerCase();list=list.filter(r=>`${r.title} ${r.note} ${r.whatIsIt||""} ${r.whyMatters||""} ${r.type} ${r.jur} ${r.topic}`.toLowerCase().includes(q))}
    return list.sort((a,b)=>urgencyScore(b)-urgencyScore(a));
  },[res,fMode,fTopic,fJur,fPri,sq,urgencyScore]);

  // ── Archive filtering ──
  const filteredArc=useMemo(()=>{
    let list=[...arc];
    if(arcReason) list=list.filter(a=>a.reason===arcReason);
    if(arcSq.trim().length>1){const q=arcSq.toLowerCase();list=list.filter(a=>`${a.title} ${a.note||""} ${a.reason}`.toLowerCase().includes(q))}
    return list;
  },[arc,arcReason,arcSq]);

  // ── Archive actions ──
  const archR=useCallback((id)=>{const r=res.find(x=>x.id===id);if(!r)return;const ss=SUPERSESSIONS.find(s=>s.newId===id||s.oldId===id);setArc(prev=>[...prev,{...r,archivedDate:today,reason:arcF.reason,archiveNote:arcF.note,replacedBy:ss?.newId!==id?ss?.newId:null}]);setRes(prev=>prev.filter(x=>x.id!==id));setArcTgt(null);setArcF({reason:"Superseded",note:""})},[res,today,arcF]);
  const restoreR=useCallback((id)=>{const a=arc.find(x=>x.id===id);if(!a)return;const{archivedDate,reason,archiveNote,replacedBy,...r}=a;setRes(prev=>[...prev,r]);setArc(prev=>prev.filter(x=>x.id!==id))},[arc]);

  // ── Supersession lineage ──
  const getLineage=useCallback((id)=>{const chain=[];let current=id;const visited=new Set();while(current&&!visited.has(current)){visited.add(current);const ss=SUPERSESSIONS.find(s=>s.newId===current);if(ss){chain.unshift({type:"superseded",old:ss.oldTitle,new_:ss.newTitle,date:ss.date,what:ss.what,newId:ss.newId});current=ss.oldId||null}else break}current=id;visited.clear();visited.add(id);while(current){const ss=SUPERSESSIONS.find(s=>s.oldId===current);if(ss&&!visited.has(ss.newId)){visited.add(ss.newId);chain.push({type:"supersedes",old:ss.oldTitle,new_:ss.newTitle,date:ss.date,what:ss.what,newId:ss.newId});current=ss.newId}else break}return chain},[]);

  // ═══════════════════════════════════════════════════
  // FOCUS MODE — section pages with per-item WHY
  // ═══════════════════════════════════════════════════

  const whyPriority=(r)=>{
    const sc=scoreResource(r);const u=urgencyScore(r);
    const parts=[];
    if(sc.compliance>=2) parts.push("mandatory legal obligation");
    if(sc.cost>=2) parts.push("direct pricing impact");
    if(sc.client>=2) parts.push("clients will ask about this");
    if(sc.operational>=2) parts.push("affects routing, fleet, or packaging");
    const tl=r.timeline?.filter(m=>new Date(m.date)>new Date()).sort((a,b)=>new Date(a.date)-new Date(b.date))[0];
    if(tl){const d2=Math.floor((new Date(tl.date)-new Date())/864e5);if(d2<=90)parts.push(`deadline in ${d2}d: ${tl.label}`)}
    if(SEED_DISPUTES[r.id]?.active) parts.push("actively disputed");
    return `Urgency ${u} — ${parts.length?parts.join("; "):"high regulatory significance"}`;
  };
  const whyChanged=(r)=>{
    const isNew=r.added===AUDIT_DATE&&!r.modified;
    if(isNew) return `NEW ${AUDIT_DATE} — ${r.whyMatters?.slice(0,180)||r.note}`;
    return `UPDATED ${AUDIT_DATE} — review for changes to timelines, scope, or compliance requirements. ${r.whyMatters?.slice(0,120)||""}`;
  };
  const whyDisputed=(r)=>{const d=SEED_DISPUTES[r.id];return d?`${d.note.slice(0,250)}${d.sources?.length?` · Sources: ${d.sources.join(", ")}`:""}`:"";};
  const whyMode=(mode)=>(r)=>`Affects ${MODES.find(m=>m.id===mode)?.l} freight: ${r.whyMatters?.slice(0,180)||r.note}`;
  const whyTopic=(topic)=>(r)=>`${r.whyMatters?.slice(0,200)||r.note}`;
  const whyJur=(jur)=>(r)=>`${JURS.find(j=>j.id===jur)?.l} scope — ${r.whyMatters?.slice(0,180)||r.note}`;
  const whyXref=(srcTitle)=>(r)=>`Cross-referenced by "${srcTitle}". ${r.whyMatters?.slice(0,150)||r.note}`;

  const openFocus=useCallback((key,title,color,items,whyFn)=>{
    setNavStack(prev=>[...prev,{tab,focus,focusDismissed,exp,brfOpen,fMode,fTopic,fJur,fPri,sq}]);
    setFocus({key,title,color,itemIds:items.map(r=>r.id),whyFn});
    setFocusDismissed([]);setExp(null);
  },[tab,focus,focusDismissed,exp,brfOpen,fMode,fTopic,fJur,fPri,sq]);

  const navTo=useCallback((opts={})=>{
    if(opts.pri){
      const items=res.filter(r=>r.priority===opts.pri).sort((a,b)=>urgencyScore(b)-urgencyScore(a));
      openFocus(`pri-${opts.pri}`,opts.pri,PC[opts.pri],items,whyPriority);
    } else if(opts.mode){
      const md=MODES.find(m=>m.id===opts.mode);
      const items=res.filter(r=>r.modes?.includes(opts.mode)).sort((a,b)=>urgencyScore(b)-urgencyScore(a));
      openFocus(`mode-${opts.mode}`,md?.l||opts.mode,"#48484a",items,whyMode(opts.mode));
    } else if(opts.topic){
      const tp=TOPICS.find(t=>t.id===opts.topic);const tc2=TC[opts.topic]||"#8e8e93";
      const items=res.filter(r=>r.topic===opts.topic).sort((a,b)=>urgencyScore(b)-urgencyScore(a));
      openFocus(`topic-${opts.topic}`,tp?.l||opts.topic,tc2,items,whyTopic(opts.topic));
    } else if(opts.jur){
      const jr=JURS.find(j=>j.id===opts.jur);
      const items=res.filter(r=>r.jur===opts.jur).sort((a,b)=>urgencyScore(b)-urgencyScore(a));
      openFocus(`jur-${opts.jur}`,jr?.l||opts.jur,"#636366",items,whyJur(opts.jur));
    } else if(opts.changed){
      const items=[...res.filter(r=>r.added===AUDIT_DATE&&!r.modified),...res.filter(r=>r.modified===AUDIT_DATE)];
      openFocus("changed","What Changed","#34C759",items,whyChanged);
    } else if(opts.disputed){
      const ids=Object.entries(SEED_DISPUTES).filter(([,d])=>d.active).map(([id])=>id);
      const items=res.filter(r=>ids.includes(r.id));
      openFocus("disputed","Disputed Items","#FF9500",items,whyDisputed);
    } else if(opts.xrefs){
      const{refs,refBy}=getXrefs(opts.xrefs);const allIds=[...new Set([...refs,...refBy])];
      const items=res.filter(r=>allIds.includes(r.id));
      const srcR=res.find(r=>r.id===opts.xrefs);
      openFocus(`xref-${opts.xrefs}`,`References: ${srcR?.title||""}`, "#007AFF",items,whyXref(srcR?.title||""));
    } else {
      setFocus(null);setTab("explore");setExp(null);
      setFMode(null);setFTopic(null);setFJur(null);setFPri(null);setSq("");
    }
  },[res,urgencyScore,openFocus,getXrefs]);

  // Save current view state to stack before navigating away
  const pushCurrentState=useCallback(()=>{
    setNavStack(prev=>[...prev,{tab,focus,focusDismissed,exp,brfOpen,fMode,fTopic,fJur,fPri,sq}]);
  },[tab,focus,focusDismissed,exp,brfOpen,fMode,fTopic,fJur,fPri,sq]);

  const navToId=useCallback((id)=>{
    pushCurrentState();
    setFocus(null);setTab("explore");setSq("");setFMode(null);setFTopic(null);setFJur(null);setFPri(null);setTimeout(()=>setExp(id),50);
  },[pushCurrentState]);

  const goBack=useCallback(()=>{
    if(navStack.length===0){setFocus(null);setFocusDismissed([]);setTab("home");setExp(null);return}
    const prev=navStack[navStack.length-1];
    setNavStack(s=>s.slice(0,-1));
    setTab(prev.tab);setFocus(prev.focus);setFocusDismissed(prev.focusDismissed||[]);setExp(prev.exp);setBrfOpen(prev.brfOpen);
    setFMode(prev.fMode);setFTopic(prev.fTopic);setFJur(prev.fJur);setFPri(prev.fPri);setSq(prev.sq||"");
  },[navStack]);

  const closeFocus=useCallback(()=>{goBack()},[goBack]);
  const dismissFromFocus=useCallback((id)=>setFocusDismissed(prev=>[...prev,id]),[]);

  const focusItems=useMemo(()=>{
    if(!focus) return [];
    return focus.itemIds.filter(id=>!focusDismissed.includes(id)).map(id=>res.find(r=>r.id===id)).filter(Boolean);
  },[focus,focusDismissed,res]);
  const getSelectedResources=useCallback(()=>xpSel.map(id=>res.find(r=>r.id===id)).filter(Boolean),[xpSel,res]);

  // Email HTML
  const toEmailHTML=useCallback((items,title)=>{
    const d=today;const pri=c=>({CRITICAL:"#dc2626",HIGH:"#C77700",MODERATE:"#6b7280",LOW:"#9ca3af"}[c]||"#6b7280");
    let h=`<div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;color:#1f2937">`;
    h+=`<div style="background:#1c1c1e;color:#ffffff;padding:24px 28px;border-radius:8px 8px 0 0"><h1 style="margin:0;font-size:20px">🌍 ${title||"Freight Sustainability Intelligence"}</h1><p style="margin:6px 0 0;font-size:13px;color:#9ca3af">${d} · ${items.length} item${items.length!==1?"s":""}</p></div>`;
    h+=`<div style="padding:4px 0">`;
    items.forEach(r=>{
      const tc2={emissions:"#5856D6",fuels:"#A2845E",transport:"#34C759",reporting:"#AF52DE",packaging:"#FF2D55",corridors:"#007AFF",research:"#5AC8FA"}[r.topic]||"#6b7280";
      const modes=r.modes?.map(m=>({air:"✈️",road:"🚛",ocean:"🚢"}[m]||"")).join(" ")||"";
      const tp=TOPICS.find(t=>t.id===r.topic);const topicLabel=tp?`${tp.i} ${tp.l}`:"";
      const jur=JURS.find(j=>j.id===r.jur)?.l||"";
      const sc=scoreResource(r);const disp=SEED_DISPUTES[r.id];
      const changes=CHANGE_LOG[r.id];
      h+=`<div style="padding:18px 28px;border-bottom:1px solid #e5e7eb;border-left:4px solid ${tc2}">`;
      // Header
      h+=`<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">`;
      h+=`<div><span style="font-size:14px">${modes}</span> <strong style="font-size:16px;color:#111827">${r.title}</strong></div>`;
      h+=`<span style="font-size:12px;padding:3px 10px;border-radius:4px;background:${pri(r.priority)}15;color:${pri(r.priority)};font-weight:700">${r.priority}</span></div>`;
      // What this is
      if(r.whatIsIt)h+=`<p style="margin:4px 0 8px;font-size:13px;color:#374151;line-height:1.6">${r.whatIsIt}</p>`;
      // Why it matters
      if(r.whyMatters)h+=`<div style="margin:8px 0;padding:10px 14px;background:#f0fdf4;border-left:3px solid #059669;border-radius:4px"><p style="margin:0;font-size:13px;color:#059669;font-weight:600">WHY IT MATTERS</p><p style="margin:4px 0 0;font-size:13px;color:#374151;line-height:1.6">${r.whyMatters}</p></div>`;
      // What changed
      if(changes?.length){
        h+=`<div style="margin:8px 0;padding:10px 14px;background:#fff7ed;border-left:3px solid #C77700;border-radius:4px"><p style="margin:0 0 6px;font-size:13px;color:#C77700;font-weight:700">⚡ WHAT CHANGED — ${r.modified||r.added}</p>`;
        changes.forEach(ch=>{
          h+=`<div style="margin-bottom:8px"><p style="margin:0;font-size:12px;font-weight:600;color:#374151">${ch.field}</p>`;
          h+=`<p style="margin:2px 0;font-size:12px;color:#9ca3af;text-decoration:line-through">Was: ${ch.prev}</p>`;
          h+=`<p style="margin:2px 0;font-size:12px;color:#111827;font-weight:500">Now: ${ch.now}</p>`;
          h+=`<p style="margin:2px 0;font-size:11px;color:#C77700">Impact: ${ch.impact}</p></div>`;
        });
        h+=`</div>`;
      }
      // Key data
      if(r.keyData?.length)h+=`<div style="margin:8px 0;padding:10px 14px;background:#f9fafb;border-radius:4px;font-size:12px;color:#374151;line-height:1.7">${r.keyData.map(dd=>`• ${dd}`).join("<br>")}</div>`;
      // Impact scores
      h+=`<div style="margin:8px 0;font-size:12px;color:#6b7280">Impact: Cost ${sc.cost}/3 · Compliance ${sc.compliance}/3 · Client ${sc.client}/3 · Operational ${sc.operational}/3 · Urgency: ${urgencyScore(r)}</div>`;
      // Dispute
      if(disp?.active){
        h+=`<div style="margin:8px 0;padding:10px 14px;background:#fff8f1;border-left:3px solid #FF9500;border-radius:4px">`;
        h+=`<p style="margin:0 0 4px;font-size:13px;color:#FF9500;font-weight:700">⚠ DISPUTED</p>`;
        h+=`<p style="margin:0 0 4px;font-size:12px;color:#92400e;line-height:1.6">${disp.note}</p>`;
        if(disp.sources?.length)h+=`<p style="margin:0;font-size:12px;color:#FF9500">Disputed by: <strong>${disp.sources.join(", ")}</strong></p>`;
        h+=`</div>`;
      }
      // Timeline — next milestone
      if(r.timeline?.length){const now=new Date();const next=r.timeline.map(m=>({...m,dt:new Date(m.date)})).filter(m=>m.dt>now).sort((a,b)=>a.dt-b.dt)[0];if(next){const days=Math.floor((next.dt-now)/864e5);h+=`<p style="margin:6px 0;font-size:13px;color:${days<=30?"#dc2626":days<=60?"#C77700":"#6b7280"}"><strong>⏱ Next milestone:</strong> ${next.label} — ${next.date} (${days} days)</p>`}
        h+=`<p style="margin:4px 0;font-size:11px;color:#9ca3af">Full timeline: ${r.timeline.map(m=>`${m.date}: ${m.label}`).join(" → ")}</p>`;
      }
      // Footer
      h+=`<div style="margin-top:10px;font-size:12px;color:#9ca3af">${topicLabel} · ${jur}${r.url?` · <a href="${r.url}" style="color:#2563eb">Source ↗</a>`:""}</div>`;
      h+=`</div>`;
    });
    h+=`</div><div style="padding:16px 28px;font-size:12px;color:#9ca3af;background:#f9fafb;border-radius:0 0 8px 8px">Generated by Freight Sustainability Intelligence · ${d}</div></div>`;
    return h;
  },[today,urgencyScore,scoreResource]);

  // Weekly briefing email — complete standalone briefing
  const toBriefingEmail=useCallback(()=>{
    const newR=res.filter(r=>r.added===AUDIT_DATE&&!r.modified);
    const modR=res.filter(r=>r.modified===AUDIT_DATE);
    const critical=[...res].sort((a,b)=>urgencyScore(b)-urgencyScore(a)).slice(0,5);
    const disputed=Object.entries(SEED_DISPUTES).filter(([,d])=>d.active).map(([id,d])=>({...d,r:res.find(x=>x.id===id)})).filter(x=>x.r);
    const now=new Date(),q=new Date(now.getTime()+90*864e5);
    const due=res.filter(r=>r.timeline?.some(m=>{const d2=new Date(m.date);return d2>=now&&d2<=q})).slice(0,5);
    let h=`<div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;color:#1f2937">`;
    h+=`<div style="background:#1c1c1e;color:#ffffff;padding:24px 28px;border-radius:8px 8px 0 0"><h1 style="margin:0;font-size:22px">🌍 Weekly Sustainability Briefing</h1><p style="margin:6px 0 0;font-size:13px;color:#9ca3af">${today} · ${res.length} resources tracked</p></div>`;
    h+=`<div style="padding:20px 28px">`;
    // New items — with full context
    if(newR.length){
      h+=`<h2 style="font-size:17px;color:#059669;margin:0 0 12px">🆕 New This Week (${newR.length})</h2>`;
      newR.forEach(r=>{
        const modes=r.modes?.map(m=>({air:"✈️",road:"🚛",ocean:"🚢"}[m]||"")).join(" ")||"";
        const tp=TOPICS.find(t=>t.id===r.topic);
        h+=`<div style="margin-bottom:12px;padding:12px 14px;border-left:3px solid #059669;background:#f0fdf4;border-radius:4px">`;
        h+=`<p style="margin:0;font-size:14px"><span>${modes} ${tp?.i||""}</span> <strong>${r.title}</strong> <span style="font-size:11px;padding:2px 6px;border-radius:3px;background:${({CRITICAL:"#dc2626",HIGH:"#C77700"})[r.priority]||"#6b7280"}15;color:${({CRITICAL:"#dc2626",HIGH:"#C77700"})[r.priority]||"#6b7280"};font-weight:700">${r.priority}</span></p>`;
        if(r.whatIsIt)h+=`<p style="margin:6px 0 0;font-size:13px;color:#374151;line-height:1.6">${r.whatIsIt}</p>`;
        if(r.whyMatters)h+=`<p style="margin:6px 0 0;font-size:13px;color:#059669;line-height:1.6"><strong>Why:</strong> ${r.whyMatters}</p>`;
        if(r.url)h+=`<p style="margin:4px 0 0;font-size:11px"><a href="${r.url}" style="color:#2563eb">Source ↗</a></p>`;
        h+=`</div>`;
      });
      h+=`<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">`;
    }
    // Updated — with change diffs
    if(modR.length){
      h+=`<h2 style="font-size:17px;color:#C77700;margin:0 0 12px">🔄 Updated (${modR.length})</h2>`;
      modR.forEach(r=>{
        const modes=r.modes?.map(m=>({air:"✈️",road:"🚛",ocean:"🚢"}[m]||"")).join(" ")||"";
        const changes=CHANGE_LOG[r.id];
        h+=`<div style="margin-bottom:12px;padding:12px 14px;border-left:3px solid #C77700;background:#fff7ed;border-radius:4px">`;
        h+=`<p style="margin:0;font-size:14px"><span>${modes}</span> <strong>${r.title}</strong></p>`;
        if(changes?.length){changes.forEach(ch=>{
          h+=`<div style="margin:6px 0 0"><p style="margin:0;font-size:12px;font-weight:600;color:#374151">${ch.field}:</p>`;
          h+=`<p style="margin:2px 0;font-size:12px;color:#9ca3af;text-decoration:line-through">${ch.prev}</p>`;
          h+=`<p style="margin:2px 0;font-size:12px;color:#111827;font-weight:500">${ch.now}</p></div>`;
        })} else {h+=`<p style="margin:6px 0 0;font-size:12px;color:#92400e">Data corrections applied — review updated details.</p>`}
        if(r.url)h+=`<p style="margin:4px 0 0;font-size:11px"><a href="${r.url}" style="color:#2563eb">Source ↗</a></p>`;
        h+=`</div>`;
      });
      h+=`<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">`;
    }
    // Top urgency
    h+=`<h2 style="font-size:17px;color:#dc2626;margin:0 0 12px">🔴 Top Urgency</h2>`;
    critical.forEach(r=>{
      const modes=r.modes?.map(m=>({air:"✈️",road:"🚛",ocean:"🚢"}[m]||"")).join(" ")||"";
      const tp=TOPICS.find(t=>t.id===r.topic);
      h+=`<div style="margin-bottom:8px;padding:8px 12px;border-left:3px solid ${({CRITICAL:"#dc2626",HIGH:"#C77700"})[r.priority]||"#6b7280"}">`;
      h+=`<p style="margin:0;font-size:13px">${modes} ${tp?.i||""} <span style="color:${({CRITICAL:"#dc2626",HIGH:"#C77700"})[r.priority]||"#6b7280"};font-weight:700">[${r.priority}]</span> <strong>${r.title}</strong></p>`;
      h+=`<p style="margin:4px 0 0;font-size:12px;color:#4b5563;line-height:1.5">${r.whyMatters?.slice(0,200)||r.note}</p>`;
      h+=`</div>`;
    });
    h+=`<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">`;
    // Due this quarter
    if(due.length){
      h+=`<h2 style="font-size:17px;color:#C77700;margin:0 0 12px">⏰ Due This Quarter</h2>`;
      due.forEach(r=>{const next=r.timeline?.map(m=>({...m,dt:new Date(m.date)})).filter(m=>m.dt>=now&&m.dt<=q).sort((a,b)=>a.dt-b.dt)[0];const days=next?Math.floor((next.dt-now)/864e5):null;
        h+=`<p style="margin:4px 0;font-size:13px">${days!==null?`<span style="color:${days<=30?"#dc2626":"#C77700"};font-weight:700">${days}d</span> `:""}${r.title}${next?` → <strong>${next.label}</strong>`:""}</p>`});
      h+=`<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">`
    }
    // Disputed — with who's disputing
    if(disputed.length){
      h+=`<h2 style="font-size:17px;color:#C77700;margin:0 0 12px">⚠️ Disputed / Watch</h2>`;
      disputed.forEach(x=>{
        h+=`<div style="margin-bottom:10px;padding:8px 12px;border-left:3px solid #FF9500;background:#fff8f1;border-radius:4px">`;
        h+=`<p style="margin:0;font-size:13px;font-weight:600;color:#92400e">${x.r.title}</p>`;
        h+=`<p style="margin:4px 0;font-size:12px;color:#92400e;line-height:1.5">${x.note.slice(0,200)}</p>`;
        if(x.sources?.length)h+=`<p style="margin:2px 0;font-size:12px;color:#FF9500"><strong>Disputed by:</strong> ${x.sources.join(", ")}</p>`;
        h+=`</div>`;
      });
    }
    h+=`</div><div style="padding:16px 28px;font-size:12px;color:#9ca3af;background:#f9fafb;border-radius:0 0 8px 8px">Generated by Freight Sustainability Intelligence · ${today}</div></div>`;
    return h;
  },[res,today,urgencyScore]);

  // Slack markdown — flattened detail
  const toSlack=useCallback((items,title)=>{
    let s=`*🌍 ${title||"Freight Sustainability Intelligence"}*\n_${today} · ${items.length} items_\n\n`;
    items.forEach(r=>{
      const modes=r.modes?.map(m=>({air:"✈️",road:"🚛",ocean:"🚢"}[m]||"")).join("")||"";
      const tp=TOPICS.find(t=>t.id===r.topic);
      const jur=JURS.find(j=>j.id===r.jur)?.l||"";
      const sc=scoreResource(r);const disp=SEED_DISPUTES[r.id];const changes=CHANGE_LOG[r.id];
      s+=`${modes} ${tp?.i||""} *${r.title}* \`${r.priority}\` _${jur}_\n`;
      if(r.whatIsIt)s+=`>${r.whatIsIt.slice(0,200)}\n`;
      if(r.whyMatters)s+=`>*Why:* ${r.whyMatters.slice(0,200)}\n`;
      if(changes?.length){s+=`>*⚡ Changed:*\n`;changes.forEach(ch=>{s+=`>  _${ch.field}:_ ~~${ch.prev.slice(0,60)}~~ → ${ch.now.slice(0,80)}\n`})}
      if(r.keyData?.length)s+=r.keyData.slice(0,4).map(dd=>`>• ${dd}`).join("\n")+"\n";
      s+=`>Impact: Cost ${sc.cost}/3 · Compliance ${sc.compliance}/3 · Client ${sc.client}/3 · Ops ${sc.operational}/3\n`;
      if(disp?.active){s+=`>⚠️ *Disputed:* ${disp.note.slice(0,150)}\n`;if(disp.sources?.length)s+=`>  _Disputed by: ${disp.sources.join(", ")}_\n`}
      if(r.timeline?.length){const now=new Date();const next=r.timeline.map(m=>({...m,dt:new Date(m.date)})).filter(m=>m.dt>now).sort((a,b)=>a.dt-b.dt)[0];if(next){const days=Math.floor((next.dt-now)/864e5);s+=`>⏱ Next: *${next.label}* — ${next.date} (${days}d)\n`}}
      if(r.url)s+=`>${r.url}\n`;
      s+=`\n`;
    });
    s+=`_Generated ${today}_`;
    return s;
  },[today,scoreResource]);

  const toBriefingSlack=useCallback(()=>{
    const critical=[...res].sort((a,b)=>urgencyScore(b)-urgencyScore(a)).slice(0,5);
    const newR=res.filter(r=>r.added===AUDIT_DATE&&!r.modified);
    const modR=res.filter(r=>r.modified===AUDIT_DATE);
    const now=new Date(),q=new Date(now.getTime()+90*864e5);
    const due=res.filter(r=>r.timeline?.some(m=>{const d=new Date(m.date);return d>=now&&d<=q})).slice(0,5);
    const disputed=Object.entries(SEED_DISPUTES).filter(([,d])=>d.active).map(([id,d])=>({...d,r:res.find(x=>x.id===id)})).filter(x=>x.r);
    let s=`*🌍 Weekly Sustainability Briefing — ${today}*\n_${res.length} resources tracked_\n\n`;
    if(newR.length){s+=`*🆕 New This Week*\n`;newR.forEach(r=>{const tp=TOPICS.find(t=>t.id===r.topic);s+=`• ${tp?.i||""} *${r.title}* \`${r.priority}\`\n  ${r.whyMatters?.slice(0,150)||r.note}\n  ${r.url||""}\n`});s+=`\n`}
    if(modR.length){s+=`*🔄 Updated*\n`;modR.forEach(r=>{const changes=CHANGE_LOG[r.id];s+=`• *${r.title}*\n`;if(changes?.length)changes.forEach(ch=>{s+=`  _${ch.field}:_ ${ch.now.slice(0,100)}\n`});});s+=`\n`}
    s+=`*🔴 Top Urgency*\n`;critical.forEach(r=>{const tp=TOPICS.find(t=>t.id===r.topic);s+=`• ${tp?.i||""} \`${r.priority}\` *${r.title}*\n  ${r.whyMatters?.slice(0,120)||r.note}\n`});s+=`\n`;
    if(due.length){s+=`*⏰ Due This Quarter*\n`;due.forEach(r=>{const next=r.timeline?.map(m=>({...m,dt:new Date(m.date)})).filter(m=>m.dt>=now&&m.dt<=q).sort((a,b)=>a.dt-b.dt)[0];const days=next?Math.floor((next.dt-now)/864e5):null;s+=`• ${days!==null?`*${days}d* `:``}${r.title}${next?` → ${next.label}`:``}\n`});s+=`\n`}
    if(disputed.length){s+=`*⚠️ Disputed / Watch*\n`;disputed.forEach(x=>{s+=`• *${x.r.title}:* ${x.note.slice(0,120)}\n`;if(x.sources?.length)s+=`  _Disputed by: ${x.sources.join(", ")}_\n`});s+=`\n`}
    s+=`_Generated ${today}_`;
    return s;
  },[res,today,urgencyScore]);

  // ═══════════════════════════════════════════════════
  // DRAG-AND-DROP REORDER
  // ═══════════════════════════════════════════════════
  const onDragS=useCallback((e,idx)=>{setDragIdx(idx);e.dataTransfer.effectAllowed="move"},[]);
  const onDragO=useCallback((e,idx)=>{e.preventDefault();setDragOver(idx)},[]);
  const reorderList=useCallback((list,from,to)=>{const n=[...list];const[item]=n.splice(from,1);n.splice(to,0,item);return n},[]);

  // Reorder export selection
  const onDropXp=useCallback((e,toIdx)=>{e.preventDefault();if(dragIdx===null)return;setXpSel(prev=>reorderList(prev,dragIdx,toIdx));setDragIdx(null);setDragOver(null)},[dragIdx,reorderList]);

  // Toggle selection
  const toggleSel=useCallback((id)=>{setXpSel(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id])},[]);
  const selAll=useCallback((ids)=>{setXpSel(ids)},[]);

  // Share single resource
  // ── Share with detail levels ──
  const [sharePreview,setSharePreview]=useState(null); // {id, fmt, level}
  const SHARE_LEVELS={
    summary:{l:"Summary",desc:"Title, priority, 1-line why, source link"},
    standard:{l:"Standard",desc:"What it is, why it matters, impact, timeline, source"},
    full:{l:"Full Detail",desc:"Everything including key data, disputes, what changed"},
  };

  const buildShareHTML=(r,level)=>{
    const tc2={emissions:"#5856D6",fuels:"#A2845E",transport:"#34C759",reporting:"#AF52DE",packaging:"#FF2D55",corridors:"#007AFF",research:"#5AC8FA"}[r.topic]||"#6b7280";
    const pri=c=>({CRITICAL:"#dc2626",HIGH:"#C77700",MODERATE:"#6b7280",LOW:"#9ca3af"}[c]||"#6b7280");
    const modes=r.modes?.map(m=>({air:"✈️",road:"🚛",ocean:"🚢"}[m]||"")).join(" ")||"";
    const tp=TOPICS.find(t=>t.id===r.topic);const jur=JURS.find(j=>j.id===r.jur)?.l||"";
    let h=`<div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;color:#1f2937">`;
    h+=`<div style="background:#1c1c1e;color:#ffffff;padding:24px 28px;border-radius:8px 8px 0 0"><h1 style="margin:0;font-size:20px">🌍 ${r.title}</h1><p style="margin:6px 0 0;font-size:13px;color:#9ca3af">${today} · Freight Sustainability Intelligence</p></div>`;
    h+=`<div style="padding:18px 28px;border-left:4px solid ${tc2}">`;
    h+=`<p style="margin:0 0 8px;font-size:14px">${modes} ${tp?`${tp.i} ${tp.l}`:""} · ${jur} · <span style="color:${pri(r.priority)};font-weight:700">${r.priority}</span></p>`;
    // Summary level: just why it matters
    if(r.whyMatters)h+=`<div style="margin:8px 0;padding:10px 14px;background:#f0fdf4;border-left:3px solid #059669;border-radius:4px"><p style="margin:0;font-size:13px;color:#059669;font-weight:600">WHY THIS MATTERS TO YOUR FREIGHT</p><p style="margin:6px 0 0;font-size:14px;color:#374151;line-height:1.7">${r.whyMatters}</p></div>`;
    if(r.url)h+=`<p style="margin:6px 0;font-size:13px"><a href="${r.url}" style="color:#2563eb">📄 Source document ↗</a></p>`;
    if(level==="summary"){h+=`</div></div>`;return h}
    // Standard level: add what it is, impact, timeline
    if(r.whatIsIt)h+=`<div style="margin:12px 0"><p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#111827">WHAT THIS IS</p><p style="margin:0;font-size:14px;color:#374151;line-height:1.7">${r.whatIsIt}</p></div>`;
    const sc=scoreResource(r);
    h+=`<div style="margin:12px 0;padding:10px 14px;background:#f9fafb;border-radius:6px"><p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#111827">IMPACT ASSESSMENT</p>`;
    h+=`<table style="width:100%;font-size:13px;color:#374151;border-collapse:collapse">`;
    [{d:"cost",l:"Cost Impact"},{d:"compliance",l:"Compliance Obligation"},{d:"client",l:"Client-Facing"},{d:"operational",l:"Operational"}].forEach(x=>{
      const v=sc[x.d]||0;const lbl=v===0?"None":v===1?"Low":v===2?"Moderate":"High";
      h+=`<tr><td style="padding:4px 0;font-weight:600">${x.l}</td><td style="padding:4px 8px;text-align:center;font-weight:700">${v}/3</td><td style="padding:4px 0;color:#6b7280">${lbl}</td></tr>`;
    });
    h+=`</table><p style="margin:6px 0 0;font-size:13px;color:#6b7280">Urgency score: <strong>${urgencyScore(r)}</strong></p></div>`;
    if(r.timeline?.length){
      h+=`<div style="margin:12px 0"><p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#111827">TIMELINE</p>`;
      r.timeline.forEach(m=>{const past=new Date(m.date)<=new Date();h+=`<p style="margin:3px 0;font-size:13px;color:${past?"#059669":"#374151"}">${past?"✓":"○"} <strong>${m.date}</strong> — ${m.label}</p>`});
      h+=`</div>`;
    }
    if(level==="standard"){h+=`</div></div>`;return h}
    // Full level: add key data, disputes, what changed
    const changes=CHANGE_LOG[r.id];const disp=SEED_DISPUTES[r.id];
    if(changes?.length){
      h+=`<div style="margin:12px 0;padding:10px 14px;background:#fff7ed;border-left:3px solid #C77700;border-radius:4px"><p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#C77700">⚡ WHAT CHANGED — ${r.modified||r.added}</p>`;
      changes.forEach(ch=>{
        h+=`<div style="margin-bottom:8px"><p style="margin:0;font-size:13px;font-weight:700;color:#374151">${ch.field}</p>`;
        h+=`<p style="margin:3px 0;font-size:13px;color:#9ca3af;text-decoration:line-through">Was: ${ch.prev}</p>`;
        h+=`<p style="margin:3px 0;font-size:13px;color:#111827;font-weight:500">Now: ${ch.now}</p>`;
        h+=`<p style="margin:3px 0;font-size:12px;color:#C77700">Impact: ${ch.impact}</p></div>`;
      });
      h+=`</div>`;
    }
    if(r.keyData?.length)h+=`<div style="margin:12px 0;padding:10px 14px;background:#f9fafb;border-radius:6px"><p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#111827">KEY DATA</p>${r.keyData.map(dd=>`<p style="margin:3px 0;font-size:13px;color:#374151;line-height:1.6">• ${dd}</p>`).join("")}</div>`;
    if(disp?.active){
      h+=`<div style="margin:12px 0;padding:10px 14px;background:#fff8f1;border-left:3px solid #FF9500;border-radius:4px">`;
      h+=`<p style="margin:0 0 4px;font-size:14px;color:#FF9500;font-weight:700">⚠ DISPUTED</p>`;
      h+=`<p style="margin:0 0 4px;font-size:13px;color:#92400e;line-height:1.6">${disp.note}</p>`;
      if(disp.sources?.length)h+=`<p style="margin:0;font-size:13px;color:#FF9500"><strong>Disputed by:</strong> ${disp.sources.join(", ")}</p>`;
      h+=`</div>`;
    }
    h+=`</div></div>`;return h;
  };

  const buildShareSlack=(r,level)=>{
    const modes=r.modes?.map(m=>({air:"✈️",road:"🚛",ocean:"🚢"}[m]||"")).join("")||"";
    const tp=TOPICS.find(t=>t.id===r.topic);const jur=JURS.find(j=>j.id===r.jur)?.l||"";
    const sc=scoreResource(r);const disp=SEED_DISPUTES[r.id];const changes=CHANGE_LOG[r.id];
    let s=`${modes} ${tp?.i||""} *${r.title}* \`${r.priority}\` _${jur}_\n`;
    if(r.whyMatters)s+=`>*Why this matters:* ${r.whyMatters}\n`;
    if(r.url)s+=`>${r.url}\n`;
    if(level==="summary"){s+=`_${today}_\n`;return s}
    if(r.whatIsIt)s+=`>*What this is:* ${r.whatIsIt.slice(0,250)}\n`;
    s+=`>*Impact:* Cost ${sc.cost}/3 · Compliance ${sc.compliance}/3 · Client ${sc.client}/3 · Ops ${sc.operational}/3 · Urgency ${urgencyScore(r)}\n`;
    if(r.timeline?.length){const now=new Date();const next=r.timeline.map(m=>({...m,dt:new Date(m.date)})).filter(m=>m.dt>now).sort((a,b)=>a.dt-b.dt)[0];if(next){const days=Math.floor((next.dt-now)/864e5);s+=`>⏱ Next: *${next.label}* — ${next.date} (${days}d)\n`}}
    if(level==="standard"){s+=`_${today}_\n`;return s}
    if(changes?.length){s+=`>*⚡ What changed:*\n`;changes.forEach(ch=>{s+=`>  _${ch.field}:_ ~~${ch.prev.slice(0,80)}~~ → ${ch.now.slice(0,100)}\n`})}
    if(r.keyData?.length)s+=r.keyData.slice(0,5).map(dd=>`>• ${dd}`).join("\n")+"\n";
    if(disp?.active){s+=`>⚠️ *Disputed:* ${disp.note.slice(0,200)}\n`;if(disp.sources?.length)s+=`>  _Disputed by: ${disp.sources.join(", ")}_\n`}
    s+=`_${today}_\n`;return s;
  };

  const shareOne=useCallback((r,fmt,level="standard")=>{
    const safeName=r.title.replace(/[^a-zA-Z0-9 ]/g,"").replace(/\s+/g,"_");
    if(fmt==="email"||fmt==="pdf"){downloadFile(buildShareHTML(r,level),`${safeName}.html`)}
    else if(fmt==="slack"){downloadFile(buildShareSlack(r,level),`${safeName}_slack.txt`,"text/plain")}
  },[downloadFile]);

  // ── Timeline Component ──
  const TC={emissions:"#5856D6",fuels:"#A2845E",transport:"#34C759",reporting:"#AF52DE",packaging:"#FF2D55",corridors:"#007AFF",research:"#5AC8FA"};
  const TL=({items,color,url})=>{if(!items?.length)return null;const now=new Date();const c=color||"#34C759";return(
    <div style={{position:"relative",padding:"16px 4px 8px",background:"#ffffff",borderRadius:8,marginTop:4,border:"1px solid rgba(60,60,67,0.08)"}}>
      <div style={{position:"absolute",top:22,left:20,right:20,height:3,background:"#d1d1d6",borderRadius:2}}/>
      <div style={{display:"flex",justifyContent:"space-between",position:"relative"}}>
        {items.slice(0,5).map((m,i)=>{const past=new Date(m.date)<=now;const active=!past&&(i===0||new Date(items[Math.max(0,i-1)].date)<=now);return(
          <div key={i} onClick={url?()=>window.open(url,"_blank"):undefined} style={{display:"flex",flexDirection:"column",alignItems:"center",flex:1,cursor:url?"pointer":"default"}} title={url?`Source: ${url}`:""}>
            <div style={{width:active?14:12,height:active?14:12,borderRadius:"50%",background:past?c:active?c+"88":"#aeaeb2",border:`2px solid ${active?"#000000":"#ffffff"}`,zIndex:1,boxShadow:active?`0 0 8px ${c}66`:"none"}}/>
            <span style={{fontSize:13,color:past?c:active?"#000000":"#636366",marginTop:6,fontFamily:"monospace",fontWeight:past||active?700:400}}>{m.date}</span>
            <span style={{fontSize:12,color:past?"#48484a":"#8e8e93",textAlign:"center",maxWidth:80,marginTop:2,lineHeight:1.3}}>{m.label}</span>
            {url&&<span style={{fontSize:11,color:"#007AFF",marginTop:1}}>tap for source</span>}
          </div>)})}
      </div>
    </div>)};

  // ── Expanded Detail Panel ──
  const Detail=({r})=>{
    const sc=scoreResource(r);const{refs,refBy}=getXrefs(r.id);const v=getVerification(r.id);const disp=SEED_DISPUTES[r.id];const lineage=getLineage(r.id);
    const [showImpact,setShowImpact]=useState(false);
    return(
    <div style={{padding:"14px 0 8px",borderTop:"1px solid #e5e5ea"}}>
      {/* Verification + meta badges — all clickable */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
        {v.count>0?<Tag label={v.status==="verified"?`✓ Verified · ${v.count} cross-refs`:`⚠ ${v.count} cross-ref${v.count!==1?"s":""}`} color={v.status==="verified"?"#34C759":"#FF9500"} bg={v.status==="verified"?"#34C75910":"#FF950010"} border={`1px solid ${v.status==="verified"?"#34C75925":"#FF950025"}`} onClick={()=>{const el=document.getElementById(`xref-${r.id}`);el?.scrollIntoView({behavior:"smooth"})}}/>
        :<Tag label="No cross-refs" color="#aeaeb2"/>}
        <Tag label={r.type}/>
        <Tag label={`Added ${r.added}${r.modified?` · Updated ${r.modified}`:""}`}/>
      </div>

      {/* WHAT CHANGED — shows diff for modified resources, or NEW for recently added */}
      {(r.modified===AUDIT_DATE||(!r.modified&&r.added===AUDIT_DATE))&&<div style={{marginBottom:14,padding:12,background:r.modified?"#FF950008":"#34C75908",borderRadius:10,border:`1px solid ${r.modified?"#FF950020":"#34C75920"}`}}>
        <div style={{fontSize:14,color:r.modified?"#FF9500":"#34C759",textTransform:"uppercase",letterSpacing:1,marginBottom:8,fontWeight:700,paddingBottom:4,borderBottom:`1px solid ${r.modified?"#FF950015":"#34C75915"}`}}>
          {r.modified?`⚡ What changed — ${r.modified}`:`✦ New entry — ${r.added}`}
        </div>
        {r.modified&&CHANGE_LOG[r.id]?CHANGE_LOG[r.id].map((ch,ci)=>(
          <div key={ci} style={{marginBottom:ci<CHANGE_LOG[r.id].length-1?10:0,paddingBottom:ci<CHANGE_LOG[r.id].length-1?10:0,borderBottom:ci<CHANGE_LOG[r.id].length-1?"1px solid rgba(60,60,67,0.06)":"none"}}>
            <div style={{fontSize:14,fontWeight:700,color:"#48484a",marginBottom:4}}>{ch.field}</div>
            <div style={{display:"flex",gap:4,alignItems:"flex-start",marginBottom:2}}>
              <span style={{fontSize:12,color:"#FF3B30",fontWeight:700,flexShrink:0,marginTop:1}}>PREV</span>
              <span style={{fontSize:14,color:"#8e8e93",lineHeight:1.5,textDecoration:"line-through"}}>{ch.prev}</span>
            </div>
            <div style={{display:"flex",gap:4,alignItems:"flex-start",marginBottom:2}}>
              <span style={{fontSize:12,color:"#34C759",fontWeight:700,flexShrink:0,marginTop:1}}>NOW</span>
              <span style={{fontSize:14,color:"#1c1c1e",lineHeight:1.5,fontWeight:500}}>{ch.now}</span>
            </div>
            <div style={{fontSize:14,color:"#FF9500",marginTop:2}}>Impact: {ch.impact}</div>
          </div>
        )):<div style={{fontSize:14,color:r.modified?"#C77700":"#248A3D",lineHeight:1.6}}>
          {r.modified?"Data corrections applied — review all sections for updated information.":"First appearance in this intelligence dashboard. Review all sections for baseline context."}
        </div>}
      </div>}

      {r.whatIsIt&&<div style={{marginBottom:14}}>
        <div style={{fontSize:15,color:"#1c1c1e",textTransform:"uppercase",letterSpacing:1.2,marginBottom:8,fontWeight:800,paddingBottom:4,borderBottom:"1px solid rgba(60,60,67,0.12)"}}>What this is</div>
        <p style={{margin:0,fontSize:15,color:"#48484a",lineHeight:1.7}}>{r.whatIsIt}</p>
      </div>}

      {r.whyMatters&&<div style={{marginBottom:14}}>
        <div style={{fontSize:15,color:"#34C759",textTransform:"uppercase",letterSpacing:1.2,marginBottom:8,fontWeight:800,paddingBottom:4,borderBottom:"1px solid #34C75920"}}>Why it matters</div>
        <p style={{margin:0,fontSize:15,color:"#3c3c43",lineHeight:1.7}}>{r.whyMatters}</p>
      </div>}

      {r.keyData?.length>0&&<div style={{marginBottom:14}}>
        <div style={{fontSize:15,color:"#1c1c1e",textTransform:"uppercase",letterSpacing:1.2,marginBottom:8,fontWeight:800,paddingBottom:4,borderBottom:"1px solid rgba(60,60,67,0.12)"}}>Key data</div>
        {r.keyData.map((d,i)=><div key={i} style={{fontSize:14,color:"#636366",lineHeight:1.7,paddingLeft:12,borderLeft:"2px solid #d1d1d6"}}>{d}</div>)}
      </div>}

      {/* Impact scores — with scale legend */}
      <div style={{marginBottom:14}}>
        <div onClick={()=>setShowImpact(!showImpact)} style={{fontSize:13,color:"#aeaeb2",textTransform:"uppercase",letterSpacing:1,marginBottom:2,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
          Impact — Urgency: <span style={{color:"#FF9500",fontWeight:700}}>{urgencyScore(r)}</span>
          <span style={{fontSize:12,color:"#007AFF"}}>{showImpact?"Hide reasoning ▲":"Why this score? ▼"}</span>
        </div>
        <div style={{fontSize:12,color:"#aeaeb2",marginBottom:6}}>Scale: 0 = none · 1 = low · 2 = moderate · 3 = high</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
          {Object.keys(IMPACT_DIMS).map(d=>{const val=sc[d]||0;const lbl=val===0?"None":val===1?"Low":val===2?"Moderate":"High";return(<div key={d} style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:14,minWidth:16}}>{IMPACT_DIMS[d]}</span><span style={{fontSize:13,color:"#8e8e93",minWidth:72}}>{DIM_LABELS[d]}</span>
            <div style={{flex:1,height:6,background:"#e5e5ea",borderRadius:3,overflow:"hidden"}}><div style={{width:`${(val/3)*100}%`,height:"100%",background:DIM_COLORS[d],borderRadius:3}}/></div>
            <span style={{fontSize:13,color:DIM_COLORS[d],fontWeight:600,minWidth:36}}>{val}/3 {lbl}</span>
          </div>)})}
        </div>
        {showImpact&&<div style={{marginTop:8,padding:10,background:"#f2f2f7",borderRadius:8,fontSize:14,color:"#636366",lineHeight:1.6}}>
          <div style={{fontWeight:600,color:"#48484a",marginBottom:4}}>Score Breakdown</div>
          <div><strong>Priority weight:</strong> {r.priority} → {({CRITICAL:4,HIGH:3,MODERATE:2,LOW:1})[r.priority]||1}x multiplier</div>
          <div><strong>Jurisdiction:</strong> {JURS.find(j=>j.id===r.jur)?.l} → {({"eu":"1.0","global":"1.0","us":"0.8","uk":"0.7","asia":"0.6","hk":"0.6","latam":"0.5","meaf":"0.5"})[r.jur]||"0.5"} weight (higher = more relevant to your operations)</div>
          <div><strong>Time proximity:</strong> {r.timeline?.length?`${r.timeline.filter(m=>new Date(m.date)>new Date()).length} future milestones — closer deadlines increase urgency`:"No timeline milestones"}</div>
          <div><strong>Cost {sc.cost}/3:</strong> {sc.cost>=2?"Directly affects freight pricing":"Indirect or no pricing impact"}</div>
          <div><strong>Compliance {sc.compliance}/3:</strong> {sc.compliance>=2?"Mandatory legal obligation":"Advisory or voluntary"}</div>
          <div><strong>Client {sc.client}/3:</strong> {sc.client>=2?"Clients will ask or require this":"Low client visibility"}</div>
          <div><strong>Operational {sc.operational}/3:</strong> {sc.operational>=2?"Affects routing, fleet, packaging, docs":"Minimal operational impact"}</div>
          <div style={{marginTop:6,fontSize:13,color:"#8e8e93"}}>Formula: (cost + compliance + client + operational) × priority × time proximity × jurisdiction</div>
        </div>}
      </div>

      {/* Dispute */}
      {disp?.active&&<div style={{marginBottom:14,padding:12,background:"#FF950008",borderRadius:10,border:"1px solid #FF950022"}}>
        <div style={{fontSize:15,color:"#FF9500",fontWeight:800,letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>⚠ Disputed</div>
        <p style={{margin:"0 0 8px",fontSize:14,color:"#C77700",lineHeight:1.7}}>{disp.note}</p>
        {disp.sources?.length>0&&<div style={{marginBottom:4}}>
          <div style={{fontSize:13,color:"#FF9500",fontWeight:600,marginBottom:4}}>Sources disputing:</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {disp.sources.map((s,i)=><span key={i} onClick={e=>{e.stopPropagation();navTo({disputed:true})}} style={{fontSize:13,padding:"4px 10px",borderRadius:6,background:"#FF950010",color:"#C77700",border:"1px solid #FF950025",cursor:"pointer",fontWeight:600}}>{s} ↗</span>)}
          </div>
        </div>}
      </div>}

      {/* Timeline */}
      {r.timeline?.length>0&&<div style={{marginBottom:14}}>
        <div style={{fontSize:15,color:"#1c1c1e",textTransform:"uppercase",letterSpacing:1.2,marginBottom:8,fontWeight:800,paddingBottom:4,borderBottom:"1px solid rgba(60,60,67,0.12)"}}>Timeline</div>
        <TL items={r.timeline} color={TC[r.topic]} url={r.url}/>
      </div>}

      {/* Lineage — clickable */}
      {lineage.length>0&&<div style={{marginBottom:14,padding:12,background:"#f2f2f7",borderRadius:8,border:"1px solid rgba(60,60,67,0.12)"}}>
        <div style={{fontSize:15,color:"#1c1c1e",textTransform:"uppercase",letterSpacing:1.2,marginBottom:8,fontWeight:800,paddingBottom:4,borderBottom:"1px solid rgba(60,60,67,0.12)"}}>Regulatory lineage</div>
        {lineage.map((l,i)=><div key={i} style={{fontSize:14,color:"#636366",lineHeight:1.6,paddingLeft:12,borderLeft:`2px solid ${l.type==="superseded"?"#8e8e93":"#34C759"}`,cursor:"pointer"}} onClick={e=>{e.stopPropagation();navToId(l.newId)}}>
          <span style={{color:l.type==="superseded"?"#8e8e93":"#34C759"}}>{l.date}:</span> {l.old} → <span style={{color:"#007AFF",textDecoration:"underline"}}>{l.new_}</span>
        </div>)}
      </div>}

      {/* Mode + Jurisdiction + Topic tags — ALL clickable */}
      <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:14}}>
        {r.modes?.map(m=>{const md=MODES.find(x=>x.id===m);return md?<Tag key={m} label={`${md.i} ${md.l}`} color="#48484a" onClick={()=>navTo({mode:m})}/>:null})}
        <Tag label={JURS.find(j=>j.id===r.jur)?.l||r.jur} onClick={()=>navTo({jur:r.jur})}/>
        <Tag label={tpL(r.topic)} color={TC[r.topic]} bg={`${TC[r.topic]}10`} border={`1px solid ${TC[r.topic]}25`} onClick={()=>navTo({topic:r.topic})}/>
      </div>

      {/* Cross-references — fully clickable */}
      {(refs.length>0||refBy.length>0)&&<div id={`xref-${r.id}`} style={{marginBottom:14,padding:12,background:"#f2f2f7",borderRadius:8,border:"1px solid rgba(60,60,67,0.12)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <div style={{fontSize:13,color:"#aeaeb2",textTransform:"uppercase",letterSpacing:1,fontWeight:600}}>Cross-References ({refs.length+refBy.length})</div>
          <span onClick={e=>{e.stopPropagation();navTo({xrefs:r.id})}} style={{fontSize:13,color:"#007AFF",cursor:"pointer",fontWeight:600}}>View as section →</span>
        </div>
        {refBy.map(id=>{const rx=res.find(x=>x.id===id);if(!rx)return null;return(
          <div key={id} style={{padding:"8px 10px",marginBottom:4,background:"#ffffff",borderRadius:8,border:"1px solid rgba(60,60,67,0.08)"}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
              <span style={{fontSize:12,color:"#34C759",fontWeight:700,flexShrink:0}}>← REFERENCED BY</span>
              <span onClick={e=>{e.stopPropagation();navToId(id)}} style={{fontSize:14,color:"#007AFF",cursor:"pointer",fontWeight:600,flex:1}}>{rx.title}</span>
              <Tag label={rx.priority} color={PC[rx.priority]} bg={`${PC[rx.priority]}10`}/>
            </div>
            <div style={{fontSize:14,color:"#636366",marginBottom:2}}>{rx.whyMatters?.slice(0,120)||rx.note}</div>
            {rx.url&&<a href={rx.url} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{fontSize:13,color:"#007AFF"}}>📄 {rx.url}</a>}
          </div>)})}
        {refs.map(id=>{const rx=res.find(x=>x.id===id);if(!rx)return null;return(
          <div key={id} style={{padding:"8px 10px",marginBottom:4,background:"#ffffff",borderRadius:8,border:"1px solid rgba(60,60,67,0.08)"}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
              <span style={{fontSize:12,color:"#636366",fontWeight:700,flexShrink:0}}>→ REFERENCES</span>
              <span onClick={e=>{e.stopPropagation();navToId(id)}} style={{fontSize:14,color:"#007AFF",cursor:"pointer",fontWeight:600,flex:1}}>{rx.title}</span>
              <Tag label={rx.priority} color={PC[rx.priority]} bg={`${PC[rx.priority]}10`}/>
            </div>
            <div style={{fontSize:14,color:"#636366",marginBottom:2}}>{rx.whyMatters?.slice(0,120)||rx.note}</div>
            {rx.url&&<a href={rx.url} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{fontSize:13,color:"#007AFF"}}>📄 {rx.url}</a>}
          </div>)})}
      </div>}

      {/* Source + Citation */}
      {r.url&&<div style={{display:"flex",flexDirection:"column",gap:6}}>
        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
          <span style={{fontSize:13,color:"#aeaeb2",textTransform:"uppercase",fontWeight:600}}>Source</span>
          <a href={r.url} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{fontSize:14,color:"#007AFF",wordBreak:"break-all"}}>{r.url}</a>
          <button onClick={e=>{e.stopPropagation();cp(r.url,`u-${r.id}`)}} style={{fontSize:13,background:"none",border:"1px solid #d1d1d6",color:cpId===`u-${r.id}`?"#34C759":"#8e8e93",borderRadius:3,cursor:"pointer",padding:"1px 5px"}}>{cpId===`u-${r.id}`?"Copied!":"📋"}</button>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
          <span style={{fontSize:13,color:"#aeaeb2",textTransform:"uppercase",fontWeight:600}}>Cite</span>
          <span style={{fontSize:13,color:"#aeaeb2",fontStyle:"italic"}}>{r.title} — {(() => { try { return new URL(r.url).hostname } catch(e) { return '' } })()}. {today}.</span>
          <button onClick={e=>{e.stopPropagation();cp(`${r.title}. Accessed ${today}. ${r.url}`,`c-${r.id}`)}} style={{fontSize:13,background:"none",border:"1px solid #d1d1d6",color:cpId===`c-${r.id}`?"#34C759":"#8e8e93",borderRadius:3,cursor:"pointer",padding:"1px 5px"}}>{cpId===`c-${r.id}`?"Copied!":"📋"}</button>
        </div>
      </div>}

      {/* Archive action — available everywhere */}
      <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid #e5e5ea",display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
        {arcTgt===r.id?<>
          <select value={arcF.reason} onChange={e=>setArcF({...arcF,reason:e.target.value})} style={{padding:"4px 8px",fontSize:14,background:"#ffffff",border:"1px solid #d1d1d6",color:"#48484a",borderRadius:4}}>{["Superseded","Expired","Repealed","Consolidated","Manual"].map(o=><option key={o}>{o}</option>)}</select>
          <input value={arcF.note} onChange={e=>setArcF({...arcF,note:e.target.value.slice(0,50)})} placeholder="Note" maxLength={50} style={{padding:"4px 8px",fontSize:14,background:"#ffffff",border:"1px solid #d1d1d6",color:"#48484a",borderRadius:4,width:140}}/>
          <button onClick={()=>archR(r.id)} style={{padding:"4px 12px",fontSize:14,fontWeight:600,background:"#FF9500",border:"none",color:"#ffffff",borderRadius:4,cursor:"pointer"}}>Archive</button>
          <button onClick={()=>setArcTgt(null)} style={{padding:"4px 8px",fontSize:14,background:"none",border:"1px solid #d1d1d6",color:"#8e8e93",borderRadius:4,cursor:"pointer"}}>✕</button>
        </>:<button onClick={e=>{e.stopPropagation();setArcTgt(r.id)}} style={{padding:"4px 12px",fontSize:14,background:"none",border:"1px solid #d1d1d6",color:"#8e8e93",borderRadius:4,cursor:"pointer"}}>🗄️ Archive</button>}
      </div>
    </div>)};

  // ── Clickable tag helper ──
  const Tag=({label,color,bg,border,onClick})=>(
    <span onClick={e=>{e.stopPropagation();onClick?.()}} style={{fontSize:12,padding:"2px 7px",borderRadius:4,background:bg||"#f2f2f7",color:color||"#636366",border:border||"1px solid rgba(60,60,67,0.12)",cursor:onClick?"pointer":"default",fontWeight:500,transition:"opacity 0.15s",WebkitTapHighlightColor:"transparent"}}>{label}</span>
  );
  const ModeTag=({m})=>{const md=MODES.find(x=>x.id===m);return md?<Tag label={`${md.i} ${md.l}`} color="#48484a" bg="#f2f2f7" onClick={()=>navTo({mode:m})}/>:null};

  // ── Resource Row (card style — all tags clickable) ──
  const Row=({r,badge,idx,dragList,onReorder})=>{const open=exp===r.id;const tc=TC[r.topic]||"#8e8e93";const disp=SEED_DISPUTES[r.id];const sel=xpSel.includes(r.id);const sharing=shareId===r.id;
    const draggable=!!onReorder;
    return(
    <div id={`res-${r.id}`} draggable={draggable} onDragStart={draggable?e=>onDragS(e,idx):undefined} onDragOver={draggable?e=>onDragO(e,idx):undefined} onDrop={draggable?e=>{e.preventDefault();if(dragIdx!==null&&onReorder)onReorder(dragIdx,idx);setDragIdx(null);setDragOver(null)}:undefined}
      style={{marginBottom:8,background:dragOver===idx&&draggable?"#e8e8ed":"#ffffff",borderRadius:12,border:`1px solid ${sel?"#007AFF33":"rgba(60,60,67,0.12)"}`,borderLeft:`3px solid ${tc}`,overflow:"hidden",opacity:dragIdx===idx?0.4:1,transition:"opacity 0.15s",boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,padding:"12px 14px"}}>
        {draggable&&<span style={{cursor:"grab",fontSize:15,color:"#aeaeb2",flexShrink:0,userSelect:"none"}}>⠿</span>}
        {xpOpen&&<div onClick={e=>{e.stopPropagation();toggleSel(r.id)}} style={{width:20,height:20,borderRadius:4,border:`2px solid ${sel?"#007AFF":"#aeaeb2"}`,background:sel?"#007AFF":"transparent",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0}}>
          {sel&&<span style={{color:"#fff",fontSize:14,fontWeight:700}}>✓</span>}
        </div>}
        {badge&&<span style={{fontSize:11,padding:"2px 6px",borderRadius:4,fontWeight:700,flexShrink:0,letterSpacing:0.5,background:badge==="NEW"?"#34C75915":"#FF950010",color:badge==="NEW"?"#34C759":"#FF9500",border:`1px solid ${badge==="NEW"?"#248A3D33":"#FF950033"}`}}>{badge}</span>}
        {/* Mode tags — clickable */}
        <div style={{display:"flex",gap:3,flexShrink:0}}>{r.modes?.map(m=><ModeTag key={m} m={m}/>)}</div>
        <div onClick={()=>expandAndScroll(r.id)} style={{flex:1,minWidth:0,cursor:"pointer"}}>
          <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
            <span style={{fontSize:15,fontWeight:600,color:"#1c1c1e"}}>{r.title}</span>
            {disp?.active&&<span onClick={e=>{e.stopPropagation();setExp(r.id)}} style={{fontSize:12,color:"#FF9500",cursor:"pointer"}} title="Disputed — tap to see details">⚠</span>}
          </div>
          <div style={{fontSize:14,color:"#8e8e93",marginTop:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.note}</div>
          {/* Clickable tags row */}
          <div style={{display:"flex",gap:4,marginTop:5,flexWrap:"wrap"}}>
            <Tag label={tpL(r.topic)} color={tc} bg={`${tc}10`} border={`1px solid ${tc}25`} onClick={()=>navTo({topic:r.topic})}/>
            <Tag label={JURS.find(j=>j.id===r.jur)?.l||""} onClick={()=>navTo({jur:r.jur})}/>
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0}}>
          {/* Priority — clickable */}
          <Tag label={r.priority} color={PC[r.priority]} bg={`${PC[r.priority]}10`} border={`1px solid ${PC[r.priority]}25`} onClick={()=>navTo({pri:r.priority})}/>
          <div style={{display:"flex",gap:4,alignItems:"center"}}>
            <span onClick={e=>{e.stopPropagation();setShareId(sharing?null:r.id)}} style={{fontSize:18,cursor:"pointer",color:sharing?"#007AFF":"#aeaeb2",padding:"2px 4px"}}>↗</span>
            <span onClick={()=>expandAndScroll(r.id)} style={{fontSize:18,color:open?"#007AFF":"#aeaeb2",cursor:"pointer",fontWeight:700}}>{open?"▲":"▼"}</span>
          </div>
        </div>
      </div>
      {sharing&&<div onClick={e=>e.stopPropagation()} style={{padding:"10px 14px",background:"#007AFF08",borderTop:"1px solid #007AFF22"}}>
        <div style={{fontSize:13,fontWeight:700,color:"#48484a",marginBottom:6}}>Share — choose detail level:</div>
        <div style={{display:"flex",gap:6,marginBottom:8}}>
          {Object.entries(SHARE_LEVELS).map(([k,v])=>(
            <button key={k} onClick={()=>setSharePreview(prev=>prev?.id===r.id&&prev?.level===k?null:{id:r.id,level:k})} style={{flex:1,padding:"6px 8px",borderRadius:8,border:`1px solid ${sharePreview?.id===r.id&&sharePreview?.level===k?"#007AFF":"#d1d1d6"}`,background:sharePreview?.id===r.id&&sharePreview?.level===k?"#007AFF":"#ffffff",color:sharePreview?.id===r.id&&sharePreview?.level===k?"#ffffff":"#48484a",cursor:"pointer",fontSize:13,fontWeight:600,textAlign:"center"}}>
              <div>{v.l}</div>
              <div style={{fontSize:11,fontWeight:400,opacity:0.8,marginTop:2}}>{v.desc}</div>
            </button>
          ))}
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          <button onClick={()=>{shareOne(r,"email",sharePreview?.level||"standard");setShareId(null);setSharePreview(null)}} style={{fontSize:14,padding:"6px 14px",borderRadius:8,border:"1px solid #d1d1d6",background:"#f2f2f7",color:"#48484a",cursor:"pointer",fontWeight:600}}>📄 Download Report</button>
          <button onClick={()=>{shareOne(r,"slack",sharePreview?.level||"standard");setShareId(null);setSharePreview(null)}} style={{fontSize:14,padding:"6px 14px",borderRadius:8,border:"1px solid #d1d1d6",background:"#f2f2f7",color:"#48484a",cursor:"pointer",fontWeight:600}}>💬 Download for Slack</button>
        </div>
        {sharePreview?.id===r.id&&<div style={{marginTop:8,padding:10,background:"#ffffff",borderRadius:8,border:"1px solid rgba(60,60,67,0.12)",maxHeight:200,overflow:"auto"}}>
          <div style={{fontSize:12,color:"#8e8e93",marginBottom:4,fontWeight:600}}>Preview ({SHARE_LEVELS[sharePreview.level]?.l}):</div>
          <div style={{fontSize:13,color:"#48484a",lineHeight:1.6}} dangerouslySetInnerHTML={{__html:buildShareHTML(r,sharePreview.level)}}/>
        </div>}
      </div>}
      {open&&<>
        <div style={{padding:"0 14px 14px"}}><Detail r={r}/></div>
        <div onClick={()=>expandAndScroll(r.id)} style={{padding:"10px 14px",borderTop:"1px solid #e5e5ea",background:"#f2f2f7",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
          <span style={{fontSize:14,fontWeight:700,color:"#007AFF"}}>▲ Collapse</span>
        </div>
      </>}
    </div>)};

  // ── Pill Button ──
  const Pill=({active,label,onClick,small})=>(
    <button onClick={onClick} style={{fontSize:small?11:12,padding:small?"4px 10px":"6px 14px",borderRadius:20,border:`1px solid ${active?"#00000022":"#d1d1d6"}`,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,background:active?"#007AFF":"transparent",color:active?"#ffffff":"#8e8e93",fontWeight:active?700:400,transition:"all 0.15s"}}>{label}</button>
  );

  // ═══ RENDER ═══
  return(
  <div style={{minHeight:"100vh",background:"#f2f2f7",color:"#1c1c1e",fontFamily:"-apple-system,'SF Pro Display','SF Pro Text','Helvetica Neue',sans-serif"}}>
    

    {/* Header */}
    <div style={{padding:"20px 20px 0",background:"#ffffff"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
        <span style={{fontSize:22}}>🌍</span>
        <h1 style={{margin:0,fontSize:24,fontWeight:800,color:"#000000",letterSpacing:"-0.3px"}}>Freight Sustainability Intelligence</h1>
      </div>
      <p style={{margin:"2px 0 16px",fontSize:14,color:"#aeaeb2"}}>{res.length} resources · {JURS.length} jurisdictions · Live</p>

      {/* 3 Tabs */}
      <div style={{display:"flex",gap:0,borderBottom:"1px solid #e5e5ea"}}>
        {[{id:"home",l:"Home"},{id:"explore",l:"Explore"},{id:"settings",l:"Settings"}].map(t=>(
          <button key={t.id} onClick={()=>{setTab(t.id);setExp(null);setFocus(null);setFocusDismissed([]);setNavStack([])}} style={{padding:"10px 20px",fontSize:15,fontWeight:tab===t.id&&!focus?700:400,background:"none",border:"none",cursor:"pointer",color:tab===t.id&&!focus?"#007AFF":"#8e8e93",borderBottom:tab===t.id&&!focus?"2.5px solid #007AFF":"2.5px solid transparent"}}>{t.l}</button>
        ))}
      </div>
    </div>

    <div style={{padding:20}}>

    {/* ═══ FOCUS VIEW — section landing page ═══ */}
    {focus&&<div>
      {/* Back + Header */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
        <button onClick={closeFocus} style={{padding:"6px 12px",borderRadius:8,border:"1px solid #d1d1d6",background:"#ffffff",color:"#007AFF",cursor:"pointer",fontSize:15,fontWeight:600}}>← Back</button>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <div style={{width:4,height:18,background:focus.color,borderRadius:2}}/>
            <h2 style={{margin:0,fontSize:24,fontWeight:800,color:"#1c1c1e"}}>{focus.title}</h2>
          </div>
          <div style={{fontSize:14,color:"#8e8e93",marginTop:2,marginLeft:10}}>{focusItems.length} item{focusItems.length!==1?"s":""}{focusDismissed.length>0?` · ${focusDismissed.length} cleared`:""}</div>
        </div>
        {focusItems.length>0&&<button onClick={()=>setFocusDismissed(focus.itemIds)} style={{padding:"6px 12px",borderRadius:8,border:"1px solid #FF3B3033",background:"#FF3B3008",color:"#FF3B30",cursor:"pointer",fontSize:14,fontWeight:600}}>Clear all</button>}
      </div>

      {focusItems.length===0&&<div style={{textAlign:"center",padding:"40px 20px"}}>
        <div style={{fontSize:15,color:"#8e8e93"}}>All items cleared from this view.</div>
        <button onClick={closeFocus} style={{marginTop:12,padding:"8px 20px",borderRadius:8,border:"1px solid #d1d1d6",background:"#ffffff",color:"#007AFF",cursor:"pointer",fontSize:15,fontWeight:600}}>← Return</button>
      </div>}

      {/* Items with WHY explanation */}
      {focusItems.map(r=>{const open=exp===r.id;const tc=TC[r.topic]||"#8e8e93";const whyText=focus.whyFn?focus.whyFn(r):"";const tl=r.timeline?.filter(m=>new Date(m.date)>new Date()).sort((a,b)=>new Date(a.date)-new Date(b.date))[0];const daysTo=tl?Math.floor((new Date(tl.date)-new Date())/864e5):null;
      return(
      <div key={r.id} id={`res-${r.id}`} style={{marginBottom:10,background:"#ffffff",borderRadius:12,border:"1px solid rgba(60,60,67,0.12)",borderLeft:`3px solid ${tc}`,overflow:"hidden",boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>
        <div style={{padding:"12px 14px"}}>
          {/* Title row */}
          <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
            <div style={{flex:1,minWidth:0,cursor:"pointer"}} onClick={()=>expandAndScroll(r.id)}>
              <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                {r.modes?.map(m=><ModeTag key={m} m={m}/>)}
                <span style={{fontSize:17,fontWeight:600,color:"#1c1c1e"}}>{r.title}</span>
                {SEED_DISPUTES[r.id]?.active&&<span style={{fontSize:12,color:"#FF9500"}}>⚠</span>}
              </div>
              <div style={{display:"flex",gap:4,marginTop:4,flexWrap:"wrap"}}>
                <Tag label={tpL(r.topic)} color={tc} bg={`${tc}10`} border={`1px solid ${tc}25`} onClick={()=>navTo({topic:r.topic})}/>
                <Tag label={JURS.find(j=>j.id===r.jur)?.l||""} onClick={()=>navTo({jur:r.jur})}/>
                <Tag label={r.priority} color={PC[r.priority]} bg={`${PC[r.priority]}10`} border={`1px solid ${PC[r.priority]}25`}/>
              </div>
            </div>
            <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0}}>
              {daysTo!==null&&<div style={{textAlign:"center",padding:"4px 10px",borderRadius:8,background:daysTo<=30?"#FF3B3010":daysTo<=60?"#FF950010":"#f2f2f7",border:`1px solid ${daysTo<=30?"#FF3B3020":daysTo<=60?"#FF950020":"rgba(60,60,67,0.08)"}`}}>
                <span style={{fontSize:18,fontWeight:700,fontFamily:"monospace",color:daysTo<=30?"#FF3B30":daysTo<=60?"#FF9500":"#636366"}}>{daysTo}</span>
                <span style={{fontSize:12,color:"#8e8e93",display:"block",lineHeight:1.2}}>days to</span>
                <span style={{fontSize:12,color:daysTo<=30?"#FF3B30":"#636366",fontWeight:600,display:"block",lineHeight:1.2,maxWidth:80,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tl?.label||"milestone"}</span>
              </div>}
              <div style={{display:"flex",gap:4}}>
                <button onClick={e=>{e.stopPropagation();setShareId(shareId===r.id?null:r.id)}} style={{fontSize:13,padding:"2px 8px",borderRadius:4,border:"1px solid #d1d1d6",background:"#f2f2f7",color:"#007AFF",cursor:"pointer"}}>↗ Share</button>
                <button onClick={e=>{e.stopPropagation();dismissFromFocus(r.id)}} style={{fontSize:13,padding:"2px 8px",borderRadius:4,border:"1px solid #d1d1d6",background:"#f2f2f7",color:"#8e8e93",cursor:"pointer"}}>✕ Clear</button>
              </div>
            </div>
          </div>

          {/* Share menu inline */}
          {shareId===r.id&&<div onClick={e=>e.stopPropagation()} style={{padding:"10px",background:"#007AFF08",borderRadius:10,marginTop:6,border:"1px solid #007AFF15"}}>
            <div style={{fontSize:13,fontWeight:700,color:"#48484a",marginBottom:6}}>Share detail level:</div>
            <div style={{display:"flex",gap:4,marginBottom:8}}>
              {Object.entries(SHARE_LEVELS).map(([k,v])=>(
                <button key={k} onClick={()=>setSharePreview(prev=>prev?.id===r.id&&prev?.level===k?null:{id:r.id,level:k})} style={{flex:1,padding:"5px 6px",borderRadius:6,border:`1px solid ${sharePreview?.id===r.id&&sharePreview?.level===k?"#007AFF":"#d1d1d6"}`,background:sharePreview?.id===r.id&&sharePreview?.level===k?"#007AFF":"#ffffff",color:sharePreview?.id===r.id&&sharePreview?.level===k?"#ffffff":"#48484a",cursor:"pointer",fontSize:12,fontWeight:600,textAlign:"center"}}>{v.l}</button>
              ))}
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              <button onClick={()=>{shareOne(r,"email",sharePreview?.level||"standard");setShareId(null);setSharePreview(null)}} style={{fontSize:13,padding:"5px 12px",borderRadius:6,border:"1px solid #d1d1d6",background:"#f2f2f7",color:"#48484a",cursor:"pointer",fontWeight:600}}>📄 Report</button>
              <button onClick={()=>{shareOne(r,"slack",sharePreview?.level||"standard");setShareId(null);setSharePreview(null)}} style={{fontSize:13,padding:"5px 12px",borderRadius:6,border:"1px solid #d1d1d6",background:"#f2f2f7",color:"#48484a",cursor:"pointer",fontWeight:600}}>💬 Slack</button>
              <button onClick={()=>{toggleSel(r.id);setShareId(null);if(!xpOpen)setXpOpen(true)}} style={{fontSize:13,padding:"5px 12px",borderRadius:6,border:"1px solid #007AFF33",background:"#007AFF08",color:"#007AFF",cursor:"pointer",fontWeight:600}}>+ Batch</button>
            </div>
          </div>}

          {/* WHY — always visible, highlighted */}
          {whyText&&<div style={{marginTop:8,padding:"8px 10px",background:"#f2f2f7",borderRadius:8,borderLeft:`3px solid ${focus.color}`,fontSize:14,color:"#48484a",lineHeight:1.6}}>
            {whyText}
          </div>}

          {/* Abbreviated timeline preview — always visible if available */}
          {r.timeline?.length>0&&!open&&<div style={{marginTop:8}}>
            <TL items={r.timeline} color={tc} url={r.url}/>
          </div>}

          {/* Source link — always visible */}
          {r.url&&!open&&<div style={{marginTop:6,display:"flex",alignItems:"center",gap:4}}>
            <span style={{fontSize:13,color:"#aeaeb2"}}>Source:</span>
            <a href={r.url} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{fontSize:13,color:"#007AFF",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:280}}>{r.url}</a>
          </div>}

          {/* Expand toggle */}
          <div onClick={()=>expandAndScroll(r.id)} style={{marginTop:8,padding:"8px 12px",background:open?"#007AFF08":"#f2f2f7",borderRadius:8,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",border:open?"1px solid #007AFF22":"1px solid rgba(60,60,67,0.08)"}}>
            <span style={{fontSize:14,color:"#007AFF",fontWeight:700}}>{open?"▲ Collapse":"▼ Expand full detail"}</span>
          </div>
        </div>
        {open&&<>
          <div style={{padding:"0 14px 14px"}}><Detail r={r}/></div>
          <div onClick={()=>expandAndScroll(r.id)} style={{padding:"10px 14px",borderTop:"1px solid #e5e5ea",background:"#f2f2f7",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <span style={{fontSize:14,fontWeight:700,color:"#007AFF"}}>▲ Collapse</span>
          </div>
        </>}
      </div>)})}
    </div>}

    {/* ═══ HOME TAB ═══ */}
    {!focus&&tab==="home"&&<div>

      {/* Summary strip — all clickable */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,marginBottom:24}}>
        {[
          {v:res.filter(r=>r.priority==="CRITICAL").length,l:"Critical",c:"#FF3B30",click:()=>navTo({pri:"CRITICAL"})},
          {v:res.filter(r=>r.added===AUDIT_DATE&&!r.modified).length+res.filter(r=>r.modified===AUDIT_DATE).length,l:"Changed",c:"#34C759",click:()=>navTo({changed:true})},
          {v:Object.values(SEED_DISPUTES).filter(d=>d.active).length,l:"Disputed",c:"#FF9500",click:()=>navTo({disputed:true})},
          {v:res.length,l:"Resources",c:"#636366",click:()=>navTo()},
        ].map((s,i)=><div key={i} onClick={s.click} style={{background:"#ffffff",borderRadius:12,padding:"12px 8px",textAlign:"center",border:"1px solid rgba(60,60,67,0.12)",cursor:"pointer",transition:"transform 0.1s",WebkitTapHighlightColor:"transparent"}} onMouseDown={e=>e.currentTarget.style.transform="scale(0.97)"} onMouseUp={e=>e.currentTarget.style.transform="scale(1)"} onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}>
          <div style={{fontSize:26,fontWeight:700,color:s.c,fontFamily:"monospace"}}>{s.v}</div>
          <div style={{fontSize:12,color:"#8e8e93",textTransform:"uppercase",marginTop:2,letterSpacing:0.5}}>{s.l}</div>
        </div>)}
      </div>

      {/* 1. WEEKLY BRIEFING — share always visible */}
      {settings.homeVisible.briefing&&<section style={{marginBottom:32,background:"#ffffff",borderRadius:12,border:"1px solid rgba(60,60,67,0.12)",overflow:"hidden",boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>
        <div style={{padding:"14px 16px",borderBottom:"1px solid rgba(60,60,67,0.08)"}}>
          <div onClick={()=>setBrfOpen(!brfOpen)} style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}>
            <div style={{width:4,height:18,background:"#AF52DE",borderRadius:2}}/>
            <div style={{flex:1}}>
              <h2 style={{margin:0,fontSize:22,fontWeight:800}}>Weekly Briefing</h2>
              <div style={{fontSize:14,color:"#8e8e93",marginTop:1}}>Generated {today} · Share with legal counsel + staff</div>
            </div>
            <span style={{fontSize:15,color:"#aeaeb2"}}>{brfOpen?"▲":"▼"}</span>
          </div>
          {/* Share buttons — always visible */}
          <div onClick={e=>e.stopPropagation()} style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:10}}>
            <button onClick={e=>{e.stopPropagation();try{downloadFile(toBriefingEmail(),`Weekly_Briefing_${today}.html`)}catch(err){console.error(err)}}} style={{fontSize:14,padding:"8px 16px",borderRadius:8,border:"1px solid #AF52DE33",background:"#AF52DE08",color:"#AF52DE",cursor:"pointer",fontWeight:600}}>📄 {copied==="downloaded"?"✓ Downloaded!":"Download Report"}</button>
            <button onClick={e=>{e.stopPropagation();try{downloadFile(toBriefingSlack(),`Weekly_Briefing_${today}_slack.txt`,"text/plain")}catch(err){console.error(err)}}} style={{fontSize:14,padding:"8px 16px",borderRadius:8,border:"1px solid #AF52DE33",background:"#AF52DE08",color:"#AF52DE",cursor:"pointer",fontWeight:600}}>💬 {copied==="downloaded"?"✓ Downloaded!":"Download for Slack"}</button>
          </div>
        </div>
        {brfOpen&&<div style={{padding:16}}>
          <p style={{margin:"0 0 14px",fontSize:15,color:"#48484a",lineHeight:1.7}}>
            IMO Net-Zero Framework adoption vote confirmed for October 2025 — the single biggest regulatory event in maritime decarbonisation. CBAM definitive phase now active; authorised declarant registration deadline extended to March 2026. SAF costs trending up 12% QoQ, directly affecting air freight surcharges. EUDR simplified but core timber/rubber/leather due diligence obligations remain for Dec 2026.
          </p>
          <div style={{marginBottom:14}}>
            <div style={{fontSize:15,color:"#1c1c1e",textTransform:"uppercase",letterSpacing:1.2,marginBottom:8,fontWeight:800,paddingBottom:4,borderBottom:"1px solid rgba(60,60,67,0.08)"}}>Client talking points</div>
            {[
              {rid:"t1",published:"14 Feb 2026",emoji:"🏭🚢",title:"CBAM Definitive Phase Now Active",text:"EU Commission published updated CBAM implementing rules on 14 Feb 2026. Authorised declarant registration deadline extended to 31 March 2026. All importers of steel, aluminium, cement, fertilisers, electricity, and hydrogen into the EU must now report embedded emissions and purchase CBAM certificates. Direct cost impact for any client shipping these materials into EU — verify declarant status immediately.",src:"EU Commission Implementing Regulation 2025/2377",url:"https://taxation-customs.ec.europa.eu/carbon-border-adjustment-mechanism_en"},
              {rid:"o12",published:"22 Jan 2026",emoji:"⛽✈️",title:"ReFuelEU SAF Mandate — Q1 Price Update",text:"European Commission published Q1 2026 SAF blending obligation monitoring report. Minimum 2% SAF blend now mandatory at all EU airports. SAF spot prices rose 12% QoQ to €3.80-4.20/kg, driven by feedstock scarcity and refinery capacity constraints. Every air freight quote on EU-departing routes must now factor this surcharge. Affects all live event, artwork, and luxury goods air shipments from EU origins.",src:"ReFuelEU Aviation Regulation / ICAO SAF Dashboard",url:"https://transport.ec.europa.eu/transport-modes/air/refueleu-aviation_en"},
              {rid:"r36",published:"18 Dec 2025",emoji:"📦🚛",title:"EUDR Due Diligence — Packaging Impact",text:"EU published simplified EUDR rules on 18 Dec 2025, but core obligations remain intact for Dec 2026 enforcement. Any shipment using timber crating, wooden pallets, rubber seals, or leather packaging for EU-bound goods requires due diligence documentation proving deforestation-free sourcing. Forwarders handling artwork, automotive prototypes, and live event builds using wood crating must begin supplier documentation now.",src:"EU Official Journal / Regulation 2023/1115 (amended)",url:"https://environment.ec.europa.eu/topics/forests/deforestation/regulation_en"},
              {rid:"o13",published:"10 Oct 2025",emoji:"🏭🚢",title:"IMO Net-Zero Framework — Landmark Vote",text:"IMO MEPC 83 approved the Net-Zero Framework on 10 Oct 2025 (63 yes, 16 no, 24 abstained). First binding global framework combining mandatory GHG fuel intensity limits with a carbon pricing mechanism for international shipping. Entry into force March 2027, enforcement with penalties from 2028. Every ocean freight budget from 2028 onward must account for carrier fuel compliance surcharges. US formally walked out of the vote, creating compliance fragmentation on US-origin ocean routes.",src:"IMO MEPC 83 Final Report",url:"https://www.imo.org/en/MediaCentre/MeetingSummaries"},
            ].map((t,i)=>{const lr=res.find(x=>x.id===t.rid);return(
            <div key={i} style={{marginBottom:12,padding:"10px 12px",background:"#f2f2f7",borderRadius:10,borderLeft:"3px solid #AF52DE"}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                <span style={{fontSize:13,fontFamily:"monospace",color:"#AF52DE",fontWeight:700,background:"#AF52DE10",padding:"1px 6px",borderRadius:4}}>Published {t.published}</span>
                <span style={{fontSize:15}}>{t.emoji}</span>
                {lr&&<span style={{fontSize:12,padding:"1px 6px",borderRadius:4,fontWeight:700,background:`${PC[lr.priority]}10`,color:PC[lr.priority],border:`1px solid ${PC[lr.priority]}25`}}>{lr.priority}</span>}
              </div>
              <div style={{fontSize:15,fontWeight:600,color:"#1c1c1e",marginBottom:4}}>{t.title}</div>
              <div style={{fontSize:14,color:"#48484a",lineHeight:1.7,marginBottom:6}}>{t.text}</div>
              <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                <span style={{fontSize:13,color:"#8e8e93"}}>Source: {t.src}</span>
                <a href={t.url} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{fontSize:13,color:"#007AFF"}}>↗ Open</a>
                {lr&&<span onClick={()=>navToId(t.rid)} style={{fontSize:13,color:"#007AFF",cursor:"pointer",fontWeight:600}}>View in dashboard →</span>}
              </div>
              {/* Priority override */}
              {lr&&<div style={{display:"flex",gap:4,marginTop:6,alignItems:"center"}}>
                <span style={{fontSize:12,color:"#8e8e93"}}>Set priority:</span>
                {["CRITICAL","HIGH","MODERATE","LOW"].map(p=>(
                  <button key={p} onClick={e=>{e.stopPropagation();setRes(prev=>prev.map(r=>r.id===t.rid?{...r,priority:p}:r))}} style={{fontSize:12,padding:"2px 8px",borderRadius:4,border:`1px solid ${PC[p]}${lr.priority===p?"":"33"}`,background:lr.priority===p?`${PC[p]}15`:"#ffffff",color:lr.priority===p?PC[p]:"#aeaeb2",cursor:"pointer",fontWeight:lr.priority===p?700:400}}>{p}</button>
                ))}
              </div>}
            </div>)})}
          </div>
          <div>
            <div style={{fontSize:15,color:"#1c1c1e",textTransform:"uppercase",letterSpacing:1.2,marginBottom:8,fontWeight:800,paddingBottom:4,borderBottom:"1px solid rgba(60,60,67,0.08)"}}>Disputed / Watch</div>
            {Object.entries(SEED_DISPUTES).filter(([,d])=>d.active).slice(0,5).map(([id,d])=>{const r=res.find(x=>x.id===id);if(!r)return null;const tp=TOPICS.find(t=>t.id===r.topic);const modes=r.modes?.map(m=>MODES.find(x=>x.id===m)?.i||"").join("")||"";return(
              <div key={id} style={{marginBottom:12,paddingLeft:12,borderLeft:"3px solid #FF950044"}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                  <span style={{fontSize:14}}>{modes} {tp?.i||""}</span>
                  <span onClick={()=>navToId(id)} style={{fontSize:15,fontWeight:600,color:"#007AFF",cursor:"pointer",textDecoration:"underline"}}>{r.title}</span>
                  <span style={{fontSize:12,padding:"2px 8px",borderRadius:4,fontWeight:700,background:`${PC[r.priority]}10`,color:PC[r.priority]}}>{r.priority}</span>
                </div>
                <div style={{fontSize:14,color:"#636366",lineHeight:1.7,marginBottom:4}}>{d.note.slice(0,220)}{d.note.length>220?"…":""}</div>
                {d.sources?.length>0&&<div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                  <span style={{fontSize:13,color:"#FF9500",fontWeight:600}}>Disputed by:</span>
                  {d.sources.map((s,si)=><span key={si} onClick={e=>{e.stopPropagation();navToId(id)}} style={{fontSize:13,padding:"3px 10px",borderRadius:6,background:"#FF950010",color:"#C77700",border:"1px solid #FF950025",cursor:"pointer",fontWeight:600}}>{s} ↗</span>)}
                </div>}
              </div>)})}
          </div>
        </div>}
      </section>}

      {/* 2. WHAT CHANGED */}
      {settings.homeVisible.changed&&<section style={{marginBottom:32}}>
        <div onClick={()=>navTo({changed:true})} style={{display:"flex",alignItems:"center",gap:8,marginBottom:14,cursor:"pointer"}}>
          <div style={{width:3,height:16,background:"#34C759",borderRadius:2}}/>
          <h2 style={{margin:0,fontSize:20,fontWeight:800}}>What Changed</h2>
          <span style={{fontSize:14,color:"#007AFF",marginLeft:"auto"}}>View all →</span>
        </div>
        {res.filter(r=>r.added===AUDIT_DATE&&!r.modified).map(r=><Row key={r.id} r={r} badge="NEW"/>)}
        {res.filter(r=>r.modified===AUDIT_DATE).map(r=><Row key={r.id} r={r} badge="FIX"/>)}
      </section>}

      {settings.homeVisible.urgency&&<section style={{marginBottom:32}}>
        <div onClick={()=>{const items=[...res].sort((a,b)=>urgencyScore(b)-urgencyScore(a)).slice(0,20);openFocus("urgency","Top Urgency","#FF3B30",items,whyPriority)}} style={{display:"flex",alignItems:"center",gap:8,marginBottom:14,cursor:"pointer"}}>
          <div style={{width:3,height:16,background:"#FF3B30",borderRadius:2}}/>
          <h2 style={{margin:0,fontSize:20,fontWeight:800}}>Top Urgency</h2>
          <span style={{fontSize:14,color:"#007AFF",marginLeft:"auto"}}>View all →</span>
        </div>
        {[...res].sort((a,b)=>urgencyScore(b)-urgencyScore(a)).slice(0,8).map(r=><Row key={r.id} r={r}/>)}
      </section>}

      {/* 4. DUE SOON */}
      {settings.homeVisible.due&&<section style={{marginBottom:32}}>
        <div onClick={()=>{const now2=new Date(),q2=new Date(now2.getTime()+90*864e5);const items=res.filter(r=>r.timeline?.some(m=>{const d3=new Date(m.date);return d3>=now2&&d3<=q2}));openFocus("due","Due This Quarter","#FF9500",items,(r2)=>{const tl2=r2.timeline?.map(m=>({...m,dt:new Date(m.date)})).filter(m=>m.dt>=now2&&m.dt<=q2).sort((a,b)=>a.dt-b.dt)[0];const days2=tl2?Math.floor((tl2.dt-now2)/864e5):null;return `${days2!==null?`${days2} days until `:``}${tl2?.label||"next milestone"}. ${r2.whyMatters?.slice(0,150)||r2.note}`})}} style={{display:"flex",alignItems:"center",gap:8,marginBottom:14,cursor:"pointer"}}>
          <div style={{width:3,height:16,background:"#FF9500",borderRadius:2}}/>
          <h2 style={{margin:0,fontSize:20,fontWeight:800}}>Due This Quarter</h2>
          <span style={{fontSize:14,color:"#007AFF",marginLeft:"auto"}}>View all →</span>
        </div>
        {(()=>{const now=new Date(),q=new Date(now.getTime()+90*864e5);const due=res.filter(r=>r.timeline?.some(m=>{const d=new Date(m.date);return d>=now&&d<=q})).sort((a,b)=>{const nA=a.timeline?.map(m=>new Date(m.date)).filter(d=>d>=now&&d<=q).sort((x,y)=>x-y)[0];const nB=b.timeline?.map(m=>new Date(m.date)).filter(d=>d>=now&&d<=q).sort((x,y)=>x-y)[0];return(nA||Infinity)-(nB||Infinity)});
        if(!due.length)return<p style={{fontSize:14,color:"#aeaeb2"}}>No milestones in next 90 days</p>;
        return due.map(r=>{const next=r.timeline?.map(m=>({...m,dt:new Date(m.date)})).filter(m=>m.dt>=now&&m.dt<=q).sort((a,b)=>a.dt-b.dt)[0];const days=next?Math.floor((next.dt-now)/864e5):null;const open=exp===r.id;const tc2=TC[r.topic]||"#8e8e93";return(
          <div key={r.id} id={`res-${r.id}`} style={{marginBottom:8,background:"#ffffff",borderRadius:12,border:"1px solid rgba(60,60,67,0.12)",borderLeft:`3px solid ${tc2}`,overflow:"hidden",boxShadow:"0 1px 3px rgba(0,0,0,0.08)"}}>
            <div onClick={()=>expandAndScroll(r.id)} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",cursor:"pointer"}}>
              {days!==null&&<div style={{minWidth:48,textAlign:"center",padding:"6px 4px",borderRadius:8,background:days<=30?"#FF3B3015":days<=60?"#FF950015":"#e5e5ea"}}>
                <div style={{fontSize:22,fontWeight:700,fontFamily:"monospace",color:days<=30?"#FF3B30":days<=60?"#FF9500":"#636366"}}>{days}</div>
                <div style={{fontSize:11,color:"#8e8e93",textTransform:"uppercase"}}>days</div>
              </div>}
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",gap:3,marginBottom:2}}>{r.modes?.map(m=><ModeTag key={m} m={m}/>)}</div>
                <div style={{fontSize:15,fontWeight:600,color:"#1c1c1e"}}>{r.title}</div>
                {next&&<div style={{fontSize:14,color:"#636366",marginTop:2}}>→ {next.label} · {next.d||next.date}</div>}
              </div>
              <span style={{fontSize:14,color:"#aeaeb2"}}>{open?"▲":"▼"}</span>
            </div>
            {open&&<div style={{padding:"0 14px 14px"}}><Detail r={r}/></div>}
          </div>)})})()}
      </section>}
    </div>}

    {/* ═══ EXPLORE TAB ═══ */}
    {!focus&&tab==="explore"&&<div>
      {navStack.length>0&&<button onClick={goBack} style={{marginBottom:12,padding:"6px 14px",borderRadius:8,border:"1px solid #d1d1d6",background:"#ffffff",color:"#007AFF",cursor:"pointer",fontSize:15,fontWeight:600}}>← Back</button>}
      <input value={sq} onChange={e=>setSq(e.target.value)} placeholder="Search resources, regulations, topics..."
        style={{width:"100%",padding:"12px 16px",fontSize:15,background:"#e5e5ea",border:"none",borderRadius:10,color:"#1c1c1e",outline:"none",boxSizing:"border-box",marginBottom:12}}/>

      {/* Active filters + toggle */}
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8,flexWrap:"wrap"}}>
        <button onClick={()=>setShowFilters(!showFilters)} style={{fontSize:14,padding:"6px 14px",borderRadius:8,border:"1px solid #d1d1d6",cursor:"pointer",background:showFilters?"#000000":"#ffffff",color:showFilters?"#f2f2f7":"#636366",fontWeight:600}}>
          {showFilters?"Hide Filters":"Filters"} {(fMode||fTopic||fJur||fPri)?`(${[fMode,fTopic,fJur,fPri].filter(Boolean).length} active)`:""}
        </button>
        {fMode&&<span onClick={()=>setFMode(null)} style={{fontSize:14,padding:"4px 10px",borderRadius:6,background:"#e5e5ea",color:"#48484a",cursor:"pointer",border:"1px solid #d1d1d6"}}>✕ {MODES.find(m=>m.id===fMode)?.i} {MODES.find(m=>m.id===fMode)?.l}</span>}
        {fJur&&<span onClick={()=>setFJur(null)} style={{fontSize:14,padding:"4px 10px",borderRadius:6,background:"#e5e5ea",color:"#48484a",cursor:"pointer",border:"1px solid #d1d1d6"}}>✕ {JURS.find(j=>j.id===fJur)?.l}</span>}
        {fTopic&&<span onClick={()=>setFTopic(null)} style={{fontSize:14,padding:"4px 10px",borderRadius:6,background:"#e5e5ea",color:"#48484a",cursor:"pointer",border:"1px solid #d1d1d6"}}>✕ {TOPICS.find(t=>t.id===fTopic)?.l}</span>}
        {fPri&&<span onClick={()=>setFPri(null)} style={{fontSize:14,padding:"4px 10px",borderRadius:6,background:`${PC[fPri]}15`,color:PC[fPri],cursor:"pointer",border:`1px solid ${PC[fPri]}33`}}>✕ {fPri}</span>}
        {(fMode||fTopic||fJur||fPri)&&<span onClick={()=>{setFMode(null);setFTopic(null);setFJur(null);setFPri(null)}} style={{fontSize:14,color:"#8e8e93",cursor:"pointer",textDecoration:"underline"}}>Clear all</span>}
      </div>

      {showFilters&&<div style={{background:"#ffffff",borderRadius:12,border:"1px solid rgba(60,60,67,0.12)",padding:14,marginBottom:12}}>
        {/* Mode */}
        <div style={{marginBottom:10}}>
          <div style={{fontSize:13,color:"#8e8e93",textTransform:"uppercase",letterSpacing:1,marginBottom:6,fontWeight:600}}>Transport Mode</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {MODES.map(m=><Pill key={m.id} active={fMode===m.id} label={`${m.i} ${m.l} (${res.filter(r=>r.modes?.includes(m.id)).length})`} onClick={()=>setFMode(fMode===m.id?null:m.id)} small/>)}
          </div>
        </div>
        {/* Jurisdiction */}
        <div style={{marginBottom:10}}>
          <div style={{fontSize:13,color:"#8e8e93",textTransform:"uppercase",letterSpacing:1,marginBottom:6,fontWeight:600}}>Jurisdiction</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {JURS.map(j=>{const count=res.filter(r=>r.jur===j.id).length;return<Pill key={j.id} active={fJur===j.id} label={`${j.l} (${count})`} onClick={()=>setFJur(fJur===j.id?null:j.id)} small/>})}
          </div>
        </div>
        {/* Topic */}
        <div style={{marginBottom:10}}>
          <div style={{fontSize:13,color:"#8e8e93",textTransform:"uppercase",letterSpacing:1,marginBottom:6,fontWeight:600}}>Sustainability Topic</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {TOPICS.map(t=>{const count=res.filter(r=>r.topic===t.id).length;return<Pill key={t.id} active={fTopic===t.id} label={`${t.l} (${count})`} onClick={()=>setFTopic(fTopic===t.id?null:t.id)} small/>})}
          </div>
        </div>
        {/* Priority */}
        <div>
          <div style={{fontSize:13,color:"#8e8e93",textTransform:"uppercase",letterSpacing:1,marginBottom:6,fontWeight:600}}>Priority</div>
          <div style={{display:"flex",gap:6}}>
            {PRIS.map(p=><button key={p} onClick={()=>setFPri(fPri===p?null:p)} style={{fontSize:14,padding:"5px 12px",borderRadius:8,cursor:"pointer",letterSpacing:0.5,border:`1px solid ${PC[p]}33`,background:fPri===p?`${PC[p]}22`:"transparent",color:fPri===p?PC[p]:"#8e8e93",fontWeight:fPri===p?700:400}}>{p} ({res.filter(r=>r.priority===p).length})</button>)}
          </div>
        </div>
      </div>}

      <div style={{fontSize:13,color:"#aeaeb2",marginBottom:8,fontFamily:"monospace"}}>{filtered.length} result{filtered.length!==1?"s":""} · sorted by urgency</div>
      {filtered.map(r=><Row key={r.id} r={r}/>)}
      {filtered.length===0&&<p style={{fontSize:15,color:"#aeaeb2",textAlign:"center",padding:"40px 0"}}>No resources match these filters</p>}
    </div>}

    {/* ═══ SETTINGS TAB ═══ */}
    {!focus&&tab==="settings"&&<div>

      {/* Dashboard Settings */}
      <section style={{marginBottom:24}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
          <div style={{width:4,height:18,background:"#007AFF",borderRadius:2}}/>
          <h2 style={{margin:0,fontSize:18,fontWeight:700}}>Dashboard Settings</h2>
        </div>
        <div style={{background:"#ffffff",borderRadius:12,border:"1px solid rgba(60,60,67,0.12)",overflow:"hidden"}}>

          {/* Default Export Format */}
          <div style={{padding:"14px 16px",borderBottom:"1px solid rgba(60,60,67,0.08)"}}>
            <div style={{fontSize:14,fontWeight:600,color:"#1c1c1e",marginBottom:8}}>Default Export Format</div>
            <div style={{display:"flex",gap:6}}>
              {[{v:"email",l:"📄 Report (.html)"},{v:"slack",l:"💬 Slack (.txt)"}].map(f=>(
                <button key={f.v} onClick={()=>setSettings(s=>({...s,defaultExport:f.v}))} style={{padding:"6px 14px",borderRadius:8,fontSize:14,border:`1px solid ${settings.defaultExport===f.v?"#007AFF":"#d1d1d6"}`,background:settings.defaultExport===f.v?"#007AFF":"#ffffff",color:settings.defaultExport===f.v?"#ffffff":"#636366",cursor:"pointer",fontWeight:settings.defaultExport===f.v?600:400}}>{f.l}</button>
              ))}
            </div>
          </div>

          {/* Briefing Day */}
          <div style={{padding:"14px 16px",borderBottom:"1px solid rgba(60,60,67,0.08)"}}>
            <div style={{fontSize:14,fontWeight:600,color:"#1c1c1e",marginBottom:8}}>Weekly Briefing Day</div>
            <select value={settings.briefingDay} onChange={e=>setSettings(s=>({...s,briefingDay:e.target.value}))} style={{padding:"8px 12px",fontSize:15,background:"#f2f2f7",border:"1px solid #d1d1d6",borderRadius:8,color:"#1c1c1e",width:"100%",boxSizing:"border-box"}}>
              {["Monday","Tuesday","Wednesday","Thursday","Friday"].map(d=><option key={d}>{d}</option>)}
            </select>
            <div style={{fontSize:14,color:"#8e8e93",marginTop:4}}>Briefing content regenerates on this day. Copy via Email/Slack/PDF from the Home tab.</div>
          </div>

          {/* Alert Priorities */}
          <div style={{padding:"14px 16px",borderBottom:"1px solid rgba(60,60,67,0.08)"}}>
            <div style={{fontSize:14,fontWeight:600,color:"#1c1c1e",marginBottom:8}}>Alert Priorities</div>
            <div style={{fontSize:14,color:"#8e8e93",marginBottom:8}}>Which priority levels appear in urgency alerts</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {["CRITICAL","HIGH","MODERATE","LOW"].map(p=>{const active=settings.alertPriorities.includes(p);return(
                <button key={p} onClick={()=>setSettings(s=>({...s,alertPriorities:active?s.alertPriorities.filter(x=>x!==p):[...s.alertPriorities,p]}))} style={{padding:"6px 12px",borderRadius:8,fontSize:14,fontWeight:600,border:`1px solid ${PC[p]}${active?"":"33"}`,background:active?`${PC[p]}15`:"#ffffff",color:active?PC[p]:"#aeaeb2",cursor:"pointer"}}>{p}</button>
              )})}
            </div>
          </div>

          {/* Home Sections Visibility */}
          <div style={{padding:"14px 16px",borderBottom:"1px solid rgba(60,60,67,0.08)"}}>
            <div style={{fontSize:14,fontWeight:600,color:"#1c1c1e",marginBottom:8}}>Home Tab Sections</div>
            <div style={{fontSize:14,color:"#8e8e93",marginBottom:8}}>Toggle which sections appear on the Home tab</div>
            {[{k:"changed",l:"What Changed"},{k:"briefing",l:"Weekly Briefing"},{k:"urgency",l:"Top Urgency"},{k:"due",l:"Due This Quarter"}].map(s=>(
              <div key={s.k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid rgba(60,60,67,0.04)"}}>
                <span style={{fontSize:15,color:"#1c1c1e"}}>{s.l}</span>
                <div onClick={()=>setSettings(st=>({...st,homeVisible:{...st.homeVisible,[s.k]:!st.homeVisible[s.k]}}))} style={{width:44,height:26,borderRadius:13,background:settings.homeVisible[s.k]?"#34C759":"#e5e5ea",cursor:"pointer",position:"relative",transition:"background 0.2s"}}>
                  <div style={{width:22,height:22,borderRadius:11,background:"#ffffff",position:"absolute",top:2,left:settings.homeVisible[s.k]?20:2,transition:"left 0.2s",boxShadow:"0 1px 3px rgba(0,0,0,0.15)"}}/>
                </div>
              </div>
            ))}
          </div>

          {/* Sort Default */}
          <div style={{padding:"14px 16px"}}>
            <div style={{fontSize:14,fontWeight:600,color:"#1c1c1e",marginBottom:8}}>Default Sort Order</div>
            <div style={{display:"flex",gap:6}}>
              {[{v:"urgency",l:"Urgency Score"},{v:"date",l:"Date Added"},{v:"priority",l:"Priority Level"}].map(s=>(
                <button key={s.v} onClick={()=>setSettings(st=>({...st,defaultSort:s.v}))} style={{padding:"6px 14px",borderRadius:8,fontSize:14,border:`1px solid ${(settings.defaultSort||"urgency")===s.v?"#007AFF":"#d1d1d6"}`,background:(settings.defaultSort||"urgency")===s.v?"#007AFF":"#ffffff",color:(settings.defaultSort||"urgency")===s.v?"#ffffff":"#636366",cursor:"pointer",fontWeight:(settings.defaultSort||"urgency")===s.v?600:400}}>{s.l}</button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Archive with Search + Lineage */}
      <section style={{marginBottom:24}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
          <div style={{width:4,height:18,background:"#AF52DE",borderRadius:2}}/>
          <h2 style={{margin:0,fontSize:18,fontWeight:700}}>Archive ({arc.length})</h2>
        </div>
        <div style={{padding:12,background:"#007AFF08",borderRadius:10,border:"1px solid #007AFF15",marginBottom:12}}>
          <div style={{fontSize:14,fontWeight:600,color:"#007AFF",marginBottom:4}}>How to archive an item</div>
          <div style={{fontSize:14,color:"#48484a",lineHeight:1.7}}>Open any resource by tapping its title, then scroll to the bottom of the expanded detail. Tap <strong>🗄️ Archive</strong>, select a reason (Superseded, Expired, Repealed, Consolidated, or Manual), add an optional note, and confirm. The item moves here and is removed from all active views. Archived items retain their regulatory lineage — if a regulation was superseded, the replacement link stays active. You can <strong>Restore</strong> any archived item at any time.</div>
        </div>
        <div style={{padding:16,background:"#ffffff",borderRadius:12,border:"1px solid rgba(60,60,67,0.12)"}}>
          <input value={arcSq} onChange={e=>setArcSq(e.target.value)} placeholder="Search archive..."
            style={{width:"100%",padding:"10px 14px",fontSize:15,background:"#f2f2f7",border:"1px solid #d1d1d6",borderRadius:8,color:"#1c1c1e",outline:"none",boxSizing:"border-box",marginBottom:10}}/>
          <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
            <Pill small active={!arcReason} label="All reasons" onClick={()=>setArcReason(null)}/>
            {["Superseded","Expired","Repealed","Consolidated","Manual"].map(r=><Pill small key={r} active={arcReason===r} label={r} onClick={()=>setArcReason(arcReason===r?null:r)}/>)}
          </div>
          {filteredArc.length===0?<p style={{fontSize:14,color:"#aeaeb2"}}>No archived items{arcSq||arcReason?" match filters":""}</p>:
          filteredArc.map(a=>{
            const ss=SUPERSESSIONS.find(s=>s.oldTitle===a.title||s.newId===a.id);
            const replacement=ss?res.find(r=>r.id===ss.newId):null;
            return(
            <div key={a.id||a.title} style={{padding:"10px 0",borderBottom:"1px solid #e5e5ea"}}>
              <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:15,fontWeight:600,color:"#636366",textDecoration:"line-through"}}>{a.title}</div>
                  <div style={{display:"flex",gap:6,marginTop:4,flexWrap:"wrap"}}>
                    <span style={{fontSize:12,padding:"2px 6px",borderRadius:4,background:"#e5e5ea",color:"#8e8e93",border:"1px solid #d1d1d6"}}>{a.reason}</span>
                    <span style={{fontSize:12,color:"#aeaeb2"}}>{a.archivedDate||a.date}</span>
                    {a.archiveNote&&<span style={{fontSize:12,color:"#aeaeb2"}}>{a.archiveNote}</span>}
                  </div>
                  {/* Lineage: what replaced this */}
                  {replacement&&<div style={{marginTop:6,fontSize:14,color:"#34C759",cursor:"pointer"}} onClick={()=>{setTab("explore");setSq(replacement.title);setExp(replacement.id)}}>
                    → Replaced by: {replacement.title}
                  </div>}
                  {ss&&<div style={{marginTop:4,fontSize:14,color:"#636366",lineHeight:1.5}}>{ss.what?.slice(0,150)}{ss.what?.length>150?"…":""}</div>}
                </div>
                <button onClick={()=>restoreR(a.id)} style={{padding:"4px 10px",fontSize:14,background:"none",border:"1px solid #d1d1d6",color:"#8e8e93",borderRadius:4,cursor:"pointer",flexShrink:0}}>Restore</button>
              </div>
            </div>)})}
        </div>
      </section>

      {/* Supersession History */}
      <section style={{marginBottom:24}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
          <div style={{width:3,height:16,background:"#FF9500",borderRadius:2}}/>
          <h2 style={{margin:0,fontSize:20,fontWeight:800}}>Supersession History ({SUPERSESSIONS.length})</h2>
        </div>
        <div style={{padding:16,background:"#ffffff",borderRadius:12,border:"1px solid rgba(60,60,67,0.12)"}}>
          {SUPERSESSIONS.map((ss,i)=>{const newR=res.find(r=>r.id===ss.newId);return(
            <div key={i} style={{padding:"10px 0",borderBottom:"1px solid #e5e5ea"}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                <span style={{fontSize:12,padding:"2px 6px",borderRadius:4,fontWeight:700,background:`${PC[ss.severity]}15`,color:PC[ss.severity],border:`1px solid ${PC[ss.severity]}33`}}>{ss.severity}</span>
                <span style={{fontSize:13,color:"#aeaeb2",fontFamily:"monospace"}}>{ss.date}</span>
              </div>
              <div style={{fontSize:14,color:"#8e8e93",textDecoration:"line-through",marginBottom:2}}>{ss.oldTitle}</div>
              <div style={{fontSize:14,color:"#3c3c43",marginBottom:4}}>→ {ss.newTitle}</div>
              {ss.what&&<div style={{fontSize:14,color:"#636366",lineHeight:1.5}}>{ss.what.slice(0,200)}{ss.what.length>200?"…":""}</div>}
              {newR&&<div style={{marginTop:4,fontSize:14,color:"#007AFF",cursor:"pointer"}} onClick={()=>{setTab("explore");setExp(newR.id)}}>View current →</div>}
            </div>)})}
        </div>
      </section>

      {/* Data Summary */}
      <section style={{marginBottom:24}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
          <div style={{width:3,height:16,background:"#8e8e93",borderRadius:2}}/>
          <h2 style={{margin:0,fontSize:20,fontWeight:800}}>Data Summary</h2>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {[
            {l:"Active Resources",v:res.length},
            {l:"Archived",v:arc.length},
            {l:"Cross-References",v:XREF_PAIRS.length+" verified links"},
            {l:"Disputed",v:Object.values(SEED_DISPUTES).filter(d=>d.active).length+" active"},
            {l:"Supersessions",v:SUPERSESSIONS.length+" tracked"},
          ].map((d,i)=><div key={i} style={{padding:14,background:"#ffffff",borderRadius:12,border:"1px solid rgba(60,60,67,0.12)",display:"flex",justifyContent:"space-between"}}>
            <span style={{fontSize:15,color:"#48484a"}}>{d.l}</span>
            <span style={{fontSize:15,color:"#8e8e93",fontFamily:"monospace"}}>{d.v}</span>
          </div>)}
        </div>
      </section>

      {/* Coverage by Jurisdiction */}
      <section style={{marginBottom:24}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
          <div style={{width:3,height:16,background:"#8e8e93",borderRadius:2}}/>
          <h2 style={{margin:0,fontSize:20,fontWeight:800}}>Jurisdiction Coverage</h2>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          {JURS.map(j=>{const count=res.filter(r=>r.jur===j.id).length;const max=Math.max(...JURS.map(jj=>res.filter(r=>r.jur===jj.id).length));return(
            <div key={j.id} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0"}}>
              <span style={{fontSize:14,color:"#636366",minWidth:80}}>{j.l}</span>
              <div style={{flex:1,height:6,background:"#e5e5ea",borderRadius:3,overflow:"hidden"}}><div style={{width:`${(count/max)*100}%`,height:"100%",background:count===0?"#FF3B30":count<5?"#FF9500":"#34C759",borderRadius:3}}/></div>
              <span style={{fontSize:14,color:"#8e8e93",fontFamily:"monospace",minWidth:24,textAlign:"right"}}>{count}</span>
            </div>)})}
        </div>
      </section>

      {/* Reset */}
      <button onClick={()=>{setRes(SEED.map(remap));setArc(SEED_ARC.map(a=>({...a,archivedDate:a.date||"2025-01-01"})));setExp(null);setSq("");setFMode(null);setFTopic(null);setFJur(null);setFPri(null)}} style={{padding:"12px 0",fontSize:14,fontWeight:600,background:"#FF3B3008",border:"1px solid #FF3B3033",color:"#FF3B30",borderRadius:8,cursor:"pointer",width:"100%"}}>Reset All Data</button>
    </div>}

    </div>

    {/* ═══ EXPORT BUILDER FLOATING PANEL ═══ */}
    {xpOpen&&<div style={{position:"fixed",bottom:0,left:0,right:0,background:"#ffffff",borderTop:"2px solid #007AFF",borderRadius:"16px 16px 0 0",maxHeight:"60vh",overflowY:"auto",zIndex:100,boxShadow:"0 -8px 32px rgba(0,0,0,0.6)"}}>
      <div style={{padding:"14px 20px",borderBottom:"1px solid rgba(60,60,67,0.12)",display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,background:"#ffffff",zIndex:1}}>
        <div>
          <h3 style={{margin:0,fontSize:20,fontWeight:800,color:"#000000"}}>Export Builder</h3>
          <span style={{fontSize:14,color:"#8e8e93"}}>{xpSel.length} selected · drag to reorder</span>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          {xpSel.length>0&&<button onClick={()=>setXpSel([])} style={{fontSize:14,padding:"4px 10px",borderRadius:6,border:"1px solid #d1d1d6",background:"transparent",color:"#8e8e93",cursor:"pointer"}}>Clear</button>}
          <button onClick={()=>{setXpOpen(false);setXpSel([])}} style={{fontSize:15,background:"none",border:"none",color:"#8e8e93",cursor:"pointer",padding:"4px 8px"}}>✕</button>
        </div>
      </div>

      {xpSel.length===0?<div style={{padding:"24px 20px",textAlign:"center"}}>
        <p style={{fontSize:15,color:"#8e8e93",margin:"0 0 12px"}}>Tap the checkboxes on any card to add to your export.</p>
        <div style={{display:"flex",gap:6,justifyContent:"center",flexWrap:"wrap"}}>
          <button onClick={()=>selAll(res.filter(r=>r.priority==="CRITICAL").map(r=>r.id))} style={{fontSize:14,padding:"6px 12px",borderRadius:6,border:"1px solid #FF3B3033",background:"#FF3B3011",color:"#FF3B30",cursor:"pointer"}}>Select all CRITICAL</button>
          <button onClick={()=>selAll(res.filter(r=>r.added===AUDIT_DATE).map(r=>r.id))} style={{fontSize:14,padding:"6px 12px",borderRadius:6,border:"1px solid #34C75933",background:"#34C75911",color:"#34C759",cursor:"pointer"}}>Select all NEW</button>
          <button onClick={()=>{const now=new Date(),q=new Date(now.getTime()+90*864e5);selAll(res.filter(r=>r.timeline?.some(m=>{const d=new Date(m.date);return d>=now&&d<=q})).map(r=>r.id))}} style={{fontSize:14,padding:"6px 12px",borderRadius:6,border:"1px solid #FF950033",background:"#FF950011",color:"#FF9500",cursor:"pointer"}}>Select Due This Quarter</button>
        </div>
      </div>:
      <div>
        {/* Reorderable selection */}
        <div style={{padding:"8px 20px"}}>
          {xpSel.map((id,i)=>{const r=res.find(x=>x.id===id);if(!r)return null;const tc2=TC[r.topic]||"#8e8e93";return(
            <div key={id} draggable onDragStart={e=>onDragS(e,i)} onDragOver={e=>onDragO(e,i)} onDrop={e=>onDropXp(e,i)}
              style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",marginBottom:4,background:dragOver===i?"#e8e8ed":"#e5e5ea",borderRadius:8,border:"1px solid #d1d1d6",borderLeft:`3px solid ${tc2}`,opacity:dragIdx===i?0.4:1,cursor:"grab"}}>
              <span style={{fontSize:15,color:"#aeaeb2",userSelect:"none"}}>⠿</span>
              <span style={{fontSize:14,color:"#636366",fontFamily:"monospace",minWidth:20}}>{i+1}</span>
              <div style={{display:"flex",gap:2}}>{r.modes?.slice(0,2).map(m=><span key={m} style={{fontSize:12,color:"#636366",padding:"1px 4px",background:"#f2f2f7",borderRadius:3}}>{mI(m)} {MODES.find(x=>x.id===m)?.l||m}</span>)}</div>
              <span style={{flex:1,fontSize:15,fontWeight:600,color:"#1c1c1e",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.title}</span>
              <span style={{fontSize:12,padding:"1px 6px",borderRadius:3,color:PC[r.priority],fontWeight:700}}>{r.priority}</span>
              <span onClick={e=>{e.stopPropagation();toggleSel(id)}} style={{fontSize:14,color:"#8e8e93",cursor:"pointer",padding:"2px 6px"}}>✕</span>
            </div>)})}
        </div>

        {/* Format selector + export actions */}
        <div style={{padding:"12px 20px 20px",borderTop:"1px solid rgba(60,60,67,0.12)",display:"flex",flexDirection:"column",gap:10}}>
          <div style={{display:"flex",gap:6}}>
            {[{id:"email",l:"📄 Report",d:"HTML — open or print to PDF"},{id:"slack",l:"💬 Slack",d:"Markdown text file"}].map(f=>(
              <button key={f.id} onClick={()=>setXpFmt(f.id)} style={{flex:1,padding:"8px 6px",borderRadius:8,border:`1px solid ${xpFmt===f.id?"#007AFF33":"#d1d1d6"}`,background:xpFmt===f.id?"#007AFF15":"#e5e5ea",color:xpFmt===f.id?"#007AFF":"#8e8e93",cursor:"pointer",fontSize:14,fontWeight:xpFmt===f.id?700:400,textAlign:"center"}}>
                <div>{f.l}</div><div style={{fontSize:12,color:"#aeaeb2",marginTop:2}}>{f.d}</div>
              </button>
            ))}
          </div>
          <button onClick={()=>{
            try{
            const items=getSelectedResources();
            if(!items.length)return;
            const safeName=`FSI_Export_${today}`;
            if(xpFmt==="slack"){downloadFile(toSlack(items,"Custom Export — "+today),`${safeName}_slack.txt`,"text/plain")}
            else{downloadFile(toEmailHTML(items,"Custom Export — "+today),`${safeName}.html`)}
            }catch(err){console.error("Export error:",err)}
          }} style={{padding:"12px 0",fontSize:15,fontWeight:700,background:"#007AFF",border:"none",color:"#fff",borderRadius:12,cursor:"pointer",width:"100%"}}>
            {copied==="downloaded"?"✓ Downloaded!":"⬇ Download "+xpSel.length+" items"}
          </button>
        </div>
      </div>}
    </div>}

    {/* Floating export toggle */}
    <button onClick={()=>setXpOpen(!xpOpen)} style={{position:"fixed",bottom:xpOpen?undefined:20,right:20,top:xpOpen?12:undefined,width:xpOpen?36:56,height:xpOpen?36:56,borderRadius:xpOpen?8:28,background:xpOpen?"#FF3B30":"#007AFF",border:"none",color:"#fff",fontSize:xpOpen?16:22,cursor:"pointer",zIndex:101,boxShadow:"0 2px 12px rgba(0,122,255,0.3)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>
      {xpOpen?"✕":"↗"}
    </button>

    {/* Download toast */}
    {copied&&<div style={{position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",background:"#34C759",color:"#ffffff",padding:"8px 20px",borderRadius:8,fontSize:15,fontWeight:700,zIndex:200,boxShadow:"0 4px 16px rgba(0,0,0,0.3)"}}>✓ File downloaded</div>}

    {/* Back to top */}
    <button onClick={scrollTop} style={{position:"fixed",bottom:xpOpen?undefined:84,right:20,top:xpOpen?56:undefined,width:40,height:40,borderRadius:20,background:"rgba(60,60,67,0.7)",border:"none",color:"#ffffff",fontSize:18,cursor:"pointer",zIndex:100,boxShadow:"0 2px 8px rgba(0,0,0,0.2)",display:"flex",alignItems:"center",justifyContent:"center"}}>↑</button>

  </div>);
}
