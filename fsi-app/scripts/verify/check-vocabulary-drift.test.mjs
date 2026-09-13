// Tests for the check-vocabulary-drift.mjs RUNNER (D7 Fix round 3, docs/plans/defect-fix-plan-2026-09-12.md).
// The pure diff core has its own tests at scripts/verify/lib/vocab-drift.test.mjs; this file proves the
// CLI's no-cred self-skip behavior, INCLUDING under a Node module-customization hook
// (.discipline/lib/fixtures/no-npm-resolve-register.mjs) that refuses every bare package specifier,
// simulating CI's no-npm "Discipline engine unit tests" job exactly. PR #660 red: this script's own
// top-level `import { connectPg } from "../lib/pg-conn.mjs"` pulled the "pg" npm package in at module
// load, so a no-npm environment crashed with ERR_MODULE_NOT_FOUND instead of the documented exit 2 --
// invisible to glob-portability.test.mjs's static analysis because the crash only happens in a SPAWNED
// child process, never a statically-analyzable import specifier. The hook-based tests below reproduce
// that environment for real, not by pattern-matching source text.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { hasPlausibleCredentials } from "./check-vocabulary-drift.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(HERE, "check-vocabulary-drift.mjs");
// `--import` parses its argument through the URL parser: a raw Windows absolute path ("C:\...") is
// misread as a URL with scheme "c:", so it must be passed as a real file:// URL (pathToFileURL), not a
// plain OS path string.
const REGISTER = pathToFileURL(resolve(HERE, "..", "..", ".discipline", "lib", "fixtures", "no-npm-resolve-register.mjs")).href;
const EAGER_FIXTURE = resolve(HERE, "fixtures", "eager-pg-import.mjs");

function noCredEnv() {
  const env = { ...process.env };
  delete env.SUPABASE_DB_URL;
  delete env.DATABASE_URL;
  delete env.SUPABASE_DB_PASSWORD;
  delete env.NEXT_PUBLIC_SUPABASE_URL;
  return env;
}

test("check-vocabulary-drift.mjs self-skips (exit 2) without DB credentials", () => {
  const result = spawnSync(process.execPath, [SCRIPT], { env: noCredEnv(), encoding: "utf8", timeout: 15000 });
  assert.equal(result.status, 2);
});

test("check-vocabulary-drift.mjs exits 2 (never crashes) under the no-npm resolver hook with no credentials, simulating CI's no-npm job exactly", () => {
  const result = spawnSync(process.execPath, ["--import", REGISTER, SCRIPT], {
    env: noCredEnv(),
    encoding: "utf8",
    timeout: 15000,
  });
  assert.equal(result.status, 2, `expected exit 2 under the hook; got ${result.status}. stderr:\n${result.stderr}`);
  assert.ok(
    !/ERR_MODULE_NOT_FOUND/.test(result.stderr ?? ""),
    `must never reach the point of importing an npm package under the hook; stderr:\n${result.stderr}`,
  );
});

test("hasPlausibleCredentials: true only when a real connection-string source is present", () => {
  assert.equal(hasPlausibleCredentials({}), false);
  assert.equal(hasPlausibleCredentials({ SUPABASE_DB_URL: "postgres://x" }), true);
  assert.equal(hasPlausibleCredentials({ DATABASE_URL: "postgres://x" }), true);
  assert.equal(hasPlausibleCredentials({ SUPABASE_DB_PASSWORD: "x" }), true);
  // NEXT_PUBLIC_SUPABASE_URL alone is not enough (pg-conn.mjs's own pooler-derivation branch also needs
  // SUPABASE_DB_PASSWORD before it can build a candidate connection string).
  assert.equal(hasPlausibleCredentials({ NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co" }), false);
});

// Negative control, standing rule 15 (a guard is proven by attack, not by presence): a fixture shaped
// exactly like the PRE-fix defect (an eager top-level npm import, no credential check first) MUST crash
// under the same hook with ERR_MODULE_NOT_FOUND, never exit 2. If this ever passed, the hook itself would
// be decoration, not a real simulation of the no-npm job.
test("negative control: an eagerly-importing fixture (the pre-fix shape) crashes under the hook, proving the hook has teeth", () => {
  const result = spawnSync(process.execPath, ["--import", REGISTER, EAGER_FIXTURE], {
    env: noCredEnv(),
    encoding: "utf8",
    timeout: 15000,
  });
  assert.notEqual(result.status, 2, "the broken fixture must NOT exit 2 (that would mean the hook caught nothing)");
  assert.ok(/ERR_MODULE_NOT_FOUND/.test(result.stderr ?? ""), `expected ERR_MODULE_NOT_FOUND in stderr, got:\n${result.stderr}`);
});
