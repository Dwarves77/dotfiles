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

test("the only secrets referenced are the two existing production names, and only in the export step", () => {
  const refs = [...TEXT.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(refs)].sort(), ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_DB_PASSWORD"]);
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

const LOCAL_SCRIPTS = /scripts\/proof\/(replay-migrations|run-lane-step|export-local-harness-runs|apply-schema-dump|schema-diff|create-oracle-db)\.mjs/;

test("every step that touches the local database sources the local env and runs the preflight first", () => {
  const touching = steps().filter((s) => LOCAL_SCRIPTS.test(s.body) && !/Export the production schema dump/.test(s.name));
  assert.ok(touching.length >= 8, `expected oracle_check, replay, oracle apply, oracle gate, load, chain, attacks and ledger steps, got ${touching.length}`);
  for (const s of touching) {
    const src = s.body.indexOf('. "$CHAIN_PROOF_ENV"');
    const pre = s.body.indexOf("scripts/proof/preflight.mjs");
    assert.ok(src >= 0 && pre > src, `step "${s.name}" does not source the local env then preflight`);
    const first = s.body.search(LOCAL_SCRIPTS);
    assert.ok(pre < first, `step "${s.name}" runs its script before the preflight`);
  }
});

test("the replay builds the proof schema and is a gate: first, no continue-on-error anywhere, stops at the first error", () => {
  const names = steps().map((n) => n.name);
  const replay = steps().find((n) => /Replay the migration files/.test(n.name));
  assert.ok(replay);
  const code = TEXT.split(String.fromCharCode(10)).filter((l) => !l.trim().startsWith("#")).join(String.fromCharCode(10));
  assert.doesNotMatch(code, /continue-on-error/, "no step or flag may continue on error");
  assert.doesNotMatch(code, /replay_continue_on_error|replay-tolerate/);
  assert.doesNotMatch(replay.body, /--db-url/, "the replay builds the stack's own database (PROOF_DB_URL), never another");
  assert.ok(names.findIndex((n) => /Replay the migration files/.test(n)) < names.findIndex((n) => /Export the production schema dump/.test(n)), "the replay must run before any production credential is used");
  assert.ok(names.findIndex((n) => /Create the empty oracle_check/.test(n)) < names.findIndex((n) => /Replay the migration files/.test(n)), "oracle_check must be made before the replay builds anything");
});

test("the schema oracle gate compares the replayed schema with the dump and sits before the subset load", () => {
  const names = steps().map((n) => n.name);
  const apply = names.findIndex((n) => /Apply the production schema dump to oracle_check/.test(n));
  const gate = names.findIndex((n) => /Schema oracle gate/.test(n));
  const load = names.findIndex((n) => /Load the subset/.test(n));
  assert.ok(apply >= 0 && gate > apply && load > gate, "order must be apply dump, oracle gate, load");
  const g = steps()[gate];
  assert.match(g.body, /schema-diff\.mjs --replayed "\$PROOF_DB_URL" --oracle "\$PROOF_ORACLE_DB_URL"/);
  const ap = steps()[apply];
  assert.match(ap.body, /apply-schema-dump\.mjs --db-url "\$PROOF_ORACLE_DB_URL"/);
  assert.doesNotMatch(TEXT.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n"), /apply-schema-dump\.mjs[^\n]*PROOF_DB_URL/, "the dump must never be applied to the replayed database");
  assert.match(TEXT, /rm -rf "\$RUNNER_TEMP\/schema-dump"/);
});

test("the expected-red state and the gate that lifts it are stated in the workflow header", () => {
  const head = TEXT.slice(0, TEXT.indexOf("\non:"));
  assert.match(head, /EXPECTED STATE: RED/);
  assert.match(head, /MIG-HIST-1/);
  assert.match(head, /APPLIED-MAP.json/);
  assert.match(head, /empty schema diff/);
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


test("the export step's secrets are step-scoped (no workflow or job level env), and every later step preflights before its script", () => {
  // no env: block at workflow or job level (indentation 0 or 4)
  assert.doesNotMatch(TEXT, /^env:/m, "workflow-level env present");
  assert.doesNotMatch(TEXT, /^ {4}env:/m, "job-level env present");
  const all = steps();
  const exp = all.findIndex((s) => /Export the production schema dump/.test(s.name));
  assert.ok(exp >= 0);
  assert.match(all[exp].body, /\n {8}env:\n {10}NEXT_PUBLIC_SUPABASE_URL: \$\{\{ secrets\.NEXT_PUBLIC_SUPABASE_URL \}\}\n {10}SUPABASE_DB_PASSWORD: \$\{\{ secrets\.SUPABASE_DB_PASSWORD \}\}\n/);
  assert.doesNotMatch(all[exp].body, /SUPABASE_SERVICE_ROLE_KEY/, "the export step needs only the URL and the database password");
  // ordering: every step after the export that runs a proof script against the local stack preflights first, so a
  // production host or SUPABASE_DB_PASSWORD left in the job env would fail the preflight there (it refuses both)
  const after = all.slice(exp + 1).filter((s) => LOCAL_SCRIPTS.test(s.body));
  assert.ok(after.length >= 5, "expected the oracle, load, chain, attacks and ledger steps after the export");
  for (const s of after) {
    const pre = s.body.indexOf("scripts/proof/preflight.mjs");
    const first = s.body.search(LOCAL_SCRIPTS);
    assert.ok(pre >= 0 && pre < first, `step "${s.name}" does not preflight before its script`);
  }
  assert.ok(FORBIDDEN_NAMES.includes("SUPABASE_DB_PASSWORD"), "the preflight must keep refusing SUPABASE_DB_PASSWORD");
});

test("the export step pins the smallest committed record-briefs batch and the load step reads the subset it wrote", () => {
  const exp = steps().find((s) => /Export the production schema dump/.test(s.name));
  assert.match(exp.body, /export-subset\.mjs[^\n]*--pin-ids-from scripts\/turns\/record-briefs\/batches\/record-briefs-009b-tool\.json/);
  const load = steps().find((s) => /Load the subset/.test(s.name));
  assert.match(load.body, /load-subset\.mjs[^\n]*--in "\$CHAIN_PROOF_SUBSET"/);
  assert.match(load.body, /\. "\$CHAIN_PROOF_ENV"/);
});
