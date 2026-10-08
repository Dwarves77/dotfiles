// Proof for coverage-state.mjs (lane COV-1, 2026-10-08): the six treatments of spec 00 section 4, one per state.
// Run: node --test fsi-app/src/lib/coverage/coverage-state.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { describeCoverageState, isCoverageState, COVERAGE_ACTION } from "./coverage-state.mjs";
import { COVERAGE_STATES, COVERAGE_STATE } from "../contracts/vocabularies.mjs";

const d = (o) => describeCoverageState({ subject: "OEM equipment roadmap", ...o });
const text = (r) => [r.headline, ...r.lines, ...r.actions.map((a) => a.label)].join(" | ");

test("all six states describe, and each carries the label and treatment the vocabulary names", () => {
  for (const s of COVERAGE_STATES) {
    const r = d({ state: s, requestRef: "/market", canWiden: true, canRetry: true, statusHref: "/status" });
    assert.ok(r, s);
    assert.equal(r.code, s);
    assert.equal(r.label, COVERAGE_STATE[s].label);
    assert.equal(r.treatment, COVERAGE_STATE[s].treatment);
  }
});

test("an unknown or missing state describes as null so the caller keeps its existing render", () => {
  assert.equal(describeCoverageState({ state: "pending", subject: "x" }), null);
  assert.equal(describeCoverageState({ state: undefined, subject: "x" }), null);
  assert.equal(describeCoverageState(null), null);
  assert.equal(isCoverageState("not_covered"), true);
  assert.equal(isCoverageState("M"), false);
});

test("not applicable: suppressed, explained, no actions, and it is not worded as an empty state", () => {
  const r = d({ state: "not_applicable", reason: "A SECA surcharge does not apply to a rail leg." });
  assert.equal(r.suppress, true);
  assert.equal(r.headline, "A SECA surcharge does not apply to a rail leg.");
  assert.deepEqual(r.actions, []);
  assert.equal(r.role, "status");
  assert.equal(d({ state: "not_applicable" }).headline, "OEM equipment roadmap does not apply here.");
});

test("not covered: a named gap with its roadmap position and a request-coverage action", () => {
  const r = d({ state: "not_covered", reason: "No rows yet.", roadmap: "Phase 3", requestRef: "/market#oem-roadmap" });
  assert.equal(r.headline, "OEM equipment roadmap is not covered yet.");
  assert.deepEqual(r.lines, ["No rows yet.", "Roadmap position: Phase 3."]);
  assert.deepEqual(r.actions, [{ kind: COVERAGE_ACTION.request, label: "Request coverage" }]);
  // No roadmap position is invented when none is recorded.
  assert.match(d({ state: "not_covered", requestRef: "/x" }).lines.join(" "), /No roadmap position is recorded/);
  // No request action without a request target: an action that cannot post is not offered.
  assert.deepEqual(d({ state: "not_covered" }).actions, []);
});

test("no data yet: expected refresh, and the last known value with its as-of", () => {
  const r = d({ state: "no_data_yet", expectedRefresh: "2026-11-01", lastValue: "EUR 71.2", asOf: "2026-09-30" });
  assert.deepEqual(r.lines, ["Expected refresh: 2026-11-01.", "Last known value: EUR 71.2 (as of 2026-09-30)."]);
  assert.match(text(d({ state: "no_data_yet", lastValue: "5" })), /as-of date not recorded/);
  assert.match(text(d({ state: "no_data_yet" })), /No refresh date is recorded.*No earlier value is on file/);
  // A reason the call site knows leads the lines, and is never required.
  const withReason = d({ state: "no_data_yet", reason: "The register fills in as events are matched." });
  assert.deepEqual(withReason.lines.slice(0, 1), ["The register fills in as events are matched."]);
  assert.equal(withReason.lines.length, 3);
});

test("suppressed: states the reason class and never reads as absence", () => {
  const r = d({ state: "suppressed", reasonClass: "k_anonymity" });
  assert.deepEqual(r.lines, ["Reason: Too few contributors to publish."]);
  assert.match(r.headline, /exists and is withheld/);
  assert.doesNotMatch(text(r), /not covered|no data|missing|not available/i);
  assert.deepEqual(d({ state: "suppressed" }).lines, ["Reason class not recorded."]);
});

test("not filtered in: says how many are hidden when it knows, and offers a one-click widen", () => {
  const r = d({ state: "not_filtered_in", hiddenCount: 7, noun: "obligation", canWiden: true });
  assert.equal(r.headline, "7 obligations hidden by your scope.");
  assert.deepEqual(r.actions, [{ kind: COVERAGE_ACTION.widen, label: "Widen scope" }]);
  assert.equal(d({ state: "not_filtered_in", hiddenCount: 1, noun: "obligation" }).headline, "1 obligation hidden by your scope.");
  // A count nobody has is not stated.
  const unknown = d({ state: "not_filtered_in", canWiden: true });
  assert.equal(unknown.headline, "OEM equipment roadmap exists outside your current scope.");
  assert.doesNotMatch(unknown.headline, /\d/);
  assert.deepEqual(d({ state: "not_filtered_in", hiddenCount: 3 }).actions, []);
});

test("error: distinct role, a retry and a status link, and it says it is a fault not an absence", () => {
  const r = d({ state: "error", canRetry: true, statusHref: "/status" });
  assert.equal(r.role, "alert");
  assert.equal(r.headline, "OEM equipment roadmap could not be loaded.");
  assert.deepEqual(r.actions.map((a) => a.kind), [COVERAGE_ACTION.retry, COVERAGE_ACTION.status]);
  assert.match(r.lines[0], /system fault, not an absence of data/);
  assert.deepEqual(d({ state: "error" }).actions, []);
});

test("the six treatments are pairwise different in headline shape and in which actions they can carry", () => {
  const all = Object.fromEntries(
    COVERAGE_STATES.map((s) => [s, d({ state: s, requestRef: "/x", canWiden: true, canRetry: true, statusHref: "/s", hiddenCount: 2 })])
  );
  const sigs = COVERAGE_STATES.map((s) => `${all[s].role}:${all[s].suppress}:${all[s].actions.map((a) => a.kind).join(",")}:${all[s].headline.replace(/OEM equipment roadmap/g, "X")}`);
  assert.equal(new Set(sigs).size, 6);
});

test("no state's copy contains a dash glyph or a banned absence word (rule 022; absence vocabulary)", () => {
  for (const s of COVERAGE_STATES) {
    const r = d({ state: s, requestRef: "/x", canWiden: true, canRetry: true, statusHref: "/s", hiddenCount: 2, reasonClass: "licence" });
    const t = text(r);
    assert.doesNotMatch(t, /[\u2013\u2014\u00a7]/, `${s} carries a dash or section glyph`);
    assert.doesNotMatch(t, /\b(pending|unscored|not scored)\b/i, `${s} uses a banned absence word`);
  }
});
