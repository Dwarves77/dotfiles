// Tests for lib/instrument-identity.mjs (RD-M4b, 2026-09-04). node:test + node:assert/strict. Pure, no
// I/O — the module has none. Run: node --test scripts/mint/lib/instrument-identity.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { normalizeInstrumentIdentifier, sameInstrumentIdentity } from "./instrument-identity.mjs";

// ── normalizeInstrumentIdentifier ───────────────────────────────────────────────────────────────────────

test("normalizeInstrumentIdentifier: trims + lowercases; null/undefined/empty/whitespace-only all normalize to null", () => {
  assert.equal(normalizeInstrumentIdentifier("  Eurosuper-95  "), "eurosuper-95");
  assert.equal(normalizeInstrumentIdentifier("EU-Oil-Bulletin:Eurosuper-95"), "eu-oil-bulletin:eurosuper-95");
  assert.equal(normalizeInstrumentIdentifier(null), null);
  assert.equal(normalizeInstrumentIdentifier(undefined), null);
  assert.equal(normalizeInstrumentIdentifier(""), null);
  assert.equal(normalizeInstrumentIdentifier("   "), null);
});

test("normalizeInstrumentIdentifier: a non-string value (number, object) normalizes to null, never coerced", () => {
  assert.equal(normalizeInstrumentIdentifier(42), null);
  assert.equal(normalizeInstrumentIdentifier({}), null);
  assert.equal(normalizeInstrumentIdentifier([]), null);
});

// ── sameInstrumentIdentity ───────────────────────────────────────────────────────────────────────────────

test("sameInstrumentIdentity: both unlabelled -> same (fail-closed, an older unlabelled row MAY be the same document)", () => {
  assert.equal(sameInstrumentIdentity(null, null), true);
  assert.equal(sameInstrumentIdentity(undefined, ""), true);
  assert.equal(sameInstrumentIdentity("   ", null), true);
});

test("sameInstrumentIdentity: both labelled and equal (case-insensitive, trimmed) -> same", () => {
  assert.equal(sameInstrumentIdentity("eu-oil-bulletin:eurosuper-95", "  EU-Oil-Bulletin:Eurosuper-95  "), true);
});

test("sameInstrumentIdentity: both labelled and DIFFERENT -> not the same (a sibling series, not a duplicate)", () => {
  assert.equal(sameInstrumentIdentity("eu-oil-bulletin:eurosuper-95", "eu-oil-bulletin:automotive-diesel"), false);
});

test("sameInstrumentIdentity: one side labelled, the other unlabelled -> same, in BOTH directions (asymmetric information, symmetric fail-closed rule)", () => {
  assert.equal(sameInstrumentIdentity("eu-oil-bulletin:eurosuper-95", null), true, "a payload with a real identifier against an unlabelled holder still matches");
  assert.equal(sameInstrumentIdentity(null, "eu-oil-bulletin:eurosuper-95"), true, "an unlabelled payload against a labelled holder still matches");
});

// ── source-reading contract: apply-mint-batch.mjs and export-census-rows.mjs each IMPORT the predicate ──
// from this module — never redefine it locally (CLAUDE.md: never two copies of one rule). RD-M4b,
// 2026-09-04: this is the regression lock for that promise — a future edit that inlines a second
// `function normalizeInstrumentIdentifier` or `function sameInstrumentIdentity` in either consumer file
// fails this test rather than silently re-forking the rule.

const MINT_DIR = fileURLToPath(new URL("..", import.meta.url));

test("apply-mint-batch.mjs imports normalizeInstrumentIdentifier/sameInstrumentIdentity from lib/instrument-identity.mjs, never defines its own", () => {
  const src = readFileSync(`${MINT_DIR}apply-mint-batch.mjs`, "utf8");
  assert.match(src, /import\s*\{\s*normalizeInstrumentIdentifier,\s*sameInstrumentIdentity\s*\}\s*from\s*"\.\/lib\/instrument-identity\.mjs"/);
  assert.doesNotMatch(src, /function\s+normalizeInstrumentIdentifier\s*\(/);
  assert.doesNotMatch(src, /function\s+sameInstrumentIdentity\s*\(/);
});

test("export-census-rows.mjs imports normalizeInstrumentIdentifier/sameInstrumentIdentity from lib/instrument-identity.mjs, never defines its own", () => {
  const src = readFileSync(`${MINT_DIR}export-census-rows.mjs`, "utf8");
  assert.match(src, /import\s*\{\s*normalizeInstrumentIdentifier,\s*sameInstrumentIdentity\s*\}\s*from\s*"\.\/lib\/instrument-identity\.mjs"/);
  assert.doesNotMatch(src, /function\s+normalizeInstrumentIdentifier\s*\(/);
  assert.doesNotMatch(src, /function\s+sameInstrumentIdentity\s*\(/);
});
