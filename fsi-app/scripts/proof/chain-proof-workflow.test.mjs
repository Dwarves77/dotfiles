/** Static proof of the chain-proof workflow's isolation contract (lane PROOF-1, ruling R3). It reads the
 *  committed workflow text and asserts what must stay true however the file is edited later: dispatch only,
 *  contents: read, one production-credential step, only the two named secrets, no forbidden name anywhere, and
 *  every step after the export preflights against the local env. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FORBIDDEN_NAMES } from "./preflight.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const TEXT = readFileSync(resolve(HERE, "..", "..", "..", ".github", "workflows", "chain-proof.yml"), "utf8");

/** Split the steps: each starts at a line `      - name:` (6 spaces). */
function steps() {
  const parts = TEXT.split(/^\s{6}- name: /m).slice(1);
  return parts.map((p) => ({ name: p.split("\n")[0], body: p }));
}

test("dispatch only: no schedule, no workflow_run, no push, no pull_request trigger", () => {
  const on = TEXT.slice(TEXT.indexOf("\non:"), TEXT.indexOf("\npermissions:"));
  assert.match(on, /workflow_dispatch:/);
  for (const t of ["schedule:", "workflow_run:", "push:", "pull_request", "deployment_status:"]) assert.ok(!on.includes(t), `trigger ${t} present`);
});

test("permissions are contents: read only, one run at a time, 60 minute limit, and no GitHub Environment", () => {
  assert.match(TEXT, /^permissions:\n  contents: read\n/m);
  assert.doesNotMatch(TEXT, /^\s*(actions|id-token|pull-requests|issues|statuses|packages): write/m);
  assert.match(TEXT, /group: chain-proof\n\s+cancel-in-progress: false/);
  assert.match(TEXT, /timeout-minutes: 60/);
  assert.doesNotMatch(TEXT, /^\s+environment:/m);
});

test("the only secrets referenced are the three existing production names, and only in the export step", () => {
  const refs = [...TEXT.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(refs)].sort(), ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_DB_PASSWORD", "SUPABASE_SERVICE_ROLE_KEY"]);
  const holders = steps().filter((s) => /secrets\.[A-Z]/.test(s.body));
  assert.equal(holders.length, 1, "more than one step references a secret");
  assert.match(holders[0].name, /Export the production schema dump and data subset/);
  assert.doesNotMatch(holders[0].body, /CHAIN_PROOF_ENV/, "the export step must not source the local env file");
});

test("no forbidden credential name appears anywhere outside the export step, and SUPABASE_DB_PASSWORD only there", () => {
  const exportStep = steps().find((s) => /Export the production schema dump/.test(s.name));
  const rest = TEXT.replace(exportStep.body, "");
  const code = rest.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
  for (const name of FORBIDDEN_NAMES) assert.ok(!code.includes(name), `${name} referenced outside the export step`);
  const exportCode = exportStep.body.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
  for (const name of FORBIDDEN_NAMES.filter((n) => n !== "SUPABASE_DB_PASSWORD")) assert.ok(!exportCode.includes(name), `${name} referenced in the export step`);
  assert.doesNotMatch(TEXT.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n"), /github\.token|GITHUB_TOKEN|GH_TOKEN|gh workflow run/);
});

const LOCAL_SCRIPTS = /scripts\/proof\/(replay-migrations|run-lane-step|export-local-harness-runs|apply-schema-dump|schema-diff|create-replay-db)\.mjs/;

test("every step that touches the local database sources the local env and runs the preflight first", () => {
  const touching = steps().filter((s) => LOCAL_SCRIPTS.test(s.body) && !/Export the production schema dump/.test(s.name));
  assert.ok(touching.length >= 8, `expected replay_check, schema apply, load, chain, attacks, replay, diff and ledger steps, got ${touching.length}`);
  for (const s of touching) {
    const src = s.body.indexOf('. "$CHAIN_PROOF_ENV"');
    const pre = s.body.indexOf("scripts/proof/preflight.mjs");
    assert.ok(src >= 0 && pre > src, `step "${s.name}" does not source the local env then preflight`);
    const first = s.body.search(LOCAL_SCRIPTS);
    assert.ok(pre < first, `step "${s.name}" runs its script before the preflight`);
  }
});

test("the migration replay is discovery: after the data proof, never a gate, continue-on-error mode, replay_check only", () => {
  const names = steps().map((s) => s.name);
  const replay = steps().find((s) => /Replay the migration files/.test(s.name));
  assert.ok(replay);
  assert.match(replay.body, /continue-on-error: true/);
  assert.match(replay.body, /--continue-on-error/);
  assert.match(replay.body, /--db-url "\$PROOF_REPLAY_DB_URL"/);
  assert.doesNotMatch(replay.body, /--db-url "\$PROOF_DB_URL"/);
  assert.ok(names.findIndex((n) => /Replay the migration files/.test(n)) > names.findIndex((n) => /Run the attack suite/.test(n)), "the replay must follow the data proof");
  assert.ok(names.findIndex((n) => /Create the empty replay_check/.test(n)) < names.findIndex((n) => /Apply the production schema dump/.test(n)), "replay_check must be made before the dump is applied");
  const diff = steps().find((s) => /Compare the replayed schema/.test(s.name));
  assert.match(diff.body, /continue-on-error: true/);
});

test("the production schema is applied to the local stack before the subset load", () => {
  const names = steps().map((s) => s.name);
  assert.ok(names.findIndex((n) => /Apply the production schema dump/.test(n)) < names.findIndex((n) => /Load the subset/.test(n)));
  assert.match(TEXT, /rm -rf "\$RUNNER_TEMP\/schema-dump"/);
});

test("the subset never leaves the job: it is not under the workspace and not in an uploaded path", () => {
  assert.match(TEXT, /CHAIN_PROOF_SUBSET=\$RUNNER_TEMP\/subset/);
  const upload = steps().find((s) => /Upload the run artifact/.test(s.name));
  assert.ok(upload);
  assert.doesNotMatch(upload.body, /subset|scripts\/tmp|_snapshots/);
  assert.match(upload.body, /retention-days: 7/);
  assert.match(TEXT, /rm -rf .*CHAIN_PROOF_SUBSET/);
});

test("the stack starts from a scratch directory holding only the config, never from the migrations directory", () => {
  const start = steps().find((s) => /Start the local stack/.test(s.name));
  assert.match(start.body, /cp fsi-app\/supabase\/config\.toml "\$CHAIN_PROOF_STACK\/supabase\/config\.toml"/);
  assert.match(start.body, /cd "\$CHAIN_PROOF_STACK"/);
  assert.doesNotMatch(start.body, /migrations/);
});
