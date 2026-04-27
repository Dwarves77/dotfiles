import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// HIGH priority resources — skill-standard rewrites with real data
const rewrites = [
  {
    id: "o6",
    what_is_it: "EU Monitoring, Reporting and Verification (MRV) Regulation (EU) 2015/757 (as amended) requires shipping companies to monitor, report, and verify CO₂, CH₄, and N₂O emissions from vessels ≥5,000 GT on voyages to, from, or between EU/EEA ports. Data reported via the THETIS-MRV platform operated by EMSA. MRV data feeds directly into EU ETS surrender calculations and FuelEU Maritime compliance assessments. From 2025, expanded to include general cargo ships 400-5,000 GT and offshore vessels ≥400 GT.",
    why_matters: "MRV is the data foundation for both EU ETS and FuelEU Maritime — without verified MRV reports, vessels cannot comply with either regulation. For freight forwarders: (1) MRV data determines the ETS surcharge carriers charge on each voyage, (2) forwarders need carrier MRV data to calculate Scope 3 emissions per shipment, (3) THETIS-MRV is publicly accessible — forwarders can verify carrier emissions claims, (4) reporting deadline is 31 March annually for the previous year — non-compliance leads to expulsion orders from EU ports.",
    key_data: [
      "Regulation: (EU) 2015/757 as amended by (EU) 2023/957",
      "Scope: vessels ≥5,000 GT (from 2025: cargo ships 400-5,000 GT and offshore ≥400 GT)",
      "Reporting platform: THETIS-MRV (operated by EMSA) — publicly accessible",
      "Annual report deadline: 31 March for previous year's emissions",
      "Emissions covered: CO₂ (from 2018), CH₄ + N₂O (from 2024 monitoring, ETS from 2026)",
      "Non-compliance: vessel may be issued an expulsion order from EU ports",
      "MRV data feeds: EU ETS allowance calculations + FuelEU Maritime GHG intensity",
    ],
    note: "IN FORCE. Expanded scope from 2025. MRV data is now the single source of truth for maritime carbon compliance in the EU. ACTION NOW: Access THETIS-MRV to verify carrier emissions data used for surcharge calculations. Request carrier-specific emissions factors for ISO 14083 reporting. Owner: Sustainability + Ocean Product.",
  },
  {
    id: "a4",
    what_is_it: "UK Sustainable Aviation Fuel (SAF) Mandate under the Energy Act 2023 and SAF Mandate Order 2024 requires jet fuel suppliers at UK airports to blend SAF at increasing percentages: 2% in 2025, rising to 10% by 2030 and 22% by 2040. Includes a buy-out mechanism (£4.70/litre for main SAF obligation, £5.00/litre for Power-to-Liquid) and a HEFA fuel cap starting at 2% in 2025. Enforced by UK Department for Transport.",
    why_matters: "UK-origin air cargo rates now carry SAF cost pass-through from airlines. SAF is ~3x the price of conventional jet fuel (Jet-A1). At 2% mandate, the direct cost impact is $36-58/tonne of fuel depending on SAF procurement price. For freight forwarders: (1) air freight quotes ex-UK include SAF surcharges, (2) non-compliance penalties for airlines are 2-13x the cost of compliance — airlines will comply and pass costs through, (3) UK mandate runs parallel to EU ReFuelEU — cross-channel air freight faces both, (4) cost will escalate significantly at the 10% (2030) step.",
    key_data: [
      "Mandate: 2% SAF (2025) → 10% (2030) → 22% (2040)",
      "HEFA cap: 2% (2025) rising to 7.8% (2040) — pushes toward e-fuels/PtL",
      "Buy-out price: £4.70/litre (main SAF) + £5.00/litre (PtL obligation)",
      "Non-compliance: 2-13x the cost of compliance",
      "Current SAF cost: ~3x conventional jet fuel (~$2,286/mt vs $741/mt)",
      "Applies to: all jet fuel supplied at UK airports",
      "Legal instrument: Energy Act 2023; SAF Mandate Order 2024",
    ],
    note: "IN FORCE from 1 January 2025. First compliance year. ACTION NOW: Include UK SAF surcharge in all ex-UK air freight quotes. Compare UK vs EU SAF surcharge levels for cross-channel shipments. Owner: Air Product + Sales.",
  },
  {
    id: "l7",
    what_is_it: "California Air Resources Board (CARB) Advanced Clean Trucks (ACT) Regulation requires truck manufacturers to sell increasing percentages of zero-emission vehicles as a share of annual California sales. Extends to 12+ states via Section 177 of the Clean Air Act. Class 4-8 straight trucks: 75% ZEV by 2035. Class 7-8 tractors: 40% ZEV by 2035. Complemented by the Advanced Clean Fleets (ACF) regulation requiring fleet operators to purchase ZEVs. Enforced by CARB.",
    why_matters: "ACT and ACF together will phase diesel trucks out of California and Section 177 states (covering ~40% of US truck market). For freight forwarders: (1) drayage at California ports and last-mile in CA cities will be ZEV-only progressively, (2) subcontracted trucking costs in CA will include fleet transition pass-through, (3) federal EPA waiver for Section 177 states is under legal challenge — creates compliance uncertainty, (4) carriers investing in ZEV fleets now will have cost advantages as diesel restrictions tighten.",
    key_data: [
      "ACT ZEV sales targets: Class 4-8 straight trucks 75% by 2035, tractors 40% by 2035",
      "ACF fleet purchase requirements: drayage trucks 100% ZEV purchases from 2024",
      "Section 177 states: 12+ states follow CARB rules (NY, NJ, MA, OR, WA, etc.)",
      "Coverage: ~40% of US truck sales market",
      "Federal waiver: under legal challenge — outcome uncertain",
      "Enforced by: CARB + state environmental agencies",
    ],
    note: "IN FORCE. ACT sales requirements active. ACF fleet requirements phasing in. Federal waiver challenge creates uncertainty. ACTION NOW: Survey CA/Section 177 state trucking subcontractors on ZEV fleet plans. Plan for ZEV-only drayage at LA/Long Beach ports. Owner: Road Product + Procurement.",
  },
  {
    id: "l6",
    what_is_it: "US EPA Heavy-Duty Vehicle Phase 3 GHG Emissions Standards (finalized March 2024, 89 FR 29440) set progressive CO₂ reduction targets for model year 2027-2032 heavy-duty vehicles. Establishes technology-forcing standards that effectively require significant adoption of zero-emission powertrains. Currently under active political review — may be weakened, delayed, or rescinded under current administration. Enforced by US EPA.",
    why_matters: "These standards determine the federal baseline for truck fleet emissions in the US. If upheld, they accelerate fleet electrification. If rescinded, federal pressure eases but state-level rules (CARB ACT/ACF) remain — creating a federal-state divergence. For freight forwarders: (1) fleet transition timelines for US trucking subcontractors depend on which rules survive, (2) clients' Scope 3 reporting still requires emissions data regardless of federal rollback, (3) maintaining internal emissions standards independent of regulation protects against reputational risk.",
    key_data: [
      "Published: 89 FR 29440 (March 2024)",
      "Scope: MY 2027-2032 heavy-duty vehicles",
      "Status: under political review — rescission possible",
      "CARB rules (ACT/ACF) remain independent of federal action",
      "Section 177 states follow CARB regardless of EPA outcome",
      "Enforced by: US EPA Office of Transportation and Air Quality",
    ],
    note: "REGULATORY STATUS UNCERTAIN. Under active political review. May be weakened or rescinded. ACTION NOW: Track rule status through Federal Register. Do NOT rely on federal rollback — maintain internal emissions standards. Plan fleet procurement based on CARB rules which are independent. Owner: Road Product + Legal.",
  },
  {
    id: "c6",
    what_is_it: "The GHG Protocol Corporate Value Chain (Scope 3) Standard provides the globally accepted methodology for measuring and reporting indirect value chain emissions. Published by WRI and WBCSD. Scope 3 Category 4 (Upstream Transport) and Category 9 (Downstream Transport) are the specific categories that cover freight forwarding emissions. Referenced by CSRD, ISSB/IFRS S2, SBTi, CDP, and virtually every corporate sustainability framework.",
    why_matters: "The GHG Protocol is WHY your clients ask for transport emissions data. Every sustainability questionnaire, CDP disclosure, and SBTi target your customers submit uses GHG Protocol as the accounting basis. For freight forwarders: (1) you are in your clients' Scope 3 — they need your emissions data to report, (2) inability to provide compliant data risks losing preferred-supplier status, (3) GHG Protocol requires calculation methodology aligned with ISO 14083 / GLEC Framework, (4) Scope 3 data requests are growing 30%+ annually as CSRD and ISSB expand.",
    key_data: [
      "Standard: Corporate Value Chain (Scope 3) Accounting and Reporting Standard",
      "Publisher: World Resources Institute (WRI) + WBCSD",
      "Freight categories: Category 4 (Upstream Transport), Category 9 (Downstream Transport)",
      "Referenced by: CSRD, ISSB/IFRS S2, SBTi, CDP, EcoVadis",
      "Methodology alignment: ISO 14083 / GLEC Framework v3",
    ],
    note: "ACTIVE STANDARD. Foundation for all corporate emissions accounting. ACTION NOW: Ensure your emissions reporting meets GHG Protocol Scope 3 Category 4/9 requirements. Provide proactive Scope 3 data to top clients before they ask. Owner: Sustainability.",
  },
  {
    id: "l3",
    what_is_it: "EU Alternative Fuels Infrastructure Regulation (AFIR) under Regulation (EU) 2023/1804 mandates deployment of EV charging and hydrogen refueling infrastructure along the TEN-T core and comprehensive network. Requires: EV charging stations every 60km on TEN-T core network by end of 2025, hydrogen refueling every 200km by 2030. Enforced by EU Member State competent authorities with national infrastructure deployment plans.",
    why_matters: "AFIR determines when and where electric and hydrogen trucks become operationally viable in Europe. For freight forwarders: (1) EV truck route viability depends on charging infrastructure — AFIR mandates build-out along major freight corridors, (2) hydrogen refueling at 200km intervals enables fuel-cell truck operations from 2030, (3) member state implementation varies — check national deployment plans for your operating corridors, (4) carriers with EV/H2 fleets can only serve routes where infrastructure exists.",
    key_data: [
      "EV charging: every 60km on TEN-T core network by end 2025",
      "Charging capacity: minimum 1,400 kW per station for heavy-duty vehicles",
      "Hydrogen refueling: every 200km on TEN-T core network by 2030",
      "Member state plans: national infrastructure deployment plans required",
      "Legal instrument: Regulation (EU) 2023/1804",
    ],
    note: "IN FORCE. Deployment underway but uneven across member states. ACTION NOW: Map AFIR charging/H2 infrastructure on your key European freight corridors. Factor infrastructure availability into fleet transition planning with carriers. Owner: Road Product + Operations.",
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
  console.log("\nUpdated " + updated + "/" + rewrites.length + " HIGH resources (batch 1)");
}
run();
