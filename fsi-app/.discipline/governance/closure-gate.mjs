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
// FOUR CHECKS, each RATCHET-ONLY (an allowlist entry names a disposition + an EXPIRY TRAIN; the gate
// fails once the current train passes that expiry, so an allowlist entry cannot become a permanent
// exemption by silence — same non-negotiable shape as F23's GAP_BASELINE and F30's baseline, applied
// per-item instead of per-category because these are individually named things, not a count):
//
//   1. NEVER-RUN        — every maintenance.yml step and every other dispatchable workflow must show
//                          evidence of a real dispatch within N=3 trains of its own introduction.
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

import { readFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { scanSchema, scanCode, scanSql, buildOrphanReport } from './producer-consumer-orphan.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..'); // dotfiles repo root
const FSI = 'fsi-app';

const NEVER_RUN_TRAIN_GRACE = 3; // N — trains of grace after introduction before NEVER-RUN gates
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
 * Evidence of a real dispatch for one target (a maintenance step, or a whole workflow), from the three
 * named sources. Pure — takes pre-gathered evidence booleans, no fs/git of its own.
 */
export function hasRunEvidence({ harnessArtifact, runbookRecord, ledgerEntry }) {
  return Boolean(harnessArtifact || runbookRecord || ledgerEntry);
}

/**
 * PURE CORE. `targets`: [{ id, introducedTrain, evidence: {harnessArtifact, runbookRecord, ledgerEntry} }]
 * `currentTrain`: number. `allowlist`: { [id]: {disposition, expiryTrain} }.
 */
export function checkNeverRun({ targets, currentTrain, allowlist = {} }) {
  const failures = [];
  const allowlistIssues = [];
  for (const t of targets) {
    const ran = hasRunEvidence(t.evidence);
    const age = t.introducedTrain == null ? null : currentTrain - t.introducedTrain;
    const overdue = !ran && age !== null && age > NEVER_RUN_TRAIN_GRACE;
    const al = allowlist[t.id];
    if (overdue) {
      if (al) {
        if (currentTrain > al.expiryTrain) {
          failures.push({ id: t.id, reason: `NEVER-RUN, allowlist EXPIRED at train ${al.expiryTrain} (now train ${currentTrain}): ${al.disposition}` });
        }
      } else {
        failures.push({ id: t.id, reason: `NEVER-RUN: introduced train ${t.introducedTrain}, no dispatch evidence (harness artifact / runbook record / ledger entry) ${age} trains later (grace ${NEVER_RUN_TRAIN_GRACE}).` });
      }
    } else if (al && (ran || age === null || age <= NEVER_RUN_TRAIN_GRACE)) {
      allowlistIssues.push(`NEVER_RUN_ALLOWLIST["${t.id}"] is stale — the target now has run evidence or is within grace; remove the entry.`);
    }
  }
  // audit: allowlist entries naming a target that no longer exists at all
  const ids = new Set(targets.map((t) => t.id));
  for (const id of Object.keys(allowlist)) {
    if (!ids.has(id)) allowlistIssues.push(`NEVER_RUN_ALLOWLIST["${id}"] names a target that no longer exists (maintenance step removed / workflow deleted) — stale entry, remove it.`);
  }
  return { ok: failures.length === 0 && allowlistIssues.length === 0, failures, allowlistIssues };
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

/** The lowest-wave train whose tree is a descendant-or-equal of `commitHash`. null if none found. */
function trainOf(commitHash) {
  if (!commitHash) return null;
  for (const t of trains()) {
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', commitHash, t.hash], { cwd: REPO, stdio: 'ignore' });
      return t.wave; // exit 0 = commitHash is an ancestor of (or equal to) t.hash
    } catch { /* not an ancestor of this train — try the next (ascending) */ }
  }
  return null;
}

/** First (oldest) commit whose diff introduced `literal` into `path`, via pickaxe, oldest-first. */
function introducingCommit(path, literal) {
  try {
    const out = git(['log', '--reverse', '--oneline', `-S${literal}`, '--', path]);
    const first = out.split('\n')[0] || '';
    const m = /^([0-9a-f]+)/.exec(first);
    return m ? m[1] : null;
  } catch { return null; }
}

/** First (oldest) commit that added `path` at all. */
function introducingCommitForFile(path) {
  try {
    const out = git(['log', '--reverse', '--diff-filter=A', '--oneline', '--', path]);
    const first = out.split('\n')[0] || '';
    const m = /^([0-9a-f]+)/.exec(first);
    return m ? m[1] : null;
  } catch { return null; }
}

const HARNESS_FAMILY_BY_WORKFLOW = {
  'population-turn.yml': 'mint',
  'corpus-turn.yml': 'forward-events',
  'source-sweep.yml': 'source-sweep',
  'ledger-consume.yml': 'ledger-consume',
  'change-detection.yml': 'change-detection',
  'propagation-drain.yml': 'propagation',
};

function harnessArtifactExists(family) {
  if (!family) return false;
  const prefix = `${FSI}/scripts/harness-runs/${family}/`;
  return trackedFiles().some((f) => f.startsWith(prefix) && /-run-\d+\.json$/.test(f));
}

/** Machine-readable dispatch ledger, seeded and appended by the coordinator. See ledger doc header. */
function readDispatchLedger() {
  const text = readRepo('docs/ops/dispatch-ledger.jsonl');
  if (!text) return [];
  const out = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try { out.push(JSON.parse(t)); } catch { /* malformed line — ignored, not fatal to the gate */ }
  }
  return out;
}

function runbookHasRecord(runbookText, stepId) {
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

function gatherNeverRunTargets() {
  const maintYaml = readRepo('.github/workflows/maintenance.yml') || '';
  const runbookText = readRepo('docs/runbooks/MAINTENANCE-RUNBOOK.md') || '';
  const ledger = readDispatchLedger();
  const targets = [];

  for (const step of parseMaintenanceSteps(maintYaml)) {
    const id = `maintenance:${step}`;
    const intro = introducingCommit('.github/workflows/maintenance.yml', step);
    const ledgerEntry = ledger.some((e) => e.workflow === 'maintenance' && e.step === step && e.outcome && e.outcome !== 'error');
    targets.push({
      id,
      introducedTrain: trainOf(intro),
      evidence: {
        harnessArtifact: false, // maintenance steps do not map 1:1 to harness families
        runbookRecord: runbookHasRecord(runbookText, step),
        ledgerEntry,
      },
    });
  }

  const workflowFiles = trackedFiles().filter((f) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(f));
  for (const f of workflowFiles) {
    const name = f.split('/').pop();
    if (name === 'maintenance.yml') continue; // covered step-by-step above
    const yamlText = readRepo(f) || '';
    if (!isDispatchable(yamlText)) continue;
    const id = `workflow:${name}`;
    const intro = introducingCommitForFile(f);
    const family = HARNESS_FAMILY_BY_WORKFLOW[name];
    const ledgerEntry = ledger.some((e) => e.workflow === name.replace(/\.ya?ml$/, '') && e.outcome && e.outcome !== 'error');
    targets.push({
      id,
      introducedTrain: trainOf(intro),
      evidence: {
        harnessArtifact: harnessArtifactExists(family),
        runbookRecord: false,
        ledgerEntry,
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

// ── Allowlists (ratchet-only: every entry names a disposition + an EXPIRY TRAIN; stale entries and
//    expired entries both fail the gate — see checkNeverRun/checkStaleNext/checkWriterReader above). ──

// Seeded 2026-09-04 (train 36 base) from a live run on this tree. Each entry is a target this run
// FOUND overdue; the disposition names the plan item that closes it and the train by which it must.
export const NEVER_RUN_ALLOWLIST = {
  'maintenance:tier-opinions': {
    disposition: 'Lane ATTACH-SOURCES (W3.3, 2026-09-05) BUILT the deterministic writer this entry\'s prior disposition named as the closing condition: scripts/maintenance/tier-opinions.mjs now compares every sources.base_tier against host-authority.ts\'s classTierForHost (the class table), recording a source_tier_opinions row (opinion_source=host_class_table) on disagreement, via the SAME recordTierOpinion writer source-growth.ts already uses. The step is RUNNABLE and unit-tested (11 tests, no live DB). REMAINING before this entry can close: (1) coordinator applies migration 309 (adds host_class_table to the opinion_source CHECK — this lane wrote it but has no DB credentials to apply it), (2) one real maintenance dispatch (mode=dry then apply) against the live sources table, recorded in the runbook §2 section or docs/ops/dispatch-ledger.jsonl. T46 validation fails this entry if no such dispatch has landed by then.',
    expiryTrain: 46,
  },
  'maintenance:census-off-vertical': {
    disposition: 'Plan W2.2: the archive path is gated on ruling R-A (open) and has no schema column yet (census_worklist lacks archive columns); park path is a documented no-op. Executed under W2.2 once R-A lands. RE-GRANTED train 43 (expiry → 46): trains 38–43 were consumed by the speed emergency the operator declared 2026-09-04 18:05 (Addendum 85 ps 52); T45 executes the disposition, T46 validation fails this entry if it is still open.',
    expiryTrain: 46,
  },
  'maintenance:w1-dispositions': {
    disposition: 'Plan §"Tools already built": report-only step; R-C was taken 2026-09-03 per the plan\'s own text, so this now needs one real apply-mode dispatch to discharge — tracked as the plan\'s own first W7.5 failing row, executed via T45\'s w1-dispositions run. RE-GRANTED train 43 (expiry → 46): trains 38–43 were consumed by the speed emergency the operator declared 2026-09-04 18:05 (Addendum 85 ps 52); T45 executes the disposition, T46 validation fails this entry if it is still open.',
    expiryTrain: 46,
  },
  'maintenance:origin-class-backfill': {
    disposition: 'A1-runtimes.md §2 [HYPOTHESIS]: the runbook narrative implies R-E was accepted and applied, but no live SQL re-verification exists in this audit. Coordinator re-queries intelligence_items.origin_class distribution and records the outcome in docs/ops/dispatch-ledger.jsonl (or re-dispatches). RE-GRANTED train 43 (expiry → 46): trains 38–43 were consumed by the speed emergency the operator declared 2026-09-04 18:05 (Addendum 85 ps 52); T45 executes the disposition, T46 validation fails this entry if it is still open.',
    expiryTrain: 46,
  },
  'maintenance:spec09-reroute': {
    disposition: 'Plan W5.1 / audit Gap #5: blocked on a second entities kind=\'corridor\' row (only one exists); the step reports the gap rather than writing until the corridor spine grows. Closed under W5.1 or when W4.2\'s corridor seeding produces a second corridor. RE-GRANTED train 45 (expiry → 46): missed in train 43\'s re-grant; trains 38–45 were consumed by the speed emergency the operator declared 2026-09-04 18:05 (Addendum 85 ps 52–56); T46 validation fails this entry if the corridor spine still has one row and the step has still never run.',
    expiryTrain: 46,
  },
  'workflow:inspect-oil-bulletin.yml': {
    disposition: 'A1-runtimes.md §1 [HYPOTHESIS]: a one-off scouting tool, superseded once fetch-oil-bulletin.mjs shipped inside producers.yml (2026-08-30); last dispatch pre-dates the audit window by one day. Coordinator either retires the workflow (it has no further loop-stage role) or records a fresh dispatch. RE-GRANTED train 43 (expiry → 46): trains 38–43 were consumed by the speed emergency the operator declared 2026-09-04 18:05 (Addendum 85 ps 52); T45 executes the disposition, T46 validation fails this entry if it is still open.',
    expiryTrain: 46,
  },
  'maintenance:review-apply-provisional-sources': {
    disposition: 'Wired train 38 (lane REVIEW-WIRE); each needs a ruled digest (review-digests apply, then a .ruling.json the coordinator produces) before its first dry/apply dispatch, scheduled T44 per plan §3; the speed emergency (2026-09-04 18:05) took trains 38–43 first. Evidence: the maintenance artifact + a docs/ops/dispatch-ledger.jsonl entry.',
    expiryTrain: 46,
  },
  'maintenance:review-apply-canonical-candidates': {
    disposition: 'Wired train 38 (lane REVIEW-WIRE); each needs a ruled digest (review-digests apply, then a .ruling.json the coordinator produces) before its first dry/apply dispatch, scheduled T44 per plan §3; the speed emergency (2026-09-04 18:05) took trains 38–43 first. Evidence: the maintenance artifact + a docs/ops/dispatch-ledger.jsonl entry.',
    expiryTrain: 46,
  },
  'maintenance:review-apply-portal-links': {
    disposition: 'Wired train 38 (lane REVIEW-WIRE); each needs a ruled digest (review-digests apply, then a .ruling.json the coordinator produces) before its first dry/apply dispatch, scheduled T44 per plan §3; the speed emergency (2026-09-04 18:05) took trains 38–43 first. Evidence: the maintenance artifact + a docs/ops/dispatch-ledger.jsonl entry.',
    expiryTrain: 46,
  },
  'maintenance:review-apply-coverage-gaps': {
    disposition: 'Wired train 38 (lane REVIEW-WIRE); each needs a ruled digest (review-digests apply, then a .ruling.json the coordinator produces) before its first dry/apply dispatch, scheduled T44 per plan §3; the speed emergency (2026-09-04 18:05) took trains 38–43 first. Evidence: the maintenance artifact + a docs/ops/dispatch-ledger.jsonl entry.',
    expiryTrain: 46,
  },
};

// Seeded 2026-09-04 from a LIVE run over docs/PROGRAM-BOARD.md (10 rows found — the plan's own §"Why
// the previous plans stopped short" cites "12 NEXT rows" system-wide; this gate scopes strictly to rows
// whose FIRST cell literally reads NEXT and carries no train-owning reference, which is 10 of the 12).
// This lane's write set forbids touching docs/PROGRAM-BOARD.md itself (CLOSURE-GATE brief), so these are
// surfaced here for the coordinator to resolve under T46 (full-system validation), not silently fixed.
// KEY = the row's raw text, trimmed verbatim — an edit to the row (even a reword) invalidates the entry
// on purpose, so a changed row is re-reviewed rather than riding an old allowlist match.
export const STALE_NEXT_ALLOWLIST = {
  '| **NEXT** | The WO-17 reader (envelope select + index-vs-base cells) is the gate on arming the operations producers. Stage 4-6 surface build-out still needs a spec-from-repo pass per WO before any executor starts. U7 contract advance. ADR-022 (specificity-wins) still owed. Node 20 bump on `caros-ledge-backups` | scope §4 |': {
    disposition: 'Pre-dates train 5 (last touched 2026-08-29, c6c228ff). T46 full-system validation re-checks every WO-line row against §0; coordinator closes, re-owns to a train, or supersedes with the current wave plan. RE-GRANTED train 43 (expiry → 46): trains 38–43 were consumed by the speed emergency the operator declared 2026-09-04 18:05 (Addendum 85 ps 52); T45 executes the disposition, T46 validation fails this entry if it is still open.',
    expiryTrain: 46,
  },
  '| **NEXT** | Execute the ready four. Then WO-21/13. WO-22 needs one line. WO-23 needs a migration. WO-14 and WO-24 need Jason. U7 stays metered and operator-priced. Node 20 bump on `caros-ledge-backups` still open | scope §4 |': {
    disposition: 'Pre-dates train 5. Same WO-line series as the row above; T46 supersedes or closes. RE-GRANTED train 43 (expiry → 46): trains 38–43 were consumed by the speed emergency the operator declared 2026-09-04 18:05 (Addendum 85 ps 52); T45 executes the disposition, T46 validation fails this entry if it is still open.',
    expiryTrain: 46,
  },
  '| **NEXT** | WO-21 (rides behind WO-10, same file), WO-13 (ready, corrected scope), WO-22 (needs one line: `regions.iso_codes` into the operations select), WO-23 (needs a CHECK-widening migration). WO-14 and WO-24 need Jason. The taxonomy extraction needs a lane. U7 stays metered and operator-priced. Node 20 bump on `caros-ledge-backups` still open | scope §4 |': {
    disposition: 'Pre-dates train 5. Same WO-line series; T46 supersedes or closes. RE-GRANTED train 43 (expiry → 46): trains 38–43 were consumed by the speed emergency the operator declared 2026-09-04 18:05 (Addendum 85 ps 52); T45 executes the disposition, T46 validation fails this entry if it is still open.',
    expiryTrain: 46,
  },
  '| **NEXT** | WO-23 needs a CHECK-widening migration (both `org_watchlist` and `user_watchlist`). WO-14 and WO-24 still need Jason — WO-14 has no vault text at all, WO-24 has no join path to `emission_factors.corridor_id`. The severity-enum→UI-bucket mapping needs a ruling. `fetchWorkspaceResources` not populating `jurisdictionIso` is now a named gap. U7 stays metered and operator-priced. Node 20 bump on `caros-ledge-backups` still open | scope §4 |': {
    disposition: 'Pre-dates train 5. Same WO-line series; T46 supersedes or closes. RE-GRANTED train 43 (expiry → 46): trains 38–43 were consumed by the speed emergency the operator declared 2026-09-04 18:05 (Addendum 85 ps 52); T45 executes the disposition, T46 validation fails this entry if it is still open.',
    expiryTrain: 46,
  },
  '| **NEXT** | Nothing blocked. Optional: SERIES_ITEM_MAP ratification (attach series to `published_price_statistics`); re-arm schedules in one reviewed diff when build mode ends (operator call) | Addendum 48 |': {
    disposition: 'Genuinely blocked on the operator\'s own build-mode-end call (rule 16) — not a dropped thread, but still needs a train-owning reference or a CLOSED/DEFERRED state so the row stops reading as open work. Coordinator records the deferral explicitly. RE-GRANTED train 43 (expiry → 46): trains 38–43 were consumed by the speed emergency the operator declared 2026-09-04 18:05 (Addendum 85 ps 52); T45 executes the disposition, T46 validation fails this entry if it is still open.',
    expiryTrain: 46,
  },
  '| **NEXT (coordinator)** | corpus-turn (discovery + forward events) over the 53 items → next population slice (limit 50) → browser check of Market Intel / Operations / Research against live data →  → verify `intelligence_items` item_grade=record → ledger-consume plan → change-detection dry → FR + feed dry → ecb-fx and lc_lci_lev dry/apply; read each artifact against the live table | Addendum 84 postscript 7 |': {
    disposition: 'Superseded by dozens of later trains (Addendum 84 predates the current train regime by two trains\' worth of history). Coordinator marks DONE/CLOSED/SUPERSEDED and points to the current dispatch-next line in the latest session-log addendum. RE-GRANTED train 43 (expiry → 46): trains 38–43 were consumed by the speed emergency the operator declared 2026-09-04 18:05 (Addendum 85 ps 52); T45 executes the disposition, T46 validation fails this entry if it is still open.',
    expiryTrain: 46,
  },
  '| **NEXT** | WO-26 stamp → tag ratification → batch-003 records (mint-run-007) → EIA secret → FR + feed first walks (dry) → ledger consume hop | Addendum 82 postscript |': {
    disposition: 'Superseded by later trains (Addendum 82 predates the current train regime). Coordinator marks DONE/CLOSED/SUPERSEDED. RE-GRANTED train 43 (expiry → 46): trains 38–43 were consumed by the speed emergency the operator declared 2026-09-04 18:05 (Addendum 85 ps 52); T45 executes the disposition, T46 validation fails this entry if it is still open.',
    expiryTrain: 46,
  },
};

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
export const WRITER_READER_ALLOWLIST = {};

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// RUN — one function per check, plus the combined report.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

export function runNeverRunLive() {
  return checkNeverRun({ targets: gatherNeverRunTargets(), currentTrain: currentTrain(), allowlist: NEVER_RUN_ALLOWLIST });
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
    console.log('--- NEVER-RUN allowlist issues ---');
    for (const i of r.neverRun.allowlistIssues) console.log(`  ⚠ ${i}`);

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
    for (const [id, e] of Object.entries(NEVER_RUN_ALLOWLIST)) console.log(`  NEVER-RUN      ${id}  expiry train ${e.expiryTrain}  — ${e.disposition}`);
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
