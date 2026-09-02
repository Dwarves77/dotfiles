// classify-binding-position.mjs — deterministic binding_position classification for the obligation
// register (Lane OBLIG, 2026-09-02).
//
// WHY THIS EXISTS. `binding_position` (src/lib/contracts/vocabularies.mjs BINDING_POSITION) is a fully
// defined 4-value enum with zero consumers anywhere in the repo outside its own module and test —
// docs/specs/01-regulations.md §1 names it "the single most important new field on this surface... more
// important than any UI work", and it has never been written to a single row. This module is what
// starts writing it, for the obligation register (migration 290's `obligations.binding_position`).
//
// DETERMINISTIC, NOT INVENTED. No LLM, no fetch, $0 (COMMON lane contract). The mapping below is lifted
// VERBATIM from spec-01 §1's own three tables ("Directly binding on the forwarder", "Reaches the
// forwarder as carrier pass-through", "Reaches the forwarder through customer contracts") — every entry
// carries a comment citing which spec-01 §1 row it is, so the mapping is auditable against the spec
// text it comes from, not a guess dressed as classification. An item whose title/legal citation matches
// none of these entries returns `null` ("not yet classified") rather than a guessed value — spec-01's
// own instrument table is explicitly non-exhaustive ("Almost nothing in the freight sustainability
// landscape binds a forwarder directly"), and the corpus carries hundreds of items this small, curated
// table was never meant to cover.
//
// MATCH SURFACE: `title` (and, where present, `legalInstrument`/`shortName`) — free text, matched by a
// keyword/citation regex per entry. This is the same class of matching `instrument-identity.ts` already
// does for EU ELI/CELEX citations (facts parsed out of the source text, no legal interpretation of what
// an instrument requires); this module does not import that one because most of spec-01 §1's named
// instruments (SOLAS VGM, IMO CII/EEXI, CORSIA, EUDR, CSDDD, SBTi) are not EU regulations/directives and
// carry no ELI/CELEX citation for it to parse — title/citation keyword matching is the only signal this
// corpus has for them today.
//
// PURE. Takes a plain `{ title, legalInstrument, shortName }` object (never a live client), so it is
// usable from the derivation script, a read model, or a future UI classifier preview with zero I/O.

/**
 * One entry per spec-01 §1 instrument row. `test` matches against the combined haystack (title +
 * legalInstrument + shortName, lower-cased). `position` is the exact BINDING_POSITION code.
 * `citation` names the spec-01 §1 table row this entry reproduces, for audit.
 */
const RULES = Object.freeze([
  // ── "Directly binding on the forwarder" (spec-01 §1, table 1) ──────────────────────────────────
  {
    position: "direct_duty",
    citation: "spec-01 §1 table 1 — CountEmissions EU, Regulation (EU) 2026/1030",
    test: /countemissions|2026\/1030|32026r1030/,
  },
  {
    position: "direct_duty",
    citation: "spec-01 §1 table 1 — CBAM, when acting as indirect customs representative",
    test: /\bcbam\b|carbon border adjustment/,
  },
  {
    position: "direct_duty",
    citation: "spec-01 §1 table 1 — Empowering Consumers Directive (EU) 2024/825",
    test: /empowering consumers|2024\/825|32024l0825/,
  },
  {
    position: "direct_duty",
    citation: "spec-01 §1 table 1 — PPWR, Regulation (EU) 2025/40",
    test: /\bppwr\b|packaging and packaging waste|2025\/40\b|32025r0040/,
  },
  {
    position: "direct_duty",
    citation: "spec-01 §1 table 1 — SOLAS VGM (binds the named shipper; forwarders routinely assume it as agent)",
    test: /solas\b.*\bvgm\b|verified gross mass/,
  },
  {
    position: "direct_duty",
    citation: "spec-01 §1 table 1 — CSRD (largest forwarding groups only, but the instrument itself is a direct duty)",
    test: /\bcsrd\b|corporate sustainability reporting directive/,
  },

  // ── "Reaches the forwarder as carrier pass-through (a price, not a duty)" (spec-01 §1, table 2) ──
  {
    position: "carrier_passthrough",
    citation: "spec-01 §1 table 2 — EU ETS maritime",
    test: /eu ets\b.*maritime|maritime.*\beu ets\b|emissions trading.*maritime/,
  },
  {
    position: "carrier_passthrough",
    citation: "spec-01 §1 table 2 — FuelEU Maritime",
    test: /fueleu maritime/,
  },
  {
    position: "carrier_passthrough",
    citation: "spec-01 §1 table 2 — ReFuelEU Aviation",
    test: /refueleu aviation/,
  },
  {
    position: "carrier_passthrough",
    citation: "spec-01 §1 table 2 — CORSIA",
    test: /\bcorsia\b/,
  },
  {
    position: "carrier_passthrough",
    citation: "spec-01 §1 table 2 — EU ETS2 (from 2028)",
    test: /eu ets\s*2\b|ets2\b/,
  },
  {
    position: "carrier_passthrough",
    citation: "spec-01 §1 table 2 — IMO CII/EEXI",
    test: /\bcii\b.*carbon intensity|carbon intensity indicator|\beexi\b/,
  },
  {
    position: "carrier_passthrough",
    citation: "spec-01 §1 table 2 — IMO Net-Zero Framework (adopted 2026, not yet law)",
    test: /imo net-zero framework|net-zero framework.*\bimo\b/,
  },

  // ── "Reaches the forwarder through customer contracts (data demands, not statutory duty)" (spec-01 §1, table 3) ──
  {
    position: "customer_contract",
    citation: "spec-01 §1 table 3 — CSDDD supplier codes",
    test: /\bcsddd\b|corporate sustainability due diligence directive/,
  },
  {
    position: "customer_contract",
    citation: "spec-01 §1 table 3 — EUDR due-diligence statement references",
    test: /\beudr\b|eu deforestation regulation/,
  },
  {
    position: "customer_contract",
    citation: "spec-01 §1 table 3 — SBTi customer targets",
    test: /\bsbti\b|science based targets initiative/,
  },
]);

/**
 * Classify one item's binding_position, deterministically. Returns the BINDING_POSITION code, or
 * `null` when the item matches none of spec-01 §1's named instruments ("not yet classified" — a real,
 * distinct state from `monitoring_only`, never guessed).
 *
 * @param {{ title?: string|null, legalInstrument?: string|null, shortName?: string|null }} item
 * @returns {{ position: string, citation: string } | null}
 */
export function classifyBindingPosition(item) {
  const haystack = [item?.title, item?.legalInstrument, item?.shortName]
    .filter((s) => typeof s === "string" && s.length > 0)
    .join(" ")
    .toLowerCase();
  if (!haystack) return null;
  for (const rule of RULES) {
    if (rule.test.test(haystack)) return { position: rule.position, citation: rule.citation };
  }
  return null;
}

/** The rule table, exposed read-only for tests and for an audit UI that wants to show the mapping. */
export const BINDING_POSITION_RULES = RULES;
