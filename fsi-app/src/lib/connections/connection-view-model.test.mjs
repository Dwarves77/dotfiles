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
       basis: [{ signal: "same_instrument", detail: "both concern X", weight: 0.9 }], score: 0.9, surface: "regulations" }],
    lookup
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, "EU CBAM reporting rule");
  assert.equal(rows[0].label, "References");
  assert.equal(rows[0].discovered, true);
  assert.equal(rows[0].href, "/regulations/item-a");
  assert.deepEqual(rows[0].basisSummary, [{ signal: "same_instrument", weight: 0.9 }]);
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
       basis: [{ signal: "same_instrument", detail: "d", weight: 0.9 }], score: 0.9, surface: "market" }],
    lookup
  );
  assert.deepEqual(rows.map((r) => r.id), ["item-a", "item-b"]);
  assert.equal(rows[0].label, "Superseded by");
});
