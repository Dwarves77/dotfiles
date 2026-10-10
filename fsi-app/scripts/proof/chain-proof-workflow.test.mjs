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
import { buildLocalEnv, parseStatusEnv, SUPERUSER_ROLE, ORACLE_PORT } from "./write-local-env.mjs";
import { ORACLE_CONTAINER } from "./create-oracle-db.mjs";
import { psqlArgs } from "./apply-schema-dump.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const TEXT = readFileSync(resolve(HERE, "..", "..", "..", ".github", "workflows", "chain-proof.yml"), "utf8");

/** A text with its comment lines removed: an ordering check or a secret scan that reads comments is satisfied by
 *  a commented-out line (AUD-AT-5 CP-7). */
function codeOf(text) {
  return text.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
}

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

const LOCAL_SCRIPTS = /scripts\/proof\/(replay-migrations|run-lane-step|export-local-harness-runs|apply-schema-dump|schema-diff|create-oracle-db|dump-roles)\.mjs/;

test("every step that touches the local database sources the local env and runs the preflight first", () => {
  const touching = steps().filter((s) => LOCAL_SCRIPTS.test(s.body) && !/Export the production schema dump/.test(s.name));
  assert.ok(touching.length >= 8, `expected oracle start, replay, oracle apply, oracle gate, load, chain, attacks and ledger steps, got ${touching.length}`);
  for (const s of touching) {
    const src = codeOf(s.body).indexOf('. "$CHAIN_PROOF_ENV"');
    const pre = codeOf(s.body).indexOf("scripts/proof/preflight.mjs");
    assert.ok(src >= 0 && pre > src, `step "${s.name}" does not source the local env then preflight`);
    const first = codeOf(s.body).search(LOCAL_SCRIPTS);
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
  assert.ok(names.findIndex((n) => /Start the oracle cluster/.test(n)) < names.findIndex((n) => /Replay the migration files/.test(n)), "the oracle cluster must be started before the replay builds anything");
});

test("the schema oracle gate compares the replayed schema with the dump and sits before the subset load", () => {
  const names = steps().map((n) => n.name);
  const apply = names.findIndex((n) => /Apply the production schema dump to the oracle cluster/.test(n));
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

const ACTION = readFileSync(resolve(HERE, "..", "..", "..", ".github", "actions", "local-stack", "action.yml"), "utf8");

test("the stack steps are the shared local-stack composite action (one site), not an inline copy", () => {
  const start = steps().find((s) => /Start the local stack/.test(s.name));
  assert.match(start.body, /uses: \.\/\.github\/actions\/local-stack/);
  assert.match(start.body, /stack_dir: \$\{\{ env\.CHAIN_PROOF_STACK \}\}/);
  assert.match(start.body, /env_file: \$\{\{ env\.CHAIN_PROOF_ENV \}\}/);
  assert.doesNotMatch(TEXT, /supabase start|supabase status|write-local-env\.mjs|setup-cli/, "the stack steps must live only in the composite action");
});

test("the composite action starts the stack from a scratch directory holding only the config, never from the migrations directory", () => {
  assert.match(ACTION, /cp fsi-app\/supabase\/config\.toml "\$STACK_DIR\/supabase\/config\.toml"/);
  assert.match(ACTION, /cd "\$STACK_DIR"\n\s+supabase start/);
  assert.doesNotMatch(ACTION, /supabase\/migrations/, "the stack must never be started from, or pointed at, the migrations directory");
  // the action writes the env file, then preflights it, in that order, and is free of any secret
  assert.ok(ACTION.lastIndexOf("write-local-env.mjs") < ACTION.lastIndexOf("scripts/proof/preflight.mjs"));
  assert.doesNotMatch(ACTION, /secrets\./);
  const code = ACTION.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
  for (const name of FORBIDDEN_NAMES) assert.ok(!code.includes(name), `${name} referenced in the composite action`);
});

// STACK-1 (2026-10-10): the Supabase CLI is pinned to an exact release and the one version lookup that remains is
// authenticated. "latest" made every stack job depend on an anonymous GitHub API call (rate limited, run 38019007029)
// and on silent CLI version drift (the CLI decides the stack image tags).
function cliPinProblems(action) {
  const problems = [];
  const code = action.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
  const step = code.match(/uses: supabase\/setup-cli@v1\n\s+with:\n((?:\s{8}.*\n?)+)/);
  if (!step) return ["the Install the Supabase CLI step (supabase/setup-cli@v1 with: block) is missing"];
  const version = (step[1].match(/^\s+version:\s*(\S+)\s*$/m) || [])[1];
  if (!version || !/^v?\d+\.\d+\.\d+$/.test(version)) problems.push(`the CLI version must be a literal semver, got ${JSON.stringify(version)} (never latest)`);
  const token = (step[1].match(/^\s+github-token:\s*(.+?)\s*$/m) || [])[1];
  if (token !== "${{ github.token }}") problems.push(`github-token must be github.token, got ${JSON.stringify(token)}`);
  if (!/^\s*#.*\b\d{4}-\d{2}-\d{2}\b.*\bpin/im.test(action)) problems.push("a dated comment stating the pin and that bumping it is a deliberate PR is missing");
  return problems;
}

test("the composite action pins the Supabase CLI to an exact release and authenticates the lookup", () => {
  assert.deepEqual(cliPinProblems(ACTION), []);
});

test("attack: version latest, a range, a missing version or a missing token is red", () => {
  assert.ok(cliPinProblems(ACTION.replace(/version: \S+/, "version: latest")).some((p) => /literal semver/.test(p)));
  assert.ok(cliPinProblems(ACTION.replace(/version: \S+/, "version: 2.x")).some((p) => /literal semver/.test(p)));
  assert.ok(cliPinProblems(ACTION.replace(/\n\s+version: \S+/, "")).some((p) => /literal semver/.test(p)));
  assert.ok(cliPinProblems(ACTION.replace(/\n\s+github-token: .*/, "")).some((p) => /github-token/.test(p)));
  assert.ok(cliPinProblems(ACTION.replace("github-token: ${{ github.token }}", "github-token: ${{ secrets.X }}")).some((p) => /github-token/.test(p)));
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
    const pre = codeOf(s.body).indexOf("scripts/proof/preflight.mjs");
    const first = codeOf(s.body).search(LOCAL_SCRIPTS);
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

// ── lane GATE-9 (2026-10-08, AUD-AT-5 CP-1 to CP-7, JIF): the isolation contract in forms the tests above did not list ──
// One checker, run over the committed text (must hold) and over a mutation per attack (must be caught), so a check
// that stops detecting its attack fails here.

const EXPORT_NAME = /Export the production schema dump/;
const ALLOWED_STEP_IFS = new Set(["always() && steps.stack.outcome == 'success'", "always()"]);
const UPLOAD_PATH = "${{ runner.temp }}/chain-proof-out";

function isolationProblems(text, action = ACTION) {
  const problems = [];
  const code = codeOf(text);
  // CP-3: the trigger block is workflow_dispatch and nothing else, whatever other trigger name an edit invents
  const on = text.slice(text.indexOf("\non:") + 1, text.indexOf("\npermissions:"));
  if (on.trim() !== "on:\n  workflow_dispatch: {}") problems.push(`the on: block must be exactly workflow_dispatch: {} (CP-3), got ${JSON.stringify(on.trim())}`);
  // CP-2: one permissions block, top level, contents: read, and nothing at job or step level
  const perms = [...code.matchAll(/^([ \t]*)permissions:/gm)];
  if (perms.length !== 1 || perms[0][1] !== "") problems.push("permissions: must appear once, at the top level (CP-2: a job-level block can grant more)");
  // CP-1, CP-4: secrets are referenced only as secrets.NAME, only the two production names, only in the export step
  const secretWords = [...code.matchAll(/\bsecrets\b/g)].length;
  const secretRefs = [...code.matchAll(/\bsecrets\.([A-Z0-9_]+)/g)].map((m) => m[1]).sort();
  if (secretWords !== secretRefs.length) problems.push("secrets is referenced in a form other than secrets.NAME (CP-1 secrets['X'], CP-4 toJSON(secrets))");
  if (JSON.stringify(secretRefs) !== JSON.stringify(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_DB_PASSWORD"])) problems.push(`the secret references are ${JSON.stringify(secretRefs)}`);
  const stepList = text.split(/^\s{6}- name: /m).slice(1).map((p) => ({ name: p.split("\n")[0], body: p }));
  for (const s of stepList) {
    if (/\bsecrets\b/.test(codeOf(s.body)) && !EXPORT_NAME.test(s.name)) problems.push(`step "${s.name}" references secrets (CP-1, CP-4)`);
  }
  if (/\bgithub\.token\b|GITHUB_TOKEN|GH_TOKEN|toJSON\(\s*(env|github|vars)\s*\)/.test(code)) problems.push("a GitHub token or a whole context is exposed");
  // CP-5: the one upload path
  const upload = stepList.find((s) => /Upload the run artifact/.test(s.name));
  const pathLine = upload ? (codeOf(upload.body).match(/^\s+path:\s*(.+)$/m) || [])[1]?.trim() : null;
  if (pathLine !== UPLOAD_PATH) problems.push(`the artifact upload path must be exactly ${UPLOAD_PATH}, got ${JSON.stringify(pathLine)} (CP-5: a parent of the dump and the subset leaks them)`);
  // CP-7: the preflight is code, in every step that touches the local stack
  for (const s of stepList) {
    if (LOCAL_SCRIPTS.test(s.body) && !EXPORT_NAME.test(s.name) && !/preflight\.mjs/.test(codeOf(s.body))) problems.push(`step "${s.name}" has no preflight line outside a comment (CP-7)`);
  }
  // The stack steps live in the shared composite action (lane MIG-CI-2): the Preflight step is either inline or that
  // action's own Preflight step, and the workflow must use the action.
  const actionPreflight = /uses: \.\/\.github\/actions\/local-stack/.test(code) && /- name: Preflight[^\n]*\n(?:[^\n]*\n)*?[^\n]*node scripts\/proof\/preflight\.mjs/.test(codeOf(action));
  if (!actionPreflight && !stepList.some((s) => /^Preflight/.test(s.name) && /node scripts\/proof\/preflight\.mjs/.test(codeOf(s.body)))) problems.push("the Preflight step is missing or only a comment (CP-7)");
  // JIF, IFF: no job-level if, and a step if only in the two allowed forms
  if (/^ {4}if:/m.test(code)) problems.push("the chain-proof job carries an if (JIF): a job that can be skipped proves nothing");
  for (const m of code.matchAll(/^ {8}if:\s*(.+)$/gm)) {
    if (!ALLOWED_STEP_IFS.has(m[1].trim())) problems.push(`a step carries if: ${m[1].trim()} (IFF)`);
  }
  if (/continue-on-error/.test(code)) problems.push("continue-on-error appears (COE)");
  // VC-5 form: every multi-command run block starts with set -euo pipefail, the one pipe included
  for (const s of stepList) {
    const body = codeOf(s.body);
    const block = body.match(/^ {8}run: \|\n((?: {10}.*\n?)+)/m);
    const lines = block ? block[1].split("\n").map((l) => l.trim()).filter(Boolean) : [];
    const single = (body.match(/^ {8}run: (?!\|)(.+)$/m) || [])[1];
    if (lines.length > 1 && lines[0] !== "set -euo pipefail") problems.push(`step "${s.name}" does not start with set -euo pipefail`);
    if (/\+o pipefail|\|&/.test(body)) problems.push(`step "${s.name}" weakens pipefail`);
    if (single && /\|\s*tee\b/.test(single)) problems.push(`step "${s.name}" pipes into tee on one line with no pipefail`);
  }
  return problems;
}

const caught = (id, text, pattern) => {
  const problems = isolationProblems(text);
  assert.ok(problems.some((p) => pattern.test(p)), `${id}: not caught. problems: ${JSON.stringify(problems)}`);
};
const withEnvOnStep = (text, stepFragment, envLine) => text.replace(new RegExp(`(- name: [^\\n]*${stepFragment}[^\\n]*\\n)`), `$1        env:\n          ${envLine}\n`);

test("GATE-9: the committed chain-proof.yml satisfies the isolation checker (control)", () => {
  assert.deepEqual(isolationProblems(TEXT), []);
});

test("CP-1, CP-4: secrets['X'] bracket syntax and toJSON(secrets) on any step are caught", () => {
  caught("CP-1", withEnvOnStep(TEXT, "Load the subset", "EXFIL: ${{ secrets['SUPABASE_SERVICE_ROLE_KEY'] }}"), /secrets is referenced in a form other than secrets\.NAME/);
  caught("CP-4", withEnvOnStep(TEXT, "Load the subset", "ALLSEC: ${{ toJSON(secrets) }}"), /secrets is referenced in a form other than secrets\.NAME|references secrets/);
});

test("CP-2: a job-level permissions block (contents: write) is caught", () => {
  caught("CP-2", TEXT.replace("    timeout-minutes: 60\n", "    timeout-minutes: 60\n    permissions:\n      contents: write\n"), /permissions: must appear once/);
});

test("CP-3: an extra trigger of any name (repository_dispatch, workflow_call, issue_comment) is caught", () => {
  for (const trig of ["repository_dispatch: {}", "workflow_call: {}", "issue_comment: {}"]) {
    caught(`CP-3 ${trig}`, TEXT.replace("on:\n  workflow_dispatch: {}\n", `on:\n  workflow_dispatch: {}\n  ${trig}\n`), /on: block must be exactly workflow_dispatch/);
  }
});

test("CP-5: an upload path that is the whole runner temp, a parent of the dump, or a wildcard is caught", () => {
  for (const p of ["${{ runner.temp }}", "${{ runner.temp }}/", "${{ runner.temp }}/*", "${{ runner.temp }}/schema-dump", "${{ runner.temp }}/subset"]) {
    caught(`CP-5 ${p}`, TEXT.replace("path: ${{ runner.temp }}/chain-proof-out", `path: ${p}`), /artifact upload path must be exactly/);
  }
});

test("CP-7: a preflight line that is only a comment is caught, in the Preflight step and in any later step", () => {
  // the Preflight step lives in the composite action: a commented-out line there is caught
  assert.ok(isolationProblems(TEXT, ACTION.replace("        node scripts/proof/preflight.mjs", "        # node scripts/proof/preflight.mjs")).some((p) => /Preflight step is missing/.test(p)), "CP-7 preflight step in the composite action");
  caught("CP-7 gate step", TEXT.replace('          node scripts/proof/preflight.mjs\n          node scripts/proof/schema-diff.mjs', '          # node scripts/proof/preflight.mjs\n          node scripts/proof/schema-diff.mjs'), /no preflight line outside a comment/);
});

test("JIF, IFF, COE: a job-level if, a step if outside the two allowed forms, and continue-on-error are caught", () => {
  caught("JIF", TEXT.replace("    runs-on: ubuntu-latest\n    timeout-minutes: 60\n", "    if: false\n    runs-on: ubuntu-latest\n    timeout-minutes: 60\n"), /carries an if \(JIF\)/);
  caught("IFF", TEXT.replace("      - name: Schema oracle gate", "      - name: Schema oracle gate\n        if: false"), /a step carries if: false/);
  caught("COE", TEXT.replace("      - name: Schema oracle gate", "      - name: Schema oracle gate\n        continue-on-error: true"), /continue-on-error/);
});

test("VC-5 form: a run block without set -euo pipefail, a weakened pipefail, and the one-line tee pipe are caught", () => {
  caught("no pipefail", TEXT.replace("        run: |\n          set -euo pipefail\n          . \"$CHAIN_PROOF_ENV\"\n          node scripts/proof/preflight.mjs\n          node scripts/proof/schema-diff.mjs", "        run: |\n          . \"$CHAIN_PROOF_ENV\"\n          node scripts/proof/preflight.mjs\n          node scripts/proof/schema-diff.mjs"), /does not start with set -euo pipefail/);
  caught("+o", TEXT.replace("          set -euo pipefail\n          node scripts/proof/emit-chain-proof-artifact.mjs", "          set -u +o pipefail\n          node scripts/proof/emit-chain-proof-artifact.mjs"), /weakens pipefail|does not start with set -euo pipefail/);
  caught("tee one line", TEXT.replace('        run: |\n          set -euo pipefail\n          node scripts/proof/emit-chain-proof-artifact.mjs | tee -a "$GITHUB_STEP_SUMMARY"', '        run: node scripts/proof/emit-chain-proof-artifact.mjs | tee -a "$GITHUB_STEP_SUMMARY"'), /pipes into tee on one line/);
});

// ── lane PROOF-6 (2026-10-09): the schema oracle is a SECOND CLUSTER, applied as the superuser with ON_ERROR_STOP=1 ──
// chain-proof run 37876624407 failed the oracle step because the dump was applied by a non-owner role to a scratch
// database on the stack. One checker over the workflow text, one over the env the stack writes, and one over the
// scripts, each run on the committed state (must hold) and on a mutation per attack (must be caught).

const STATUS_FIXTURE = ['API_URL="http://127.0.0.1:54321"', 'DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"', 'SERVICE_ROLE_KEY="service-jwt"'].join("\n");

/** What the oracle URL must be, whatever the stack's URL is. */
function oracleEnvProblems(env) {
  const problems = [];
  const o = new URL(env.PROOF_ORACLE_DB_URL);
  const s = new URL(env.PROOF_DB_URL);
  if (o.username !== SUPERUSER_ROLE) problems.push(`the oracle URL connects as ${o.username}, not ${SUPERUSER_ROLE}`);
  if (o.pathname !== "/postgres") problems.push(`the oracle URL names database ${o.pathname}, not postgres`);
  if (o.hostname !== "127.0.0.1") problems.push("the oracle URL is not on the loopback host");
  if (!o.port || o.port === s.port) problems.push("the oracle URL is on the stack's own port, so it would be the replayed database");
  return problems;
}

/** What the workflow's oracle steps must be. */
function oracleWorkflowProblems(text) {
  const problems = [];
  const code = codeOf(text);
  const stepList = text.split(/^\s{6}- name: /m).slice(1).map((p) => ({ name: p.split("\n")[0], body: p }));
  const start = stepList.find((s) => /Start the oracle cluster/.test(s.name));
  const apply = stepList.find((s) => /Apply the production schema dump to the oracle cluster/.test(s.name));
  if (!start || !/node scripts\/proof\/create-oracle-db\.mjs\s*$/m.test(codeOf(start.body))) problems.push("the oracle cluster start step is missing or does not run create-oracle-db.mjs");
  if (!apply) problems.push("the oracle apply step is missing");
  else {
    const body = codeOf(apply.body);
    if (!/apply-schema-dump\.mjs --db-url "\$PROOF_ORACLE_DB_URL" --in "\$CHAIN_PROOF_SCHEMA_DUMP"/.test(body)) problems.push('the oracle apply step does not connect with --db-url "$PROOF_ORACLE_DB_URL"');
    if (/postgres(ql)?:\/\//.test(body)) problems.push("the oracle apply step names a connection URL literally (a hand-typed role or database)");
    if (/oracle_check|PROOF_DB_URL|SUPABASE_DB_URL|\b(authenticated|anon|service_role)\b/.test(body)) problems.push("the oracle apply step names the scratch database, the stack's URL or a lesser role");
    if (/\|\|\s*true|2>\s*\/dev\/null|\bgrep\s+-v\b|continue-on-error/.test(body)) problems.push("the oracle apply step filters or swallows errors");
  }
  if (/ON_ERROR_STOP\s*=\s*(0|off)\b/i.test(code)) problems.push("ON_ERROR_STOP is turned off");
  if (/supabase\/postgres:/.test(code)) problems.push("a database image tag is typed in the workflow; it must be read from the running stack");
  if (!code.includes(`docker rm -f ${ORACLE_CONTAINER}`)) problems.push("the oracle container is not removed in the teardown step");
  return problems;
}

/** What the scripts must do, from their source text and their pure argument builder. */
function oracleScriptProblems(applySrc, createSrc, args) {
  const problems = [];
  if (!args.includes("ON_ERROR_STOP=1") || args.includes("ON_ERROR_STOP=0")) problems.push("psql is not run with ON_ERROR_STOP=1");
  const code = (src) => src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  if (/ON_ERROR_STOP=0|stripOwnership|classifyErrors/.test(code(applySrc))) problems.push("apply-schema-dump.mjs strips, tolerates or classifies an error as non-fatal");
  if (/oracle_check|create database|template postgres/i.test(code(createSrc))) problems.push("create-oracle-db.mjs still makes a scratch database");
  if (/supabase\/postgres:\d|ecr\.aws\/supabase\/postgres:/.test(code(createSrc))) problems.push("create-oracle-db.mjs types an image tag");
  return problems;
}

const APPLY_SRC = readFileSync(resolve(HERE, "apply-schema-dump.mjs"), "utf8");
const CREATE_SRC = readFileSync(resolve(HERE, "create-oracle-db.mjs"), "utf8");
const caughtOracle = (id, problems, pattern) => assert.ok(problems.some((p) => pattern.test(p)), `${id}: not caught. problems: ${JSON.stringify(problems)}`);

test("PROOF-6: the committed workflow, the written env and the scripts satisfy the oracle contract (control)", () => {
  assert.deepEqual(oracleWorkflowProblems(TEXT), []);
  const env = buildLocalEnv(parseStatusEnv(STATUS_FIXTURE));
  assert.deepEqual(oracleEnvProblems(env), []);
  assert.equal(new URL(env.PROOF_ORACLE_DB_URL).port, String(ORACLE_PORT));
  assert.deepEqual(oracleScriptProblems(APPLY_SRC, CREATE_SRC, psqlArgs(env.PROOF_ORACLE_DB_URL, "/d.sql")), []);
});

test("PROOF-6 ATTACK: an oracle URL as a lesser role (authenticated, anon, postgres), in another database, or on the stack's port is red", () => {
  const env = buildLocalEnv(parseStatusEnv(STATUS_FIXTURE));
  const withUrl = (u) => oracleEnvProblems({ ...env, PROOF_ORACLE_DB_URL: u });
  for (const role of ["authenticated", "anon", "postgres"]) caughtOracle(role, withUrl(`postgresql://${role}:postgres@127.0.0.1:${ORACLE_PORT}/postgres`), /not supabase_admin/);
  caughtOracle("other database", withUrl(`postgresql://supabase_admin:postgres@127.0.0.1:${ORACLE_PORT}/oracle_check`), /not postgres/);
  caughtOracle("stack port", withUrl("postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres"), /stack's own port/);
});

test("PROOF-6 ATTACK: an oracle apply step that connects as the stack, as a lesser role or to another database is red", () => {
  // PROOF-7: the roles filter line also names --db-url "$PROOF_ORACLE_DB_URL"; the attack targets the dump apply's own occurrence.
  const apply = 'apply-schema-dump.mjs --db-url "$PROOF_ORACLE_DB_URL"';
  assert.ok(TEXT.includes(apply));
  const swap = (to) => TEXT.replace(apply, () => `apply-schema-dump.mjs ` + to);
  caughtOracle("stack URL", oracleWorkflowProblems(swap('--db-url "$PROOF_DB_URL"')), /does not connect with --db-url "\$PROOF_ORACLE_DB_URL"/);
  caughtOracle("authenticated", oracleWorkflowProblems(swap("--db-url postgresql://authenticated:x@127.0.0.1:54399/postgres")), /does not connect with|names a connection URL literally/);
  caughtOracle("anon", oracleWorkflowProblems(swap("--db-url postgresql://anon:x@127.0.0.1:54399/postgres")), /does not connect with|names a connection URL literally/);
  caughtOracle("scratch database", oracleWorkflowProblems(swap('--db-url "$PROOF_ORACLE_DB_URL" --note oracle_check')), /scratch database/);
});

test("PROOF-6 ATTACK: ON_ERROR_STOP off, an error filter on the apply, a typed image tag, a missing teardown or a missing start step is red", () => {
  caughtOracle("stop off", oracleWorkflowProblems(TEXT.replace('--in "$CHAIN_PROOF_SCHEMA_DUMP" --report', '--in "$CHAIN_PROOF_SCHEMA_DUMP" -v ON_ERROR_STOP=0 --report')), /ON_ERROR_STOP is turned off/);
  caughtOracle("|| true", oracleWorkflowProblems(TEXT.replace('--report "$CP_OUT_DIR/schema-apply-report.json"', '--report "$CP_OUT_DIR/schema-apply-report.json" || true')), /filters or swallows errors/);
  caughtOracle("image tag", oracleWorkflowProblems(TEXT.replace("          node scripts/proof/create-oracle-db.mjs\n", "          docker pull supabase/postgres:17.6.1.054\n          node scripts/proof/create-oracle-db.mjs\n")), /image tag is typed/);
  caughtOracle("no teardown", oracleWorkflowProblems(TEXT.replace("          docker rm -f chain-proof-oracle || true\n", "")), /not removed in the teardown/);
  caughtOracle("no start", oracleWorkflowProblems(TEXT.replace("Start the oracle cluster", "Start something else")), /start step is missing/);
});

test("PROOF-6 ATTACK: psql without ON_ERROR_STOP=1, or the old strip/classify/scratch-database code, is red", () => {
  const url = "postgresql://supabase_admin:postgres@127.0.0.1:54399/postgres";
  caughtOracle("stop=0", oracleScriptProblems(APPLY_SRC, CREATE_SRC, [url, "-X", "-v", "ON_ERROR_STOP=0", "-f", "/d.sql"]), /not run with ON_ERROR_STOP=1/);
  caughtOracle("no flag", oracleScriptProblems(APPLY_SRC, CREATE_SRC, [url, "-X", "-f", "/d.sql"]), /not run with ON_ERROR_STOP=1/);
  caughtOracle("strip", oracleScriptProblems(APPLY_SRC + "\nexport function stripOwnership() {}\n", CREATE_SRC, psqlArgs(url, "/d.sql")), /strips, tolerates or classifies/);
  caughtOracle("scratch db", oracleScriptProblems(APPLY_SRC, CREATE_SRC + '\nconst s = "create database oracle_check template postgres";\n', psqlArgs(url, "/d.sql")), /scratch database/);
});

test("PROOF-6: the teardown removes the oracle container named by create-oracle-db.mjs, and the workflow never stops the stack's own services for it", () => {
  assert.equal(ORACLE_CONTAINER, "chain-proof-oracle");
  const last = steps().at(-1);
  assert.match(last.name, /Stop the local stack/);
  assert.ok(last.body.includes(`docker rm -f ${ORACLE_CONTAINER}`));
});

// ── lane PROOF-7 (2026-10-09): production's roles are exported and applied to the oracle before the dump ────────
// chain-proof fire 6 (run 37894782168): the dump apply failed with exactly one error, role "reconciler" does not
// exist. pg_dump omits roles, so the roles file (names and attributes, no passwords) is exported in the credentialed
// step and applied first, as supabase_admin with ON_ERROR_STOP=1, in the oracle apply step.

/** What the roles export and the roles apply must be, from the workflow text and the roles script source. */
function rolesWorkflowProblems(text, rolesSrc) {
  const problems = [];
  const stepList = text.split(/^\s{6}- name: /m).slice(1).map((p) => ({ name: p.split("\n")[0], body: p }));
  const idx = (re) => stepList.findIndex((s) => re.test(s.name));
  const exp = stepList[idx(/Export the production schema dump/)];
  const apply = stepList[idx(/Apply the production schema dump to the oracle cluster/)];
  if (!exp || !/dump-roles\.mjs[^\n]*-- export --out /.test(codeOf(exp.body))) problems.push("the credentialed export step does not export the production roles (dump-roles.mjs export)");
  else {
    const body = codeOf(exp.body);
    const rolesAt = body.search(/dump-roles\.mjs/);
    const subsetAt = body.search(/export-subset\.mjs/);
    if (subsetAt >= 0 && rolesAt > subsetAt) problems.push("the roles export runs after the subset export");
  }
  if (!apply) problems.push("the oracle apply step is missing");
  else {
    const body = codeOf(apply.body);
    const filterAt = body.search(/dump-roles\.mjs filter /);
    const applyAt = body.search(/apply-schema-dump\.mjs/);
    if (filterAt < 0) problems.push("the oracle apply step does not filter the roles file against the oracle's own roles (dump-roles.mjs filter)");
    else if (applyAt >= 0 && filterAt > applyAt) problems.push("the roles filter runs after the dump apply: the roles file must precede the apply");
    if (!/apply-schema-dump\.mjs[^\n]*--roles "\$CP_OUT_DIR\/oracle-roles\.sql"/.test(body)) problems.push("the dump apply is not given the roles file (--roles): the roles are never applied first");
    if (!/dump-roles\.mjs filter [^\n]*--db-url "\$PROOF_ORACLE_DB_URL"/.test(body)) problems.push('the roles filter does not read the oracle with --db-url "$PROOF_ORACLE_DB_URL"');
  }
  if (idx(/Export the production schema dump/) >= idx(/Apply the production schema dump to the oracle cluster/)) problems.push("the roles export step does not precede the apply step");
  const src = rolesSrc.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  if (!/"--role-only"/.test(src)) problems.push("dump-roles.mjs does not pass --role-only to supabase db dump");
  if (!/spawn[(]"supabase", roleDumpArgs[(]/.test(src) || !/"db", "dump"/.test(src)) problems.push("dump-roles.mjs does not export through supabase db dump");
  if (/pg_dumpall/.test(src)) problems.push("dump-roles.mjs references pg_dumpall: a local client is not version-matched to the server, the export must run through supabase db dump");
  if (!/stripPasswords[(]/.test(src)) problems.push("dump-roles.mjs filter does not strip PASSWORD clauses");
  if (/\bconst\s+(EXISTING|IMAGE_ROLES|READY)[A-Z_]*\s*=\s*\[/.test(src) || /new Set\(\[\s*"postgres"/.test(src)) problems.push("dump-roles.mjs types the image's role list; it must be read from the oracle at run time");
  if (!/from pg_roles/.test(src)) problems.push("dump-roles.mjs does not read the oracle's roles from pg_roles");
  return problems;
}

const ROLES_SRC = readFileSync(resolve(HERE, "dump-roles.mjs"), "utf8");

test("PROOF-7: the committed workflow and dump-roles.mjs satisfy the roles contract (control)", () => {
  assert.deepEqual(rolesWorkflowProblems(TEXT, ROLES_SRC), []);
});

test("PROOF-7 ATTACK: no roles export step, an export after the subset, or an export that is not credentialed-step is red", () => {
  const exp = /node scripts\/proof\/run-lane-step\.mjs --name dump-production-roles[^\n]*\n/;
  assert.match(TEXT, exp);
  caughtOracle("no export", rolesWorkflowProblems(TEXT.replace(exp, ""), ROLES_SRC), /does not export the production roles/);
  const line = TEXT.match(exp)[0];
  const moved = TEXT.replace(line, "").replace(/(node scripts\/proof\/run-lane-step\.mjs --name export-subset[^\n]*\n)/, `$1          ${line.trim()}\n`);
  caughtOracle("after subset", rolesWorkflowProblems(moved, ROLES_SRC), /after the subset export/);
});

test("PROOF-7 ATTACK: an apply step with no roles filter, a filter after the apply, no --roles, or a filter not on the oracle is red", () => {
  const filter = /\n\s+node scripts\/proof\/dump-roles\.mjs filter [^\n]*/;
  assert.match(TEXT, filter);
  caughtOracle("no filter", rolesWorkflowProblems(TEXT.replace(filter, ""), ROLES_SRC), /does not filter the roles file/);
  caughtOracle("no --roles", rolesWorkflowProblems(TEXT.replace(' --roles "$CP_OUT_DIR/oracle-roles.sql"', ""), ROLES_SRC), /not given the roles file/);
  caughtOracle("filter on the stack", rolesWorkflowProblems(TEXT.replace(/(dump-roles\.mjs filter [^\n]*)--db-url "\$PROOF_ORACLE_DB_URL"/, '$1--db-url "$PROOF_DB_URL"'), ROLES_SRC), /does not read the oracle/);
  const fl = TEXT.match(filter)[0];
  const swapped = TEXT.replace(fl, "").replace(/(\n\s+node scripts\/proof\/apply-schema-dump\.mjs[^\n]*)/, `$1${fl}`);
  caughtOracle("filter after apply", rolesWorkflowProblems(swapped, ROLES_SRC), /filter runs after the dump apply/);
});

test("PROOF-7 ATTACK: dump-roles.mjs without --role-only, off supabase db dump, back on pg_dumpall, without the password strip, with a typed role list, or without pg_roles is red", () => {
  caughtOracle("role-only", rolesWorkflowProblems(TEXT, ROLES_SRC.replace('"--role-only", ', "")), /--role-only/);
  caughtOracle("not the cli", rolesWorkflowProblems(TEXT, ROLES_SRC.replace('spawn("supabase", roleDumpArgs(', 'spawn("pg_dump", roleDumpArgs(')), /through supabase db dump/);
  caughtOracle("pg_dumpall", rolesWorkflowProblems(TEXT, ROLES_SRC + '\nconst bin = "pg_dumpall";\n'), /references pg_dumpall/);
  caughtOracle("no strip", rolesWorkflowProblems(TEXT, ROLES_SRC.replace(/stripPasswords[(]/g, "keepPasswords(")), /strip PASSWORD/);
  caughtOracle("typed list", rolesWorkflowProblems(TEXT, ROLES_SRC + '\nconst EXISTING_ROLES = ["postgres", "anon"];\n'), /types the image's role list/);
  caughtOracle("no pg_roles", rolesWorkflowProblems(TEXT, ROLES_SRC.replace(/from pg_roles/g, "from nothing")), /pg_roles/);
});

test("PROOF-7: the roles export lives only in the credentialed step and the artifact carries the filtered roles file, never the raw dump", () => {
  const exportStep = steps().find((s) => /Export the production schema dump/.test(s.name));
  assert.match(codeOf(exportStep.body), /dump-roles\.mjs[^\n]*-- export --out "\$\(dirname "\$CHAIN_PROOF_SCHEMA_DUMP"\)\/production-roles\.sql"/);
  const rest = TEXT.replace(exportStep.body, "");
  assert.doesNotMatch(codeOf(rest), /dump-roles\.mjs[^\n]*\bexport\b/, "the export mode needs production credentials: only the export step may run it");
  assert.match(TEXT, /rm -rf "\$RUNNER_TEMP\/schema-dump"/, "the raw roles file sits beside the schema dump and is deleted with it");
  assert.match(TEXT, /--out "\$CP_OUT_DIR\/oracle-roles\.sql"/, "the filtered roles file goes to the out dir, which is the uploaded artifact");
});
