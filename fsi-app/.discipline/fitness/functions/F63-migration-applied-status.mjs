// F63: MIGRATION APPLIED-STATUS TRUTH (lane R4-5 MIGRATION-TRUTH-CATALOG-DROPS, 2026-10-01).
// Closes CF-DATA-1 mechanically (remediation-plan-2026-09-30.md, Lane 4): 4 confirmed instances of a
// migration header self-declaring "NOT APPLIED" / "DRAFT" / "AUTHOR-ONLY, NOT APPLIED" /
// "COMMITTED, NOT YET APPLIED" while the object was live in production the whole time (331 harness_runs
// 38 rows, 335's dropped tables already gone, 277 corpus_turn_requests 1,757 rows, 261's dropped trio
// already gone) - a drift no mechanical check had ever caught. This is the standing check that catches
// the fifth instance.
//
// WHAT IT CHECKS, per migration file: parse the migration's own self-declared header status
// (APPLIED / APPLIED-PENDING / NOT APPLIED / DRAFT - see parseHeaderStatus below for the exact token
// priority) from the SINGLE authoritative `-- subject:` line ONLY (extractSubjectLine; never the whole
// header block, never the SQL body - see extractSubjectLine's own doc for the live-run correction that
// forced this: scanning the whole block treated an older, un-rewritten restated paragraph a few lines
// below a CORRECTED subject line as the declaration, producing 10 of 19 false positives on the first
// live run. The subject line is the one text the project's own inventory generator already treats as
// authoritative). Extract every table the migration body CREATEs or DROPs (stripped of comments, so the
// same prose-vs-DDL distinction applies here too). Compare the self-declared status against the
// coordinator's live-schema row-count export:
//   - status APPLIED, a created table absent live, AND NO migration in the corpus drops it later
//                                                               -> MISMATCH (header lies live-doesn't-exist)
//   - status APPLIED, a created table absent live, but SOME migration in the corpus drops it
//                                                               -> NOT a mismatch (the dropped-later
//     exemption: two true facts about two different points in time - see auditStatusAgainstLiveSchema)
//   - status APPLIED, a dropped table still present live      -> MISMATCH (header lies live-still-there)
//   - status NOT APPLIED, a created table present live        -> MISMATCH (the CF-DATA-1 shape itself)
//   - status NOT APPLIED, a dropped table already absent live -> MISMATCH (ambiguous: already applied,
//     or the table never existed; either way the header is not telling the truth about current reality)
//   - status DRAFT or APPLIED-PENDING                         -> no live check (self-declared "not real
//     yet, and that's the coordinator's call to make, not this gate's")
//   - no created/dropped tables parsed (a column-add, a function-only, a trigger-only, a data backfill,
//     an index-only migration) -> no live check; F63's live cross-check is table-row-count-shaped by
//     construction, same residual CF-DATA-2 named for migrations whose applied-status needs an
//     information_schema.columns / pg_proc / pg_trigger / pg_indexes check instead of a row count.
//
// SELF-SKIP, NOT CRASH (CLAUDE.md standing rule 15): the live-schema export lives at
// fsi-app/scripts/tmp/live-schema-*.json, gitignored scratch (rule 5) - it is never in the git tree, so
// globFiles() (which deliberately excludes gitignored paths for CI parity, see fitness/lib/glob.mjs)
// cannot and must not be asked to find it. Every caller without DB access (a laptop session with no fresh
// coordinator export, any CI checkout) has no file to read. check() treats that as "cannot verify right
// now", returns PASS for every file, and logs ONE skip line naming the reason - never a violation, and
// never a thrown error. This mirrors F28's range-rule skip (an unresolvable precondition is reported, not
// failed) rather than the standalone scripts/verify/*.mjs convention of a literal process.exit(2): F63 is
// a fitness function consumed by fitness/runner.mjs, which reserves exit 2 for its OWN engine errors
// (enumerate()/check() throwing), so a fitness function signals "skipped, no crash" by returning PASS
// with a logged reason, not by exiting the whole runner process.
//
// COST: filesystem only for the migration side. The live-schema export itself is produced by a
// SEPARATE credentialed step (the coordinator's own periodic `SELECT count(*) ... query_to_xml` pass,
// documented in the export's own "source" field) that this function never runs and never triggers.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { violation, PASS } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { getRepoRoot } from '../../lib/context.mjs';

const LIVE_SCHEMA_DIR = 'fsi-app/scripts/tmp';
const LIVE_SCHEMA_RE = /^live-schema-(\d{4}-\d{2}-\d{2})\.json$/;

/** Strip SQL comments (line + block) so a header's prose can never be mistaken for a DDL statement, and
 *  vice versa. Mirrors governance/db-object-reference.mjs's stripSqlComments (same shape, kept local so
 *  F63 has no import-time dependency on F47's module surviving unchanged). */
export function stripSqlComments(sql) {
  return String(sql).replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

/** The leading contiguous `--`-prefixed (or blank) comment block at the top of a migration file - the
 *  "header" a migration self-declares its applied-status in. Stops at the first line that is neither a
 *  `--` comment nor blank (i.e. the first real SQL statement). Retained for callers that want the full
 *  block; F63's own status parsing uses extractSubjectLine below instead (see that function's doc for
 *  why the two are NOT interchangeable). */
export function extractHeaderBlock(content) {
  const lines = String(content).split(/\r?\n/);
  const header = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('--')) {
      header.push(line);
      continue;
    }
    break;
  }
  return header.join('\n');
}

/**
 * The migration's SINGLE authoritative `-- subject:` line (optionally after one leading
 * `/* fitness-allow ... *\/`-style block comment line), matching the convention
 * `fsi-app/scripts/inventories/generate-migrations-inventory.mjs`'s own `parseSubjectLine` reads for
 * the inventory table's Subject column. Returns '' when the file has no such line (most pre-convention
 * migrations).
 *
 * WHY NOT THE WHOLE HEADER BLOCK (lane R4-5, 2026-10-01, live-run correction): scanning every leading
 * `--` line for a status word initially read 10 of 19 live mismatches as false positives. Migrations
 * 181/183/184/195/271/311 each carry a CORRECTED, authoritative `-- subject:` first line (e.g. "APPLIED
 * 2026-07-11 (wave-alpha)") followed by an OLDER, un-rewritten restated paragraph a few lines down still
 * saying "STATUS: AUTHOR-ONLY - NOT APPLIED" or similar - exactly the "frozen-but-stale restated
 * paragraph" pattern docs/inventories/migrations.md's own "Records-truth corrections" section already
 * names for migrations 101/149/152/153/157 (status is read from the ledger + inventory, NEVER from a
 * restated body paragraph, because applied migrations are immutable and their body prose can go stale).
 * Scanning the whole block treated that stale restated text as the declaration; reading only line 1
 * (the one line the project's own generator treats as authoritative) does not.
 */
export function extractSubjectLine(content) {
  const lines = String(content).split(/\r?\n/);
  let i = 0;
  if (/^\s*\/\*.*\*\/\s*$/.test(lines[i] ?? '')) i++;
  const line = lines[i] ?? '';
  return /^-- subject: /.test(line) ? line : '';
}

// Priority order matters: "NOT (YET) APPLIED" / "AUTHOR-ONLY" / "DRAFT" / "APPLIED-PENDING" must all be
// tested before the bare "APPLIED" pattern, since every one of them contains "APPLIED" or a status word
// as a substring of a longer, more specific phrase. First match wins.
//
// CASE-SENSITIVE, NO /i FLAG (lane R4-5, 2026-10-01, live-run correction, second pass): every genuine
// status declaration in this convention is written ALL-CAPS ("APPLIED", "NOT YET APPLIED", "DRAFT",
// "AUTHOR-ONLY", "APPLIED-PENDING", "APPLIED LIVE"); a lowercase mention is always ordinary retrospective
// prose, never a declaration - migration 311's subject line narrates "Was: written, not applied, this
// lane's Supabase MCP access was read-only..." in lowercase, which a case-insensitive match read as a
// status token and produced a false mismatch. The two NOT-APPLIED patterns additionally exclude a
// straight-double-quoted mention (migration 271's subject line narrates "This corrects the \"NOT YET
// APPLIED\" status this row previously carried" - quoting the OLD label by name, not declaring it) via a
// lookbehind/lookahead on `"`.
const STATUS_PATTERNS = [
  { status: 'not_applied', re: /(?<!")\bNOT\s+YET\s+APPLIED\b(?!")/ },
  { status: 'not_applied', re: /(?<!")\bNOT\s+APPLIED\b(?!")/ },
  { status: 'draft', re: /\bAUTHOR-ONLY\b/ },
  { status: 'draft', re: /\bDRAFT\b/ },
  { status: 'applied_pending', re: /\bAPPLIED-PENDING\b/ },
  { status: 'applied', re: /\bAPPLIED\b/ },
];

/** The migration's self-declared status, read from its authoritative `-- subject:` line ONLY (see
 *  extractSubjectLine's doc for why not the whole header block). null = no status token present on
 *  that line (most migrations before this convention existed, or ones that never declared one there). */
export function parseHeaderStatus(subjectLine) {
  for (const { status, re } of STATUS_PATTERNS) {
    if (re.test(subjectLine)) return status;
  }
  return null;
}

const CREATE_TABLE_RE = /create\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi;
const DROP_TABLE_RE = /drop\s+table\s+(?:if\s+exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi;

/** Every table name this migration's SQL body (comments stripped) CREATEs or DROPs. Pure, so the
 *  negative tests drive it with constructed fixture bodies. */
export function extractTableOps(strippedBody) {
  const created = new Set();
  const dropped = new Set();
  let m;
  CREATE_TABLE_RE.lastIndex = 0;
  while ((m = CREATE_TABLE_RE.exec(strippedBody)) !== null) created.add(m[1].toLowerCase());
  DROP_TABLE_RE.lastIndex = 0;
  while ((m = DROP_TABLE_RE.exec(strippedBody)) !== null) dropped.add(m[1].toLowerCase());
  return { created: [...created], dropped: [...dropped] };
}

/**
 * Pure comparator: given the self-declared status, the created/dropped table names, the live-schema
 * exact_rows map (table -> row count, or undefined/absent key = table does not exist live), and the
 * set of table names ANY migration in the committed corpus DROPs (droppedElsewhere, default empty),
 * return mismatch problem strings ([] = consistent). Exported so the negative tests drive it directly
 * without a live-schema fixture file on disk or a full corpus scan.
 *
 * THE DROPPED-LATER EXEMPTION (lane R4-5, 2026-10-01, live-run correction): a migration whose header
 * truthfully says APPLIED can CREATE a table that is absent from today's live-schema export for a
 * perfectly honest reason - a LATER migration in the same committed corpus dropped it (211's
 * drain_worklist dropped by 324; 216's item_source_evidence reverted by 218; 295's
 * community_promotion_transitions dropped by 329; 296's carrier_compliance_pools dropped by 311). That
 * is not a header lying about reality; it is two true facts about two different points in time. Only
 * when the created table is absent live AND no migration anywhere in the corpus drops it does the
 * APPLIED-but-absent shape stay a real mismatch (the header is wrong, or the export is stale).
 */
export function auditStatusAgainstLiveSchema(status, created, dropped, exactRows, droppedElsewhere = new Set()) {
  const problems = [];
  if (status === 'applied') {
    for (const t of created) {
      if (!(t in exactRows) && !droppedElsewhere.has(t)) {
        problems.push(
          `HEADER SAYS APPLIED, LIVE SAYS ABSENT - this migration's header declares APPLIED, but table ` +
            `"${t}" (which this migration CREATEs) does not appear in the coordinator's live-schema export, ` +
            `and no migration in the committed corpus DROPs it either. Either the header is wrong or the ` +
            `export is stale - do not trust the header without re-checking.`,
        );
      }
    }
    for (const t of dropped) {
      if (t in exactRows) {
        problems.push(
          `HEADER SAYS APPLIED (DROP), LIVE SAYS STILL PRESENT - this migration's header declares APPLIED, ` +
            `but table "${t}" (which this migration DROPs) still has ${exactRows[t]} row(s) in the live-schema ` +
            `export. The drop has not actually happened.`,
        );
      }
    }
  } else if (status === 'not_applied') {
    for (const t of created) {
      if (t in exactRows) {
        problems.push(
          `HEADER SAYS NOT APPLIED, LIVE SAYS PRESENT - this is the CF-DATA-1 shape: the header declares ` +
            `NOT APPLIED / NOT YET APPLIED, but table "${t}" (which this migration CREATEs) already has ` +
            `${exactRows[t]} row(s) live. Correct the header to APPLIED with the evidence (CLAUDE.md rule 2 ` +
            ` -  never leave a known-false header in place once reality is confirmed).`,
        );
      }
    }
    for (const t of dropped) {
      if (!(t in exactRows)) {
        problems.push(
          `HEADER SAYS NOT APPLIED (DROP), LIVE SAYS ALREADY ABSENT - this migration's header declares ` +
            `NOT APPLIED, but table "${t}" (which this migration DROPs) is already absent from the live-schema ` +
            `export. Either the drop already happened outside this migration's own apply, or the table never ` +
            `existed - either way the header does not describe current reality.`,
        );
      }
    }
  }
  // 'draft' and 'applied_pending' intentionally carry no live check: both are the coordinator's own
  // explicit "not real yet, and I know it" declaration, not a claim F63 is in a position to dispute.
  return problems;
}

/** Find the live-schema export with the latest date in its filename, under fsi-app/scripts/tmp. This
 *  directory is gitignored scratch (CLAUDE.md rule 5); readdirSync reads the real filesystem directly
 *  (never globFiles, which excludes gitignored paths by design - see this file's header). Returns null
 *  when the directory or no matching file exists - the self-skip condition. */
export function findLatestLiveSchemaFile(root) {
  const dir = join(root, LIVE_SCHEMA_DIR);
  if (!existsSync(dir)) return null;
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }
  const dated = entries
    .map((f) => {
      const m = f.match(LIVE_SCHEMA_RE);
      return m ? { file: f, date: m[1] } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)); // newest date first
  return dated.length ? join(dir, dated[0].file) : null;
}

let liveSchemaCache; // undefined = not yet attempted, null = attempted and absent, object = loaded
let skipLogged = false;

function loadLiveSchema() {
  if (liveSchemaCache !== undefined) return liveSchemaCache;
  const path = findLatestLiveSchemaFile(getRepoRoot());
  if (!path) {
    liveSchemaCache = null;
    return null;
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    liveSchemaCache = parsed.exact_rows && typeof parsed.exact_rows === 'object' ? parsed.exact_rows : null;
  } catch {
    liveSchemaCache = null;
  }
  return liveSchemaCache;
}

// Test seam: force a fresh load attempt on the next check() call (production never needs this - one
// process, one load).
export function _resetLiveSchemaCache() {
  liveSchemaCache = undefined;
  skipLogged = false;
}

let droppedElsewhereCache; // undefined = not yet built; Set once built (built exactly once per process)

/** Every table name ANY migration file in the committed corpus DROPs, built once by reading every
 *  migration file (not just the one check() is currently looking at) - the corpus-wide half of the
 *  dropped-later exemption documented on auditStatusAgainstLiveSchema. Pure filesystem read, no live
 *  DB access, same cost class as F47's full-corpus replay. */
function loadDroppedElsewhereSet() {
  if (droppedElsewhereCache !== undefined) return droppedElsewhereCache;
  const dropped = new Set();
  for (const file of globFiles(['fsi-app/supabase/migrations/*.sql'])) {
    const content = readFileSync(join(getRepoRoot(), file), 'utf8');
    const { dropped: fileDropped } = extractTableOps(stripSqlComments(content));
    for (const t of fileDropped) dropped.add(t);
  }
  droppedElsewhereCache = dropped;
  return dropped;
}

// Test seam, paired with _resetLiveSchemaCache.
export function _resetDroppedElsewhereCache() {
  droppedElsewhereCache = undefined;
}

export const fitnessFunction = {
  id: 'F63',
  name: 'migration-applied-status',
  description:
    'Every migration\'s self-declared APPLIED/NOT APPLIED/DRAFT header is checked against the ' +
    'coordinator\'s live-schema row-count export (object exists / row count) for the tables it CREATEs ' +
    'or DROPs; a mismatch fails. Self-skips (no violation, no crash) when no live-schema export is ' +
    'present, per CLAUDE.md rule 15. Closes CF-DATA-1 (remediation-plan-2026-09-30.md Lane 4) as a ' +
    'standing check, not a one-time header fix.',
  source: 'remediation-plan-2026-09-30.md Lane 4; docs/audits (CF-DATA-1, CF-DATA-2); CLAUDE.md rule 15',

  enumerate() {
    return globFiles(['fsi-app/supabase/migrations/*.sql']);
  },

  check(filepath, content) {
    const exactRows = loadLiveSchema();
    if (exactRows === null) {
      if (!skipLogged) {
        console.log(
          '  [F63] self-skip: no fsi-app/scripts/tmp/live-schema-*.json export found (gitignored ' +
            'coordinator scratch, absent on this checkout/session) - header-vs-live cross-check not run.',
        );
        skipLogged = true;
      }
      return PASS;
    }

    const subjectLine = extractSubjectLine(content);
    const status = parseHeaderStatus(subjectLine);
    if (!status) return PASS; // no self-declared status on the authoritative subject line

    const { created, dropped } = extractTableOps(stripSqlComments(content));
    if (created.length === 0 && dropped.length === 0) return PASS; // not a table-shaped migration

    const problems = auditStatusAgainstLiveSchema(status, created, dropped, exactRows, loadDroppedElsewhereSet());
    if (problems.length === 0) return PASS;
    return problems.map((msg) => violation(1, `[${filepath.split('/').pop()}] ${msg}`));
  },
};
