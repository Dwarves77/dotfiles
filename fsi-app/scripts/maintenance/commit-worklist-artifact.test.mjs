// commit-worklist-artifact.test.mjs -- shell-level proof for the generalized push-degradation script
// (Part 7 tasks 7.1/7.4, fix round 1, review finding C, Important). Same shape as task 6.1b's own
// commit-brief-apply-artifact.test.mjs (read in full, adapted for this script's extra <artifact-path>/
// <commit-label> arguments): drives the REAL script as a subprocess against disposable local git
// sandboxes (a work repo + a bare "origin"). No network, no GitHub Actions runner needed: a local bare
// repo with a `pre-receive` hook that always rejects is a faithful stand-in for a branch-protection
// rejection (git sees the identical exit-nonzero refusal either way), and a `pre-commit` hook that
// always rejects stands in for "the commit itself could not be made".
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = join(HERE, "commit-worklist-artifact.sh");

function sh(args, opts = {}) {
  try {
    const stdout = execFileSync("bash", [SCRIPT_PATH, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...opts,
    });
    return { status: 0, stdout, stderr: "" };
  } catch (err) {
    return { status: err.status, stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
  }
}

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/** A disposable work repo with an initial commit, optionally with a bare "origin" remote wired up. */
function makeWorkRepo({ withOrigin = false, originRejects = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "commit-worklist-artifact-test-"));
  const work = join(root, "work");
  mkdirSync(work, { recursive: true });
  git(["init", "-q", "-b", "main"], work);
  git(["config", "user.email", "seed@example.com"], work);
  git(["config", "user.name", "seed"], work);
  writeFileSync(join(work, "README.md"), "seed\n");
  git(["add", "README.md"], work);
  git(["commit", "-q", "-m", "seed"], work);

  let bare = null;
  if (withOrigin) {
    bare = join(root, "origin.git");
    git(["init", "-q", "--bare", bare]);
    if (originRejects) {
      const hookPath = join(bare, "hooks", "pre-receive");
      // Always-reject hook -- the local stand-in for a branch-protection refusal: git sees an identical
      // non-zero exit + refusal message either way, so this exercises the SAME code path a real
      // protected-branch push rejection would.
      writeFileSync(hookPath, "#!/usr/bin/env bash\necho \"remote: protected branch\" >&2\nexit 1\n");
      chmodSync(hookPath, 0o755);
    }
    git(["remote", "add", "origin", bare], work);
    try {
      git(["push", "-q", "origin", "main"], work);
    } catch {
      /* expected when originRejects: the always-reject hook refuses this setup push too. */
    }
  }
  return { root, work, bare };
}

function cleanup(root) {
  rmSync(root, { recursive: true, force: true });
}

function withDirtyArtifact(work, path = "scripts/_worklists/attach-found-sources.seed.json") {
  const full = join(work, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, JSON.stringify([{ item_id: "i1", token: "h1" }], null, 2));
}

test("nothing staged: exits 0, never commits, prints the no-op message", () => {
  const { root, work } = makeWorkRepo();
  try {
    const res = sh(["main", "12345", "scripts/_worklists/attach-found-sources.seed.json", "attach-found-sources worklist"], { cwd: work });
    assert.equal(res.status, 0);
    assert.match(res.stdout, /No new attach-found-sources worklist to commit/);
    assert.equal(git(["log", "--oneline"], work).trim().split("\n").length, 1, "no new commit was made");
  } finally {
    cleanup(root);
  }
});

test("ref is master: commits locally, skips the push attempt entirely, exits 0 with a named warning", () => {
  const { root, work, bare } = makeWorkRepo({ withOrigin: true, originRejects: false });
  try {
    withDirtyArtifact(work);
    const res = sh(["master", "999001", "scripts/_worklists/attach-found-sources.seed.json", "attach-found-sources worklist"], { cwd: work });
    assert.equal(res.status, 0, `expected exit 0, got ${res.status}: ${res.stdout}${res.stderr}`);
    assert.match(res.stdout, /::warning::/);
    assert.match(res.stdout, /master/);
    assert.match(res.stdout, /branch-protected/);
    // Committed locally...
    assert.match(git(["log", "-1", "--format=%s"], work), /attach-found-sources worklist: run 999001/);
    // ...but NEVER pushed: origin (a working, non-rejecting bare remote here) never received it.
    const remoteLog = git(["log", "--oneline", "main"], bare);
    assert.doesNotMatch(remoteLog, /attach-found-sources worklist: run 999001/, "master guard must never attempt the push");
  } finally {
    cleanup(root);
  }
});

test("ref is a lane branch, origin accepts: commits AND pushes, exits 0", () => {
  const { root, work, bare } = makeWorkRepo({ withOrigin: true, originRejects: false });
  try {
    git(["checkout", "-q", "-b", "lane/example"], work);
    git(["push", "-q", "-u", "origin", "lane/example"], work);
    withDirtyArtifact(work);
    const res = sh(["lane/example", "999002", "scripts/_worklists/attach-found-sources.seed.json", "attach-found-sources worklist"], { cwd: work });
    assert.equal(res.status, 0, `expected exit 0, got ${res.status}: ${res.stdout}${res.stderr}`);
    assert.match(res.stdout, /pushed to 'lane\/example'/);
    const remoteLog = git(["log", "--oneline", "lane/example"], bare);
    assert.match(remoteLog, /attach-found-sources worklist: run 999002/, "the artifact commit must reach origin");
  } finally {
    cleanup(root);
  }
});

test("push persistently rejected (protected-branch stand-in): degrades to a warning, exits 0, NEVER 1", () => {
  const { root, work } = makeWorkRepo({ withOrigin: true, originRejects: true });
  try {
    git(["checkout", "-q", "-b", "lane/example"], work);
    try {
      git(["push", "-q", "-u", "origin", "lane/example"], work);
    } catch {
      /* expected: the always-reject hook also refuses this setup push */
    }
    withDirtyArtifact(work);
    const res = sh(["lane/example", "999003", "scripts/_worklists/attach-found-sources.seed.json", "attach-found-sources worklist"], { cwd: work });
    assert.equal(res.status, 0, `a persistent push rejection must degrade to exit 0, got ${res.status}: ${res.stdout}${res.stderr}`);
    assert.match(res.stdout, /::warning::/);
    assert.match(res.stdout, /could not push/);
    // Committed locally regardless of the push outcome.
    assert.match(git(["log", "-1", "--format=%s"], work), /attach-found-sources worklist: run 999003/);
  } finally {
    cleanup(root);
  }
});

test("the commit itself cannot be made: exits 1 (the one case this script still fails the run over)", () => {
  const { root, work } = makeWorkRepo();
  try {
    const hooksDir = join(work, ".git", "hooks");
    const hookPath = join(hooksDir, "pre-commit");
    writeFileSync(hookPath, "#!/usr/bin/env bash\necho \"blocked\" >&2\nexit 1\n");
    chmodSync(hookPath, 0o755);
    withDirtyArtifact(work);
    const res = sh(["lane/example", "999004", "scripts/_worklists/attach-found-sources.seed.json", "attach-found-sources worklist"], { cwd: work });
    assert.equal(res.status, 1, `expected exit 1 on a commit failure, got ${res.status}: ${res.stdout}${res.stderr}`);
    assert.match(res.stdout, /::error::/);
    assert.match(res.stdout, /could not commit/);
  } finally {
    cleanup(root);
  }
});

test("a generic artifact path and commit label are honored (the generalization this script adds over the template)", () => {
  const { root, work, bare } = makeWorkRepo({ withOrigin: true, originRejects: false });
  try {
    git(["checkout", "-q", "-b", "lane/example"], work);
    git(["push", "-q", "-u", "origin", "lane/example"], work);
    const dir = join(work, "scripts/harness-runs/some-other-family");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "run-001.json"), JSON.stringify({ ok: true }));
    const res = sh(["lane/example", "999005", "scripts/harness-runs/some-other-family/", "some-other-family run artifact"], { cwd: work });
    assert.equal(res.status, 0, `expected exit 0, got ${res.status}: ${res.stdout}${res.stderr}`);
    assert.match(res.stdout, /pushed to 'lane\/example'/);
    const remoteLog = git(["log", "--oneline", "lane/example"], bare);
    assert.match(remoteLog, /some-other-family run artifact: run 999005/);
  } finally {
    cleanup(root);
  }
});
