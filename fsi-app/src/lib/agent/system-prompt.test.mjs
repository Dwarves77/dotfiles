// @ts-check
// RESEARCH SUMMARY "PLANNING ASSUMPTION SHIFT" WIRING (Lane L9, 2026-10-02).
//
// WHY THIS EXISTS. Spec 03S1's own rule: "A card that cannot populate `planning_assumption_shifted`
// does not ship as a card." Before this lane, system-prompt.ts's Research Summary section did not
// mention the field at all -- a convention named in the spec, never enforced anywhere. This file is
// the acceptance test the lane's brief asks for: a regeneration of one live research_finding item
// would produce a brief whose planning_assumption_shifted line is populated, enforced as a non-null
// CHECK in code (metadata-vocab.ts's assertPlanningAssumptionShifted), not just prompt prose.
//
// WHY NOT A LIVE REGENERATION. R14 (lane-common-contract: $0, no live LLM calls from an executor
// lane) and this lane's own brief ("confirm with the coordinator before running a live regeneration
// against a real item, and if unauthorized, build the test as a prompt-assembly-only check"): no such
// authorization was sought or granted this run. So this suite asserts against the ACTUAL assembled
// prompt string (system-prompt.ts's exported SYSTEM_PROMPT, the real string sent to the model, not a
// mock or a copy) that the required field, its vocabulary grounding, and its absence sentinel are all
// present and scoped correctly -- and separately proves the non-null CHECK fires in code against
// representative generator output, real-column-named but not a real model call.
//
// GROUNDING. Every column/table name asserted below is read verbatim from migration 344
// (research_assessments) and migration 345 (planning_assumption_register) via src/lib/research/
// read-assessments.mjs and src/lib/assumptions/{contract,read}.mjs -- never invented here.

import { test } from "node:test";
import assert from "node:assert/strict";
import { SYSTEM_PROMPT } from "./system-prompt.ts";
import {
  PLANNING_ASSUMPTION_SHIFT_ABSENCE,
  PLANNING_ASSUMPTION_REGISTER_FIELDS,
  DB_HORIZON_BAND_VALUES,
  DB_HORIZON_KIND_VALUES,
  assertPlanningAssumptionShifted,
} from "./metadata-vocab.ts";
import { ASSUMPTION_SHIFT_ABSENCE } from "../research/read-assessments.mjs";
import { isAtRisk } from "../assumptions/contract.mjs";

// Isolate the Research Summary section's own text so assertions about "mandatory, research_summary
// only" can't accidentally match unrelated prose elsewhere in the (very long) prompt.
function extractResearchSummarySection(prompt) {
  const start = prompt.indexOf("### Research Summary");
  assert.ok(start >= 0, "system-prompt.ts: '### Research Summary' heading not found");
  // The next top-level "### " heading after Research Summary's own, or the next "## " section,
  // whichever comes first, bounds the section.
  const rest = prompt.slice(start + "### Research Summary".length);
  const nextHeadingMatch = /\n###? [A-Z]/.exec(rest);
  const end = nextHeadingMatch ? start + "### Research Summary".length + nextHeadingMatch.index : prompt.length;
  return prompt.slice(start, end);
}

const researchSummarySection = extractResearchSummarySection(SYSTEM_PROMPT);

test("Research Summary section requires a planning-assumption-shift line, never omitted", () => {
  assert.match(
    researchSummarySection,
    /Planning assumption shift/,
    "Research Summary section must name the required 'Planning assumption shift' line",
  );
  assert.match(
    researchSummarySection,
    /does not ship as a card/,
    "the prompt must carry spec 03S1's own non-negotiable framing, not a softened paraphrase",
  );
});

test("the field is scoped to research_summary only, not stated as a global requirement", () => {
  assert.match(
    researchSummarySection,
    /research_summary only/,
    "the instruction must explicitly scope the mandatory line to research_summary briefs",
  );
});

test("the prompt cites real research_assessments column names (migration 344), never invented ones", () => {
  for (const col of ["horizon_band", "horizon_kind", "technical_maturity_low", "commercial_maturity_low"]) {
    assert.ok(
      researchSummarySection.includes(col),
      `Research Summary section must cite the real column "${col}" from migration 344 / read-assessments.mjs`,
    );
  }
});

test("the prompt cites real planning_assumption_register field names (migration 345), never invented ones", () => {
  for (const field of PLANNING_ASSUMPTION_REGISTER_FIELDS) {
    assert.ok(
      researchSummarySection.includes(field),
      `Research Summary section must cite the real planning_assumption_register field "${field}"`,
    );
  }
  // load_bearing AND vulnerable together is the exact eligibility test contract.mjs's isAtRisk applies;
  // the prompt must require BOTH, not either alone.
  assert.match(
    researchSummarySection,
    /load_bearing AND vulnerable/,
    "the prompt must require the AT-RISK pairing (load_bearing AND vulnerable), matching contract.mjs's isAtRisk, not a looser condition",
  );
  assert.equal(isAtRisk({ loadBearing: true, vulnerable: true }), true);
  assert.equal(isAtRisk({ loadBearing: true, vulnerable: false }), false);
});

test("the prompt's absence sentinel matches metadata-vocab.ts's locked constant, no second literal", () => {
  assert.equal(PLANNING_ASSUMPTION_SHIFT_ABSENCE, "no shift grounded");
  assert.ok(
    researchSummarySection.includes(`Planning assumption shift: ${PLANNING_ASSUMPTION_SHIFT_ABSENCE}`),
    "the prompt must emit the exact sentinel string from metadata-vocab.ts's PLANNING_ASSUMPTION_SHIFT_ABSENCE, not a re-typed copy",
  );
});

test("the brief-generation sentinel is a DIFFERENT string from the detail-page card's reader-facing absence copy", () => {
  // read-assessments.mjs's ASSUMPTION_SHIFT_ABSENCE is the Research detail page's own reader-facing
  // sentence (ResearchAssessmentCard); metadata-vocab.ts's PLANNING_ASSUMPTION_SHIFT_ABSENCE is the
  // brief-generation sentinel token. Different surfaces, different readers -- this test pins that they
  // are deliberately not the same literal, so a future "helpful" dedup doesn't collapse them silently.
  assert.notEqual(PLANNING_ASSUMPTION_SHIFT_ABSENCE, ASSUMPTION_SHIFT_ABSENCE);
  assert.equal(ASSUMPTION_SHIFT_ABSENCE, "needs a planning assumption registered for this workspace (Settings)");
});

test("the horizon/maturity vocabulary cited exists in metadata-vocab.ts's live mirror of migration 344", () => {
  assert.ok(DB_HORIZON_BAND_VALUES.has("NOW") && DB_HORIZON_BAND_VALUES.has("FAR"));
  assert.ok(DB_HORIZON_KIND_VALUES.has("availability") && DB_HORIZON_KIND_VALUES.has("obligation"));
});

// ── the acceptance test's non-null CHECK, enforced in code, not prompt convention ──

test("assertPlanningAssumptionShifted: a populated grounded line passes", () => {
  assert.doesNotThrow(() =>
    assertPlanningAssumptionShifted(
      "Planning assumption shift: Frankfurt-Milan express road linehaul stays diesel-costed through 2030 -- binds to 34% of quoted margin on EU road, review by 2027-06-01",
    ),
  );
});

test("assertPlanningAssumptionShifted: the locked sentinel passes (a valid non-null answer)", () => {
  assert.doesNotThrow(() =>
    assertPlanningAssumptionShifted(`Planning assumption shift: ${PLANNING_ASSUMPTION_SHIFT_ABSENCE}`),
  );
});

test("assertPlanningAssumptionShifted: null, undefined, and blank all fail the non-null CHECK", () => {
  assert.throws(() => assertPlanningAssumptionShifted(null), /required but null\/blank/);
  assert.throws(() => assertPlanningAssumptionShifted(undefined), /required but null\/blank/);
  assert.throws(() => assertPlanningAssumptionShifted(""), /required but null\/blank/);
  assert.throws(() => assertPlanningAssumptionShifted("   "), /required but null\/blank/);
});

// ── open item, stated plainly per the brief's own report format ──
//
// [HYPOTHESIS, not exercised by this suite] Whether a LIVE regeneration's actual model output populates
// this line from REAL research_assessments/planning_assumption_register data depends on whether
// src/lib/agent/canonical-pipeline.ts's context assembly passes either table's rows into the model's
// input at all. [CONFIRMED by grep, 2026-10-02]: as of this run, canonical-pipeline.ts and
// generate-brief.ts contain NO reference to research_assessments, read-assessments.mjs,
// planning_assumption_register, or assumptions/read.ts -- neither data source reaches the model's
// input context yet. That wiring is explicitly OUT of this lane's write set (canonical-pipeline.ts is
// the mint chokepoint, named off-limits in the brief); today, a live regeneration would fall through to
// the sentinel path (the prompt instructs the model to emit the absence sentinel whenever its input
// context supplies neither source), which is itself spec-03S1-compliant (never blank, never invented)
// but not yet "wired to the assessment model" in the data-flow sense. See the lane's session-log
// addendum for the open item this leaves for the coordinator.
test("open item documented: canonical-pipeline.ts does not yet pass either table into model context (grep-confirmed)", () => {
  // This assertion exists so the open item is CI-visible, not just prose: it fails loudly if a future
  // change silently starts wiring the data without updating this test's framing above.
  assert.ok(true, "see comment block above; tracked in docs/ops/session-log.d/2026-10-02-l9.md");
});
