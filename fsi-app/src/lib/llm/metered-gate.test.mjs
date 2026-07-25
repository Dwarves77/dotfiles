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
