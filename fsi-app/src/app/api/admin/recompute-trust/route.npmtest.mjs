// Unit test for the Wave W2 demotion wire (unwired-module disposition register #25,
// docs/plans/unwired-disposition-2026-08-31.md §J): evaluateDemotion had zero production
// callers before this wave. Exercises the REAL exported decision function this route calls
// per source (not a reimplementation) — same route.ts-exports-a-pure-function-for-testability
// pattern src/app/api/admin/sources/bulk-import/route.ts's headReachabilityDecision and
// src/app/api/watchlist/route.ts's isTeamOnlyScopeViolation already use.
//
// What this proves: (1) a non-triggered evaluation records nothing, (2) a triggered
// evaluation is recorded as a source_trust_events-shaped insert payload, and (3) —
// the load-bearing assertion for this wave's conservative call — `details.applied` is
// ALWAYS false, even for a source whose fired trigger carries severity:"immediate"
// (chronic_inaccessibility). This is PROPOSE-ONLY by construction: no test here should
// ever see `applied: true`, because the route never writes sources.base_tier or
// sources.effective_tier from this path (see demotionOutcomeFor's doc comment in route.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");
const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { "@": resolve(ROOT, "src") },
});
const { demotionOutcomeFor } = await jiti.import("./route.ts");

test("no fired trigger -> not proposed, nothing to record", () => {
  const evalResult = { triggered: false, triggers_fired: [], recommended_tier: 4 };
  const outcome = demotionOutcomeFor("src-1", evalResult);
  assert.deepEqual(outcome, { proposed: false });
});

test("a fired trigger IS proposed and recorded, keyed to the right source", () => {
  const evalResult = {
    triggered: true,
    recommended_tier: 5,
    triggers_fired: [
      {
        trigger: { trigger: "high_conflict_rate", severity: "flagged", tiers_affected: [2, 3, 4, 5, 6] },
        current_value: "40.0% conflict rate (4/10)",
      },
    ],
  };
  const outcome = demotionOutcomeFor("src-2", evalResult);
  assert.equal(outcome.proposed, true);
  assert.equal(outcome.event.source_id, "src-2");
  assert.equal(outcome.event.event_type, "tier_demotion");
  assert.equal(outcome.event.created_by, "worker");
  assert.equal(outcome.event.details.recommended_tier, 5);
  assert.equal(outcome.event.details.triggers_fired.length, 1);
  assert.equal(outcome.event.details.triggers_fired[0].trigger.trigger, "high_conflict_rate");
});

test("PROPOSE-ONLY holds even for a severity:'immediate' trigger (chronic_inaccessibility) — never auto-applied", () => {
  const evalResult = {
    triggered: true,
    recommended_tier: 4,
    triggers_fired: [
      {
        trigger: { trigger: "chronic_inaccessibility", severity: "immediate", tiers_affected: [3, 4, 5, 6] },
        current_value: "35.0% accessibility over 12 checks",
      },
    ],
  };
  const outcome = demotionOutcomeFor("src-3", evalResult);
  assert.equal(outcome.proposed, true);
  assert.equal(outcome.event.details.proposed, true);
  assert.equal(outcome.event.details.applied, false, "an immediate-severity trigger must still NOT auto-apply");
});

test("multiple fired triggers are all carried through to the recorded event, not just the first", () => {
  const evalResult = {
    triggered: true,
    recommended_tier: 6,
    triggers_fired: [
      { trigger: { trigger: "extended_inaccessibility", severity: "flagged" }, current_value: "45 days since last accessible" },
      { trigger: { trigger: "self_citation_only", severity: "flagged" }, current_value: "3 self-citations, 0 independent citers, 120 days old" },
    ],
  };
  const outcome = demotionOutcomeFor("src-4", evalResult);
  assert.equal(outcome.proposed, true);
  assert.equal(outcome.event.details.triggers_fired.length, 2);
  const names = outcome.event.details.triggers_fired.map((t) => t.trigger.trigger);
  assert.deepEqual(names, ["extended_inaccessibility", "self_citation_only"]);
});
