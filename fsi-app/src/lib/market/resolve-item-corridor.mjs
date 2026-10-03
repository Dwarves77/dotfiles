// resolve-item-corridor.mjs - item-to-corridor resolver for carbonCostPerFeu()'s input.corridor.
// Lane L-CORRIDOR, 2026-10-03. Closes the gap docs/ops/session-log.d/2026-10-03-l12.md's addendum named
// ("the real per-FEU figure cannot reach any item detail page because a market_signal item carries
// jurisdictionIso, never a corridor object") and scoped into its own lane ("the next lane's brief should
// scope item 1 (origin/dest/mode resolution for a market_signal item) as its own deliverable").
//
// THE WO-24 RULING THIS MODULE HONOURS, NOT REVERSES (select-modal-factor.mjs's own header, cited
// verbatim there): "this module does NOT build corridor identity and does NOT invent a `cl:corridor:` id
// for a live item... collapsing a multi-country jurisdiction_iso array to 'pick one element' is
// fabricating a corridor out of a jurisdiction list". seed-corridors.mjs's own
// deriveCorridorCandidatesFromItemJurisdictions() independently reaches the same conclusion: the array
// "names the jurisdictions an item CONCERNS, with no order and no origin/destination role... picking
// element 0 as 'origin' and element 1 as 'dest' would invent a direction the data never asserted".
//
// WHAT THIS MODULE DOES NOT DO: it never assigns origin/dest roles to a jurisdiction array, and it never
// mints a new `cl:corridor:*` id. Its only operation is a LOOKUP against an EXISTING, already-minted
// seeded corridor entity (seed-corridors.mjs's own `entities` rows, kind='corridor') by comparing the
// item's jurisdiction_iso as an UNORDERED SET against the candidate corridor's own {origin country, dest
// country} set (also read as a set - never assembled by this module, see countriesOfCorridor() below).
// When a candidate matches, this module returns THAT candidate's own origin/dest/mode, verbatim,
// untouched - direction is read from the existing entity, never assigned here. This is a lookup, not an
// invention, the same distinction seed-corridors.mjs's header draws for its own fallback-to-ADR-example
// step.
//
// THREE STATES, MATCHING select-modal-factor.mjs's OWN THREE-STATE DESIGN (never collapsed to two):
// - 'resolved' - the item's jurisdiction set equals EXACTLY ONE candidate corridor's
//                              endpoint-country set, AND the item carries exactly one recorded transport
//                              mode that matches that corridor's mode (case-insensitive, exact). Only
//                              this state carries a corridor object.
// - 'ambiguous' - the item's jurisdiction set equals MORE THAN ONE candidate corridor's
//                              endpoint-country set. Decided on the COUNTRY-SET match alone, before mode
//                              is even consulted - two seeded corridors sharing one country-set are two
//                              DIFFERENT real-world routes (e.g. Shanghai->New York and Shanghai->Los
//                              Angeles both touch {CN,US}); picking one because its mode happens to match
//                              would still be inventing WHICH corridor the item means, the same class of
//                              fabrication WO-24 forbids for jurisdiction roles. This case is NOT
//                              hypothetical: seed-corridors.mjs's own NAMED_CORRIDOR_SEEDS (added lane
//                              W4.2, 2026-09-05) already seeds CNSHA-USNYC:ocean and CNSHA-USLAX:ocean
//                              side by side - both country-set {CN,US} - so a live item carrying
//                              jurisdiction_iso=["CN","US"] resolves `ambiguous` TODAY, not only in a
//                              forward-looking fixture (see this lane's own report for the live-data run).
// - 'no_corridor_identity' - everything else: a single-jurisdiction item, an empty array, a "GLOBAL"
//                              entry, a jurisdiction set matching no seeded corridor, a jurisdiction set
//                              matching exactly one corridor but with no usable single mode on the item,
//                              or a mode that does not match that corridor's own mode. Never a fourth,
//                              softer state, and never a partial match (one country right, mode wrong, is
//                              still `no_corridor_identity`, never `resolved`).
//
// MODE - read, never guessed. A market_signal item's recorded transport mode lives on `modes: string[]`
// (confirmed this lane by reading src/types/resource.ts:141 and every live consumer - 
// MarketIntelLedger.tsx, OperationsDetailSurface.tsx, AffectedLanesCard.tsx, ResearchFindingDetailSurface.
// tsx, list-surface-helpers.ts - all read `r.modes` as a string array, never a single scalar). Because the
// field is an ARRAY, the same "do not guess among several" discipline select-modal-factor.mjs applies to
// jurisdiction_iso applies here to modes: a mode match requires the item to carry EXACTLY ONE mode value,
// matching the candidate corridor's own `mode` case-insensitively. Zero modes, or more than one, is never
// an implicit match - it is `no_corridor_identity`, the same as a mode mismatch.
//
// COUNTRY DERIVATION - read from the UN/LOCODE prefix, the SAME deterministic convention
// write-entity-scope.mjs's own header documents and already uses live: "a UN/LOCODE code's first two
// characters ARE the ISO 3166-1 country code by definition (UN/ECE Recommendation 16 section I.4.b)... not an
// inference, a restatement of the coding scheme corridorSeed()/ADR-024 section 4 already requires". This module
// never re-derives that rule differently; countriesOfCorridor() below applies it identically.
//
// CANDIDATE SHAPE - injected, not fetched (lane common contract's deps-injection pattern, so tests run
// with no database). A candidate is `{ entityId, origin, dest, mode }` - the already-parsed shape of a
// live `entities WHERE kind='corridor'` row (entity_id + canonical_name, parsed by
// candidatesFromCorridorEntities() below) or of a seed-corridors.mjs FALLBACK_CORRIDOR_SEEDS entry
// (entity_id minted by candidatesFromSeeds() below via the SAME entityId()/corridorSeed() constructor
// seed-corridors.mjs itself uses - never a second, hand-rolled id). This module's own core function,
// resolveItemCorridor(), takes the already-normalized candidate array directly, so it has no opinion on
// which adapter the caller used.
//
// PLAIN ESM, ZERO NPM DEPENDENCIES, PURE - no I/O, no clock, no Supabase import, same posture as
// select-modal-factor.mjs and carbon-cost-per-feu.mjs. Deliberately does NOT import entity-id.mjs
// (which pulls in node:crypto) - this module is reachable from a "use client" component
// (MarketSignalDetailSurface.tsx, via carbon-overlay-view.mjs) and must stay esbuild/browser-bundle
// clean. A caller that wants to mint candidate ids from seed-corridors.mjs's FALLBACK_CORRIDOR_SEEDS
// objects (never fetched from a live `entities` read, e.g. a test fixture) builds its own
// {entityId, origin, dest, mode} rows using entity-id.mjs's own entityId()/corridorSeed() directly in
// that test file - this module only consumes the shape, it does not mint ids itself for either
// adapter below (candidatesFromCorridorEntities reads an entity_id that already exists on the row).

export const STATES = Object.freeze(["resolved", "ambiguous", "no_corridor_identity"]);

// Mirrors seed-corridors.mjs's own corridorSeed() output / write-entity-scope.mjs's own
// CORRIDOR_NAME_RE / corridor-scope.ts's own CORRIDOR_NAME_RE - "ORIGIN-DEST:mode". Duplicated here
// rather than imported, the same directory-boundary reasoning both of those files already give for
// duplicating it between scripts/ and src/lib/entities/: this module lives in src/lib/market/, a third
// consumer, and importing a .ts file (corridor-scope.ts) into a plain-ESM `node --test` module would
// break the no-npm resolver (the type-only SupabaseClient import aside, Node cannot execute .ts directly
// without a loader). The regex is identical; the SOURCE of truth for the convention is corridorSeed()
// itself (entity-id.mjs), which both producers and this reader all defer to for VALIDATION - this regex
// only parses a string that module already validated at mint time.
const CORRIDOR_NAME_RE = /^([A-Z]{2}[A-Z2-9]{3})-([A-Z]{2}[A-Z2-9]{3}):([a-z_]+)$/;

/** Parse a corridor entity's canonical_name ("ORIGIN-DEST:mode") back into its parts, or null when it
 *  does not match the convention seed-corridors.mjs itself writes - never guesses at a malformed name.
 *  Pure. Exported so a caller/test can probe the parser directly without building a full entity row. */
export function parseCorridorCanonicalName(name) {
  const m = String(name ?? "").match(CORRIDOR_NAME_RE);
  if (!m) return null;
  const [, origin, dest, mode] = m;
  return { origin, dest, mode };
}

/** entities rows (kind='corridor') -> this module's candidate shape, by parsing canonical_name. Pure. A
 *  row whose canonical_name does not match the convention is skipped (named in the returned `skipped`
 *  array), never guessed into a malformed candidate - same "one bad row does not sink the run" posture
 *  seed-corridors.mjs's planCorridorEntities() already uses.
 *  `rows` is [{entity_id, canonical_name}] (a live `entities WHERE kind='corridor'` read, or any
 *  caller-built fixture of the same shape).
 *  @returns {{ candidates: Array<{entityId: string, origin: string, dest: string, mode: string}>, skipped: Array }}
 */
export function candidatesFromCorridorEntities(rows) {
  const candidates = [];
  const skipped = [];
  for (const r of rows ?? []) {
    const parsed = parseCorridorCanonicalName(r?.canonical_name);
    if (!parsed) {
      skipped.push({ entity_id: r?.entity_id, canonical_name: r?.canonical_name, reason: "canonical_name does not match the ORIGIN-DEST:mode convention" });
      continue;
    }
    candidates.push({ entityId: r.entity_id, ...parsed });
  }
  return { candidates, skipped };
}

/** A candidate corridor's own {origin country, dest country} set, read off the UN/LOCODE prefix - the
 *  same deterministic UN/ECE Rec 16 section I.4.b convention write-entity-scope.mjs's deriveCorridorJurisdictionCodes()
 *  already applies live. Pure. Returns a Set<string> of 1 or 2 ISO 3166-1 alpha-2 codes (1 when origin and
 *  dest share a country - a domestic leg - never assumed to be 2). */
function countriesOfCorridor(candidate) {
  const o = String(candidate.origin ?? "").slice(0, 2).toUpperCase();
  const d = String(candidate.dest ?? "").slice(0, 2).toUpperCase();
  return new Set([o, d].filter(Boolean));
}

/** The item's own jurisdiction_iso array, normalized (trim, uppercase, drop empties) and read as an
 *  UNORDERED SET - never as an ordered origin/dest pair (WO-24). Pure. */
function itemJurisdictionSet(jurisdictionIso) {
  const arr = Array.isArray(jurisdictionIso) ? jurisdictionIso : [];
  const out = new Set();
  for (const raw of arr) {
    const norm = typeof raw === "string" ? raw.trim().toUpperCase() : "";
    if (norm) out.add(norm);
  }
  return out;
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

/** The item's own recorded single transport mode, or null when the item carries zero or more than one - 
 *  never guessed among several (same discipline select-modal-factor.mjs applies to jurisdiction_iso).
 *  Pure. `modes` is the item's own `modes: string[]` field (src/types/resource.ts). */
function itemSingleMode(modes) {
  const arr = Array.isArray(modes) ? modes.filter((m) => typeof m === "string" && m.trim()) : [];
  if (arr.length !== 1) return null;
  return arr[0].trim().toLowerCase();
}

/**
 * Resolve a market_signal item's corridor identity against an EXISTING, already-minted seeded corridor
 * set. Never invents a corridor direction or a `cl:corridor:*` id (WO-24). Pure, no I/O.
 *
 * @param {object} input
 * @param {unknown} input.jurisdictionIso  The item's raw `jurisdiction_iso` value (expected string array;
 *   tolerates null/undefined/non-array by treating it as `[]`, same tolerance select-modal-factor.mjs
 *   gives this exact column).
 * @param {unknown} [input.modes]  The item's raw `modes` value (expected string array; same tolerance).
 * @param {Array<{entityId: string, origin: string, dest: string, mode: string}>} [input.candidates]
 *   The existing seeded corridor entities to match against (see candidatesFromCorridorEntities()/
 *   candidatesFromSeeds() above) - injected, never fetched inside this module.
 * @returns {
 *   | { state: "resolved", corridor: {origin: string, dest: string, mode: string}, matchedCandidateIds: string[] }
 *   | { state: "ambiguous", corridor: null, matchedCandidateIds: string[] }
 *   | { state: "no_corridor_identity", corridor: null, matchedCandidateIds: [] }
 * }
 */
export function resolveItemCorridor({ jurisdictionIso, modes, candidates } = {}) {
  const itemSet = itemJurisdictionSet(jurisdictionIso);
  const list = Array.isArray(candidates) ? candidates : [];

  // Country-set match is decided BEFORE mode is even consulted (see header's 'ambiguous' note) - two
  // seeded corridors sharing one country-set are two different real-world routes, and picking one by
  // mode would still invent WHICH corridor the item means.
  const countryMatches = list.filter((c) => setsEqual(itemSet, countriesOfCorridor(c)));

  if (countryMatches.length === 0) {
    return { state: "no_corridor_identity", corridor: null, matchedCandidateIds: [] };
  }

  if (countryMatches.length > 1) {
    return {
      state: "ambiguous",
      corridor: null,
      matchedCandidateIds: countryMatches.map((c) => c.entityId),
    };
  }

  // Exactly one country-set match - mode is the second, final gate. No mode (zero or >1 on the item) is
  // never an implicit match.
  const candidate = countryMatches[0];
  const itemMode = itemSingleMode(modes);
  if (!itemMode || itemMode !== String(candidate.mode ?? "").trim().toLowerCase()) {
    return { state: "no_corridor_identity", corridor: null, matchedCandidateIds: [] };
  }

  return {
    state: "resolved",
    corridor: { origin: candidate.origin, dest: candidate.dest, mode: candidate.mode },
    matchedCandidateIds: [candidate.entityId],
  };
}
