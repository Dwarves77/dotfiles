import { test } from "node:test";
import assert from "node:assert/strict";
import {
  UNLOCODE_NAMES,
  JURISDICTION_NAMES,
  nameForLocode,
  nameForJurisdiction,
  formatCorridorLabel,
  formatCorridorLabelCompact,
} from "./unlocode-names.mjs";

// Fixture: every corridor entity live in the spine at authoring time (Supabase project
// kwrsbpiseruzbfwjpvsp, `SELECT canonical_name FROM entities WHERE kind='corridor'`, run 2026-09-06 —
// see this file's own header and corridor-scope.ts's header for the same live check). This is the
// falsification test the module header promises: a corridor seeded later whose endpoint this file does
// not name FAILS here, not silently in production.
const LIVE_SEEDED_CORRIDORS = [
  { origin: "CNSHA", dest: "NLRTM", mode: "ocean" },
  { origin: "CNSHA", dest: "USNYC", mode: "ocean" },
  { origin: "CNSHA", dest: "USLAX", mode: "ocean" },
  { origin: "CNSHA", dest: "ITGOA", mode: "ocean" },
];

test("every live-seeded corridor's origin and dest resolve to a real name", () => {
  for (const c of LIVE_SEEDED_CORRIDORS) {
    assert.ok(nameForLocode(c.origin), `origin ${c.origin} should resolve`);
    assert.ok(nameForLocode(c.dest), `dest ${c.dest} should resolve`);
  }
});

test("every live-seeded corridor's jurisdictions resolve to a real country name", () => {
  for (const c of LIVE_SEEDED_CORRIDORS) {
    const o = UNLOCODE_NAMES[c.origin];
    const d = UNLOCODE_NAMES[c.dest];
    assert.ok(nameForJurisdiction(o.countryIso), `${o.countryIso} should resolve`);
    assert.ok(nameForJurisdiction(d.countryIso), `${d.countryIso} should resolve`);
  }
});

test("nameForLocode returns null, never a guess, for an unseeded code", () => {
  assert.equal(nameForLocode("ZZZZ"), null);
  assert.equal(nameForLocode(""), null);
  assert.equal(nameForLocode(undefined), null);
});

test("nameForJurisdiction returns null, never a guess, for an unseeded code", () => {
  assert.equal(nameForJurisdiction("ZZ"), null);
});

test("formatCorridorLabel renders the ADR-024 §4 worked example style", () => {
  assert.equal(
    formatCorridorLabel({ origin: "CNSHA", dest: "NLRTM", mode: "ocean" }),
    "Shanghai (CN) → Rotterdam (NL), ocean",
  );
});

test("formatCorridorLabel degrades to the raw code, never a fabricated name, for an unseeded endpoint", () => {
  assert.equal(
    formatCorridorLabel({ origin: "ZZZZ", dest: "NLRTM", mode: "ocean" }),
    "ZZZZ → Rotterdam (NL), ocean",
  );
});

test("JURISDICTION_NAMES is derived from UNLOCODE_NAMES, not a second hand-typed source", () => {
  for (const entry of Object.values(UNLOCODE_NAMES)) {
    assert.equal(JURISDICTION_NAMES[entry.countryIso], entry.countryName);
  }
});

// ── formatCorridorLabelCompact (lane market63, 2026-09-08) ───────────────────────────────────────
//
// Artboard 04's rail card prints the corridor in a shorter form than the spine label, because the
// rail is 300px wide. The two forms must stay derivable from the SAME UN/LOCODE table, never from
// two hand-typed lists, and the compact one must degrade the same way.

test("formatCorridorLabelCompact renders artboard 04's own rail string", () => {
  assert.equal(
    formatCorridorLabelCompact({ origin: "CNSHA", dest: "NLRTM", mode: "ocean" }),
    "Shanghai – Rotterdam · ocean",
  );
});

test("formatCorridorLabelCompact degrades to the raw code for an unseeded endpoint, never a name", () => {
  assert.equal(
    formatCorridorLabelCompact({ origin: "ZZZZ", dest: "NLRTM", mode: "ocean" }),
    "ZZZZ – Rotterdam · ocean",
  );
});

test("both label forms read the same table, so neither can drift from the other", () => {
  for (const [code, entry] of Object.entries(UNLOCODE_NAMES)) {
    const full = formatCorridorLabel({ origin: code, dest: code, mode: "ocean" });
    const compact = formatCorridorLabelCompact({ origin: code, dest: code, mode: "ocean" });
    assert.ok(full.includes(entry.place), `full label lost the place name for ${code}`);
    assert.ok(compact.includes(entry.place), `compact label lost the place name for ${code}`);
    // The compact form is the one that drops the country parenthetical; that IS its job.
    assert.ok(!compact.includes(`(${entry.countryIso})`));
  }
});

test("a corridor with no mode renders without a trailing separator in either form", () => {
  assert.equal(formatCorridorLabelCompact({ origin: "CNSHA", dest: "NLRTM", mode: "" }), "Shanghai – Rotterdam");
});
