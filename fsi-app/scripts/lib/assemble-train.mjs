#!/usr/bin/env node
// assemble-train.mjs — W1.6 (docs/plans/complete-system-build-plan-2026-09-04.md §W1: "the train
// assembly (fold artifact branches, proposer pass, land) becomes one scripted step the coordinator runs
// per train"). This module IS that step. It does not push, open a PR, or merge — this container has
// neither network egress to origin nor push credentials (lane-common-contract.md, "Never push (the
// container cannot; do not try)") — it prepares everything a coordinator with a real checkout (the
// Codespace the browser-transport procedure already uses; see docs/ops/session-log.md's repeated "land
// via the browser path: bundle → web upload → Codespace → PR → squash-merge") needs to run the four-step
// loop in one pass instead of by hand, branch by branch.
//
// WHAT "FOLDING AN ARTIFACT BRANCH" MEANS. Six of seventeen workflows
// (population-turn/source-sweep/propagation-drain/corpus-turn/change-detection/ledger-consume — A1-
// runtimes.md §6) end every dispatch by pushing a branch (`<prefix>/<github-run-id>`) carrying that run's
// harness-run artifact (and, for population, its snapshot/report files) through
// scripts/turns/deliver-artifact-branch.sh, then trying `gh pr create`. This repository refuses
// Actions-created PRs (a Settings toggle), so every one of those branches has stranded on `origin`,
// unmerged, since the mechanism was built — A1 §6 counted 24 on 2026-09-04, all but one still unmerged as
// of this lane. `git merge-base --is-ancestor` cannot tell "folded" from "stranded" once a branch's
// content has been cherry-picked (a cherry-pick is a NEW commit with a different SHA — A1 §6's own
// finding, "one branch's file content is byte-identical to what now sits in master... not via the runtime
// branch"), so this module compares FILE CONTENT (blob hashes), never ancestry, to decide what still
// needs folding.
//
// THE FOUR-STEP LOOP THIS SCRIPTS (PROPOSER-RUNBOOK.md §0), applied to a WHOLE TRAIN'S WORTH of artifact
// branches at once rather than one dispatch at a time:
//   (a) fold        — foldArtifactBranches(): cherry-pick every not-yet-folded artifact branch onto the
//                      train branch, in run order (ascending numeric run id — the order the workflows
//                      actually dispatched in).
//   (b) propose      — findFamiliesNeedingProposerPass(): reuse F28's OWN rule-(d) comparator
//                      (auditProposerAttestation, imported, never re-implemented) to find every harness
//                      family whose LAST-PROPOSER-PASS.md no longer names its latest artifact now that
//                      folding landed new ones; writeProposerBrief() writes the Haiku lane's brief per
//                      PROPOSER-RUNBOOK.md §1-2 — the pass itself STAYS a Haiku lane (build plan's own
//                      "no LLM in population/classification runtimes" does not forbid a Haiku LANE; this
//                      script never calls a model).
//   (c) ledger       — deriveDispatchLedgerRows()/appendDispatchLedgerRows(): append the mechanical rows
//                      docs/ops/dispatch-ledger.jsonl's own schema already uses (date/workflow/step/mode/
//                      run_id/outcome/note) for every harness-run artifact just folded — flagged in each
//                      row's own note as coordinator-derived, "the coordinator edits the note" per the
//                      workstream brief, never asserted as a final record.
//   (d) gate+bundle  — runGateSet() runs this repo's own standing gate set against the assembled tree;
//                      bundleCommand() prints the exact `git bundle` invocation for the browser-transport
//                      procedure's first step.
//   (e) prune        — findDeadBranches()/pruneDeadBranches(): once the train has actually landed on
//                      origin/master, a folded branch's content now matches master byte-for-byte (or is a
//                      real ancestor) and is safe to delete; --prune (run from the Codespace, which CAN
//                      push) deletes them. findStaleUnfoldedBranches() flags anything still NOT folded
//                      that predates the train BEFORE this one — the "no artifact branch older than one
//                      train" done-condition (plan §W1.6) made checkable.
//
// $0, no LLM, no schedule: every function here is `git`/filesystem only (execFileSync git, node:fs) — the
// one thing this module runs a subprocess for is `git` and, in runGateSet(), this repo's own existing
// gate commands. No network call of its own; `git fetch`/`git push` inside those subprocess calls need
// the CALLER's origin access, which this container does not have (see header above).
//
// USAGE (CLI, run from the Codespace / a checkout WITH origin access and the train branch checked out):
//   node scripts/lib/assemble-train.mjs --train train/wave46-2026-09-06 --fold --propose --ledger --gates
//   node scripts/lib/assemble-train.mjs --train train/wave46-2026-09-06 --prune   # after landing
//   node scripts/lib/assemble-train.mjs --train train/wave46-2026-09-06 --all     # steps a-d in order
//
// See docs/runbooks/MAINTENANCE-RUNBOOK.md "Train assembly (W1.6)" for the coordinator's exact procedure.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readRunHistory, metricHeadline, ALLOWED_FAMILIES } from "./run-artifact.mjs";
import { auditProposerAttestation } from "../../.discipline/fitness/functions/F28-harness-run-integrity.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

export const CITE = Object.freeze({
  skill: "train-assembly",
  reason:
    "docs/plans/complete-system-build-plan-2026-09-04.md W1.6: fold every stranded artifact branch onto " +
    "the train, run the proposer-attestation check, derive dispatch-ledger rows, run the gate set, print " +
    "the bundle command, and (after landing) prune what folded cleanly — one scripted step instead of a " +
    "branch-by-branch hand procedure.",
});

// Branch-prefix families this step folds — the six workflows that push an artifact branch through
// scripts/turns/deliver-artifact-branch.sh (A1-runtimes.md §6). producers.yml and maintenance.yml write
// straight through the guarded Supabase path with no branch/PR step (A1 §6's own finding: "no landing
// backlog by construction") — deliberately absent here, not an oversight.
export const BRANCH_PREFIX_TO_WORKFLOW = Object.freeze({
  population: "population-turn",
  "source-sweep": "source-sweep",
  propagation: "propagation-drain",
  turn: "corpus-turn",
  "ledger-consume": "ledger-consume",
  "change-detection": "change-detection",
});

export const BRANCH_PREFIXES = Object.freeze(Object.keys(BRANCH_PREFIX_TO_WORKFLOW));

const BRANCH_RE = /^([a-z][a-z-]*[a-z])\/(\d+)$/;

// ── git plumbing (the only subprocess this module runs) ──────────────────────────────────────────────

/** Run one git command in `repoRoot`. Throws with stdout+stderr on failure unless `allowFail`. */
export function git(repoRoot, args, { allowFail = false } = {}) {
  try {
    return execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (err) {
    if (allowFail) return null;
    const stderr = err.stderr ? err.stderr.toString() : "";
    const stdout = err.stdout ? err.stdout.toString() : "";
    throw new Error(`git ${args.join(" ")} failed:\n${stdout}${stderr}`);
  }
}

// ── (a) discover + fold artifact branches ─────────────────────────────────────────────────────────────

/**
 * Every remote branch matching a known artifact-branch prefix, sorted ascending by numeric run id (the
 * order the workflows actually dispatched in — build plan's own "run order").
 * @returns {{ref:string, shortRef:string, prefix:string, runId:string}[]}
 */
export function listArtifactBranches(repoRoot, remote = "origin") {
  const out = git(repoRoot, [
    "for-each-ref",
    `refs/remotes/${remote}/`,
    "--format=%(refname:short)",
  ]);
  const branches = [];
  const prefix = `${remote}/`;
  for (const line of out.split("\n").filter(Boolean)) {
    if (!line.startsWith(prefix)) continue;
    const shortRef = line.slice(prefix.length);
    const m = BRANCH_RE.exec(shortRef);
    if (!m) continue;
    const [, branchPrefix, runId] = m;
    if (!BRANCH_PREFIXES.includes(branchPrefix)) continue;
    branches.push({ ref: line, shortRef, prefix: branchPrefix, runId });
  }
  branches.sort((a, b) => Number(a.runId) - Number(b.runId));
  return branches;
}

/** Files the branch's own commit(s) add/change relative to its merge-base with `referenceBranch`. */
export function branchFiles(repoRoot, branchRef, referenceBranch) {
  const base = git(repoRoot, ["merge-base", referenceBranch, branchRef], { allowFail: true });
  if (!base) return null; // no common ancestor found — caller decides how to treat this
  const out = git(repoRoot, ["diff", "--name-only", base, branchRef]);
  return out ? out.split("\n").filter(Boolean) : [];
}

/**
 * True when every file `branchRef` would add is already present, byte-identical, on `referenceBranch` —
 * i.e. this branch's content already landed (however it landed — merge, cherry-pick, manual copy) and it
 * is safe to prune. Ancestry is NOT used (A1-runtimes.md §6: a cherry-pick changes the SHA).
 */
export function isAlreadyFolded(repoRoot, branchRef, referenceBranch, files) {
  if (!files || files.length === 0) return false; // nothing to compare = not a confirmed fold
  for (const f of files) {
    const onReference = git(repoRoot, ["rev-parse", `${referenceBranch}:${f}`], { allowFail: true });
    if (!onReference) return false;
    const onBranch = git(repoRoot, ["rev-parse", `${branchRef}:${f}`], { allowFail: true });
    if (onBranch !== onReference) return false;
  }
  return true;
}

/**
 * Fold every not-yet-folded artifact branch onto `trainBranch`, in run order. `trainBranch` MUST already
 * be checked out in `repoRoot` (this function never switches branches itself — the caller's checkout
 * state is the caller's to manage, same discipline every other script in this repo follows).
 * @returns {{folded: object[], alreadyFolded: object[], conflicts: object[]}}
 */
export function foldArtifactBranches(repoRoot, trainBranch, { remote = "origin" } = {}) {
  const current = git(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (current !== trainBranch) {
    throw new Error(
      `foldArtifactBranches: expected "${trainBranch}" checked out in ${repoRoot}, found "${current}". ` +
        `Check out the train branch first — this function never switches branches for you.`,
    );
  }

  const branches = listArtifactBranches(repoRoot, remote);
  const folded = [];
  const alreadyFolded = [];
  const conflicts = [];

  for (const b of branches) {
    const files = branchFiles(repoRoot, b.ref, trainBranch);
    if (files === null) {
      conflicts.push({ ...b, error: `no merge-base with ${trainBranch} — cannot determine its files` });
      continue;
    }
    if (files.length === 0 || isAlreadyFolded(repoRoot, b.ref, trainBranch, files)) {
      alreadyFolded.push({ ...b, files });
      continue;
    }

    const base = git(repoRoot, ["merge-base", trainBranch, b.ref]);
    const commits = git(repoRoot, ["rev-list", "--reverse", `${base}..${b.ref}`])
      .split("\n")
      .filter(Boolean);

    let failed = null;
    for (const commit of commits) {
      try {
        git(repoRoot, ["cherry-pick", "-x", commit]);
      } catch (err) {
        git(repoRoot, ["cherry-pick", "--abort"], { allowFail: true });
        failed = err.message;
        break;
      }
    }
    if (failed) {
      conflicts.push({ ...b, files, error: failed });
    } else {
      folded.push({ ...b, files, commits });
    }
  }

  return { folded, alreadyFolded, conflicts };
}

// ── (b) proposer-pass gap, reusing F28's own rule-(d) comparator ────────────────────────────────────────

const HARNESS_RUNS_REL = "scripts/harness-runs";

/**
 * Every harness family whose LAST-PROPOSER-PASS.md no longer names its latest artifact, per F28's own
 * auditProposerAttestation (imported, not re-implemented — "one module every caller imports"). Only
 * meaningful to call AFTER folding: folding is what lands new artifacts a family's last pass may not have
 * seen yet.
 * @returns {{family:string, runs:object[], latest:object, problems:string[]}[]}
 */
export function findFamiliesNeedingProposerPass(repoRoot, families = ALLOWED_FAMILIES) {
  const needing = [];
  for (const family of families) {
    const dir = join(repoRoot, HARNESS_RUNS_REL, family);
    const { runs } = readRunHistory(dir);
    if (runs.length < 2) continue; // F28 rule (d): nothing to compare a first run against
    const passPath = join(dir, "LAST-PROPOSER-PASS.md");
    const passContent = existsSync(passPath) ? readFileSync(passPath, "utf8") : null;
    const problems = auditProposerAttestation(family, runs, passContent);
    if (problems.length > 0) {
      needing.push({ family, runs, latest: runs.at(-1), problems });
    }
  }
  return needing;
}

/**
 * Write the Haiku proposer-lane brief for one family, per PROPOSER-RUNBOOK.md §1-2's attestation shape.
 * The pass itself is dispatched by the coordinator as a Haiku lane (this script never calls a model) —
 * this file is that lane's brief.
 */
export function writeProposerBrief(outPath, { family, runs, latest }) {
  const artifactIds = runs.map((r) => r.run_id).join(", ");
  const traceRefs = [...new Set(runs.flatMap((r) => r.full_trace_refs || []))];
  const body = `# Proposer-lane brief — ${family} family (Haiku lane)

Generated by \`scripts/lib/assemble-train.mjs\` after folding new artifacts into this family's history.
Follow \`fsi-app/scripts/harness-runs/PROPOSER-RUNBOOK.md\` §1-2 exactly; this brief only supplies the
inputs, it does not shortcut the reading.

## 1. Artifacts to read, in order (readRunHistory's own sort — ascending \`started_at\`)

${artifactIds}

Read every field of every one of the above, not just \`metrics\` — see PROPOSER-RUNBOOK.md §1 step 2.

## 2. Full traces to open (§1 step 3 — the non-negotiable step; do not skip to \`metrics\`/\`defects_found\`)

${traceRefs.length ? traceRefs.map((r) => `- ${r}`).join("\n") : "(none recorded — note this explicitly in the attestation; do not fabricate paths)"}

## 3. This family's standing metric (CONVENTION.md)

Read \`CONVENTION.md\`'s "${family}'s standing metric" paragraph and report whether it moved between the
artifacts above, and in which direction.

## 4. What to write back

\`${HARNESS_RUNS_REL}/${family}/LAST-PROPOSER-PASS.md\`, in the §2 attestation shape, naming
\`${latest.run_id}\` VERBATIM (F28 rule (d) checks for exactly that string). "None warranted" is a
legitimate outcome ONLY with a basis tied to a specific \`defects_found\` entry or full-trace observation —
never a default for skipping the reading.
`;
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, body);
  return outPath;
}

// ── (c) dispatch-ledger rows, derived from the artifacts just folded ────────────────────────────────────

const HARNESS_ARTIFACT_RE = /(?:^|\/)scripts\/harness-runs\/([^/]+)\/([^/]+-run-\d+)\.json$/;

/**
 * Derive dispatch-ledger rows (docs/ops/dispatch-ledger.jsonl's own schema:
 * date/workflow/step/mode/run_id/outcome/note) for every harness-run artifact one folded branch added.
 * `branch` must carry `files` (from foldArtifactBranches' own return shape). Reads file content from the
 * branch ref's tree directly (`git show`), not the working copy, so this works whether or not the branch
 * has been checked out.
 */
export function deriveLedgerRowsForBranch(repoRoot, branch) {
  const workflow = BRANCH_PREFIX_TO_WORKFLOW[branch.prefix];
  const rows = [];
  for (const f of branch.files || []) {
    const m = HARNESS_ARTIFACT_RE.exec(f);
    if (!m) continue;
    const content = git(repoRoot, ["show", `${branch.ref}:${f}`], { allowFail: true });
    if (!content) continue;
    let artifact;
    try {
      artifact = JSON.parse(content);
    } catch {
      continue; // F28 already reports an unparseable artifact; this derivation just skips it honestly
    }
    const mode = artifact.config && typeof artifact.config.mode === "string" ? artifact.config.mode : null;
    const defects = Array.isArray(artifact.defects_found) ? artifact.defects_found.length : 0;
    const outcome =
      mode === "apply" || mode === "execute" ? (defects === 0 ? "applied" : "reported") : "reported";
    rows.push({
      date: (artifact.started_at || "").slice(0, 10) || null,
      workflow,
      step: null,
      mode,
      run_id: branch.runId,
      outcome,
      note:
        `assemble-train derived from ${branch.shortRef} (${artifact.run_id}): ` +
        `${metricHeadline(artifact.metrics)} — coordinator: verify and edit this note`,
    });
  }
  return rows;
}

/** Append rows (newline-delimited JSON, matching the live file's own shape) to the ledger. */
export function appendDispatchLedgerRows(ledgerPath, rows) {
  if (!rows || rows.length === 0) return;
  const lines = rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
  mkdirSync(dirname(ledgerPath), { recursive: true });
  writeFileSync(ledgerPath, lines, { flag: "a" });
}

// ── (d) gates + the bundle command ───────────────────────────────────────────────────────────────────

/** One gate: run a command in `repoRoot`, capture pass/fail and output (never throws). */
function runOne(repoRoot, label, cmd, args) {
  try {
    const output = execFileSync(cmd, args, { cwd: repoRoot, encoding: "utf8" });
    return { label, ok: true, output };
  } catch (err) {
    const output = (err.stdout ? err.stdout.toString() : "") + (err.stderr ? err.stderr.toString() : "");
    return { label, ok: false, output };
  }
}

/**
 * The standing gate set (lane-common-contract.md "Gates before handoff" + the plan's F25/closure-gate/
 * override-check additions), run against the assembled tree. `repoRoot` is the checkout ROOT (the
 * directory containing `fsi-app/`), matching every gate's own documented invocation point.
 */
export function runGateSet(repoRoot) {
  const fsiApp = join(repoRoot, "fsi-app");
  return [
    runOne(fsiApp, "suite", "bash", [".discipline/run-test-suite.sh"]),
    runOne(repoRoot, "fitness", "node", ["fsi-app/.discipline/fitness/runner.mjs"]),
    runOne(repoRoot, "closure-gate", "node", ["fsi-app/.discipline/governance/closure-gate.mjs"]),
    runOne(repoRoot, "override-check", "node", [
      "fsi-app/.discipline/consistency/override-check.mjs",
      "--range=origin/master..HEAD",
    ]),
  ];
}

/** The exact `git bundle` command the browser-transport procedure's first step runs. */
export function bundleCommand(trainBranch, { remote = "origin", outPath } = {}) {
  const path = outPath || `/tmp/${trainBranch.replace(/\//g, "-")}.bundle`;
  return `git bundle create ${path} ${remote}/master..${trainBranch}`;
}

// ── (e) prune, after landing ─────────────────────────────────────────────────────────────────────────

/**
 * Classify every artifact branch against `referenceBranch` (normally `<remote>/master`, AFTER the train
 * has landed): `dead` branches' content is already fully present there (safe to delete); `live` branches
 * still carry something not yet on `referenceBranch`.
 */
export function classifyBranches(repoRoot, referenceBranch, remote = "origin") {
  const branches = listArtifactBranches(repoRoot, remote);
  const dead = [];
  const live = [];
  for (const b of branches) {
    const files = branchFiles(repoRoot, b.ref, referenceBranch);
    if (files !== null && isAlreadyFolded(repoRoot, b.ref, referenceBranch, files)) {
      dead.push({ ...b, files });
    } else {
      live.push({ ...b, files: files || [] });
    }
  }
  return { dead, live };
}

/**
 * Delete every branch in `dead` from `remote`. Dry by default (returns the commands it WOULD run);
 * `execute: true` actually runs `git push <remote> --delete <name>` — the coordinator's own --prune flag,
 * from a checkout that can push (this container cannot; see this file's header).
 */
export function pruneDeadBranches(repoRoot, dead, { remote = "origin", execute = false } = {}) {
  const results = [];
  for (const b of dead) {
    const cmd = `git push ${remote} --delete ${b.shortRef}`;
    if (!execute) {
      results.push({ ...b, command: cmd, ran: false });
      continue;
    }
    try {
      git(repoRoot, ["push", remote, "--delete", b.shortRef]);
      results.push({ ...b, command: cmd, ran: true });
    } catch (err) {
      results.push({ ...b, command: cmd, ran: false, error: err.message });
    }
  }
  return results;
}

/** ISO commit dates of the last `limit` `train/wave<N>...` commits reachable from `ref`, newest first. */
export function findTrainLandingDates(repoRoot, ref, limit = 5) {
  const out = git(repoRoot, ["log", ref, "--format=%cI %s", "-n", "500"], { allowFail: true });
  if (!out) return [];
  const dates = [];
  for (const line of out.split("\n")) {
    const sp = line.indexOf(" ");
    if (sp < 0) continue;
    const date = line.slice(0, sp);
    const subject = line.slice(sp + 1);
    if (/^train\/wave\d+/.test(subject)) {
      dates.push(date);
      if (dates.length >= limit) break;
    }
  }
  return dates;
}

/**
 * Of the still-`live` (not-yet-folded) branches, the ones whose tip predates the MOST RECENT train
 * already landed on `referenceBranch` — i.e. they have already survived one full train cycle unfolded.
 * This is the mechanical check behind the plan's W1.6 done-condition, "no artifact branch older than one
 * train on origin".
 */
export function findStaleUnfoldedBranches(repoRoot, liveBranches, referenceBranch, remote = "origin") {
  const trainDates = findTrainLandingDates(repoRoot, referenceBranch, 1);
  const cutoff = trainDates[0] ?? null;
  if (!cutoff) return [];
  const cutoffMs = Date.parse(cutoff);
  const stale = [];
  for (const b of liveBranches) {
    const tipDate = git(repoRoot, ["log", "-1", "--format=%cI", b.ref], { allowFail: true });
    if (tipDate && Date.parse(tipDate) < cutoffMs) stale.push({ ...b, tipDate });
  }
  return stale;
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { train: null, remote: "origin", steps: new Set(), ledgerPath: null, briefDir: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--train") args.train = argv[++i];
    else if (a === "--remote") args.remote = argv[++i];
    else if (a === "--ledger-path") args.ledgerPath = argv[++i];
    else if (a === "--brief-dir") args.briefDir = argv[++i];
    else if (a === "--fold") args.steps.add("fold");
    else if (a === "--propose") args.steps.add("propose");
    else if (a === "--ledger") args.steps.add("ledger");
    else if (a === "--gates") args.steps.add("gates");
    else if (a === "--bundle") args.steps.add("bundle");
    else if (a === "--prune") args.steps.add("prune");
    else if (a === "--all") ["fold", "propose", "ledger", "gates", "bundle"].forEach((s) => args.steps.add(s));
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.train) {
    console.error("Usage: node scripts/lib/assemble-train.mjs --train <branch> [--fold --propose --ledger --gates --bundle | --all | --prune]");
    process.exitCode = 1;
    return;
  }
  const repoRoot = resolve(HERE, "..", "..", ".."); // fsi-app/scripts/lib -> repo root
  const fsiRel = "fsi-app";
  const ledgerPath = args.ledgerPath || join(repoRoot, "docs/ops/dispatch-ledger.jsonl");

  if (args.steps.has("fold")) {
    const { folded, alreadyFolded, conflicts } = foldArtifactBranches(repoRoot, args.train, { remote: args.remote });
    console.log(`Folded: ${folded.length}, already folded: ${alreadyFolded.length}, conflicts: ${conflicts.length}`);
    for (const c of conflicts) console.error(`CONFLICT ${c.shortRef}: ${c.error}`);

    if (args.steps.has("ledger")) {
      const rows = folded.flatMap((b) => deriveLedgerRowsForBranch(repoRoot, b));
      appendDispatchLedgerRows(ledgerPath, rows);
      console.log(`Appended ${rows.length} dispatch-ledger row(s) to ${ledgerPath}`);
    }
  }

  if (args.steps.has("propose")) {
    const needing = findFamiliesNeedingProposerPass(join(repoRoot, fsiRel));
    const briefDir = args.briefDir || join(repoRoot, "docs/dispatches");
    for (const n of needing) {
      const outPath = join(briefDir, `proposer-brief-${n.family}-${args.train.replace(/\//g, "-")}.md`);
      writeProposerBrief(outPath, n);
      console.log(`Proposer brief needed: ${n.family} -> ${outPath}`);
    }
    if (needing.length === 0) console.log("No family needs a fresh proposer pass.");
  }

  if (args.steps.has("gates")) {
    const results = runGateSet(repoRoot);
    for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"} ${r.label}`);
  }

  if (args.steps.has("bundle")) {
    console.log(bundleCommand(args.train, { remote: args.remote }));
  }

  if (args.steps.has("prune")) {
    const referenceBranch = `${args.remote}/master`;
    const { dead, live } = classifyBranches(repoRoot, referenceBranch, args.remote);
    const results = pruneDeadBranches(repoRoot, dead, { remote: args.remote, execute: true });
    for (const r of results) console.log(`${r.ran ? "DELETED" : "FAILED "} ${r.shortRef}`);
    const stale = findStaleUnfoldedBranches(repoRoot, live, referenceBranch, args.remote);
    if (stale.length) {
      console.log("Branches older than one train, still NOT folded:");
      for (const s of stale) console.log(`  ${s.shortRef} (tip ${s.tipDate})`);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
