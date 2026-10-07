// Run: node --test scripts/maintenance/lib/cli.test.mjs -- no DB, no network.
// Lane OPS-1: step=all must skip a step that declares it needs an input, with a logged reason.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { REQUIRES_ARG, fanoutSkipSummary } from "./cli.mjs";

const MAINT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("fan-out with no arg: a requiresArg step is skipped with a reason, exit 0", () => {
  const s = fanoutSkipSummary({ step: "attach-found-sources", mode: "dry", arg: "", env: { RUN_STEP: "all" } });
  assert.equal(s.skipped, true);
  assert.equal(s.exitCode, 0);
  assert.match(s.skip_reason, /step=all fan-out/);
});

test("named dispatch is never skipped (it refuses on its own terms)", () => {
  assert.equal(fanoutSkipSummary({ step: "attach-found-sources", mode: "dry", arg: "", env: { RUN_STEP: "attach-found-sources" } }), null);
  assert.equal(fanoutSkipSummary({ step: "reopen-validation-holds", mode: "dry", arg: "", env: {} }), null);
});

test("fan-out with an arg supplied runs the step", () => {
  assert.equal(fanoutSkipSummary({ step: "reopen-validation-holds", mode: "dry", arg: "ungrounded_url", env: { RUN_STEP: "all" } }), null);
});

test("a step that declares no input is never skipped", () => {
  assert.equal(fanoutSkipSummary({ step: "refetch-capped", mode: "dry", arg: "", env: { RUN_STEP: "all" } }), null);
});

test("every declared step id is a real runCli step in its own wrapper (no stale declaration)", () => {
  for (const step of Object.keys(REQUIRES_ARG)) {
    const src = readFileSync(resolve(MAINT, `${step}.mjs`), "utf8");
    assert.ok(src.includes(`step: "${step}"`), `${step}.mjs does not call runCli with step "${step}"`);
  }
});

test("end to end: the real wrapper process exits 0 and logs the skip under RUN_STEP=all, with no DB creds", () => {
  const env = { ...process.env, RUN_STEP: "all" };
  delete env.NEXT_PUBLIC_SUPABASE_URL; delete env.SUPABASE_SERVICE_ROLE_KEY;
  const r = spawnSync(process.execPath, [resolve(MAINT, "reopen-validation-holds.mjs"), "--mode", "dry"], { env, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /skipped in step=all fan-out/);
});
