// vocab.test.mjs — proves the closed-vocabulary predicates, the iso.ts port fidelity, and the
// surface-of.mjs reuse for Axis 5.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  KNOWN_FREE_TEXT_JURISDICTIONS, isValidJurisdictionValue,
  SCOPE_TOPICS, isValidScopeTopic,
  SCOPE_MODES, SCOPE_MODE_SENTINELS, isValidScopeMode,
  SCOPE_VERTICALS, isValidScopeVertical,
  AXIS5_CATEGORIES, AXIS5_OUT_OF_SCOPE, isValidAxis5Category,
  CLASSIFICATION_VOCABULARIES,
} from "./vocab.mjs";
import { LEG_MODE_CODES } from "../contracts/vocabularies.mjs";
import { SURFACES } from "../surface-of.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

// ── Axis 3: jurisdiction ─────────────────────────────────────────────────────────────────────────

test("isValidJurisdictionValue: accepts the known free-text sentinels", () => {
  for (const v of KNOWN_FREE_TEXT_JURISDICTIONS) assert.ok(isValidJurisdictionValue(v));
});

test("isValidJurisdictionValue: accepts well-shaped ISO 3166-1 and 3166-2 codes", () => {
  assert.ok(isValidJurisdictionValue("GB"));
  assert.ok(isValidJurisdictionValue("US"));
  assert.ok(isValidJurisdictionValue("US-CA"));
  assert.ok(isValidJurisdictionValue("CN-31"));
});

test("isValidJurisdictionValue: rejects lowercase, free text, and malformed shapes", () => {
  assert.ok(!isValidJurisdictionValue("gb"));
  assert.ok(!isValidJurisdictionValue("united kingdom"));
  assert.ok(!isValidJurisdictionValue("GBR"));
  assert.ok(!isValidJurisdictionValue("US-CALIFORNIA"));
  assert.ok(!isValidJurisdictionValue(""));
  assert.ok(!isValidJurisdictionValue(null));
});

test("KNOWN_FREE_TEXT_JURISDICTIONS is ported verbatim from src/lib/jurisdictions/iso.ts", () => {
  // Static grep of the iso.ts source text so the port cannot silently drift (per this module's own header).
  const isoSrc = readFileSync(resolve(HERE, "../jurisdictions/iso.ts"), "utf8");
  const m = /export const KNOWN_FREE_TEXT_JURISDICTIONS = \[([\s\S]*?)\] as const;/.exec(isoSrc);
  assert.ok(m, "iso.ts KNOWN_FREE_TEXT_JURISDICTIONS block not found — port guard cannot verify");
  const isoValues = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  assert.deepEqual([...KNOWN_FREE_TEXT_JURISDICTIONS].sort(), isoValues.sort());
});

// ── Axis 4a: scope topics ────────────────────────────────────────────────────────────────────────

test("SCOPE_TOPICS: 14 values, closed, matches framework doc list", () => {
  assert.equal(SCOPE_TOPICS.length, 14);
  assert.ok(SCOPE_TOPICS.includes("regulatory"));
  assert.ok(SCOPE_TOPICS.includes("materials_science"));
});

test("isValidScopeTopic: true for members, false for non-members", () => {
  assert.ok(isValidScopeTopic("fuel"));
  assert.ok(!isValidScopeTopic("space"));
  assert.ok(!isValidScopeTopic(undefined));
});

// ── Axis 4b: scope modes ─────────────────────────────────────────────────────────────────────────

test("SCOPE_MODES: the four LEG_MODE_CODES plus 'all'/'none', multimodal excluded", () => {
  for (const m of LEG_MODE_CODES) assert.ok(SCOPE_MODES.includes(m));
  assert.deepEqual([...SCOPE_MODE_SENTINELS], ["all", "none"]);
  assert.ok(!SCOPE_MODES.includes("multimodal"), "multimodal is a corridor-only concept, deliberately excluded per this module's header");
});

test("isValidScopeMode: accepts concrete modes and the two sentinels, rejects junk", () => {
  assert.ok(isValidScopeMode("ocean"));
  assert.ok(isValidScopeMode("all"));
  assert.ok(isValidScopeMode("none"));
  assert.ok(!isValidScopeMode("sea"), "input alias, not canonical — never valid at this layer");
  assert.ok(!isValidScopeMode("multimodal"));
});

// ── Axis 4c: scope verticals ─────────────────────────────────────────────────────────────────────

test("SCOPE_VERTICALS: the six named verticals plus 'all'/'none', per open question 6 (fixed list)", () => {
  assert.deepEqual([...SCOPE_VERTICALS], [
    "fine_art", "live_events", "luxury", "film_tv", "automotive", "humanitarian",
    "freight_general", "all", "none",
  ]);
});

test("isValidScopeVertical: true for members, false otherwise", () => {
  assert.ok(isValidScopeVertical("fine_art"));
  assert.ok(!isValidScopeVertical("agriculture"));
});

// ── Axis 5: expected-output category set ────────────────────────────────────────────────────────

test("AXIS5_CATEGORIES reuses surface-of.mjs's SURFACES plus one sentinel (no sixth spelling)", () => {
  for (const s of SURFACES) assert.ok(AXIS5_CATEGORIES.includes(s));
  assert.equal(AXIS5_CATEGORIES.length, SURFACES.length + 1);
  assert.equal(AXIS5_OUT_OF_SCOPE, "out_of_scope");
  assert.ok(AXIS5_CATEGORIES.includes(AXIS5_OUT_OF_SCOPE));
});

test("isValidAxis5Category", () => {
  assert.ok(isValidAxis5Category("regulations"));
  assert.ok(isValidAxis5Category("out_of_scope"));
  assert.ok(!isValidAxis5Category("uncategorized"), "surfaceOf's raw sentinel is aliased to out_of_scope, never a category itself here");
});

// ── registry ─────────────────────────────────────────────────────────────────────────────────────

test("CLASSIFICATION_VOCABULARIES: every vocab this module owns is registered, frozen", () => {
  assert.deepEqual(Object.keys(CLASSIFICATION_VOCABULARIES).sort(), [
    "axis5_category", "scope_modes", "scope_topics", "scope_verticals",
  ]);
  assert.ok(Object.isFrozen(CLASSIFICATION_VOCABULARIES));
  assert.throws(() => { CLASSIFICATION_VOCABULARIES.scope_topics = []; }, TypeError);
});
