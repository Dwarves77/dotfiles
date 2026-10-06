// Run: node --test scripts/maintenance/repair-smoke-account.test.mjs -- no DB, deps injected.
import { test } from "node:test";
import assert from "node:assert/strict";
import { main, ORG_NAME, CITE } from "./repair-smoke-account.mjs";

const USER = { id: "u-6853", email: "smoke@example.com" };
const ORG = { id: "org-dietl" };

/** In-memory deps; every write is logged in order. */
function makeDeps({ user = USER, profile = null, memberships = 0, orgs = [ORG] } = {}) {
  const state = { profile, memberships };
  const writes = [];
  const lookups = { orgName: null };
  return {
    state, writes, lookups,
    findAuthUserByEmail: async (email) => (user && email === user.email ? user : null),
    findProfile: async () => state.profile,
    countMemberships: async () => state.memberships,
    findOrgsByName: async (name) => { lookups.orgName = name; return orgs; },
    insertProfile: async (row) => { writes.push(["profiles", row]); state.profile = { id: row.id, is_platform_admin: row.is_platform_admin }; return { snapshot: "snap-p" }; },
    insertMembership: async (row) => { writes.push(["org_memberships", row]); state.memberships += 1; return { snapshot: "snap-m" }; },
  };
}

test("dry run prints the plan and writes nothing; the org is looked up by name, never by a typed id", async () => {
  const deps = makeDeps();
  const s = await main({ mode: "dry", arg: "smoke@example.com" }, deps);
  assert.equal(s.exitCode, 0);
  assert.equal(deps.writes.length, 0);
  assert.equal(deps.lookups.orgName, ORG_NAME);
  assert.equal(s.org_id, ORG.id);
  assert.equal(s.user_id, USER.id);
  assert.equal(s.plan.create_profile, true);
  assert.deepEqual(s.plan.membership_row, { org_id: ORG.id, user_id: USER.id, role: "member" });
  assert.equal(s.counts.profiles_to_create, 1);
  assert.equal(JSON.stringify(s).includes("smoke@example.com"), false, "the email is never printed");
  assert.match(s.note, /^DRY/);
});

test("apply creates the profile (org_id set, not platform admin, no job title) then a member membership, and reads back", async () => {
  const deps = makeDeps();
  const s = await main({ mode: "apply", arg: "smoke@example.com" }, deps);
  assert.equal(s.exitCode, 0);
  assert.deepEqual(deps.writes.map((w) => w[0]), ["profiles", "org_memberships"], "profile first (membership FK)");
  const prof = deps.writes[0][1];
  assert.equal(prof.org_id, ORG.id);
  assert.equal(prof.is_platform_admin, false);
  assert.equal("job_title" in prof, false);
  assert.equal(deps.writes[1][1].role, "member");
  assert.equal(s.applied, 2);
  assert.deepEqual(s.read_back, { profile_exists: true, profile_is_platform_admin: false, memberships: 1 });
});

test("an existing non-admin profile is kept: only the membership is inserted", async () => {
  const deps = makeDeps({ profile: { id: USER.id, is_platform_admin: false } });
  const s = await main({ mode: "apply", arg: "smoke@example.com" }, deps);
  assert.deepEqual(deps.writes.map((w) => w[0]), ["org_memberships"]);
  assert.equal(s.exitCode, 0);
});

test("REFUSES a platform admin (profile untouched, nothing written)", async () => {
  const deps = makeDeps({ profile: { id: USER.id, is_platform_admin: true } });
  const s = await main({ mode: "apply", arg: "smoke@example.com" }, deps);
  assert.equal(s.exitCode, 1);
  assert.match(s.refused, /platform admin/);
  assert.equal(deps.writes.length, 0);
});

test("REFUSES when any membership already exists", async () => {
  const deps = makeDeps({ memberships: 1 });
  const s = await main({ mode: "apply", arg: "smoke@example.com" }, deps);
  assert.equal(s.exitCode, 1);
  assert.match(s.refused, /already holds 1 membership/);
  assert.equal(deps.writes.length, 0);
});

test("REFUSES when the organisation name matches zero rows or more than one", async () => {
  for (const orgs of [[], [{ id: "a" }, { id: "b" }]]) {
    const deps = makeDeps({ orgs });
    const s = await main({ mode: "apply", arg: "smoke@example.com" }, deps);
    assert.equal(s.exitCode, 1);
    assert.match(s.refused, new RegExp(`matched ${orgs.length} rows`));
    assert.equal(deps.writes.length, 0);
  }
});

test("REFUSES with no email, or an email no auth user has", async () => {
  assert.equal((await main({ mode: "apply", arg: "" }, makeDeps())).exitCode, 1);
  const s = await main({ mode: "apply", arg: "nobody@example.com" }, makeDeps());
  assert.equal(s.exitCode, 1);
  assert.match(s.refused, /no auth user/);
});

test("the cite carries a skill and a reason (guarded-write contract)", () => {
  assert.ok(CITE.skill && CITE.reason);
});
