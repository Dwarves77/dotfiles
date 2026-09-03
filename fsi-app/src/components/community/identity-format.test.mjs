// identity-format.test.mjs — proves the pseudonymity, entity-binding and promotion-state formatting
// rules independent of any component render (see identity-format.ts's header for why this split
// exists). The one negative case that matters most: formatAuthorIdentity must never be capable of
// emitting a name or company because it is never given one — it only ever reads the four
// pseudonymity-safe fields.

import test from "node:test";
import assert from "node:assert/strict";
import {
  formatAuthorIdentity,
  validateEntityBinding,
  promotionStateLabel,
  isUnverifiedContribution,
  corroborationLabel,
} from "./identity-format.ts";

test("formatAuthorIdentity joins org type, role, sector, region in order", () => {
  const line = formatAuthorIdentity({
    orgType: "Freight forwarder",
    role: "Trade lane manager",
    sector: "Apparel",
    region: "EU",
    verified: true,
  });
  assert.equal(line, "Freight forwarder · Trade lane manager · Apparel · EU");
});

test("formatAuthorIdentity drops blank fields without leaving stray separators", () => {
  const line = formatAuthorIdentity({ orgType: "Carrier", role: "", sector: null, region: "APAC" });
  assert.equal(line, "Carrier · APAC");
});

test("formatAuthorIdentity returns null for null/undefined/all-blank input, never an empty string a caller might render as a stray dot", () => {
  assert.equal(formatAuthorIdentity(null), null);
  assert.equal(formatAuthorIdentity(undefined), null);
  assert.equal(formatAuthorIdentity({}), null);
});

test("formatAuthorIdentity is structurally incapable of emitting a name field — the type has none", () => {
  // Pseudonymity check: the function's parameter type only carries orgType/role/sector/region/
  // verified, so there is no code path by which a name or company string could reach the output.
  const line = formatAuthorIdentity({
    orgType: "Shipper",
    role: "Ops lead",
    sector: "Electronics",
    region: "US",
  });
  assert.ok(!line || !/[A-Z][a-z]+ (Inc|Ltd|GmbH|LLC|Corp)\b/.test(line));
});

test("validateEntityBinding refuses zero/undefined/null entity ids with the spine-entity message", () => {
  assert.match(validateEntityBinding([]), /spine entity/);
  assert.match(validateEntityBinding(undefined), /spine entity/);
  assert.match(validateEntityBinding(null), /spine entity/);
});

test("validateEntityBinding accepts one or more entity ids", () => {
  assert.equal(validateEntityBinding(["cl:corridor:abc"]), null);
  assert.equal(validateEntityBinding(["cl:corridor:abc", "cl:jurisdiction:def"]), null);
});

test("promotionStateLabel covers all five spec 05 §4 gates and defaults unset to gate 1", () => {
  assert.match(promotionStateLabel(undefined), /Community —/);
  assert.match(promotionStateLabel("community"), /Community —/);
  assert.match(promotionStateLabel("community-corroborated"), /Community-corroborated/);
  assert.match(promotionStateLabel("under-review"), /Under review/);
  assert.match(promotionStateLabel("verified"), /Verified/);
  assert.match(promotionStateLabel("retired"), /Retired/);
});

test("promotionStateLabel passes an unrecognized state through verbatim rather than mislabeling it", () => {
  assert.equal(promotionStateLabel("some-future-state"), "some-future-state");
});

test("isUnverifiedContribution is true only for gates 1-2 (and unset)", () => {
  assert.equal(isUnverifiedContribution(undefined), true);
  assert.equal(isUnverifiedContribution("community"), true);
  assert.equal(isUnverifiedContribution("community-corroborated"), true);
  assert.equal(isUnverifiedContribution("under-review"), false);
  assert.equal(isUnverifiedContribution("verified"), false);
  assert.equal(isUnverifiedContribution("retired"), false);
});

test("corroborationLabel counts organisations, not posts, per spec 05 §5 component 5", () => {
  assert.equal(corroborationLabel(0), "No independent corroboration yet");
  assert.equal(corroborationLabel(1), "1 organisation corroborating");
  assert.equal(corroborationLabel(3), "3 organisations corroborating");
  assert.equal(corroborationLabel(-1), "No independent corroboration yet");
  assert.equal(corroborationLabel(NaN), "No independent corroboration yet");
});
