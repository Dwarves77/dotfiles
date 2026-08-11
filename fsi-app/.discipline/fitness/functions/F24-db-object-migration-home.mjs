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
// EMPTY, 2026-08-11, and it got there the right way: 22 → 5 by DELETION (migration 254 dropped the
// shadow gate_a chain, the broken hrq API and the unreferenced baseline table) and 5 → 0 by BACKFILL
// (migration 256 wrote the five legitimate live objects into the migration tree verbatim from their live
// definitions, and moved capture_worker_fetch's hardcoded anon JWT into Supabase Vault). Every database
// object now has a migration home. A new out-of-repo object is RED on the snapshot refresh that captures it.
export const NO_MIGRATION_HOME = [];

// ── DATABASE-ORIGINATED EGRESS (pg_net) ──────────────────────────────────────────────────────────────
// A function that calls net.http_* reaches the network from INSIDE Postgres. It never passes through
// application code, so F15 (the spend chokepoint) and F16 (the transport hold) cannot see it — the two gates
// that exist precisely to make outbound calls accountable are both blind to this path by construction.
// Today there is exactly one such function and it is the runbook-sanctioned capture path with no automated
// caller, so nothing is running. The CAPABILITY is what needs governing: pg_net is installed, and nothing
// before this stopped a future migration from adding a second, unreviewed caller.
export const NET_EGRESS_SANCTIONED = [
  {
    object: 'capture_worker_fetch',
    reason:
      'The project\'s own capture-worker edge function, invoked server-side. Named in the fleet-charter runbooks ' +
      'as the ONE sanctioned document-fetch path, explicitly to keep acquisition off metered APIs ("no metered ' +
      'API spend ever"). Zero automated invokers — a human runs it from SQL. The formerly-hardcoded anon JWT ' +
      'moved to Supabase Vault (secret capture_worker_anon_key, migration 256), so a key rotation is one vault ' +
      'update instead of a silent break inside a SECURITY DEFINER body.',
    reviewByPhase: 'egress-governance standing review (operator: any SECOND net caller needs its own entry here)',
  },
];

// ── WORK SCHEDULED INSIDE THE DATABASE (pg_cron) ─────────────────────────────────────────────────────
// EMPTY is the correct state and is live-verified. A pg_cron job runs on a schedule no repo file records and
// no workflow list shows — the runtime-clock inventory of 2026-08-10 exists because exactly that class of
// hidden clock is expensive to find by reading. One job (gate-a-health-refresh) was unscheduled that day by
// operator ruling. Any future entry must be sanctioned here with a reason, so a schedule can never reappear
// inside the database without a line of prose explaining it.
export const CRON_SANCTIONED = [];

// Broken DB-internal references the snapshot records, each needing a reason to survive.
// EMPTY, and it got there by repair rather than exemption: migration 254 dropped the four hrq_* functions
// that referenced hold_resolution_queue (itself dropped by migration 219 in July). The snapshot now records
// zero broken internal references. A new one is RED on the refresh that captures it.
export const BROKEN_REF_ALLOWLIST = [];

const ALLOWED = new Map(NO_MIGRATION_HOME.map((e) => [e.object, e]));
const ALLOWED_BROKEN = new Map(BROKEN_REF_ALLOWLIST.map((e) => [e.missingRelation, e]));
const ALLOWED_NET = new Map(NET_EGRESS_SANCTIONED.map((e) => [e.object, e]));
const ALLOWED_CRON = new Map(CRON_SANCTIONED.map((e) => [e.jobname, e]));

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
export function auditCatalog(catalog, migrationBlob, allowed = ALLOWED, allowedBroken = ALLOWED_BROKEN, allowedNet = ALLOWED_NET, allowedCron = ALLOWED_CRON) {
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

  // ── DATABASE-ORIGINATED EGRESS ──────────────────────────────────────────────────────────────────
  // Both directions, same as everything else here: an unsanctioned net caller is RED, and a sanctioned
  // entry whose function is gone is RED so the sanction list cannot outlive what it sanctions.
  const netCallers = catalog.netCallers ?? [];
  const netSeen = new Set(netCallers);
  for (const fn of netCallers) {
    if (!allowedNet.has(fn)) {
      problems.push(
        `UNSANCTIONED DATABASE EGRESS — "${fn}" calls net.http_* from inside Postgres. That reaches the network ` +
          `without passing through application code, so the spend chokepoint (F15) and the transport hold (F16) ` +
          `cannot see it. Route it through the sanctioned wrapper, or add a reason-bearing entry to ` +
          `NET_EGRESS_SANCTIONED in F24-db-object-migration-home.mjs.`,
      );
    }
  }
  for (const entry of allowedNet.values()) {
    if (!netSeen.has(entry.object)) {
      problems.push(
        `STALE ALLOWLIST — "${entry.object}" no longer appears in the snapshot's netCallers (dropped, or it ` +
          `stopped calling net.http_*). Delete its NET_EGRESS_SANCTIONED entry.`,
      );
    }
  }

  // ── WORK SCHEDULED INSIDE THE DATABASE ──────────────────────────────────────────────────────────
  const cronJobs = catalog.cronJobs ?? [];
  const cronSeen = new Set(cronJobs.map((j) => j.jobname));
  for (const job of cronJobs) {
    if (!allowedCron.has(job.jobname)) {
      problems.push(
        `UNSANCTIONED DATABASE SCHEDULE — pg_cron job "${job.jobname}" (${job.schedule}) runs on a clock no repo ` +
          `file records and no workflow list shows. Unschedule it, or add a reason-bearing entry to ` +
          `CRON_SANCTIONED in F24-db-object-migration-home.mjs.`,
      );
    }
  }
  for (const entry of allowedCron.values()) {
    if (!cronSeen.has(entry.jobname)) {
      problems.push(
        `STALE ALLOWLIST — pg_cron job "${entry.jobname}" is no longer scheduled. Delete its CRON_SANCTIONED entry.`,
      );
    }
  }

  for (const e of [...allowed.values(), ...allowedBroken.values(), ...allowedNet.values(), ...allowedCron.values()]) {
    if (!e.reason || !e.reviewByPhase) {
      problems.push(
        `ALLOWLIST ENTRY WITHOUT A REASON — "${e.object ?? e.missingRelation ?? e.jobname}" must carry both reason and ` +
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
    'explicit reason-bearing exemption; every DB-internal broken reference, every pg_net egress caller and every ' +
    'pg_cron job is likewise accounted for. Closes the ' +
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
