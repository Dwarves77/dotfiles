// Surface-routing guard at the mint chokepoint (canonicalDomainOverride) — the structural
// prevention for "a verified item minted onto the wrong/no surface" (the PPWR-adjacent misroute
// class, 2026-07-08). jiti imports the TS chokepoint module.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { canonicalDomainOverride } = await jiti.import("./mint-item.ts");

test("regulation with a WRONG domain is corrected to 1 (the PPWR-adjacent class)", () => {
  assert.equal(canonicalDomainOverride("regulation", 7), 1);
  assert.equal(canonicalDomainOverride("regulation", 4), 1);
  assert.equal(canonicalDomainOverride("guidance", 3), 1);
});

test("a NULL/missing domain on an unconditional type is filled with the canonical value", () => {
  assert.equal(canonicalDomainOverride("regulation", null), 1);
  assert.equal(canonicalDomainOverride("market_signal", undefined), 4);
  assert.equal(canonicalDomainOverride("research_finding", null), 7);
  assert.equal(canonicalDomainOverride("regional_data", null), 3);
  assert.equal(canonicalDomainOverride("technology", null), 2);
});

test("an already-correct domain returns null (no override, no churn)", () => {
  assert.equal(canonicalDomainOverride("regulation", 1), null);
  assert.equal(canonicalDomainOverride("market_signal", 4), null);
  assert.equal(canonicalDomainOverride("research_finding", 7), null);
});

test("CONDITIONAL types (framework/tool/initiative) are NOT overridden — they need source.category", () => {
  assert.equal(canonicalDomainOverride("framework", 7), null);
  assert.equal(canonicalDomainOverride("tool", 3), null);
  assert.equal(canonicalDomainOverride("initiative", 1), null);
});

test("unknown / empty item_type is left alone", () => {
  assert.equal(canonicalDomainOverride("", 5), null);
  assert.equal(canonicalDomainOverride(null, 5), null);
  assert.equal(canonicalDomainOverride("nonsense", 5), null);
});
