// node --test src/lib/dashboard/changed-since.test.mjs
// PROOF for the changed-since pure selection (Task 3, lane CD, 2026-09-01). No I/O — both functions are
// exercised directly against constructed inputs, same discipline as content-change.mjs's fingerprint
// tests and change-sweep.mjs's sweep-decision tests.
import { test } from "node:test";
import assert from "node:assert/strict";
import { selectSourceChanged, selectThemeChanged } from "./changed-since.ts";

const NOW = new Date("2026-09-01T12:00:00Z");

test("selectSourceChanged: drops rows for archived/unknown items (not in the live set)", () => {
  const rows = [
    { item_id: "live-1", change_type: "status_change", change_severity: "critical", change_summary: "s", detected_at: "2026-08-30T00:00:00Z" },
    { item_id: "archived-1", change_type: "status_change", change_severity: "critical", change_summary: "s", detected_at: "2026-08-30T00:00:00Z" },
  ];
  const live = new Map([["live-1", { title: "Live Item" }]]);
  const out = selectSourceChanged(rows, live, 14, NOW);
  assert.equal(out.length, 1);
  assert.equal(out[0].itemId, "live-1");
  assert.equal(out[0].title, "Live Item");
});

test("selectSourceChanged: drops rows older than the window", () => {
  const rows = [
    { item_id: "a", change_type: "administrative", change_severity: "minor", change_summary: null, detected_at: "2026-08-01T00:00:00Z" }, // 31 days back
  ];
  const live = new Map([["a", { title: "A" }]]);
  assert.equal(selectSourceChanged(rows, live, 14, NOW).length, 0);
  assert.equal(selectSourceChanged(rows, live, 45, NOW).length, 1, "widening the window admits it");
});

test("selectSourceChanged: keeps only the MOST RECENT row per item, never double-counts", () => {
  const rows = [
    { item_id: "a", change_type: "administrative", change_severity: "minor", change_summary: "old", detected_at: "2026-08-28T00:00:00Z" },
    { item_id: "a", change_type: "status_change", change_severity: "critical", change_summary: "new", detected_at: "2026-08-31T00:00:00Z" },
  ];
  const live = new Map([["a", { title: "A" }]]);
  const out = selectSourceChanged(rows, live, 14, NOW);
  assert.equal(out.length, 1);
  assert.equal(out[0].changeSummary, "new");
});

test("selectSourceChanged: newest first", () => {
  const rows = [
    { item_id: "a", change_type: "administrative", change_severity: "minor", change_summary: null, detected_at: "2026-08-25T00:00:00Z" },
    { item_id: "b", change_type: "administrative", change_severity: "minor", change_summary: null, detected_at: "2026-08-30T00:00:00Z" },
  ];
  const live = new Map([["a", { title: "A" }], ["b", { title: "B" }]]);
  const out = selectSourceChanged(rows, live, 14, NOW);
  assert.deepEqual(out.map((r) => r.itemId), ["b", "a"]);
});

test("selectSourceChanged: a row with no detected_at or an unparsable date is dropped, not thrown", () => {
  const rows = [
    { item_id: "a", change_type: "x", change_severity: "minor", change_summary: null, detected_at: "" },
    { item_id: "b", change_type: "x", change_severity: "minor", change_summary: null, detected_at: "not-a-date" },
  ];
  const live = new Map([["a", { title: "A" }], ["b", { title: "B" }]]);
  assert.equal(selectSourceChanged(rows, live, 14, NOW).length, 0);
});

// ── selectThemeChanged ───────────────────────────────────────────────────────────────────────────────

test("selectThemeChanged: persisted/renamed added+removed member ids surface directly", () => {
  const delta = {
    persisted: [{ new_id: "theme-1", added: ["item-a"], removed: ["item-b"] }],
    renamed: [{ prior_id: "theme-2", new_id: "theme-2b", added: ["item-c"], removed: [] }],
    appeared: [],
  };
  const out = selectThemeChanged(delta, new Map(), "2026-09-01T00:00:00Z");
  assert.equal(out.length, 3);
  assert.ok(out.some((r) => r.itemId === "item-a" && r.themeId === "theme-1" && r.reason === "added"));
  assert.ok(out.some((r) => r.itemId === "item-b" && r.themeId === "theme-1" && r.reason === "removed"));
  assert.ok(out.some((r) => r.itemId === "item-c" && r.themeId === "theme-2b" && r.reason === "added"));
});

test("selectThemeChanged: appeared theme membership is looked up in the CURRENT connection_themes rows", () => {
  const delta = { persisted: [], renamed: [], appeared: ["theme-new"] };
  const currentThemes = new Map([["theme-new", { member_ids: ["item-x", "item-y"] }]]);
  const out = selectThemeChanged(delta, currentThemes, "2026-09-01T00:00:00Z");
  assert.equal(out.length, 2);
  assert.ok(out.every((r) => r.themeId === "theme-new" && r.reason === "appeared"));
});

test("selectThemeChanged: dissolved themes never claim a membership change (not recoverable)", () => {
  const delta = { persisted: [], renamed: [], appeared: [], dissolved: ["theme-gone"] };
  const out = selectThemeChanged(delta, new Map(), "2026-09-01T00:00:00Z");
  assert.equal(out.length, 0, "dissolved is never read by this function — its members are gone from connection_themes");
});

test("selectThemeChanged: an appeared theme id absent from the current table produces nothing (never throws)", () => {
  const delta = { persisted: [], renamed: [], appeared: ["theme-missing"] };
  const out = selectThemeChanged(delta, new Map(), "2026-09-01T00:00:00Z");
  assert.equal(out.length, 0);
});

test("selectThemeChanged: null/undefined theme_delta -> empty, never throws", () => {
  assert.deepEqual(selectThemeChanged(null, new Map(), null), []);
  assert.deepEqual(selectThemeChanged(undefined, new Map(), null), []);
});

test("selectThemeChanged: duplicate (item,theme,reason) across buckets is deduped", () => {
  const delta = {
    persisted: [{ new_id: "theme-1", added: ["item-a"], removed: [] }],
    renamed: [{ new_id: "theme-1", added: ["item-a"], removed: [] }],
    appeared: [],
  };
  const out = selectThemeChanged(delta, new Map(), null);
  assert.equal(out.length, 1);
});
