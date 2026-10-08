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
// EXPIRY DATE; the gate fails once the clock passes it, so an allowlist entry cannot
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
//                          owning train reference; if it does not, and the row's last-touched commit date is
//                          more than STALE_NEXT_WINDOW_DAYS before the ledger-derived clock, it fails.
//   3. WRITER-READER      — every table created by a migration numbered >= 266 must have both a code
//                          writer and a code reader (or SQL-level reference); a table with only one side
//                          fails unless allowlisted with the plan item that closes it.
//   4. LANE-CONTRACT      — docs/dispatches/lane-common-contract.md must carry the plan's §0 definition
//                          of done verbatim, so every brief that cites the contract inherits it.
//
// NO TRAIN COUNTER (lane GATE-8, 2026-10-08, coordinator ruling after AUD-AT-5). The old counter (the highest
// `train/wave<N>` commit reachable from HEAD) had not advanced since 2026-09-11, so every age and every
// allowlist expiry measured against it was frozen. Age is now a DATE: STALE-NEXT measures a row's last-touched
// commit date against the clock below; an allowlist expiry is an ISO `until` date (as NEVER_RUN_DORMANT's is).
// The clock is the harness ledger export's capturedAt, else its newest run date, else the wall clock (ledgerClock).
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
import { readHarnessLedgerExport, newestLedgerRunAt } from '../../scripts/lib/run-artifact.mjs';
import { BUILD_MODE } from './build-mode.mjs';
import { hasWorkflowTrigger } from '../fitness/lib/yml-read.mjs';
import { recordGateFirings } from '../lib/gate-firings.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..'); // dotfiles repo root
const FSI = 'fsi-app';

const DAY_MS = 24 * 60 * 60 * 1000;
/** NEVER-RUN window: a target with no harness_runs row inside it is overdue (lane GATE-3, 2026-10-08). */
export const NEVER_RUN_WINDOW_DAYS = 30;
export const NEVER_RUN_WINDOW_DAYS_BUILD_MODE = 90;
/** STALE-NEXT window: days a NEXT row may go untouched, with no owning train, before it gates (the three-train grace was about three weeks). */
export const STALE_NEXT_WINDOW_DAYS = 21;
const MIGRATIONS_SINCE = 266; // WRITER-READER scope: tables created by migrations numbered >= this

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// SHARED: the clock (lane GATE-8, 2026-10-08, AUD-AT-5 ruling)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * The one clock every check reads: derived from the harness ledger export, the same source NEVER-RUN uses, never
 * from a counter. `capturedAt` when the export has one; else the newest run date in its rows; else the wall clock
 * (no export means there is nothing to derive from, the same fallback NEVER-RUN takes). Pure.
 * @param {{present?: boolean, capturedAt?: string|null, rows?: object[]}} ledger
 * @param {Date} [wall] injected wall clock for the no-export fallback
 * @returns {{ now: Date, source: 'ledger-captured-at'|'ledger-newest-run'|'wall-clock' }}
 */
export function ledgerClock(ledger, wall = new Date()) {
  if (ledger?.capturedAt && !Number.isNaN(Date.parse(ledger.capturedAt))) {
    return { now: new Date(ledger.capturedAt), source: 'ledger-captured-at' };
  }
  let newest = null;
  for (const r of ledger?.rows ?? []) {
    const t = Date.parse(r?.started_at);
    if (!Number.isNaN(t) && (newest === null || t > newest)) newest = t;
  }
  if (newest !== null) return { now: new Date(newest), source: 'ledger-newest-run' };
  return { now: wall, source: 'wall-clock' };
}

/** Validate a dated, reasoned exemption entry (`{disposition, until}`); returns a problem string or null. */
function exemptionProblem(label, entry, now) {
  if (!entry || !entry.disposition || !entry.until || Number.isNaN(Date.parse(entry.until))) {
    return `${label} needs a disposition and an ISO until date.`;
  }
  if (now.getTime() >= Date.parse(entry.until)) return `${label} EXPIRED on ${entry.until}: ${entry.disposition}`;
  return null;
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

/** True iff the workflow file's top-level `on:` key declares `workflow_dispatch`, in any of the three forms
 *  (`on: workflow_dispatch`, `on: [push, workflow_dispatch]`, and the block mapping). Lane GATE-8 (2026-10-08,
 *  AUD-AT-4 B7-02): the earlier test read only the block form, so a dispatchable workflow written in the scalar or
 *  list form was never held to the NEVER-RUN window at all. */
export function isDispatchable(yamlText) {
  return hasWorkflowTrigger(yamlText || '', 'workflow_dispatch');
}

/**
 * PURE CORE (lane GATE-3, 2026-10-08: the train counter and the allowlist are gone). `targets`:
 * [{ id, introducedAt: Date|null, newestRunAt: Date|null }],
 * where `newestRunAt` is the newest harness_runs row date for the target's workflow family (or maintenance
 * step) from the ledger export. `now`: the reference Date. `windowDays`: 30, or 90 in BUILD_MODE.
 *
 * Overdue means one of:
 *   - the newest ledger row is older than the window ("last ran N days ago");
 *   - there is NO ledger row and the target itself is older than the window (a target introduced inside the
 *     window has had no chance to run yet).
 *
 * EVIDENCE IS THE LEDGER EXPORT AND NOTHING ELSE (lane GATE-8, 2026-10-08, AUD-AT-4 B7-03). A tracked run
 * artifact and a runbook "run #N" sentence used to count as "it has run, the ledger just cannot date it". Both
 * are files a person can write: any "run 1" in the step's runbook section satisfied the gate. They are gone; a
 * dispatch that happened is a harness_runs row, and the export is regenerated from that table.
 */
export function checkNeverRun({ targets, now, windowDays = NEVER_RUN_WINDOW_DAYS, dormant = {}, ledgerPresent = false }) {
  const failures = [];
  const days = (from) => Math.floor((now.getTime() - from.getTime()) / DAY_MS);
  const overdue = [];
  for (const t of targets) {
    if (t.newestRunAt) {
      const age = days(t.newestRunAt);
      if (age > windowDays) {
        overdue.push({ id: t.id, reason: `NEVER-RUN: newest harness_runs row is ${age} days old (window ${windowDays} days). Dispatch it, then regenerate the harness ledger export.` });
      }
      continue;
    }
    // THE LEDGER IS THE AUTHORITY WHEN IT EXISTS (coordinator addition from AUD-AT-5, 2026-10-08). With the export
    // committed, "has this workflow ever run" is answered by it alone: a target with no ledger row has never run,
    // however young the target is, so a brand-new never-run workflow fails here instead of riding the window
    // (and no train counter or introduction date is consulted). Without the export there is nothing to ask, so the
    // age window below stays the only measure (zero evidence, never a hard failure: the export needs a credentialed
    // refresh).
    if (ledgerPresent) {
      overdue.push({ id: t.id, reason: `NEVER-RUN: the harness ledger export holds no run of ${t.id}. Dispatch it, then regenerate the harness ledger export.` });
      continue;
    }
    if (!t.introducedAt) continue; // unknown age: nothing to measure the window against
    const age = days(t.introducedAt);
    if (age > windowDays) {
      overdue.push({ id: t.id, reason: `NEVER-RUN: introduced ${age} days ago and the harness ledger export holds no run of it (window ${windowDays} days). Dispatch it, then regenerate the harness ledger export.` });
    }
  }
  // A dated, reasoned exemption (lane GATE-8): it holds a dormant workflow out of the window until a date, and it
  // is audited both ways. It expires (the exemption becomes the failure), and an entry whose target is no longer
  // overdue, or no longer exists, is stale and fails the gate.
  const allowlistIssues = [];
  const overdueIds = new Set(overdue.map((o) => o.id));
  for (const o of overdue) {
    const ex = dormant[o.id];
    if (!ex) { failures.push(o); continue; }
    if (!ex.reason || !ex.until || Number.isNaN(Date.parse(ex.until))) {
      failures.push({ id: o.id, reason: `NEVER-RUN exemption for ${o.id} needs a reason and an ISO until date.` });
    } else if (now.getTime() >= Date.parse(ex.until)) {
      failures.push({ id: o.id, reason: `NEVER-RUN exemption EXPIRED on ${ex.until}: ${o.reason} Exemption reason was: ${ex.reason}` });
    }
  }
  for (const id of Object.keys(dormant)) {
    if (!overdueIds.has(id)) allowlistIssues.push(`NEVER_RUN_DORMANT["${id}"] is no longer overdue or no longer a target; remove the entry.`);
  }
  return { ok: failures.length === 0 && allowlistIssues.length === 0, failures, allowlistIssues };
}

/**
 * Dispatch-only workflows held out of the NEVER-RUN window until a date (lane GATE-8, 2026-10-08). Each was invisible
 * to this check until the on: reader was fixed: the old reader cut the on: block at the first column-0 comment
 * line, which all three carry (the commented-out schedule), so none was ever seen as dispatchable. They record no
 * harness family, so the ledger can never evidence them, and they are dormant by the build-mode ruling (CLAUDE.md
 * standing rule 16, ADR-023: no standing schedules during build, every runtime by explicit dispatch). The decision is
 * either to dispatch each once and regenerate the ledger export, or to delete the workflow; the date forces it.
 */
const DORMANT_REASON = 'Dormant by the build-mode ruling (standing rule 16, ADR-023): dispatch-only, schedule commented out, no harness family, so no ledger row can exist. Exposed by the GATE-8 on: reader fix. Dispatch it once or delete the workflow.';
export const NEVER_RUN_DORMANT = Object.freeze({
  'workflow:data-audit-lane.yml': { reason: DORMANT_REASON, until: '2026-11-30' },
  'workflow:source-monitoring.yml': { reason: DORMANT_REASON, until: '2026-11-30' },
  'workflow:spot-check-monthly.yml': { reason: DORMANT_REASON, until: '2026-11-30' },
});

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
 * PURE CORE. `rows`: [{ line, raw, lastTouchedAt }] (lastTouchedAt: a Date, the commit date the row's current
 * text last landed in, or null when git cannot date it). `now`: the ledger-derived clock (ledgerClock). `windowDays`:
 * how many days a NEXT row may sit untouched. `allowlist`: { [row-raw-text]: {disposition, until} } where `until`
 * is an ISO date. An undated row cannot be proven fresh, so it is treated as stale.
 */
export function checkStaleNext({ rows, now, windowDays = STALE_NEXT_WINDOW_DAYS, allowlist = {} }) {
  const failures = [];
  const allowlistIssues = [];
  for (const r of rows) {
    if (hasOwningTrain(r.raw)) continue; // names its own owning train — passes regardless of age
    const age = r.lastTouchedAt ? Math.floor((now.getTime() - r.lastTouchedAt.getTime()) / DAY_MS) : null;
    const stale = age === null || age > windowDays;
    const key = r.raw.trim();
    const al = allowlist[key];
    if (stale) {
      if (al) {
        const problem = exemptionProblem(`STALE-NEXT allowlist entry for line ${r.line}`, al, now);
        if (problem) failures.push({ line: r.line, reason: `STALE-NEXT, ${problem}` });
      } else {
        const how = age === null ? 'an undated row' : `untouched for ${age} days (window ${windowDays})`;
        failures.push({ line: r.line, reason: `STALE-NEXT: docs/PROGRAM-BOARD.md:${r.line} is NEXT, ${how}, with no owning train name: "${r.raw.trim().slice(0, 120)}"` });
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
 * `allowlist`: { [table]: {disposition, until} } where `until` is an ISO date. `now`: the ledger-derived clock
 * (ledgerClock) for the expiry check; a ratchet-only allowlist entry fails once its own `until` date has passed,
 * same as STALE-NEXT; optional so the pure core stays testable without a clock when expiry isn't the point of a
 * given fixture.
 */
export function checkWriterReader({ migrationTexts, codeFiles, allowlist = {}, minMigration = MIGRATIONS_SINCE, now = null }) {
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
    } else if (now !== null) {
      const problem = exemptionProblem(`WRITER_READER_ALLOWLIST["${table}"]`, al, now);
      if (problem) failures.push({ table, reason: `WRITER-READER, ${problem}` });
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

// The six conditions of the definition of done, in order. Lane GATE-8 (2026-10-08, AUD-AT-4 B7-08): the marker as a
// heading on its own line (not inside a quotation or a code span) AND the six numbered conditions below it. The
// earlier test was a substring match, so the marker kept as a quoted line over a gutted section passed.
export const LANE_CONTRACT_CONDITIONS = ['Reachable', 'Run', 'Populated', 'Visible', 'Gated', 'Documented'];

export function checkLaneContract(contractText) {
  const text = String(contractText || '');
  const lines = text.split(/\r?\n/);
  const at = lines.findIndex((l) => l.trimEnd() === LANE_CONTRACT_MARKER);
  let present = at >= 0;
  if (present) {
    const next = lines.findIndex((l, i) => i > at && /^## /.test(l));
    const section = lines.slice(at + 1, next < 0 ? lines.length : next).join('\n');
    let from = 0;
    for (let i = 0; i < LANE_CONTRACT_CONDITIONS.length; i++) {
      const m = new RegExp(`^${i + 1}\\. \\*\\*${LANE_CONTRACT_CONDITIONS[i]}\\*\\*`, 'm').exec(section.slice(from));
      if (!m) { present = false; break; }
      from += m.index + m[0].length;
    }
  }
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

// PERF (lane M9b, 2026-09-18). MEASURED: `gatherNeverRunTargets`
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
// `community-topics-seed` precedent, never a silent rename-in-place), the two agree, and the window
// this feeds (NEVER_RUN_WINDOW_DAYS) has no practical sensitivity to a same-commit-cluster
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
  // scripts/harness-runs/producers/family.json), but neither was ever added here, so the family lookup
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
// workflow with no family mapping gets no ledger date. Prose and committed artifacts are not evidence (see checkNeverRun).
export function gatherNeverRunTargets({ ledger = readHarnessLedgerExport(REPO) } = {}) {
  const maintYaml = readRepo('.github/workflows/maintenance.yml') || '';
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
  // line-porcelain: a full header per line, "<hash> <orig> <final> [<count>]" then "committer-time <epoch>".
  const perLineDate = [];
  if (blameOut) {
    let finalLine = null;
    for (const l of blameOut.split('\n')) {
      const hdr = /^[0-9a-f]{40}\s+\d+\s+(\d+)/.exec(l);
      if (hdr) { finalLine = Number(hdr[1]); continue; }
      const ct = /^committer-time\s+(\d+)/.exec(l);
      if (ct && finalLine !== null) perLineDate[finalLine] = new Date(Number(ct[1]) * 1000);
    }
  }
  return rows.map((r) => ({ line: r.line, raw: r.raw, lastTouchedAt: perLineDate[r.line] || null }));
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
//    DATE (`until`); stale entries and expired entries both fail the gate - see checkStaleNext/checkWriterReader
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
  return checkNeverRun({ targets: gatherNeverRunTargets({ ledger }), now, windowDays, dormant: NEVER_RUN_DORMANT, ledgerPresent: ledger.present === true });
}

export function runStaleNextLive() {
  const { now } = ledgerClock(readHarnessLedgerExport(REPO));
  return checkStaleNext({ rows: gatherStaleNextRows(), now, allowlist: STALE_NEXT_ALLOWLIST });
}

export function runWriterReaderLive() {
  const { now } = ledgerClock(readHarnessLedgerExport(REPO));
  return checkWriterReader({ migrationTexts: gatherMigrationTexts(), codeFiles: gatherCodeFiles(), allowlist: WRITER_READER_ALLOWLIST, now });
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
  return { ok, clock: ledgerClock(readHarnessLedgerExport(REPO)), neverRun, staleNext, writerReader, laneContract };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

if (process.argv[1] && process.argv[1].endsWith('closure-gate.mjs')) {
  const report = argvHas('--report');
  const r = runClosureGate();
  // every refusal is a logged firing (lane GATE-8, 2026-10-08); a passing gate clears its records
  recordGateFirings('closure-gate', [
    ...r.neverRun.failures.map((f) => ({ message: f.reason, file: f.id })),
    ...r.neverRun.allowlistIssues.map((m) => ({ message: m })),
    ...r.staleNext.failures.map((f) => ({ message: f.reason, line: f.line, file: 'docs/PROGRAM-BOARD.md' })),
    ...r.staleNext.allowlistIssues.map((m) => ({ message: m })),
    ...r.writerReader.failures.map((f) => ({ message: f.reason, file: f.table })),
    ...r.writerReader.allowlistIssues.map((m) => ({ message: m })),
    ...r.laneContract.failures.map((f) => ({ message: f.reason, file: 'docs/dispatches/lane-common-contract.md' })),
  ]);
  console.log('\n===== CLOSURE GATE =====');
  console.log(`clock: ${r.clock.now.toISOString()} (${r.clock.source})`);
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

    console.log('\n--- ALLOWLIST (disposition, until) ---');
    for (const [key, e] of Object.entries(STALE_NEXT_ALLOWLIST)) console.log(`  STALE-NEXT     ${key.slice(0, 60)}...  until ${e.until}: ${e.disposition}`);
    for (const [table, e] of Object.entries(WRITER_READER_ALLOWLIST)) console.log(`  WRITER-READER  ${table}  until ${e.until}: ${e.disposition}`);
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
