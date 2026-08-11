/** Tests for scripts/lib/pg-conn.mjs — the shared direct-Postgres connection resolver.
 *  NPM LANE (imports `pg` transitively): named in discipline.yml "App unit tests requiring npm deps",
 *  the same home as batch-primitives.test.mjs. NOT in the no-npm suite.
 *
 *  What is worth proving here is exactly the class that broke the data-audit lane for 29 runs
 *  (docs/audits/data-audit-lane-diagnosis-2026-08-11.md): five audits whose connection resolution
 *  could not succeed with the credentials CI actually provides. These tests pin the resolver's
 *  CONTRACT: explicit env URLs are tried first, CI's NEXT_PUBLIC_SUPABASE_URL + SUPABASE_DB_PASSWORD
 *  always yield derived candidates, passwords are URL-encoded, and no env yields no candidates
 *  (callers exit 2, never a silent pass). Live connectivity is proven by the lane itself. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { candidateConnStrings } from "./pg-conn.mjs";

const CI_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnop.supabase.co",
  SUPABASE_DB_PASSWORD: "p@ss w/rd",
};

test("no credentials -> no candidates (caller must exit 2, not silently pass)", () => {
  assert.deepEqual(candidateConnStrings({}), []);
});

test("password alone (no URL, no .temp link) -> no candidates", () => {
  assert.deepEqual(candidateConnStrings({ SUPABASE_DB_PASSWORD: "x" }), []);
});

test("SUPABASE_DB_URL is the FIRST candidate; DATABASE_URL second", () => {
  const c = candidateConnStrings({
    SUPABASE_DB_URL: "postgresql://a:b@h1:5432/db",
    DATABASE_URL: "postgresql://c:d@h2:5432/db",
    ...CI_ENV,
  });
  assert.equal(c[0], "postgresql://a:b@h1:5432/db");
  assert.equal(c[1], "postgresql://c:d@h2:5432/db");
});

test("CI env (REST URL + DB password, the lane's exact secrets) derives direct-db + pooler candidates", () => {
  const c = candidateConnStrings(CI_ENV);
  assert.ok(c.length >= 9, `expected direct + regional poolers, got ${c.length}`);
  // Direct db host first among derived; ref extracted from the REST URL host.
  assert.ok(c.some((s) => s.includes("@db.abcdefghijklmnop.supabase.co:5432/postgres")), "direct db candidate missing");
  assert.ok(c.some((s) => s.includes("postgres.abcdefghijklmnop:") && s.includes(".pooler.supabase.com:5432/postgres")), "pooler candidates missing");
});

test("password is URL-encoded in every derived candidate (spaces, @, /)", () => {
  const enc = encodeURIComponent(CI_ENV.SUPABASE_DB_PASSWORD);
  for (const s of candidateConnStrings(CI_ENV)) {
    assert.ok(s.includes(enc), `raw password leaked un-encoded into: ${s.replace(enc, "<pw>")}`);
    assert.ok(!s.includes("p@ss w/rd"), "un-encoded password present");
  }
});

test("malformed REST URL derives nothing (no throw, no bogus candidate)", () => {
  const c = candidateConnStrings({ NEXT_PUBLIC_SUPABASE_URL: "not a url", SUPABASE_DB_PASSWORD: "x" });
  assert.deepEqual(c, []);
});
