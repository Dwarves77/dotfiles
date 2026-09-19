// env-file.mjs: the one guarded env-file loader (lane T2, 2026-09-19). Proven with an injected loader and
// with a real temp file, never by touching fsi-app/.env.local.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadLocalEnvFile, withoutCredentials, envFileLoadSwitchedOff, CREDENTIAL_VARS, NO_ENV_FILE_VAR, DEFAULT_ENV_FILE, FSI_APP_ROOT,
} from "./env-file.mjs";

test("the default path is fsi-app/.env.local, derived from the module, not from cwd", () => {
  assert.equal(DEFAULT_ENV_FILE, join(FSI_APP_ROOT, ".env.local"));
  assert.match(FSI_APP_ROOT.replace(/\\/g, "/"), /\/fsi-app$/);
});

test("switch semantics: unset, empty and \"0\" load; any other value switches the load off", () => {
  assert.equal(envFileLoadSwitchedOff({}), false);
  assert.equal(envFileLoadSwitchedOff({ [NO_ENV_FILE_VAR]: "" }), false);
  assert.equal(envFileLoadSwitchedOff({ [NO_ENV_FILE_VAR]: "0" }), false);
  assert.equal(envFileLoadSwitchedOff({ [NO_ENV_FILE_VAR]: "1" }), true);
  assert.equal(envFileLoadSwitchedOff({ [NO_ENV_FILE_VAR]: "true" }), true);
});

test("switched off: the injected loader is never called and the result says so", () => {
  let calls = 0;
  const r = loadLocalEnvFile({ path: "/nowhere/.env.local", env: { [NO_ENV_FILE_VAR]: "1" }, load: () => { calls++; } });
  assert.equal(calls, 0);
  assert.deepEqual(r, { loaded: false, reason: "switched-off", path: "/nowhere/.env.local" });
});

test("absent file: no throw, reason 'absent' (the CI case: env injected from secrets, no file on the runner)", () => {
  const r = loadLocalEnvFile({ path: join(tmpdir(), `env-file-test-${process.pid}-missing.env`), env: {} });
  assert.equal(r.loaded, false);
  assert.equal(r.reason, "absent");
});

test("any other loader error: no throw, reason 'error', the error carried", () => {
  const boom = new Error("EACCES");
  boom.code = "EACCES";
  const r = loadLocalEnvFile({ path: "/x", env: {}, load: () => { throw boom; } });
  assert.equal(r.reason, "error");
  assert.equal(r.error, boom);
});

test("a real temp env file loads into process.env through Node's own loader, and does not overwrite a set variable", () => {
  const dir = mkdtempSync(join(tmpdir(), "env-file-test-"));
  const path = join(dir, ".env.local");
  const fresh = `ENV_FILE_TEST_FRESH_${process.pid}`;
  const kept = `ENV_FILE_TEST_KEPT_${process.pid}`;
  process.env[kept] = "from-process";
  writeFileSync(path, `${fresh}=from-file\n${kept}=from-file\n`);
  try {
    const r = loadLocalEnvFile({ path, env: {} });
    assert.deepEqual(r, { loaded: true, reason: "loaded", path });
    assert.equal(process.env[fresh], "from-file");
    assert.equal(process.env[kept], "from-process");
  } finally {
    delete process.env[fresh];
    delete process.env[kept];
    rmSync(dir, { recursive: true, force: true });
  }
});

test("withoutCredentials strips every credential variable, sets the switch, and never mutates its input", () => {
  const base = { PATH: "/bin", OTHER: "x" };
  for (const name of CREDENTIAL_VARS) base[name] = "secret";
  const frozen = JSON.stringify(base);
  const env = withoutCredentials(base);
  for (const name of CREDENTIAL_VARS) assert.equal(name in env, false, `${name} still present`);
  assert.equal(env[NO_ENV_FILE_VAR], "1");
  assert.equal(env.PATH, "/bin");
  assert.equal(env.OTHER, "x");
  assert.equal(JSON.stringify(base), frozen);
  assert.equal(envFileLoadSwitchedOff(env), true);
});

test("the credential list covers the two apply-gate names and the three pg-conn candidates", () => {
  assert.deepEqual([...CREDENTIAL_VARS].sort(), [
    "DATABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_DB_PASSWORD", "SUPABASE_DB_URL", "SUPABASE_SERVICE_ROLE_KEY",
  ]);
});
