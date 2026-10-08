// CLOSURE GATE — the missing enforcement named by docs/plans/complete-system-build-plan-2026-09-04.md
// §"Why the previous plans stopped short" and built by W7.5. THE DEFECT [CONFIRMED, that section]:
// nothing fails when a maintenance step or workflow has never run, when a docs/PROGRAM-BOARD.md row
// stays NEXT across trains, when a migrated table has a writer and no reader (or the reverse), or when
// a lane brief lacks the §0 done-conditions. Four plans in the last month promised completion of the
// same components this audit found unfinished, because "done" was tracked by prose nothing reads back.
// This is a governance check (same shape as invariant-coverage.mjs / doctrine-contradiction.mjs): a
// PURE, injectable core per check (fixture-testable, red-then-green) plus a git/fs-driven live runner,
// wired as its own step in .github/workflows/discipline.yml's test-discipline-engine job — it runs in
// CI on every train, exactly where the meta-gate runs, not folded into the per-file fitness runner
// (all four checks are holistic, whole-tree analyses, not per-file scans).
//
// FOUR CHECKS. STALE-NEXT and WRITER-READER are RATCHET-ONLY (an allowlist entry names a disposition + an
// EXPIRY TRAIN; the gate fails once the current train passes that expiry, so an allowlist entry cannot
// become a permanent exemption by silence - same non-negotiable shape as F23's GAP_BASELINE and F30's
// baseline, applied per-item instead of per-category because these are individually named things, not a
// count). NEVER-RUN has no allowlist and no train counter (lane GATE-3, 2026-10-08):
//
//   1. NEVER-RUN        - every maintenance.yml step and every other dispatchable workflow must show a
//                          harness_runs row within the last 30 days (90 in BUILD_MODE), judged from the
//                          committed harness ledger export (harness-ledger-export.json). The clock is the
//                          newest row date per workflow family (per step for maintenance); a target with no
//                          row is overdue only once it is older than the window itself, and a target with
//                          undated evidence (a tracked run artifact, a runbook run record) but no ledger row
//                          is not overdue. The train counter had not advanced for 27 days (last train commit
//                          2026-09-11), so a workflow introduced since could never become overdue.
//   2. STALE-NEXT        — a docs/PROGRAM-BOARD.md row whose status cell is NEXT/"next:" must carry an
//                          owning train reference; if it does not, and the row has not been touched in
//                          N=3 trains, it fails.
//   3. WRITER-READER      — every table created by a migration numbered >= 266 must have both a code
//                          writer and a code reader (or SQL-level reference); a table with only one side
//                          fails unless allowlisted with the plan item that closes it.
//   4. LANE-CONTRACT      — docs/dispatches/lane-common-contract.md must carry the plan's §0 definition
//                          of done verbatim, so every brief that cites the contract inherits it.
//
// TRAIN NUMBERING: this repo's own convention — a squash-merged commit whose subject matches
// `train/wave<N>` (verified 2026-09-04: every such commit is a single-parent commit on master, not a
// merge commit, so `git merge-base --is-ancestor` gives an exact "which train first carried this commit"
// answer without needing a first-parent walk or a hand-kept registry). N is read directly from the
// commit subject; the CURRENT train is the highest N reachable from HEAD. A commit that predates every
// train commit maps to train 0 ("pre-window").
//
// REUSE, NOT A COPY (CLAUDE.md: no copies of logic). Check 3 does NOT reimplement table/writer/reader
// scanning — it calls this directory's OWN producer-consumer-orphan.mjs (`scanSchema`, `scanCode`,
// `scanSql`, `buildOrphanReport`), which already computes both write-orphans (a writer, no reader) and
// read-orphans (a reader, no writer) over the whole schema/code graph. This check only narrows the
// SCHEMA input to tables created by migrations >= 266 before calling the same pure core, and gates BOTH
// orphan classes (F14/that module gates write-orphans only; read-orphans there are informational).
//
// FS + GIT ONLY. No network, no DB, no model call, no schedule — git log/show/merge-base and file reads
// against the checked-out tree. Safe to run on every push/PR alongside the other meta-gates.

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { scanSchema, scanCode, scanSql, buildOrphanReport } from './producer-consumer-orphan.mjs';
import { readHarnessLedgerExport, newestLedgerRunAt } from '../../scripts/lib/run-artifact.mjs';
import { BUILD_MODE } from './build-mode.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..'); // dotfiles repo root
const FSI = 'fsi-app';

const DAY_MS = 24 * 60 * 60 * 1000;
/** NEVER-RUN window: a target with no harness_runs row inside it is overdue (lane GATE-3, 2026-10-08). */
export const NEVER_RUN_WINDOW_DAYS = 30;
export const NEVER_RUN_WINDOW_DAYS_BUILD_MODE = 90;
const STALE_NEXT_TRAIN_GRACE = 3; // N — trains a NEXT row may go untouched, with no owning train, before it gates
const MIGRATIONS_SINCE = 266; // WRITER-READER scope: tables created by migrations numbered >= this

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// SHARED: train numbering
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

/** Parse `git log --oneline` text into ascending {wave, hash} pairs (train/waveN commits only). */
export function parseTrainCommits(logText) {
  const out = [];
  for (const line of (logText || '').split('\n')) {
    const m = /^([0-9a-f]+)\s+train\/wave(\d+)\b/.exec(line);
    if (m) out.push({ hash: m[1], wave: Number(m[2]) });
  }
  out.sort((a, b) => a.wave - b.wave);
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// CHECK 1 — NEVER-RUN
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

/** Extract the workflow_dispatch step-id list from maintenance.yml's `options: [all, a, b, ...]` line. */
export function parseMaintenanceSteps(yamlText) {
  const m = /step:[\s\S]*?options:\s*\[([^\]]+)\]/.exec(yamlText || '');
  if (!m) return [];
  return m[1].split(',').map((s) => s.trim()).filter((s) => s && s !== 'all');
}

/** True iff the workflow file's top-level `on:` block declares `workflow_dispatch`. */
export function isDispatchable(yamlText) {
  const onBlock = /^on:\s*\n([\s\S]*?)(?:\n\S|\n$|$)/m.exec(yamlText || '');
  const scope = onBlock ? onBlock[1] : yamlText || '';
  return /workflow_dispatch\s*:/.test(scope);
}

/**
 * UNDATED evidence of a real dispatch for one target (a maintenance step, or a whole workflow): a tracked
 * harness run artifact, or a run record in the runbook. Neither carries a trustworthy date, so neither can
 * start the NEVER-RUN clock; they only say the target has run at some time. Pure - takes pre-gathered
 * evidence booleans, no fs/git of its own.
 */
export function hasRunEvidence({ harnessArtifact, runbookRecord }) {
  return Boolean(harnessArtifact || runbookRecord);
}

/**
 * PURE CORE (lane GATE-3, 2026-10-08: the train counter and the allowlist are gone). `targets`:
 * [{ id, introducedAt: Date|null, newestRunAt: Date|null, evidence: {harnessArtifact, runbookRecord} }],
 * where `newestRunAt` is the newest harness_runs row date for the target's workflow family (or maintenance
 * step) from the ledger export. `now`: the reference Date. `windowDays`: 30, or 90 in BUILD_MODE.
 *
 * Overdue means one of:
 *   - the newest ledger row is older than the window ("last ran N days ago"), whatever else is on record;
 *   - there is NO ledger row, no undated evidence either, and the target itself is older than the window
 *     (a target introduced inside the window has had no chance to run yet).
 * A target with no ledger row but undated evidence is not overdue: it has run, the ledger just cannot date
 * it, and the clock cannot be read from nothing.
 */
export function checkNeverRun({ targets, now, windowDays = NEVER_RUN_WINDOW_DAYS }) {
  const failures = [];
  const days = (from) => Math.floor((now.getTime() - from.getTime()) / DAY_MS);
  for (const t of targets) {
    if (t.newestRunAt) {
      const age = days(t.newestRunAt);
      if (age > windowDays) {
        failures.push({ id: t.id, reason: `NEVER-RUN: newest harness_runs row is ${age} days old (window ${windowDays} days). Dispatch it, then regenerate the harness ledger export.` });
      }
      continue;
    }
    if (hasRunEvidence(t.evidence)) continue;
    if (!t.introducedAt) continue; // unknown age: nothing to measure the window against
    const age = days(t.introducedAt);
    if (age > windowDays) {
      failures.push({ id: t.id, reason: `NEVER-RUN: introduced ${age} days ago, no harness_runs row, harness artifact or runbook run record (window ${windowDays} days).` });
    }
  }
  return { ok: failures.length === 0, failures, allowlistIssues: [] };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// CHECK 2 — STALE-NEXT
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

const NEXT_STATUS_RE = /^\|\s*\*{0,2}(?:NEXT\b[^|]*|next:[^|]*)\*{0,2}\s*\|/i;
// A row "owns" a train when it names one directly: this repo's train/waveN tag, the plan's TNN train
// labels (complete-system-build-plan-2026-09-04.md §3), or a bare "Train N" mention (session-log style).
const TRAIN_OWNER_RE = /\btrain\/wave\d+\b|\bT\d{2,3}\b|\btrain\s+#?\d+\b/i;

/** Find every markdown table row whose FIRST cell is a NEXT status. Returns [{line, raw}] (1-indexed). */
export function findNextRows(boardText) {
  const rows = [];
  const lines = (boardText || '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (NEXT_STATUS_RE.test(lines[i])) rows.push({ line: i + 1, raw: lines[i] });
  }
  return rows;
}

export function hasOwningTrain(rowText) {
  return TRAIN_OWNER_RE.test(rowText || '');
}

/**
 * PURE CORE. `rows`: [{ line, raw, lastTouchedTrain }] (lastTouchedTrain: the train ordinal the row's
 * current text last landed in, or null if it predates every known train). `currentTrain`: number.
 * `allowlist`: { [line-fingerprint]: {disposition, expiryTrain} } keyed by the row's raw text.
 */
export function checkStaleNext({ rows, currentTrain, allowlist = {} }) {
  const failures = [];
  const allowlistIssues = [];
  for (const r of rows) {
    if (hasOwningTrain(r.raw)) continue; // names its own owning train — passes regardless of age
    const age = r.lastTouchedTrain == null ? currentTrain : currentTrain - r.lastTouchedTrain;
    const stale = age > STALE_NEXT_TRAIN_GRACE;
    const key = r.raw.trim();
    const al = allowlist[key];
    if (stale) {
      if (al) {
        if (currentTrain > al.expiryTrain) {
          failures.push({ line: r.line, reason: `STALE-NEXT, allowlist EXPIRED at train ${al.expiryTrain} (now train ${currentTrain}): ${al.disposition}` });
        }
      } else {
        failures.push({ line: r.line, reason: `STALE-NEXT: docs/PROGRAM-BOARD.md:${r.line} has been NEXT for ${age} trains with no owning train name — "${r.raw.trim().slice(0, 120)}"` });
      }
    } else if (al) {
      allowlistIssues.push(`STALE_NEXT_ALLOWLIST[…] entry for line ${r.line} is stale (no longer overdue) — remove it: "${key.slice(0, 80)}"`);
    }
  }
  const currentKeys = new Set(rows.map((r) => r.raw.trim()));
  for (const key of Object.keys(allowlist)) {
    if (!currentKeys.has(key)) allowlistIssues.push(`STALE_NEXT_ALLOWLIST["${key.slice(0, 60)}…"] no longer matches any NEXT row (text changed or row resolved) — stale entry, remove it.`);
  }
  return { ok: failures.length === 0 && allowlistIssues.length === 0, failures, allowlistIssues };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// CHECK 3 — WRITER-READER (reuses producer-consumer-orphan.mjs's pure core; see file header)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

export function migrationNumber(path) {
  const m = /\/(\d+)_[^/]*\.sql$/.exec(path || '');
  return m ? Number(m[1]) : null;
}

/**
 * PURE CORE. `migrationTexts`: [{file, content}] (ALL migrations — SQL-level reads may live in an
 * earlier migration than the table itself, e.g. a later view). `codeFiles`: [{file, content}].
 * `allowlist`: { [table]: {disposition, expiryTrain} }. `currentTrain`: number (for the expiry check —
 * a ratchet-only allowlist entry fails once its own expiry train has passed, same as the other two
 * checks; optional so the pure core stays testable without a train number when expiry isn't the point
 * of a given fixture).
 */
export function checkWriterReader({ migrationTexts, codeFiles, allowlist = {}, minMigration = MIGRATIONS_SINCE, currentTrain = null }) {
  const recentMigrationTexts = (migrationTexts || []).filter((m) => {
    const n = migrationNumber(m.file);
    return n !== null && n >= minMigration;
  });
  const recentSchema = scanSchema(recentMigrationTexts);
  const code = scanCode(codeFiles || []);
  const sql = scanSql(migrationTexts || []); // all migrations, for SQL-level reads of the recent tables
  const report = buildOrphanReport({ schema: recentSchema, code, sql, allowlist: {} });

  const failures = [];
  const allowlistIssues = [];
  const offending = new Map(); // table -> {kind, detail}
  for (const o of report.writeOrphans) offending.set(o.table, { kind: 'writer, no reader', detail: o.writers[0] });
  for (const o of report.readOrphans) offending.set(o.table, { kind: 'reader, no writer', detail: o.readers[0] });

  for (const [table, info] of offending) {
    const al = allowlist[table];
    if (!al) {
      failures.push({ table, reason: `WRITER-READER: "${table}" (migration >= ${minMigration}) has a ${info.kind} — ${info.detail.file}:${info.detail.line}. Wire the missing side, or allowlist with the plan item that closes it.` });
    } else if (currentTrain !== null && currentTrain > al.expiryTrain) {
      failures.push({ table, reason: `WRITER-READER, allowlist EXPIRED at train ${al.expiryTrain} (now train ${currentTrain}): ${al.disposition}` });
    }
  }
  // stale allowlist audit — a table no longer offending, or no longer in the recent-migration window
  for (const table of Object.keys(allowlist)) {
    if (!recentSchema.tables.has(table)) {
      allowlistIssues.push(`WRITER_READER_ALLOWLIST["${table}"] names a table not created by any migration >= ${minMigration} — stale entry, remove it.`);
    } else if (!offending.has(table)) {
      allowlistIssues.push(`WRITER_READER_ALLOWLIST["${table}"] is no longer a writer/reader orphan (both sides now exist) — remove it so the allowlist stays honest.`);
    }
  }
  return { ok: failures.length === 0 && allowlistIssues.length === 0, failures, allowlistIssues, summary: report.summary };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// CHECK 4 — LANE-CONTRACT
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

// The exact heading the plan's §0 carries (complete-system-build-plan-2026-09-04.md line 61). Any brief
// that cites lane-common-contract.md inherits this the moment it is present verbatim in that file.
export const LANE_CONTRACT_MARKER = '## 0. Definition of done (applies to every component, no exceptions)';

export function checkLaneContract(contractText) {
  const present = (contractText || '').includes(LANE_CONTRACT_MARKER);
  return {
    ok: present,
    failures: present ? [] : [{ reason: `LANE-CONTRACT: docs/dispatches/lane-common-contract.md is missing the plan's §0 marker verbatim ("${LANE_CONTRACT_MARKER}"). Append §0 of docs/plans/complete-system-build-plan-2026-09-04.md so every brief that cites the contract inherits the definition of done.` }],
    allowlistIssues: [],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// LIVE DRIVER — git + fs. Everything above is pure and injectable; everything below gathers real input.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

function git(args) {
  return execFileSync('git', args, { cwd: REPO, encoding: 'utf8', maxBuffer: 1 << 26 }).trim();
}

function readRepo(rel) {
  try { return readFileSync(join(REPO, rel), 'utf8'); } catch { return null; }
}

function trackedFiles() {
  try { return git(['ls-files']).split('\n').filter(Boolean); } catch { return []; }
}

let _trainCache = null;
function trains() {
  if (_trainCache) return _trainCache;
  let log = '';
  try { log = git(['log', '--oneline', 'HEAD']); } catch { log = ''; }
  _trainCache = parseTrainCommits(log);
  return _trainCache;
}

function currentTrain() {
  const t = trains();
  return t.length ? t[t.length - 1].wave : 0;
}

function isAncestorOfTrain(commitHash, trainHash) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', commitHash, trainHash], { cwd: REPO, stdio: 'ignore' });
    return true; // exit 0 = commitHash is an ancestor of (or equal to) trainHash
  } catch {
    return false;
  }
}

// PERF (lane M9b, 2026-09-18, stage-audit-2026-09-18 s6-gates-harness.md: "closure-gate.mjs no longer
// finishes locally inside a short budget"). MEASURED, not assumed: on this tree (59 trains), one
// `merge-base --is-ancestor` spawn costs ~215ms; gatherNeverRunTargets calls trainOf() once per
// maintenance.yml step (62 steps) plus once per other dispatchable workflow (~18 files). The ORIGINAL
// implementation above (kept as a comment for the reasoning trail, not live code) scanned `trains()`
// oldest-to-newest and spawned one `merge-base` call PER TRAIN until it found a match -- for a step
// introduced near the newest train (most of the 62 maintenance.yml steps: this file has grown across many
// recent lanes), that is up to 59 spawns × ~215ms ≈ 12.7s for ONE step, times up to 80 targets ≈ minutes,
// exactly the multi-minute hang both local attempts hit.
//
// THE FIX: `trains()` is monotonic by construction (train commits are single-parent, chronologically
// ascending -- this file's own header) -- the boolean "is commitHash an ancestor of train[i].hash" is
// therefore FALSE-then-TRUE as i increases (once true for train i, it stays true for every later, newer
// train). That is exactly shaped for BINARY SEARCH: find the leftmost (lowest-wave) true in O(log trains)
// spawns instead of O(trains). One extra spawn up front checks the NEWEST train first -- if commitHash is
// not even an ancestor of that one, it cannot be an ancestor of any earlier train either (same monotonic
// fact), so the whole search short-circuits to `null` in a SINGLE spawn instead of scanning every train
// only to find nothing (the common case for a target introduced after every train commit was cut, or a
// null/unresolved intro commit). Also memoizes by commitHash within one process run -- this repo's own
// lanes commonly introduce several maintenance steps in the SAME commit, so repeat lookups for an
// identical hash (common across the 62-step list) now cost zero extra git spawns instead of a full
// re-search.
//
// MEASURED (this lane, same tree, same 62+18 targets): 90s+ (timed out, did not finish) -> ~2-4s. Before/
// after numbers with method are recorded in this lane's own report and docs/ops/session-log.md.
const _trainOfCache = new Map();

/** The lowest-wave train whose tree is a descendant-or-equal of `commitHash`. null if none found. */
function trainOf(commitHash) {
  if (!commitHash) return null;
  if (_trainOfCache.has(commitHash)) return _trainOfCache.get(commitHash);

  const list = trains(); // ascending by wave, by construction (parseTrainCommits sorts)
  let result = null;
  if (list.length && isAncestorOfTrain(commitHash, list[list.length - 1].hash)) {
    // commitHash IS an ancestor of the newest train -- binary-search the ascending list for the leftmost
    // (lowest-wave) train it is also an ancestor of.
    let lo = 0;
    let hi = list.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (isAncestorOfTrain(commitHash, list[mid].hash)) hi = mid;
      else lo = mid + 1;
    }
    result = list[lo].wave;
  }
  // else: not an ancestor of even the newest train -- no match anywhere in the ascending list (monotonic),
  // same `null` the original exhaustive scan would have returned after checking every train in vain.

  _trainOfCache.set(commitHash, result);
  return result;
}

// PERF (lane M9b, 2026-09-18, same finding as trainOf's header above). MEASURED: `gatherNeverRunTargets`
// used to call the ORIGINAL `introducingCommit(path, literal)` once per maintenance.yml step -- 62 separate
// `git log -S<literal> -- path` pickaxe spawns against the SAME file, ~349ms each on this tree (~18s
// total, isolated measurement, this lane's report). THE FIX: one `git log -p` scan of that file's WHOLE
// history (33 commits on this tree -- a small, one-time cost), split into per-commit chunks on an
// unambiguous `COMMIT_START <hash>` marker line (never a false match inside real diff content, unlike
// splitting on a bare hex-looking line start), then a single in-memory pass finds, for every literal still
// unresolved, the oldest commit whose diff ADDED a line containing it (a line starting with `+`, never the
// file-header `+++`). This is not byte-identical to pickaxe's own algorithm (`-S` fires on ANY change that
// alters a string's occurrence COUNT, which also catches a removal-then-re-add or a value edit that
// happens to change the count; this scan only catches a literal genuinely ADDED as new text) -- for a
// step-id token that is added once and never removed or rewritten (every step in maintenance.yml's
// `options:` list, by construction: retiring a step deletes its whole block, per lane REVIEW-WIRE's own
// `community-topics-seed` precedent, never a silent rename-in-place), the two agree, and the grace window
// this feeds (NEVER_RUN_TRAIN_GRACE = 3 trains) has no practical sensitivity to a same-commit-cluster
// off-by-one this class of divergence could ever produce.
function buildIntroducingCommitIndex(path, literals) {
  const remaining = new Set(literals);
  const found = new Map();
  if (remaining.size === 0) return found;

  let log = '';
  try {
    log = git(['log', '--reverse', '--format=COMMIT_START %H %cI', '-p', '--', path]);
  } catch {
    return found;
  }

  for (const chunk of log.split(/^COMMIT_START /m)) {
    if (remaining.size === 0) break;
    // The first element of the split is the empty text BEFORE the first marker: skip it. (Until lane GATE-3
    // this was `!chunk || ... break`, which ended the loop on that empty first element, so the index was
    // always empty and no maintenance step ever got an introduction date, hence was never gated.)
    if (!chunk) continue;
    const nl = chunk.indexOf('\n');
    if (nl === -1) continue;
    const date = chunk.slice(0, nl).trim().split(/\s+/)[1] ?? null; // "<hash> <committer date, ISO 8601>"
    const body = chunk.slice(nl + 1);
    for (const literal of remaining) {
      const hit = body
        .split('\n')
        .some((line) => line.startsWith('+') && !line.startsWith('+++') && line.includes(literal));
      if (hit) found.set(literal, date);
    }
    for (const literal of found.keys()) remaining.delete(literal);
  }
  return found;
}

// Same batching idea as buildIntroducingCommitIndex above, applied to introducingCommitForFile's own
// per-file "first commit that added this whole path" question: ONE `git log --diff-filter=A --name-only`
// scan across EVERY path at once (a single pathspec list, not one invocation per file) replaces one spawn
// per workflow file (~19 files, ~7s measured in isolation on this tree) with one.
function buildIntroducingCommitForFileIndex(paths) {
  const found = new Map();
  if (paths.length === 0) return found;

  let log = '';
  try {
    log = git(['log', '--reverse', '--diff-filter=A', '--name-only', '--format=COMMIT_START %H %cI', '--', ...paths]);
  } catch {
    return found;
  }

  for (const chunk of log.split(/^COMMIT_START /m)) {
    if (!chunk) continue;
    const nl = chunk.indexOf('\n');
    if (nl === -1) continue;
    const date = chunk.slice(0, nl).trim().split(/\s+/)[1] ?? null;
    const body = chunk.slice(nl + 1);
    for (const line of body.split('\n')) {
      const f = line.trim();
      if (f && !found.has(f)) found.set(f, date); // first (oldest) commit wins, --reverse already orders it
    }
  }
  return found;
}

const HARNESS_FAMILY_BY_WORKFLOW = {
  'population-turn.yml': 'mint',
  'corpus-turn.yml': 'forward-events',
  'source-sweep.yml': 'source-sweep',
  'ledger-consume.yml': 'ledger-consume',
  'change-detection.yml': 'change-detection',
  'propagation-drain.yml': 'propagation',
  // R22 (2026-10-02): two real, pre-existing gaps this lane's ledger-source swap surfaced ([CONFIRMED]
  // by the LIVE NEVER-RUN test going red on exactly these two workflows and no others): both already
  // register their own harness family (downstream-chain.yml's own header, "THIS WORKFLOW itself is now
  // a registered family (downstream-chain, scripts/harness-runs/downstream-chain)"; producers.yml calls
  // `deliver-artifact-branch.sh "Producers (mode=..., producer=...)"` against
  // scripts/harness-runs/producers/family.json), but neither was ever added here, so harnessArtifactExists
  // always evaluated them against `family=undefined` and the retired dispatch-ledger.jsonl's own stale,
  // hand-written `workflow:` rows were the ONLY evidence masking the gap.
  'downstream-chain.yml': 'downstream-chain',
  'producers.yml': 'producers',
  // Lane S1-E (2026-10-05): the source-resolution workflow records its own harness family, so its dispatch is
  // evidenced by that family's harness_runs rows once the coordinator fires it.
  'source-resolution.yml': 'source-resolution',
  // Lane GATES-2 (2026-10-05): live-smoke records its own harness family (its JSON report becomes the run artifact),
  // so its dispatch is evidenced by that family's harness_runs rows once the coordinator fires it.
  'live-smoke.yml': 'live-smoke',
  // Lane PROOF-1 (2026-10-07): chain-proof records its own harness family (counts and hashed ids, uploaded as a
  // workflow artifact; the job holds no production write credential, so a ledger row is a separate hand step).
  'chain-proof.yml': 'chain-proof',
};

function harnessArtifactExists(family) {
  if (!family) return false;
  const prefix = `${FSI}/scripts/harness-runs/${family}/`;
  return trackedFiles().some((f) => f.startsWith(prefix) && /-run-\d+\.json$/.test(f));
}

// RB-SPLIT (2026-10-04): the maintenance runbook is an index plus one file per step under
// docs/runbooks/maintenance.d/ (each file keeps its own "## N. `step`" heading verbatim). The evidence
// scan below reads the assembled corpus: the index first, then every step file in filename order, which
// is the original section order (zero padded numbers, then a/b/c suffixes, then the A<n> appendices).
export const RUNBOOK_INDEX_PATH = 'docs/runbooks/MAINTENANCE-RUNBOOK.md';
export const RUNBOOK_STEP_DIR = 'docs/runbooks/maintenance.d';

/** PURE. indexText: the index file text; stepFiles: [{ name, text }] in any order. */
export function assembleRunbookCorpus(indexText, stepFiles) {
  const ordered = [...stepFiles].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return [indexText || '', ...ordered.map((f) => f.text || '')].join('\n');
}

function readRunbookCorpus() {
  let names = [];
  try { names = readdirSync(join(REPO, RUNBOOK_STEP_DIR)).filter((n) => n.endsWith('.md')); } catch { names = []; }
  const stepFiles = names.map((name) => ({ name, text: readRepo(`${RUNBOOK_STEP_DIR}/${name}`) || '' }));
  return assembleRunbookCorpus(readRepo(RUNBOOK_INDEX_PATH) || '', stepFiles);
}

export function runbookHasRecord(runbookText, stepId) {
  if (!runbookText) return false;
  // Each step's own §N section header names the step in backticks; a run-id citation ("run #NN",
  // an Actions run id, or a live-SQL "landed") anywhere in that section is treated as dispatch evidence.
  const headerRe = new RegExp('^##\\s*\\S*\\s*`' + stepId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '`', 'm');
  const start = runbookText.search(headerRe);
  if (start === -1) return false;
  const rest = runbookText.slice(start + 1);
  const nextHeader = rest.search(/^##\s/m);
  const section = nextHeader === -1 ? rest : rest.slice(0, nextHeader);
  return /run\s*#?\d+|run[`" ]*\d{6,}|landed live/i.test(section);
}


// Lane GATE-3 (2026-10-08): the NEVER-RUN clock. Dispatch evidence is the committed harness ledger export
// (fsi-app/.discipline/governance/harness-ledger-export.json, the SAME "credentialed refresh, secret-less
// check" pattern db-catalog.json uses; scripts/lib/export-harness-ledger.mjs regenerates it from
// harness_runs). It is read through run-artifact.mjs's readHarnessLedgerExport, the one reader F28 also
// uses, so the two gates cannot disagree about what a ledger row is. An absent or malformed export is zero
// evidence, never a hard failure. The reference "now" is the export's own capturedAt when it has one, so the
// verdict is a pure function of committed files (a stale snapshot is not misread as a stale workflow); with
// no export it is the wall clock.
//
// A maintenance step is dated by the newest `maintenance` family row whose config.step is that step, or
// "all" (a single dispatch of maintenance.yml's `all` option ran every step dry, so it is real evidence for
// each). A workflow is dated by the newest row of its harness family (HARNESS_FAMILY_BY_WORKFLOW). A
// workflow with no family mapping gets no ledger date, only the undated evidence below.
export function gatherNeverRunTargets({ ledger = readHarnessLedgerExport(REPO) } = {}) {
  const maintYaml = readRepo('.github/workflows/maintenance.yml') || '';
  const runbookText = readRunbookCorpus();
  const targets = [];
  const asDate = (iso) => (iso ? new Date(iso) : null);

  const maintSteps = parseMaintenanceSteps(maintYaml);
  // PERF (lane M9b): ONE batched history scan for all step-id literals, not one pickaxe spawn each --
  // see buildIntroducingCommitIndex's own header.
  const maintIntroIndex = buildIntroducingCommitIndex('.github/workflows/maintenance.yml', maintSteps);

  for (const step of maintSteps) {
    targets.push({
      id: `maintenance:${step}`,
      introducedAt: asDate(maintIntroIndex.get(step) ?? null),
      newestRunAt: newestLedgerRunAt(ledger.rows, 'maintenance', (e) => e.config?.step === step || e.config?.step === 'all'),
      evidence: {
        harnessArtifact: false, // maintenance steps do not map 1:1 to harness families
        runbookRecord: runbookHasRecord(runbookText, step),
      },
    });
  }

  const workflowFiles = trackedFiles().filter((f) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(f));
  const dispatchableFiles = workflowFiles.filter((f) => {
    if (f.split('/').pop() === 'maintenance.yml') return false; // covered step-by-step above
    return isDispatchable(readRepo(f) || '');
  });
  // PERF (lane M9b): ONE batched history scan across every dispatchable workflow file at once -- see
  // buildIntroducingCommitForFileIndex's own header.
  const fileIntroIndex = buildIntroducingCommitForFileIndex(dispatchableFiles);

  for (const f of dispatchableFiles) {
    const name = f.split('/').pop();
    const family = HARNESS_FAMILY_BY_WORKFLOW[name];
    targets.push({
      id: `workflow:${name}`,
      introducedAt: asDate(fileIntroIndex.get(f) ?? null),
      newestRunAt: family ? newestLedgerRunAt(ledger.rows, family) : null,
      evidence: {
        harnessArtifact: harnessArtifactExists(family),
        runbookRecord: false,
      },
    });
  }
  return targets;
}

function gatherStaleNextRows() {
  const boardText = readRepo('docs/PROGRAM-BOARD.md') || '';
  const rows = findNextRows(boardText);
  if (rows.length === 0) return [];
  let blameOut = '';
  try { blameOut = git(['blame', '--line-porcelain', 'HEAD', '--', 'docs/PROGRAM-BOARD.md']); } catch { blameOut = ''; }
  // line-porcelain: a "<hash> <orig> <final> <count>" header per hunk, one hash covering `count` lines.
  const perLineHash = [];
  if (blameOut) {
    const lines = blameOut.split('\n');
    let hash = null;
    for (const l of lines) {
      const hdr = /^([0-9a-f]{40})\s+\d+\s+(\d+)(?:\s+(\d+))?/.exec(l);
      if (hdr) { hash = hdr[1]; perLineHash[Number(hdr[2])] = hash; }
    }
  }
  return rows.map((r) => ({
    line: r.line,
    raw: r.raw,
    lastTouchedTrain: trainOf(perLineHash[r.line] || null),
  }));
}

function gatherMigrationTexts() {
  return trackedFiles()
    .filter((f) => f.startsWith(`${FSI}/supabase/migrations/`) && f.endsWith('.sql'))
    .map((f) => ({ file: f, content: readRepo(f) || '' }));
}

function gatherCodeFiles() {
  return trackedFiles()
    .filter((f) =>
      (f.startsWith(`${FSI}/src/`) || f.startsWith(`${FSI}/scripts/`) || f.startsWith(`${FSI}/supabase/functions/`)) &&
      /\.(ts|tsx|mjs|js)$/.test(f) &&
      !/\.test\.mjs$|\.selftest\.mjs$/.test(f))
    .map((f) => ({ file: f, content: readRepo(f) || '' }));
}

// ── Allowlists for STALE-NEXT and WRITER-READER (ratchet-only: every entry names a disposition + an EXPIRY
//    TRAIN; stale entries and expired entries both fail the gate - see checkStaleNext/checkWriterReader
//    above). NEVER-RUN has none: lane GATE-3 (2026-10-08) deleted NEVER_RUN_ALLOWLIST with the train counter. ──

// Seeded 2026-09-04 from a LIVE run over docs/PROGRAM-BOARD.md (10 rows found — the plan's own §"Why
// the previous plans stopped short" cites "12 NEXT rows" system-wide; this gate scopes strictly to rows
// whose FIRST cell literally reads NEXT and carries no train-owning reference, which is 10 of the 12).
// KEY = the row's raw text, trimmed verbatim — an edit to the row (even a reword) invalidates the entry
// on purpose, so a changed row is re-reviewed rather than riding an old allowlist match.
//
// ALL 7 ENTRIES REMOVED (lane W71-D, 2026-09-05, docs/plans/complete-system-build-plan-2026-09-04.md
// §W7.5): every row these entries covered named work that later trains (5-68 per the addendum trail)
// had already finished — WO-17/21/13/22/23/14/24, ADR-022, the Node 20 bump, the severity-enum ruling,
// jurisdictionIso, WO-26, tag ratification and the corpus-turn/ledger-consume/change-detection dispatch
// chain — or was genuinely rule-16-deferred (SERIES_ITEM_MAP / the schedule re-arm). Each board row was
// rewritten in place (docs/PROGRAM-BOARD.md) to CLOSED/SUPERSEDED/DEFERRED with the train, Addendum or
// rule that closes it, so none of the 7 raw-text keys below matches any live NEXT row any more — a live
// run of checkStaleNext confirms 0 FAILING rows and 0 allowlist entries, per this file's own ratchet
// contract (an allowlist entry whose row no longer exists is stale, same rule the runner already
// enforces on itself).
export const STALE_NEXT_ALLOWLIST = {};

// Seeded 2026-09-04 from a LIVE run over migrations >= 266 (34 tables). The plan's own §4 seed list
// (assumption_register, entity_scope, statutory_computations, estimated_values, aggregate_query_log,
// community_promotion_transitions, carrier_compliance_pools, indexation_clauses) was checked by name
// first — [CONFIRMED] every one of them already has BOTH a code/SQL writer and a code/SQL reader on
// this tree (a migration-level FK REFERENCES counts as a reader, same rule producer-consumer-orphan.mjs
// already uses; e.g. carrier_compliance_pools is read via surcharge_audits.pool_id's FK). None of them
// is a writer-with-no-reader or reader-with-no-writer under THIS check's actual definition — the plan
// prose describes tables that are UNPOPULATED (a "Populated" §0 gap, a different axis this gate's WRITER-
// READER check does not claim to cover) or DESIGNED-ONLY by their own producer's admission (audit Gap
// #5), not code-level half-slices. The live run below found ZERO real orphans among the 34 tables; the
// allowlist is therefore empty by measurement, not by omission — the ratchet holds it at 0 going
// forward, so any new writer-only or reader-only table among migrations >= 266 fails immediately.
//
// entity_scope: entry RETIRED 2026-09-06 (Lane SCOPE-READER, operator ruling: "keep spec 08's scoping
// table, build the reader, and make every customer-facing corridor reference human-readable"). Its first
// reader now exists — src/lib/entities/corridor-scope.ts's listCorridorScopes()/
// listCorridorsTouchingJurisdictions() (`.from("entity_scope").select(...)`), consumed by the Market
// Intel carbon-cost overlay's corridor selector and the regulation detail "Corridors this applies on"
// block. With a real code reader now live it is no longer a write-orphan — the detector correctly flags
// a standing entry here as STALE, the same self-audit this allowlist already performed for
// entity_identifiers/portal_link_candidates above. See producer-consumer-orphan.mjs's matching
// retirement note (F14 TERMINAL_SINK_ALLOWLIST) for the fuller writeup.
export const WRITER_READER_ALLOWLIST = {};

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// RUN — one function per check, plus the combined report.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

export function runNeverRunLive() {
  const ledger = readHarnessLedgerExport(REPO);
  const now = ledger.capturedAt ? new Date(ledger.capturedAt) : new Date();
  const windowDays = BUILD_MODE ? NEVER_RUN_WINDOW_DAYS_BUILD_MODE : NEVER_RUN_WINDOW_DAYS;
  return checkNeverRun({ targets: gatherNeverRunTargets({ ledger }), now, windowDays });
}

export function runStaleNextLive() {
  return checkStaleNext({ rows: gatherStaleNextRows(), currentTrain: currentTrain(), allowlist: STALE_NEXT_ALLOWLIST });
}

export function runWriterReaderLive() {
  return checkWriterReader({ migrationTexts: gatherMigrationTexts(), codeFiles: gatherCodeFiles(), allowlist: WRITER_READER_ALLOWLIST, currentTrain: currentTrain() });
}

export function runLaneContractLive() {
  return checkLaneContract(readRepo('docs/dispatches/lane-common-contract.md'));
}

export function runClosureGate() {
  const neverRun = runNeverRunLive();
  const staleNext = runStaleNextLive();
  const writerReader = runWriterReaderLive();
  const laneContract = runLaneContractLive();
  const ok = neverRun.ok && staleNext.ok && writerReader.ok && laneContract.ok;
  return { ok, currentTrain: currentTrain(), neverRun, staleNext, writerReader, laneContract };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

if (process.argv[1] && process.argv[1].endsWith('closure-gate.mjs')) {
  const report = argvHas('--report');
  const r = runClosureGate();
  console.log('\n===== CLOSURE GATE =====');
  console.log(`current train: ${r.currentTrain}`);
  console.log(`1. NEVER-RUN     : ${line(r.neverRun)}`);
  console.log(`2. STALE-NEXT    : ${line(r.staleNext)}`);
  console.log(`3. WRITER-READER : ${line(r.writerReader)}  (summary: ${JSON.stringify(r.writerReader.summary)})`);
  console.log(`4. LANE-CONTRACT : ${line(r.laneContract)}`);

  if (report) {
    console.log('\n--- NEVER-RUN failures ---');
    for (const f of r.neverRun.failures) console.log(`  ✗ ${f.id}: ${f.reason}`);

    console.log('\n--- STALE-NEXT failures ---');
    for (const f of r.staleNext.failures) console.log(`  ✗ line ${f.line}: ${f.reason}`);
    console.log('--- STALE-NEXT allowlist issues ---');
    for (const i of r.staleNext.allowlistIssues) console.log(`  ⚠ ${i}`);

    console.log('\n--- WRITER-READER failures ---');
    for (const f of r.writerReader.failures) console.log(`  ✗ ${f.table}: ${f.reason}`);
    console.log('--- WRITER-READER allowlist issues ---');
    for (const i of r.writerReader.allowlistIssues) console.log(`  ⚠ ${i}`);

    console.log('\n--- LANE-CONTRACT failures ---');
    for (const f of r.laneContract.failures) console.log(`  ✗ ${f.reason}`);

    console.log('\n--- ALLOWLIST (train, disposition, expiry) ---');
    for (const [key, e] of Object.entries(STALE_NEXT_ALLOWLIST)) console.log(`  STALE-NEXT     ${key.slice(0, 60)}…  expiry train ${e.expiryTrain}  — ${e.disposition}`);
    for (const [table, e] of Object.entries(WRITER_READER_ALLOWLIST)) console.log(`  WRITER-READER  ${table}  expiry train ${e.expiryTrain}  — ${e.disposition}`);
  }

  console.log(`\n=== closure gate ${r.ok ? 'PASS' : 'FAIL'} ===`);
  process.exit(r.ok ? 0 : 1);
}

function line(result) {
  const parts = [];
  if (result.failures.length) parts.push(`${result.failures.length} FAILING`);
  if (result.allowlistIssues.length) parts.push(`${result.allowlistIssues.length} allowlist issue(s)`);
  return parts.length ? `FAIL — ${parts.join(', ')}` : 'PASS';
}

function argvHas(flag) {
  return process.argv.slice(2).includes(flag);
}
