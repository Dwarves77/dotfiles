// assemble-train.test.mjs — fixture-repo tests for scripts/lib/assemble-train.mjs (W1.6, docs/plans/
// complete-system-build-plan-2026-09-04.md). Builds a real, disposable git repo per test run (a bare
// "origin" + one working clone) so folding/pruning is exercised against real `git` behaviour, not a
// mocked shell — the same reason CONVENTION.md's own fixtures are real JSON files, not stubs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  BRANCH_PREFIX_TO_WORKFLOW,
  git,
  listArtifactBranches,
  branchFiles,
  isAlreadyFolded,
  foldArtifactBranches,
  findFamiliesNeedingProposerPass,
  writeProposerBrief,
  deriveLedgerRowsForBranch,
  appendDispatchLedgerRows,
  bundleCommand,
  classifyBranches,
  pruneDeadBranches,
  findTrainLandingDates,
  findStaleUnfoldedBranches,
} from "./assemble-train.mjs";

// ── fixture repo builder ─────────────────────────────────────────────────────────────────────────────

function sh(cwd, cmd, args) {
  // stdio: pipe on stderr too — local file:// transport git pushes in this fixture print a harmless
  // "expected 'acknowledgments', received 'packfile'" negotiation warning (git's file-transport quirk,
  // not a real failure: the push itself still succeeds) that would otherwise spam every test's output.
  return execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function makeFixtureRepo() {
  const root = mkdtempSync(join(tmpdir(), "assemble-train-fixture-"));
  const bare = join(root, "origin.git");
  const work = join(root, "work");
  sh(root, "git", ["init", "--bare", "-q", bare]);
  sh(root, "git", ["init", "-q", work]);
  sh(work, "git", ["config", "user.name", "Fixture"]);
  sh(work, "git", ["config", "user.email", "fixture@example.com"]);
  sh(work, "git", ["remote", "add", "origin", bare]);
  writeFileSync(join(work, "base.txt"), "base\n");
  sh(work, "git", ["add", "base.txt"]);
  sh(work, "git", ["commit", "-q", "-m", "base"]);
  sh(work, "git", ["branch", "-M", "master"]);
  sh(work, "git", ["push", "-q", "origin", "master"]);
  return { root, bare, work };
}

/** Push a new branch `<prefix>/<runId>` off master, adding one file, then drop the local branch so only
 * the remote-tracking ref remains — matching a coordinator checkout that never locally branched these. */
function pushArtifactBranch(work, prefix, runId, file, content) {
  const branch = `${prefix}/${runId}`;
  sh(work, "git", ["checkout", "-q", "master"]);
  sh(work, "git", ["checkout", "-q", "-b", branch]);
  mkdirSync(join(work, file.split("/").slice(0, -1).join("/") || "."), { recursive: true });
  writeFileSync(join(work, file), content);
  sh(work, "git", ["add", file]);
  sh(work, "git", ["commit", "-q", "-m", `${branch} artifact`]);
  sh(work, "git", ["push", "-q", "origin", branch]);
  sh(work, "git", ["checkout", "-q", "master"]);
  sh(work, "git", ["branch", "-D", branch]);
  sh(work, "git", ["fetch", "-q", "origin"]);
  return branch;
}

function cleanup(root) {
  rmSync(root, { recursive: true, force: true });
}

function makeArtifactJson({ family, n, mode = "apply", metrics = { minted: 3 }, defects = [] }) {
  const runId = `${family}-run-${String(n).padStart(3, "0")}`;
  return JSON.stringify(
    {
      harness_family: family,
      harness_version: "sha256:0000000000000000",
      run_id: runId,
      started_at: "2026-09-05T00:00:00Z",
      config: { mode },
      inputs_ref: ["fixture.json"],
      per_item: [],
      metrics,
      defects_found: defects,
      full_trace_refs: ["fixture-trace.md"],
      proposer_notes: "",
    },
    null,
    2,
  );
}

// ── (a) discover + fold ──────────────────────────────────────────────────────────────────────────────

test("listArtifactBranches finds only known prefixes, sorted ascending by run id", () => {
  const { root, work } = makeFixtureRepo();
  try {
    pushArtifactBranch(work, "population", "200", "fsi-app/scripts/harness-runs/mint/mint-run-001.json", "{}");
    pushArtifactBranch(work, "source-sweep", "100", "fsi-app/scripts/harness-runs/source-sweep/source-sweep-run-001.json", "{}");
    pushArtifactBranch(work, "not-a-known-prefix", "999", "junk.txt", "x"); // must be ignored
    sh(work, "git", ["fetch", "-q", "origin"]);

    const branches = listArtifactBranches(work, "origin");
    assert.deepEqual(
      branches.map((b) => b.shortRef),
      ["source-sweep/100", "population/200"],
    );
    assert.equal(BRANCH_PREFIX_TO_WORKFLOW[branches[0].prefix], "source-sweep");
  } finally {
    cleanup(root);
  }
});

test("foldArtifactBranches cherry-picks unfolded branches onto the train branch, in run order", () => {
  const { root, work } = makeFixtureRepo();
  try {
    pushArtifactBranch(
      work,
      "population",
      "300",
      "fsi-app/scripts/harness-runs/mint/mint-run-002.json",
      makeArtifactJson({ family: "mint", n: 2 }),
    );
    pushArtifactBranch(
      work,
      "source-sweep",
      "200",
      "fsi-app/scripts/harness-runs/source-sweep/source-sweep-run-002.json",
      makeArtifactJson({ family: "source-sweep", n: 2 }),
    );

    sh(work, "git", ["checkout", "-q", "-b", "train/wave-test"]);
    const { folded, alreadyFolded, conflicts } = foldArtifactBranches(work, "train/wave-test", { remote: "origin" });

    assert.equal(conflicts.length, 0);
    assert.equal(alreadyFolded.length, 0);
    assert.equal(folded.length, 2);
    // run order: source-sweep/200 (run id 200) folded before population/300 (run id 300)
    assert.deepEqual(folded.map((f) => f.shortRef), ["source-sweep/200", "population/300"]);

    assert.ok(existsSync(join(work, "fsi-app/scripts/harness-runs/mint/mint-run-002.json")));
    assert.ok(existsSync(join(work, "fsi-app/scripts/harness-runs/source-sweep/source-sweep-run-002.json")));

    // idempotent: running again finds both already folded, nothing new to cherry-pick
    const second = foldArtifactBranches(work, "train/wave-test", { remote: "origin" });
    assert.equal(second.folded.length, 0);
    assert.equal(second.alreadyFolded.length, 2);
  } finally {
    cleanup(root);
  }
});

test("isAlreadyFolded is content-based, not ancestry-based (survives a cherry-pick's new SHA)", () => {
  const { root, work } = makeFixtureRepo();
  try {
    pushArtifactBranch(work, "propagation", "400", "shared.json", '{"v":1}');
    sh(work, "git", ["checkout", "-q", "-b", "train/wave-content"]);
    const { folded } = foldArtifactBranches(work, "train/wave-content", { remote: "origin" });
    assert.equal(folded.length, 1);

    // The train branch's HEAD is now a cherry-pick with a DIFFERENT sha than propagation/400's own
    // commit. Ancestry (`merge-base --is-ancestor propagation/400 train/wave-content`) would be false;
    // content comparison must still say "folded".
    const isAncestor = git(work, ["merge-base", "--is-ancestor", "origin/propagation/400", "train/wave-content"], {
      allowFail: true,
    });
    assert.equal(isAncestor, null, "sanity: the branch is NOT an ancestor after a cherry-pick");

    const files = branchFiles(work, "origin/propagation/400", "train/wave-content");
    assert.ok(isAlreadyFolded(work, "origin/propagation/400", "train/wave-content", files));
  } finally {
    cleanup(root);
  }
});

test("foldArtifactBranches records a conflict and leaves a clean tree, without blocking other branches", () => {
  const { root, work } = makeFixtureRepo();
  try {
    pushArtifactBranch(work, "population", "500", "collide.txt", "population version\n");
    pushArtifactBranch(work, "source-sweep", "501", "collide.txt", "source-sweep version\n");
    pushArtifactBranch(work, "propagation", "502", "clean.txt", "no conflict here\n");

    sh(work, "git", ["checkout", "-q", "-b", "train/wave-conflict"]);
    const { folded, conflicts } = foldArtifactBranches(work, "train/wave-conflict", { remote: "origin" });

    // one of population/500 or source-sweep/501 lands first and wins collide.txt; the other conflicts
    assert.equal(conflicts.length, 1);
    assert.equal(folded.length, 2); // the non-conflicting winner + propagation/502
    assert.ok(folded.some((f) => f.shortRef === "propagation/502"));

    const status = sh(work, "git", ["status", "--porcelain"]);
    assert.equal(status, "", "a failed cherry-pick must leave a clean working tree (--abort ran)");
    const headBranch = sh(work, "git", ["rev-parse", "--abbrev-ref", "HEAD"]);
    assert.equal(headBranch, "train/wave-conflict");
  } finally {
    cleanup(root);
  }
});

// ── (b) proposer-pass gap (reuses F28's own comparator) ─────────────────────────────────────────────

test("findFamiliesNeedingProposerPass flags a family whose LAST-PROPOSER-PASS.md is stale, and writeProposerBrief writes a usable brief", () => {
  const root = mkdtempSync(join(tmpdir(), "assemble-train-proposer-"));
  try {
    const fsiApp = join(root, "fsi-app");
    const mintDir = join(fsiApp, "scripts/harness-runs/mint");
    mkdirSync(mintDir, { recursive: true });
    writeFileSync(join(mintDir, "mint-run-001.json"), makeArtifactJson({ family: "mint", n: 1 }));
    writeFileSync(join(mintDir, "mint-run-002.json"), makeArtifactJson({ family: "mint", n: 2 }));
    // LAST-PROPOSER-PASS.md still names run-001 — stale now that run-002 (folded by a prior train) exists
    writeFileSync(join(mintDir, "LAST-PROPOSER-PASS.md"), "Artifacts read: mint-run-001\nProposal: none warranted.\n");

    const needing = findFamiliesNeedingProposerPass(fsiApp, ["mint"]);
    assert.equal(needing.length, 1);
    assert.equal(needing[0].family, "mint");
    assert.equal(needing[0].latest.run_id, "mint-run-002");

    const briefPath = join(root, "docs/dispatches/proposer-brief-mint-test.md");
    writeProposerBrief(briefPath, needing[0]);
    const brief = readFileSync(briefPath, "utf8");
    assert.match(brief, /mint-run-002/);
    assert.match(brief, /PROPOSER-RUNBOOK\.md/);
  } finally {
    cleanup(root);
  }
});

test("findFamiliesNeedingProposerPass is silent once LAST-PROPOSER-PASS.md names the latest run", () => {
  const root = mkdtempSync(join(tmpdir(), "assemble-train-proposer-ok-"));
  try {
    const fsiApp = join(root, "fsi-app");
    const dir = join(fsiApp, "scripts/harness-runs/mint");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "mint-run-001.json"), makeArtifactJson({ family: "mint", n: 1 }));
    writeFileSync(join(dir, "mint-run-002.json"), makeArtifactJson({ family: "mint", n: 2 }));
    writeFileSync(join(dir, "LAST-PROPOSER-PASS.md"), "Artifacts read: mint-run-001, mint-run-002\nProposal: none warranted.\n");

    assert.deepEqual(findFamiliesNeedingProposerPass(fsiApp, ["mint"]), []);
  } finally {
    cleanup(root);
  }
});

// ── (c) dispatch-ledger rows ─────────────────────────────────────────────────────────────────────────

test("deriveLedgerRowsForBranch + appendDispatchLedgerRows produce the live ledger's own row shape", () => {
  const { root, work } = makeFixtureRepo();
  try {
    const artifactPath = "fsi-app/scripts/harness-runs/source-sweep/source-sweep-run-003.json";
    pushArtifactBranch(
      work,
      "source-sweep",
      "600",
      artifactPath,
      makeArtifactJson({ family: "source-sweep", n: 3, mode: "apply", metrics: { upserted: 12, walked: 4 } }),
    );
    sh(work, "git", ["checkout", "-q", "-b", "train/wave-ledger"]);
    const { folded } = foldArtifactBranches(work, "train/wave-ledger", { remote: "origin" });
    assert.equal(folded.length, 1);

    const rows = deriveLedgerRowsForBranch(work, folded[0]);
    assert.equal(rows.length, 1);
    const row = rows[0];
    assert.equal(row.workflow, "source-sweep");
    assert.equal(row.mode, "apply");
    assert.equal(row.run_id, "600");
    assert.equal(row.outcome, "applied");
    assert.match(row.note, /source-sweep-run-003/);
    assert.equal(Object.keys(row).sort().join(","), "date,mode,note,outcome,run_id,step,workflow");

    const ledgerPath = join(root, "dispatch-ledger.jsonl");
    appendDispatchLedgerRows(ledgerPath, rows);
    appendDispatchLedgerRows(ledgerPath, rows); // append twice: must not clobber, ledger is append-only
    const lines = readFileSync(ledgerPath, "utf8").trim().split("\n");
    assert.equal(lines.length, 2);
    assert.deepEqual(JSON.parse(lines[0]), row);
  } finally {
    cleanup(root);
  }
});

test("deriveLedgerRowsForBranch marks a run with defects_found as 'reported', not 'applied'", () => {
  const { root, work } = makeFixtureRepo();
  try {
    pushArtifactBranch(
      work,
      "ledger-consume",
      "700",
      "fsi-app/scripts/harness-runs/ledger-consume/ledger-consume-run-004.json",
      makeArtifactJson({
        family: "ledger-consume",
        n: 4,
        mode: "apply",
        defects: [{ description: "stationary loop", root_cause: "", fix_ref: null }],
      }),
    );
    sh(work, "git", ["checkout", "-q", "-b", "train/wave-defect"]);
    const { folded } = foldArtifactBranches(work, "train/wave-defect", { remote: "origin" });
    const rows = deriveLedgerRowsForBranch(work, folded[0]);
    assert.equal(rows[0].outcome, "reported");
  } finally {
    cleanup(root);
  }
});

// ── (d) bundle command ───────────────────────────────────────────────────────────────────────────────

test("bundleCommand prints the exact browser-transport bundle invocation", () => {
  assert.equal(
    bundleCommand("train/wave46-2026-09-06", { remote: "origin", outPath: "/tmp/x.bundle" }),
    "git bundle create /tmp/x.bundle origin/master..train/wave46-2026-09-06",
  );
  assert.match(bundleCommand("train/wave46-2026-09-06"), /^git bundle create \/tmp\/train-wave46-2026-09-06\.bundle origin\/master\.\.train\/wave46-2026-09-06$/);
});

// ── (e) prune + stale-branch detection ───────────────────────────────────────────────────────────────

test("classifyBranches + pruneDeadBranches: a branch already merged into master is dead and gets deleted only with execute:true", () => {
  const { root, work, bare } = makeFixtureRepo();
  try {
    pushArtifactBranch(work, "propagation", "800", "landed.json", '{"landed":true}');

    // Simulate the train landing: fold onto master itself and push (what the Codespace does after PR merge).
    sh(work, "git", ["checkout", "-q", "master"]);
    foldArtifactBranches(work, "master", { remote: "origin" });
    sh(work, "git", ["push", "-q", "origin", "master"]);
    sh(work, "git", ["fetch", "-q", "origin"]);

    const { dead, live } = classifyBranches(work, "origin/master", "origin");
    assert.equal(dead.length, 1);
    assert.equal(dead[0].shortRef, "propagation/800");
    assert.equal(live.length, 0);

    const dryRun = pruneDeadBranches(work, dead, { remote: "origin", execute: false });
    assert.equal(dryRun[0].ran, false);
    assert.match(dryRun[0].command, /git push origin --delete propagation\/800/);
    // dry run must not have actually deleted anything on origin
    assert.ok(sh(bare, "git", ["branch", "--list", "propagation/800"]).includes("propagation/800"));

    const executed = pruneDeadBranches(work, dead, { remote: "origin", execute: true });
    assert.equal(executed[0].ran, true);
    assert.equal(sh(bare, "git", ["branch", "--list", "propagation/800"]), "");
  } finally {
    cleanup(root);
  }
});

test("findStaleUnfoldedBranches flags a live branch older than the train before the one landing now", () => {
  const { root, work } = makeFixtureRepo();
  try {
    // Land two synthetic trains on master first, dated in the past.
    for (const [n, date] of [
      [44, "2026-09-01T00:00:00"],
      [45, "2026-09-03T00:00:00"],
    ]) {
      writeFileSync(join(work, `train-${n}.txt`), "x");
      sh(work, "git", ["add", `train-${n}.txt`]);
      execFileSync("git", ["commit", "-q", "-m", `train/wave${n} landed`], {
        cwd: work,
        env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
      });
    }
    sh(work, "git", ["push", "-q", "origin", "master"]);

    // An artifact branch dispatched BEFORE train 45 landed and never folded.
    sh(work, "git", ["checkout", "-q", "-b", "source-sweep/900"]);
    writeFileSync(join(work, "old.json"), "{}");
    sh(work, "git", ["add", "old.json"]);
    execFileSync("git", ["commit", "-q", "-m", "old artifact"], {
      cwd: work,
      env: { ...process.env, GIT_AUTHOR_DATE: "2026-09-02T00:00:00", GIT_COMMITTER_DATE: "2026-09-02T00:00:00" },
    });
    sh(work, "git", ["push", "-q", "origin", "source-sweep/900"]);
    sh(work, "git", ["checkout", "-q", "master"]);
    sh(work, "git", ["branch", "-D", "source-sweep/900"]);
    sh(work, "git", ["fetch", "-q", "origin"]);

    const dates = findTrainLandingDates(work, "origin/master", 2);
    assert.equal(dates.length, 2);

    const { live } = classifyBranches(work, "origin/master", "origin");
    assert.equal(live.length, 1);
    const stale = findStaleUnfoldedBranches(work, live, "origin/master", "origin");
    assert.equal(stale.length, 1);
    assert.equal(stale[0].shortRef, "source-sweep/900");
  } finally {
    cleanup(root);
  }
});
