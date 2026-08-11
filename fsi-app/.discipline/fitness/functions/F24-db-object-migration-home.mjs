// F24: DB-OBJECT MIGRATION HOME. Every object in the committed catalog snapshot
// (../../governance/db-catalog.json) must be created by a committed migration, or carry an explicit
// reason-bearing entry here. Same for every DB-internal broken reference the snapshot records.
//
// WHY THIS EXISTS (2026-08-11). The database was the one layer no audit had ever swept. The wiring
// census of the same day named it as the single remaining unswept surface (docs/audits/
// wiring-census-2026-08-11.md §D) and this function is the sweep's standing half. What the sweep found:
//
//   22 of 181 catalog objects exist in production and are created by NO committed migration.
//   Two tables (gate_a_health_cache, gate_a_route_b_baseline) and twenty functions.
//
// That class already had a name — the 2026-07-19 structure audit called it "out-of-repo DDL" and flagged
// one instance (hold_resolution_queue) for a ruling. Nothing ever counted it, so it kept growing, and it
// produced two live defects that no repo-side gate could see:
//
//   1. hold_resolution_queue was DROPPED by migration 219 (applied 2026-07-19) and its four-function API
//      — hrq_enqueue / hrq_escalate / hrq_exit / hrq_record_attempt — was left behind. Those functions are
//      still grantable and callable and every one of them throws on a relation that no longer exists.
//      Dropping a table through a migration while its API lives outside the migration tree is exactly how
//      a cleanup leaves a broken half behind: the reviewer reads the migration, sees a clean DROP, and
//      cannot see the callers because they are not in the repo.
//   2. Fifteen gate_a_* SQL functions are a SECOND implementation of Gate A, duplicating
//      src/lib/agent/gate-a-scan.mjs — the same doctrine written twice in two languages, with the version
//      string ("2026-07-30.1") hand-copied on both sides and nothing holding them equal. Nothing calls the
//      SQL copy. The TypeScript copy is what actually runs (canonical-pipeline.ts writes item_gate_a_state
//      directly). This is the "old systems that contradict new ones" class, and it was invisible because
//      one of the two implementations was never in the repo to be read.
//
// SHAPE: a shrinking allowlist that audits itself in BOTH directions, the F14/F15/F22 idiom. An object
// with no migration and no entry is RED. An entry whose object HAS since gained a migration is RED (the
// entry is stale — delete it). An entry naming an object no longer in the snapshot is RED (the object was
// dropped — delete the entry). There is no numeric baseline to nudge: the list itself is the ceiling, and
// every line of it has to say why.
//
// COST: filesystem only. It reads the committed snapshot and the migrations directory. No database
// connection, no credential, no network, no schedule, no model call. The credentialed step is REFRESHING
// the snapshot (governance/db-catalog-refresh.sql, read-only, run on demand), never checking it.
//
// KNOWN LIMIT, stated rather than implied away: DDL applied out-of-repo AFTER the last snapshot refresh is
// invisible here until someone refreshes. F24 makes out-of-repo DDL impossible to keep SILENTLY, not
// impossible to create. Live detection needs a credentialed lane; that is a separate decision with a
// separate cost and it is named as a residual in docs/audits/db-layer-census-2026-08-11.md.
//
// Holistic, so it follows the F14/F23 shape: enumerate() returns a single sentinel and the whole analysis
// runs once inside check().

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { violation, PASS } from '../lib/result.mjs';
import { getRepoRoot } from '../../lib/context.mjs';

const CATALOG = 'fsi-app/.discipline/governance/db-catalog.json';
const MIGRATIONS = 'fsi-app/supabase/migrations';

// ── The allowlist. Every entry: why this object has no migration, and what phase retires the entry. ──
//
// Read this as a work list, not as a set of permissions. Three of these are legitimate-and-should-be-
// migrated; nineteen are proposed for deletion. None of them is "fine as is".
export const NO_MIGRATION_HOME = [
  // ── Legitimate live objects that simply never got a migration home ──
  {
    object: 'gate_a_health_cache',
    reason:
      'Dashboard-created single-row cache behind gate_a_health(). Named as a residual by the runtime-clock ' +
      'inventory (docs/audits/runtime-clock-inventory-2026-08-10.md): acceptable for a cache surface, needs a ' +
      'migration home if it becomes load-bearing. It is read by /api/health/surfaces, so it IS on a product path.',
    reviewByPhase: 'db-migration-home backfill (write the CREATE TABLE into a migration; no data change)',
  },
  {
    object: 'gate_a_health_compute',
    reason: 'Computes the gate_a_health payload. Dashboard-created alongside gate_a_health_cache; same backfill.',
    reviewByPhase: 'db-migration-home backfill (write the CREATE FUNCTION into a migration; no behaviour change)',
  },
  {
    object: 'gate_a_health_refresh',
    reason:
      'The cache\'s only writer. Its pg_cron schedule was DELIBERATELY unscheduled 2026-08-10 (operator ruling: ' +
      'health checks on an unfinished system are noise, halt until needed), so having no caller is the intended ' +
      'state, not a defect — gate_a_health() has a 30-minute staleness gate precisely so the dormancy is visible ' +
      'as an explicit error instead of silently stale numbers. Re-enable: SELECT public.gate_a_health_refresh(); ' +
      'or re-schedule it. What is unresolved is the missing migration, not the missing caller.',
    reviewByPhase: 'db-migration-home backfill (write the CREATE FUNCTION into a migration; keep it unscheduled)',
  },
  {
    object: 'capture_worker_fetch',
    reason:
      'NOT dead. Invoked by hand from the fleet-charter runbooks (docs/runbooks/fleet-charters/*.md), which name ' +
      'it as the ONLY sanctioned document-fetch path ("no metered API spend ever ... all document fetching goes ' +
      'through capture_worker_fetch"). It has no repo caller because its caller is a human running SQL, which is ' +
      'a real invocation path a code-only census cannot see. Two things about it do need a decision: it is a ' +
      'SECURITY DEFINER function that makes an outbound pg_net HTTP POST — network egress that sits entirely ' +
      'outside the F16 transport hold and the F15 spend chokepoint — and it carries a hardcoded anon JWT in its ' +
      'body, so a key rotation breaks it silently. Both are recorded in docs/audits/db-layer-census-2026-08-11.md.',
    reviewByPhase: 'db-migration-home backfill + egress-governance ruling (operator)',
  },

  // ── The duplicate Gate-A implementation: fifteen functions, no caller, no migration ──
  // Retire as one unit. Deleting them is not a behaviour change: the TypeScript implementation in
  // src/lib/agent/gate-a-scan.mjs is what runs, and canonical-pipeline.ts writes item_gate_a_state directly.
  ...[
    'gate_a_collapse_pct',
    'gate_a_contains_token',
    'gate_a_deadline_tokens',
    'gate_a_derived_covered',
    'gate_a_extract_tokens',
    'gate_a_figure_tokens',
    'gate_a_is_citation_line',
    'gate_a_norm',
    'gate_a_obligation_near',
    'gate_a_scan',
    'gate_a_scan_and_store',
    'gate_a_ws_class',
  ].map((object) => ({
    object,
    reason:
      'Part of the SQL re-implementation of Gate A. Duplicates src/lib/agent/gate-a-scan.mjs, shares its version ' +
      'literal 2026-07-30.1 by hand-copy with nothing enforcing the equality, and is called by nothing (the entry ' +
      'points gate_a_scan_and_store / gate_a_extract_tokens have zero callers in code, docs, migrations, other DB ' +
      'objects, or pg_cron). The live path is TypeScript. PROPOSED FOR DELETION as one unit.',
    reviewByPhase: 'db-dead-object sweep (operator-run DROP FUNCTION migration)',
  })),
  {
    object: 'gate_a_route_b_baseline',
    reason:
      '430-row table referenced by NOTHING anywhere — no code, no migration, no doc, no other DB object. A ' +
      'route-B before/after baseline captured out-of-band and never wired to a reader. PROPOSED FOR DELETION ' +
      '(after the operator confirms the 430 rows are not a record worth keeping).',
    reviewByPhase: 'db-dead-object sweep (operator ruling on the rows, then DROP TABLE migration)',
  },

  // ── The broken API of a table that migration 219 already dropped ──
  ...['hrq_enqueue', 'hrq_escalate', 'hrq_exit', 'hrq_record_attempt'].map((object) => ({
    object,
    reason:
      'API of hold_resolution_queue, which migration 219 DROPPED on 2026-07-19 (superseded by drain_worklist; ' +
      '32/39 rows already present there, 6 verified, 1 gone, 0 needed migrating). The table went, the four ' +
      'functions stayed, and each one now throws on a missing relation. PROPOSED FOR DELETION — it is the second ' +
      'half of a cleanup that only ever completed one half.',
    reviewByPhase: 'db-dead-object sweep (operator-run DROP FUNCTION migration)',
  })),

  {
    object: 'next_uncensused_portal_candidates',
    reason:
      'Portal-census pagination RPC over portal_link_candidates. Zero callers in code, docs, migrations or other ' +
      'DB objects. Written for the portal census lane and never adopted — the dormant-capability class, not a ' +
      'breakage. Keep or drop is a product call, not a hygiene one.',
    reviewByPhase: 'db-dead-object sweep (operator: adopt it or drop it)',
  },
];

// Broken DB-internal references the snapshot records, each needing a reason to survive.
export const BROKEN_REF_ALLOWLIST = [
  {
    missingRelation: 'hold_resolution_queue',
    reason:
      'Dropped by migration 219 (2026-07-19). The four hrq_* functions that reference it are allowlisted above ' +
      'and proposed for deletion in the same sweep; this entry and those four retire together.',
    reviewByPhase: 'db-dead-object sweep (operator-run DROP FUNCTION migration)',
  },
];

const ALLOWED = new Map(NO_MIGRATION_HOME.map((e) => [e.object, e]));
const ALLOWED_BROKEN = new Map(BROKEN_REF_ALLOWLIST.map((e) => [e.missingRelation, e]));

/** Strip SQL comments so a migration that merely MENTIONS an object in prose cannot launder it. */
export function stripSqlComments(sql) {
  return String(sql).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--.*$/gm, ' ');
}

/**
 * Does the migration corpus actually CREATE/ALTER/DROP this object? A bare name match is not enough:
 * object names appear constantly inside queries, and counting a SELECT as a definition would let a
 * genuinely out-of-repo object pass because some unrelated migration happened to read from it.
 */
export function hasMigrationHome(name, migrationBlob) {
  const re = new RegExp(
    `\\b(create|alter|drop)\\s+(or\\s+replace\\s+)?(unique\\s+)?(table|view|materialized\\s+view|function|procedure)\\s+(if\\s+(not\\s+)?exists\\s+)?(public\\.)?${name}\\b`,
    'i',
  );
  return re.test(migrationBlob);
}

/**
 * Pure comparator, exported so the selftest can prove the catching behaviour against constructed inputs
 * rather than the live tree — the negative-test discipline F23 and the meta-gate both use on themselves.
 * Returns an array of message strings ([] = pass).
 */
export function auditCatalog(catalog, migrationBlob, allowed = ALLOWED, allowedBroken = ALLOWED_BROKEN) {
  const problems = [];
  const objects = [
    ...(catalog.tables ?? []),
    ...(catalog.views ?? []),
    ...(catalog.rpcFunctions ?? []),
    ...(catalog.triggerFunctions ?? []),
  ];
  if (objects.length === 0) {
    return ['db-catalog.json lists no objects — the snapshot is empty or its shape changed, and this gate can no longer measure anything.'];
  }
  const inCatalog = new Set(objects);

  for (const name of objects) {
    const homed = hasMigrationHome(name, migrationBlob);
    const entry = allowed.get(name);
    if (!homed && !entry) {
      problems.push(
        `OUT-OF-REPO DDL — "${name}" exists in the database and no committed migration creates it. ` +
          `Write the DDL into a migration, or add a reason-bearing entry to NO_MIGRATION_HOME in ` +
          `F24-db-object-migration-home.mjs. An object the repo cannot see is an object no review can read.`,
      );
    }
    if (homed && entry) {
      problems.push(
        `STALE ALLOWLIST — "${name}" now HAS a defining migration, so its NO_MIGRATION_HOME entry is obsolete. ` +
          `Delete the entry (reviewByPhase was "${entry.reviewByPhase}").`,
      );
    }
  }

  for (const entry of allowed.values()) {
    if (!inCatalog.has(entry.object)) {
      problems.push(
        `STALE ALLOWLIST — "${entry.object}" is no longer in db-catalog.json (dropped, or the snapshot was ` +
          `refreshed without it). Delete its NO_MIGRATION_HOME entry.`,
      );
    }
  }

  const broken = catalog.internalBrokenRefs ?? [];
  const seenBroken = new Set();
  for (const ref of broken) {
    seenBroken.add(ref.missingRelation);
    if (!allowedBroken.has(ref.missingRelation)) {
      problems.push(
        `BROKEN DB-INTERNAL REFERENCE — ${ref.owner} references public.${ref.missingRelation}, which does not ` +
          `exist. The object throws at runtime. Drop or repair it, or record the disposition in ` +
          `BROKEN_REF_ALLOWLIST with a reason.`,
      );
    }
  }
  for (const entry of allowedBroken.values()) {
    if (!seenBroken.has(entry.missingRelation)) {
      problems.push(
        `STALE ALLOWLIST — "${entry.missingRelation}" no longer appears in db-catalog.json's internalBrokenRefs. ` +
          `The reference was repaired or removed; delete its BROKEN_REF_ALLOWLIST entry.`,
      );
    }
  }

  for (const e of [...allowed.values(), ...allowedBroken.values()]) {
    if (!e.reason || !e.reviewByPhase) {
      problems.push(
        `ALLOWLIST ENTRY WITHOUT A REASON — "${e.object ?? e.missingRelation}" must carry both reason and ` +
          `reviewByPhase, same as F15/F22. An entry with no reason is a permanent exemption wearing a temporary label.`,
      );
    }
  }

  return problems;
}

function readMigrationBlob() {
  const dir = join(getRepoRoot(), MIGRATIONS);
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => stripSqlComments(readFileSync(join(dir, f), 'utf8')))
    .join('\n');
}

export const fitnessFunction = {
  id: 'F24',
  name: 'db-object-migration-home',
  description:
    'Every database object in the committed catalog snapshot is created by a committed migration, or carries an ' +
    'explicit reason-bearing exemption; every DB-internal broken reference is likewise accounted for. Closes the ' +
    'out-of-repo-DDL class the 2026-07-19 structure audit named and nobody ever counted: 22 of 181 objects, ' +
    'including a four-function API left callable after migration 219 dropped its table, and a fifteen-function SQL ' +
    're-implementation of Gate A that duplicates the TypeScript one and is called by nothing.',
  source:
    'wiring census 2026-08-11 §D (the database was the one unswept layer); the 2026-07-19 supabase structure audit, ' +
    'which named out-of-repo DDL as a finding and left it uncounted',

  // Holistic: the whole catalog is analysed once, not per-file. Single sentinel => check() runs once.
  enumerate() {
    return ['fsi-app/.discipline/fitness/functions/F24-db-object-migration-home.mjs'];
  },

  check() {
    let catalog;
    try {
      catalog = JSON.parse(readFileSync(join(getRepoRoot(), CATALOG), 'utf8'));
    } catch (err) {
      return [
        violation(
          1,
          `db-catalog.json is missing or unparseable (${err.message}). The database-side gate cannot run without ` +
            `its snapshot; regenerate it with governance/db-catalog-refresh.sql and commit.`,
        ),
      ];
    }
    const problems = auditCatalog(catalog, readMigrationBlob());
    if (problems.length === 0) return PASS;
    return problems.map((msg) => violation(1, msg));
  },
};
