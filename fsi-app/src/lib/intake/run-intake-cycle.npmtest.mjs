// @ts-check
// runIntakeCycle's UPDATE-ITEM DRAIN (lane INTAKE, 2026-09-01) — closes the change-detection chain's last
// hop: change-sweep.mjs stages `update_item` staged_updates rows for a changed source's live items, but
// human approve/reject is retired ("the machine gates ARE the approval") and nothing else in production
// consumed them. This file is the first test coverage for run-intake-cycle.ts as a whole (none existed
// before this lane); it is scoped to the update-item drain this lane adds — drainChangeSweepUpdates,
// called from inside runIntakeCycle itself, not a separate export.
//
// Proven here (per the task brief):
//   1. a pending change-sweep-marked update_item row is drained: applied via the SAME chokepoint
//      (applyStagedUpdate) the new_item candidates use, then re-verified via the $0 snapshot-first entry
//      (verifyItem, REAL — not faked — getSnapshot/probeFreshness/cheapVerifyClaims, so this is an
//      integration proof of the actual production wiring, not a mock of it)
//   2. the batch bound (UPDATE_DRAIN_LIMIT) is respected, with the remainder reported as notDrained
//   3. a pending update_item row with NO change-sweep marker is left completely untouched
//   4. the re-verify genuinely runs the $0 path: a needs_acquire outcome (no stored snapshot) is REFUSED
//      before any spend (no inventoryMiss is ever supplied — the paid branch never arms), and a
//      verified_cheap outcome (stored snapshot + matching FACT claim) drives the same $0
//      validate_item_provenance re-validate scripts/regen-quarantined.mjs uses
//   5. idempotency: a row this drains is never re-selected by a second invocation (status flips off
//      'pending' before the next row starts)
//
// jiti imports the TS module (@/ alias) — the apply-staged-update-forward-participation.npmtest.mjs
// pattern. verifyItem's own dependencies (getSnapshot/probeFreshness/cheapVerifyClaims) are the REAL
// modules run-intake-cycle.ts imports; every fixture below is built to stay $0 and OFFLINE (item
// source_url is always null so probeFreshness's real HEAD-fetch branch is structurally unreachable, never
// merely un-asserted).
import { test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { runIntakeCycle, UPDATE_DRAIN_LIMIT, drainChangeSweepUpdates, MANUAL_INTAKE_CALLER } = await jiti.import("./run-intake-cycle.ts");
const { CHANGE_SWEEP_STAGED_MARKER } = await jiti.import("../sources/change-sweep.mjs");

/**
 * A fake supabase client covering exactly the tables the update-item drain path touches:
 * staged_updates (select/update — the queue itself), intelligence_items (select/update — apply-staged-
 * update's bare write + verify-item's loadItem + the post-RPC provenance re-read), raw_fetches +
 * .storage (verify-item's real getSnapshot), section_claim_provenance (verify-item's real loadClaims),
 * and .rpc (the $0 validate_item_provenance re-validate).
 */
function fakeClient({
  stagedRows = [],
  itemsById = {},
  snapsBySource = {},
  bodies = {},
  claimsByItem = {},
  rpcFlipTo = {},
  updateItemsError = null,
} = {}) {
  const rpcCalls = [];

  function stagedUpdatesChain() {
    const filters = {};
    let likePrefix = null;
    const api = {
      select() { return api; },
      eq(col, val) { filters[col] = val; return api; },
      like(col, pattern) { likePrefix = pattern.replace(/%$/, ""); return api; },
      order() { return api; },
      async limit(n) {
        let rows = stagedRows.filter((r) => Object.entries(filters).every(([k, v]) => r[k] === v));
        if (likePrefix !== null) rows = rows.filter((r) => typeof r.reason === "string" && r.reason.startsWith(likePrefix));
        return { data: rows.slice(0, n), error: null };
      },
      update(patch) {
        return {
          eq(col, val) {
            const row = stagedRows.find((r) => String(r[col]) === String(val));
            if (row) Object.assign(row, patch);
            return Promise.resolve({ error: null });
          },
        };
      },
    };
    return api;
  }

  function intelligenceItemsChain() {
    let idFilter = null;
    const api = {
      select() { return api; },
      eq(col, val) { if (col === "id") idFilter = val; return api; },
      async maybeSingle() { return { data: itemsById[idFilter] ?? null, error: null }; },
      async single() { return { data: itemsById[idFilter] ?? null, error: null }; },
      update(patch) {
        return {
          eq(col, val) {
            const row = itemsById[val];
            if (row && !updateItemsError) Object.assign(row, patch);
            return Promise.resolve({ error: updateItemsError });
          },
        };
      },
    };
    return api;
  }

  function rawFetchesChain() {
    let sourceIdFilter = null;
    const api = {
      select() { return api; },
      eq(col, val) { if (col === "source_id") sourceIdFilter = val; return api; },
      order() { return api; },
      async limit(n) { return { data: (snapsBySource[sourceIdFilter] ?? []).slice(0, n), error: null }; },
    };
    return api;
  }

  function sectionClaimChain() {
    let itemIdFilter = null;
    const chain = {
      select() { return chain; },
      eq(col, val) { if (col === "intelligence_item_id") itemIdFilter = val; return chain; },
      then(res, rej) { return Promise.resolve({ data: claimsByItem[itemIdFilter] ?? [], error: null }).then(res, rej); },
    };
    return chain;
  }

  return {
    stagedRows: () => stagedRows,
    rpcCalls,
    from(table) {
      if (table === "staged_updates") return stagedUpdatesChain();
      if (table === "intelligence_items") return intelligenceItemsChain();
      if (table === "raw_fetches") return rawFetchesChain();
      if (table === "section_claim_provenance") return sectionClaimChain();
      throw new Error(`fakeClient: unexpected table ${table}`);
    },
    storage: {
      from() {
        return {
          async download(filePath) {
            const body = bodies[filePath];
            if (!body) return { data: null, error: { message: `no fixture body for ${filePath}` } };
            const gz = gzipSync(Buffer.from(body, "utf8"));
            return { data: { arrayBuffer: async () => gz.buffer.slice(gz.byteOffset, gz.byteOffset + gz.byteLength) }, error: null };
          },
        };
      },
    },
    async rpc(name, args) {
      rpcCalls.push({ name, args });
      if (name === "validate_item_provenance") {
        const flip = rpcFlipTo[args.p_item_id];
        if (flip && itemsById[args.p_item_id]) itemsById[args.p_item_id].provenance_status = flip;
        return { data: null, error: null };
      }
      return { data: null, error: null };
    },
  };
}

const marker = (summary) => `${CHANGE_SWEEP_STAGED_MARKER} ${summary}`;

// ── 1 & 4a. drained, applied, re-verified via the $0 path — needs_acquire (no stored snapshot) refuses
//    the paid branch, never arms it ─────────────────────────────────────────────────────────────────────

test("update_item drain: a pending change-sweep row is applied + re-verified; needs_acquire (no snapshot) is REFUSED, never paid", async () => {
  const sb = fakeClient({
    stagedRows: [
      { id: "su-1", update_type: "update_item", status: "pending", item_id: "item-1", source_id: "src-1", proposed_changes: {}, reason: marker("amendment diff: 1 provision(s) added"), source_url: "https://x.example/reg", created_at: "2026-08-30T00:00:00Z" },
    ],
    itemsById: { "item-1": { title: "Item One", source_id: "src-1", source_url: null, provenance_status: "verified" } },
  });

  const result = await runIntakeCycle(sb, [], { mode: "apply" });

  assert.equal(result.updatesDrained, 1);
  assert.equal(result.updatesApproved, 1, "apply succeeded (proposed_changes={} is a legitimate no-op write) — approved");
  assert.equal(result.updatesRejected, 0);
  assert.equal(result.updatesNotDrained, 0);

  const row = sb.stagedRows().find((r) => r.id === "su-1");
  assert.equal(row.status, "approved");
  assert.equal(row.reviewed_by, "manual-intake-run");
  assert.ok(row.materialized_at, "materialized_at stamped on a successfully-applied update_item row");
  assert.match(row.reviewer_notes, /needs_acquire/);
  assert.match(row.reviewer_notes, /paid path refused/, "the paid acquire branch must report itself refused, never silently skipped");

  const out = result.items.find((i) => i.stagedId === "su-1");
  assert.ok(out, "the drained row must appear in the disposition trail");
  assert.equal(out.kind, "update_item");
  assert.equal(out.disposition, "update_applied");
  assert.equal(out.itemId, "item-1");
  assert.equal(out.title, "Item One", "the item's real title is looked up for the trail, not a placeholder");
  assert.equal(out.evidence.verify, "needs_acquire");

  // never armed the paid path: no rpc call at all (validate_item_provenance is verified_cheap-only).
  assert.equal(sb.rpcCalls.length, 0);
});

// ── 2. batch bound respected ────────────────────────────────────────────────────────────────────────────

test("update_item drain: bounded by UPDATE_DRAIN_LIMIT; the remainder is reported as notDrained, never silently dropped", async () => {
  const n = UPDATE_DRAIN_LIMIT + 2;
  const stagedRows = [];
  const itemsById = {};
  for (let i = 0; i < n; i++) {
    stagedRows.push({ id: `su-${i}`, update_type: "update_item", status: "pending", item_id: `item-${i}`, source_id: `src-${i}`, proposed_changes: {}, reason: marker("source content fingerprint changed"), source_url: `https://x.example/${i}`, created_at: `2026-08-30T00:00:0${i}Z` });
    itemsById[`item-${i}`] = { title: `Item ${i}`, source_id: `src-${i}`, source_url: null, provenance_status: "verified" };
  }
  const sb = fakeClient({ stagedRows, itemsById });

  const result = await runIntakeCycle(sb, [], { mode: "apply" });

  assert.equal(result.updatesDrained, UPDATE_DRAIN_LIMIT);
  // The query itself is bounded to limit+1 (the same "fetch one extra to detect there's more" idiom
  // sweepChangedSource uses in change-sweep.mjs), so notDrained is a "there is at least one more" signal
  // capped at 1, not the true backlog size — the 2 truly-undrained rows are still real and still pending,
  // just not all individually counted by this one invocation's report.
  assert.equal(result.updatesNotDrained, 1);
  assert.equal(sb.stagedRows().filter((r) => r.status === "pending").length, 2, "the un-drained rows stay pending, never silently touched");
  assert.equal(sb.stagedRows().filter((r) => r.status === "approved").length, UPDATE_DRAIN_LIMIT);
});

// ── 3. a pending update_item row with no change-sweep marker is left completely untouched ─────────────────

test("update_item drain: a hand-staged update_item row (no [change-sweep] marker) is never selected or touched", async () => {
  const sb = fakeClient({
    stagedRows: [
      { id: "su-swept", update_type: "update_item", status: "pending", item_id: "item-1", source_id: "src-1", proposed_changes: {}, reason: marker("amendment diff: 1 provision(s) added"), source_url: "https://x.example/reg", created_at: "2026-08-30T00:00:00Z" },
      { id: "su-hand", update_type: "update_item", status: "pending", item_id: "item-2", source_id: "src-2", proposed_changes: { title: "Analyst edit" }, reason: "analyst flagged for manual review", source_url: "https://x.example/other", created_at: "2026-08-30T00:00:01Z" },
    ],
    itemsById: {
      "item-1": { title: "Item One", source_id: "src-1", source_url: null, provenance_status: "verified" },
      "item-2": { title: "Item Two", source_id: "src-2", source_url: null, provenance_status: "verified" },
    },
  });

  const result = await runIntakeCycle(sb, [], { mode: "apply" });

  assert.equal(result.updatesDrained, 1);
  const hand = sb.stagedRows().find((r) => r.id === "su-hand");
  assert.equal(hand.status, "pending", "no marker -> never drained -> stays pending, untouched");
  assert.equal(hand.reviewed_by, undefined);
  assert.equal(hand.reviewed_at, undefined);
  assert.equal(result.items.some((i) => i.stagedId === "su-hand"), false, "must not appear in the trail at all");

  const swept = sb.stagedRows().find((r) => r.id === "su-swept");
  assert.equal(swept.status, "approved");
});

// ── 4b. the $0 path genuinely runs the real cheap-verify logic: a verified_cheap outcome (stored snapshot
//    + a matching FACT claim span) drives the same $0 validate_item_provenance re-validate
//    scripts/regen-quarantined.mjs's sanctioned resolver uses ─────────────────────────────────────────────

test("update_item drain: verified_cheap outcome (real cheap-verify against a stored snapshot) triggers the $0 validate_item_provenance re-validate", async () => {
  const span = "This Regulation shall enter into force on 1 January 2027.";
  const filePath = "src-1/2026-08-20/hash.html.gz";
  const sb = fakeClient({
    stagedRows: [
      { id: "su-1", update_type: "update_item", status: "pending", item_id: "item-1", source_id: "src-1", proposed_changes: {}, reason: marker("amendment diff: 0 provision(s) added, 1 changed, 0 removed"), source_url: "https://x.example/reg", created_at: "2026-08-30T00:00:00Z" },
    ],
    // item.source_url is null so verify-item's real probeFreshness HEAD-fetch branch is structurally
    // unreachable — the freshness gate requires `snapshot.found && item.source_url`.
    itemsById: { "item-1": { title: "Item One", source_id: "src-1", source_url: null, provenance_status: "quarantined" } },
    snapsBySource: { "src-1": [{ file_path: filePath, fetched_at: "2026-08-20T00:00:00Z", content_hash: "abc" }] },
    bodies: { [filePath]: `<p>${span}</p>` },
    claimsByItem: { "item-1": [{ claim_text: span, claim_kind: "FACT", source_span: span }] },
    rpcFlipTo: { "item-1": "verified" },
  });

  const result = await runIntakeCycle(sb, [], { mode: "apply" });

  assert.equal(result.updatesApproved, 1);
  assert.equal(sb.rpcCalls.length, 1);
  assert.deepEqual(sb.rpcCalls[0], { name: "validate_item_provenance", args: { p_item_id: "item-1" } });

  const row = sb.stagedRows().find((r) => r.id === "su-1");
  assert.match(row.reviewer_notes, /verified_cheap \(\$0\)/);
  assert.match(row.reviewer_notes, /validate_item_provenance/);
  assert.match(row.reviewer_notes, /provenance now 'verified'/, "the post-RPC provenance re-read must reflect the trigger's flip");

  const out = result.items.find((i) => i.stagedId === "su-1");
  assert.equal(out.evidence.verify, "verified_cheap");
});

// ── apply failure: applyStagedUpdate rejecting still records rejected-with-reason, never a re-verify ──────

test("update_item drain: an apply failure is recorded rejected-with-reason, and never reaches re-verify", async () => {
  const sb = fakeClient({
    stagedRows: [
      { id: "su-1", update_type: "update_item", status: "pending", item_id: "item-1", source_id: "src-1", proposed_changes: {}, reason: marker("amendment diff: 1 provision(s) added"), source_url: "https://x.example/reg", created_at: "2026-08-30T00:00:00Z" },
    ],
    itemsById: { "item-1": { title: "Item One", source_id: "src-1", source_url: null, provenance_status: "verified" } },
    updateItemsError: { message: "RLS denied" },
  });

  const result = await runIntakeCycle(sb, [], { mode: "apply" });

  assert.equal(result.updatesApproved, 0);
  assert.equal(result.updatesRejected, 1);
  const row = sb.stagedRows().find((r) => r.id === "su-1");
  assert.equal(row.status, "rejected");
  assert.match(row.reviewer_notes, /RLS denied/);
  assert.equal(sb.rpcCalls.length, 0, "an apply failure must never reach the re-verify step");

  const out = result.items.find((i) => i.stagedId === "su-1");
  assert.equal(out.disposition, "update_rejected");
  assert.match(out.reason, /RLS denied/);
});

// ── 5. idempotency: a drained row is never re-selected by a later invocation ───────────────────────────────

test("update_item drain: idempotent — a second invocation drains nothing once the row is no longer pending", async () => {
  const sb = fakeClient({
    stagedRows: [
      { id: "su-1", update_type: "update_item", status: "pending", item_id: "item-1", source_id: "src-1", proposed_changes: {}, reason: marker("amendment diff: 1 provision(s) added"), source_url: "https://x.example/reg", created_at: "2026-08-30T00:00:00Z" },
    ],
    itemsById: { "item-1": { title: "Item One", source_id: "src-1", source_url: null, provenance_status: "verified" } },
  });

  const first = await runIntakeCycle(sb, [], { mode: "apply" });
  assert.equal(first.updatesDrained, 1);

  const second = await runIntakeCycle(sb, [], { mode: "apply" });
  assert.equal(second.updatesDrained, 0, "the row already flipped off 'pending' — the status filter excludes it");
  assert.equal(second.items.length, 0);

  // the row's terminal state is untouched by the second (no-op) invocation.
  const row = sb.stagedRows().find((r) => r.id === "su-1");
  assert.equal(row.status, "approved");
});

// ── STANDALONE EXPORT (lane CD, change-detection runtime, 2026-09-02) ──────────────────────────────
//
// drainChangeSweepUpdates is now exported so run-change-detection.mjs can drive the drain ALONE, as its
// own step, instead of only ever running as runIntakeCycle's apply-mode tail. These prove the exported
// entry reaches the EXACT SAME pending rows a runIntakeCycle([], {mode:"apply"}) invocation would (same
// query, same predicate, same bound), with zero new behavior — runIntakeCycle's own new_item candidate
// loop is not exercised at all here (candidates=[] above already proves runIntakeCycle's own call site
// is unaffected; these prove the export is independently usable).

test("drainChangeSweepUpdates (standalone export): drains the same pending change-sweep row runIntakeCycle's tail would", async () => {
  const sb = fakeClient({
    stagedRows: [
      { id: "su-1", update_type: "update_item", status: "pending", item_id: "item-1", source_id: "src-1", proposed_changes: {}, reason: marker("amendment diff: 1 provision(s) added"), source_url: "https://x.example/reg", created_at: "2026-08-30T00:00:00Z" },
    ],
    itemsById: { "item-1": { title: "Item One", source_id: "src-1", source_url: null, provenance_status: "verified" } },
  });

  const result = await drainChangeSweepUpdates(sb, MANUAL_INTAKE_CALLER, UPDATE_DRAIN_LIMIT);

  assert.equal(result.drained, 1);
  assert.equal(result.approved, 1);
  assert.equal(result.rejected, 0);
  assert.equal(result.notDrained, 0);
  assert.equal(result.items[0].kind, "update_item");
  assert.equal(result.items[0].disposition, "update_applied");

  const row = sb.stagedRows().find((r) => r.id === "su-1");
  assert.equal(row.status, "approved");
  assert.equal(row.reviewed_by, MANUAL_INTAKE_CALLER);
});

test("drainChangeSweepUpdates (standalone export): respects an explicit limit narrower than UPDATE_DRAIN_LIMIT", async () => {
  const stagedRows = [];
  const itemsById = {};
  for (let i = 0; i < 3; i++) {
    stagedRows.push({ id: `su-${i}`, update_type: "update_item", status: "pending", item_id: `item-${i}`, source_id: `src-${i}`, proposed_changes: {}, reason: marker("source content fingerprint changed"), source_url: `https://x.example/${i}`, created_at: `2026-08-30T00:00:0${i}Z` });
    itemsById[`item-${i}`] = { title: `Item ${i}`, source_id: `src-${i}`, source_url: null, provenance_status: "verified" };
  }
  const sb = fakeClient({ stagedRows, itemsById });

  const result = await drainChangeSweepUpdates(sb, MANUAL_INTAKE_CALLER, 1);

  assert.equal(result.drained, 1, "the caller's own limit (1) is respected, not UPDATE_DRAIN_LIMIT");
  // Same "fetch one extra to detect there's more" idiom as UPDATE_DRAIN_LIMIT's own test above:
  // notDrained is capped at 1 (a there-is-more signal), not the true remaining count (2).
  assert.equal(result.notDrained, 1);
  assert.equal(sb.stagedRows().filter((r) => r.status === "pending").length, 2);
});

test("drainChangeSweepUpdates (standalone export) vs. runIntakeCycle's own tail: byte-identical result on the same fixture", async () => {
  const fixture = () => ({
    stagedRows: [
      { id: "su-1", update_type: "update_item", status: "pending", item_id: "item-1", source_id: "src-1", proposed_changes: {}, reason: marker("amendment diff: 1 provision(s) added"), source_url: "https://x.example/reg", created_at: "2026-08-30T00:00:00Z" },
    ],
    itemsById: { "item-1": { title: "Item One", source_id: "src-1", source_url: null, provenance_status: "verified" } },
  });

  const viaCycle = await runIntakeCycle(fakeClient(fixture()), [], { mode: "apply" });
  const viaExport = await drainChangeSweepUpdates(fakeClient(fixture()), MANUAL_INTAKE_CALLER, UPDATE_DRAIN_LIMIT);

  assert.equal(viaCycle.updatesDrained, viaExport.drained);
  assert.equal(viaCycle.updatesApproved, viaExport.approved);
  assert.equal(viaCycle.updatesRejected, viaExport.rejected);
  assert.equal(viaCycle.updatesNotDrained, viaExport.notDrained);
  const cycleDrainItem = viaCycle.items.find((i) => i.kind === "update_item");
  assert.deepEqual(cycleDrainItem, viaExport.items[0]);
});
