/** Tests for scripts/proof/preflight.mjs (lane PROOF-1, ruling R3). The attack cases are the point: the
 *  preflight must REFUSE a production host and each forbidden credential name, and must never echo a value. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPreflight, FORBIDDEN_NAMES } from "./preflight.mjs";

const KEY = "local-service-key-value";
const CLEAN = Object.freeze({
  PATH: "/usr/bin",
  CHAIN_PROOF_LOCAL: "1",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  SUPABASE_SERVICE_ROLE_KEY: KEY,
  PROOF_SERVICE_KEY: KEY,
  PROOF_API_URL: "http://127.0.0.1:54321",
  PROOF_DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  PROOF_DB_SUPERUSER_URL: "postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres",
});

test("a clean local environment passes", () => {
  assert.deepEqual(checkPreflight(CLEAN), { ok: true, violations: [] });
});

for (const name of FORBIDDEN_NAMES) {
  test(`ATTACK: forbidden name ${name} present is refused, value never echoed`, () => {
    const secret = `top-secret-value-for-${name}`;
    const r = checkPreflight({ ...CLEAN, [name]: secret });
    assert.equal(r.ok, false);
    assert.ok(r.violations.some((v) => v.includes(name)), `no violation names ${name}`);
    assert.ok(!JSON.stringify(r).includes(secret), "a secret value leaked into the result");
  });
}

test("ATTACK: any VERCEL_ name is refused", () => {
  const r = checkPreflight({ ...CLEAN, VERCEL_TOKEN: "x" });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes("VERCEL_TOKEN")));
});

test("a forbidden name set to an empty string is not a violation (an unset secret reads empty)", () => {
  assert.equal(checkPreflight({ ...CLEAN, APP_URL: "", GH_TOKEN: "  " }).ok, true);
});

test("ATTACK: a production Supabase URL as the API URL is refused", () => {
  const r = checkPreflight({ ...CLEAN, NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnop.supabase.co" });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes("NEXT_PUBLIC_SUPABASE_URL")));
});

test("ATTACK: a production pooler URL as the DB URL is refused", () => {
  const r = checkPreflight({ ...CLEAN, SUPABASE_DB_URL: "postgresql://postgres.abc:pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres" });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes("SUPABASE_DB_URL")));
});

test("ATTACK: DATABASE_URL on a production host is refused even though the primary URL is local", () => {
  const r = checkPreflight({ ...CLEAN, DATABASE_URL: "postgresql://postgres:pw@db.abcdefghijklmnop.supabase.co:5432/postgres" });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes("DATABASE_URL")));
});

test("ATTACK: a production host hidden in an unrelated variable is refused", () => {
  const r = checkPreflight({ ...CLEAN, SOME_OTHER_SETTING: "see https://carosledge.com/api" });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes("SOME_OTHER_SETTING")));
});

test("ATTACK: a production service-role key beside the local URL is refused", () => {
  const r = checkPreflight({ ...CLEAN, SUPABASE_SERVICE_ROLE_KEY: "production-service-role-jwt" });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes("SUPABASE_SERVICE_ROLE_KEY")));
  assert.ok(!JSON.stringify(r).includes("production-service-role-jwt"));
});

test("a service-role key with no local proof key is refused", () => {
  const { PROOF_SERVICE_KEY: _drop, ...rest } = CLEAN;
  assert.equal(checkPreflight(rest).ok, false);
});

test("CHAIN_PROOF_LOCAL unset is refused", () => {
  const { CHAIN_PROOF_LOCAL: _drop, ...rest } = CLEAN;
  const r = checkPreflight(rest);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes("CHAIN_PROOF_LOCAL")));
});

test("missing local URLs are refused (the job must have a stack)", () => {
  const { NEXT_PUBLIC_SUPABASE_URL: _a, SUPABASE_DB_URL: _b, ...rest } = CLEAN;
  const r = checkPreflight(rest);
  assert.equal(r.ok, false);
  assert.equal(r.violations.filter((v) => v.startsWith("required local variable missing")).length, 2);
});

test("PROOF-5: ATTACK: PROOF_DB_SUPERUSER_URL on a production host is refused, and the password never echoed", () => {
  const r = checkPreflight({ ...CLEAN, PROOF_DB_SUPERUSER_URL: "postgresql://supabase_admin:prod-pw-123@db.abcdefghijklmnop.supabase.co:5432/postgres" });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes("PROOF_DB_SUPERUSER_URL does not name a loopback host")));
  assert.ok(!JSON.stringify(r).includes("prod-pw-123"));
});

test("PROOF-5: ATTACK: PROOF_DB_SUPERUSER_URL on a non-loopback, non-production host is refused", () => {
  const r = checkPreflight({ ...CLEAN, PROOF_DB_SUPERUSER_URL: "postgresql://supabase_admin:x@192.0.2.10:5432/postgres" });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes("PROOF_DB_SUPERUSER_URL")));
});

test("PROOF-5: PROOF_DB_SUPERUSER_URL is optional to the preflight (steps before the env carries it still pass)", () => {
  const { PROOF_DB_SUPERUSER_URL: _drop, ...rest } = CLEAN;
  assert.equal(checkPreflight(rest).ok, true);
});

test("a hostname that merely begins with 127.0.0.1 is not loopback", () => {
  const r = checkPreflight({ ...CLEAN, SUPABASE_DB_URL: "postgresql://postgres:x@127.0.0.1.evil.example:5432/postgres" });
  assert.equal(r.ok, false);
});

// ── lane GATE-9 (2026-10-08, AUD-AT-5 gate-script neuter row): the CLI's EXIT STATUS, not only its output ──────
test("GATE-9 exit status: preflight.mjs exits 1 on an empty env, on a non-loopback or production host, and 0 on a clean loopback env", async () => {
  const { spawnSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const script = fileURLToPath(new URL("./preflight.mjs", import.meta.url));
  const { withoutCredentials } = await import("../lib/env-file.mjs");
  // only the few variables a node child needs: the success case must see NO ambient VERCEL_* name or production-looking value
  const keep = ["PATH", "Path", "SystemRoot", "SYSTEMROOT", "TEMP", "TMP", "HOME", "USERPROFILE", "FSI_NO_ENV_FILE"];
  const base = Object.fromEntries(Object.entries(withoutCredentials()).filter(([k]) => keep.includes(k)));
  const run = (extra) => spawnSync(process.execPath, [script], { encoding: "utf8", env: { ...base, ...extra } });
  const empty = run({});
  assert.equal(empty.status, 1, empty.stdout + empty.stderr);
  assert.match(empty.stderr, /REFUSED/);
  assert.equal(run({ CHAIN_PROOF_LOCAL: "1", SUPABASE_DB_URL: "postgresql://postgres:x@db.abcdefgh.supabase.co:5432/postgres" }).status, 1, "a production host is refused");
  assert.equal(run({ CHAIN_PROOF_LOCAL: "1", SUPABASE_DB_URL: "postgresql://postgres:x@127.0.0.1:54322/postgres", SUPABASE_DB_PASSWORD: "set" }).status, 1, "a forbidden credential is refused");
  const ok = run({ CHAIN_PROOF_LOCAL: "1", SUPABASE_DB_URL: "postgresql://postgres:x@127.0.0.1:54322/postgres", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" });
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /preflight: ok/);
});
