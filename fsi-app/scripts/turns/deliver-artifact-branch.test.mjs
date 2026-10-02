// deliver-artifact-branch.test.mjs -- exercises the REAL bash script (lane STATUTORY-WRITER, 2026-09-29;
// exit-code contract rewritten lane HARNESS-RUN-NUMBER, 2026-09-29) against a scratch git repo, no real
// DB (a stub scripts/lib/record-harness-run.mjs on the scratch repo's own path stands in for the real
// one). Proves: (1) untracked artifact files under scripts/harness-runs/*/*-run-*.json are discovered
// and landed with NO git commit, branch, or push ever created; (2) files outside the pathspec are
// ignored; (3) an empty run (nothing written) still exits 0; (4) a real landing failure (record-harness-
// run.mjs exit 1) now FAILS this script's own exit code -- the fix for the defect this rewrite closes
// (GitHub run 36610847827: a failed landing was logged "best-effort, continuing" and the step reported
// SUCCESS); (5) a self-skip (record-harness-run.mjs exit 2, no credentials) does NOT fail this script.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, chmodSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

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
  // grep looks for and exits 0) unless the file is named to force a failure (exit 1, the real file's own
  // exit code for a genuine insert failure -- see that file's own header) or a skip (exit 2, the real
  // file's no-credential self-skip code), so tests can prove all three outcomes against the real exit
  // codes the production record-harness-run.mjs now returns (lane HARNESS-RUN-NUMBER, 2026-09-29).
  writeFileSync(
    join(root, "scripts/lib/record-harness-run.mjs"),
    `#!/usr/bin/env node
const path = process.argv[process.argv.indexOf("--file") + 1];
if (path.includes("force-fail")) { console.error("record-harness-run: simulated insert failure"); process.exit(1); }
if (path.includes("force-skip")) { console.error("record-harness-run: simulated no-credential self-skip"); process.exit(2); }
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

/** Runs the script via spawnSync (never throws on a nonzero exit, unlike execFileSync) and returns
 *  { stdout, status } so tests can assert on the exit code as well as the printed lines. */
function runScript(root, label) {
  const { stdout, stderr, status } = spawnSync("bash", ["scripts/turns/deliver-artifact-branch.sh", label], {
    cwd: root,
    encoding: "utf8",
  });
  return { stdout: (stdout ?? "") + (stderr ?? ""), status };
}

test("deliver-artifact-branch.sh: discovers and lands an untracked artifact file, with NO git commit/branch created", (t) => {
  const root = makeScratchRepo(t);
  mkdirSync(join(root, "scripts/harness-runs/propagation"), { recursive: true });
  writeFileSync(join(root, "scripts/harness-runs/propagation/propagation-run-001.json"), "{}\n");

  const { stdout: out, status: exitStatus } = runScript(root, "propagation run 12345");

  assert.equal(exitStatus, 0, "a clean land exits 0");
  assert.match(out, /recording scripts\/harness-runs\/propagation\/propagation-run-001\.json/);
  assert.match(out, /record-harness-run: landed scripts\/harness-runs\/propagation\/propagation-run-001\.json/);
  assert.match(out, /landed=1 failed=0/);

  // No commit was ever created, no branch beyond the one this repo started on.
  const log = git(root, "log", "--oneline");
  assert.equal(log.trim().split("\n").length, 1, "still exactly the one initial commit");
  const branch = git(root, "branch", "--show-current").trim();
  assert.equal(branch, "master", "never checked out a new branch");
  // The artifact file is still untracked (never git-added/committed by this script).
  const gitStatus = git(root, "status", "--porcelain", "--untracked-files=all");
  assert.match(gitStatus, /\?\? scripts\/harness-runs\/propagation\/propagation-run-001\.json/);
});

test("deliver-artifact-branch.sh: a run that wrote no artifact is a clean no-op, exit 0", (t) => {
  const root = makeScratchRepo(t);
  const { stdout: out, status } = runScript(root, "no-op run");
  assert.match(out, /landed=0 failed=0/);
  assert.equal(status, 0);
});

test("deliver-artifact-branch.sh: files outside the harness-runs/*/*-run-*.json pathspec are ignored", (t) => {
  const root = makeScratchRepo(t);
  mkdirSync(join(root, "scripts/harness-runs/propagation"), { recursive: true });
  writeFileSync(join(root, "scripts/harness-runs/propagation/family.json"), "{}\n"); // a descriptor, not a run artifact
  writeFileSync(join(root, "scratch-notes.txt"), "irrelevant\n");

  const { stdout: out, status } = runScript(root, "descriptor-only run");
  assert.match(out, /landed=0 failed=0/);
  assert.equal(status, 0);
  assert.doesNotMatch(out, /family\.json/);
  assert.doesNotMatch(out, /scratch-notes\.txt/);
});

test("deliver-artifact-branch.sh: a record-harness-run.mjs failure for one file is counted, never thrown, does not stop other files, AND now fails this script's own exit code (the GitHub run 36610847827 fix)", (t) => {
  const root = makeScratchRepo(t);
  mkdirSync(join(root, "scripts/harness-runs/quarantine-disposition"), { recursive: true });
  writeFileSync(join(root, "scripts/harness-runs/quarantine-disposition/quarantine-disposition-run-force-fail.json"), "{}\n");
  writeFileSync(join(root, "scripts/harness-runs/quarantine-disposition/quarantine-disposition-run-002.json"), "{}\n");

  const { stdout: out, status } = runScript(root, "mixed outcome run");
  assert.match(out, /landed=1 failed=1/);
  assert.match(out, /::error::deliver-artifact-branch: record-harness-run\.mjs failed to land scripts\/harness-runs\/quarantine-disposition\/quarantine-disposition-run-force-fail\.json \(exit 1\)/);
  assert.notEqual(status, 0, "a real landing failure must fail this script's own exit code, not report SUCCESS");
});

test("deliver-artifact-branch.sh: a no-credential self-skip (exit 2) is counted separately and does NOT fail this script's own exit code", (t) => {
  const root = makeScratchRepo(t);
  mkdirSync(join(root, "scripts/harness-runs/quarantine-disposition"), { recursive: true });
  writeFileSync(join(root, "scripts/harness-runs/quarantine-disposition/quarantine-disposition-run-force-skip.json"), "{}\n");

  const { stdout: out, status } = runScript(root, "skip-only run");
  assert.match(out, /landed=0 failed=0 skipped=1/);
  assert.match(out, /::warning::deliver-artifact-branch: record-harness-run\.mjs self-skipped scripts\/harness-runs\/quarantine-disposition\/quarantine-disposition-run-force-skip\.json \(no credentials\)/);
  assert.equal(status, 0, "a self-skip is not a failure");
});

// ── regression: repo-root-relative git status output when running from a NESTED subdirectory ──────────
// (lane STATUTORY-WRITER, 2026-09-29, propagation-drain run 36538491130: the real CI layout is an OUTER
// repo root with a `fsi-app/` subdirectory, `defaults.run.working-directory: fsi-app` on every job, and
// git status printed "fsi-app/scripts/harness-runs/..." even though cwd WAS fsi-app/ -- record-harness-
// run.mjs then failed to open "fsi-app/fsi-app/..." (ENOENT). The scratch repo above puts scripts/ at the
// repo ROOT, so it could never reproduce this; this one nests everything under an outer repo root's own
// fsi-app/ subdirectory, matching the real layout exactly.)

function makeNestedScratchRepo(t) {
  const root = mkdtempSync(join(tmpdir(), "deliver-artifact-nested-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, "init", "-q", "-b", "master");
  git(root, "config", "user.email", "test@example.com");
  git(root, "config", "user.name", "test");

  const app = join(root, "fsi-app");
  mkdirSync(join(app, "scripts/lib"), { recursive: true });
  mkdirSync(join(app, "scripts/turns"), { recursive: true });
  writeFileSync(
    join(app, "scripts/lib/record-harness-run.mjs"),
    `#!/usr/bin/env node
const path = process.argv[process.argv.indexOf("--file") + 1];
console.log("record-harness-run: landed " + path);
process.exit(0);
`
  );
  const scriptText = readFileSync(SCRIPT, "utf8");
  writeFileSync(join(app, "scripts/turns/deliver-artifact-branch.sh"), scriptText);
  chmodSync(join(app, "scripts/turns/deliver-artifact-branch.sh"), 0o755);

  writeFileSync(join(root, "README.md"), "outer repo root\n");
  writeFileSync(join(app, "package.json"), "{}\n");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "initial commit");
  return { root, app };
}

test("REGRESSION: deliver-artifact-branch.sh lands correctly when run from a nested fsi-app/ subdirectory of the repo root (the real CI layout)", (t) => {
  const { app } = makeNestedScratchRepo(t);
  mkdirSync(join(app, "scripts/harness-runs/statutory"), { recursive: true });
  writeFileSync(join(app, "scripts/harness-runs/statutory/statutory-run-001.json"), "{}\n");

  const out = execFileSync("bash", ["scripts/turns/deliver-artifact-branch.sh", "nested test"], {
    cwd: app,
    encoding: "utf8",
  });

  assert.match(out, /landed=1 failed=0/, `expected a clean land, got: ${out}`);
  // The path record-harness-run.mjs was actually asked to open must NOT carry a redundant "fsi-app/" prefix.
  assert.doesNotMatch(out, /landed fsi-app\/scripts/);
  assert.match(out, /landed scripts\/harness-runs\/statutory\/statutory-run-001\.json/);
});

test("REGRESSION: a nested trace file (scripts/harness-runs/<family>/traces/*.json) is NOT matched by the pathspec (glob magic stops at /)", (_t) => {
  const root = mkdtempSync(join(tmpdir(), "deliver-artifact-glob-test-"));
  try {
    git(root, "init", "-q", "-b", "master");
    git(root, "config", "user.email", "test@example.com");
    git(root, "config", "user.name", "test");
    mkdirSync(join(root, "scripts/lib"), { recursive: true });
    mkdirSync(join(root, "scripts/turns"), { recursive: true });
    writeFileSync(
      join(root, "scripts/lib/record-harness-run.mjs"),
      `#!/usr/bin/env node\nconsole.log("record-harness-run: landed " + process.argv[process.argv.indexOf("--file") + 1]);\nprocess.exit(0);\n`
    );
    writeFileSync(join(root, "scripts/turns/deliver-artifact-branch.sh"), readFileSync(SCRIPT, "utf8"));
    chmodSync(join(root, "scripts/turns/deliver-artifact-branch.sh"), 0o755);
    writeFileSync(join(root, "README.md"), "x\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "init");

    mkdirSync(join(root, "scripts/harness-runs/propagation/traces"), { recursive: true });
    writeFileSync(join(root, "scripts/harness-runs/propagation/traces/propagation-run-009.report.json"), "{}\n");

    const out = execFileSync("bash", ["scripts/turns/deliver-artifact-branch.sh", "traces-only run"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.match(out, /landed=0 failed=0/, `a nested traces/ file must never be treated as a run artifact, got: ${out}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("deliver-artifact-branch.sh: multiple families in one run are all discovered (maintenance.yml's own shape)", (t) => {
  const root = makeScratchRepo(t);
  mkdirSync(join(root, "scripts/harness-runs/maintenance"), { recursive: true });
  mkdirSync(join(root, "scripts/harness-runs/quarantine-disposition"), { recursive: true });
  writeFileSync(join(root, "scripts/harness-runs/maintenance/maintenance-run-005.json"), "{}\n");
  writeFileSync(join(root, "scripts/harness-runs/quarantine-disposition/quarantine-disposition-run-003.json"), "{}\n");

  const { stdout: out, status } = runScript(root, "maintenance run");
  assert.match(out, /landed=2 failed=0/);
  assert.equal(status, 0);
});
