import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://kwrsbpiseruzbfwjpvsp.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3cnNicGlzZXJ1emJmd2pwdnNwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MDg1NzkzOCwiZXhwIjoyMDU2NDMzOTM4fQ.zPd4fS8kqnwGXif54aJe7zbcSdFf5-t7GXewSSfeNcE"
);

const rewrites = [
  {
    id: "o4",
    what_is_it: "The Carbon Intensity Indicator (CII) under IMO MARPOL Annex VI amendments (Resolution MEPC.352(78)) rates individual ships on an A-to-E scale based on their annual operational carbon intensity (grams CO₂ per tonne-nautical mile). Ships rated D for three consecutive years or E in any year must submit a corrective action plan. Enforced by flag state administrations. Operational since 1 January 2023.",
    why_matters: "CII ratings directly affect vessel availability and routing. Ships rated D or E face operational restrictions — slow steaming, voyage re-routing, or port avoidance. For freight forwarders: (1) D/E rated vessels may not call at certain ports or may be excluded from tenders by clients with sustainability commitments, (2) carriers operating constrained vessels may reduce service frequency or capacity on affected routes, (3) CII-driven slow steaming increases transit times by 5-15%, affecting supply chain planning, (4) clients increasingly request CII data for their Scope 3 reporting and tender evaluations.",
    key_data: [
      "Rating scale: A (superior) to E (inferior) based on Annual Efficiency Ratio (AER)",
      "Corrective action required: D rating for 3 consecutive years OR E in any single year",
      "Rating thresholds tighten annually — vessels that were C in 2023 may become D by 2026",
      "~30% of the global fleet estimated to be rated D or E by 2026",
      "No direct financial penalty — but operational restrictions and reputational impact",
      "Applies to all ships >5,000 GT in international trade",
      "Legal instrument: MEPC.352(78), MEPC.353(78), MARPOL Annex VI",
    ],
    note: "IN FORCE since 1 January 2023. Third year of ratings. Rating thresholds are tightening annually, pushing more vessels into D/E categories. ACTION NOW: Request CII ratings from all contracted carriers. Exclude D/E vessels from tenders where clients require it. Factor CII-driven slow steaming into transit time planning. Owner: Ocean Product + Procurement.",
  },
  {
    id: "a1",
    what_is_it: "The Carbon Offsetting and Reduction Scheme for International Aviation (CORSIA) under ICAO Annex 16 Volume IV requires airlines to offset CO₂ emissions growth above 2019 baseline levels on international routes. Phase 1 (2024-2026) is mandatory for states that volunteered. Enforced by national civil aviation authorities. Airlines must purchase CORSIA Eligible Emissions Units (CEUs) to cover excess emissions.",
    why_matters: "CORSIA offset costs flow directly into air cargo fuel surcharges. IATA projects total compliance costs reaching $1.7 billion in 2026, up from $1.3 billion in 2025. For freight forwarders: (1) air cargo rates on international routes include CORSIA cost pass-through, (2) CEU prices projected at $25-36/tonne CO₂ by 2027, potentially spiking to $60+/t if supply is scarce, (3) only 15.84 million credits issued from one eligible programme (Guyana REDD+) — supply constraints are real, (4) airlines will add CORSIA as a separate surcharge line on air waybills.",
    key_data: [
      "Phase 1: 2024-2026 (mandatory for volunteering states), Phase 2: 2027-2035 (broader coverage)",
      "Baseline: 2019 emissions levels — airlines offset growth above this",
      "CEU price range: $25-36/tCO₂ projected 2027, potentially $60+ if supply scarce",
      "2026 compliance cost: $1.7 billion (IATA projection, up from $1.3B in 2025)",
      "Demand for CEUs (2024-2026): 146-236 million units",
      "Current supply: only 15.84 million units issued (Guyana REDD+ programme)",
      "Legal instrument: ICAO Annex 16, Volume IV; Assembly Resolution A41-22",
    ],
    note: "IN FORCE — Phase 1 (2024-2026) operational. Supply of eligible credits is severely constrained relative to demand, which may drive prices above projections. ACTION NOW: Include CORSIA cost pass-through in air freight contract escalation clauses. Model cargo rate sensitivity to CEU price increases. Offer clients modal shift analysis (air → ocean) with quantified emissions and cost savings. Owner: Air Product + Finance.",
  },
  {
    id: "a2",
    what_is_it: "EU Aviation ETS under Directive 2003/87/EC (as amended by Directive 2023/958) covers CO₂ emissions from all flights departing from EU/EEA airports. Full scope covers intra-EEA flights; extra-EEA departures may be covered by CORSIA instead. From 2025, free allocation of allowances to airlines is being phased out. Enforced by EU Member State administering authorities.",
    why_matters: "All intra-European air freight already carries ETS carbon cost. At current EUA prices (~€68-81/tCO₂, Q1 2026), this adds measurable cost to every air cargo shipment within Europe. For freight forwarders: (1) intra-EU air cargo rates include embedded ETS costs, (2) phase-out of free allowances (from 2026) will increase the cost airlines need to recover via surcharges, (3) scope expansion to international flights would significantly increase transatlantic and EU-Asia air cargo rates, (4) interaction with CORSIA on international routes creates dual compliance complexity.",
    key_data: [
      "Coverage: all flights departing EU/EEA airports (intra-EEA mandatory)",
      "Current EUA price: ~€68-81/tCO₂ (Q1 2026)",
      "Free allowance phase-out: 25% reduction 2024, 50% 2025, 100% by 2026",
      "Monitoring: EU ETS MRV for aviation — annual emissions report + surrender",
      "Surrender deadline: 30 September annually",
      "Interaction: CORSIA covers international flights to avoid double-counting",
      "Legal instrument: Directive 2003/87/EC as amended by Directive 2023/958",
    ],
    note: "IN FORCE. Free allowances being phased out — airlines face increasing cost exposure. ACTION NOW: Verify airline ETS surcharge methodology. Include ETS cost escalation in intra-EU air freight contracts. Owner: Air Product + Finance.",
  },
  {
    id: "l1",
    what_is_it: "EU CO₂ Emission Standards for Heavy-Duty Vehicles under Regulation (EU) 2019/1242 (as amended by Regulation (EU) 2024/1610) set binding fleet-wide CO₂ reduction targets for truck and bus manufacturers. Targets: -45% by 2030, -65% by 2035, -90% by 2040 from 2019 baseline. Enforced by the European Commission and national type-approval authorities.",
    why_matters: "These targets determine when diesel trucks are phased out of European fleets. Manufacturers must sell increasing shares of zero-emission vehicles to meet fleet-wide targets. For freight forwarders: (1) subcontracted trucking fleets will transition to electric/hydrogen over 2025-2040, (2) fleet transition costs from subcontractors will be passed through in road freight rates, (3) infrastructure requirements (depot charging, MCS corridor chargers) affect route planning, (4) carriers investing early in ZEV fleets may offer competitive rates as diesel costs rise.",
    key_data: [
      "Fleet CO₂ targets: -45% by 2030, -65% by 2035, -90% by 2040 (vs 2019 baseline)",
      "Applies to: truck manufacturers selling in the EU market",
      "Penalty for non-compliance: €4,250 per gCO₂/tkm excess per vehicle",
      "Zero-emission vehicle credit: manufacturers earn credits for ZEV sales",
      "Urban delivery vehicles: 100% zero-emission required from 2030",
      "Legal instrument: Regulation (EU) 2019/1242 as amended by (EU) 2024/1610",
    ],
    note: "IN FORCE. 2030 target is the first major milestone — expect rapid fleet transition acceleration from 2026-2030. ACTION NOW: Survey road freight subcontractors on their ZEV fleet transition plans. Factor fleet transition surcharges into multi-year road freight contracts. Identify routes where EV trucks are already viable (urban, last-mile, drayage under 200km). Owner: Road Product + Procurement.",
  },
  {
    id: "c1",
    what_is_it: "Corporate Sustainability Reporting Directive (CSRD) under Directive (EU) 2022/2464 requires companies to report detailed sustainability information using European Sustainability Reporting Standards (ESRS). First reports due 2025 for large listed companies (covering 2024 data). Transport-specific ESRS provisions require Scope 3 emissions disclosure, modal shift strategies, and supplier sustainability metrics. Simplified by the Omnibus proposal in early 2026 — threshold raised from 250 to 1,000 employees for Wave 2 companies.",
    why_matters: "Even if a freight forwarder is not directly in-scope, their largest clients ARE — and those clients will demand supply chain emissions data. For freight forwarders: (1) expect structured data requests for Scope 3 transport emissions from in-scope customers, (2) ESRS requires ISO 14083-aligned emissions reporting for transport, (3) companies that can provide auditable shipment-level emissions data will win preferred-supplier status, (4) the 2026 Omnibus simplification reduces the number of directly in-scope companies but does NOT reduce data pull-through from large reporters.",
    key_data: [
      "Wave 1 (2025 reports, 2024 data): large listed companies with >500 employees",
      "Wave 2 (delayed by Omnibus): threshold raised from 250 to 1,000 employees",
      "ESRS transport provisions: Scope 3 disclosure, modal shift, supplier metrics",
      "Reporting standard: ESRS aligned with ISSB/IFRS S1/S2",
      "Audit requirement: limited assurance initially, moving to reasonable assurance",
      "Legal instrument: Directive (EU) 2022/2464; ESRS delegated acts",
    ],
    note: "IN FORCE — Wave 1 companies reporting now. Omnibus proposal (2026) simplifies scope but data pull-through continues. ACTION NOW: Build ISO 14083-aligned shipment-level emissions reporting capability. Proactively provide Scope 3 data to top 20 clients before they ask. Update customer segmentation: 'in-scope reporters' vs 'out-of-scope but asked'. Owner: Sustainability + Sales.",
  },
  {
    id: "c4",
    what_is_it: "ISO 14083:2023 Quantification and reporting of greenhouse gas emissions arising from transport chain operations. Published October 2023 by ISO TC 207. Establishes the global standard methodology for calculating transport emissions across all modes (road, rail, ocean, air, inland waterway). Increasingly referenced in EU regulation (CSRD/ESRS, CountEmissions EU) and customer contractual requirements.",
    why_matters: "ISO 14083 is becoming the contractual standard for freight emissions reporting. For freight forwarders: (1) clients include ISO 14083 compliance in RFP scoring criteria, (2) CSRD requires ISO 14083-aligned Scope 3 reporting, (3) the EU CountEmissions Regulation will make ISO 14083 the legally referenced methodology, (4) forwarders offering compliant calculations have a competitive advantage in tenders, (5) methodology requires carrier-specific emissions factors — not just industry averages.",
    key_data: [
      "Published: October 2023 (ISO TC 207)",
      "Scope: all transport modes — road, rail, ocean, air, inland waterway",
      "Aligned with: GLEC Framework v3, CSRD/ESRS, EU CountEmissions",
      "Methodology: well-to-wheel emissions, carrier-specific factors preferred",
      "Data hierarchy: primary data > modelled data > default factors",
      "Standard number: ISO 14083:2023",
    ],
    note: "PUBLISHED AND ACTIVE. Adoption accelerating through CSRD and customer requirements. ACTION NOW: Implement ISO 14083-aligned emissions calculation for all shipments. Request carrier-specific emissions factors. Ensure reporting output meets both ISO 14083 and GLEC Framework v3 requirements. Owner: Sustainability + IT.",
  },
  {
    id: "o13",
    what_is_it: "The IMO Net-Zero Framework combines a mandatory Global Fuel Standard (GFI) requiring progressive reduction in the GHG intensity of marine fuels, and a Carbon Pricing Mechanism creating a per-tonne CO₂ charge on shipping emissions. Approved in principle at MEPC 83 (April 2025). Formal adoption delayed — MEPC ES.2 (October 2025) adjourned the vote for one year. MEPC 84 (Spring 2026) will finalize implementation guidelines. US formally opposed the framework.",
    why_matters: "The pricing mechanism creates a new global cost layer on ocean freight — separate from and additional to EU ETS. For freight forwarders: (1) every ocean shipment will face fuel standard compliance costs passed through by carriers, (2) the carbon pricing mechanism creates a per-tonne charge that carriers will add as a surcharge, (3) US opposition means carriers on US-origin routes may face different enforcement, creating pricing divergence, (4) framework was approved 63-16-24 at MEPC ES.2 before the US-led adjournment.",
    key_data: [
      "Global Fuel Standard (GFI): progressive GHG intensity reduction for marine fuels",
      "Carbon pricing mechanism: per-tonne CO₂ charge on shipping emissions",
      "MEPC 83 (April 2025): approved in principle",
      "MEPC ES.2 (October 2025): adoption adjourned — US walkout",
      "MEPC 84 (Spring 2026): implementation guidelines and potential re-adoption",
      "Entry into force: 2027-2028 if adopted at MEPC 84",
      "Vote at MEPC ES.2: 63 in favour, 16 against, 24 abstentions",
      "Applies to vessels >5,000 GT — 85% of international shipping emissions",
    ],
    note: "APPROVED BUT NOT YET ADOPTED. MEPC 84 (Spring 2026) is the next decision point. US opposition creates enforcement uncertainty on US trade lanes. ACTION NOW: Monitor MEPC 84 outcomes closely. Model ocean freight cost scenarios with and without IMO carbon pricing. Include carbon cost escalation clauses in all long-term ocean contracts. Owner: Ocean Product + Strategy.",
  },
  {
    id: "g32",
    what_is_it: "The EU Import Control System 2 (ICS2) under Regulation (EU) 2019/1583 mandates advance electronic cargo data (Entry Summary Declarations) for all goods entering the EU customs territory. Full deployment in three releases: Release 1 (air postal/express, March 2023), Release 2 (air general cargo, March 2024), Release 3 (maritime/road/rail, 2025). Data must be submitted before loading/departure. Enforced by national customs authorities.",
    why_matters: "Every shipment to the EU requires compliant ENS data BEFORE arrival. Errors detected upstream cause delays across all cargo types. For freight forwarders: (1) data quality is now operationally critical — incorrect or late ENS submissions trigger holds, (2) forwarders are the primary data providers for customs in most supply chains, (3) Release 3 (2025) extends the system to ocean and road freight, covering the majority of freight volumes, (4) integration with CBAM reporting adds complexity for covered goods.",
    key_data: [
      "Release 1 (March 2023): air postal and express",
      "Release 2 (March 2024): air general cargo — all air freight",
      "Release 3 (2025): maritime, road, and rail",
      "Data requirement: full ENS (Entry Summary Declaration) before loading",
      "Risk analysis: automated risk profiling before arrival at first EU port of entry",
      "Integration: connects to CBAM reporting for covered goods",
      "Legal instrument: Regulation (EU) 2019/1583, Commission Implementing Regulation (EU) 2023/1446",
    ],
    note: "IN FORCE — all three releases deployed. Full coverage of all transport modes. ACTION NOW: Ensure all ENS data submission processes are automated and validated before transmission. Audit data quality across all supply chain partners. Train teams on Release 3 requirements for ocean/road. Owner: Customs + IT.",
  },
  {
    id: "c5",
    what_is_it: "The Global Logistics Emissions Council (GLEC) Framework Version 3.0 provides a standardized methodology for calculating and reporting logistics emissions across all transport modes and logistics activities. Published by Smart Freight Centre. Aligned with ISO 14083:2023 — serves as the practical implementation guide for the standard. Adopted by major shippers and logistics companies as the basis for supply chain emissions accounting.",
    why_matters: "GLEC Framework is the practical 'how-to' that translates ISO 14083 into operational reporting workflows. For freight forwarders: (1) most large customer carbon reporting requests reference GLEC Framework, (2) provides calculation methodologies for each transport mode with default emission factors where carrier data is unavailable, (3) enables consistent, auditable emissions reporting across multimodal supply chains, (4) competitive advantage for forwarders offering GLEC-aligned reporting in tenders.",
    key_data: [
      "Version: 3.0 (aligned with ISO 14083:2023)",
      "Publisher: Smart Freight Centre (SFC)",
      "Coverage: all transport modes + warehousing + handling",
      "Default factors: provided for each mode where carrier-specific data unavailable",
      "Adoption: used by 150+ companies including major global shippers",
      "Relationship: practical implementation guide for ISO 14083",
    ],
    note: "ACTIVE STANDARD. Widely adopted by industry. ACTION NOW: Ensure emissions calculation engine uses GLEC v3 methodology. Train sustainability teams on GLEC v3 requirements. Use GLEC-aligned reporting format for all customer Scope 3 data requests. Owner: Sustainability + IT.",
  },
  {
    id: "g1",
    what_is_it: "The EU Fit for 55 package is the comprehensive set of EU legislative proposals and regulations to reduce net greenhouse gas emissions by at least 55% by 2030 (vs 1990 levels), adopted under the European Green Deal. It is the parent package containing: EU ETS maritime extension, FuelEU Maritime, ReFuelEU Aviation, CBAM, CO₂ standards for HDVs, AFIR (Alternative Fuels Infrastructure), EU PPWR, CSRD/ESRS, and the EU Taxonomy. Not a single regulation but a coordinated policy package.",
    why_matters: "Fit for 55 is the policy architecture that drives virtually every sustainability regulation affecting EU freight operations. For freight forwarders: (1) understanding the package structure explains why multiple regulations appear simultaneously, (2) cross-references between regulations create compound compliance requirements, (3) the 55% target is the political commitment — individual regulations are the implementation tools, (4) any freight operation touching the EU is affected by at least 4-5 Fit for 55 instruments.",
    key_data: [
      "Target: -55% net GHG emissions by 2030 (vs 1990 levels)",
      "Key regulations: EU ETS, FuelEU Maritime, ReFuelEU Aviation, CBAM, HDV CO₂, AFIR, PPWR, CSRD",
      "Policy framework: European Green Deal → European Climate Law → Fit for 55 package",
      "Status: Most regulations adopted and entering force 2024-2026",
      "Scope: All sectors — transport, energy, industry, buildings, agriculture",
    ],
    note: "ADOPTED — most component regulations now in force or entering force 2025-2026. This is the policy context for all EU freight sustainability requirements. ACTION NOW: Map which Fit for 55 regulations affect each of your trade lanes and service offerings. Create a compliance calendar with all deadlines. Owner: Sustainability + Legal.",
  },
  {
    id: "t5",
    what_is_it: "The World Bank Carbon Pricing Dashboard tracks carbon pricing instruments worldwide — 73 carbon pricing initiatives implemented globally (as of 2025), covering ~23% of global GHG emissions. Provides data on ETS allowance prices, carbon tax rates, coverage percentages, and revenues by jurisdiction. Primary reference for comparing carbon costs across jurisdictions.",
    why_matters: "Carbon pricing directly determines the cost of freight in each jurisdiction. For freight forwarders: (1) compare carbon cost exposure across trade lanes, (2) EU ETS at ~€68-81/tCO₂ vs UK ETS at ~£35-50/tCO₂ vs Singapore at S$25/tCO₂ — pricing varies dramatically by jurisdiction, (3) as CBAM and other border adjustments proliferate, understanding carbon price differentials becomes essential for routing and procurement decisions, (4) emerging carbon markets in China, South Korea, and Brazil will add new cost layers.",
    key_data: [
      "73 carbon pricing initiatives globally (2025)",
      "Coverage: ~23% of global GHG emissions under some form of carbon pricing",
      "EU ETS: ~€68-81/tCO₂ (Q1 2026)",
      "UK ETS: ~£35-50/tCO₂",
      "Singapore carbon tax: S$25/tCO₂ (rising to S$50-80 by 2030)",
      "South Korea ETS: ~₩10,000-15,000/tCO₂",
      "China national ETS: ~¥70-90/tCO₂ (power sector only, expanding)",
    ],
    note: "ACTIVE DATA SOURCE. Updated continuously as carbon pricing instruments change. ACTION NOW: Map carbon pricing exposure across all trade lanes. Include jurisdiction-specific carbon costs in freight rate modelling. Monitor emerging markets (India Carbon Credit Trading Scheme, Brazil). Owner: Finance + Strategy.",
  },
  {
    id: "g17",
    what_is_it: "Singapore Maritime and Port Authority (MPA) Green Shipping Programme provides incentive schemes for vessels adopting energy efficiency measures and using cleaner fuels. Includes the Green Ship Programme (2011), Green Port Programme (2011), and Green Energy and Technology Programme. Part of Singapore's broader maritime decarbonisation strategy and Green Plan 2030.",
    why_matters: "Singapore is one of the world's largest bunkering ports and a key transhipment hub. MPA's green shipping incentives affect vessel operations and fuel choices at Singapore ports. For freight forwarders: (1) vessels using cleaner fuels may receive port fee reductions, (2) green corridor partnerships (Singapore-Rotterdam, Singapore-Australia) create preferential routing opportunities, (3) Singapore's carbon tax (rising to S$50-80/tCO₂ by 2030) will affect port and warehouse costs.",
    key_data: [
      "Green Ship Programme: tonnage tax rebate for energy-efficient vessels",
      "Green Port Programme: port due reductions for low-emission vessels",
      "Singapore carbon tax: S$25/tCO₂ (2024), rising S$50-80 by 2030",
      "Green corridors: Singapore-Rotterdam, Singapore-Australia",
      "60,000 EV charging points target by 2030",
      "Jurisdiction: Singapore (MPA)",
    ],
    note: "ACTIVE PROGRAMME. Singapore is positioning as a green bunkering hub. ACTION NOW: Factor Singapore port incentives into vessel selection. Monitor green corridor development for preferential routing. Owner: Ocean Product.",
  },
];

async function run() {
  let updated = 0;
  for (const r of rewrites) {
    const { error: resErr } = await supabase.from("resources").update({
      what_is_it: r.what_is_it, why_matters: r.why_matters, key_data: r.key_data, note: r.note,
    }).eq("id", r.id);
    const { error: itemErr } = await supabase.from("intelligence_items").update({
      what_is_it: r.what_is_it, why_matters: r.why_matters, key_data: r.key_data, summary: r.note,
    }).eq("legacy_id", r.id);
    if (!resErr && !itemErr) { updated++; console.log("Updated: " + r.id); }
    else console.log("ERROR " + r.id + ": " + (resErr?.message || itemErr?.message));
  }
  console.log("\nUpdated " + updated + "/" + rewrites.length + " CRITICAL resources (batch 2)");
}
run();
