// @ts-check
// SLOT-ENFORCEMENT-AT-SYNTHESIS tests (Wave-α C1). Pure-core behavior + the wiring guarantee that
// synthesiseAndWriteBrief actually reads item_type_required_slots, injects the directive, checks the
// brief post-synthesis, retries ONCE with explicit slot feedback, and fails honestly (static-scan of
// canonical-pipeline.ts — the vocab-drift-guard pattern; the pipeline module itself is not
// node-importable due to @/ aliases).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  buildSlotDirective,
  uncoveredSlots,
  buildSlotRetryFeedback,
  slotCacheGet,
  slotCachePut,
} from "./slot-prompt.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const pipeline = readFileSync(resolve(HERE, "./canonical-pipeline.ts"), "utf8");

// The 12 live item types × their slot sets (mirrors item_type_required_slots, 48 rows, read 2026-07-11).
const NON_REG_SLOTS = [
  { slot_key: "signal_event", description: "The specific market event or signal and what triggered it" },
  { slot_key: "driving_parties", description: "The named parties driving the signal and their interests" },
  { slot_key: "conversion_trigger", description: "What converts the signal into binding rule or commercial pressure" },
  { slot_key: "action_now", description: "The positioning move the workspace makes while it is still a signal" },
];

test("buildSlotDirective names every slot + its description; empty for no slots", () => {
  const d = buildSlotDirective(NON_REG_SLOTS);
  for (const s of NON_REG_SLOTS) {
    assert.ok(d.includes(s.slot_key), `directive must name ${s.slot_key}`);
    assert.ok(d.includes(s.description), `directive must carry the description for ${s.slot_key}`);
  }
  assert.ok(/REQUIRED SLOTS/.test(d));
  assert.ok(/GAP/.test(d), "directive must offer the explicit-GAP exit (FACT-or-GAP satisfiable)");
  assert.equal(buildSlotDirective([]), "");
});

test("uncoveredSlots: topical coverage OR explicit GAP counts; total omission is flagged", () => {
  // NB: coverage is the SAME lenient any-keyword heuristic as grounding's proseCovers — the fixture
  // keeps driving_parties' keywords (named/parties/driving/interests/signal) out of the body entirely.
  const body = [
    "The consortium announced the pilot after the March port measure. The event was corroborated by two carriers.",
    "Specific conversion trigger not available from primary sources as of 2026-07-11.",
  ].join(" ");
  const uncovered = uncoveredSlots(body, NON_REG_SLOTS);
  const keys = uncovered.map((s) => s.slot_key);
  // signal_event covered topically; conversion_trigger covered by the GAP naming; the other two absent.
  assert.ok(!keys.includes("signal_event"));
  assert.ok(!keys.includes("conversion_trigger"));
  assert.ok(keys.includes("driving_parties"), "a slot with zero topical or GAP coverage must be flagged");
  // an empty brief leaves every slot uncovered
  assert.equal(uncoveredSlots("", NON_REG_SLOTS).length, 4);
  // full coverage → none
  const full = "The signal event was the ETS announcement. The parties driving it are named carriers with stated interests. The conversion trigger is the comitology vote. Action now: engage the vendor while it is still a signal.";
  assert.equal(uncoveredSlots(full, NON_REG_SLOTS).length, 0);
});

test("buildSlotRetryFeedback names each uncovered slot and demands FACT-or-GAP", () => {
  const fb = buildSlotRetryFeedback(NON_REG_SLOTS.slice(0, 2));
  assert.ok(fb.includes("signal_event") && fb.includes("driving_parties"));
  assert.ok(/CORRECTIVE RETRY/.test(fb));
  assert.ok(/GAP/.test(fb));
});

test("slot cache: fresh hit within TTL, miss after TTL, per-item_type isolation", () => {
  const store = new Map();
  const t0 = 1_000_000;
  assert.equal(slotCacheGet(store, "market_signal", t0), null);
  slotCachePut(store, "market_signal", NON_REG_SLOTS, t0);
  assert.deepEqual(slotCacheGet(store, "market_signal", t0 + 1000), NON_REG_SLOTS);
  assert.equal(slotCacheGet(store, "regulation", t0 + 1000), null, "cache is per item_type");
  assert.equal(slotCacheGet(store, "market_signal", t0 + 11 * 60 * 1000), null, "expired after TTL");
});

test("WIRING — synthesiseAndWriteBrief reads the slot table, injects the directive, post-checks + retries once + fails honestly", () => {
  // reads item_type_required_slots at generation time (fail-closed on read error)
  assert.ok(/requiredSlotsFor\(/.test(pipeline), "canonical-pipeline must load required slots at synthesis time");
  assert.ok(/item_type_required_slots/.test(pipeline.slice(0, pipeline.indexOf("groundBriefImpl"))),
    "the slot table must be read on the SYNTHESIS side (not only in grounding)");
  // directive injected into the synthesis user prompt
  assert.ok(/buildSlotDirective\(/.test(pipeline), "the slot directive must be built into the synthesis prompt");
  // post-synthesis check + one corrective retry + honest failure
  assert.ok(/uncoveredSlots\(/.test(pipeline), "the generated brief must be checked against the same slots");
  assert.ok(/buildSlotRetryFeedback\(/.test(pipeline), "a failed check must retry ONCE with explicit slot feedback");
  assert.ok(/missing_required_slot\(synthesis\)/.test(pipeline), "a still-failing brief must fail with a named honest detail");
});
