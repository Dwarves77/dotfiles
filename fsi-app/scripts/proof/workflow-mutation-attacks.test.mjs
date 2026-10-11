/** Mutation attacks on the stack workflows' shape tests (lane TESTS-2, 2026-10-10; AUD-AT-5 OWED-1 and OWED-8;
 *  CLAUDE.md rule 15: a guard is proven by attack, not by presence).
 *
 *  migration-proof-workflow.test.mjs and chain-proof-workflow.test.mjs read the committed workflow text and assert its
 *  contract. A shape test that passes is only a proof if it FAILS when the contract is broken, so this file breaks the
 *  contract on purpose: for each mutation it copies the shape test, the proof harness and the library it imports into a
 *  scratch tree beside a MUTATED copy of the workflow, runs the copied test in a child process, and requires the child
 *  to exit non-zero. The unmutated copy must pass first (the control), so a copy that cannot run at all is not read as
 *  a caught mutation. A mutation that does not change the text is itself a failure: the attack was not exercised.
 *
 *  The scratch tree lives under the operating system's temporary directory and is removed afterwards; nothing is
 *  written to the repository. Only node built-ins and relative imports are used (the no-npm suite). */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..");
const SCRATCH = mkdtempSync(join(tmpdir(), "wf-mutation-"));

before(() => {
  mkdirSync(join(SCRATCH, "fsi-app", "scripts"), { recursive: true });
  mkdirSync(join(SCRATCH, ".github", "workflows"), { recursive: true });
  mkdirSync(join(SCRATCH, ".github", "actions", "local-stack"), { recursive: true });
  cpSync(HERE, join(SCRATCH, "fsi-app", "scripts", "proof"), { recursive: true });
  cpSync(resolve(HERE, "..", "lib"), join(SCRATCH, "fsi-app", "scripts", "lib"), { recursive: true });
  cpSync(resolve(HERE, "..", "migrations"), join(SCRATCH, "fsi-app", "scripts", "migrations"), { recursive: true });
  // applied-map.mjs (imported by the chain-proof shape test) reads the migration tree's shared library
  mkdirSync(join(SCRATCH, "fsi-app", "supabase", "migrations"), { recursive: true });
  cpSync(resolve(HERE, "..", "..", "supabase", "migrations", "_lib"), join(SCRATCH, "fsi-app", "supabase", "migrations", "_lib"), { recursive: true });
});
after(() => { rmSync(SCRATCH, { recursive: true, force: true }); });

/** The child must not inherit the parent runner's test context, or it reports into the parent and exits 0 whatever it found. */
function childEnv() {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith("NODE_TEST")) delete env[k];
  return env;
}

/** Run a copied shape test against `workflowText`. Returns { code, tail }. */
function runShapeTest(shapeTest, workflowFile, workflowText, actionText = readAction()) {
  writeFileSync(join(SCRATCH, ".github", "workflows", workflowFile), workflowText);
  writeFileSync(join(SCRATCH, ".github", "actions", "local-stack", "action.yml"), actionText);
  const r = spawnSync(process.execPath, ["--test", join(SCRATCH, "fsi-app", "scripts", "proof", shapeTest)], { encoding: "utf8", timeout: 120_000, env: childEnv() });
  return { code: r.status, tail: `${r.stdout ?? ""}${r.stderr ?? ""}`.split("\n").filter((l) => /✖|not ok|failing|Error|Cannot/.test(l)).slice(0, 4).join(" | ") };
}

const readAction = () => readFileSync(join(REPO, ".github", "actions", "local-stack", "action.yml"), "utf8");
const read = (name) => readFileSync(join(REPO, ".github", "workflows", name), "utf8");
const must = (text, needle) => { assert.ok(text.includes(needle), `the mutation anchor is not in the workflow: ${JSON.stringify(needle.slice(0, 60))}`); return needle; };
const replaceOnce = (text, from, to) => text.replace(must(text, from), to);
const dropLine = (text, startsWith, within) => {
  const at = text.indexOf(must(text, within));
  const rest = text.slice(at);
  const lines = rest.split("\n");
  const i = lines.findIndex((l, n) => n > 0 && l.trim().startsWith(startsWith));
  assert.ok(i > 0, `no line starting ${startsWith} after ${within}`);
  lines.splice(i, 1);
  return text.slice(0, at) + lines.join("\n");
};
const swapSteps = (text, a, b) => {
  const parts = text.split(/^(?=\s{6}- name: )/m);
  const ia = parts.findIndex((p) => p.includes(a));
  const ib = parts.findIndex((p) => p.includes(b));
  assert.ok(ia > 0 && ib > 0, "both steps found");
  [parts[ia], parts[ib]] = [parts[ib], parts[ia]];
  return parts.join("");
};

function suite(label, shapeTest, workflowFile, mutations) {
  test(`${label}: the unmutated copy of the shape test passes (control)`, () => {
    const r = runShapeTest(shapeTest, workflowFile, read(workflowFile));
    assert.equal(r.code, 0, `the copied shape test must run clean on the committed workflow: ${r.tail}`);
  });
  for (const [name, mutate, target = "workflow"] of mutations) {
    test(`${label} ATTACK: ${name} is caught by the shape test`, () => {
      const original = target === "action" ? readAction() : read(workflowFile);
      const mutated = mutate(original);
      assert.notEqual(mutated, original, "the mutation changed nothing, so the attack was not exercised");
      const r = target === "action" ? runShapeTest(shapeTest, workflowFile, read(workflowFile), mutated) : runShapeTest(shapeTest, workflowFile, mutated);
      assert.notEqual(r.code, 0, `the shape test still passes with: ${name}`);
    });
  }
}

suite("migration-proof.yml", "migration-proof-workflow.test.mjs", "migration-proof.yml", [
  ["a secret reference", (t) => replaceOnce(t, "    timeout-minutes: 30\n", "    timeout-minutes: 30\n    env:\n      LEAK: ${{ secrets.SUPABASE_DB_PASSWORD }}\n")],
  ["a workflow_dispatch trigger", (t) => replaceOnce(t, "      - master\n", "      - master\n  workflow_dispatch:\n")],
  ["a path filter on the trigger", (t) => replaceOnce(t, "    branches:\n      - master\n", "    branches:\n      - master\n    paths:\n      - 'fsi-app/supabase/**'\n")],
  ["contents: write", (t) => replaceOnce(t, "permissions:\n  contents: read", "permissions:\n  contents: write")],
  ["the replay step losing its scope condition", (t) => dropLine(t, "if: steps.scope.outputs.touched == 'true'", "- name: Replay the applied migration files onto the stack")],
  ["the apply step losing its preflight", (t) => dropLine(t, "node scripts/proof/preflight.mjs", "- name: Apply every pending migration on the stack")],
  ["the replay step losing its preflight", (t) => dropLine(t, "node scripts/proof/preflight.mjs", "- name: Replay the applied migration files onto the stack")],
  ["the apply running before the replay", (t) => swapSteps(t, "- name: Replay the applied migration files onto the stack", "- name: Apply every pending migration on the stack")],
  ["the catalog step moved before the replay", (t) => swapSteps(t, "- name: Replay the applied migration files onto the stack", "- name: Run the schema catalog query on the replayed stack")],
  ["the stop step losing always()", (t) => replaceOnce(t, "        if: always() && steps.scope.outputs.touched == 'true'\n        run: |\n          if [ -d", "        if: steps.scope.outputs.touched == 'true'\n        run: |\n          if [ -d")],
  ["the env file no longer deleted", (t) => dropLine(t, "rm -f", "- name: Stop the local stack and delete the env file")],
  ["the time limit removed", (t) => replaceOnce(t, "    timeout-minutes: 30\n", "")],
  ["the concurrency group removed", (t) => replaceOnce(t, "  cancel-in-progress: true\n", "  cancel-in-progress: false\n")],
  ["the stack inlined instead of the shared composite action", (t) => replaceOnce(t, "        uses: ./.github/actions/local-stack\n", "        run: supabase start\n")],
]);

suite("chain-proof.yml", "chain-proof-workflow.test.mjs", "chain-proof.yml", [
  ["a pull_request trigger", (t) => replaceOnce(t, "  workflow_dispatch: {}", "  workflow_dispatch: {}\n  pull_request:\n    branches:\n      - master")],
  ["a schedule trigger", (t) => replaceOnce(t, "  workflow_dispatch: {}", "  workflow_dispatch: {}\n  schedule:\n    - cron: '0 3 * * *'")],
  ["contents: write", (t) => replaceOnce(t, "permissions:\n  contents: read", "permissions:\n  contents: write")],
  ["a GitHub Environment", (t) => replaceOnce(t, "    runs-on: ubuntu-latest\n", "    runs-on: ubuntu-latest\n    environment: production\n")],
  ["a third secret", (t) => replaceOnce(t, "      - name: Checkout repository", "      - name: Extra\n        env:\n          K: ${{ secrets.WORKER_SECRET }}\n        run: echo hi\n\n      - name: Checkout repository")],
  ["the shared stack action replaced by an inline stack start", (t) => replaceOnce(t, "uses: ./.github/actions/local-stack", "uses: ./.github/actions/not-the-stack")],
  ["the replay losing its preflight", (t) => dropLine(t, "node scripts/proof/preflight.mjs", "- name: Replay the migration files onto the stack")],
  ["the attack suite losing its preflight", (t) => dropLine(t, "node scripts/proof/preflight.mjs", "- name: Run the attack suite on the real schema")],
  // CS5 to CS8 are the steps of the shared composite action (psql, the CLI, the stack start, the env file); the shape
  // test reads the action text, so each is attacked there.
  ["CS6: the Supabase CLI pin replaced by latest", (t) => replaceOnce(t, "version: 2.120.0", "version: latest"), "action"],
  ["CS6: the CLI install step given the repository token's secret form", (t) => replaceOnce(t, "github-token: ${{ github.token }}", "github-token: ${{ secrets.GH_PAT }}"), "action"],
  ["CS7: the stack started from the migrations directory", (t) => replaceOnce(t, 'cp fsi-app/supabase/config.toml "$STACK_DIR/supabase/config.toml"', 'cp -r fsi-app/supabase/migrations "$STACK_DIR/supabase/migrations"'), "action"],
  ["CS8: the env writer removed", (t) => replaceOnce(t, "node fsi-app/scripts/proof/write-local-env.mjs --out", "cat > "), "action"],
  ["CS8: the preflight command commented out", (t) => replaceOnce(t, "        node scripts/proof/preflight.mjs", "        # node scripts/proof/preflight.mjs"), "action"],
  ["the action given a secret reference", (t) => replaceOnce(t, "  using: composite", "  using: composite\n  env:\n    K: ${{ secrets.X }}"), "action"],
  ["the ledger export losing its preflight (CS18)", (t) => dropLine(t, "node scripts/proof/preflight.mjs", "- name: Export the local harness_runs ledger")],
  ["the stack stop losing always()", (t) => replaceOnce(t, "if: always()\n        run: |\n          set -euo pipefail\n          docker rm", "if: success()\n        run: |\n          set -euo pipefail\n          docker rm")],
]);

suite("route-and-view-attacks.yml", "route-and-view-attacks-workflow.test.mjs", "route-and-view-attacks.yml", [
  ["a secret reference", (t) => replaceOnce(t, "    timeout-minutes: 60\n", "    timeout-minutes: 60\n    env:\n      LEAK: ${{ secrets.SUPABASE_DB_PASSWORD }}\n")],
  ["a workflow_dispatch trigger", (t) => replaceOnce(t, "      - master\n", "      - master\n  workflow_dispatch:\n")],
  ["a path filter on the trigger", (t) => replaceOnce(t, "    branches:\n      - master\n", "    branches:\n      - master\n    paths:\n      - 'fsi-app/src/app/**'\n")],
  ["contents: write", (t) => replaceOnce(t, "permissions:\n  contents: read", "permissions:\n  contents: write")],
  ["a GitHub Environment", (t) => replaceOnce(t, "    runs-on: ubuntu-latest\n", "    runs-on: ubuntu-latest\n    environment: production\n")],
  ["the stack inlined instead of the shared composite action", (t) => replaceOnce(t, "        uses: ./.github/actions/local-stack\n", "        run: supabase start\n")],
  ["the route attack losing its preflight", (t) => dropLine(t, "node scripts/proof/preflight.mjs", "- name: Attack every route method")],
  ["the view attack losing its preflight", (t) => dropLine(t, "node scripts/proof/preflight.mjs", "- name: Attack the views and the system-only functions")],
  ["the build losing its preflight", (t) => dropLine(t, "node scripts/proof/preflight.mjs", "- name: Build the app against the stack")],
  ["the route attack losing its scope condition", (t) => dropLine(t, "if: steps.scope.outputs.touched == 'true'", "- name: Attack every route method")],
  ["the app bound to every interface", (t) => replaceOnce(t, "next start -H 127.0.0.1 -p 3100", "next start -H 0.0.0.0 -p 3100")],
  ["the route attack pointed at a public host", (t) => replaceOnce(t, "--base-url http://127.0.0.1:3100", "--base-url https://app.example.com")],
  ["the route attack running before the app starts", (t) => swapSteps(t, "- name: Start the app with next start", "- name: Attack every route method")],
  ["the apply running before the replay", (t) => swapSteps(t, "- name: Replay the applied migration files onto the stack", "- name: Apply every pending migration on the stack")],
  ["one definer attack dropped from the run", (t) => replaceOnce(t, "sec4-accept-invitation-keeps-role,", "")],
  ["the stack-step attack losing its forbidden-name refusal", (t) => dropLine(t, "if VERCEL_ATTACK=1", "- name: Attack the stack steps themselves")],
  ["the stack-step attack losing its production-host refusal", (t) => dropLine(t, "if DATABASE_URL=", "- name: Attack the stack steps themselves")],
  ["the stop step losing always()", (t) => replaceOnce(t, "        if: always() && steps.scope.outputs.touched == 'true'\n        run: |\n          if [ -f", "        if: steps.scope.outputs.touched == 'true'\n        run: |\n          if [ -f")],
  ["the upload step losing always()", (t) => replaceOnce(t, "        if: always() && steps.scope.outputs.touched == 'true'\n        uses: actions/upload-artifact@v4", "        if: steps.scope.outputs.touched == 'true'\n        uses: actions/upload-artifact@v4")],
  ["the time limit removed", (t) => replaceOnce(t, "    timeout-minutes: 60\n", "")],
]);
