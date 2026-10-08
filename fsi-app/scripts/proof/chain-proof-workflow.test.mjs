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

const LOCAL_SCRIPTS = /scripts\/proof\/(replay-migrations|run-lane-step|export-local-harness-runs|apply-schema-dump|schema-diff|create-oracle-db)\.mjs/;

test("every step that touches the local database sources the local env and runs the preflight first", () => {
  const touching = steps().filter((s) => LOCAL_SCRIPTS.test(s.body) && !/Export the production schema dump/.test(s.name));
  assert.ok(touching.length >= 8, `expected oracle_check, replay, oracle apply, oracle gate, load, chain, attacks and ledger steps, got ${touching.length}`);
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

function isolationProblems(text) {
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
  if (!stepList.some((s) => /^Preflight/.test(s.name) && /node scripts\/proof\/preflight\.mjs/.test(codeOf(s.body)))) problems.push("the Preflight step is missing or only a comment (CP-7)");
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
  caught("CP-7 preflight step", TEXT.replace("          node scripts/proof/preflight.mjs\n\n      # Made BEFORE", "          # node scripts/proof/preflight.mjs\n\n      # Made BEFORE"), /no preflight line outside a comment|Preflight step is missing/);
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
