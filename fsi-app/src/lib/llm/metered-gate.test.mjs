// @ts-check
// Red-then-green for the STANDING FINANCIAL LAW metered-call gate. Grounding-shaped classes refuse the metered
// route; the only eligible class (batch-classification) passes ONLY with an allowlisted model + a recorded
// operator token + a positive hard cap; everything else default-denies.
import { test } from "node:test";
import assert from "node:assert/strict";
import { assertMeteredCallAllowed, isMeteredCallAllowed, MeteredCallForbiddenError, METERED_ELIGIBLE_CLASS } from "./metered-gate.mjs";

const HAIKU = "claude-haiku-4-5-20251001";
const TOKEN_ENV = { METERED_BATCH_TOKEN: "op-authorized-2026-08-01-census" };

test("RED: grounding-shaped class refuses the metered route (the incident's class)", () => {
  for (const cls of ["grounding", "reground", "ledger-extraction", "mint", "synthesis", "generate-stored"]) {
    assert.throws(() => assertMeteredCallAllowed({ callClass: cls, model: HAIKU, capUsd: 8, env: TOKEN_ENV }), MeteredCallForbiddenError, `${cls} must refuse`);
  }
});

test("RED: no callClass -> default-deny", () => {
  assert.throws(() => assertMeteredCallAllowed({ model: HAIKU, capUsd: 8, env: TOKEN_ENV }), MeteredCallForbiddenError);
});

test("RED: batch-classification WITHOUT an operator token is forbidden", () => {
  assert.throws(() => assertMeteredCallAllowed({ callClass: METERED_ELIGIBLE_CLASS, model: HAIKU, capUsd: 8, env: {} }), /no recorded operator token/);
});

test("RED: batch-classification WITHOUT a hard cap is forbidden", () => {
  assert.throws(() => assertMeteredCallAllowed({ callClass: METERED_ELIGIBLE_CLASS, model: HAIKU, env: TOKEN_ENV }), /no positive hard dollar cap/);
});

test("RED: batch-classification on an off-allowlist model (Sonnet) is forbidden", () => {
  assert.throws(() => assertMeteredCallAllowed({ callClass: METERED_ELIGIBLE_CLASS, model: "claude-sonnet-4-6", capUsd: 8, env: TOKEN_ENV }), /off the metered allowlist/);
});

test("GREEN: batch-classification + Haiku + token + cap is the ONE allowed metered path", () => {
  const r = assertMeteredCallAllowed({ callClass: METERED_ELIGIBLE_CLASS, model: HAIKU, capUsd: 8, env: TOKEN_ENV });
  assert.equal(r.allowed, true);
  assert.equal(isMeteredCallAllowed({ callClass: METERED_ELIGIBLE_CLASS, model: HAIKU, capUsd: 8, env: TOKEN_ENV }), true);
});

test("unknown class default-denies", () => {
  assert.throws(() => assertMeteredCallAllowed({ callClass: "some-new-thing", model: HAIKU, capUsd: 8, env: TOKEN_ENV }), MeteredCallForbiddenError);
});

// Scoped model amendment (operator ruling 2026-07-26): Sonnet permitted ONLY for the named task, within the named cap.
const SONNET = "claude-sonnet-4-6";
test("RED: Sonnet with NO task refuses — the wall default stays Haiku-only", () => {
  assert.throws(() => assertMeteredCallAllowed({ callClass: METERED_ELIGIBLE_CLASS, model: SONNET, capUsd: 20, env: TOKEN_ENV }), /scoped amendment/);
});
test("RED: Sonnet with a WRONG task refuses", () => {
  assert.throws(() => assertMeteredCallAllowed({ callClass: METERED_ELIGIBLE_CLASS, model: SONNET, capUsd: 20, env: TOKEN_ENV, task: "some-other-task" }), /scoped amendment/);
});
test("RED: Sonnet on the amended task but OVER the $25 amendment cap refuses", () => {
  assert.throws(() => assertMeteredCallAllowed({ callClass: METERED_ELIGIBLE_CLASS, model: SONNET, capUsd: 30, env: TOKEN_ENV, task: "index-relevance-second-pass" }), /exceeds the scoped-amendment hard cap/);
});
test("GREEN: Sonnet on the amended task, within cap, with token is the ONE allowed non-Haiku path", () => {
  const r = assertMeteredCallAllowed({ callClass: METERED_ELIGIBLE_CLASS, model: SONNET, capUsd: 20, env: TOKEN_ENV, task: "index-relevance-second-pass" });
  assert.equal(r.allowed, true);
  assert.equal(r.amendment, "index-relevance-second-pass");
});
test("RED: Sonnet on the amended task but WITHOUT a token still refuses (token gate unchanged)", () => {
  assert.throws(() => assertMeteredCallAllowed({ callClass: METERED_ELIGIBLE_CLASS, model: SONNET, capUsd: 20, env: {}, task: "index-relevance-second-pass" }), /no recorded operator token/);
});

// ── Scoped CLASS amendment: P2 proof batch depth-brief-generation (operator authorization 2026-07-29) ──
const P2_TASK = "P2 proof batch: depth-brief generation from catalogued instruments";
test("class-amendment: depth-brief-generation + Haiku + task + token + cap<=6 is ALLOWED", () => {
  const r = assertMeteredCallAllowed({ callClass: "depth-brief-generation", model: HAIKU, capUsd: 6, task: P2_TASK, env: TOKEN_ENV });
  assert.equal(r.allowed, true);
  assert.equal(r.amendment, P2_TASK);
});
test("class-amendment: cap ABOVE $6 refuses (hard cap)", () => {
  assert.throws(() => assertMeteredCallAllowed({ callClass: "depth-brief-generation", model: HAIKU, capUsd: 6.01, task: P2_TASK, env: TOKEN_ENV }), MeteredCallForbiddenError);
});
test("class-amendment: WRONG task refuses (scope-limited)", () => {
  assert.throws(() => assertMeteredCallAllowed({ callClass: "depth-brief-generation", model: HAIKU, capUsd: 6, task: "some-other-task", env: TOKEN_ENV }), MeteredCallForbiddenError);
});
test("class-amendment: non-Haiku model refuses (Haiku-only)", () => {
  assert.throws(() => assertMeteredCallAllowed({ callClass: "depth-brief-generation", model: "claude-sonnet-5", capUsd: 6, task: P2_TASK, env: TOKEN_ENV }), MeteredCallForbiddenError);
});
test("class-amendment: no token still refuses (RULE 2b unchanged)", () => {
  assert.throws(() => assertMeteredCallAllowed({ callClass: "depth-brief-generation", model: HAIKU, capUsd: 6, task: P2_TASK, env: {} }), MeteredCallForbiddenError);
});
test("class-amendment: an UNlisted class with no amendment still refuses (default-deny preserved)", () => {
  assert.throws(() => assertMeteredCallAllowed({ callClass: "depth-brief-generation", model: HAIKU, capUsd: 6, task: "", env: TOKEN_ENV }), MeteredCallForbiddenError);
  assert.throws(() => assertMeteredCallAllowed({ callClass: "made-up-class", model: HAIKU, capUsd: 6, task: P2_TASK, env: TOKEN_ENV }), MeteredCallForbiddenError);
});
