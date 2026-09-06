// regulations-region-link.test.mjs — P2 fix (2026-09-06): the region-scoped deep link.
import { test } from "node:test";
import assert from "node:assert/strict";

const mod = await import("./regulations-region-link.ts");
const { buildRegulationsRegionHref, parseRegulationsRegionParam, normalizeRegionIsoCodes } = mod;

test("buildRegulationsRegionHref: EU region's full iso set round-trips through the URL", () => {
  const isoCodes = ["EU", "DE", "NL", "BE", "FR", "IT", "ES"];
  const href = buildRegulationsRegionHref(isoCodes);
  assert.equal(href, "/regulations?region=EU%2CDE%2CNL%2CBE%2CFR%2CIT%2CES");
  const decoded = new URL(href, "http://x").searchParams.get("region");
  assert.deepEqual(parseRegulationsRegionParam(decoded), isoCodes);
});

test("buildRegulationsRegionHref: the reported defect — a bare group label alone is NOT what ships", () => {
  // The pre-fix bug built `region=eu` (a group label). The new builder never emits that shape for
  // a real region: it always encodes the region's iso codes, "EU" being one member of several.
  const href = buildRegulationsRegionHref(["EU", "DE", "NL", "BE", "FR", "IT", "ES"]);
  assert.notEqual(href, "/regulations?region=eu");
  assert.match(href, /DE/);
});

test("buildRegulationsRegionHref: empty/garbage input falls back to the unfiltered ledger path", () => {
  assert.equal(buildRegulationsRegionHref([]), "/regulations");
  assert.equal(buildRegulationsRegionHref(null), "/regulations");
  assert.equal(buildRegulationsRegionHref(undefined), "/regulations");
});

test("parseRegulationsRegionParam: comma-separated, mixed case, whitespace, dedup", () => {
  assert.deepEqual(parseRegulationsRegionParam(" eu , de ,DE,nl"), ["EU", "DE", "NL"]);
  assert.deepEqual(parseRegulationsRegionParam(null), []);
  assert.deepEqual(parseRegulationsRegionParam(""), []);
});

test("normalizeRegionIsoCodes: drops malformed tokens (injection-shaped, empty, overlong)", () => {
  assert.deepEqual(normalizeRegionIsoCodes(["us-ca", "", "  ", "<script>", "a".repeat(20)]), ["US-CA"]);
});
