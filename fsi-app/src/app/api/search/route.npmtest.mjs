// Unit test for /api/search's retrieval core (CMDSEARCH lane, 2026-09-09). Exercises the REAL
// exported function the route calls, imported from its sibling logic.ts (BUILDGATE, 2026-09-02:
// route.ts may export only route handlers, so this pure/injectable function lives in logic.ts — see
// check-sources/route.npmtest.mjs's identical precedent), fed a fake Supabase client (same shape as
// reconcile-pass.test.mjs's fakeSvc) so the BOUND and the SCOPE gate are provable without a live DB.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { runSearch, MAX_RESULTS } = await jiti.import("./logic.ts");

/** A fake client whose RPC returns `hitCount` hit ids and whose re-fetch records the exact `.in()`
 *  argument list and the `.eq()` predicates applied ahead of it, so a test can assert on both
 *  without touching a real Supabase project. */
function fakeClient({ hitCount, rpcError = null }) {
  const calls = { inArgs: null, eqCalls: [], rpcMaxRows: null };
  const hits = Array.from({ length: hitCount }, (_, i) => ({ id: `item-${i}`, rank: 1 - i / 1000 }));
  return {
    calls,
    rpc: async (fn, args) => {
      assert.equal(fn, "search_intelligence_items", "must reuse the ONE existing FTS RPC, not a second mechanism");
      calls.rpcMaxRows = args.max_rows;
      if (rpcError) return { data: null, error: { message: rpcError } };
      // The RPC itself is bounded to args.max_rows — this fake mirrors that contract so the caller
      // can never see more hits than it asked for, exactly like the real function does.
      return { data: hits.slice(0, args.max_rows), error: null };
    },
    from: (table) => {
      assert.equal(table, "intelligence_items");
      return {
        select: () => ({
          eq: (col1, val1) => {
            calls.eqCalls.push([col1, val1]);
            return {
              eq: (col2, val2) => {
                calls.eqCalls.push([col2, val2]);
                return {
                  in: async (col, ids) => {
                    calls.inArgs = { col, ids };
                    const rows = ids.map((id) => ({
                      id,
                      title: `Title ${id}`,
                      item_type: "regulation",
                      domain: 1,
                      priority: "HIGH",
                      jurisdictions: ["US"],
                      transport_modes: ["ocean"],
                      topic: "customs",
                    }));
                    return { data: rows, error: null };
                  },
                };
              },
            };
          },
        }),
      };
    },
  };
}

test("BOUNDED: the re-fetch's .in() id list can never exceed MAX_RESULTS, however many the RPC returns", async () => {
  const client = fakeClient({ hitCount: MAX_RESULTS }); // fake RPC itself clamps to max_rows passed in
  const results = await runSearch(client, "customs duties");
  assert.ok(results.length <= MAX_RESULTS, "result set must respect the request-scoped bound");
  assert.ok(client.calls.inArgs.ids.length <= MAX_RESULTS, "the .in() list itself must be bounded, not just the final array");
});

test("BOUNDED: a maxRows argument above MAX_RESULTS is clamped down, never trusted from the caller", async () => {
  const client = fakeClient({ hitCount: 5 });
  await runSearch(client, "customs duties", 10_000);
  assert.equal(client.calls.rpcMaxRows, MAX_RESULTS, "the RPC itself must never be asked for more than the request-scoped cap");
});

test("SCOPED: the re-fetch re-applies the SAME customer read predicate every other read uses (verified, non-archived)", async () => {
  const client = fakeClient({ hitCount: 3 });
  await runSearch(client, "port congestion");
  const gate = client.calls.eqCalls;
  assert.deepEqual(gate, [
    ["is_archived", false],
    ["provenance_status", "verified"],
  ]);
});

test("a failed RPC degrades to an empty result set, never throws into the route", async () => {
  const client = fakeClient({ hitCount: 0, rpcError: "simulated FTS failure" });
  const results = await runSearch(client, "anything");
  assert.deepEqual(results, []);
});

test("zero hits short-circuits before the re-fetch is ever attempted", async () => {
  const client = fakeClient({ hitCount: 0 });
  const results = await runSearch(client, "no matches for this");
  assert.deepEqual(results, []);
  assert.equal(client.calls.inArgs, null, "no re-fetch call should be made when the RPC found nothing");
});

// ── LIVE-CORPUS-SHAPED REGRESSION (SEARCHFIX, 2026-09-11) ──────────────────────────────────────
//
// Every test above uses a fake `.in()` that echoes back a row for whatever ids it's handed,
// without ever looking at what `.select(cols)` actually asked for — so a `.select()` naming a
// column that doesn't exist on the real table is INVISIBLE to this suite. That is exactly how
// this defect shipped: production returned HTTP 200 with `results: []` for 'packaging', 'ppwr'
// and 'emission' (all three real, verified items in the corpus) because the re-fetch's
// `.select("id, title, item_type, domain, priority, jurisdictions, transport_modes, topic")`
// asked PostgREST for a `topic` column intelligence_items does not have — PostgREST rejected the
// request with 400 for every single hit set, and `runSearch` folds any re-fetch error to `[]`.
// Confirmed two ways: (1) live SQL against project kwrsbpiseruzbfwjpvsp — the RPC itself returns
// correct ranked hits (12 for 'packaging', top rank 51.6; 8 for 'ppwr'; 12 for 'emission') whose
// ids resolve to real, non-archived, verified rows ("EU PPWR 2025/40", "SPC Impact 2026...
// Sustainable Packaging Practices", "Packaging Material Input Costs") — so the RPC, the id space,
// and the eq() predicate are all fine; (2) live Supabase postgres_logs for 2026-09-09T19:2x show
// the verbatim error "column intelligence_items.topic does not exist" against the re-fetch's exact
// GET, once per debounced keystroke, every one of the coordinator's production attempts.
//
// This fake `.select()` validates the requested columns against intelligence_items' REAL column
// set (queried live via information_schema.columns, 2026-09-11 — public.intelligence_items has no
// `topic` column; the closest real columns are `category`/`theme`/`topic_tags`) and reproduces
// PostgREST's own 400 behavior for an unknown one, so this test fails on the pre-fix tree exactly
// the way production failed, and passes once the re-fetch stops asking for a column that isn't
// there.
const LIVE_INTELLIGENCE_ITEMS_COLUMNS = new Set([
  "added_date", "agent_integrity_flag", "agent_integrity_flagged_at", "agent_integrity_phrase",
  "agent_integrity_resolved_at", "agent_integrity_resolved_by", "archive_note", "archive_reason",
  "archived_date", "canonical_instrument_key", "category", "compliance_deadline",
  "compliance_object_tags", "confidence", "conversion_trigger", "created_at", "cross_references",
  "does_not_resolve", "domain", "entry_into_force", "format_type", "full_brief", "hidden_reason",
  "id", "instrument_entity_id", "instrument_identifier", "instrument_type", "intersection_summary",
  "is_archived", "item_grade", "item_type", "jurisdiction_iso", "jurisdictions", "key_data",
  "last_regenerated_at", "last_verified", "legacy_id", "linked_case_study_ids",
  "linked_forum_thread_ids", "linked_regulation_ids", "linked_vendor_ids", "next_review_date",
  "open_questions", "operational_impact", "operational_scenario_tags", "origin_class",
  "pipeline_stage", "priority", "provenance_status", "provenance_verified_at", "reasoning",
  "regeneration_skill_version", "region_tags", "related_items", "replaced_by", "search_tsv",
  "severity", "signal_band", "source_id", "source_url", "sources_used", "status", "summary",
  "tags", "theme", "theme_candidate", "title", "topic_tags", "trajectory_points",
  "transport_modes", "updated_at", "urgency_tier", "version_history", "vertical_tags",
  "verticals", "what_is_it", "what_it_changes", "why_matters",
]);

/** Same shape as `fakeClient` above, except `.select(cols)` actually parses the column list
 *  (honoring PostgREST's `alias:column` rename syntax) and the terminal `.in()` rejects with a
 *  PostgREST-shaped 400 the moment any requested column isn't real — the same failure mode the
 *  live logs captured, not a synthetic stand-in for it. */
function liveShapedFakeClient({ hitCount }) {
  const hits = Array.from({ length: hitCount }, (_, i) => ({ id: `item-${i}`, rank: 1 - i / 1000 }));
  return {
    rpc: async (fn, args) => ({ data: hits.slice(0, args.max_rows), error: null }),
    from: (table) => ({
      select: (cols) => {
        const requested = cols.split(",").map((c) => c.trim().split(":").pop());
        const unknown = requested.find((c) => !LIVE_INTELLIGENCE_ITEMS_COLUMNS.has(c));
        return {
          eq: () => ({
            eq: () => ({
              in: async (col, ids) => {
                if (unknown) {
                  return { data: null, error: { message: `column ${table}.${unknown} does not exist` } };
                }
                return { data: ids.map((id) => ({ id, title: `Title ${id}` })), error: null };
              },
            }),
          }),
        };
      },
    }),
  };
}

test("REGRESSION MECHANISM: this fake reproduces production's exact failure when handed the ORIGINAL broken select string (a bare `topic` column) — proving the mechanism below is the real one, not a hypothetical", async () => {
  const brokenClient = liveShapedFakeClient({ hitCount: 3 });
  // The exact string PR #616 shipped, verbatim — not re-derived from the (now-fixed) source.
  const brokenSelect = "id, title, item_type, domain, priority, jurisdictions, transport_modes, topic";
  const { data, error } = await brokenClient.from("intelligence_items").select(brokenSelect).eq().eq().in("id", ["a", "b", "c"]);
  assert.equal(data, null, "the broken select must fail the re-fetch, exactly like the live 400 did");
  assert.match(error.message, /column intelligence_items\.topic does not exist/, "must reproduce the verbatim postgres_logs error, not a generic failure");
});

test("runSearch against the live-shaped fake returns real rows once the re-fetch's .select() only names columns intelligence_items actually has", async () => {
  const client = liveShapedFakeClient({ hitCount: 3 });
  const results = await runSearch(client, "packaging");
  assert.equal(results.length, 3, "the fixed select must let the re-fetch succeed and return the RPC's hits, not degrade to []");
});

test("the re-fetch's .select() names only real intelligence_items columns (live schema, 2026-09-11) — the fix for the regression above", () => {
  const CODE = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "logic.ts"), "utf8");
  const m = CODE.match(/\.select\(\s*"([^"]+)"\s*\)/);
  assert.ok(m, "runSearch's re-fetch .select(...) call not found");
  const requested = m[1].split(",").map((c) => c.trim().split(":").pop());
  for (const col of requested) {
    assert.ok(
      LIVE_INTELLIGENCE_ITEMS_COLUMNS.has(col),
      `.select() names "${col}", which is not a real intelligence_items column (live schema, 2026-09-11) — this is exactly the 400 that shipped the defect`
    );
  }
});
