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
// (research_assessments) via src/lib/research/read-assessments.mjs -- never invented here.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SYSTEM_PROMPT } from "./system-prompt.ts";
import {
  PLANNING_ASSUMPTION_SHIFT_ABSENCE,
  DB_HORIZON_BAND_VALUES,
  DB_HORIZON_KIND_VALUES,
  assertPlanningAssumptionShifted,
} from "./metadata-vocab.ts";

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

test("the prompt's absence sentinel matches metadata-vocab.ts's locked constant, no second literal", () => {
  assert.equal(PLANNING_ASSUMPTION_SHIFT_ABSENCE, "no shift grounded");
  assert.ok(
    researchSummarySection.includes(`Planning assumption shift: ${PLANNING_ASSUMPTION_SHIFT_ABSENCE}`),
    "the prompt must emit the exact sentinel string from metadata-vocab.ts's PLANNING_ASSUMPTION_SHIFT_ABSENCE, not a re-typed copy",
  );
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

// ── coordinator ruling (2026-10-02): canonical-pipeline.ts IS this lane's territory, not L7's ──
//
// [CONFIRMED by grep, 2026-10-02] canonical-pipeline.ts now imports selectAssessmentView
// from read-assessments.mjs, and names the exact block header this prompt instructs the model to look for. The prompt and the
// pipeline must therefore agree on that literal header string -- this test is the drift guard.
test("the prompt names the exact context block header canonical-pipeline.ts emits", () => {
  assert.match(researchSummarySection, /"RESEARCH ASSESSMENT CONTEXT"/);
  const pipelineText = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "canonical-pipeline.ts"), "utf8");
  assert.match(
    pipelineText,
    /RESEARCH ASSESSMENT CONTEXT \(planning-assumption-shift source data/,
    "canonical-pipeline.ts must emit the SAME block header text the prompt names, or the model is told to look for a block that never arrives",
  );
  assert.match(
    pipelineText,
    /it\.item_type === "research_finding" \? await buildPlanningAssumptionContext/,
    "the context block must be gated to research_finding items only -- every other item_type is untouched",
  );
});
