// SURFACE ADMISSION proof (Phase 0.1, 2026-08-11).
//
// Run standalone with:
//   node --experimental-strip-types --test fsi-app/src/__tests__/surface-admission.test.mjs
// (covered by the `fsi-app/src/__tests__/*.test.mjs` glob in run-test-suite.sh,
// so it is execution-wired, not an F23 orphaned proof.)
//
// WHAT DEFECT THIS LOCKS OUT. Until 2026-08-11 the ONLY gate on the four
// `[slug]` detail routes was fetchIntelligenceItemUncached's
// `provenance_status='verified'` check (src/lib/supabase-server.ts). No route
// checked item_type or domain. Consequences, all four surfaces:
//   1. Every verified item was reachable at FOUR urls under four contradictory
//      framings — a market_signal rendered under the Regulations breadcrumb
//      with a "Penalty schedule" tab; a regulation rendered under the
//      Operations eyebrow with a WatchButton typed `operations`.
//   2. Worse than cosmetic: each detail surface RELABELS section rows with its
//      own heading map (RESEARCH_SECTION_HEADINGS, KNOWN_OPERATIONS_KEYS,
//      RegulationSections' KNOWN_KEYS) and DROPS keys outside its range. A
//      15-section regulation opened at /operations/<slug> rendered keys 1-8
//      under Operations headings and silently dropped 9-15. The customer saw
//      real content under false labels.
//
// THE FIX PROVEN HERE. `canonicalSurfaceForItem` is the single classifier for
// BOTH directions: it decides where an item's link points (itemDetailHref) and
// which route may render it (the `[slug]` guards). Because both consume the
// same function, an emitted link and a route guard cannot disagree — that
// consistency is asserted directly in section 3 rather than assumed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalSurfaceForItem, itemDetailHref } from "../lib/item-links.ts";
import { SURFACES, DEFAULT_SURFACE, surfaceOf } from "../lib/surface-of.mjs";

/** The four routes that own a `[slug]` page, i.e. the four guard values. */
const ROUTES = ["regulations", "market", "operations", "research"];

/** The guard predicate as the four page files apply it. */
const admits = (route, item) => canonicalSurfaceForItem(item) === route;

// ── 1. Canonical classification per item_type ────────────────────────────
// One assertion per unconditional item_type in SURFACE_RULES. If a rule is
// added or moved, this table must move with it, deliberately.

test("canonicalSurfaceForItem: item_type routes to its ratified surface", () => {
  const cases = [
    ["regulation", "regulations"],
    ["directive", "regulations"],
    ["standard", "regulations"],
    ["guidance", "regulations"],
    ["framework", "regulations"],
    ["law", "regulations"],
    ["regional_data", "operations"],
    ["research_finding", "research"],
    ["market_signal", "market"],
    ["initiative", "market"],
    ["technology", "market"],
    ["innovation", "market"],
  ];
  for (const [type, surface] of cases) {
    assert.equal(canonicalSurfaceForItem({ type, domain: null }), surface, `${type} -> ${surface}`);
  }
});

test("canonicalSurfaceForItem: domain routes when item_type is unknown", () => {
  const cases = [[1, "regulations"], [3, "operations"], [6, "operations"], [7, "research"], [2, "market"], [4, "market"]];
  for (const [domain, surface] of cases) {
    assert.equal(canonicalSurfaceForItem({ type: null, domain }), surface, `domain ${domain} -> ${surface}`);
  }
});

// ── 2. The admission guard: foreign items are refused ────────────────────
// The heart of it. For every (item, route) pair, exactly ONE route admits.

test("admission: an item is admitted by exactly one of the four routes", () => {
  const items = [
    { type: "regulation", domain: 1 },
    { type: "market_signal", domain: 2 },
    { type: "research_finding", domain: 7 },
    { type: "regional_data", domain: 3 },
    { type: "technology", domain: 4 },
    { type: "initiative", domain: null },
  ];
  for (const item of items) {
    const admitting = ROUTES.filter((r) => admits(r, item));
    assert.equal(admitting.length, 1, `${JSON.stringify(item)} admitted by ${JSON.stringify(admitting)}`);
  }
});

test("admission: the four historical cross-surface leaks are now refused", () => {
  // Each pair below rendered real content under a false frame before the guard.
  const leaks = [
    ["operations", { type: "regulation", domain: 1 }, "15-section regulation under Operations headings, keys 9-15 dropped"],
    ["regulations", { type: "market_signal", domain: 2 }, "market signal under the Regulations 'Penalty schedule' tab"],
    ["research", { type: "regulation", domain: 1 }, "regulation relabelled with Research Summary S1-S6 headings"],
    ["market", { type: "research_finding", domain: 7 }, "research finding under the Market 'Unverified · early report' chip"],
  ];
  for (const [route, item, why] of leaks) {
    assert.equal(admits(route, item), false, `${route} must refuse: ${why}`);
  }
});

test("admission: every item is still reachable somewhere (no orphaning)", () => {
  // The guard must not make content unreachable — that would trade a
  // mislabelling defect for a disappearance defect.
  const items = [
    { type: "regulation", domain: 1 },
    { type: "market_signal", domain: 2 },
    { type: "research_finding", domain: 7 },
    { type: "regional_data", domain: 3 },
    { type: null, domain: null }, // the unclassified defect population
    { type: "uncertain", domain: null }, // the mapper's null-item_type sentinel
    { type: "tool", domain: null }, // matches no rule -> uncategorized
  ];
  for (const item of items) {
    assert.ok(ROUTES.some((r) => admits(r, item)), `${JSON.stringify(item)} is reachable at no route`);
  }
});

// ── 3. Both directions agree, by construction ────────────────────────────

test("the route that admits an item is the route its own href points at", () => {
  const items = [
    { id: "x", type: "regulation", domain: 1 },
    { id: "x", type: "market_signal", domain: 2 },
    { id: "x", type: "research_finding", domain: 7 },
    { id: "x", type: "regional_data", domain: 3 },
    { id: "x", type: "technology", domain: 4 },
    { id: "x", type: null, domain: null },
    { id: "x", type: "tool", domain: 99 },
  ];
  for (const item of items) {
    const href = itemDetailHref(item);
    const admitting = ROUTES.filter((r) => admits(r, item));
    assert.equal(admitting.length, 1);
    assert.equal(href, `/${admitting[0]}/x`, `href ${href} vs admitting route ${admitting[0]}`);
  }
});

// ── 4. The uncategorized fallback is deliberate, and it is Regulations ───

test("uncategorized resolves to regulations, matching the pre-existing href fallback", () => {
  const orphan = { type: "tool", domain: null };
  assert.equal(surfaceOf(orphan.type, orphan.domain), DEFAULT_SURFACE, "precondition: this pair is uncategorized");
  assert.equal(canonicalSurfaceForItem(orphan), "regulations");
  assert.equal(itemDetailHref({ id: "x", ...orphan }), "/regulations/x");
});

test("no arguments at all still yields a renderable route, never a crash", () => {
  assert.equal(canonicalSurfaceForItem({}), "regulations");
  assert.equal(canonicalSurfaceForItem({ type: undefined, domain: undefined }), "regulations");
});

// ── 5. Coupling to the SSOT ──────────────────────────────────────────────

test("the four guard values are exactly surfaceOf's four customer surfaces", () => {
  assert.deepEqual([...ROUTES].sort(), [...SURFACES].sort());
  assert.ok(!ROUTES.includes(DEFAULT_SURFACE), "uncategorized is never a route value");
});

test("canonicalSurfaceForItem never returns uncategorized", () => {
  // Exhaustive over every item_type named in SURFACE_RULES plus the null and
  // unmatched cases, crossed with every domain 1-7 and null.
  const types = [null, "uncertain", "tool", "regulation", "directive", "standard", "guidance", "framework",
    "law", "regional_data", "research_finding", "market_signal", "initiative", "technology", "innovation"];
  const domains = [null, 1, 2, 3, 4, 5, 6, 7];
  for (const type of types) {
    for (const domain of domains) {
      const s = canonicalSurfaceForItem({ type, domain });
      assert.ok(ROUTES.includes(s), `(${type}, ${domain}) -> ${s}`);
    }
  }
});
