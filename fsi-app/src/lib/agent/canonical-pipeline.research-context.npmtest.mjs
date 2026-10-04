// canonical-pipeline.research-context.npmtest.mjs -- Lane L9, 2026-10-02.
//
// Coordinator ruling (same date, after this lane's own report): "it is yours, not L7's. A requirement
// the generator can never satisfy is half a slice (rule 17)." canonical-pipeline.ts now builds the
// "RESEARCH ASSESSMENT CONTEXT" block for research_finding items, reusing read-assessments.mjs's
// selectAssessmentView -- no second query. ADR-042 (2026-10-03) removed the per-tenant planning-
// assumption half: the block now carries the research_assessments read only.
//
// *.npmtest.mjs (not *.test.mjs), same reason as the sibling write-fields/injected-synthesis files:
// canonical-pipeline.ts is only importable via jiti (its "@/" aliases are not portable to plain
// `node --test`).
//
// The acceptance shape: with an assessment present the block appears with real field names; with none,
// the block is absent and the sentinel path is the only valid output. One
// fixture dry fire of the pipeline step itself (buildPlanningAssumptionContext), no live model call.

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });

const { buildPlanningAssumptionContext } =
  await jiti.import("./canonical-pipeline.ts");

const ITEM_ID = "item-research-1";

const ASSESSMENT_ROW = {
  item_id: ITEM_ID,
  technical_maturity_low: 6,
  technical_maturity_high: 7,
  technical_maturity_method: "R1: dated statutory instrument",
  commercial_maturity_low: 3,
  commercial_maturity_high: 4,
  commercial_maturity_method: null,
  horizon_kind: "availability",
  horizon_band: "NEAR",
  horizon_rule: "R1",
  horizon_confidence: "high",
  horizon_trigger_note: null,
  refusal_reason: null,
  credibility_evidence_score: "medium",
  credibility_authority_score: { distribution: { tier1: 1 } },
  status_token: "CONFIRMED",
  computed_at: "2026-10-01T00:00:00Z",
};

/** Fake Supabase client answering exactly the one query shape buildPlanningAssumptionContext makes:
 *  research_assessments_current.select().eq().maybeSingle(). Any other table throws, which proves
 *  exactly which tables get touched (the removed planning_assumption_register is never read). */
function fakeClient({ assessmentRow = null } = {}) {
  const calls = { tables: [] };
  return {
    calls,
    from(table) {
      calls.tables.push(table);
      if (table === "research_assessments_current") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: assessmentRow, error: null }),
            }),
          }),
        };
      }
      throw new Error(`unexpected read from ${table}`);
    },
  };
}

test("assessment present: the block appears, headed correctly, with real field names from research_assessments", async () => {
  const sb = fakeClient({ assessmentRow: ASSESSMENT_ROW });

  const block = await buildPlanningAssumptionContext(sb, ITEM_ID);

  assert.ok(block.length > 0, "expected a non-empty block when the assessment has real data");
  assert.match(block, /RESEARCH ASSESSMENT CONTEXT \(planning-assumption-shift source data/);
  assert.match(block, /horizon_band=NEAR/);
  assert.match(block, /horizon_kind=availability/);
  assert.match(block, /horizon_rule=R1/);
  assert.match(block, /technical_maturity_low=6, technical_maturity_high=7/);
  assert.match(block, /commercial_maturity_low=3, commercial_maturity_high=4/);
  assert.ok(!block.includes("At-risk planning assumption:"), "no customer-entered assumption line is ever emitted (ADR-042)");
  assert.deepEqual(sb.calls.tables, ["research_assessments_current"]);
});

test("no assessment: the block is absent (empty string), the sentinel path is the only valid output", async () => {
  const sb = fakeClient({ assessmentRow: null });

  const block = await buildPlanningAssumptionContext(sb, ITEM_ID);

  assert.equal(block, "", "with no real assessment the block must be exactly empty, never a partial or placeholder block");
});

test("a research_assessments_current read failure degrades to no-assessment, non-gating", async () => {
  const sb = {
    from(table) {
      if (table === "research_assessments_current") {
        return { select: () => ({ eq: () => ({ maybeSingle: () => { throw new Error("transient DB error"); } }) }) };
      }
      throw new Error(`unexpected read from ${table}`);
    },
  };

  const block = await buildPlanningAssumptionContext(sb, ITEM_ID);

  assert.equal(block, "", "a transient read failure must degrade to empty, never throw and never block generation");
});
