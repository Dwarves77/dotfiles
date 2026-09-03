import { test } from "node:test";
import assert from "node:assert/strict";
import { corroborationCount } from "./corroboration.mjs";

test("corroborationCount: empty thread", () => {
  assert.deepEqual(corroborationCount({ posts: [] }), {
    organisations: 0, posts: 0, consistent: false, byOrganisation: {}, dominantShare: 0,
  });
  assert.deepEqual(corroborationCount({}).organisations, 0);
});

test("corroborationCount: counts DISTINCT organisations, not posts — five posts from one org is one voice", () => {
  const thread = {
    posts: [
      { organisationKey: "org-a", stance: "agree" },
      { organisationKey: "org-a", stance: "agree" },
      { organisationKey: "org-a", stance: "agree" },
      { organisationKey: "org-a", stance: "agree" },
      { organisationKey: "org-a", stance: "agree" },
    ],
  };
  const r = corroborationCount(thread);
  assert.equal(r.organisations, 1);
  assert.equal(r.posts, 5);
  assert.equal(r.consistent, false); // < 3 distinct orgs, and 100% dominance
});

test("corroborationCount: 4 distinct orgs, evenly split (25% each), no disagreement — consistent (meets gate 2)", () => {
  // With only 3 total respondents, one organisation is mathematically always >= 1/3 (33%), which is
  // "above 25%" — the gate-2 threshold ("no organisation above 25% of respondents") is only satisfiable
  // once there are enough total respondents to spread below the cap, e.g. 4 orgs at one post each (25%).
  const thread = {
    posts: [
      { organisationKey: "org-a", stance: "agree" },
      { organisationKey: "org-b", stance: "agree" },
      { organisationKey: "org-c", stance: "agree" },
      { organisationKey: "org-d", stance: "agree" },
    ],
  };
  const r = corroborationCount(thread);
  assert.equal(r.organisations, 4);
  assert.equal(r.dominantShare, 0.25);
  assert.equal(r.consistent, true);
});

test("corroborationCount: a dominant org above 25% is not consistent even with 3+ orgs", () => {
  const thread = {
    posts: [
      { organisationKey: "big", stance: "agree" },
      { organisationKey: "big", stance: "agree" },
      { organisationKey: "big", stance: "agree" },
      { organisationKey: "small1", stance: "agree" },
      { organisationKey: "small2", stance: "agree" },
    ],
  };
  const r = corroborationCount(thread);
  assert.equal(r.organisations, 3);
  assert.ok(r.dominantShare > 0.25);
  assert.equal(r.consistent, false);
});

test("corroborationCount: any explicit disagreement in the thread breaks consistency, even with enough orgs", () => {
  const thread = {
    posts: [
      { organisationKey: "org-a", stance: "agree" },
      { organisationKey: "org-b", stance: "agree" },
      { organisationKey: "org-c", stance: "agree" },
      { organisationKey: "org-d", stance: "disagree" },
    ],
  };
  const r = corroborationCount(thread);
  assert.equal(r.organisations, 3); // disagreeing post's org is excluded from the corroborating count
  assert.equal(r.consistent, false);
});

test("corroborationCount: neutral replies count toward corroboration (only 'disagree' is excluded)", () => {
  const thread = {
    posts: [
      { organisationKey: "org-a", stance: "neutral" },
      { organisationKey: "org-b", stance: "agree" },
      { organisationKey: "org-c", stance: null },
    ],
  };
  const r = corroborationCount(thread);
  assert.equal(r.organisations, 3);
});

test("corroborationCount: posts without an organisationKey are ignored, not counted as an anonymous org", () => {
  const thread = {
    posts: [
      { organisationKey: "org-a", stance: "agree" },
      { organisationKey: null, stance: "agree" },
      { stance: "agree" },
    ],
  };
  const r = corroborationCount(thread);
  assert.equal(r.organisations, 1);
  assert.equal(r.posts, 1);
});
