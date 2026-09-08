// Unit test for the dashboard brief's bounded by-id backfill (lane BRIEFDATA, 2026-09-08).
//
// THE DEFECT UNDER TEST. `get_workspace_intelligence_dashboard` is LIMIT 50 ordered by priority
// band; the What-changed feed (`get_workspace_recent_changes`, migration 232) is ordered by the
// same key but filtered to a DATE WINDOW, and it is not priority-capped. The two sets therefore
// barely intersect. Measured against the live workspace on 2026-09-08 (org a0000000-…-0001, 1,518
// active items, 1,109 of them added in the last seven days): 6 of the 6 change rows the dashboard
// renders were absent from the 50-row slice, so every one of them took brief-rows.ts's degrade
// branch and rendered UNSCORED / PENDING / not-in-primary-source. `fetchBriefResourcesByIds` reads
// exactly those missing ids back, and the two decisions it makes before the query and after it are
// the ones that can silently be wrong. They are pure, so they are proven here rather than asserted.
//
//   splitBriefIdsByShape — the What-changed feed carries `legacy_id || id`, so the ids arriving
//     here are a MIX of legacy text ids and uuids. Sending legacy text at the uuid column raises
//     22P02 and loses the whole read (which would restore the exact defect, silently); sending it
//     through an interpolated `.or()` instead of two encoded `.in()`s is the filter-rewrite hazard
//     fetchWatchlist's own comment records. It also enforces the read ceiling.
//
//   mergeBriefOverrides — these rows come from the BASE table, so they carry no
//     effective_priority / effective_archived. This function is the TypeScript half of
//     `_workspace_active_items` (migration 117): COALESCE(override, item) for both, and drop what
//     resolves as archived. Get it wrong and the dashboard shows a workspace an item it has
//     archived, or shows it the platform priority where the workspace has overridden it.
//
// RED WITHOUT THE FIX: neither export exists on train 61's supabase-server.ts, so every test below
// fails with "is not a function" — the same failure shape supabase-server-watchlist.npmtest.mjs
// documents for its own extraction.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { "@": resolve(ROOT, "src") },
});
const { splitBriefIdsByShape, mergeBriefOverrides } = await jiti.import("./supabase-server.ts");

const UUID = "efdb3390-7530-44e5-b99d-9b20157ae186";

const noOverrides = { rows: [], ownerNames: new Map() };

test("ids are split by SHAPE, so legacy text never reaches the uuid column", () => {
  const { uuidIds, legacyIds } = splitBriefIdsByShape([UUID, "g2", "eu-ets-extension", UUID.toUpperCase()]);
  assert.deepEqual(uuidIds, [UUID, UUID.toUpperCase()]);
  assert.deepEqual(legacyIds, ["g2", "eu-ets-extension"]);
});

test("the id set is de-duplicated and bounded", () => {
  const many = Array.from({ length: 500 }, (_, i) => `id${i}`);
  const { bounded } = splitBriefIdsByShape([...many, ...many]);
  assert.ok(bounded.length <= 40, `expected the read ceiling to hold, got ${bounded.length}`);
  assert.equal(new Set(bounded).size, bounded.length);
});

test("an empty id set asks for nothing", () => {
  assert.deepEqual(splitBriefIdsByShape([]), { bounded: [], uuidIds: [], legacyIds: [] });
});

test("with no override, effective_* falls back to the item's own columns", () => {
  const merged = mergeBriefOverrides(
    [{ id: UUID, priority: "HIGH", is_archived: false, title: "EU PPWR 2025/40" }],
    noOverrides,
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].effective_priority, "HIGH");
  assert.equal(merged[0].effective_archived, false);
  assert.equal(merged[0].title, "EU PPWR 2025/40", "the merge must not disturb the row's own columns");
});

test("a workspace priority override wins, exactly as _workspace_active_items COALESCEs it", () => {
  const merged = mergeBriefOverrides(
    [{ id: UUID, priority: "LOW", is_archived: false }],
    { rows: [{ item_id: UUID, priority_override: "CRITICAL", is_archived: null }], ownerNames: new Map() },
  );
  assert.equal(merged[0].effective_priority, "CRITICAL");
});

test("an item this workspace archived is DROPPED, never backfilled onto its dashboard", () => {
  const merged = mergeBriefOverrides(
    [
      { id: UUID, priority: "HIGH", is_archived: false },
      { id: "other", priority: "HIGH", is_archived: false },
    ],
    { rows: [{ item_id: UUID, priority_override: null, is_archived: true }], ownerNames: new Map() },
  );
  assert.deepEqual(merged.map((r) => r.id), ["other"]);
});

test("a globally archived item is dropped even with no override row", () => {
  const merged = mergeBriefOverrides([{ id: UUID, priority: "HIGH", is_archived: true }], noOverrides);
  assert.deepEqual(merged, []);
});

test("an override that un-archives a globally archived item restores it (COALESCE, not OR)", () => {
  // `COALESCE(wo.is_archived, ii.is_archived)` means the override REPLACES the item's own flag in
  // both directions. A merge written as `override || item` would keep this row hidden.
  const merged = mergeBriefOverrides(
    [{ id: UUID, priority: "HIGH", is_archived: true }],
    { rows: [{ item_id: UUID, priority_override: null, is_archived: false }], ownerNames: new Map() },
  );
  assert.deepEqual(merged.map((r) => r.id), [UUID]);
});
