// @ts-check
// GOLDEN for the queue-scoped FACT->ANALYSIS relabel primitive (queue-relabel.mjs).
//
// Every guardrail in A's spec is asserted with a FAILING mode proven, not just a passing one: an assertion
// that only ever passes cannot show the guard is load-bearing. The four that matter:
//   1. claim_text is NEVER written (byte-identical by construction)
//   2. insertion is PURE (inverse-diff: slicing the marker back out reproduces the input byte-for-byte)
//   3. absent / ambiguous targets are REFUSED to the honest residual, never guessed
//   4. idempotent (a second run inserts nothing)

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RELABEL_MARKER, locateOnce, insertMarker, alreadyMarked, belowRegFloor, planRelabel,
} from "./queue-relabel.mjs";
import { ANALYSIS_LABEL_TOKENS } from "./analysis-labels.mjs";

test("marker derives from the ONE label vocabulary (no hand-listed token)", () => {
  const bare = RELABEL_MARKER.trimEnd();
  assert.ok(ANALYSIS_LABEL_TOKENS.includes(bare), `${bare} must be a canonical analysis label`);
  assert.ok(RELABEL_MARKER.endsWith(" "), "marker must carry the trailing space so it reads as a prefix");
});

test("locateOnce: exact-once locates; absent = -1; ambiguous = -2", () => {
  const md = "Alpha sentence. Beta sentence. Gamma.";
  assert.equal(locateOnce(md, "Beta sentence."), 16);
  assert.equal(locateOnce(md, "Delta sentence."), -1, "absent must be -1");
  assert.equal(locateOnce("Dup. Dup.", "Dup."), -2, "two occurrences must be -2 (ambiguous)");
  assert.equal(locateOnce(md, ""), -1, "empty needle must not match");
});

test("locateOnce is case-insensitive but returns the ORIGINAL-string offset", () => {
  const md = "Intro. THE CLAIM TEXT. Outro.";
  const off = locateOnce(md, "the claim text.");
  assert.equal(off, 7);
  assert.equal(md.slice(off, off + 15), "THE CLAIM TEXT.", "offset must index the original casing");
});

test("insertMarker is a PURE insertion (inverse-diff holds, surrounding bytes untouched)", () => {
  const md = "Lead-in.  The claim.\n\nTrailing block.";
  const off = locateOnce(md, "The claim.");
  const out = insertMarker(md, off);
  assert.equal(out, "Lead-in.  " + RELABEL_MARKER + "The claim.\n\nTrailing block.");
  // the inverse: slice the marker back out at the same offset -> byte-identical original
  assert.equal(out.slice(0, off) + out.slice(off + RELABEL_MARKER.length), md);
  assert.equal(out.length, md.length + RELABEL_MARKER.length);
  // whitespace either side is preserved exactly (no reflow)
  assert.ok(out.includes("Lead-in.  " + RELABEL_MARKER), "leading double-space preserved");
  assert.ok(out.endsWith("\n\nTrailing block."), "trailing block preserved byte-for-byte");
});

test("insertMarker REFUSES an out-of-range offset (the guard has a failing mode)", () => {
  assert.throws(() => insertMarker("short", 999), /out of range/);
  assert.throws(() => insertMarker("short", -1), /out of range/);
});

// MUTATION-COVERAGE: the inverse-diff assert only earns its keep if a NON-pure edit actually trips it.
// A whitespace-adjacent insertion point is the case that catches a stray trim/normalize in the insert path
// (found by mutation-testing this golden: a `.trimStart()` on the tail slid through the original fixture
// because that fixture had no whitespace at the offset). Asserted directly on the contract, so the guard
// is proven load-bearing rather than assumed.
test("insertMarker preserves whitespace AT the insertion point (catches a stray trim/normalize)", () => {
  // offset lands immediately before a run of whitespace + the sentence
  const md = "Lead-in.\n\n   Indented claim sentence.";
  const off = md.indexOf("\n\n   Indented");
  const out = insertMarker(md, off);
  assert.equal(out, "Lead-in." + RELABEL_MARKER + "\n\n   Indented claim sentence.");
  // the inverse must still reproduce the input byte-for-byte, whitespace included
  assert.equal(out.slice(0, off) + out.slice(off + RELABEL_MARKER.length), md);
  assert.ok(out.includes("\n\n   Indented"), "the newline+indent run must survive untouched");
});

test("insertMarker at offset 0 and at end-of-string are both pure", () => {
  const md = "  leading space body";
  const head = insertMarker(md, 0);
  assert.equal(head, RELABEL_MARKER + md);
  assert.equal(head.slice(RELABEL_MARKER.length), md, "inverse at offset 0");
  const tail = insertMarker(md, md.length);
  assert.equal(tail, md + RELABEL_MARKER);
  assert.equal(tail.slice(0, md.length), md, "inverse at end-of-string");
});

test("alreadyMarked detects an existing marker (idempotency guard)", () => {
  const md = "Intro. " + RELABEL_MARKER + "The claim.";
  const off = locateOnce(md, "The claim.");
  assert.equal(alreadyMarked(md, off), true);
  assert.equal(alreadyMarked("Intro. The claim.", 7), false);
});

test("belowRegFloor: NULL and T3+ are below; T1/T2 are not", () => {
  assert.equal(belowRegFloor(null), true);
  assert.equal(belowRegFloor(undefined), true);
  assert.equal(belowRegFloor(6), true);
  assert.equal(belowRegFloor(3), true);
  assert.equal(belowRegFloor(1), false);
  assert.equal(belowRegFloor(2), false);
});

// ---- planRelabel: the whole decision ----

const SECTION_ID = "sec-1";
function fixture(overrides = {}) {
  return {
    item: { item_type: "regulation" },
    claims: [
      { id: "c1", section_row_id: SECTION_ID, claim_kind: "FACT", source_tier_at_grounding: 6, claim_text: "The revised standard applies from 2027." },
      ...(overrides.extraClaims ?? []),
    ],
    sections: new Map([[SECTION_ID, "Context line. The revised standard applies from 2027. Following text."]]),
    ...overrides,
  };
}

test("planRelabel: eligible below-floor FACT is planned, prose edit is a pure insertion", () => {
  const p = planRelabel(fixture());
  assert.equal(p.belowTotal, 1);
  assert.equal(p.eligible.length, 1);
  assert.equal(p.residual.length, 0);
  assert.equal(p.sectionEdits.length, 1);
  const { before, after, inserts } = p.sectionEdits[0];
  assert.equal(inserts, 1);
  assert.equal(after, "Context line. " + RELABEL_MARKER + "The revised standard applies from 2027. Following text.");
  assert.equal(after.length, before.length + RELABEL_MARKER.length);
});

test("planRelabel NEVER emits a claim_text edit (the stored fact is untouched by construction)", () => {
  const f = fixture();
  const originalText = f.claims[0].claim_text;
  const p = planRelabel(f);
  // the plan carries the claim_text only as a locate key, byte-identical to the stored value
  assert.equal(p.eligible[0].claimText, originalText);
  // and there is no field anywhere in the plan proposing a new claim_text
  const asJson = JSON.stringify(p);
  assert.ok(!/new_claim_text|claim_text_after|normalized_claim/.test(asJson), "plan must not propose any claim_text rewrite");
  assert.equal(f.claims[0].claim_text, originalText, "input claim must not be mutated");
});

test("planRelabel REFUSES a paraphrased (absent) claim to the honest residual", () => {
  const p = planRelabel(fixture({
    sections: new Map([[SECTION_ID, "Context line. The standard is effective in 2027. Following text."]]),
  }));
  assert.equal(p.eligible.length, 0);
  assert.equal(p.residual.length, 1);
  assert.match(p.residual[0].reason, /not a raw substring/);
  assert.equal(p.sectionEdits.length, 0, "no prose is touched when nothing is eligible");
});

test("planRelabel REFUSES an ambiguous (multi-occurrence) claim", () => {
  const dup = "X applies. X applies.";
  const p = planRelabel({
    item: { item_type: "regulation" },
    claims: [{ id: "c1", section_row_id: SECTION_ID, claim_kind: "FACT", source_tier_at_grounding: null, claim_text: "X applies." }],
    sections: new Map([[SECTION_ID, dup]]),
  });
  assert.equal(p.eligible.length, 0);
  assert.match(p.residual[0].reason, /more than once/);
});

test("planRelabel is IDEMPOTENT (a second pass over marked prose plans nothing)", () => {
  const first = planRelabel(fixture());
  const marked = first.sectionEdits[0].after;
  const second = planRelabel(fixture({ sections: new Map([[SECTION_ID, marked]]) }));
  assert.equal(second.eligible.length, 0, "already-marked sentence must not be re-marked");
  assert.match(second.residual[0].reason, /already carries the marker/);
});

test("planRelabel leaves at-floor FACTs and non-FACT claims alone", () => {
  const p = planRelabel(fixture({
    claims: [
      { id: "atFloor", section_row_id: SECTION_ID, claim_kind: "FACT", source_tier_at_grounding: 1, claim_text: "The revised standard applies from 2027." },
      { id: "analysis", section_row_id: SECTION_ID, claim_kind: "ANALYSIS", source_tier_at_grounding: 6, claim_text: "The revised standard applies from 2027." },
      { id: "gap", section_row_id: SECTION_ID, claim_kind: "GAP", source_tier_at_grounding: null, claim_text: "The revised standard applies from 2027." },
    ],
  }));
  assert.equal(p.belowTotal, 0, "T1 FACT is at floor; ANALYSIS/GAP are out of scope");
  assert.equal(p.eligible.length, 0);
  assert.equal(p.sectionEdits.length, 0);
});

test("planRelabel skips non-reg-family items with an explicit reason (never a silent no-op)", () => {
  const p = planRelabel(fixture({ item: { item_type: "market_signal" } }));
  assert.equal(p.eligible.length, 0);
  assert.ok(p.skipReason, "a skip must carry a stated reason");
  assert.match(p.skipReason, /not reg-family/);
});

test("planRelabel handles multiple eligible claims in ONE section (offsets re-located as text mutates)", () => {
  const md = "Alpha claim one. Bravo claim two. Charlie tail.";
  const p = planRelabel({
    item: { item_type: "regulation" },
    claims: [
      { id: "c1", section_row_id: SECTION_ID, claim_kind: "FACT", source_tier_at_grounding: 6, claim_text: "Alpha claim one." },
      { id: "c2", section_row_id: SECTION_ID, claim_kind: "FACT", source_tier_at_grounding: 6, claim_text: "Bravo claim two." },
    ],
    sections: new Map([[SECTION_ID, md]]),
  });
  assert.equal(p.eligible.length, 2);
  const { before, after, inserts } = p.sectionEdits[0];
  assert.equal(inserts, 2);
  assert.equal(after, RELABEL_MARKER + "Alpha claim one. " + RELABEL_MARKER + "Bravo claim two. Charlie tail.");
  assert.equal(after.length, before.length + 2 * RELABEL_MARKER.length, "both markers accounted, nothing else changed");
  // inverse-diff on the whole section: removing both markers reproduces the original
  assert.equal(after.split(RELABEL_MARKER).join(""), md);
});
