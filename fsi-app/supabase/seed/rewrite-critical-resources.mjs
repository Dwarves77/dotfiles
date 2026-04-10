/**
 * Rewrite CRITICAL resources with operationally grounded content.
 * Every field follows the environmental-policy-and-innovation skill standard:
 * - whatIsIt: plain language + legal instrument + jurisdiction + enforcement body
 * - whyMatters: operational impact with cost mechanisms, real figures
 * - keyData: hard data — dates, penalties, percentages, thresholds
 * - note: current enforcement status + 2025-2026 developments + action now
 *
 * Data sourced from web search April 2026.
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://kwrsbpiseruzbfwjpvsp.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3cnNicGlzZXJ1emJmd2pwdnNwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MDg1NzkzOCwiZXhwIjoyMDU2NDMzOTM4fQ.zPd4fS8kqnwGXif54aJe7zbcSdFf5-t7GXewSSfeNcE"
);

const rewrites = [
  {
    id: "o3",
    what_is_it: "The EU Emissions Trading System extended to maritime transport under Directive 2023/959 (amending Directive 2003/87/EC). Shipping companies operating vessels over 5,000 GT on voyages to, from, or between EU/EEA ports must monitor, report, and surrender EU Allowances (EUAs) for their verified CO₂ emissions. Enforced by EU Member State competent authorities. From 1 January 2026, scope expanded to include methane (CH₄) and nitrous oxide (N₂O) alongside CO₂.",
    why_matters: "Carriers pass through ETS costs as surcharges on every ocean freight invoice touching EU ports. At the current EUA price of ~€68-81/tCO₂ (Q1 2026), a typical container vessel voyage generates €50,000-200,000 in allowance costs per round trip. Freight forwarders face: (1) ETS surcharge line items from carriers that need verification, (2) customer questions about 'EU ETS included?' in tender responses, (3) risk of under-recovery or double-charging if surcharge governance is weak, (4) Scope 3 reporting requirements to allocate ETS costs to specific shipments.",
    key_data: [
      "Surrender obligation: 40% (2024) → 70% (2025) → 100% (2027 onwards)",
      "Current EUA price: ~€68-81/tCO₂ (Q1 2026), projected €85/t average 2026",
      "Scope: CO₂ from 2024, CH₄ + N₂O added from 1 January 2026",
      "Coverage: 100% intra-EU voyages, 50% of emissions from voyages into/out of EU",
      "Surrender deadline: 30 September annually for previous year's emissions",
      "~€15-25/TEU additional cost on EU port-calling container shipments",
      "Applies to vessels >5,000 GT — covers ~85% of maritime CO₂ emissions",
    ],
    note: "IN FORCE. 2026 is the 70% surrender year — carriers must surrender EUAs for 70% of 2025 verified emissions by 30 September 2026. From 2027, 100% surrender. Methane and N₂O now in scope from January 2026. ACTION NOW: Verify carrier ETS surcharge methodology matches actual allowance costs. Update contract clauses to include ETS pass-through governance. Request carrier emissions data aligned to specific voyages/ports for Scope 3 reporting. Owner: Ocean Product + Finance.",
  },
  {
    id: "o2",
    what_is_it: "FuelEU Maritime Regulation (EU) 2023/1805 mandates progressive reduction of the greenhouse gas intensity of energy used onboard ships calling at EU/EEA ports. Sets a GHG intensity limit that tightens from 2% below 2020 baseline (2025) to 80% below by 2050. Enforced by EU Member State verifying bodies. Separate from but complementary to EU ETS — FuelEU targets fuel quality while ETS targets emissions quantity.",
    why_matters: "Creates a new cost layer separate from ETS surcharges. Non-compliant vessels face a fixed penalty of €2,400 per tonne of VLSFO-equivalent GHG intensity deficit. Carriers will structure compliance costs as 'FuelEU surcharges' on freight invoices. The penalty escalates 10% for each consecutive year of non-compliance. For freight forwarders: (1) expect new surcharge line items from carriers starting 2025, (2) carriers using LNG, methanol, or biofuels may offer lower FuelEU surcharges — creating procurement leverage, (3) pooling mechanisms between vessels create complex surcharge allocation that needs monitoring.",
    key_data: [
      "GHG intensity limit: 89.34 gCO₂e/MJ (2025-2029), 2% below 2020 baseline of 91.16 gCO₂e/MJ",
      "Penalty: €2,400/tonne VLSFO-equivalent deficit, +10% per consecutive non-compliance year",
      "Phase-in: -2% (2025) → -6% (2030) → -14.5% (2035) → -31% (2040) → -62% (2045) → -80% (2050)",
      "Shore power mandate: Container ships and passenger vessels must connect to on-shore power supply at major EU ports from 2030",
      "Applies to vessels >5,000 GT calling at EU/EEA ports",
      "Compliance via: vessel pooling, banking/borrowing compliance surplus, or paying penalty",
      "Legal instrument: Regulation (EU) 2023/1805, OJ L 234, 22.9.2023",
    ],
    note: "IN FORCE from 1 January 2025. First compliance year underway. Carriers are establishing surcharge structures now. ACTION NOW: Request carrier FuelEU compliance strategy (fuel pathway, pooling arrangements). Add FuelEU surcharge line to contract templates. Compare carrier FuelEU cost pass-through to identify procurement advantage from carriers using green fuels. Owner: Ocean Product + Procurement.",
  },
  {
    id: "o1",
    what_is_it: "The 2023 IMO Strategy on Reduction of GHG Emissions from Ships, adopted at MEPC 80 (July 2023), commits global shipping to net-zero GHG emissions by or around 2050 with interim checkpoints. The strategy is implemented through the IMO Net-Zero Framework combining a Global Fuel Standard (GFI) and a carbon pricing mechanism. Approved at MEPC 83 (April 2025) but formal adoption adjourned at MEPC ES.2 (October 2025) — now scheduled for MEPC 84 (Spring 2026) with entry into force from 2028.",
    why_matters: "This is the 25-year investment signal for the entire maritime industry. Every carrier fleet decision — newbuilds, fuel contracts, engine retrofits — is shaped by these targets. For freight forwarders: (1) carriers investing ahead of the curve will have lower compliance costs and more competitive green freight rates, (2) the pricing mechanism will create a new global carbon cost layer on ocean freight separate from EU ETS, (3) US opposition (walked out of MEPC ES.2 vote) creates enforcement fragmentation on US-origin trade lanes, (4) long-term contract pricing must account for escalating decarbonization costs.",
    key_data: [
      "Targets: 20% GHG reduction by 2030 (striving 30%), 70% by 2040 (striving 80%), net-zero by ~2050",
      "Net-Zero Framework: Global Fuel Standard (GFI) + carbon pricing mechanism",
      "MEPC 83 (April 2025): framework approved in principle",
      "MEPC ES.2 (October 2025): adoption adjourned by one year — US opposition",
      "MEPC 84 (Spring 2026): implementation guidelines scheduled for approval",
      "Entry into force: 2027-2028 for mandatory instruments",
      "Applies to vessels >5,000 GT — 85% of international shipping CO₂ emissions",
      "US formally opposed at MEPC ES.2 — creates compliance fragmentation on US trade lanes",
    ],
    note: "ADOPTED IN PRINCIPLE — awaiting formal adoption at MEPC 84 (Spring 2026). US opposition creates uncertainty on enforcement for US-origin trade lanes. Framework approved 63-16-24 but key implementation details pending. ACTION NOW: Monitor MEPC 84 outcomes. Model long-term ocean freight cost scenarios with and without IMO carbon pricing. Ask carriers about their Net-Zero Framework compliance roadmap and fleet investment timeline. Do not sign long-term contracts without carbon cost escalation clauses. Owner: Ocean Product + Strategy.",
  },
  {
    id: "a3",
    what_is_it: "ReFuelEU Aviation Regulation (EU) 2023/2405 mandates increasing minimum shares of sustainable aviation fuel (SAF) in jet fuel supplied at EU airports. Sets binding blending mandates escalating from 2% (2025) to 70% (2050), with a sub-mandate for synthetic aviation fuels (e-fuels/PtL) from 2030. Enforced by EU Member State competent authorities at each airport. Published OJ L 2023/2405, 31.10.2023.",
    why_matters: "SAF costs 2-5x more than conventional jet fuel — at current prices, SAF is ~$2,286/mt vs $741/mt for conventional Jet-A1 (January 2026). Airlines pass through SAF costs as surcharges on air cargo. For freight forwarders: (1) air cargo rates from EU airports carry escalating SAF surcharges, (2) each mandate step-up (2% → 6% → 20% → 34% → 42% → 70%) will increase surcharges proportionally, (3) clients requesting 'sustainable air freight' need to understand the cost premium and that SAF availability varies by airport, (4) modal shift from air to ocean with quantified emissions savings is the primary cost mitigation strategy.",
    key_data: [
      "SAF blend mandate: 2% (2025) → 6% (2030) → 20% (2035) → 34% (2040) → 42% (2045) → 70% (2050)",
      "Synthetic fuel sub-mandate: 1.2% (2030) → 5% (2035) → 13% (2040) → 21% (2045) → 35% (2050)",
      "Current SAF price: ~$2,286/mt vs ~$741/mt conventional jet fuel (3x premium, Jan 2026)",
      "E-SAF price: up to 12x conventional jet fuel cost",
      "Global SAF production (2024): ~0.5Mt — less than 0.2% of global jet fuel demand (~300Mt)",
      "IATA projects CORSIA compliance costs reaching $1.7 billion in 2026",
      "Legal instrument: Regulation (EU) 2023/2405, OJ L 2023/2405",
    ],
    note: "IN FORCE from 1 January 2025. First compliance year (2% mandate) underway. SAF production capacity lags mandate requirements globally. ACTION NOW: Include SAF surcharge pass-through in all air freight contracts. Offer clients modal shift analysis (air → ocean) with quantified emissions and cost savings. Track SAF availability at key departure airports. Owner: Air Product + Sales.",
  },
  {
    id: "t1",
    what_is_it: "The Carbon Border Adjustment Mechanism (CBAM) under Regulation (EU) 2023/956 requires EU importers to purchase CBAM certificates reflecting the embedded carbon emissions in imported goods — steel, iron, aluminium, cement, fertilisers, hydrogen, and electricity. Fully operational from 1 January 2026 after a transitional reporting phase (2023-2025). Enforced by national competent authorities in each EU Member State. CBAM certificate price tracks the EU ETS allowance price.",
    why_matters: "From 2026, EU importers of covered goods bear the full carbon cost equivalent to what EU producers pay under ETS. For freight forwarders: (1) customs clearance workflows change — only authorized CBAM declarants can import covered goods (>12,000 operators applied by January 2026, >4,100 approved), (2) importers must report embedded emissions in each shipment, (3) forwarders handling steel/aluminium/cement freight need to verify CBAM declarant registration numbers before customs clearance, (4) CBAM certificate sales postponed to 1 February 2027 — price will track EU ETS quarterly average (~€68-81/tCO₂).",
    key_data: [
      "Full application: 1 January 2026 (transitional phase ended 31 December 2025)",
      "Covered goods: steel, iron, aluminium, cement, fertilisers, hydrogen, electricity",
      "De minimis: shipments >50 tonnes require authorized declarant status",
      "Authorized declarant deadline: 31 March 2026 for existing importers",
      "Certificate sales start: 1 February 2027 (postponed from January 2026)",
      "Certificate price: tracks EU ETS allowance price (~€68-81/tCO₂ Q1 2026)",
      ">12,000 operators applied, >4,100 approved as authorized declarants (January 2026)",
      "10,483 import declarations with CBAM goods validated in first week of 2026",
      "Legal instrument: Regulation (EU) 2023/956, OJ L 130, 16.5.2023",
    ],
    note: "IN FORCE — full compliance regime operational since 1 January 2026. Transitional phase complete. ACTION NOW: Verify all EU importers of covered goods have authorized declarant status (deadline 31 March 2026). Update customs documentation workflows to capture CBAM data. Train customs brokerage teams on CBAM reporting requirements. Owner: Customs + Compliance.",
  },
  {
    id: "g2",
    what_is_it: "The Packaging and Packaging Waste Regulation (EU) 2025/40 (PPWR) replaces the 1994 Packaging Directive with directly applicable rules on packaging recyclability, reuse targets, recycled content minimums, and restrictions on certain packaging formats. Published OJ 2025/40, entered into force 11 February 2025, generally applicable from 12 August 2026. Enforced by EU Member State market surveillance authorities.",
    why_matters: "Every piece of packaging on every EU-bound shipment must comply — cartons, pallet wrap, protective materials, crating. For freight forwarders: (1) non-compliant packaging may be rejected at EU borders from August 2026, (2) wooden crating must meet both ISPM 15 AND recyclability criteria, (3) reuse targets of 40% by 2030 and 70% by 2040 for transport packaging will change procurement of crating materials, (4) recyclability criteria under Article 6 (delegated acts due January 2028) will define exactly which materials are acceptable, (5) PFAS substance restrictions affect many current protective packaging materials.",
    key_data: [
      "Application date: 12 August 2026 (entered into force 11 February 2025)",
      "Reuse targets (transport packaging): 40% by 2030, 70% by 2040",
      "Recycled content: 35% for contact-sensitive packaging by 2030, 65% by 2040",
      "Article 6 recyclability delegated acts: due January 2028",
      "PFAS restrictions: ban on intentionally added PFAS in food-contact packaging",
      "Mandatory EPR (Extended Producer Responsibility) for all packaging placed on EU market",
      "Legal instrument: Regulation (EU) 2025/40, OJ L 2025/40",
    ],
    note: "IN FORCE — applicable from 12 August 2026. Implementation guidance still being developed. Key delegated acts on recyclability criteria due 2028. ACTION NOW: Audit all packaging materials used for EU-bound shipments against recyclability requirements. Identify PFAS-containing materials that need replacement. Begin transition planning for reusable transport packaging. Owner: Operations + Sustainability.",
  },
];

async function run() {
  let updated = 0;
  for (const r of rewrites) {
    // Update legacy resources table
    const { error: resErr } = await supabase.from("resources").update({
      what_is_it: r.what_is_it,
      why_matters: r.why_matters,
      key_data: r.key_data,
      note: r.note,
    }).eq("id", r.id);

    // Update intelligence_items table
    const { error: itemErr } = await supabase.from("intelligence_items").update({
      what_is_it: r.what_is_it,
      why_matters: r.why_matters,
      key_data: r.key_data,
      summary: r.note,
    }).eq("legacy_id", r.id);

    if (!resErr && !itemErr) {
      updated++;
      console.log("Updated: " + r.id);
    } else {
      console.log("ERROR " + r.id + ": " + (resErr?.message || itemErr?.message));
    }
  }
  console.log("\nUpdated " + updated + "/" + rewrites.length + " CRITICAL resources");
}

run();
