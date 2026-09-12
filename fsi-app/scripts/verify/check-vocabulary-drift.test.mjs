// Tests for the check-vocabulary-drift.mjs RUNNER (D7 part 3). The pure diff core has its own tests at
// scripts/verify/lib/vocab-drift.test.mjs; this file proves the CLI's no-cred self-skip behavior (no DB
// creds exist in this worktree, per this repo's own convention for pg-direct audits, e.g.
// schema-drift-audit.mjs / vocab-sync-audit.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(HERE, "check-vocabulary-drift.mjs");

test("check-vocabulary-drift.mjs self-skips (exit 2) without DB credentials", () => {
  const env = { ...process.env };
  delete env.SUPABASE_DB_URL;
  delete env.DATABASE_URL;
  delete env.SUPABASE_DB_PASSWORD;
  delete env.NEXT_PUBLIC_SUPABASE_URL;
  const result = spawnSync(process.execPath, [SCRIPT], { env, encoding: "utf8", timeout: 15000 });
  assert.equal(result.status, 2);
});
