// jurisdiction-iso-mapping.test.mjs — Addendum 63 (2026-08-30).
//
// THE GAP: `Resource.jurisdictionIso` (src/types/resource.ts) is a `string[]`
// (migration 033 made `intelligence_items.jurisdiction_iso` a TEXT ARRAY,
// confirmed live against the schema this session). Two of the three row
// mappers in supabase-server.ts that build a Resource (fetchWorkspaceResources's
// inline mapper, and its sibling rpcRowToResource) never set the field at all
// — every list/ledger surface fed by either of them (RegulationsLedger,
// MarketIntelLedger, OperationsLedger, OperationsItemsView, MapPageView,
// DashboardTopPriority, app/community/page.tsx) reads `r.jurisdictionIso` as
// permanently undefined and falls through to whatever local fallback each
// consumer happens to have. The third mapper (fetchIntelligenceItemUncached,
// feeding the `/regulations|market|operations/[slug]` detail pages) already
// read it correctly with an `Array.isArray` guard.
//
// This test pins two things:
//   1. `normalizeJurisdictionIsoColumn` (the shared guard now used by all
//      three mapper sites) handles the real column shape: empty array,
//      single-element, multi-element, and the "column not selected"
//      non-array cases (undefined/null/scalar-string/number) — a mapper
//      that narrowed with `?.[0]` would drop every element after the first
//      without this test seeing it.
//   2. The two RPC-backed mapper sites in supabase-server.ts now call the
//      shared guard (regression lock — reads the source text, the
//      established idiom in this suite for a module too tightly coupled to
//      Supabase/Next runtime to unit-test by import; see
//      domain-laundering.test.mjs for the precedent).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeJurisdictionIsoColumn } from "../lib/jurisdictions/iso.ts";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

// ── 1. Pure guard: the real ARRAY shapes ──

test("normalizeJurisdictionIsoColumn passes a multi-element array through unchanged", () => {
  assert.deepEqual(normalizeJurisdictionIsoColumn(["US-CA", "EU"]), ["US-CA", "EU"]);
});

test("normalizeJurisdictionIsoColumn passes a single-element array through unchanged", () => {
  assert.deepEqual(normalizeJurisdictionIsoColumn(["EU"]), ["EU"]);
});

test("normalizeJurisdictionIsoColumn passes an empty array through as an empty array, not undefined", () => {
  // An item that has been classified but assigned no jurisdiction is a real, meaningful state
  // (empty coverage), distinct from "the column wasn't selected". Collapsing both to undefined
  // would make the two indistinguishable to every consumer that checks `.length > 0`.
  assert.deepEqual(normalizeJurisdictionIsoColumn([]), []);
});

test("normalizeJurisdictionIsoColumn degrades to undefined when the column was not selected (undefined/null)", () => {
  assert.equal(normalizeJurisdictionIsoColumn(undefined), undefined);
  assert.equal(normalizeJurisdictionIsoColumn(null), undefined);
});

test("normalizeJurisdictionIsoColumn degrades to undefined on a non-array value rather than throwing", () => {
  // Defensive: a scalar string (the shape a lossy `?.[0]` mapper would produce upstream, or a
  // hand-edited row) must never be treated as a 1-character-per-entry array.
  assert.equal(normalizeJurisdictionIsoColumn("US"), undefined);
  assert.equal(normalizeJurisdictionIsoColumn(42), undefined);
});

// ── 2. Regression lock on the two RPC-backed mapper sites ──

function loadSupabaseServerSource() {
  return readFileSync(join(SRC, "lib/supabase-server.ts"), "utf8");
}

test("fetchWorkspaceResources's mapper and rpcRowToResource both set jurisdictionIso via the shared guard", () => {
  const code = loadSupabaseServerSource();
  const callSites = code.match(/jurisdictionIso:\s*normalizeJurisdictionIsoColumn\(row\.jurisdiction_iso\)/g) || [];
  // 3 sites: fetchWorkspaceResources's inline mapper, rpcRowToResource, and
  // fetchIntelligenceItemUncached's detail mapper. A count below 3 means one of the two
  // previously-silent mappers regressed back to omitting the field.
  assert.equal(
    callSites.length,
    3,
    `expected 3 mapper sites to call normalizeJurisdictionIsoColumn(row.jurisdiction_iso), found ${callSites.length}`
  );
});

test("no jurisdictionIso mapping in supabase-server.ts narrows the array with a lossy [0] index", () => {
  const code = readFileSync(join(SRC, "lib/supabase-server.ts"), "utf8")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"));
  const offenders = code.filter((l) => /jurisdictionIso:\s*row\.jurisdiction_iso\s*\?\.\s*\[0\]/.test(l));
  assert.deepEqual(offenders, [], `lossy scalar-take-one-element jurisdictionIso mapping found: ${offenders.join(" | ")}`);
});
