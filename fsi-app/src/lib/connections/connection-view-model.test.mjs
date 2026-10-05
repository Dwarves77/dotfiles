// Tests for connection-view-model.mjs (flywheel U9). Pure — runs in the no-npm suite via the
// src/lib/connections/*.test.mjs glob (run-test-suite.sh + CI, parity by construction, same as U1-U4).
import { test } from "node:test";
import assert from "node:assert/strict";
import { labelForConnection, buildConnectionRows, buildSupersessionRows, buildAllConnectionRows, RELATIONSHIP_LABEL } from "./connection-view-model.mjs";

test("labelForConnection: 'related' falls through to direction-based label", () => {
  assert.equal(labelForConnection("related", "outgoing"), "References");
  assert.equal(labelForConnection("related", "incoming"), "Referenced by");
});

test("labelForConnection: explicit relationship types win over direction", () => {
  assert.equal(labelForConnection("supersedes", "outgoing"), "Supersedes");
  assert.equal(labelForConnection("implements", "incoming"), "Implements");
  assert.equal(labelForConnection("conflicts", "outgoing"), "Conflicts with");
});

test("labelForConnection: unknown relationship falls back to direction (never throws)", () => {
  assert.equal(labelForConnection("some-future-type", "outgoing"), "References");
  assert.equal(labelForConnection(undefined, "incoming"), "Referenced by");
});

const lookup = {
  "item-a": { id: "item-a", title: "EU CBAM reporting rule", priority: "HIGH" },
  "item-b": { id: "item-b", title: "Ocean freight surcharge signal", priority: "MODERATE" },
};

test("buildConnectionRows: a provenance_discovery row carries a real basis summary and href by surface", () => {
  const rows = buildConnectionRows(
    [{ id: "item-a", direction: "outgoing", relationship: "related", origin: "provenance_discovery",
       basis: [{ signal: "shared_source", detail: "both concern X", weight: 0.4 }], score: 0.4, surface: "regulations" }],
    lookup
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, "EU CBAM reporting rule");
  assert.equal(rows[0].label, "References");
  assert.equal(rows[0].discovered, true);
  assert.equal(rows[0].href, "/regulations/item-a");
  assert.deepEqual(rows[0].basisSummary, [{ signal: "shared_source", weight: 0.4 }]);
});

test("buildConnectionRows: discovered (basis-scored) rows sort before non-discovered rows, by score desc", () => {
  const rows = buildConnectionRows(
    [
      { id: "item-b", direction: "incoming", relationship: "related", origin: "entity_extraction", basis: [], score: null, surface: "market" },
      { id: "item-a", direction: "outgoing", relationship: "related", origin: "provenance_discovery",
        basis: [{ signal: "shared_source", detail: "d", weight: 0.4 }], score: 0.4, surface: "regulations" },
    ],
    lookup
  );
  assert.deepEqual(rows.map((r) => r.id), ["item-a", "item-b"]);
});

test("buildConnectionRows: a target with no gated lookup entry (unverified/quarantined) is dropped, never rendered with a bare id", () => {
  const rows = buildConnectionRows(
    [{ id: "item-unverified", direction: "outgoing", relationship: "related", origin: "manual", basis: null, score: null, surface: "regulations" }],
    lookup
  );
  assert.deepEqual(rows, []);
});

test("buildConnectionRows: an uncategorized surface renders with no href (never a broken link)", () => {
  const rows = buildConnectionRows(
    [{ id: "item-a", direction: "outgoing", relationship: "related", origin: "manual", basis: null, score: null, surface: "uncategorized" }],
    lookup
  );
  assert.equal(rows[0].href, null);
});

test("buildConnectionRows: degenerate/empty inputs never throw", () => {
  assert.deepEqual(buildConnectionRows([], {}), []);
  assert.deepEqual(buildConnectionRows(undefined, undefined), []);
  assert.deepEqual(buildConnectionRows([null, {}, { id: "item-a" }], lookup).length, 1);
});

test("RELATIONSHIP_LABEL: does not include 'related' (direction carries that grammar, not this table)", () => {
  assert.equal("related" in RELATIONSHIP_LABEL, false);
});

test("buildSupersessionRows: self as 'old' → the new item is 'Superseded by', self as 'new' → the old item 'Supersedes'", () => {
  const supersessions = [
    { old: "self-id", new: "item-a", date: "2026-01-01", severity: "major", note: "" },
    { old: "item-b", new: "self-id", date: "2026-02-01", severity: "minor", note: "" },
  ];
  const rows = buildSupersessionRows(supersessions, "self-id", lookup);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => [r.id, r.label]), [["item-a", "Superseded by"], ["item-b", "Supersedes"]]);
  assert.ok(rows.every((r) => r.href.startsWith("/regulations/")), "supersession links always route to /regulations/");
});

test("buildSupersessionRows: no lookup entry falls back to oldTitle/newTitle, then the raw id — never dropped", () => {
  const withTitleFallback = buildSupersessionRows(
    [{ old: "self-id", new: "unresolved-1", newTitle: "Fallback title", date: "d", severity: "minor", note: "" }],
    "self-id", {}
  );
  assert.equal(withTitleFallback[0].title, "Fallback title");
  const withRawIdFallback = buildSupersessionRows(
    [{ old: "self-id", new: "unresolved-2", date: "d", severity: "minor", note: "" }],
    "self-id", {}
  );
  assert.equal(withRawIdFallback[0].title, "unresolved-2");
});

test("buildAllConnectionRows: supersessions render first, ahead of discovered/other connections", () => {
  const rows = buildAllConnectionRows(
    [{ old: "self-id", new: "item-a", date: "d", severity: "major", note: "" }],
    "self-id",
    [{ id: "item-b", direction: "outgoing", relationship: "related", origin: "provenance_discovery",
       basis: [{ signal: "shared_source", detail: "d", weight: 0.4 }], score: 0.4, surface: "market" }],
    lookup
  );
  assert.deepEqual(rows.map((r) => r.id), ["item-a", "item-b"]);
  assert.equal(rows[0].label, "Superseded by");
});

// ── lane S3-B: intersections on every detail page ─────────────────────────────────────────────────────
import { buildIntersectionView, couplingText, SURFACE_LABELS, SURFACE_ORDER } from "./connection-view-model.mjs";

const ix = (scenarios, objects, strength, tier) => ({ signal: "intersection", detail: { scenarios, objects, strength, tier }, weight: 0.9 });
const conn = (id, surface, basis, extra = {}) => ({ id, direction: "outgoing", relationship: "related", origin: "provenance_discovery", basis, score: 0.9, surface, ...extra });
const ixLookup = {
  "mkt-1": { id: "mkt-1", title: "Bunker surcharge signal", priority: "HIGH" },
  "res-1": { id: "res-1", title: "Methanol engine trial", priority: "MODERATE" },
  "reg-2": { id: "reg-2", title: "Second regulation", priority: "HIGH" },
  "ops-1": { id: "ops-1", title: "Port cost profile", priority: "HIGH" },
};

test("buildIntersectionView: strong goes inline under its page, weak into the collapsed possible group", () => {
  const v = buildIntersectionView(
    [
      conn("mkt-1", "market", [ix(["ocean-bunkering", "ets-allowance-surrender"], ["carrier-ocean", "vessel-operator"], 14, "strong")]),
      conn("res-1", "research", [ix(["saf-blending"], ["carrier-air"], 5, "weak")]),
    ],
    ixLookup,
    { currentSurface: "regulations" },
  );
  assert.equal(v.groups.length, 1);
  assert.equal(v.groups[0].surface, "market");
  assert.equal(v.groups[0].label, "Market Intel");
  assert.equal(v.groups[0].items[0].title, "Bunker surcharge signal");
  assert.equal(v.groups[0].items[0].href, "/market/mkt-1");
  assert.equal(v.possible.length, 1);
  assert.equal(v.possible[0].surface, "research");
  assert.equal(v.possibleCount, 1);
});

test("buildIntersectionView: coupling is plain words with human labels, no slug and no score", () => {
  const v = buildIntersectionView(
    [conn("mkt-1", "market", [ix(["ocean-bunkering", "ets-allowance-surrender"], ["carrier-ocean", "vessel-operator"], 14, "strong")])],
    ixLookup,
    { currentSurface: "regulations" },
  );
  const text = v.groups[0].items[0].coupling;
  assert.match(text, /ocean bunkering and ETS allowance surrender/);
  assert.match(text, /ocean carrier and vessel operator/);
  assert.ok(!/carrier-ocean|ocean-bunkering|ets-allowance/.test(text), "no raw slug");
  assert.ok(!/\b14\b|strength|tier|score/i.test(JSON.stringify(v)), "no score, strength or tier word in the view-model output");
});

test("buildIntersectionView: cross-page groups in page order, same-page group last", () => {
  const v = buildIntersectionView(
    [
      conn("reg-2", "regulations", [ix(["drayage"], ["shipper"], 9, "medium")]),
      conn("ops-1", "operations", [ix(["drayage"], ["shipper"], 9, "medium")]),
      conn("res-1", "research", [ix(["drayage"], ["shipper"], 12, "strong")]),
    ],
    ixLookup,
    { currentSurface: "regulations" },
  );
  assert.deepEqual(v.groups.map((g) => g.surface), ["research", "operations", "regulations"]);
  assert.equal(v.groups[2].samePage, true);
});

test("buildIntersectionView: both directed rows of one pair collapse to one item", () => {
  const entry = ix(["drayage"], ["shipper"], 12, "strong");
  const v = buildIntersectionView(
    [conn("mkt-1", "market", [entry]), conn("mkt-1", "market", [entry], { direction: "incoming" })],
    ixLookup,
    { currentSurface: "regulations" },
  );
  assert.equal(v.groups[0].items.length, 1);
});

test("buildIntersectionView: a connection with no intersection entry, no lookup entry, or no surface is not shown", () => {
  const v = buildIntersectionView(
    [
      conn("mkt-1", "market", [{ signal: "shared_source", detail: "x", weight: 0.4 }]),
      conn("unknown", "market", [ix(["drayage"], ["shipper"], 12, "strong")]),
      conn("res-1", "uncategorized", [ix(["drayage"], ["shipper"], 12, "strong")]),
    ],
    ixLookup,
    { currentSurface: "regulations" },
  );
  assert.equal(v, null);
});

test("buildIntersectionView: the item's own stated summary renders even with no pair; empty data gives null", () => {
  assert.equal(buildIntersectionView([], {}, { currentSurface: "market" }), null);
  assert.equal(buildIntersectionView(null, null, { currentSurface: "market", summary: "  " }), null);
  const v = buildIntersectionView([], {}, { currentSurface: "market", summary: "Stated coupling text." });
  assert.equal(v.summary, "Stated coupling text.");
  assert.deepEqual(v.groups, []);
  assert.deepEqual(v.possible, []);
});

test("couplingText: tolerates a missing side and a missing detail", () => {
  assert.equal(couplingText(null), "");
  assert.match(couplingText({ scenarios: ["drayage"], objects: [] }), /^Connected through the operational scenario drayage\.$/);
  assert.match(couplingText({ scenarios: [], objects: ["shipper"] }), /^Connected through the compliance object shipper\.$/);
});

test("surface labels and order cover exactly the four pages", () => {
  assert.deepEqual([...SURFACE_ORDER].sort(), Object.keys(SURFACE_LABELS).sort());
  assert.equal(SURFACE_LABELS.market, "Market Intel");
});
