// F47: db-object-reference (lane L32, 2026-09-17). The system health audit found, by hand, 13 tables no
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
import { violation } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { readFile } from '../lib/file-content.mjs';
import { replaySchema, buildReferenceReport } from '../../governance/db-object-reference.mjs';
import { TERMINAL_SINK_ALLOWLIST } from '../../governance/producer-consumer-orphan.mjs';

export const MIGRATION_GLOBS = ['fsi-app/supabase/migrations/*.sql'];
export const CODE_GLOBS = ['fsi-app/src/**/*.{mjs,js,ts,tsx}', 'fsi-app/scripts/**/*.{mjs,js,ts,tsx}', '.github/**/*.{yml,yaml}'];

export function inCodeScope(f) {
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
    pending_first_fetch: {
      reason: 'Queue written by the sources triggers (migration 065); its reader, the drain-first-fetch worker, was dissolved 2026-07-12 and the population is re-homed to the cadence-flip wiring unit (check-sources to runIntakeCycle; src/lib/intake/mint-item.ts header). A writer preceding a named-later reader; build mode holds the cadence off (rule 16). Live 2026-09-17: 1,388 rows (done 1,235, error 136, queued 12, skipped 5).',
      decidedOn: '2026-07-12',
    },
    case_study_endorsements: {
      reason: 'Unbuilt half of the Community surface (a core surface per caros-ledge-platform-intent): case studies have 6 rows and a trigger, endorsements 0 rows and no writer. The community rebuild dispatch either ships case studies or drops case_studies and this table together; review there.',
      decidedOn: '2026-09-17',
    },
  },
  functions: {
    gate_a_health_refresh: {
      reason: 'The gate_a_health_cache writer, deliberately UNSCHEDULED by operator ruling 2026-08-10 (migration 256): gate_a_health() reports the cache age so the dormancy is visible, and the operator runs the refresh by hand. Last computed_at live 2026-09-17: 2026-08-10 09:20 UTC.',
      decidedOn: '2026-08-10',
    },
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

export const fitnessFunction = {
  id: 'F47',
  name: 'db-object-reference',
  description:
    'Tables the committed schema defines that nothing in code or SQL references, and tables something writes ' +
    'but nothing reads, must equal their committed ceilings (above: an object lost its last reference or was ' +
    'born unreferenced; below: re-seed down in the same commit); functions nothing references are zero. ' +
    'Operator keep-decisions live in a reason-bearing allowlist that is itself audited.',
  source: 'operator ruling 2026-09-17 ("wire or remove the dead code audit"); docs/audits/system-health-audit-2026-09-17.md section 3',

  enumerate() {
    return ['fsi-app/.discipline/fitness/functions/F47-db-object-reference.mjs'];
  },

  check() {
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
  },
};
