// canonical-pipeline.research-context.npmtest.mjs -- Lane L9, 2026-10-02.
//
// Coordinator ruling (same date, after this lane's own report): "it is yours, not L7's. A requirement
// the generator can never satisfy is half a slice (rule 17)." canonical-pipeline.ts now builds the
// "RESEARCH ASSESSMENT CONTEXT" block for research_finding items, reusing read-assessments.mjs's
// selectAssessmentView/formatAssumptionShift and assumptions/read.ts's readAtRiskAssumptions (which
// already applies contract.mjs's load_bearing-AND-vulnerable eligibility) -- no second query, no
// re-derived eligibility rule.
//
// *.npmtest.mjs (not *.test.mjs), same reason as the sibling write-fields/injected-synthesis files:
// canonical-pipeline.ts is only importable via jiti (its "@/" aliases are not portable to plain
// `node --test`).
//
// The acceptance shape the brief asked for: with both sources present the block appears with real
// field names; with neither, the block is absent and the sentinel path is the only valid output. One
// fixture dry fire of the pipeline step itself (buildPlanningAssumptionContext), no live model call.

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });

const { buildPlanningAssumptionContext, RESEARCH_ASSESSMENT_CONTEXT_ORG_SCAN_LIMIT } =
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

const AT_RISK_ROW_DB = {
  id: "assumption-1",
  org_id: "org-1",
  name: "Frankfurt-Milan express road linehaul stays diesel-costed through 2030",
  value_numeric: 34,
  unit: "% of quoted margin",
  bound_to: "EU road corridor cost base",
  load_bearing: true,
  vulnerable: true,
  review_date: "2027-06-01",
  source_note: null,
  status: "active",
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

/** Fake Supabase client answering exactly the three query shapes buildPlanningAssumptionContext (and,
 *  transitively, assumptions/read.ts) makes: research_assessments_current.select().eq().maybeSingle(),
 *  organizations.select().limit(), and planning_assumption_register.select().eq().order().limit().
 *  `opts.assessmentRow` / `opts.assumptionRows` control what each query returns; `null`/`[]` models the
 *  "neither source present" half of the acceptance test. Any other table throws -- proves exactly which
 *  tables get touched, same shape as the sibling write-fields.npmtest.mjs's fakeClient(). */
function fakeClient({ assessmentRow = null, orgIds = [], assumptionRowsByOrg = {} } = {}) {
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
      if (table === "organizations") {
        return {
          select: () => ({
            limit: () => Promise.resolve({ data: orgIds.map((id) => ({ id })), error: null }),
          }),
        };
      }
      if (table === "planning_assumption_register") {
        return {
          select: () => ({
            eq: (_col, orgId) => ({
              order: () => ({
                limit: () => Promise.resolve({ data: assumptionRowsByOrg[orgId] ?? [], error: null }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected read from ${table}`);
    },
  };
}

test("both sources present: the block appears, headed correctly, with real field names from both tables", async () => {
  const sb = fakeClient({
    assessmentRow: ASSESSMENT_ROW,
    orgIds: ["org-1"],
    assumptionRowsByOrg: { "org-1": [AT_RISK_ROW_DB] },
  });

  const block = await buildPlanningAssumptionContext(sb, ITEM_ID);

  assert.ok(block.length > 0, "expected a non-empty block when both sources have real data");
  assert.match(block, /RESEARCH ASSESSMENT CONTEXT \(planning-assumption-shift source data/);
  // Assessment half: real field names/values from research_assessments, not invented.
  assert.match(block, /horizon_band=NEAR/);
  assert.match(block, /horizon_kind=availability/);
  assert.match(block, /horizon_rule=R1/);
  assert.match(block, /technical_maturity_low=6, technical_maturity_high=7/);
  assert.match(block, /commercial_maturity_low=3, commercial_maturity_high=4/);
  // Assumption half: the exact formatAssumptionShift() rendering (reused, not re-derived), real values.
  assert.match(block, /At-risk planning assumption:/);
  assert.match(
    block,
    /Frankfurt-Milan express road linehaul stays diesel-costed through 2030 -- binds to EU road corridor cost base \(34 % of quoted margin\), review by 2027-06-01/,
  );
  assert.deepEqual(sb.calls.tables, ["research_assessments_current", "organizations", "planning_assumption_register"]);
});

test("neither source present: the block is absent (empty string), the sentinel path is the only valid output", async () => {
  const sb = fakeClient({ assessmentRow: null, orgIds: ["org-1"], assumptionRowsByOrg: { "org-1": [] } });

  const block = await buildPlanningAssumptionContext(sb, ITEM_ID);

  assert.equal(block, "", "with no real assessment and no at-risk assumption, the block must be exactly empty -- never a partial or placeholder block, so the model's only valid instruction is the prompt's sentinel path");
});

test("a load_bearing-but-not-vulnerable row is correctly excluded (readAtRiskAssumptions' own filter, not re-derived here)", async () => {
  const notAtRisk = { ...AT_RISK_ROW_DB, vulnerable: false };
  const sb = fakeClient({ assessmentRow: null, orgIds: ["org-1"], assumptionRowsByOrg: { "org-1": [notAtRisk] } });

  const block = await buildPlanningAssumptionContext(sb, ITEM_ID);

  assert.equal(block, "", "a load_bearing-only (not vulnerable) row must never surface in the block");
});

test("assessment present, no at-risk assumption: the block carries only the Assessment line", async () => {
  const sb = fakeClient({ assessmentRow: ASSESSMENT_ROW, orgIds: [], assumptionRowsByOrg: {} });

  const block = await buildPlanningAssumptionContext(sb, ITEM_ID);

  assert.match(block, /horizon_band=NEAR/);
  assert.ok(!block.includes("At-risk planning assumption:"));
});

test("a research_assessments_current read failure degrades to no-assessment, non-gating (still checks organizations)", async () => {
  const sb = {
    calls: { tables: [] },
    from(table) {
      sb.calls.tables.push(table);
      if (table === "research_assessments_current") {
        return { select: () => ({ eq: () => ({ maybeSingle: () => { throw new Error("transient DB error"); } }) }) };
      }
      if (table === "organizations") return { select: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) };
      throw new Error(`unexpected read from ${table}`);
    },
  };

  const block = await buildPlanningAssumptionContext(sb, ITEM_ID);

  assert.equal(block, "", "a transient read failure must degrade to empty, never throw and never block generation");
});

test("RESEARCH_ASSESSMENT_CONTEXT_ORG_SCAN_LIMIT is exported and bounded well under F38's 1000-row threshold", () => {
  assert.ok(typeof RESEARCH_ASSESSMENT_CONTEXT_ORG_SCAN_LIMIT === "number");
  assert.ok(RESEARCH_ASSESSMENT_CONTEXT_ORG_SCAN_LIMIT > 0 && RESEARCH_ASSESSMENT_CONTEXT_ORG_SCAN_LIMIT < 1000);
});
