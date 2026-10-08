/** Tests for scripts/proof/write-local-env.mjs (lane PROOF-1, ruling R3). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStatusEnv, buildLocalEnv, renderEnvFile, maskLines, withUser, SUPERUSER_ROLE } from "./write-local-env.mjs";
import { checkPreflight } from "./preflight.mjs";

const STATUS = [
  'API_URL="http://127.0.0.1:54321"',
  'DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"',
  'ANON_KEY="anon-jwt"',
  'SERVICE_ROLE_KEY="service-jwt"',
  'STUDIO_URL="http://127.0.0.1:54323"',
  "garbage line",
].join("\n");

test("parseStatusEnv reads quoted KEY=value lines and skips noise", () => {
  const s = parseStatusEnv(STATUS);
  assert.equal(s.API_URL, "http://127.0.0.1:54321");
  assert.equal(s.SERVICE_ROLE_KEY, "service-jwt");
  assert.equal(Object.keys(s).length, 5);
});

test("buildLocalEnv maps to the names the scripts read and turns loopback mode on", () => {
  const e = buildLocalEnv(parseStatusEnv(STATUS));
  assert.equal(e.NEXT_PUBLIC_SUPABASE_URL, "http://127.0.0.1:54321");
  assert.equal(e.SUPABASE_DB_URL, e.PROOF_DB_URL);
  assert.equal(e.SUPABASE_SERVICE_ROLE_KEY, e.PROOF_SERVICE_KEY);
  assert.equal(e.CHAIN_PROOF_LOCAL, "1");
  assert.equal(e.NEXT_PUBLIC_SUPABASE_ANON_KEY, "anon-jwt");
});

test("the env it builds passes the chain-proof preflight", () => {
  const e = buildLocalEnv(parseStatusEnv(STATUS));
  assert.deepEqual(checkPreflight({ PATH: "/usr/bin", ...e }), { ok: true, violations: [] });
});

test("newer CLI key names are accepted as fallbacks", () => {
  const e = buildLocalEnv({ API_URL: "http://127.0.0.1:54321", DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres", SECRET_KEY: "sb_secret_x", PUBLISHABLE_KEY: "sb_pub_x" });
  assert.equal(e.SUPABASE_SERVICE_ROLE_KEY, "sb_secret_x");
  assert.equal(e.NEXT_PUBLIC_SUPABASE_ANON_KEY, "sb_pub_x");
});

test("ATTACK: a status output naming a remote host never becomes an env file", () => {
  assert.throws(() => buildLocalEnv({ API_URL: "https://abcdefghijklmnop.supabase.co", DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres", SERVICE_ROLE_KEY: "k" }), /API_URL does not name a loopback host/);
  assert.throws(() => buildLocalEnv({ API_URL: "http://127.0.0.1:54321", DB_URL: "postgresql://u:p@db.abcdefghijklmnop.supabase.co:5432/postgres", SERVICE_ROLE_KEY: "k" }), /DB_URL does not name a loopback host/);
});

test("missing pieces are refused by name", () => {
  assert.throws(() => buildLocalEnv({}), /API_URL/);
  assert.throws(() => buildLocalEnv({ API_URL: "http://127.0.0.1:1" }), /DB_URL/);
  assert.throws(() => buildLocalEnv({ API_URL: "http://127.0.0.1:1", DB_URL: "postgresql://x@127.0.0.1:2/db" }), /SERVICE_ROLE_KEY/);
});

test("renderEnvFile single-quotes values and refuses a value with a quote", () => {
  assert.equal(renderEnvFile({ A: "b" }), "export A='b'\n");
  assert.throws(() => renderEnvFile({ A: "it's" }), /single quote/);
});

test("maskLines masks the keys only, once each", () => {
  const e = buildLocalEnv(parseStatusEnv(STATUS));
  assert.deepEqual(maskLines(e).sort(), ["::add-mask::anon-jwt", "::add-mask::service-jwt"]);
});

test("PROOF-5: the env carries PROOF_DB_SUPERUSER_URL, the same loopback database URL with the superuser role and the same password", () => {
  const e = buildLocalEnv(parseStatusEnv(STATUS));
  assert.equal(SUPERUSER_ROLE, "supabase_admin");
  assert.equal(e.PROOF_DB_SUPERUSER_URL, "postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres");
  const u = new URL(e.PROOF_DB_SUPERUSER_URL);
  assert.equal(u.hostname, "127.0.0.1");
  assert.equal(u.username, "supabase_admin");
  assert.equal(u.password, new URL(e.PROOF_DB_URL).password);
  assert.equal(new URL(e.PROOF_DB_URL).username, "postgres", "the ordinary URL stays on the postgres role");
  assert.match(renderEnvFile(e), /export PROOF_DB_SUPERUSER_URL='postgresql:\/\/supabase_admin:postgres@127\.0\.0\.1:54322\/postgres'/);
});

test("PROOF-5: withUser replaces only the user", () => {
  assert.equal(withUser("postgresql://postgres:pw@127.0.0.1:54322/postgres", "x"), "postgresql://x:pw@127.0.0.1:54322/postgres");
});

test("PROOF-5: ATTACK: a superuser URL on a non-loopback host is refused by the chain-proof preflight", () => {
  const e = buildLocalEnv(parseStatusEnv(STATUS));
  const r = checkPreflight({ PATH: "/usr/bin", ...e, PROOF_DB_SUPERUSER_URL: "postgresql://supabase_admin:pw@db.example.org:5432/postgres" });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes("PROOF_DB_SUPERUSER_URL does not name a loopback host")));
});
