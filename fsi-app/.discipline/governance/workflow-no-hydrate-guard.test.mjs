// workflow-no-hydrate-guard.test.mjs (lane CHAIN-1, 2026-10-07; replaces workflow-hydrate-guard.test.mjs).
// A negative guard, the same idiom F25 uses: the dead mechanism cannot return.
//
// HISTORY. This file used to assert the opposite: that every runtime workflow's sibling-branch "hydrate" step
// used `git ls-tree --full-tree` (2026-09-02, propagation-drain runs #2 and #3 both wrote
// propagation-run-001.json because a cwd-relative pathspec matched nothing). Artifacts now land only in the
// `harness_runs` table (deliver-artifact-branch.sh, operator ruling 2026-09-26: no branch, no PR), which
// renumbers at land time, so no `population/*`, `propagation/*`, `turn/*` or `ledger-consume/*` branch carries an
// artifact and nothing reads one. Lane CHAIN-1 deleted every hydrate step and replaced the branch-discovery
// readers with scripts/lib/upstream-artifact.mjs (the `harness_runs` row). A branch read in a workflow would
// look for artifacts that are never pushed and silently find nothing, which is the defect the chain-fire of
// 2026-10-06 (finding F2) found.
//
// RULE. No workflow may carry a `git ls-tree` walk or a `refs/remotes/origin` read of an artifact branch, outside
// comments. A workflow that really needs a remote ref (none does today) names the exception here with a reason.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKFLOWS = resolve(HERE, "..", "..", "..", ".github", "workflows");

/** Workflows allowed to read a remote ref, each with its reason. Empty on purpose. */
export const REMOTE_REF_EXCEPTIONS = Object.freeze({});

const FORBIDDEN = [
  [/git ls-tree/, "a git ls-tree walk of an artifact branch"],
  [/refs\/remotes\/origin/, "a refs/remotes/origin artifact read"],
  [/hydrated-[a-z-]*artifacts\.txt/, "a hydrated-artifacts list (the sibling-branch hydrate step)"],
  [/- name: Hydrate unmerged/, "a sibling-branch hydrate step"],
];

/** Violations in one workflow's text, comments ignored. PURE. @param {string} name @param {string} text */
export function findHydrateViolations(name, text) {
  if (REMOTE_REF_EXCEPTIONS[name]) return [];
  const code = text.split("\n").filter((l) => !/^\s*#/.test(l));
  const out = [];
  for (const line of code) for (const [re, what] of FORBIDDEN) if (re.test(line)) out.push(`${name}: ${what}: ${line.trim()}`);
  return out;
}

test("no workflow carries a git ls-tree hydrate step or a refs/remotes/origin artifact read", () => {
  const files = readdirSync(WORKFLOWS).filter((f) => f.endsWith(".yml"));
  assert.ok(files.length >= 20, `expected to scan the real workflows directory, found ${files.length} file(s)`);
  const violations = files.flatMap((f) => findHydrateViolations(f, readFileSync(join(WORKFLOWS, f), "utf8")));
  assert.deepEqual(violations, [], "artifacts land only in harness_runs; read the upstream row with scripts/lib/upstream-artifact.mjs");
});

test("ATTACK: the detector catches each shape of the dead mechanism and ignores comments", () => {
  const hydrate = [
    "      - name: Hydrate unmerged mint artifacts from sibling branches (run_id collision guard)",
    "        run: |",
    "          git fetch --no-tags origin '+refs/heads/population/*:refs/remotes/origin/population/*' || true",
    "          for f in $(git ls-tree -r --full-tree --name-only \"$b\" -- fsi-app/scripts/harness-runs/mint/); do",
    "            echo \"$rel\" >> /tmp/hydrated-artifacts.txt",
  ].join("\n");
  const v = findHydrateViolations("planted.yml", hydrate);
  assert.equal(v.length, 4, v.join("\n"));
  assert.deepEqual(findHydrateViolations("clean.yml", "      # git ls-tree and refs/remotes/origin were removed (lane CHAIN-1)\n      - run: echo ok"), []);
});
