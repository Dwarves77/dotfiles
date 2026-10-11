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
