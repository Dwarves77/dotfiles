// extract-recommended-actions.test.mjs, fixture tests for the structured-action extraction (lane
// STRUCTURED-ACTIONS, 2026-09-28). Fixtures below are SYNTHETIC paraphrases shaped like the live-corpus
// patterns this lane observed via read-only SQL (project kwrsbpiseruzbfwjpvsp, 2026-09-28), never a
// verbatim copy of stored brief text or of any regulation's own text, per the copyright/no-fabrication
// posture: the shapes are real, the specific fixture wording is invented to exercise them.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractRecommendedActions,
  extractActionFromParagraph,
  DO_NOW_SECTIONS_BY_ITEM_TYPE,
  CONCRETE_ACTION_VERBS,
} from "./extract-recommended-actions.mjs";

// A regulatory_fact_document fixture shaped like the live "Issues Requiring Immediate Action" /
// "Operational System Requirements" sections this lane sampled: a mix of FACT lines, labeled analysis
// paragraphs, one real verb-first action with a timeframe, one verb-first action with no timeframe, and
// one "Commission <Act name>" false-positive line that must NOT be extracted.
const REG_BRIEF = `# 1. Purpose and Scope of This Document

Some scope text.

# 2. What This Regulation Is and Why It Applies to the Workspace

Plain-language summary.

# 3. Issues Requiring Immediate Action

*Operational implication:* review counterparties for exposure under Article 1(2)(c).

FACT: "Some quoted regulatory text." *Source: Example Register, Example Body, 2026-01-01. https://example.test/reg.

Verify whether the workspace's current data-collection process for corridor X satisfies the tracking granularity Article 9 requires (30 days).

Engage the assigned carrier group on whether voyage-level activity data is available for Scope 3 reporting. *Operational implication:* without a confirmed data-sharing arrangement the workspace cannot complete downstream reporting.

# 4. How the Workspace Sits in the Compliance Chain

Chain text.

# 11. Operational System Requirements

Commission Implementing Regulation (EU) 2099/9999 of 1 January 2026 establishes a shared registry interconnection mechanism referenced elsewhere in this document.

Assess the gap between the workspace's current record-keeping baseline and the regulation's five-year retention requirement.

# 14. Confirmed Regulatory Timeline

Timeline text.

# 15. Sources

Source list.
`;

// A technology_profile fixture (section 7).
const TECH_BRIEF = `# 7. Time-to-Market, Procurement Window, and Action

Some lead-in prose about market timing.

Negotiate pilot-programme access with at least one named supplier ahead of the next contract cycle.

# 8. Sources

Source list.
`;

// A market_signal_brief fixture (section 7), including an owner/date the prompt does not normally emit
// but that the extractor should still pick up if a future revision adds them.
const MARKET_BRIEF = `# 7. What the Workspace Should Do Now

Reconcile the workspace's current vendor list against the coalition's published member roster (Owner: Sustainability) by 15 March 2026.

# 8. Sources

Source list.
`;

// A research_summary fixture, this format names NO dedicated "do now" section, so even a verb-first
// line inside one of its sections must NOT be extracted (the section isn't in the allowed list at all).
const RESEARCH_BRIEF = `# 3. What the Finding Changes for Strategy, Claims, or Decisions

Verify that this framing note is not mistaken for a do-now action, since this section is not a
recognised action section for research_finding.

# 6. Sources

Source list.
`;

test("extractRecommendedActions: regulatory brief extracts real actions, skips the Commission-citation false positive", () => {
  const actions = extractRecommendedActions(REG_BRIEF, "regulation");
  const verbs = actions.map((a) => a.verb);
  assert.deepEqual(verbs, ["Verify", "Engage", "Assess"]);

  const verify = actions[0];
  assert.equal(verify.timeframe_days, 30);
  assert.equal(verify.owner, null);
  assert.equal(verify.due_date, null);
  assert.equal(verify.source_section, "Issues Requiring Immediate Action");
  assert.ok(!/Operational implication/.test(verify.action_text), "action text stops before the label marker");

  const engage = actions[1];
  assert.equal(engage.timeframe_days, null);
  assert.ok(!/Operational implication/.test(engage.action_text));

  const assess = actions[2];
  assert.equal(assess.source_section, "Operational System Requirements");

  // The false-positive guard: the "Commission Implementing Regulation..." citation line must not appear.
  assert.ok(!actions.some((a) => a.verb === "Commission"), "legislative citation must not be extracted as an action");
});

test("extractRecommendedActions: technology_profile scopes to section 7 only", () => {
  const actions = extractRecommendedActions(TECH_BRIEF, "technology");
  assert.equal(actions.length, 1);
  assert.equal(actions[0].verb, "Negotiate");
  assert.equal(actions[0].source_section, "Time-to-Market, Procurement Window, and Action");
});

test("extractRecommendedActions: market_signal_brief picks up an explicit owner and due date when present", () => {
  const actions = extractRecommendedActions(MARKET_BRIEF, "market_signal");
  assert.equal(actions.length, 1);
  const a = actions[0];
  assert.equal(a.verb, "Reconcile");
  assert.equal(a.owner, "Sustainability");
  assert.equal(a.due_date, "2026-03-15");
});

test("extractRecommendedActions: research_finding has no designated do-now section, so it always returns empty", () => {
  const actions = extractRecommendedActions(RESEARCH_BRIEF, "research_finding");
  assert.deepEqual(actions, []);
});

test("extractRecommendedActions: regional_data has no designated do-now section either", () => {
  const actions = extractRecommendedActions(REG_BRIEF, "regional_data");
  assert.deepEqual(actions, []);
});

test("extractRecommendedActions: null/empty full_brief returns empty, never throws", () => {
  assert.deepEqual(extractRecommendedActions(null, "regulation"), []);
  assert.deepEqual(extractRecommendedActions(undefined, "regulation"), []);
  assert.deepEqual(extractRecommendedActions("", "regulation"), []);
});

test("extractRecommendedActions: unknown item_type returns empty rather than throwing", () => {
  assert.deepEqual(extractRecommendedActions(REG_BRIEF, "not_a_real_item_type"), []);
});

test("extractActionFromParagraph: a bare verb with nothing else is rejected (malformed-prose guard)", () => {
  assert.equal(extractActionFromParagraph("Verify.", "Issues Requiring Immediate Action"), null);
});

test("extractActionFromParagraph: a paragraph not starting with a concrete verb is not an action", () => {
  assert.equal(
    extractActionFromParagraph("The regulation sets a compliance deadline of 2027.", "Issues Requiring Immediate Action"),
    null,
  );
});

test("extractActionFromParagraph: 'Commission' as the institution-subject is not extracted as an action (live false-positive, item 8c186db2, 2026-09-28)", () => {
  assert.equal(
    extractActionFromParagraph(
      "Commission is scheduled to submit a review of the regulation's effectiveness and impact to the European Parliament and the Council.",
      "Issues Requiring Immediate Action",
    ),
    null,
  );
});

test("extractActionFromParagraph: 'Commission' as the imperative verb is still extracted (real live examples, 2026-09-28)", () => {
  const a = extractActionFromParagraph(
    "Commission a review of the workspace's current ocean emissions calculation methodology against the data fields available from carriers' IMO DCS submissions.",
    "Issues Requiring Immediate Action",
  );
  assert.ok(a);
  assert.equal(a.verb, "Commission");
});

test("extractActionFromParagraph: a leading bullet/number marker is stripped before the verb check", () => {
  const a = extractActionFromParagraph("- Assess the workspace's current baseline against the new threshold.", "S3");
  assert.ok(a);
  assert.equal(a.verb, "Assess");
});

test("DO_NOW_SECTIONS_BY_ITEM_TYPE and CONCRETE_ACTION_VERBS are the frozen, cited vocabularies", () => {
  assert.deepEqual(CONCRETE_ACTION_VERBS, ["Assess", "Map", "Verify", "Commission", "Engage", "Negotiate", "Reconcile"]);
  assert.deepEqual(DO_NOW_SECTIONS_BY_ITEM_TYPE.regional_data, []);
  assert.deepEqual(DO_NOW_SECTIONS_BY_ITEM_TYPE.research_finding, []);
  assert.ok(Object.isFrozen(DO_NOW_SECTIONS_BY_ITEM_TYPE));
  assert.ok(Object.isFrozen(CONCRETE_ACTION_VERBS));
});
