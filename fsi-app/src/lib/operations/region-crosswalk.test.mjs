// region-crosswalk.test.mjs — proofs for the Operations D1 region-grouping crosswalk (WO-22).
// Executed via the src/lib/operations glob in fsi-app/.discipline/run-test-suite.sh.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveRegionCode } from "./region-crosswalk.mjs";

// Live-confirmed 2026-08-30 (SELECT code, iso_codes FROM regions) — the same 5-region roster
// OperationsLedger.tsx builds from operationsCoverage.regions.
const LIVE_REGIONS = [
  { code: "EU", isoCodes: ["EU", "DE", "NL", "BE", "FR", "IT", "ES"] },
  { code: "US", isoCodes: ["US", "US-CA", "US-NY", "US-TX"] },
  { code: "ASIA", isoCodes: ["SG", "HK", "CN", "JP", "KR"] },
  { code: "UK", isoCodes: ["GB"] },
  { code: "UAE", isoCodes: ["AE"] },
];

test("matches a bare ISO sub-code via iso_codes, not just the region code itself", () => {
  assert.equal(resolveRegionCode(LIVE_REGIONS, { jurisdiction: "SG" }), "ASIA");
  assert.equal(resolveRegionCode(LIVE_REGIONS, { jurisdiction: "DE" }), "EU");
  assert.equal(resolveRegionCode(LIVE_REGIONS, { jurisdiction: "US-CA" }), "US");
  assert.equal(resolveRegionCode(LIVE_REGIONS, { jurisdiction: "GB" }), "UK");
  assert.equal(resolveRegionCode(LIVE_REGIONS, { jurisdiction: "AE" }), "UAE");
});

test("matches the region's own code directly (e.g. a jurisdiction literally 'ASIA' or 'EU')", () => {
  assert.equal(resolveRegionCode(LIVE_REGIONS, { jurisdiction: "ASIA" }), "ASIA");
  assert.equal(resolveRegionCode(LIVE_REGIONS, { jurisdiction: "EU" }), "EU");
});

test("case-insensitive on both the item code and the roster's stored codes", () => {
  assert.equal(resolveRegionCode(LIVE_REGIONS, { jurisdiction: "sg" }), "ASIA");
  assert.equal(resolveRegionCode(
    [{ code: "eu", isoCodes: ["de"] }],
    { jurisdiction: "DE" }
  ), "eu");
});

test("jurisdictionIso array is preferred over the legacy jurisdiction string when non-empty", () => {
  // jurisdiction (legacy single string) would resolve to ASIA; jurisdictionIso (structured,
  // preferred) resolves to EU — the structured source must win, mirroring
  // resolveItemRegionCodes's own fallback order in operations-matrix.ts.
  assert.equal(
    resolveRegionCode(LIVE_REGIONS, { jurisdictionIso: ["DE"], jurisdiction: "SG" }),
    "EU"
  );
});

test("falls back to the legacy jurisdiction string only when jurisdictionIso is empty or absent", () => {
  assert.equal(resolveRegionCode(LIVE_REGIONS, { jurisdictionIso: [], jurisdiction: "GB" }), "UK");
  assert.equal(resolveRegionCode(LIVE_REGIONS, { jurisdiction: "GB" }), "UK");
});

test("a jurisdiction code this platform tracks no region for resolves to null, not a guess", () => {
  for (const code of ["OECD", "ICAO", "IMO", "GLOBAL", "LATAM"]) {
    assert.equal(resolveRegionCode(LIVE_REGIONS, { jurisdiction: code }), null, `${code} should not match any region`);
  }
});

test("no jurisdiction data at all resolves to null", () => {
  assert.equal(resolveRegionCode(LIVE_REGIONS, {}), null);
  assert.equal(resolveRegionCode(LIVE_REGIONS, { jurisdiction: null, jurisdictionIso: null }), null);
  assert.equal(resolveRegionCode(LIVE_REGIONS, { jurisdiction: "", jurisdictionIso: [] }), null);
});

test("concrete live regression fixed: FR-only jurisdiction with no 'France'/'French' regex hit now resolves to EU", () => {
  // Traced live 2026-08-30 against kwrsbpiseruzbfwjpvsp: intelligence_items row
  // ca7d3a75-b606-4517-9ff9-7624b4edc566, jurisdictions=['FR'], title "French Senate (Sénat) -
  // Parliamentary Portal and Institutional Framework". The old REGION_MATCH regex had no pattern
  // for the bare code "FR" and `/\bfrance\b/i` does not match the word "French" — so under the
  // old code this regulation matched no region at all (regionForResource returned null) and was
  // invisible to every region's D1 cross-reference count. The crosswalk resolves it correctly.
  assert.equal(resolveRegionCode(LIVE_REGIONS, { jurisdiction: "FR" }), "EU");
});

test("never throws on degenerate input and never invents a region", () => {
  assert.equal(resolveRegionCode(undefined, undefined), null);
  assert.equal(resolveRegionCode(null, null), null);
  assert.doesNotThrow(() =>
    resolveRegionCode(
      [null, { notCode: 1 }, { code: "" }, { code: "EU", isoCodes: "not-an-array" }],
      { jurisdictionIso: [null, 42, ""], jurisdiction: "EU" }
    )
  );
  assert.equal(
    resolveRegionCode([{ code: "EU", isoCodes: "not-an-array" }], { jurisdiction: "EU" }),
    "EU",
    "a malformed isoCodes value must not crash the region-code-itself match"
  );
});

test("region roster order determines the winner only when a code genuinely appears in two sets", () => {
  const overlapping = [
    { code: "A", isoCodes: ["X"] },
    { code: "B", isoCodes: ["X"] },
  ];
  assert.equal(resolveRegionCode(overlapping, { jurisdiction: "X" }), "A", "first match in roster order wins");
  assert.equal(resolveRegionCode(overlapping.slice().reverse(), { jurisdiction: "X" }), "B");
});
