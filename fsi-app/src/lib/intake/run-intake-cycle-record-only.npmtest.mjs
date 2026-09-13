// @ts-check
// D26 lane L17 (2026-09-13, "the candidate drain has never run" fix), part (a)/(d): runIntakeCycle's
// recordOnly path. Proves, against the REAL mint chokepoint (applyStagedUpdate -> mintIntelligenceItem,
// unmodified -- no new gate, no new write path):
//   1. a new_item candidate mints at record grade (item_grade:"record" on the INSERTed row) through the
//      chokepoint UNCHANGED.
//   2. the candidate's capturedText is written as ONE agent_run_searches row in the canonical-ground
//      shape (canonical-pipeline.ts's own INSERT shape for a grounding pool row), passing the SAME
//      assertPoolRowShape the export test uses (src/lib/intake/pool-row-contract.mjs).
//   3. the injected groundWorkflow stub is NEVER called -- the recordOnly branch structurally cannot reach
//      GROUND+VALIDATE (this is a call-count proof against a REAL stub, not a source-text grep).
//   4. capturedText never reaches the staged_updates.proposed_changes row nor the mint chokepoint's
//      INSERT seed (it is not a real intelligence_items column).
//   5. the disposition trail names "record_only: brief by the record-briefs turn" and item_grade=record.
// jiti imports the TS module (@/ alias) -- the apply-staged-update-forward-participation.npmtest.mjs /
// mint-item-grade.npmtest.mjs pattern, reused here rather than re-derived (this file's own fakeClient is
// the SAME query set mint-item-grade.npmtest.mjs's fakeClient covers, plus staged_updates -- the table
// run-intake-cycle.ts itself owns -- and a dual read/insert agent_run_searches chain for the pool-row write).
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { assertPoolRowShape } from "./pool-row-contract.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { runIntakeCycle } = await jiti.import("./run-intake-cycle.ts");

/** Every query a successful new_item mint reaches (mint-item-grade.npmtest.mjs's own fakeClient query
 *  set) PLUS staged_updates (run-intake-cycle.ts's own STAGE/MINT-stamp table, including the update-item
 *  drain's own read at the tail of every invocation) and a DUAL read/insert agent_run_searches chain (the
 *  chokepoint's rule-16(f) timeline-hook READ, and this test's own recordOnly pool-row WRITE). */
function fakeClient({ itemId = "new-item-1" } = {}) {
  const insertedItems = [];
  const stagedRows = [];
  const stagedUpdates = [];
  const poolInserts = [];
  const forwardEventInserts = [];
  let nextStagedId = 1;

  function intelligenceItemsChain() {
    return {
      select() { return this; },
      eq() { return this; },
      neq() { return this; },
      order() { return this; },
      range() { return this; },
      maybeSingle: async () => ({ data: null, error: null }), // idempotency probes: no existing row
      // The non-recordOnly GROUND path's own post-workflow re-read (`select("provenance_status")...single()`)
      // -- recordOnly never reaches this call at all, so this fixed "verified" is only ever observed by the
      // recordOnly:false control test below.
      single: async () => ({ data: { provenance_status: "verified" }, error: null }),
      insert(row) {
        insertedItems.push(row);
        return { select() { return this; }, single: async () => ({ data: { id: itemId }, error: null }) };
      },
      then(res, rej) {
        // dedup corpus scan + discovery corpus scan, both direct-`then` reads with no insert/maybeSingle.
        return Promise.resolve({ data: [], error: null }).then(res, rej);
      },
    };
  }

  const emptyReadChain = () => ({
    select() { return this; },
    eq() { return this; },
    in() { return this; },
    like() { return this; },
    order() { return this; },
    limit(n) { return Promise.resolve({ data: [], error: null }); },
    then(res, rej) { return Promise.resolve({ data: [], error: null }).then(res, rej); },
  });

  // staged_updates -- run-intake-cycle.ts's own STAGE (insert -> select -> single), MINT-stamp
  // (update -> eq), and the update-item drain's own read tail (select/eq/eq/like/order/limit -> []).
  function stagedUpdatesChain() {
    const filters = {};
    let likePrefix = null;
    const api = {
      select() { return api; },
      eq(col, val) { filters[col] = val; return api; },
      like(col, pattern) { likePrefix = pattern.replace(/%$/, ""); return api; },
      order() { return api; },
      insert(row) {
        const stored = { id: `su-${nextStagedId++}`, ...row };
        stagedRows.push(stored);
        return { select() { return this; }, single: async () => ({ data: stored, error: null }) };
      },
      update(patch) {
        stagedUpdates.push(patch);
        return {
          eq(col, val) {
            const row = stagedRows.find((r) => String(r[col]) === String(val));
            if (row) Object.assign(row, patch);
            return Promise.resolve({ error: null });
          },
        };
      },
      async limit(n) {
        // the update-item drain's own read: never any update_item rows in this fixture -> [].
        let rows = stagedRows.filter((r) => Object.entries(filters).every(([k, v]) => r[k] === v));
        if (likePrefix !== null) rows = rows.filter((r) => typeof r.reason === "string" && r.reason.startsWith(likePrefix));
        return { data: rows.slice(0, n), error: null };
      },
    };
    return api;
  }

  // agent_run_searches -- DUAL role: mint-item.ts's own rule-16(f) timeline-hook READ (no prior captures,
  // honest no-op) AND this test's own recordOnly pool-row WRITE (captured for assertion).
  function agentRunSearchesChain() {
    return {
      select() { return this; },
      eq() { return this; },
      limit() { return Promise.resolve({ data: [], error: null }); },
      then(res, rej) { return Promise.resolve({ data: [], error: null }).then(res, rej); },
      insert(row) {
        poolInserts.push(row);
        return { then(res, rej) { return Promise.resolve({ data: null, error: null }).then(res, rej); } };
      },
    };
  }

  return {
    insertedItems: () => insertedItems,
    stagedRows: () => stagedRows,
    stagedUpdates: () => stagedUpdates,
    poolInserts: () => poolInserts,
    forwardEventInserts: () => forwardEventInserts,
    from(table) {
      if (table === "intelligence_items") return intelligenceItemsChain();
      if (table === "staged_updates") return stagedUpdatesChain();
      if (table === "agent_run_searches") return agentRunSearchesChain();
      if (table === "section_claim_provenance") return emptyReadChain();
      if (table === "intelligence_item_sections") return emptyReadChain();
      if (table === "item_timelines") return emptyReadChain();
      if (table === "item_forward_events") {
        return {
          insert(rows) {
            forwardEventInserts.push(...rows);
            return { then(res) { return Promise.resolve({ data: null, error: null }).then(res); } };
          },
        };
      }
      if (table === "integrity_flags") {
        return { insert() { return { then(res) { return Promise.resolve({ data: null, error: null }).then(res); } }; } };
      }
      throw new Error(`fakeClient: unexpected table ${table}`);
    },
  };
}

const baseCandidate = {
  title: "Regulation (EU) 2099/9999 on freight emissions",
  source_url: "https://example.gov/reg/l17-9001",
  item_type: "regulation",
  domain: 1,
  source_id: "src-preset", // caller-preset source_id: the SOURCE-LINK INVARIANT's "preset" path, no registry lookup
};

test("recordOnly: mints at record grade through the UNCHANGED chokepoint, writes ONE pool row, NEVER calls the stubbed groundWorkflow", async () => {
  const sb = fakeClient();
  let groundCalls = 0;
  const groundWorkflow = async () => { groundCalls++; return { status: "verified", steps: {} }; };

  const result = await runIntakeCycle(
    sb,
    [{ ...baseCandidate, capturedText: "The operator shall comply with this Regulation by 1 January 2027." }],
    { mode: "apply", recordOnly: true, groundWorkflow }
  );

  assert.equal(groundCalls, 0, "recordOnly must NEVER reach the grounding workflow, even a stub");
  assert.equal(result.minted, 1);
  assert.equal(result.staged, 1);

  // 1 -- record grade through the unchanged chokepoint
  assert.equal(sb.insertedItems().length, 1);
  assert.equal(sb.insertedItems()[0].item_grade, "record");

  // capturedText NEVER reaches the STAGE row's proposed_changes nor the mint seed (not a real column)
  const staged = sb.stagedRows()[0];
  assert.equal(Object.hasOwn(staged.proposed_changes, "capturedText"), false, "capturedText must never be staged");
  assert.equal(Object.hasOwn(sb.insertedItems()[0], "capturedText"), false, "capturedText must never reach the INSERT seed");
  assert.equal(staged.proposed_changes.item_grade, "record", "item_grade IS a real column and DOES flow through staging");

  // 2 -- ONE pool row, the canonical-ground shape, passing the SAME shape assertion the export test uses
  assert.equal(sb.poolInserts().length, 1);
  const poolRow = sb.poolInserts()[0];
  assert.doesNotThrow(() => assertPoolRowShape(poolRow), "the record-only pool row must pass the same shape assertion the export reads by");
  assert.equal(poolRow.intelligence_item_id, "new-item-1");
  assert.equal(poolRow.result_url, baseCandidate.source_url);
  assert.equal(poolRow.search_query, "canonical ground");
  assert.equal(poolRow.result_title, "source");
  assert.equal(poolRow.result_index, 0);
  assert.equal(poolRow.result_content, "The operator shall comply with this Regulation by 1 January 2027.");
  assert.ok(poolRow.searched_at);

  // 5 -- disposition trail
  const item = result.items.find((i) => i.kind === "new_item");
  assert.equal(item.disposition, "record_only");
  assert.equal(item.itemId, "new-item-1");
  assert.match(item.reason, /record_only: brief by the record-briefs turn/);
  assert.match(item.reason, /item_grade=record/);
  assert.equal(item.evidence.workflow, "skipped(record_only)");

  // record_only is neither verified nor ground_failed (grounding was never attempted)
  assert.equal(result.verified, 0);
  assert.equal(result.groundFailed, 0);
});

test("recordOnly with no capturedText on the candidate writes an empty result_content, never throws", async () => {
  const sb = fakeClient();
  let groundCalls = 0;
  const groundWorkflow = async () => { groundCalls++; return { status: "verified", steps: {} }; };

  const result = await runIntakeCycle(sb, [{ ...baseCandidate }], { mode: "apply", recordOnly: true, groundWorkflow });

  assert.equal(groundCalls, 0);
  assert.equal(sb.poolInserts().length, 1);
  assert.equal(sb.poolInserts()[0].result_content, "");
  assert.equal(result.items[0].disposition, "record_only");
});

test("recordOnly:false (default) is unaffected -- the real groundWorkflow-shaped stub IS called, no pool row is written by this branch", async () => {
  const sb = fakeClient();
  let groundCalls = 0;
  const groundWorkflow = async () => { groundCalls++; return { status: "verified", steps: {} }; };

  const result = await runIntakeCycle(sb, [{ ...baseCandidate }], { mode: "apply", groundWorkflow });

  assert.equal(groundCalls, 1, "without recordOnly, the cycle must still reach GROUND");
  assert.equal(sb.poolInserts().length, 0, "no recordOnly pool-row write happens on the ordinary path");
  assert.equal(result.items.find((i) => i.kind === "new_item").disposition, "verified");
});
