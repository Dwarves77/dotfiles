const jurisdictionsOf = (item) => (Array.isArray(item?.jurisdictionIso) ? item.jurisdictionIso : []);

const RULES = Object.freeze([
  // ── "Directly binding on the forwarder" (spec-01 §1, table 1) ──────────────────────────────────
  {
    position: "direct_duty",
    citation: "spec-01 §1 table 1 — CountEmissions EU, Regulation (EU) 2026/1030",
    label: "CountEmissions EU",
    test: /countemissions|2026\/1030|32026r1030/,
  },
  {
    position: "direct_duty",
    citation: "spec-01 §1 table 1 — CBAM, when acting as indirect customs representative",
    label: "CBAM",
    // Identity alternatives only: the acronym and the instrument number (Regulation (EU) 2023/956, CELEX
    // 32023R0956). The generic phrase is NOT identity: it also names the UK mechanism and other instruments, so
    // it counts only for an EU item.
    test: /\bcbam\b|\b2023\/956\b|32023r0956/,
    generic: { phrase: /carbon border adjustment/g, acceptedFor: (item) => jurisdictionsOf(item).includes("EU") },
  },
  {
    position: "direct_duty",
    citation: "spec-01 §1 table 1 — Empowering Consumers Directive (EU) 2024/825",
    label: "Empowering Consumers Directive",
    test: /empowering consumers|2024\/825|32024l0825/,
  },
  {
    position: "direct_duty",
    citation: "spec-01 §1 table 1 — PPWR, Regulation (EU) 2025/40",
    label: "PPWR",
    // Identity alternatives only. "packaging and packaging waste" is the title phrase of the 1994 directive, its
    // amendments, derogation decisions and national producer regulations (census indices 51, 103, 164): never PPWR.
    test: /\bppwr\b|\b2025\/40\b|32025r0040/,
    generic: { phrase: /packaging and packaging waste/g, acceptedFor: () => false },
  },
  {
    position: "direct_duty",
    citation: "spec-01 §1 table 1 — SOLAS VGM (binds the named shipper; forwarders routinely assume it as agent)",
    label: "SOLAS VGM",
    test: /solas\b.*\bvgm\b|verified gross mass/,
  },
  {
    position: "direct_duty",
    citation: "spec-01 §1 table 1 — CSRD (largest forwarding groups only, but the instrument itself is a direct duty)",
    label: "CSRD",
    test: /\bcsrd\b|corporate sustainability reporting directive/,
  },

  // ── "Reaches the forwarder as carrier pass-through (a price, not a duty)" (spec-01 §1, table 2) ──
  {
    position: "carrier_passthrough",
    citation: "spec-01 §1 table 2 — EU ETS maritime",
    label: "EU ETS maritime",
    test: /eu ets\b.*maritime|maritime.*\beu ets\b|emissions trading.*maritime/,
  },
  {
    position: "carrier_passthrough",
    citation: "spec-01 §1 table 2 — FuelEU Maritime",
    label: "FuelEU Maritime",
    test: /fueleu maritime/,
  },
  {
    position: "carrier_passthrough",
    citation: "spec-01 §1 table 2 — ReFuelEU Aviation",
    label: "ReFuelEU Aviation",
    test: /refueleu aviation/,
  },
  {
    position: "carrier_passthrough",
    citation: "spec-01 §1 table 2 — CORSIA",
    label: "CORSIA",
    test: /\bcorsia\b/,
  },
  {
    position: "carrier_passthrough",
    citation: "spec-01 §1 table 2 — EU ETS2 (from 2028)",
    label: "EU ETS2",
    test: /eu ets\s*2\b|ets2\b/,
  },
  {
    position: "carrier_passthrough",
    citation: "spec-01 §1 table 2 — IMO CII/EEXI",
    label: "IMO CII carbon intensity indicator",
    test: /\bcii\b.*carbon intensity|carbon intensity indicator|\beexi\b/,
  },
  {
    position: "carrier_passthrough",
    citation: "spec-01 §1 table 2 — IMO Net-Zero Framework (adopted 2026, not yet law)",
    label: "IMO Net-Zero Framework",
    test: /imo net-zero framework|net-zero framework.*\bimo\b/,
  },

  // ── "Reaches the forwarder through customer contracts (data demands, not statutory duty)" (spec-01 §1, table 3) ──
  {
    position: "customer_contract",
    citation: "spec-01 §1 table 3 — CSDDD supplier codes",
    label: "CSDDD",
    test: /\bcsddd\b|corporate sustainability due diligence directive/,
  },
  {
    position: "customer_contract",
    citation: "spec-01 §1 table 3 — EUDR due-diligence statement references",
    label: "EUDR",
    test: /\beudr\b|eu deforestation regulation/,
  },
  {
    position: "customer_contract",
    citation: "spec-01 §1 table 3 — SBTi customer targets",
    label: "SBTi",
    test: /\bsbti\b|science based targets initiative/,
  },
]);

/**
 * Test a lower-cased haystack against the rule table. A rule that carries a `generic` alternative has that phrase
 * removed from the haystack first unless the rule accepts it for this item (CBAM: an EU item), so a generic title
 * phrase never classifies another instrument (OBL-1 register section 8 item 9).
 */
function matchRules(haystack, item) {
  if (!haystack) return null;
  for (const rule of RULES) {
    let text = haystack;
    if (rule.generic && !rule.generic.acceptedFor(item)) text = haystack.replace(rule.generic.phrase, " ");
    if (rule.test.test(text)) return { position: rule.position, citation: rule.citation };
    if (rule.generic && rule.generic.acceptedFor(item) && rule.generic.phrase.test(haystack)) {
      rule.generic.phrase.lastIndex = 0;
      return { position: rule.position, citation: rule.citation };
    }
    if (rule.generic) rule.generic.phrase.lastIndex = 0;
  }
  return null;
}

const joinLower = (parts) =>
  parts.filter((s) => typeof s === "string" && s.length > 0).join(" ").toLowerCase();

/**
 * Classify by the instrument's IDENTITY only: legal instrument, short name and the identifiers the schema holds
 * (instrument_identifier, canonical_instrument_key). Never the title, and never a generic phrase, so an identity
 * match is exactly a named spec 01 instrument. Lane OBL-2: the order in derive-obligations is identity, then the
 * record-facts claim, then the title.
 * @param {{ legalInstrument?: string|null, shortName?: string|null, instrumentIdentifiers?: Array<string|null|undefined> }} item
 * @returns {{ position: string, citation: string } | null}
 */
export function classifyInstrumentIdentity(item) {
  const hay = joinLower([item?.legalInstrument, item?.shortName, ...(Array.isArray(item?.instrumentIdentifiers) ? item.instrumentIdentifiers : [])]);
  // identity text never accepts a generic phrase: pass an item with no jurisdiction
  return matchRules(hay, {});
}

/**
 * Classify one item's binding_position, deterministically. Returns the BINDING_POSITION code, or
 * `null` when the item matches none of spec-01 §1's named instruments ("not yet classified" — a real,
 * distinct state from `monitoring_only`, never guessed). A generic title phrase (see `generic` on a rule) counts
 * only where the rule accepts it for the item (`jurisdictionIso`).
 *
 * @param {{ title?: string|null, legalInstrument?: string|null, shortName?: string|null, jurisdictionIso?: string[]|null }} item
 * @returns {{ position: string, citation: string } | null}
 */
export function classifyBindingPosition(item) {
  return matchRules(joinLower([item?.title, item?.legalInstrument, item?.shortName]), item);
}

/** The rule table, exposed read-only for tests and for an audit UI that wants to show the mapping. */
export const BINDING_POSITION_RULES = RULES;
