// workflow-hydrate-guard.test.mjs — every runtime workflow's run_id-collision guard must actually see
// its sibling branches.
//
// WHY THIS EXISTS (2026-09-02, first dispatches of the system-completion train): propagation-drain runs
// #2 and #3 both wrote `propagation-run-001.json`, and source-sweep runs #8 and #9 both wrote
// `source-sweep-run-007.json`, fifteen minutes and forty seconds apart. The hydrate step in every runtime
// workflow ran `git ls-tree -r --name-only "$b" -- fsi-app/scripts/harness-runs/<family>/` from
// `working-directory: fsi-app`. `git ls-tree` resolves its pathspec relative to the current directory and
// prints paths relative to it, so from inside fsi-app the pathspec `fsi-app/...` matches nothing, the
// loop body never runs, "hydrated 0" is printed, and `claimRunId` numbers from the checked-out tree alone.
// The guard had never once fired; source-sweep-run-003's "numbered honestly" (Train 13) was the prior
// run's PR having merged first. `--full-tree` makes the pathspec and the printed paths repository-rooted
// regardless of cwd, which is what `rel="${f#fsi-app/}"` and `git show "$b:$f"` were already assuming.
//
// This test reads the workflows as text: any `git ls-tree` inside a runtime workflow must carry
// `--full-tree`, and any hydrate step must strip the `fsi-app/` prefix it now receives.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKFLOWS = resolve(HERE, "..", "..", "..", ".github", "workflows");

function runtimeWorkflows() {
  return readdirSync(WORKFLOWS)
    .filter((f) => f.endsWith(".yml"))
    .map((f) => ({ name: f, text: readFileSync(join(WORKFLOWS, f), "utf8") }))
    .filter((w) => /git ls-tree/.test(w.text));
}

test("every workflow that walks sibling artifact branches uses git ls-tree --full-tree", () => {
  const ws = runtimeWorkflows();
  assert.ok(ws.length >= 6, `expected the six runtime workflows to carry a hydrate step, found ${ws.length}`);
  for (const w of ws) {
    for (const line of w.text.split("\n").filter((l) => /git ls-tree/.test(l))) {
      assert.match(line, /--full-tree/, `${w.name}: ${line.trim()} — without --full-tree the pathspec is cwd-relative and matches nothing under working-directory: fsi-app`);
    }
    assert.match(w.text, /rel="\$\{f#fsi-app\/\}"/, `${w.name}: the hydrate loop must strip the repository-rooted fsi-app/ prefix`);
  }
});
