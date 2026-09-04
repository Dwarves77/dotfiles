// Run: node --test scripts/maintenance/review-apply-canonical-candidates.test.mjs — no DB, deps
// injected. See review-apply-portal-links.test.mjs's header for the shared test rationale; this file
// additionally covers the two-table read-back (`canonical_source_candidates` + `intelligence_items`) that
// makes this wrapper differ from its three siblings.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main, resolveRulingPath } from "./review-apply-canonical-candidates.mjs";

test("resolveRulingPath: relative arg resolves against the REPO ROOT", () => {
  const p = resolveRulingPath("docs/ratifications/2026-09/canonical-candidates.ruling.json");
  assert.ok(p.endsWith("/docs/ratifications/2026-09/canonical-candidates.ruling.json"));
  assert.ok(!p.includes("/fsi-app/docs/"));
});

function unreachableDeps() {
  return {
    applyMain: async () => { throw new Error("applyMain must not be called when --arg is blank"); },
    readAll: async () => { throw new Error("readAll must not be called when --arg is blank"); },
  };
}

test("dry, blank arg: refused, exit 1, no DB call", async () => {
  const r = await main({ mode: "dry", arg: "" }, unreachableDeps());
  assert.equal(r.step, "review-apply-canonical-candidates");
  assert.equal(r.exitCode, 1);
  assert.match(r.note, /REFUSED/);
});

test("dry: calls applyMain with apply:false; plan and needs_individual_review pass through unmodified", async () => {
  const calls = [];
  const deps = {
    applyMain: async (opts) => {
      calls.push(opts);
      return {
        queue: "canonical-candidates",
        mode: "dry-run",
        results: [{ key: "host::stale_url", decision: "accept", would_apply: 2, would_review: 1 }],
        needs_individual_review: [{ candidateId: "c-3", itemId: "i-3", candidateUrl: "https://x", reason: "not registered" }],
      };
    },
    readAll: async () => { throw new Error("dry mode must never call readAll"); },
  };
  const r = await main({ mode: "dry", arg: "docs/ratifications/2026-09/canonical-candidates.ruling.json" }, deps);
  assert.equal(calls[0].apply, false);
  assert.equal(r.counts.queue, "canonical-candidates");
  assert.equal(r.counts.needs_individual_review, 1);
  assert.equal(r.applied, 0);
  assert.deepEqual(r.needs_individual_review, [{ candidateId: "c-3", itemId: "i-3", candidateUrl: "https://x", reason: "not registered" }]);
});

test("apply: sums applied across groups; reads back candidate rows AND repointed intelligence_items rows", async () => {
  const dir = mkdtempSync(join(tmpdir(), "review-apply-canonical-candidates-"));
  const rulingPath = join(dir, "canonical-candidates.ruling.json");
  writeFileSync(rulingPath, JSON.stringify({
    queue: "canonical-candidates",
    generated_at: "2026-09-04T00:00:00.000Z",
    groups: [
      { key: "host::stale_url", decision: "accept", row_ids: ["c-1"] },
      { key: "other::thin_match", decision: "reject", row_ids: ["c-2"] },
    ],
  }));
  try {
    const calls = { applyMain: [], readAll: [] };
    const deps = {
      applyMain: async (opts) => {
        calls.applyMain.push(opts);
        return {
          queue: "canonical-candidates",
          mode: "apply",
          results: [
            { key: "host::stale_url", decision: "accept", applied: 1, needs_individual_review: 0 },
            { key: "other::thin_match", decision: "reject", applied: 1, chunks: 1, halvings: 0 },
          ],
          needs_individual_review: [],
        };
      },
      readAll: async (table, cols, opts) => {
        calls.readAll.push({ table, cols });
        if (table === "canonical_source_candidates") {
          return [
            { id: "c-1", decision: "approved", promoted_to_source_id: "src-9", intelligence_item_id: "item-1" },
            { id: "c-2", decision: "rejected", promoted_to_source_id: null, intelligence_item_id: "item-2" },
          ];
        }
        if (table === "intelligence_items") {
          return [{ id: "item-1", source_id: "src-9", source_url: "https://real-source.example/doc" }];
        }
        throw new Error(`unexpected readAll table ${table}`);
      },
    };
    const r = await main({ mode: "apply", arg: rulingPath }, deps);
    assert.equal(calls.applyMain[0].apply, true);
    assert.equal(calls.readAll.length, 2, "one read for the candidates table, one for the repointed items");
    assert.equal(calls.readAll[0].table, "canonical_source_candidates");
    assert.equal(calls.readAll[1].table, "intelligence_items");
    assert.equal(r.applied, 2);
    assert.equal(r.read_back.candidates_named_in_ruling, 2);
    assert.equal(r.read_back.candidates_now_live, 2);
    // rejected candidate's intelligence_item_id is NEVER followed — only approved rows are
    assert.equal(r.read_back.repointed_items_checked, 1);
    assert.deepEqual(r.read_back.sample_items, [{ id: "item-1", source_id: "src-9", source_url: "https://real-source.example/doc" }]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("apply: no approved candidates among the ruled rows -> no intelligence_items read", async () => {
  const dir = mkdtempSync(join(tmpdir(), "review-apply-canonical-candidates-"));
  const rulingPath = join(dir, "canonical-candidates.ruling.json");
  writeFileSync(rulingPath, JSON.stringify({
    queue: "canonical-candidates",
    generated_at: "2026-09-04T00:00:00.000Z",
    groups: [{ key: "host::thin_match", decision: "reject", row_ids: ["c-9"] }],
  }));
  try {
    const calls = [];
    const deps = {
      applyMain: async () => ({ queue: "canonical-candidates", mode: "apply", results: [{ key: "host::thin_match", decision: "reject", applied: 1 }], needs_individual_review: [] }),
      readAll: async (table, cols, opts) => {
        calls.push(table);
        return [{ id: "c-9", decision: "rejected", promoted_to_source_id: null, intelligence_item_id: "item-9" }];
      },
    };
    const r = await main({ mode: "apply", arg: rulingPath }, deps);
    assert.deepEqual(calls, ["canonical_source_candidates"]);
    assert.equal(r.read_back.repointed_items_checked, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
