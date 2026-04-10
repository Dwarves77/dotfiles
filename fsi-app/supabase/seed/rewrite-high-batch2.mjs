import { createClient } from "@supabase/supabase-js";
const supabase = createClient("https://kwrsbpiseruzbfwjpvsp.supabase.co","eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3cnNicGlzZXJ1emJmd2pwdnNwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MDg1NzkzOCwiZXhwIjoyMDU2NDMzOTM4fQ.zPd4fS8kqnwGXif54aJe7zbcSdFf5-t7GXewSSfeNcE");

const rewrites = [
  {
    id: "c2",
    what_is_it: "EU Taxonomy Regulation (EU) 2020/852 establishes a classification system defining which economic activities qualify as 'environmentally sustainable' for investment and reporting purposes. Transport activities must meet specific technical screening criteria to be Taxonomy-aligned. Referenced by CSRD — companies must report the proportion of their revenue, CapEx, and OpEx that is Taxonomy-aligned. Enforced via CSRD reporting requirements.",
    why_matters: "The Taxonomy defines what counts as 'green' in the EU — and what doesn't. For freight forwarders: (1) clients reporting under CSRD must classify their transport spend as Taxonomy-aligned or not, (2) forwarders offering low-carbon services (EV fleets, modal shift, ISO 14083 reporting) help clients increase their Taxonomy-aligned OpEx, (3) Taxonomy alignment is increasingly used in tender scoring — preferred suppliers demonstrate green credentials, (4) access to green finance and sustainability-linked loans requires Taxonomy-aligned activities.",
    key_data: ["Regulation: (EU) 2020/852","Transport screening criteria: substantial contribution to climate change mitigation","Reporting: % of revenue, CapEx, OpEx that is Taxonomy-aligned","Connection: CSRD requires Taxonomy reporting from Wave 1 companies","Key delegated acts: Climate Delegated Act (EU) 2021/2139","Applies via: CSRD reporting chain — your clients report, you provide data"],
    note: "IN FORCE. Reporting via CSRD underway. ACTION NOW: Understand which of your services qualify as Taxonomy-aligned transport (EV delivery, modal shift, ISO 14083 reporting). Communicate Taxonomy alignment to clients as a competitive differentiator. Owner: Sustainability + Sales.",
  },
  {
    id: "c7",
    what_is_it: "Science Based Targets initiative (SBTi) provides frameworks for companies to set emissions reduction targets aligned with Paris Agreement goals. Transport-specific guidance covers Scope 1 (owned fleet) and Scope 3 Category 4/9 (purchased and sold transport). SBTi validation is increasingly required by major shippers as a supplier qualification criterion. Land Transport Guidance published for road freight decarbonization pathways.",
    why_matters: "SBTi targets are driving your clients' procurement decisions. For freight forwarders: (1) large shippers with SBTi commitments require supply chain partners to demonstrate emissions reduction trajectories, (2) SBTi-validated forwarders win preferred-supplier status in sustainability-scored tenders, (3) SBTi requires ISO 14083-aligned emissions accounting methodology, (4) missing SBTi alignment increasingly means exclusion from shortlists for major corporate accounts.",
    key_data: ["Publisher: Science Based Targets initiative (CDP, UNGC, WRI, WWF)","Transport guidance: Land Transport Guidance (road freight pathways)","Scope coverage: Scope 1 (own fleet) + Scope 3 Cat 4/9 (transport services)","Target types: near-term (5-10 years) and net-zero (long-term)","Validation: independent review by SBTi technical team","Adoption: 6,000+ companies with approved targets globally"],
    note: "ACTIVE FRAMEWORK. Growing adoption. ACTION NOW: Assess whether SBTi target-setting is appropriate for your organization. At minimum, align emissions reporting to SBTi-compatible methodology. Communicate alignment to clients in tender responses. Owner: Sustainability + Strategy.",
  },
  {
    id: "c8",
    what_is_it: "IFRS S1 (General Requirements) and IFRS S2 (Climate-related Disclosures) published by the International Sustainability Standards Board (ISSB). These standards create a global baseline for sustainability and climate disclosure, adopted or endorsed by jurisdictions worldwide. S2 requires Scope 3 emissions disclosure including transport. Multiple jurisdictions adopting: UK, Singapore, Australia, Japan, Hong Kong, Brazil.",
    why_matters: "ISSB standards are expanding the number of jurisdictions where your clients must report transport emissions. For freight forwarders: (1) as more countries adopt ISSB, more clients in more jurisdictions will request Scope 3 transport data, (2) ISSB S2 requires climate risk assessment for supply chains — transport is a key exposure, (3) consistency with CSRD/ESRS means the same data serves both EU and ISSB reporting, (4) early adoption jurisdictions (UK, Singapore, Australia) are already generating data requests.",
    key_data: ["Standards: IFRS S1 (General), IFRS S2 (Climate)","Publisher: ISSB (part of IFRS Foundation)","Scope 3 requirement: yes — includes upstream/downstream transport","Adopting jurisdictions: UK, Singapore, Australia, Japan, Hong Kong, Brazil, South Korea","Alignment: designed to interoperate with CSRD/ESRS","Effective: varies by jurisdiction — UK from 2025, others 2026-2027"],
    note: "ACTIVE STANDARD. Jurisdictional adoption accelerating globally. ACTION NOW: Prepare for Scope 3 data requests from clients in ISSB-adopting jurisdictions beyond the EU. Ensure reporting methodology works for both CSRD and ISSB. Owner: Sustainability.",
  },
  {
    id: "c9",
    what_is_it: "CDP (formerly Carbon Disclosure Project) Supply Chain Programme enables purchasing organizations to request standardized environmental data from their suppliers. Over 330 purchasing organizations request data from 40,000+ suppliers. CDP questionnaires include transport-specific modules covering Scope 3 emissions, climate risk, and decarbonization targets. CDP scores (A to D-) are used in supplier selection and procurement decisions.",
    why_matters: "CDP is the channel through which your largest clients request emissions data. For freight forwarders: (1) if a major client uses CDP Supply Chain, you will receive a CDP questionnaire, (2) your CDP score directly affects supplier selection — A-rated suppliers get procurement preference, (3) CDP data feeds into client CSRD/ISSB reporting, (4) non-response to CDP questionnaires signals low sustainability maturity and risks contract renewal.",
    key_data: ["Programme: CDP Supply Chain","Members: 330+ purchasing organizations","Suppliers requested: 40,000+ annually","Scoring: A (leadership) to D- (disclosure), F (non-response)","Transport module: Scope 3 emissions, modal split, decarbonization targets","Response deadline: typically July annually","Cost: free to respond; membership fee for purchasing organizations"],
    note: "ACTIVE PROGRAMME. Annual cycle. ACTION NOW: Check if you've received CDP questionnaires from clients. Respond to all requests — non-response damages score. Aim for B or above. Owner: Sustainability.",
  },
  {
    id: "c3",
    what_is_it: "GRI (Global Reporting Initiative) Standards provide the world's most widely used sustainability reporting framework. GRI 305 covers GHG emissions (Scope 1, 2, 3). GRI Topic Standard on Transport (under development). CSRD/ESRS interoperates with GRI — companies can use GRI-aligned data for ESRS reporting. Published by the GRI Foundation.",
    why_matters: "GRI is the reporting framework your clients are most likely already using. For freight forwarders: (1) GRI 305 requires Scope 3 transport emissions data from service providers, (2) GRI interoperability with CSRD means one data set serves both frameworks, (3) GRI is the most commonly cited framework in RFPs and tender sustainability sections, (4) provides the structure for annual sustainability reports.",
    key_data: ["Standard: GRI 305 (Emissions)","Publisher: GRI Foundation","Scope 3 requirement: yes (GRI 305-3)","CSRD interoperability: ESRS designed to be GRI-compatible","Adoption: used by 10,000+ organizations in 100+ countries","Transport-specific: GRI Topic Standard for Transport in development"],
    note: "ACTIVE STANDARD. Widely adopted globally. ACTION NOW: Ensure emissions data output format is compatible with GRI 305-3 requirements for clients using GRI. Owner: Sustainability.",
  },
  {
    id: "c10",
    what_is_it: "EcoVadis is a sustainability ratings platform that assesses companies across four themes: Environment, Labor & Human Rights, Ethics, and Sustainable Procurement. Over 130,000 companies rated. Score scale: 0-100 with medal levels (Bronze 45+, Silver 59+, Gold 69+, Platinum 78+). Increasingly used by procurement departments as a supplier qualification gate in logistics and freight forwarding.",
    why_matters: "EcoVadis is the sustainability scorecard your clients use to qualify suppliers. For freight forwarders: (1) many large shippers require minimum EcoVadis scores (typically Silver or above) for supplier qualification, (2) your score is visible to all clients on the platform — a low score is a competitive disadvantage, (3) the Environment theme weighs transport emissions, fleet composition, and carbon reporting capability, (4) improving your score requires documented environmental management systems and verified data.",
    key_data: ["Companies rated: 130,000+","Score scale: 0-100 (Bronze 45+, Silver 59+, Gold 69+, Platinum 78+)","Assessment frequency: annual renewal","Themes: Environment, Labor & HR, Ethics, Sustainable Procurement","Assessment cost: varies by company size (typically €2,000-5,000/year)","Integration: feeds into client procurement qualification systems"],
    note: "ACTIVE PLATFORM. Used as supplier gate by major shippers. ACTION NOW: If not already rated, begin EcoVadis assessment. Target Silver minimum (59+). Document environmental management system and emissions data for the Environment theme. Owner: Sustainability + Procurement.",
  },
  {
    id: "l2",
    what_is_it: "Euro 7 emission standard under Regulation (EU) 2024/1257 sets pollutant limits for all new motor vehicles sold in the EU — cars, vans, trucks, and buses. For heavy-duty vehicles: applies from 1 July 2027. Covers NOx, PM, PN (particle number), and introduces limits on brake and tyre particle emissions for the first time. Enforced by EU type-approval authorities.",
    why_matters: "Euro 7 affects the cost and availability of new diesel trucks in Europe. For freight forwarders: (1) compliant trucks will cost more — estimated €2,600-3,200 per vehicle in additional compliance costs, (2) older Euro VI vehicles may face increasing restrictions in urban low-emission zones, (3) truck manufacturers may accelerate ZEV production to avoid Euro 7 compliance costs on diesel platforms, (4) brake/tyre emission limits are entirely new — affect all vehicles including EVs.",
    key_data: ["Regulation: (EU) 2024/1257","Heavy-duty application: 1 July 2027","NOx limit (HDV): 200 mg/kWh (WHTC) — tighter than Euro VI","New: brake particle and tyre abrasion limits (all vehicles)","Cost impact: estimated €2,600-3,200 per HDV in additional compliance","On-board diagnostics: real-driving emissions monitoring mandatory","Legal instrument: Regulation (EU) 2024/1257, OJ L 2024/1257"],
    note: "ADOPTED — applies from July 2027 for HDVs. ACTION NOW: Factor Euro 7 compliance cost into truck fleet TCO modelling. Monitor urban LEZ changes that may restrict pre-Euro 7 vehicles. Owner: Road Product + Procurement.",
  },
  {
    id: "o5",
    what_is_it: "IMO MARPOL Annex VI sets the international framework for prevention of air pollution from ships — including sulphur content limits (global 0.50% cap from 2020, 0.10% in ECAs), NOx emission standards (Tier I-III), and the Energy Efficiency Design Index (EEDI) / Existing Ship Index (EEXI) for vessel energy efficiency. The foundation regulation that CII, GHG Strategy, and Net-Zero Framework build upon.",
    why_matters: "MARPOL Annex VI is the base layer of all maritime environmental regulation. Every compliance cost from CII, ETS, and FuelEU ultimately traces back to this framework. For freight forwarders: (1) the global sulphur cap drives VLSFO/MGO pricing — currently the largest fuel surcharge component on ocean freight, (2) EEXI requirements affect vessel availability for trade, (3) Emission Control Areas (ECAs) impose tighter standards on specific routes (North Sea, Baltic, North American coast).",
    key_data: ["Global sulphur cap: 0.50% (from 2020), ECAs: 0.10%","NOx: Tier III in ECAs (from 2016 for new vessels)","EEDI: mandatory for new vessels from 2013, tightening phases","EEXI: mandatory for existing vessels from 2023","MARPOL Annex VI: adopted 1997, major revisions 2005, 2011, 2021","Enforced by: flag state and port state control"],
    note: "IN FORCE. Foundation regulation. EEXI operational from 2023. ACTION NOW: This is background regulatory architecture — ensure your team understands how CII, ETS, and FuelEU layer on top of MARPOL Annex VI. Owner: Ocean Product (training).",
  },
];

async function run() {
  let updated = 0;
  for (const r of rewrites) {
    const { error: resErr } = await supabase.from("resources").update({ what_is_it: r.what_is_it, why_matters: r.why_matters, key_data: r.key_data, note: r.note }).eq("id", r.id);
    const { error: itemErr } = await supabase.from("intelligence_items").update({ what_is_it: r.what_is_it, why_matters: r.why_matters, key_data: r.key_data, summary: r.note }).eq("legacy_id", r.id);
    if (!resErr && !itemErr) { updated++; console.log("Updated: " + r.id); }
    else console.log("ERROR " + r.id + ": " + (resErr?.message || itemErr?.message));
  }
  console.log("\nUpdated " + updated + "/" + rewrites.length + " HIGH resources (batch 2)");
}
run();
