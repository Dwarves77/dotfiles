// Tests for finish-staged-updates.mjs (task 7.5 item 2, brief-chain build plan Part 7, 2026-09-12).
// Pure decision functions (buildOutcomePatch/describeOutcome) plus main() driven by a FAKE deps
// object -- no DB, no jiti, no Supabase client, matching the dep-injection pattern
// lane-common-contract.md requires ("every script you build is DRY BY DEFAULT ... DB access is
// injected via a deps object so tests run without a database"). Runs in the no-npm discipline glob.
import { test } from "node:test";
import assert from "node:assert/strict";
import { main, buildOutcomePatch, describeOutcome, RESOLVED_BY } from "./finish-staged-updates.mjs";

// ── pure: buildOutcomePatch ─────────────────────────────────────────────────────────────────────

test("buildOutcomePatch: success keeps status=approved (RD-20 resolved state) and stamps materialized_at/materialized_item_id", () => {
  const { action, patch } = buildOutcomePatch({ success: true, itemId: "item-1" }, "2026-09-12T00:00:00Z", RESOLVED_BY);
  assert.equal(action, "materialized");
  assert.equal(patch.status, "approved");
  assert.equal(patch.materialized_at, "2026-09-12T00:00:00Z");
  assert.equal(patch.materialized_item_id, "item-1");
  assert.equal(patch.materialization_error, null);
});

test("buildOutcomePatch: a non-new_item success (no itemId returned) stamps materialized_item_id null, never fabricates one", () => {
  const { patch } = buildOutcomePatch({ success: true }, "2026-09-12T00:00:00Z", RESOLVED_BY);
  assert.equal(patch.materialized_item_id, null);
});

test("buildOutcomePatch: failure rejects with the chokepoint's OWN reason verbatim, status never stays approved", () => {
  const { action, patch } = buildOutcomePatch({ success: false, error: "entity-gate: portal root URL" }, "2026-09-12T00:00:00Z", RESOLVED_BY);
  assert.equal(action, "rejected");
  assert.equal(patch.status, "rejected");
  assert.equal(patch.materialization_error, "entity-gate: portal root URL");
});

test("buildOutcomePatch: a failure with no error string still gets a named reason, never blank", () => {
  const { patch } = buildOutcomePatch({ success: false }, "2026-09-12T00:00:00Z", RESOLVED_BY);
  assert.match(patch.materialization_error, /machine-rejected/);
});

// ── pure: describeOutcome ───────────────────────────────────────────────────────────────────────

test("describeOutcome: names the minted item and the chokepoint's flags on success", () => {
  const line = describeOutcome({ id: "s1", update_type: "new_item", item_id: null }, "materialized", { success: true, itemId: "i1", flags: ["congruence:1a"] });
  assert.match(line, /materialized/);
  assert.match(line, /i1/);
  assert.match(line, /congruence:1a/);
});

test("describeOutcome: names the reject reason", () => {
  const line = describeOutcome({ id: "s2", update_type: "update_item", item_id: "i2" }, "rejected", { success: false, error: "source-link-invariant: no source_id" });
  assert.match(line, /rejected/);
  assert.match(line, /source-link-invariant/);
});

// ── main(): orchestration driven entirely by a fake deps object, DRY mode ──────────────────────────

function fakeDeps({ rows, verdicts, holdEngaged = false }) {
  const written = [];
  return {
    holdEngaged: () => holdEngaged,
    readApprovedUnmaterialized: async () => rows,
    applyStagedUpdate: async (row) => verdicts[row.id],
    writeOutcome: async (id, patch) => written.push({ id, patch }),
    _written: written,
  };
}

test("main() dry: never calls writeOutcome, reports counts and per-update-type breakdown", async () => {
  const rows = [
    { id: "s1", update_type: "new_item", item_id: null },
    { id: "s2", update_type: "new_item", item_id: null },
    { id: "s3", update_type: "status_change", item_id: "i3" },
  ];
  const verdicts = {
    s1: { success: true, itemId: "item-1", action: "minted" },
    s2: { success: false, error: "dedup:linked" },
    s3: { success: true, itemId: "i3" },
  };
  const deps = fakeDeps({ rows, verdicts });
  const summary = await main({ mode: "dry" }, deps);
  assert.equal(summary.mode, "dry");
  assert.equal(summary.counts.materialized, 2);
  assert.equal(summary.counts.rejected, 1);
  assert.equal(summary.by_update_type.new_item.materialized, 1);
  assert.equal(summary.by_update_type.new_item.rejected, 1);
  assert.equal(summary.by_update_type.status_change.materialized, 1);
  assert.equal(deps._written.length, 0, "dry mode must never write");
});

test("main() dry: applyStagedUpdate is called with dryRun:true so the chokepoint never actually inserts", async () => {
  const rows = [{ id: "s1", update_type: "new_item", item_id: null }];
  const seenOpts = [];
  const deps = {
    holdEngaged: () => false,
    readApprovedUnmaterialized: async () => rows,
    applyStagedUpdate: async (row, opts) => { seenOpts.push(opts); return { success: true, itemId: "i1" }; },
    writeOutcome: async () => {},
  };
  await main({ mode: "dry" }, deps);
  assert.equal(seenOpts[0].dryRun, true);
});

test("main() apply: writes the materialize/reject patch for every row, none left approved-unmaterialized in the read-back", async () => {
  const rows = [
    { id: "s1", update_type: "new_item", item_id: null },
    { id: "s2", update_type: "new_item", item_id: null },
  ];
  const verdicts = {
    s1: { success: true, itemId: "item-1" },
    s2: { success: false, error: "entity-gate: portal root URL" },
  };
  let readCount = 0;
  const written = [];
  const deps = {
    holdEngaged: () => false,
    readApprovedUnmaterialized: async () => {
      readCount += 1;
      return readCount === 1 ? rows : []; // second call is the post-apply read-back
    },
    applyStagedUpdate: async (row, opts) => {
      assert.equal(opts.dryRun, false);
      return verdicts[row.id];
    },
    writeOutcome: async (id, patch) => written.push({ id, patch }),
  };
  const summary = await main({ mode: "apply" }, deps);
  assert.equal(summary.applied, 2);
  assert.equal(written.length, 2);
  assert.equal(written.find((w) => w.id === "s1").patch.status, "approved");
  assert.equal(written.find((w) => w.id === "s2").patch.status, "rejected");
  assert.equal(summary.read_back.approved_unmaterialized_remaining, 0);
});

test("main(): scrape hold state is checked and reported every run, dry or apply, never silently assumed", async () => {
  const deps = fakeDeps({ rows: [], verdicts: {}, holdEngaged: true });
  const summary = await main({ mode: "dry" }, deps);
  assert.equal(summary.scrape_hold_engaged_at_run_time, true);
});

test("main(): zero rows is a clean no-op, not an error", async () => {
  const deps = fakeDeps({ rows: [], verdicts: {} });
  const summary = await main({ mode: "apply" }, deps);
  assert.equal(summary.applied, 0);
  assert.equal(summary.read_back.approved_unmaterialized_remaining, 0);
});
