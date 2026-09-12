// canonical-pipeline.injected-synthesis.npmtest.mjs -- W9-PART3 lane, task 3.3 (brief-chain-build-plan-
// 2026-09-11 Part 3), fix round 1 (coordinator ruling).
//
// Proves generateBriefFromInjected (the injected-synthesis seam: a session lane authors a full brief body +
// metadata for a record-grade stub item, and this persists it through the SAME parser + SAME single write
// site every model-driven brief uses -- see canonical-pipeline.ts's own "INJECTED-SYNTHESIS SEAM" header
// comment above synthesiseAndWriteBrief):
//   1. a record-grade item with a matching sourcePoolHash -> ONE intelligence_items.update carrying
//      full_brief, the six task-2.2 fields, format_type FORCED from item_type (never the agent-emitted
//      value), and item_grade='brief' (ADR-028: the grade is a cache of full_brief presence).
//   2. a sourcePoolHash mismatch -> refused, detail matches /stale pool/, no write attempted.
//   3. a brief-grade item without allowBriefOverwrite -> refused, no write attempted.
//   4. the SAME brief-grade item WITH allowBriefOverwrite -> accepted, write attempted.
//   5. an unknown item id -> ok:false, no write attempted.
//   6. FIX ROUND 1 -- an injected body under the 600-char floor -> refused with the SAME detail format the
//      model path gives (`parsed body too short (N)`), never writes.
//   7. FIX ROUND 1 -- an injected body that reads as a fetch-failure explanation -> refused via
//      checkBriefContent's own research-or-erase gate (`brief_failure_gate: ...`), never writes.
//   8. FIX ROUND 1 -- an injected body that leaves a required slot unaddressed -> refused immediately (no
//      corrective retry is possible for lane-authored synthesis, unlike the model path's one retry).
//
// The coordinator's fix-round-1 ruling: the injected path MUST run the SAME post-parse, pre-write content
// gates the model path runs (the 600-char floor, checkBriefContent, and required-slot coverage) -- a
// session lane's brief is judged exactly like the model's, never a lighter pass (SKILL.md's integrity
// rule). synthesiseAndWriteBrief was restructured so both drivers converge on ONE shared tail before those
// gates; tests 6-8 are the RED-first proof that the convergence is real, not merely claimed.
//
// The fake Supabase client below supports ONLY the exact tables/operations the injected path is documented
// to touch (intelligence_items select+update, agent_run_searches select, item_type_required_slots select
// -- now read UNCONDITIONALLY by both drivers per fix round 1 -- item_cross_references upsert for the
// unused related_items edge write). Any other table -- in particular `sources`, which ONLY the
// live/model-generation prompt-construction path (attachTiers/buildSourceBlocks) reads -- THROWS. This is
// the proof that generateBriefText's whole prompt-construction machinery, and generateBriefText itself, is
// never reached: if the seam fell through to the live path by mistake, this fake client would fail the
// test loudly, not silently pass (the same "attack, don't assert presence" posture CLAUDE.md rule 15 asks
// for).
//
// This is an *.npmtest.mjs (not *.test.mjs) because canonical-pipeline.ts is only importable via jiti (its
// `@/` aliases are not portable to plain `node --test`) -- see canonical-pipeline.write-fields.npmtest.mjs's
// own header for the same constraint on this exact module; this file reuses that file's fake-client
// technique (a from(table) dispatcher that records every call and throws on an unexpected table).

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { hashSourcePool } from "./source-pool-hash.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });

// canonical-pipeline.ts calls createClient(...) at module scope only inside svc(), lazily (never at import
// time), so importing it here with no env vars set is safe as long as we always pass our own injected
// client (the sbClient param) and never let svc() run.
const { generateBriefFromInjected } = await jiti.import("./canonical-pipeline.ts");

const ITEM_ID = "11111111-1111-1111-1111-111111111111";

const POOL_ROW_DB = { result_url: "https://example.gov/reg", result_content: "x".repeat(500), result_index: 0 };
const VALID_HASH = hashSourcePool([{ url: POOL_ROW_DB.result_url, text: POOL_ROW_DB.result_content }]);

/** A full, valid InjectedBriefMetadata fixture -- every field the interface declares. `overrides` layers
 *  anything a test wants to vary. format_type is deliberately WRONG for the "regulation" item_type used
 *  below (a market_signal_brief on a regulation) so the format-forcing assertion proves something real. */
function baseInjectedMetadata(overrides = {}) {
  return {
    severity: "MONITORING",
    priority: "LOW",
    urgency_tier: "stable",
    format_type: "market_signal_brief",
    topic_tags: ["emissions"],
    signal_band: null,
    theme: null,
    what_is_it: "A test regulation.",
    why_matters: "Raises procurement costs for ocean carriers ahead of the Q1 filing window.",
    key_data: ["Effective 2026-01-01", "Penalty EUR 100 per tonne"],
    cost_mechanism: "Surcharge passed through on the carrier invoice.",
    requirement_trajectory: { steps: [{ date: "2025", value: "40%", label: "of verified emissions" }], note: "phase-in" },
    penalty_range: "EUR 50 to EUR 100 per tonne CO2e",
    enforcement_body: "European Commission",
    operational_scenario_tags: [],
    compliance_object_tags: [],
    related_items: [],
    intersection_summary: null,
    sources_used: [],
    regeneration_skill_version: "2026-09-11",
    ...overrides,
  };
}

// Fix round 1: the shared tail now enforces the SAME 600-char floor for both drivers (previously the
// injected branch skipped it entirely), so this fixture must clear it with margin -- x10 is comfortably
// over 600 after parseAgentOutput's own trailing-whitespace trim.
const BODY = "## Overview\n\nThis is a fully lane-authored brief body with grounded content.\n\n".repeat(10);

// Fix round 1, gate 1: under the 600-char floor. Well under, so no ambiguity with the checkBriefContent
// gate below (which needs >= 600 chars to reach in the shared tail's own check order).
const BODY_TOO_SHORT = "Too short to pass the floor.";

// Fix round 1, gate 2: >= 600 chars, but checkBriefContent's own probe (first 1000 bytes) contains a
// fetch-failure phrase ("access denied") -- must clear the length floor first so this gate is the one that
// actually fires, not the floor.
const BODY_FETCH_FAILURE = "Access Denied. " + "This page could not be retrieved. ".repeat(20);

// Fix round 1, gate 3: >= 600 chars, no fetch-failure phrase, but never mentions the required slot's own
// distinctive keywords -- uncoveredSlots() must flag it.
const BODY_MISSING_SLOT = BODY;
const REQUIRED_SLOT_ROW = { slot_key: "zzquux_marker", description: "zzquux marker distinctive keyword" };

/** Minimal fake Supabase client. `itemGrade`/`itemType` seed the one intelligence_items row every test
 *  reads back; `poolRow` (default POOL_ROW_DB) is the one agent_run_searches row hashed for the stale-pool
 *  check; `requiredSlots` (default []) seeds item_type_required_slots, now read UNCONDITIONALLY by both
 *  drivers per fix round 1; `notFound: true` makes the intelligence_items read fail, for the "item not
 *  found" case. */
function fakeClient({ itemGrade = "record", itemType = "regulation", poolRow = POOL_ROW_DB, requiredSlots = [], notFound = false } = {}) {
  const calls = { tables: [], updates: [], updateEqs: [] };
  return {
    calls,
    from(table) {
      calls.tables.push(table);
      if (table === "intelligence_items") {
        return {
          select: () => ({
            eq: (_col, val) => ({
              single: () =>
                notFound
                  ? Promise.resolve({ data: null, error: { message: "no rows" } })
                  : Promise.resolve({
                      data: { id: val, title: "Test Item", item_type: itemType, source_id: "src-1", source_url: "https://example.gov/reg", item_grade: itemGrade },
                      error: null,
                    }),
            }),
            in: () => Promise.resolve({ data: [], error: null }),
          }),
          update: (payload) => {
            calls.updates.push(payload);
            return {
              eq: (col, val) => {
                calls.updateEqs.push({ col, val });
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }
      if (table === "agent_run_searches") {
        return { select: () => ({ eq: () => Promise.resolve({ data: poolRow ? [poolRow] : [], error: null }) }) };
      }
      if (table === "item_type_required_slots") {
        return { select: () => ({ eq: () => Promise.resolve({ data: requiredSlots, error: null }) }) };
      }
      if (table === "item_cross_references") {
        return { upsert: () => Promise.resolve({ error: null }) };
      }
      return {
        select: () => { throw new Error(`unexpected select from ${table} (the live/model-generation path was reached)`); },
        update: () => { throw new Error(`unexpected update on ${table}`); },
        insert: () => { throw new Error(`unexpected insert into ${table}`); },
        upsert: () => { throw new Error(`unexpected upsert on ${table}`); },
      };
    },
  };
}

test("generateBriefFromInjected: record-grade item, valid hash -> ONE update with full_brief, the six fields, forced format_type, item_grade='brief'; generateBriefText's own tables are never touched", async () => {
  const sb = fakeClient({ itemGrade: "record", itemType: "regulation" });
  const md = baseInjectedMetadata();

  const result = await generateBriefFromInjected(ITEM_ID, "test-caller", { body: BODY, metadata: md, sourcePoolHash: VALID_HASH }, sb);

  assert.equal(result.ok, true, result.detail);
  assert.equal(sb.calls.updates.length, 1, "exactly one intelligence_items.update call -- the single write site");
  const payload = sb.calls.updates[0];
  assert.ok(payload.full_brief && payload.full_brief.length > 0, "full_brief must be populated");
  assert.equal(payload.cost_mechanism, "Surcharge passed through on the carrier invoice.");
  assert.equal(payload.penalty_range, "EUR 50 to EUR 100 per tonne CO2e");
  assert.equal(payload.enforcement_body, "European Commission");
  assert.deepEqual(payload.requirement_trajectory, { steps: [{ date: "2025", value: "40%", label: "of verified emissions" }], note: "phase-in" });
  assert.equal(payload.why_matters, "Raises procurement costs for ocean carriers ahead of the Q1 filing window.");
  assert.deepEqual(payload.key_data, ["Effective 2026-01-01", "Penalty EUR 100 per tonne"]);
  // format_type FORCED from item_type ("regulation" -> "regulatory_fact_document"), never the deliberately
  // wrong "market_signal_brief" the injected metadata carried -- proves the fmtSpec-forcing step still runs.
  assert.equal(payload.format_type, "regulatory_fact_document");
  assert.equal(payload.item_grade, "brief");
  assert.deepEqual(sb.calls.updateEqs[0], { col: "id", val: ITEM_ID });
  // `sources` (the live-path-only prompt-construction table -- attachTiers/buildSourceBlocks) was never
  // touched. item_type_required_slots WAS touched (fix round 1: slot coverage is a shared content gate),
  // asserted explicitly, not merely allowed.
  assert.ok(!sb.calls.tables.includes("sources"));
  assert.ok(sb.calls.tables.includes("item_type_required_slots"));
});

test("generateBriefFromInjected: sourcePoolHash mismatch -> refused with a 'stale pool' detail, never writes", async () => {
  const sb = fakeClient({ itemGrade: "record" });
  const md = baseInjectedMetadata();

  const result = await generateBriefFromInjected(ITEM_ID, null, { body: BODY, metadata: md, sourcePoolHash: "not-the-real-hash" }, sb);

  assert.equal(result.ok, false);
  assert.match(result.detail, /stale pool/);
  assert.equal(sb.calls.updates.length, 0, "a stale-pool refusal must never reach the write");
});

test("generateBriefFromInjected: brief-grade item without allowBriefOverwrite -> refused, never writes", async () => {
  const sb = fakeClient({ itemGrade: "brief" });
  const md = baseInjectedMetadata();

  const result = await generateBriefFromInjected(ITEM_ID, null, { body: BODY, metadata: md, sourcePoolHash: VALID_HASH }, sb);

  assert.equal(result.ok, false);
  assert.match(result.detail, /item_grade/);
  assert.equal(sb.calls.updates.length, 0, "a grade refusal must never reach the write");
});

test("generateBriefFromInjected: brief-grade item WITH allowBriefOverwrite -> accepted, writes", async () => {
  const sb = fakeClient({ itemGrade: "brief" });
  const md = baseInjectedMetadata();

  const result = await generateBriefFromInjected(ITEM_ID, null, { body: BODY, metadata: md, sourcePoolHash: VALID_HASH, allowBriefOverwrite: true }, sb);

  assert.equal(result.ok, true, result.detail);
  assert.equal(sb.calls.updates.length, 1);
  assert.equal(sb.calls.updates[0].item_grade, "brief");
});

test("generateBriefFromInjected: item not found -> ok:false, no write attempted", async () => {
  const sb = fakeClient({ notFound: true });
  const md = baseInjectedMetadata();

  const result = await generateBriefFromInjected("nonexistent", null, { body: BODY, metadata: md, sourcePoolHash: "x" }, sb);

  assert.equal(result.ok, false);
  assert.equal(sb.calls.updates.length, 0);
});

test("FIX ROUND 1: generateBriefFromInjected refuses an injected body under the 600-char floor, with the SAME detail format the model path gives", async () => {
  const sb = fakeClient({ itemGrade: "record" });
  const hash = hashSourcePool([{ url: POOL_ROW_DB.result_url, text: POOL_ROW_DB.result_content }]);
  const md = baseInjectedMetadata();

  const result = await generateBriefFromInjected(ITEM_ID, null, { body: BODY_TOO_SHORT, metadata: md, sourcePoolHash: hash }, sb);

  assert.equal(result.ok, false);
  assert.match(result.detail, /^parsed body too short \(\d+\)$/, "must match the exact detail FORMAT synthesiseAndWriteBrief's shared tail gives, not a seam-specific message");
  assert.equal(sb.calls.updates.length, 0, "a length-floor refusal must never reach the write");
});

test("FIX ROUND 1: generateBriefFromInjected refuses an injected body that fails checkBriefContent (reads as a fetch-failure explanation)", async () => {
  const sb = fakeClient({ itemGrade: "record" });
  const md = baseInjectedMetadata();
  // Sanity: this fixture actually clears the 600-char floor, so the failure below is proven to come from
  // checkBriefContent, not the floor check running first.
  assert.ok(BODY_FETCH_FAILURE.length >= 600, "fixture must clear the length floor to isolate this gate");

  const result = await generateBriefFromInjected(ITEM_ID, null, { body: BODY_FETCH_FAILURE, metadata: md, sourcePoolHash: VALID_HASH }, sb);

  assert.equal(result.ok, false);
  assert.match(result.detail, /^brief_failure_gate:/);
  assert.equal(sb.calls.updates.length, 0, "a checkBriefContent refusal must never reach the write");
});

test("FIX ROUND 1: generateBriefFromInjected refuses an injected body that leaves a required slot unaddressed, with no corrective retry", async () => {
  // itemType deliberately distinct from every other test's "regulation": requiredSlotsFor caches per
  // item_type in a MODULE-LEVEL, cross-test in-process cache (SLOT_CACHE, 10-min TTL) -- reusing
  // "regulation" here would read back another test's already-cached [] instead of this fixture's
  // requiredSlots, never reaching this fake client's item_type_required_slots stub at all.
  const sb = fakeClient({ itemGrade: "record", itemType: "directive", requiredSlots: [REQUIRED_SLOT_ROW] });
  const md = baseInjectedMetadata();
  assert.ok(BODY_MISSING_SLOT.length >= 600, "fixture must clear the length floor to isolate this gate");

  const result = await generateBriefFromInjected(ITEM_ID, null, { body: BODY_MISSING_SLOT, metadata: md, sourcePoolHash: VALID_HASH }, sb);

  assert.equal(result.ok, false);
  assert.match(result.detail, /^missing_required_slot\(synthesis\):/);
  assert.match(result.detail, /zzquux_marker/);
  assert.equal(sb.calls.updates.length, 0, "a missing-slot refusal must never reach the write");
});
