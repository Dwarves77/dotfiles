// Run: node --test src/lib/market/resolve-item-corridor.test.mjs - pure, no DB, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveItemCorridor,
  candidatesFromCorridorEntities,
  parseCorridorCanonicalName,
  STATES,
} from "./resolve-item-corridor.mjs";
import { carbonCostPerFeu } from "./carbon-cost-per-feu.mjs";
import { entityId, corridorSeed } from "../entities/entity-id.mjs";
import { ADR_EXAMPLE_CORRIDORS, NAMED_CORRIDOR_SEEDS } from "../../../scripts/entities/seed-corridors.mjs";

// Test-only adapter (never imported by resolve-item-corridor.mjs itself - that module stays
// node:crypto-free so it can be bundled into the "use client" detail-surface chain; see that file's
// own header). Mints a candidate id the SAME way seed-corridors.mjs mints a live corridor entity id
// (entityId('corridor', corridorSeed(s))), never a second, hand-rolled id scheme.
function candidatesFromSeeds(seeds) {
  return (seeds ?? []).map((s) => ({
    entityId: entityId("corridor", corridorSeed(s)),
    origin: String(s.origin).toUpperCase(),
    dest: String(s.dest).toUpperCase(),
    mode: s.mode,
  }));
}

// The one live seeded example per the 2026-10-03-w4 README/brief: CNSHA-NLRTM, ocean.
const CNSHA_NLRTM = candidatesFromSeeds(ADR_EXAMPLE_CORRIDORS)[0];

// The full live fallback set (ADR example + the three WCI-named lanes, lane W4.2, 2026-09-05), used for
// the ambiguous case below - CNSHA-USNYC and CNSHA-USLAX both carry country-set {CN,US}.
const ALL_FALLBACK_CANDIDATES = candidatesFromSeeds([...ADR_EXAMPLE_CORRIDORS, ...NAMED_CORRIDOR_SEEDS]);

test("STATES names exactly the three-state design, matching select-modal-factor.mjs's own shape", () => {
  assert.deepEqual(STATES, ["resolved", "ambiguous", "no_corridor_identity"]);
});

// ── parseCorridorCanonicalName (reused convention) ──────────────────────────────────────────────────────

test("parseCorridorCanonicalName parses seed-corridors.mjs's own ORIGIN-DEST:mode convention", () => {
  assert.deepEqual(parseCorridorCanonicalName("CNSHA-NLRTM:ocean"), { origin: "CNSHA", dest: "NLRTM", mode: "ocean" });
});

test("parseCorridorCanonicalName returns null on a non-matching string, never guesses", () => {
  assert.equal(parseCorridorCanonicalName("not-a-corridor"), null);
  assert.equal(parseCorridorCanonicalName(null), null);
});

// ── candidatesFromCorridorEntities (live-entities-row adapter) ─────────────────────────────────────────

test("candidatesFromCorridorEntities parses a live entities row and skips an unparsable one", () => {
  const { candidates, skipped } = candidatesFromCorridorEntities([
    { entity_id: "cl:corridor:abc", canonical_name: "CNSHA-NLRTM:ocean" },
    { entity_id: "cl:corridor:bad", canonical_name: "garbage" },
  ]);
  assert.deepEqual(candidates, [{ entityId: "cl:corridor:abc", origin: "CNSHA", dest: "NLRTM", mode: "ocean" }]);
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0].entity_id, "cl:corridor:bad");
});

// ── the seven required cases (a-g, per the brief) ───────────────────────────────────────────────────────

test("(a) single-jurisdiction item -> no_corridor_identity", () => {
  const r = resolveItemCorridor({ jurisdictionIso: ["CN"], modes: ["ocean"], candidates: [CNSHA_NLRTM] });
  assert.equal(r.state, "no_corridor_identity");
  assert.equal(r.corridor, null);
  assert.deepEqual(r.matchedCandidateIds, []);
});

test("(b) empty jurisdiction array -> no_corridor_identity", () => {
  const r = resolveItemCorridor({ jurisdictionIso: [], modes: ["ocean"], candidates: [CNSHA_NLRTM] });
  assert.equal(r.state, "no_corridor_identity");
});

test('(c) ["GLOBAL"] -> no_corridor_identity', () => {
  const r = resolveItemCorridor({ jurisdictionIso: ["GLOBAL"], modes: ["ocean"], candidates: [CNSHA_NLRTM] });
  assert.equal(r.state, "no_corridor_identity");
});

test("(d) two-country set exactly matching CNSHA/NLRTM + matching mode -> resolved, corridor identical to the seeded entity (no direction invented)", () => {
  const r = resolveItemCorridor({ jurisdictionIso: ["NL", "CN"], modes: ["ocean"], candidates: [CNSHA_NLRTM] });
  assert.equal(r.state, "resolved");
  assert.deepEqual(r.corridor, { origin: "CNSHA", dest: "NLRTM", mode: "ocean" });
  assert.deepEqual(r.matchedCandidateIds, [CNSHA_NLRTM.entityId]);
  // Explicit equality proof, per the brief: the returned corridor is the SEEDED entity's own
  // origin/dest/mode, untouched - this module never assembled a direction from the jurisdiction array
  // (the array here is given in the REVERSE order, ["NL","CN"], and the resolved corridor still reads
  // CNSHA -> NLRTM, the entity's own stored direction, not an order lifted from the input array).
  assert.equal(r.corridor.origin, ADR_EXAMPLE_CORRIDORS[0].origin);
  assert.equal(r.corridor.dest, ADR_EXAMPLE_CORRIDORS[0].dest);
  assert.equal(r.corridor.mode, ADR_EXAMPLE_CORRIDORS[0].mode);
});

test("(e) same two countries, mode mismatch -> no_corridor_identity", () => {
  const r = resolveItemCorridor({ jurisdictionIso: ["CN", "NL"], modes: ["air"], candidates: [CNSHA_NLRTM] });
  assert.equal(r.state, "no_corridor_identity");
});

test("(f) same two countries, no mode on the item at all -> no_corridor_identity (never an implicit match)", () => {
  const r = resolveItemCorridor({ jurisdictionIso: ["CN", "NL"], modes: [], candidates: [CNSHA_NLRTM] });
  assert.equal(r.state, "no_corridor_identity");
  const r2 = resolveItemCorridor({ jurisdictionIso: ["CN", "NL"], modes: undefined, candidates: [CNSHA_NLRTM] });
  assert.equal(r2.state, "no_corridor_identity");
  // More than one mode on the item is the same "no single basis to pick" failure, never a guess.
  const r3 = resolveItemCorridor({ jurisdictionIso: ["CN", "NL"], modes: ["ocean", "air"], candidates: [CNSHA_NLRTM] });
  assert.equal(r3.state, "no_corridor_identity");
});

test("(g) two seeded candidates whose endpoint sets both match the item's jurisdiction set -> ambiguous (forward-looking per the ruling, exercised against an injected fixture candidate set larger than today's)", () => {
  // Injected fixture: two candidates sharing country-set {CN,JP} - a forward-looking case, not today's
  // live seed set (see the next test for the ALREADY-LIVE ambiguous case this lane found).
  const fixtureCandidates = [
    ...ALL_FALLBACK_CANDIDATES,
    { entityId: "cl:corridor:fixture1", origin: "CNSHA", dest: "JPTYO", mode: "ocean" },
    { entityId: "cl:corridor:fixture2", origin: "CNSHA", dest: "JPYOK", mode: "ocean" },
  ];
  const r = resolveItemCorridor({ jurisdictionIso: ["JP", "CN"], modes: ["ocean"], candidates: fixtureCandidates });
  assert.equal(r.state, "ambiguous");
  assert.equal(r.corridor, null);
  assert.deepEqual(new Set(r.matchedCandidateIds), new Set(["cl:corridor:fixture1", "cl:corridor:fixture2"]));
});

// ── correction to the README/brief's premise, found by reading seed-corridors.mjs in full (CLAUDE.md
// rule 14: a finding is verified and labeled, not silently assumed) ────────────────────────────────────

test("[CONFIRMED] the ambiguous case is ALREADY LIVE today, not only forward-looking: seed-corridors.mjs's own FALLBACK_CORRIDOR_SEEDS (lane W4.2, 2026-09-05) seeds CNSHA-USNYC:ocean and CNSHA-USLAX:ocean side by side, both country-set {CN,US} - a real market_signal item carrying jurisdictionIso=['CN','US'] and modes=['ocean'] resolves ambiguous against the real live seed set, no fixture needed", () => {
  const r = resolveItemCorridor({
    jurisdictionIso: ["CN", "US"],
    modes: ["ocean"],
    candidates: ALL_FALLBACK_CANDIDATES,
  });
  assert.equal(r.state, "ambiguous");
  const byDest = new Map(ALL_FALLBACK_CANDIDATES.map((c) => [c.dest, c.entityId]));
  assert.deepEqual(new Set(r.matchedCandidateIds), new Set([byDest.get("USNYC"), byDest.get("USLAX")]));
});

// ── mode is decided only AFTER the country-set is unambiguous ──────────────────────────────────────────

test("a country-set match that is unambiguous (CNSHA-NLRTM is the only {CN,NL} candidate in the full fallback set) still gates correctly on mode", () => {
  const resolved = resolveItemCorridor({ jurisdictionIso: ["CN", "NL"], modes: ["ocean"], candidates: ALL_FALLBACK_CANDIDATES });
  assert.equal(resolved.state, "resolved");
  const mismatched = resolveItemCorridor({ jurisdictionIso: ["CN", "NL"], modes: ["road"], candidates: ALL_FALLBACK_CANDIDATES });
  assert.equal(mismatched.state, "no_corridor_identity");
});

test("no candidate matches the country-set at all -> no_corridor_identity, not ambiguous, not a crash", () => {
  const r = resolveItemCorridor({ jurisdictionIso: ["BR", "AR"], modes: ["ocean"], candidates: ALL_FALLBACK_CANDIDATES });
  assert.equal(r.state, "no_corridor_identity");
});

test("malformed/non-array jurisdictionIso and modes never throw - honest no_corridor_identity instead", () => {
  assert.equal(resolveItemCorridor({ jurisdictionIso: null, modes: null, candidates: [CNSHA_NLRTM] }).state, "no_corridor_identity");
  assert.equal(resolveItemCorridor({ jurisdictionIso: undefined, candidates: [CNSHA_NLRTM] }).state, "no_corridor_identity");
  assert.equal(resolveItemCorridor({ candidates: [CNSHA_NLRTM] }).state, "no_corridor_identity");
  assert.equal(resolveItemCorridor().state, "no_corridor_identity");
});

// ── integration: a `resolved` result's corridor feeds carbonCostPerFeu()'s input.corridor with no
// second implementation of the cost math, and does not throw the required-field error ─────────────────

test("integration: a resolved corridor object satisfies carbonCostPerFeu()'s input.corridor contract without throwing", () => {
  const r = resolveItemCorridor({ jurisdictionIso: ["CN", "NL"], modes: ["ocean"], candidates: [CNSHA_NLRTM] });
  assert.equal(r.state, "resolved");

  // No factor/distance/payload/carbonPrice supplied - carbonCostPerFeu() must return the honest
  // ok:false GAP shape (today's live state, per docs/ops/session-log.d/2026-10-03-l12.md), but it must
  // NOT throw the "input.corridor = { origin, dest, mode } is required" error this resolver's whole job
  // is to prevent.
  assert.doesNotThrow(() => carbonCostPerFeu({ corridor: r.corridor }));
  const feu = carbonCostPerFeu({ corridor: r.corridor });
  assert.equal(feu.ok, false);
  assert.deepEqual(feu.corridor, r.corridor);
  assert.ok(feu.gaps.length > 0, "every input is still an honest gap today - this lane supplies corridor only");
});

test("integration: a no_corridor_identity result's corridor (null) correctly throws carbonCostPerFeu()'s own required-field error - this lane never papers over that gate", () => {
  const r = resolveItemCorridor({ jurisdictionIso: ["CN"], modes: ["ocean"], candidates: [CNSHA_NLRTM] });
  assert.equal(r.state, "no_corridor_identity");
  assert.throws(() => carbonCostPerFeu({ corridor: r.corridor }), /input\.corridor = \{ origin, dest, mode \} is required/);
});
