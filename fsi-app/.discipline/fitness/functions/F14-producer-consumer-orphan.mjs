// F14: producer-consumer orphan (the half-slice defect detector). Fails on any NEW write-orphan —
// a table the application writes but nothing reads — beyond the reason-bearing, phase-tagged
// terminal-sink allowlist, and on a stale allowlist entry. The analyzer + allowlist + first-run report
// live in ../../governance/producer-consumer-orphan.mjs (pure core, negative-testable). Source:
// remediation-discipline (the half-slice defect class; A2 producer-consumer orphan check).

import { violation } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { readFile } from '../lib/file-content.mjs';
import { replaySchema, buildReferenceReport } from '../../governance/db-object-reference.mjs';
import { runOrphanCheck, TERMINAL_SINK_ALLOWLIST } from '../../governance/producer-consumer-orphan.mjs';


// Facet B, formerly F47 (absorbed by REG-1, 2026-10-11): db-object-reference (lane L32, 2026-09-17). The system health audit found, by hand, 13 tables no
// code referenced and one trigger-written table nothing reads; no gate had ever counted them. This is the
// standing count: the committed schema (replayed statement by statement so it equals the live catalog)
// against every reference in code and SQL. Core in ../../governance/db-object-reference.mjs (pure,
// negative-tested); this file does the reads and holds the ratchets and the reason-bearing allowlist.
//
// THREE CHECKS. (1) UNREFERENCED tables: nothing in code or SQL names them; both-ways ratchet
// (UNREFERENCED_TABLES_CEILING), re-seeded down in the commit that drops or wires a table. (2) UNREAD
// tables: something writes them (a trigger, a script) and nothing reads them, the write-only class F14's
// code-writer view could not see; both-ways ratchet (UNREAD_TABLES_CEILING). (3) UNREFERENCED functions:
// strict zero. The ALLOWLIST below carries operator decisions to keep an object the code does not touch,
// each with a reason and a date; the core audits it (a stale entry is a violation), so "candidate" cannot
// hide here.
//
// SCOPE. Migrations: fsi-app/supabase/migrations/*.sql. Code: fsi-app/src, fsi-app/scripts, .github (the
// F14 scope) minus tests, fixtures, _archive, harness-runs, _snapshots. Comments never count as references.
const MIGRATION_GLOBS = ['fsi-app/supabase/migrations/*.sql'];
const CODE_GLOBS = ['fsi-app/src/**/*.{mjs,js,ts,tsx}', 'fsi-app/scripts/**/*.{mjs,js,ts,tsx}', '.github/**/*.{yml,yaml}'];

function inCodeScope(f) {
  const p = String(f).replace(/\\/g, '/');
  if (/\.(test|npmtest|selftest|golden)\.(mjs|ts|tsx)$/.test(p)) return false;
  if (/\/fixtures\/|\/_archive\/|\/scripts\/harness-runs\/|\/scripts\/_snapshots\//.test(p)) return false;
  return true;
}

/** Operator decisions to keep an object the code does not reference. Reason and date are required. */
export const ALLOWLIST = {
  tables: {
    intelligence_summaries: {
      reason: 'SHELVED, not retired: operator decision 2026-04-30 (.claude/CLAUDE.md, Sector Activation). The rows stay for per-sector reporting; SectorSynopsisView reads full_brief meanwhile. Policies only in SQL; supabase-server.ts names it in a comment.',
      decidedOn: '2026-04-30',
    },
    system_state_flag_audit: {
      reason: 'Append-only audit trail of pause-flag writes (trigger guard_pause_flag_writer, migration 201); read by the operator through SQL when a pause is investigated, never by the app. Terminal sink by design.',
      decidedOn: '2026-09-17',
    },
  },
  // Empty since migration 371 (lane SEC-4, 2026-10-08): the one function it held (the unscheduled gate-a health cache
  // writer, operator ruling 2026-08-10, migration 256) is now referenced by migration 371's class E grant, so its entry
  // would be a stale allowlist violation.
  functions: {
    acquire_funded_pass_lock: { reason: 'Run-lock function of migration 205 whose only caller, scripts/lib/funded-pass-lock.mjs, was deleted by REG-1 (2026-10-11) with the live-writing golden that exercised it (RD-38 retired). Drop owed by a migration lane; the allowlist audit reports this entry stale once the function is dropped.', decidedOn: '2026-10-11' },
    heartbeat_funded_pass_lock: { reason: 'Run-lock function of migration 205 whose only caller, scripts/lib/funded-pass-lock.mjs, was deleted by REG-1 (2026-10-11) with the live-writing golden that exercised it (RD-38 retired). Drop owed by a migration lane; the allowlist audit reports this entry stale once the function is dropped.', decidedOn: '2026-10-11' },
    release_funded_pass_lock: { reason: 'Run-lock function of migration 205 whose only caller, scripts/lib/funded-pass-lock.mjs, was deleted by REG-1 (2026-10-11) with the live-writing golden that exercised it (RD-38 retired). Drop owed by a migration lane; the allowlist audit reports this entry stale once the function is dropped.', decidedOn: '2026-10-11' },
  },
};

/** Committed ceilings. Re-seed DOWN in the commit that drops or wires an object; never up. */
export const UNREFERENCED_TABLES_CEILING = 0; // seeded 0 by lane L32 after migration 324 dropped drain_worklist (the one unreferenced table)
export const UNREAD_TABLES_CEILING = 0; // seeded 0 by lane L32: the write-only tables carry allowlist entries with their reasons above (down to two, lane m9c 2026-09-18: migration 326 dropped community_promotion_transitions rather than allowlisting it)

export function scanTree() {
  const migrationTexts = globFiles(MIGRATION_GLOBS).sort().map((file) => ({ file, content: readFile(file) }));
  const codeFiles = globFiles(CODE_GLOBS).filter(inCodeScope).map((file) => ({ file, content: readFile(file) }));
  const schema = replaySchema(migrationTexts);
  // F14's terminal-sink allowlist (reason-bearing, reviewByPhase) governs the write-only class here too: one
  // allowlist for one defect, never a second copy of the same decisions.
  const tables = { ...Object.fromEntries(Object.entries(TERMINAL_SINK_ALLOWLIST).map(([k, v]) => [k, { reason: v.reason, decidedOn: v.decidedOn || v.reviewByPhase || 'F14 allowlist' }])), ...ALLOWLIST.tables };
  return { schema, migrations: migrationTexts.length, codeFiles: codeFiles.length, ...buildReferenceReport({ schema, codeFiles, migrationTexts, allowlist: { tables, functions: ALLOWLIST.functions } }) };
}

const names = (rows) => rows.map((r) => r.name).join(', ');

/** Facet B (formerly F47): unreferenced and unread tables against their ceilings, dead functions at zero. */
export function checkDbObjectReference() {
    const r = scanTree();
    const out = [];
    for (const a of r.allowlistIssues) out.push(violation(1, `ALLOWLIST: ${a.kind} ${a.name}: ${a.issue}`));
    const u = r.unreferencedTables.length;
    if (u > UNREFERENCED_TABLES_CEILING) out.push(violation(1, `REGRESSION: ${u} unreferenced table(s), ceiling ${UNREFERENCED_TABLES_CEILING}: ${names(r.unreferencedTables)}. Wire a reader or drop the table with a migration; a keep needs an ALLOWLIST entry with a reason and a date.`));
    else if (u < UNREFERENCED_TABLES_CEILING) out.push(violation(1, `IMPROVEMENT: ${u} unreferenced table(s), ceiling ${UNREFERENCED_TABLES_CEILING}. Re-seed UNREFERENCED_TABLES_CEILING to ${u} in this same commit.`));
    const w = r.unreadTables.length;
    if (w > UNREAD_TABLES_CEILING) out.push(violation(1, `REGRESSION: ${w} table(s) written but never read, ceiling ${UNREAD_TABLES_CEILING}: ${names(r.unreadTables)}. Build the reader, drop the writer and the table, or allowlist a terminal sink with its reason.`));
    else if (w < UNREAD_TABLES_CEILING) out.push(violation(1, `IMPROVEMENT: ${w} unread table(s), ceiling ${UNREAD_TABLES_CEILING}. Re-seed UNREAD_TABLES_CEILING to ${w} in this same commit.`));
    if (r.unreferencedFunctions.length) out.push(violation(1, `DEAD FUNCTION(S): ${names(r.unreferencedFunctions)}. Nothing in code or SQL calls them: wire a caller or drop them with a migration.`));
    return out;
}

/** Facet A (the original F14): write-orphans against the terminal-sink allowlist. */
export function checkProducerConsumerOrphan() {
    const r = runOrphanCheck();
    const violations = [];
    for (const o of r.gatingOrphans) {
      const w = o.writers[0];
      violations.push(
        violation(
          1,
          `WRITE-ORPHAN (half-slice): table "${o.table}" is written by app code but read by nothing — writer ${w.file}:${w.line}. ` +
            `Wire a reader, or allowlist it in producer-consumer-orphan.mjs TERMINAL_SINK_ALLOWLIST with a reason + reviewByPhase (a legitimate write-only audit sink).`,
        ),
      );
    }
    for (const issue of r.allowlistIssues) {
      violations.push(violation(1, `ALLOWLIST STALE: ${issue}`));
    }
    return violations;
}

export const fitnessFunction = {
  id: 'F14',
  name: 'producer-consumer-orphan-and-db-object-reference',
  description:
    'Liveness of database objects. Facet B (formerly F47): tables the committed schema defines that nothing references, and tables something writes but nothing reads, must equal their committed ceilings; functions nothing references are zero; keep-decisions live in a reason-bearing allowlist that is itself audited. Facet A: No NEW write-orphan (a table app code writes but nothing reads) beyond the reason-bearing, phase-tagged terminal-sink allowlist; the allowlist must not go stale. The half-slice defect detector (A2).',
  source: 'remediation-discipline (half-slice defect class; A2 producer-consumer orphan check)',

  // Holistic: the whole producer-consumer graph is analysed once, not per-file. enumerate returns a
  // single sentinel so the runner invokes check() exactly once.
  enumerate() {
    return ['fsi-app/.discipline/fitness/functions/F14-producer-consumer-orphan.mjs'];
  },

  check() {
    return [...checkProducerConsumerOrphan(), ...checkDbObjectReference()];
  },
};
