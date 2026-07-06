// @ts-check
// Red-then-green for the funded-pass deletion eligibility gate (item 1, binding 3b; premise supersession
// 2026-07-06). THE DELETION MOAT: a loser is deleted ONLY on identifier-exact instrument identity with a
// verified+primary-grounded survivor and NO live hold. Three-bucket rule enforced (topical=never,
// ambiguous=surface, identifier-exact=eligible). RED = d5ee6ab8 verbatim; GREEN = the CSRD CELEX pair.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isDeletableLoser, instrumentIdentityBucket, buildReleaseDeletionPlan, validateReleaseDeletionPlan, normUrl } from "./funded-release-plan.mjs";

// GREEN fixture: the CSRD pair post-survivor-release (identical CELEX:32022L2464).
const SURVIVOR = { id: "f0833999-aaaa", provenance_status: "verified", is_archived: false, source_url: "https://eur-lex.europa.eu/legal-content/EN/TXT?uri=CELEX:32022L2464", instrument_identifier: "2022/2464" };
const CSRD_LOSER = { id: "9c5d1d17-bbbb", legacy_id: "csrd-transport-provisions", provenance_status: "quarantined", is_archived: false, source_url: "https://eur-lex.europa.eu/legal-content/EN/TXT?uri=CELEX:32022L2464", instrument_identifier: "2022/2464" };
// RED fixture: d5ee6ab8 verbatim — Fit-for-55 package association, NON-identical instrument, carries a counsel hold.
const D5_LOSER = { id: "d5ee6ab8-cccc", provenance_status: "quarantined", is_archived: false, source_url: "https://commission.europa.eu/topics/climate-action/delivering-european-green-deal/fit-55-delivering-proposals_en", instrument_identifier: null };

// ── THE MOAT, first ──
test("RED (d5ee6ab8 verbatim): topical package association + counsel hold → REFUSE with named reason", () => {
  const v = isDeletableLoser({ survivor: SURVIVOR, loser: D5_LOSER, survivorHasPrimaryGrounding: true, loserHasHold: true });
  assert.equal(v.ok, false);
  assert.equal(v.bucket, "topical");
  assert.match(v.reason, /TOPICAL|package or title similarity is NEVER sufficient/);
});

test("three-bucket classifier: identical CELEX = identifier-exact; conflicting = ambiguous; unrelated = topical", () => {
  assert.equal(instrumentIdentityBucket(SURVIVOR, CSRD_LOSER), "identifier-exact");
  assert.equal(instrumentIdentityBucket(SURVIVOR, { ...CSRD_LOSER, instrument_identifier: "2099/9999" }), "ambiguous"); // same url, different instrument
  assert.equal(instrumentIdentityBucket(SURVIVOR, D5_LOSER), "topical");
});

test("AMBIGUOUS (conflicting declared instrument) is surfaced, never deleted", () => {
  const conflicting = { ...CSRD_LOSER, instrument_identifier: "2099/9999" };
  const v = isDeletableLoser({ survivor: SURVIVOR, loser: conflicting, survivorHasPrimaryGrounding: true, loserHasHold: false });
  assert.equal(v.ok, false);
  assert.equal(v.bucket, "ambiguous");
  assert.match(v.reason, /surface to integrity_flags/);
});

test("REFUSE: identifier-exact but survivor lacks primary grounding, or survivor not verified", () => {
  assert.equal(isDeletableLoser({ survivor: SURVIVOR, loser: CSRD_LOSER, survivorHasPrimaryGrounding: false, loserHasHold: false }).ok, false);
  assert.equal(isDeletableLoser({ survivor: { ...SURVIVOR, provenance_status: "quarantined" }, loser: CSRD_LOSER, survivorHasPrimaryGrounding: true, loserHasHold: false }).ok, false);
});

test("REFUSE: identifier-exact but the loser carries a live counsel/seek-more hold (held = ineligible)", () => {
  const v = isDeletableLoser({ survivor: SURVIVOR, loser: CSRD_LOSER, survivorHasPrimaryGrounding: true, loserHasHold: true });
  assert.equal(v.ok, false);
  assert.match(v.reason, /live counsel\/seek-more hold/);
});

test("REFUSE: a verified loser, an archived loser, and self-deletion", () => {
  assert.equal(isDeletableLoser({ survivor: SURVIVOR, loser: { ...CSRD_LOSER, provenance_status: "verified" }, survivorHasPrimaryGrounding: true, loserHasHold: false }).ok, false);
  assert.equal(isDeletableLoser({ survivor: SURVIVOR, loser: { ...CSRD_LOSER, is_archived: true }, survivorHasPrimaryGrounding: true, loserHasHold: false }).ok, false);
  assert.equal(isDeletableLoser({ survivor: SURVIVOR, loser: SURVIVOR, survivorHasPrimaryGrounding: true, loserHasHold: false }).ok, false);
});

// ── GREEN: the CSRD pair post-survivor-release IS a deletable loser ──
test("GREEN (CSRD pair): identifier-exact + verified/grounded survivor + no hold → ELIGIBLE", () => {
  const v = isDeletableLoser({ survivor: SURVIVOR, loser: CSRD_LOSER, survivorHasPrimaryGrounding: true, loserHasHold: false });
  assert.equal(v.ok, true);
  assert.equal(v.bucket, "identifier-exact");
});

test("identifier-exact via canonical URL only (instrument absent both sides) still eligible", () => {
  const v = isDeletableLoser({ survivor: { ...SURVIVOR, instrument_identifier: null }, loser: { ...CSRD_LOSER, instrument_identifier: null }, survivorHasPrimaryGrounding: true, loserHasHold: false });
  assert.equal(v.ok, true);
});

test("normUrl collapses scheme/host/trailing punctuation", () => {
  assert.equal(normUrl("https://www.EUR-Lex.europa.eu/x/"), normUrl("http://eur-lex.europa.eu/x"));
});

// ── plan assembly: releases always; identifier-exact → proposals; conflicting → ambiguous; topical → skipped ──
test("buildReleaseDeletionPlan routes each candidate to the right bucket; releases for all flipped", () => {
  const plan = buildReleaseDeletionPlan([
    { itemId: SURVIVOR.id, itemKey: "f0833999", survivor: SURVIVOR, survivorHasPrimaryGrounding: true, deferredFlagIds: ["flag-1"],
      loserCandidates: [
        { row: CSRD_LOSER, loserHasHold: false },                                  // → proposal
        { row: { ...CSRD_LOSER, id: "amb", instrument_identifier: "2099/9999" }, loserHasHold: false }, // → ambiguous
      ] },
    { itemId: "782878c0-dddd", itemKey: "782878c0", survivor: null, deferredFlagIds: ["flag-2", "flag-3"] },
  ]);
  assert.equal(plan.releases.length, 3);
  assert.equal(plan.deletionProposals.length, 1);
  assert.equal(plan.deletionProposals[0].loserId, CSRD_LOSER.id);
  assert.equal(plan.ambiguous.length, 1);
});

test("validateReleaseDeletionPlan: rejects malformed + a loser===survivor deletion", () => {
  assert.equal(validateReleaseDeletionPlan({ releases: [], deletionProposals: [] }).ok, true);
  assert.equal(validateReleaseDeletionPlan({ releases: [{ flagId: "x" }], deletionProposals: [] }).ok, false);
  const bad = validateReleaseDeletionPlan({ releases: [], deletionProposals: [{ loserId: "same", survivorId: "same" }] });
  assert.equal(bad.ok, false);
  assert.match(bad.violations.join(";"), /would delete the survivor/);
  assert.equal(validateReleaseDeletionPlan(null).ok, false);
});
