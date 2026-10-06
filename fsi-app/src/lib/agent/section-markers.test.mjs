// section-markers.test.mjs (lane GATES-2, 2026-10-05): each marker pattern has a clean fixture and an attack
// fixture; the pattern list is the one exported constant every caller reads.
import test from "node:test";
import assert from "node:assert/strict";
import {
  INTERNAL_MARKER_PATTERNS,
  JSON_LITERAL_MAX_PROSE_CHARS,
  findInternalMarkers,
  describeMarkers,
} from "./section-markers.mjs";

const ids = (t) => findInternalMarkers(t).map((h) => h.id);

test("the constant lists exactly the four marker classes, frozen", () => {
  assert.deepEqual(INTERNAL_MARKER_PATTERNS.map((p) => p.id), [
    "sentinel-open",
    "claim-ledger",
    "provenance-token",
    "json-object-literal",
  ]);
  assert.ok(Object.isFrozen(INTERNAL_MARKER_PATTERNS));
  assert.equal(JSON_LITERAL_MAX_PROSE_CHARS, 40);
});

test("CLEAN: ordinary brief prose, a short JSON-looking snippet, a lowercase table name, non-strings", () => {
  assert.deepEqual(findInternalMarkers("# 1 Purpose\n\nThe regulation applies from 2027 to importers. Source: Official Journal."), []);
  assert.deepEqual(findInternalMarkers('Use {"a": 1} as the flag.'), []);
  assert.deepEqual(findInternalMarkers("rows live in section_claim_provenance"), []);
  assert.deepEqual(findInternalMarkers(null), []);
  assert.deepEqual(findInternalMarkers(undefined), []);
  assert.deepEqual(findInternalMarkers(42), []);
  assert.deepEqual(findInternalMarkers(""), []);
});

test("ATTACK: an unclosed ledger block (the production shape) trips sentinel, name and json", () => {
  const body =
    '# 8 Requirements\n\nText.\n\n<<<CLAIM_PROVENANCE_LEDGER\n[{"section":"8","claim_text":"Importers must register by 2027","claim_kind":"FACT","source_span":"shall register"}]';
  const found = ids(body);
  assert.ok(found.includes("sentinel-open"));
  assert.ok(found.includes("claim-ledger"));
  assert.ok(found.includes("json-object-literal"));
});

test("ATTACK: each pattern fires on its own", () => {
  assert.deepEqual(ids("see <<< here"), ["sentinel-open"]);
  assert.deepEqual(ids("the CLAIM_PROVENANCE_LEDGER block"), ["claim-ledger", "provenance-token"]); // the name contains the token
  assert.deepEqual(ids("a SOURCE_PROVENANCE flag"), ["provenance-token"]);
  assert.deepEqual(ids('x {"claim_kind": "FACT", "source_span": "verbatim quote text here"} y'), ["json-object-literal"]);
});

test("ATTACK: a nested object literal over the limit is caught, a brace inside a string does not end it early", () => {
  assert.deepEqual(ids('{"outer": {"inner": 1, "more": "a } brace in a string value", "z": 2}}'), ["json-object-literal"]);
});

test("the boundary: a literal of exactly 40 characters passes, 41 fails", () => {
  const mk = (n) => `{"k":"${"x".repeat(n - 8)}"}`; // {"k":"..."} is n chars
  assert.equal(mk(40).length, 40);
  assert.deepEqual(ids(mk(40)), []);
  assert.deepEqual(ids(mk(41)), ["json-object-literal"]);
});

test("describeMarkers names every hit and truncates the excerpt", () => {
  const hits = findInternalMarkers("<<<CLAIM_PROVENANCE_LEDGER " + "y".repeat(500));
  const line = describeMarkers(hits);
  assert.match(line, /sentinel-open/);
  assert.match(line, /claim-ledger/);
  assert.ok(line.length < 400);
});
