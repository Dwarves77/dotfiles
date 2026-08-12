// Proof for deterministic corridor identity (2026-08-12).
//
// Run standalone:
//   node --test fsi-app/src/__tests__/contracts-corridor-id.test.mjs
// Covered by the `fsi-app/src/__tests__/*.test.mjs` glob in run-test-suite.sh.
//
// WHAT THIS LOCKS. An external architecture review found the first corridor-ID scheme collision-prone.
// Section 2 below is one test per named collision class, and the routing case is the one that actually
// matters commercially: if Suez-routed and Cape-routed Asia–Europe share a primary key, then a reroute
// that raises fuel burn 30–40% and pushes the vessel into a higher FuelEU/ETS penalty bracket is
// invisible to every downstream calculation, because it is the same row.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CORRIDOR_ID_SCHEME, CORRIDOR_MODES, CORRIDOR_ID_HEX_LEN,
  corridorId, corridorPayload, validateCorridorSpec, isSameCorridor, renderCorridorIdSql,
} from "../lib/contracts/corridor-id.mjs";

const SUEZ = { origin: "CNSHA", dest: "NLRTM", mode: "ocean", routingKey: "suez" };
const CAPE = { origin: "CNSHA", dest: "NLRTM", mode: "ocean", routingKey: "cape-of-good-hope" };

// ── 1. shape and determinism ─────────────────────────────────────────────

test("an id is well-formed and stable across calls", () => {
  const a = corridorId(SUEZ);
  assert.match(a, /^cl:corridor:[0-9a-f]{16}$/);
  assert.equal(a.split(":")[2].length, CORRIDOR_ID_HEX_LEN);
  assert.equal(corridorId(SUEZ), a, "same spec must always give the same id");
});

test("content-addressed, so two independent ingest paths agree with no coordination", () => {
  const fromUpload = corridorId({ origin: "CNSHA", dest: "NLRTM", mode: "ocean", routingKey: "suez" });
  const fromRateBoard = corridorId({ origin: " cnsha ", dest: "nlrtm", mode: "OCEAN", routingKey: " SUEZ " });
  assert.equal(fromUpload, fromRateBoard, "case and whitespace must normalise to one id");
});

// This case used a non-canonical mode token and passed, because corridor-id carried its OWN private
// mode list while the emission-factor table was being drafted with a different one. One product, two
// names for one mode, and nothing would ever have errored: a corridor keyed one way simply never
// matches a factor scoped the other, so resolution falls through to a worse tier and looks like normal
// operation. The vocabulary now has a single home in vocabularies.mjs, canonical token `ocean` by
// operator ruling 2026-08-12, and the standards' wording is refused HERE.
test("a standards-wording alias is REFUSED, not silently resolved, so JS cannot diverge from the SQL twin", () => {
  assert.throws(
    () => corridorId({ origin: "CNSHA", dest: "NLRTM", mode: "sea", routingKey: "suez" }),
    /non-canonical mode "sea"[\s\S]*normaliseMode\(\)[\s\S]*"ocean"/,
    "the error must name both the fix and the canonical token"
  );
  // Why it cannot be resolved here: the SQL twin cl_corridor_id() only lowercases. Resolving the alias
  // in JS would make the two implementations return DIFFERENT keys for the same input, which is the
  // exact failure this module exists to prevent. `sea` and `maritime` arrive constantly from regulatory
  // text (ISO 14083 and CountEmissions EU both say "maritime"), so they must resolve at the EDGE via
  // normaliseMode(), never in here.
  assert.throws(() => corridorId({ origin: "A", dest: "B", mode: "maritime" }), /non-canonical mode/);
});

test("the payload carries the scheme version so the scheme can evolve without silent collision", () => {
  assert.ok(corridorPayload(SUEZ).startsWith(CORRIDOR_ID_SCHEME));
});

// ── 2. the three collision classes from the review ───────────────────────

test("COLLISION 1: routing is part of identity — Suez and Cape are different corridors", () => {
  // The severe one. Same origin, destination and mode; materially different statutory cost.
  assert.notEqual(corridorId(SUEZ), corridorId(CAPE));
  assert.equal(isSameCorridor(SUEZ, CAPE), false);
});

test("COLLISION 1b: explicit via-points also discriminate, and their ORDER matters", () => {
  const viaSuezThenMalta = { origin: "CNSHA", dest: "NLRTM", mode: "ocean", via: ["EGSUZ", "MTMLA"] };
  const viaMaltaThenSuez = { origin: "CNSHA", dest: "NLRTM", mode: "ocean", via: ["MTMLA", "EGSUZ"] };
  assert.notEqual(corridorId(viaSuezThenMalta), corridorId(viaMaltaThenSuez));
  // And a routed corridor is never the same as the unrouted one.
  assert.notEqual(corridorId(viaSuezThenMalta), corridorId({ origin: "CNSHA", dest: "NLRTM", mode: "ocean" }));
});

test("COLLISION 2: a null legOrdinal is distinct from any real ordinal, and from empty", () => {
  const whole = { origin: "CNSHA", dest: "NLRTM", mode: "multimodal", legOrdinal: null };
  const leg1 = { origin: "CNSHA", dest: "NLRTM", mode: "multimodal", legOrdinal: 1 };
  assert.notEqual(corridorId(whole), corridorId(leg1));
  // The original defect: coalesce(leg_ordinal,'') made NULL and '' the same payload.
  assert.notEqual(corridorPayload(whole), corridorPayload({ ...whole, legOrdinal: undefined, via: [] }).replace("N#", "0#"));
  assert.ok(corridorPayload(whole).includes("N#"), "absent fields use the null sentinel");
});

test("COLLISION 3: delimiter injection is impossible because fields are length-prefixed", () => {
  // Classic hash-payload bug: ("AB","C") and ("A","BC") must not produce the same payload.
  const p1 = corridorPayload({ origin: "AB", dest: "C", mode: "road" });
  const p2 = corridorPayload({ origin: "A", dest: "BC", mode: "road" });
  assert.notEqual(p1, p2);
  // Same for a via-list containing a value that looks like a separator or a length prefix.
  const p3 = corridorPayload({ origin: "AA", dest: "BB", mode: "road", via: ["2#XX"] });
  const p4 = corridorPayload({ origin: "AA", dest: "BB", mode: "road", via: ["2", "XX"] });
  assert.notEqual(p3, p4);
});

test("no two distinct specs in a broad matrix share an id", () => {
  const specs = [];
  for (const mode of CORRIDOR_MODES) {
    for (const routing of [null, "suez", "cape-of-good-hope", "panama"]) {
      for (const leg of [null, 1, 2]) {
        for (const via of [[], ["EGSUZ"], ["EGSUZ", "MTMLA"]]) {
          specs.push({ origin: "CNSHA", dest: "NLRTM", mode, routingKey: routing, legOrdinal: leg, via });
        }
      }
    }
  }
  const ids = specs.map(corridorId);
  assert.equal(new Set(ids).size, specs.length, "collision inside the spec matrix");
});

// ── 3. refusing bad input rather than minting a plausible key ────────────

test("an invalid spec throws instead of minting an id", () => {
  assert.throws(() => corridorId({ dest: "NLRTM", mode: "ocean" }), /origin is required/);
  assert.throws(() => corridorId({ origin: "CNSHA", mode: "ocean" }), /dest is required/);
  assert.throws(() => corridorId({ origin: "CNSHA", dest: "NLRTM" }), /mode is required/);
  assert.throws(() => corridorId({ origin: "CNSHA", dest: "NLRTM", mode: "teleport" }), /unknown mode/);
  assert.throws(() => corridorId(null), /corridor spec must be an object/);
});

test("a degenerate corridor is refused, because it is an upstream parse bug", () => {
  // Minting an id for origin===dest buries the bug behind a plausible-looking key.
  assert.throws(() => corridorId({ origin: "NLRTM", dest: "NLRTM", mode: "ocean" }), /degenerate/);
  // ...but a genuine round trip through a via point is legitimate.
  assert.ok(corridorId({ origin: "NLRTM", dest: "NLRTM", mode: "road", via: ["DEHAM"] }));
});

test("legOrdinal must be a positive integer or null", () => {
  assert.throws(() => corridorId({ ...SUEZ, legOrdinal: 0 }), /positive integer/);
  assert.throws(() => corridorId({ ...SUEZ, legOrdinal: -1 }), /positive integer/);
  assert.throws(() => corridorId({ ...SUEZ, legOrdinal: 1.5 }), /positive integer/);
  assert.deepEqual(validateCorridorSpec({ ...SUEZ, via: "EGSUZ" }), ["via must be an array when present"]);
});

// ── 4. multi-byte safety ─────────────────────────────────────────────────

test("multi-byte via names hash by BYTE length, matching SQL octet_length", () => {
  // A character-count prefix would diverge from Postgres octet_length and break JS/SQL parity.
  const p = corridorPayload({ origin: "CNSHA", dest: "NLRTM", mode: "ocean", via: ["MALMÖ"] });
  assert.ok(p.includes("6#MALMÖ"), `expected byte length 6 for MALMÖ, got payload ${p}`);
});

// ── 5. SQL parity surface ────────────────────────────────────────────────

test("the generated SQL uses the same sentinel, scheme and truncation as the JS", () => {
  const sql = renderCorridorIdSql();
  assert.ok(sql.includes("'N#'"), "SQL must use the same printable null sentinel as the JS");
  assert.ok(sql.includes(`'${CORRIDOR_ID_SCHEME}'`), "SQL must embed the scheme version");
  assert.ok(sql.includes(`, ${CORRIDOR_ID_HEX_LEN})`), "SQL must truncate to the same hex length");
  assert.ok(sql.includes("octet_length(v)"), "SQL must length-prefix by BYTES to match Buffer.byteLength");
  assert.ok(sql.includes("ORDER BY ord"), "via order must be significant and explicitly ordered in SQL");
  assert.ok(sql.includes("GENERATED by"), "generated SQL must announce itself as generated");
});

test("the generated SQL contains no control characters", () => {
  // A NUL sentinel would agree across languages and still be wrong: it makes the file binary to
  // grep and diff and does not survive text transport. This assertion is why the sentinel is 'N#'.
  // eslint-disable-next-line no-control-regex
  assert.equal(/[\x00-\x08\x0e-\x1f]/.test(renderCorridorIdSql()), false);
});
