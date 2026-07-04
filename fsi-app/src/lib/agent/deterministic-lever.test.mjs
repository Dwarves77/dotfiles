// @ts-check
// Red-then-green for the deterministic-first gate (spend-routing correction, 2026-07-04). RED = an item whose
// failure set is FULLY deterministically-resolvable (an exercisable $0 lever), routed to the paid queue, must
// be REJECTED. GREEN = a genuine generation-need item is allowed through. This is the mechanical proof that
// the operator never has to be the one who asks "did you check the free lever first?".

import { test } from "node:test";
import assert from "node:assert/strict";
import { unexercisedLevers, paidQueueVerdict, DETERMINISTIC_LEVER_CLASSES, GENERATION_ONLY_CLASSES } from "./deterministic-lever.mjs";

test("RED: item whose ONLY failure is fact_below_floor with re-homable facts is REJECTED from paid", () => {
  // The exact anti-pattern the gate exists to stop: a $0-resolvable item routed to paid re-synthesis.
  const v = paidQueueVerdict(["fact_below_authority_floor"], { rehomableFacts: 3 });
  assert.equal(v.eligible, false, "a fully $0-resolvable item must be rejected from the paid queue (RED)");
  assert.match(v.reason, /unexercised \$0 lever/);
  assert.match(v.reason, /4b-re-home/);
  assert.equal(v.levers.length, 1);
  assert.equal(v.levers[0].count, 3);
});

test("RED: mixed item with an exercisable $0 lever is still rejected (free lever runs FIRST, then paid on residual)", () => {
  // fact_below_floor (re-homable) + missing_required_slot (generation): the $0 lever must be exercised before
  // paying, so the item is rejected from the paid queue until the free re-home has run.
  const v = paidQueueVerdict(["fact_below_authority_floor", "missing_required_slot"], { rehomableFacts: 2 });
  assert.equal(v.eligible, false);
  assert.match(v.reason, /4b-re-home\(2\)/);
});

test("GREEN: generation-only item (unlabeled_assertion / missing_slot) is ALLOWED to the paid queue", () => {
  const v = paidQueueVerdict(["unlabeled_assertion", "missing_required_slot"], {});
  assert.equal(v.eligible, true, "no $0 data lever exists (labels/content live in markdown) — paid pass warranted");
  assert.equal(v.levers.length, 0);
});

test("GREEN: fact_below_floor with ZERO re-homable facts is allowed (span is a corroborator paraphrase, no $0 lever)", () => {
  // The live-corpus state (dry-run 2026-07-04): floor-walled items whose spans do NOT verbatim-match a pool
  // floor source. No exercisable lever -> the paid path (4c relabel / re-ground) is genuinely warranted.
  const v = paidQueueVerdict(["fact_below_authority_floor"], { rehomableFacts: 0 });
  assert.equal(v.eligible, true);
});

test("fact_span_not_in_source with a re-pointable span exposes a lever; without, it does not", () => {
  assert.equal(paidQueueVerdict(["fact_span_not_in_source"], { repointableSpans: 1 }).eligible, false);
  assert.equal(paidQueueVerdict(["fact_span_not_in_source"], { repointableSpans: 0 }).eligible, true);
});

test("unexercisedLevers lists only present + exercisable classes", () => {
  const levers = unexercisedLevers(["fact_below_authority_floor", "fact_span_not_in_source"], { rehomableFacts: 1, repointableSpans: 2 });
  assert.deepEqual(levers.map((l) => l.class).sort(), ["fact_below_authority_floor", "fact_span_not_in_source"]);
});

test("DELETE-disposition item is REJECTED from the paid queue regardless of failure classes", () => {
  // held dup-loser (d5ee6ab8 / 9c5d1d17) — delete on survivor release, never pay to regenerate.
  const v = paidQueueVerdict(["missing_required_slot"], { rehomableFacts: 0 }, "DELETE");
  assert.equal(v.eligible, false);
  assert.match(v.reason, /disposition is DELETE/);
  // case-insensitive; and a non-DELETE disposition does not reject a generation-need item
  assert.equal(paidQueueVerdict(["unlabeled_assertion"], {}, "delete").eligible, false);
  assert.equal(paidQueueVerdict(["unlabeled_assertion"], {}, "DEFER").eligible, true);
  assert.equal(paidQueueVerdict(["unlabeled_assertion"], {}, null).eligible, true);
});

test("class taxonomy: deterministic vs generation-only are disjoint and cover the census classes", () => {
  for (const c of DETERMINISTIC_LEVER_CLASSES) assert.ok(!GENERATION_ONLY_CLASSES.has(c), `${c} must not be in both sets`);
  // the label-bearing classes are generation-only (fix lives in content_md, not claim_kind)
  assert.ok(GENERATION_ONLY_CLASSES.has("unlabeled_assertion"));
  assert.ok(GENERATION_ONLY_CLASSES.has("missing_required_slot"));
  assert.ok(DETERMINISTIC_LEVER_CLASSES.has("fact_below_authority_floor"));
});
