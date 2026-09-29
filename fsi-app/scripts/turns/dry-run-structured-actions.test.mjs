// dry-run-structured-actions.test.mjs, fixture tests for the pure extraction-pass core (lane
// STRUCTURED-ACTIONS, 2026-09-28). Only runExtractionPass is tested here (pure, no I/O); the live-DB
// orchestration (runDryRun) is exercised by the lane's own read-only dry run against real stored
// briefs, recorded in the harness-run artifact and cited in the session-log entry, not re-mocked here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runExtractionPass } from "./dry-run-structured-actions.mjs";

const REG_BRIEF_WITH_ACTION = `# 3. Issues Requiring Immediate Action

Verify whether the workspace's current process satisfies the new tracking requirement (30 days).

# 15. Sources

Source list.
`;

const MARKET_BRIEF_WITH_ACTION = `# 7. What the Workspace Should Do Now

Engage the coalition on membership terms.

# 8. Sources

Source list.
`;

const BRIEF_NO_ACTION = `# 1. Purpose and Scope of This Document

Nothing actionable here.

# 15. Sources

Source list.
`;

test("runExtractionPass: aggregates counts across a mixed item population", () => {
  const items = [
    { id: "a1", item_type: "regulation", full_brief: REG_BRIEF_WITH_ACTION },
    { id: "a2", item_type: "market_signal", full_brief: MARKET_BRIEF_WITH_ACTION },
    { id: "a3", item_type: "regulation", full_brief: BRIEF_NO_ACTION },
    { id: "a4", item_type: "research_finding", full_brief: REG_BRIEF_WITH_ACTION.replace("# 3. Issues Requiring Immediate Action", "# 3. What the Finding Changes for Strategy, Claims, or Decisions") },
    { id: "a5", item_type: "regulation", full_brief: null },
  ];

  const { perItem, metrics, sampleActions } = runExtractionPass({ items });

  assert.equal(metrics.items_scanned, 5);
  assert.equal(metrics.items_with_brief, 4);
  assert.equal(metrics.items_with_actions, 2);
  assert.equal(metrics.total_actions, 2);
  assert.deepEqual(metrics.actions_by_item_type, { regulation: 1, market_signal: 1 });
  assert.deepEqual(metrics.actions_by_verb, { Verify: 1, Engage: 1 });
  assert.equal(metrics.actions_with_timeframe_days, 1);
  assert.equal(metrics.actions_with_owner, 0);
  assert.equal(metrics.actions_with_due_date, 0);

  assert.equal(perItem.length, 5);
  assert.equal(perItem.find((p) => p.id === "a1").outcome, "actions_extracted");
  assert.equal(perItem.find((p) => p.id === "a3").outcome, "no_actions");
  assert.equal(perItem.find((p) => p.id === "a4").outcome, "no_actions"); // research_finding: no do-now section defined
  assert.equal(perItem.find((p) => p.id === "a5").outcome, "no_actions"); // null full_brief

  assert.equal(sampleActions.length, 2);
  assert.ok(sampleActions.every((a) => "item_id" in a && "item_type" in a && "action_text" in a));
});

test("runExtractionPass: an all-empty population reports zero without throwing", () => {
  const { metrics, sampleActions } = runExtractionPass({ items: [] });
  assert.equal(metrics.items_scanned, 0);
  assert.equal(metrics.total_actions, 0);
  assert.deepEqual(sampleActions, []);
});
