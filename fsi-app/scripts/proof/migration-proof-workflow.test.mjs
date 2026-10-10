/** Static proof of the migration-proof workflow's contract (lane MIG-CI, 2026-10-08). It reads the committed
 *  workflow text and asserts what must stay true however the file is edited later: it is a required-check candidate
 *  (every pull_request, no path filter, a fixed job name), it never touches production (no secret, contents: read, no
 *  export step), the stack steps are the shared composite action and are skipped when no migration changed, the
 *  replay precedes the apply, and every step that reaches the local database preflights first. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FORBIDDEN_NAMES } from "./preflight.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", "..");
const TEXT = readFileSync(resolve(ROOT, ".github", "workflows", "migration-proof.yml"), "utf8");
const CODE = TEXT.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");

/** Split the steps: each starts at a line `      - name:` (6 spaces). */
function steps() {
  const parts = TEXT.split(/^\s{6}- name: /m).slice(1);
  return parts.map((p) => ({ name: p.split("\n")[0], body: p }));
}
const step = (re) => steps().find((s) => re.test(s.name));

const TOUCHED = "if: steps.scope.outputs.touched == 'true'";

test("required-check shape: every pull_request to master, no path filter, no other trigger, one job with the fixed context name", () => {
  const on = TEXT.slice(TEXT.indexOf("\non:"), TEXT.indexOf("\npermissions:"));
  assert.match(on, /pull_request:\n\s+branches:\n\s+- master/);
  for (const t of ["paths:", "paths-ignore:", "schedule:", "workflow_dispatch:", "workflow_run:", "push:"]) assert.ok(!on.includes(t), `trigger or filter ${t} present`);
  assert.match(CODE, /^name: Migration proof$/m);
  assert.match(CODE, /^jobs:\n {2}migration-proof:\n {4}name: Migration proof \(apply on a local stack\)$/m);
  assert.equal([...CODE.matchAll(/^ {2}[a-z][a-z0-9-]*:$/gm)].length, 1, "exactly one job: the check context must stay unambiguous");
  assert.doesNotMatch(CODE, /^ {4}if:/m, "a job-level if would skip the job and leave a required check unreported");
});

test("never touches production: contents: read, no secret, no forbidden credential name, no environment, no export or oracle step, no GitHub token use", () => {
  assert.match(CODE, /^permissions:\n {2}contents: read\n/m);
  assert.doesNotMatch(CODE, /^\s*(actions|id-token|pull-requests|issues|statuses|packages|checks): write/m);
  assert.doesNotMatch(CODE, /secrets\./);
  assert.doesNotMatch(CODE, /^\s+environment:/m);
  assert.doesNotMatch(CODE, /^env:/m);
  assert.doesNotMatch(CODE, /^ {4}env:/m);
  for (const name of FORBIDDEN_NAMES) assert.ok(!CODE.includes(name), `${name} referenced`);
  assert.doesNotMatch(CODE, /github\.token|GITHUB_TOKEN|GH_TOKEN|gh workflow run/);
  assert.doesNotMatch(CODE, /dump-production-schema|export-subset|oracle|apply-schema-dump|load-subset/);
  assert.doesNotMatch(CODE, /schema-diff\.mjs.*--(replayed|oracle)/, "only the read-only --catalog-only entry of schema-diff may run here, never the oracle comparison");
});

test("the touched-migration decision is made inside the job from the merge commit's diff against its base parent, and fails toward running", () => {
  const scope = step(/Did this pull request touch a migration/);
  assert.ok(scope);
  assert.match(scope.body, /id: scope/);
  assert.match(scope.body, /git diff --name-only HEAD\^1 HEAD -- fsi-app\/supabase\/migrations/);
  assert.match(scope.body, /HEAD\^1 HEAD -- fsi-app\/supabase\/migrations fsi-app\/scripts\/proof\)/, "a pull request that changes the proof harness also runs the stack steps (rule 15: the catalog query is exercised by the PR that edits it)");
  assert.match(scope.body, /rev-parse --verify --quiet 'HEAD\^2'/);
  assert.match(scope.body, /touched=true/);
  assert.match(scope.body, /touched=false/);
  const checkout = step(/Checkout repository/);
  assert.match(checkout.body, /fetch-depth: 2/);
  const names = steps().map((s) => s.name);
  assert.ok(names.findIndex((n) => /Checkout repository/.test(n)) < names.findIndex((n) => /Did this pull request touch a migration/.test(n)));
});

test("every step after the decision is skipped when no migration changed, except none: the job still reports success on the fast path", () => {
  const all = steps();
  const at = all.findIndex((s) => /Did this pull request touch a migration/.test(s.name));
  const after = all.slice(at + 1);
  assert.ok(after.length >= 6);
  for (const s of after) {
    assert.match(s.body, /\n {8}if: (always\(\) && )?steps\.scope\.outputs\.touched == 'true'\n/, `step "${s.name}" is not gated on the touched decision`);
  }
  assert.ok(TEXT.includes(TOUCHED));
});

test("the stack comes from the shared composite action with the stack's own scratch paths, never an inline copy", () => {
  const start = step(/Start the local stack/);
  assert.match(start.body, /uses: \.\/\.github\/actions\/local-stack/);
  assert.match(start.body, /stack_dir: \$\{\{ env\.MP_STACK \}\}/);
  assert.match(start.body, /env_file: \$\{\{ env\.MP_ENV \}\}/);
  assert.doesNotMatch(CODE, /supabase start|supabase status|write-local-env\.mjs|setup-cli/);
  assert.match(CODE, /MP_STACK=\$RUNNER_TEMP\/migration-proof-stack/);
});

test("the applied set replays first, then the pending set applies; both preflight against the local env before their script", () => {
  const names = steps().map((s) => s.name);
  const stack = names.findIndex((n) => /Start the local stack/.test(n));
  const replay = names.findIndex((n) => /Replay the applied migration files/.test(n));
  const apply = names.findIndex((n) => /Apply every pending migration/.test(n));
  assert.ok(stack >= 0 && replay > stack && apply > replay, "order must be stack, replay, apply");
  const r = steps()[replay];
  const a = steps()[apply];
  assert.match(r.body, /node scripts\/proof\/replay-migrations\.mjs --report "\$MP_OUT_DIR\/replay-report\.json"/);
  assert.match(a.body, /node scripts\/proof\/apply-pending-migrations\.mjs --apply --report "\$MP_OUT_DIR\/apply-report\.json"/);
  for (const s of [r, a]) {
    assert.match(s.body, /set -o pipefail/, `step "${s.name}" pipes to tee without pipefail: a failure would be swallowed`);
    const src = s.body.indexOf('. "$MP_ENV"');
    const pre = s.body.indexOf("scripts/proof/preflight.mjs");
    const script = s.body.search(/scripts\/proof\/(replay-migrations|apply-pending-migrations)\.mjs/);
    assert.ok(src >= 0 && pre > src && script > pre, `step "${s.name}" must source the local env, preflight, then run its script`);
    assert.doesNotMatch(s.body, /--db-url/, "the stack's own database (PROOF_DB_URL) is the only target");
  }
  assert.doesNotMatch(CODE, /continue-on-error/, "no step may continue on error");
});

test("the reports are uploaded and the stack is stopped on every run that started one, and the env file is deleted", () => {
  const up = step(/Upload the proof reports/);
  assert.match(up.body, /name: migration-proof-report/);
  assert.match(up.body, /path: \$\{\{ runner\.temp \}\}\/migration-proof-out/);
  assert.match(up.body, /retention-days: 7/);
  const stop = step(/Stop the local stack/);
  assert.match(stop.body, /supabase stop --no-backup/);
  assert.match(stop.body, /rm -f "\$MP_ENV"/);
});

test("pull requests supersede each other (concurrency) and the job has a time limit", () => {
  assert.match(CODE, /concurrency:\n {2}group: \$\{\{ github\.workflow \}\}-\$\{\{ github\.event\.pull_request\.number \}\}\n {2}cancel-in-progress: true/);
  assert.match(CODE, /timeout-minutes: 30/);
});

test("the header states what it proves, that production apply follows a green job, and the by-design cost of a failing pending migration", () => {
  const head = TEXT.slice(0, TEXT.indexOf("\non:"));
  assert.match(head, /WHAT THIS PROVES/);
  assert.match(head, /Production apply follows a green job/);
  assert.match(head, /fails EVERY migration\s+#\s+PR until that migration reaches production, by design/);
  assert.match(head, /REQUIRED CHECK, NO PATH FILTER/);
  assert.match(head, /Migration proof \(apply on a local stack\)/);
});

test("PROOF-9 rule 15: the catalog query runs on the replayed stack on every PR that reaches it, after the replay, read-only, preflighted, against PROOF_DB_URL only", () => {
  const names = steps().map((s) => s.name);
  const replay = names.findIndex((n) => /Replay the applied migration files/.test(n));
  const cat = names.findIndex((n) => /schema catalog query on the replayed stack/.test(n));
  const apply = names.findIndex((n) => /Apply every pending migration/.test(n));
  assert.ok(cat > replay && cat < apply, "the catalog step comes after the replay and before the pending apply");
  const c = steps()[cat];
  assert.match(c.body, /\n {8}if: steps\.scope\.outputs\.touched == 'true'\n/);
  assert.match(c.body, /set -o pipefail/);
  const src = c.body.indexOf('. "$MP_ENV"');
  const pre = c.body.indexOf("scripts/proof/preflight.mjs");
  const run = c.body.indexOf("scripts/proof/schema-diff.mjs");
  assert.ok(src >= 0 && pre > src && run > pre, "source the local env, preflight, then run schema-diff");
  assert.match(c.body, /node scripts\/proof\/schema-diff\.mjs --catalog-only --db-url "\$PROOF_DB_URL"/);
  assert.doesNotMatch(c.body, /--oracle|--replayed|PROOF_ORACLE_DB_URL/);
});

test("PROOF-9 ATTACK: removing the catalog step, moving it before the replay, or dropping its preflight is caught", () => {
  const check = (text) => {
    const parts = text.split(/^\s{6}- name: /m).slice(1).map((p) => ({ name: p.split("\n")[0], body: p }));
    const names = parts.map((p) => p.name);
    const replay = names.findIndex((n) => /Replay the applied migration files/.test(n));
    const cat = names.findIndex((n) => /schema catalog query on the replayed stack/.test(n));
    if (cat < 0 || cat < replay) return false;
    const b = parts[cat].body;
    return b.indexOf("scripts/proof/preflight.mjs") >= 0 && b.indexOf("scripts/proof/preflight.mjs") < b.indexOf("schema-diff.mjs");
  };
  assert.equal(check(TEXT), true, "the committed workflow passes the check");
  const start = TEXT.indexOf("      - name: Run the schema catalog query");
  const end = TEXT.indexOf("      # Every migration production has not applied");
  assert.ok(start > 0 && end > start);
  assert.equal(check(TEXT.slice(0, start) + TEXT.slice(end)), false, "step removed");
  const block = TEXT.slice(start, end);
  const replayAt = TEXT.indexOf("      # The applied set, per APPLIED-MAP.json");
  assert.ok(replayAt > 0 && replayAt < start);
  assert.equal(check(TEXT.slice(0, replayAt) + block + TEXT.slice(replayAt, start) + TEXT.slice(end)), false, "step before the replay");
  assert.equal(check(TEXT.replace(block, block.replace("          node scripts/proof/preflight.mjs\n", ""))), false, "preflight dropped");
});
