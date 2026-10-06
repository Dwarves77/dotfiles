// Run: node --test scripts/review/lib/rule-ruling.test.mjs - pure, no DB.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRuleRuling } from "./rule-ruling.mjs";
import { validateRuling } from "./ruling.mjs";

const M = { QUEUE_ID: "q", ALLOWED_DECISIONS: ["a", "b", "skip"] };
const G = (key, rec, ids) => ({ key, count: ids.length, row_ids: ids, recommended_decision: rec });

test("buildRuleRuling: rule-decidable groups take their recommendation, residue takes the declared no-mutation decision and reason", () => {
  const { ruling, tally } = buildRuleRuling({
    module: M, generatedAt: "2026-10-05T00:00:00.000Z",
    groups: [G("g1", "a", ["1", "2"]), G("g2", "b", ["3"]), G("g3", "uncertain", ["4", "5", "6"])],
    residue: { decision: "skip", reason: "owned-elsewhere" },
  });
  assert.deepEqual(ruling.groups.map((g) => g.decision), ["a", "b", "skip"]);
  assert.deepEqual(tally.decisions, { a: { groups: 1, rows: 2 }, b: { groups: 1, rows: 1 }, skip: { groups: 1, rows: 3 } });
  assert.deepEqual(tally.residue, { "owned-elsewhere": { groups: 1, rows: 3 } });
  assert.equal(ruling.queue, "q");
});

test("buildRuleRuling: the result passes the same validateRuling a committed ruling file must pass", () => {
  const { ruling } = buildRuleRuling({
    module: M, generatedAt: "2026-10-05T00:00:00.000Z",
    groups: [G("g1", "a", ["1"]), G("g2", "weird", ["2"])],
    residue: { decision: "skip", reason: "r" },
  });
  assert.equal(validateRuling(ruling, M.ALLOWED_DECISIONS).ok, true);
});

test("buildRuleRuling: a recommendation of skip is residue, never a decided group; residue reason may be a function of the group", () => {
  const { tally } = buildRuleRuling({
    module: M, generatedAt: "t", groups: [G("g1", "skip", ["1"])],
    residue: { decision: "skip", reason: (g) => `by-${g.key}` },
  });
  assert.deepEqual(tally.residue, { "by-g1": { groups: 1, rows: 1 } });
});

test("buildRuleRuling: the module's ruleRationale is recorded on each decided group", () => {
  const { ruling } = buildRuleRuling({
    module: { ...M, ruleRationale: (g, d) => `why ${g.key} ${d}` }, generatedAt: "t",
    groups: [G("g1", "a", ["1"])], residue: { decision: "skip", reason: "r" },
  });
  assert.equal(ruling.groups[0].rationale, "why g1 a");
});
