// spec09-org-rls-adversarial-audit.test.mjs — pure-function proof, population-report.test.mjs's own
// pattern (fakeClient-injected DB calls, pure helpers tested directly). No pg import anywhere in this
// file or in the module under test above its CLI-invocation guard, so this runs in the no-npm
// run-test-suite.sh job exactly like population-report.test.mjs and verification-audit-report.test.mjs do.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pickTwoOrgsWithMembers,
  pickFixtureEntities,
  classifyOutcome,
  runAudit,
} from "./spec09-org-rls-adversarial-audit.mjs";

// ── pickTwoOrgsWithMembers ───────────────────────────────────────────────────────────────────────────

test("pickTwoOrgsWithMembers: two distinct orgs, one member each — picks both", () => {
  const got = pickTwoOrgsWithMembers([
    { org_id: "org-a", user_id: "user-a" },
    { org_id: "org-b", user_id: "user-b" },
  ]);
  assert.deepEqual(got, [
    { orgId: "org-a", userId: "user-a" },
    { orgId: "org-b", userId: "user-b" },
  ]);
});

test("pickTwoOrgsWithMembers: one org repeated across multiple members is still ONE org — self-skip", () => {
  const got = pickTwoOrgsWithMembers([
    { org_id: "org-a", user_id: "user-1" },
    { org_id: "org-a", user_id: "user-2" },
  ]);
  assert.equal(got, null);
});

test("pickTwoOrgsWithMembers: zero rows — self-skip, not a crash", () => {
  assert.equal(pickTwoOrgsWithMembers([]), null);
});

test("pickTwoOrgsWithMembers: three orgs — picks the first two encountered, ignores the rest", () => {
  const got = pickTwoOrgsWithMembers([
    { org_id: "org-a", user_id: "user-a" },
    { org_id: "org-b", user_id: "user-b" },
    { org_id: "org-c", user_id: "user-c" },
  ]);
  assert.deepEqual(got.map((o) => o.orgId), ["org-a", "org-b"]);
});

// ── pickFixtureEntities ──────────────────────────────────────────────────────────────────────────────

test("pickFixtureEntities: a corridor row and an organisation row — picks both", () => {
  const got = pickFixtureEntities([
    { entity_id: "cl:corridor:1", kind: "corridor" },
    { entity_id: "cl:organisation:1", kind: "organisation" },
  ]);
  assert.deepEqual(got, { corridorId: "cl:corridor:1", carrierId: "cl:organisation:1" });
});

test("pickFixtureEntities: missing the organisation kind — self-skip, not a fabricated id", () => {
  assert.equal(pickFixtureEntities([{ entity_id: "cl:corridor:1", kind: "corridor" }]), null);
});

test("pickFixtureEntities: missing the corridor kind — self-skip", () => {
  assert.equal(pickFixtureEntities([{ entity_id: "cl:organisation:1", kind: "organisation" }]), null);
});

test("pickFixtureEntities: empty spine — self-skip", () => {
  assert.equal(pickFixtureEntities([]), null);
});

// ── classifyOutcome — the binding assertion (red then green below) ─────────────────────────────────────

test("classifyOutcome: RED — org B can see org A's row is a cross-org RLS leak, not a pass", () => {
  const got = classifyOutcome({ selfVisible: 1, otherVisible: 1 });
  assert.equal(got.ok, false);
  assert.match(got.reason, /cross-org RLS leak/);
});

test("classifyOutcome: RED — org A cannot even see its own row means the policy is too strict, not a pass", () => {
  const got = classifyOutcome({ selfVisible: 0, otherVisible: 0 });
  assert.equal(got.ok, false);
  assert.match(got.reason, /too strict/);
});

test("classifyOutcome: GREEN — org A sees exactly its row, org B sees none", () => {
  const got = classifyOutcome({ selfVisible: 1, otherVisible: 0 });
  assert.equal(got.ok, true);
});

// ── runAudit — injected fake client, no real database. Mirrors prov-guard-adversarial-audit.mjs's own
// probe() shape (BEGIN/ROLLBACK bracketing, SQLSTATE-style dispatch) but exercised here with a fake. ────

/** A minimal fake pg.Client: dispatches by matching a substring in the SQL text, in the order runAudit
 *  actually issues them. `visibility` supplies the count each impersonation call should report, keyed by
 *  the JSON-encoded jwt claims payload the SAME way runAudit builds it. */
function fakeClient({ orgRows, entityRows, visibility }) {
  let lastClaims = null;
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      calls.push(sql.trim().slice(0, 40));
      if (/^BEGIN$/.test(sql)) return {};
      if (/^ROLLBACK$/.test(sql)) return {};
      if (/^RESET ROLE$/.test(sql)) return {};
      if (/^SET LOCAL ROLE authenticated$/.test(sql)) return {};
      if (/FROM public\.org_memberships/.test(sql)) return { rows: orgRows };
      if (/FROM public\.entities/.test(sql)) return { rows: entityRows };
      if (/INSERT INTO public\.surcharge_audits/.test(sql)) return { rows: [{ audit_id: "audit-fixture-1" }] };
      if (/set_config\('request\.jwt\.claims'/.test(sql)) {
        lastClaims = JSON.parse(params[0]);
        return {};
      }
      if (/SELECT count\(\*\)::int AS n FROM public\.surcharge_audits/.test(sql)) {
        return { rows: [{ n: visibility(lastClaims.sub) }] };
      }
      throw new Error(`fakeClient: unexpected query: ${sql}`);
    },
  };
}

test("runAudit: self-skip when fewer than two orgs have a member — writes/impersonates nothing", async () => {
  const client = fakeClient({ orgRows: [{ org_id: "org-a", user_id: "user-a" }], entityRows: [], visibility: () => 0 });
  const result = await runAudit(client);
  assert.equal(result.skip, true);
  assert.match(result.reason, /fewer than two live organizations/);
  // BEGIN, the org_memberships read, then ROLLBACK — no INSERT, no impersonation attempted.
  assert.deepEqual(client.calls, ["BEGIN", "SELECT org_id, user_id FROM public.org_m", "ROLLBACK"]);
});

test("runAudit: self-skip when live entities lacks a corridor/organisation pair", async () => {
  const client = fakeClient({
    orgRows: [
      { org_id: "org-a", user_id: "user-a" },
      { org_id: "org-b", user_id: "user-b" },
    ],
    entityRows: [{ entity_id: "cl:corridor:1", kind: "corridor" }],
    visibility: () => 0,
  });
  const result = await runAudit(client);
  assert.equal(result.skip, true);
  assert.match(result.reason, /organisation.*kind/);
});

test("runAudit: RED — a leaking policy (org B also sees org A's row) fails the proof, not silently", async () => {
  const client = fakeClient({
    orgRows: [
      { org_id: "org-a", user_id: "user-a" },
      { org_id: "org-b", user_id: "user-b" },
    ],
    entityRows: [
      { entity_id: "cl:corridor:1", kind: "corridor" },
      { entity_id: "cl:organisation:1", kind: "organisation" },
    ],
    visibility: () => 1, // both users see it — the leak
  });
  const result = await runAudit(client);
  assert.equal(result.ok, false);
  assert.match(result.reason, /cross-org RLS leak/);
  // The transaction is always rolled back, even on a found leak.
  assert.equal(client.calls.at(-1), "ROLLBACK");
});

test("runAudit: GREEN — org A sees its row, org B is denied, using LIVE-shaped fixture rows", async () => {
  const client = fakeClient({
    orgRows: [
      { org_id: "org-a", user_id: "user-a" },
      { org_id: "org-b", user_id: "user-b" },
    ],
    entityRows: [
      { entity_id: "cl:corridor:1", kind: "corridor" },
      { entity_id: "cl:organisation:1", kind: "organisation" },
    ],
    visibility: (sub) => (sub === "user-a" ? 1 : 0),
  });
  const result = await runAudit(client);
  assert.equal(result.ok, true);
  assert.equal(result.orgA.orgId, "org-a");
  assert.equal(result.orgB.orgId, "org-b");
  assert.equal(result.corridorId, "cl:corridor:1");
  assert.equal(result.carrierId, "cl:organisation:1");
  assert.equal(client.calls.at(-1), "ROLLBACK");
});

test("runAudit: rolls back even when a probe throws — never leaves a transaction open", async () => {
  const client = {
    calls: [],
    async query(sql) {
      this.calls.push(sql);
      if (/^BEGIN$/.test(sql)) return {};
      if (/^ROLLBACK$/.test(sql)) return {};
      if (/FROM public\.org_memberships/.test(sql)) throw new Error("connection reset (simulated)");
      return {};
    },
  };
  await assert.rejects(() => runAudit(client), /connection reset/);
  assert.deepEqual(client.calls, ["BEGIN", "SELECT org_id, user_id FROM public.org_memberships ORDER BY org_id, created_at LIMIT 200", "ROLLBACK"]);
});
