// deliver-artifact-branch.test.mjs -- exercises the REAL bash script (lane STATUTORY-WRITER, 2026-09-29)
// against a scratch git repo, no real DB (a stub scripts/lib/record-harness-run.mjs on the scratch repo's
// own path stands in for the real one). Proves: (1) untracked artifact files under
// scripts/harness-runs/*/*-run-*.json are discovered and landed with NO git commit, branch, or push ever
// created; (2) files outside the pathspec are ignored; (3) an empty run (nothing written) still exits 0.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, chmodSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const SCRIPT = join(import.meta.dirname, "deliver-artifact-branch.sh");

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

/** Build a scratch repo shaped like fsi-app/: one commit on "master", a stub scripts/lib/
 *  record-harness-run.mjs (so the real script's `node scripts/lib/record-harness-run.mjs --file X` call
 *  hits our fake instead of needing DB creds), and the real deliver-artifact-branch.sh copied in at its
 *  expected relative path (scripts/turns/). Returns the repo root. */
function makeScratchRepo(t) {
  const root = mkdtempSync(join(tmpdir(), "deliver-artifact-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, "init", "-q", "-b", "master");
  git(root, "config", "user.email", "test@example.com");
  git(root, "config", "user.name", "test");

  mkdirSync(join(root, "scripts/lib"), { recursive: true });
  mkdirSync(join(root, "scripts/turns"), { recursive: true });
  // Stub record-harness-run.mjs: always "lands" (echoes the marker line this script's own success-detect
  // grep looks for) unless the file is named to force a failure, so tests can prove BOTH outcomes.
  writeFileSync(
    join(root, "scripts/lib/record-harness-run.mjs"),
    `#!/usr/bin/env node
const path = process.argv[process.argv.indexOf("--file") + 1];
if (path.includes("force-fail")) { console.error("record-harness-run: simulated insert failure"); process.exit(0); }
console.log("record-harness-run: landed " + path);
process.exit(0);
`
  );
  const scriptText = readFileSync(SCRIPT, "utf8");
  writeFileSync(join(root, "scripts/turns/deliver-artifact-branch.sh"), scriptText);
  chmodSync(join(root, "scripts/turns/deliver-artifact-branch.sh"), 0o755);

  writeFileSync(join(root, "README.md"), "scratch repo\n");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "initial commit");
  return root;
}

function runScript(root, label) {
  return execFileSync("bash", ["scripts/turns/deliver-artifact-branch.sh", label], {
    cwd: root,
    encoding: "utf8",
  });
}

test("deliver-artifact-branch.sh: discovers and lands an untracked artifact file, with NO git commit/branch created", (t) => {
  const root = makeScratchRepo(t);
  mkdirSync(join(root, "scripts/harness-runs/propagation"), { recursive: true });
  writeFileSync(join(root, "scripts/harness-runs/propagation/propagation-run-001.json"), "{}\n");

  const out = runScript(root, "propagation run 12345");

  assert.match(out, /recording scripts\/harness-runs\/propagation\/propagation-run-001\.json/);
  assert.match(out, /record-harness-run: landed scripts\/harness-runs\/propagation\/propagation-run-001\.json/);
  assert.match(out, /landed=1 failed=0/);

  // No commit was ever created, no branch beyond the one this repo started on.
  const log = git(root, "log", "--oneline");
  assert.equal(log.trim().split("\n").length, 1, "still exactly the one initial commit");
  const branch = git(root, "branch", "--show-current").trim();
  assert.equal(branch, "master", "never checked out a new branch");
  // The artifact file is still untracked (never git-added/committed by this script).
  const status = git(root, "status", "--porcelain", "--untracked-files=all");
  assert.match(status, /\?\? scripts\/harness-runs\/propagation\/propagation-run-001\.json/);
});

test("deliver-artifact-branch.sh: a run that wrote no artifact is a clean no-op, exit 0", (t) => {
  const root = makeScratchRepo(t);
  const out = runScript(root, "no-op run");
  assert.match(out, /landed=0 failed=0/);
});

test("deliver-artifact-branch.sh: files outside the harness-runs/*/*-run-*.json pathspec are ignored", (t) => {
  const root = makeScratchRepo(t);
  mkdirSync(join(root, "scripts/harness-runs/propagation"), { recursive: true });
  writeFileSync(join(root, "scripts/harness-runs/propagation/family.json"), "{}\n"); // a descriptor, not a run artifact
  writeFileSync(join(root, "scratch-notes.txt"), "irrelevant\n");

  const out = runScript(root, "descriptor-only run");
  assert.match(out, /landed=0 failed=0/);
  assert.doesNotMatch(out, /family\.json/);
  assert.doesNotMatch(out, /scratch-notes\.txt/);
});

test("deliver-artifact-branch.sh: a record-harness-run.mjs failure for one file is counted, never thrown, and does not stop other files", (t) => {
  const root = makeScratchRepo(t);
  mkdirSync(join(root, "scripts/harness-runs/quarantine-disposition"), { recursive: true });
  writeFileSync(join(root, "scripts/harness-runs/quarantine-disposition/quarantine-disposition-run-force-fail.json"), "{}\n");
  writeFileSync(join(root, "scripts/harness-runs/quarantine-disposition/quarantine-disposition-run-002.json"), "{}\n");

  const out = runScript(root, "mixed outcome run");
  assert.match(out, /landed=1 failed=1/);
  assert.match(out, /::warning::deliver-artifact-branch: record-harness-run\.mjs did not confirm a landed row for scripts\/harness-runs\/quarantine-disposition\/quarantine-disposition-run-force-fail\.json/);
});

test("deliver-artifact-branch.sh: multiple families in one run are all discovered (maintenance.yml's own shape)", (t) => {
  const root = makeScratchRepo(t);
  mkdirSync(join(root, "scripts/harness-runs/maintenance"), { recursive: true });
  mkdirSync(join(root, "scripts/harness-runs/quarantine-disposition"), { recursive: true });
  writeFileSync(join(root, "scripts/harness-runs/maintenance/maintenance-run-005.json"), "{}\n");
  writeFileSync(join(root, "scripts/harness-runs/quarantine-disposition/quarantine-disposition-run-003.json"), "{}\n");

  const out = runScript(root, "maintenance run");
  assert.match(out, /landed=2 failed=0/);
});
