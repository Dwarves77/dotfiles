// fixtures.test.mjs -- lane PROOF-4 (2026-10-07). The local fixture users, organisations and workspace rows: one
// platform admin, one organisation owner, one member of another organisation, one anonymous (a role, no row).
// Everything is created on the LOCAL stack only; these tests prove the statements, in order, on a scripted client.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FIXTURE_IDS, fixtureContext, setupFixtures, teardownFixtures } from "./fixtures.mjs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function recorder(failOn = null) {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql: String(sql).replace(/\s+/g, " ").trim(), params });
      if (failOn && failOn.test(String(sql))) throw Object.assign(new Error("boom"), { code: "23502" });
      return { rows: [], rowCount: 1 };
    },
  };
}

test("fixture ids are distinct uuid-shaped values and the context exposes them by name", () => {
  const values = Object.values(FIXTURE_IDS);
  assert.ok(values.length >= 5);
  for (const v of values) assert.match(v, UUID_RE);
  assert.equal(new Set(values).size, values.length);
  const ctx = fixtureContext();
  for (const k of ["admin", "owner_a", "member_b", "org_a", "org_b"]) assert.equal(ctx[k], FIXTURE_IDS[k]);
});

test("setup clears any previous fixture first, then creates users, profiles, organisations, memberships and workspace rows in dependency order", async () => {
  const db = recorder();
  await setupFixtures(db);
  const sqls = db.calls.map((c) => c.sql);
  const idx = (re) => sqls.findIndex((s) => re.test(s));
  assert.ok(idx(/^DELETE FROM public\.organizations/) >= 0, "previous run cleared");
  assert.ok(idx(/^DELETE FROM public\.organizations/) < idx(/^INSERT INTO auth\.users/));
  assert.ok(idx(/^INSERT INTO auth\.users/) < idx(/^INSERT INTO public\.profiles/));
  assert.ok(idx(/^INSERT INTO public\.profiles/) < idx(/^INSERT INTO public\.organizations/));
  assert.ok(idx(/^INSERT INTO public\.organizations/) < idx(/^INSERT INTO public\.org_memberships/));
  assert.ok(idx(/^INSERT INTO public\.org_memberships/) < idx(/^INSERT INTO public\.workspace_settings/));
  assert.ok(idx(/^INSERT INTO public\.workspace_settings/) < idx(/^INSERT INTO public\.workspace_tags/));
});

test("exactly one platform admin; the owner and the member are not admins; the two organisations differ", async () => {
  const db = recorder();
  await setupFixtures(db);
  const profileInserts = db.calls.filter((c) => /^INSERT INTO public\.profiles/.test(c.sql));
  assert.equal(profileInserts.length, 3);
  const admins = profileInserts.filter((c) => c.params.includes(true));
  assert.equal(admins.length, 1);
  assert.ok(admins[0].params.includes(FIXTURE_IDS.admin));
  const memberships = db.calls.filter((c) => /^INSERT INTO public\.org_memberships/.test(c.sql));
  assert.equal(memberships.length, 2);
  const pairs = memberships.map((c) => c.params.slice(0, 3));
  assert.ok(pairs.some((p) => p[0] === FIXTURE_IDS.org_a && p[1] === FIXTURE_IDS.owner_a && p[2] === "owner"));
  assert.ok(pairs.some((p) => p[0] === FIXTURE_IDS.org_b && p[1] === FIXTURE_IDS.member_b && p[2] === "member"));
});

test("fixture email addresses are on the reserved .invalid domain: nothing real is ever created", async () => {
  const db = recorder();
  await setupFixtures(db);
  const emails = db.calls.flatMap((c) => c.params).filter((p) => typeof p === "string" && p.includes("@"));
  assert.ok(emails.length >= 3);
  for (const e of emails) assert.match(e, /\.invalid$/);
});

test("teardown deletes in reverse dependency order and every statement is keyed by the fixture ids", async () => {
  const db = recorder();
  await teardownFixtures(db);
  const sqls = db.calls.map((c) => c.sql);
  assert.match(sqls[0], /^DELETE FROM public\.organizations/);
  assert.ok(sqls.findIndex((s) => /^DELETE FROM public\.profiles/.test(s)) < sqls.findIndex((s) => /^DELETE FROM auth\.users/.test(s)));
  for (const c of db.calls) assert.ok(c.params.length >= 1 && /ANY\(\$1/.test(c.sql), "never an unkeyed delete");
});

test("a failing setup statement throws a message that names the statement, so the runner can mark the attacks NOT EXERCISED", async () => {
  const db = recorder(/INSERT INTO public\.profiles/);
  await assert.rejects(() => setupFixtures(db), /profiles/);
});
