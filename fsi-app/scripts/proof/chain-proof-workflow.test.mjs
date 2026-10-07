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

test("the only secrets referenced are the two read credentials, and only in the export step", () => {
  const refs = [...TEXT.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(refs)].sort(), ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
  const holders = steps().filter((s) => /secrets\.[A-Z]/.test(s.body));
  assert.equal(holders.length, 1, "more than one step references a secret");
  assert.match(holders[0].name, /Export the production subset/);
  assert.doesNotMatch(holders[0].body, /CHAIN_PROOF_ENV/, "the export step must not source the local env file");
});

test("no forbidden credential name appears as a secret, an env key, or a GitHub token anywhere in the file", () => {
  const code = TEXT.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
  for (const name of FORBIDDEN_NAMES) assert.ok(!code.includes(name), `${name} referenced in the workflow`);
  assert.doesNotMatch(code, /github\.token|GITHUB_TOKEN|GH_TOKEN|gh workflow run/);
});

test("every step that touches the local database sources the local env and runs the preflight first", () => {
  const touching = steps().filter((s) => /scripts\/proof\/(replay-migrations|run-lane-step|export-local-harness-runs)\.mjs/.test(s.body) && !/Export the production subset/.test(s.name));
  assert.ok(touching.length >= 5, `expected the replay, load, chain, attack and ledger steps, got ${touching.length}`);
  for (const s of touching) {
    const src = s.body.indexOf('. "$CHAIN_PROOF_ENV"');
    const pre = s.body.indexOf("scripts/proof/preflight.mjs");
    assert.ok(src >= 0 && pre > src, `step "${s.name}" does not source the local env then preflight`);
    const first = s.body.search(/scripts\/proof\/(replay-migrations|run-lane-step|export-local-harness-runs)\.mjs/);
    assert.ok(pre < first, `step "${s.name}" runs its script before the preflight`);
  }
});

test("the subset never leaves the job: it is not under the workspace and not in an uploaded path", () => {
  assert.match(TEXT, /CHAIN_PROOF_SUBSET=\$RUNNER_TEMP\/subset/);
  const upload = steps().find((s) => /Upload the run artifact/.test(s.name));
  assert.ok(upload);
  assert.doesNotMatch(upload.body, /subset|scripts\/tmp|_snapshots/);
  assert.match(upload.body, /retention-days: 7/);
  assert.match(TEXT, /rm -rf "\$CHAIN_PROOF_SUBSET"/);
});

test("the stack starts from a scratch directory holding only the config, never from the migrations directory", () => {
  const start = steps().find((s) => /Start the local stack/.test(s.name));
  assert.match(start.body, /cp fsi-app\/supabase\/config\.toml "\$CHAIN_PROOF_STACK\/supabase\/config\.toml"/);
  assert.match(start.body, /cd "\$CHAIN_PROOF_STACK"/);
  assert.doesNotMatch(start.body, /migrations/);
});
