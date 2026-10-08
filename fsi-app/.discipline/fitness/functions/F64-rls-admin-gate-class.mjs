// F64: rls-admin-gate-class (lane R6-8, 2026-10-01, remediation plan 2026-09-30 item 6). Closes
// CF-DATA-8 (A5c-6: 3 confirmed instances of a table shipping RLS-disabled-with-broad-grants or an
// org_memberships-gated admin check instead of profiles.is_platform_admin) and closes the
// traceability half of CF-SEC-14 and CF-DATA-12 (11+2 tables with no ENABLE ROW LEVEL SECURITY
// statement anywhere in the migration corpus, confirmed safe live but undocumented) by making the
// next instance impossible to ship silently.
//
// TWO CHECKS, each proven by attack in the sibling .test.mjs (rule 15: a guard is proven by attack,
// not by presence).
//
//   1. RLS-ENABLE GAP. Every `CREATE TABLE` in the migration corpus must have a matching
//      `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` SOMEWHERE in the corpus. Not necessarily the same
//      file: this repo's own convention routinely splits a table's DDL and its RLS setup across
//      companion files sharing one migration number (006_multi_tenant.sql / 006_rls_multi_tenant.sql),
//      or adds RLS retroactively in a much later, separately numbered migration (285 creates
//      derivation_edges with no RLS; 330 enables it). CF-SEC-14's own finding methodology already
//      reads "anywhere in the 302-file corpus," not "the same file" -- this check reproduces that
//      exact methodology so its allowlist matches the audit's own named set. A table whose enabling
//      statement is not identifiable anywhere in the corpus is a violation unless it is in
//      RLS_ENABLE_ALLOWLIST, a dated, reason-bearing entry (mirrors F51's ZERO_CEILING_ALLOWLIST
//      shape: a strict named exception, never a silent pass).
//
//   2. ADMIN-GATE CLASS. A `CREATE POLICY` whose predicate reads `org_memberships` for a role check
//      (owner/admin/moderator) with no `org_id` tie-back anywhere in the policy body is a GLOBAL
//      admin check disguised as per-org scoping -- CF-DATA-8's exact shape (migration 048's original
//      integrity_flags/holdings_quality policies, later fixed by migration 249 to
//      `profiles.is_platform_admin`). A legitimate per-org admin check always ties back to the row's
//      own org_id (migration 076's org_invitations_admin_read: `m.org_id = org_invitations.org_id`;
//      migration 006's org_update_admin: `org_id = organizations.id`) -- that tie-back is exactly what
//      distinguishes "I administer THIS org" from "I administer SOME org, therefore I may read/write a
//      platform-wide table." Policies are tracked by name across the corpus; the LAST (highest
//      migration number) CREATE POLICY to define a given name is treated as that policy's CURRENT
//      definition, matching this repo's own `DROP POLICY IF EXISTS` + `CREATE POLICY` redefinition
//      idiom (migration 249's own pattern) -- a superseded bad definition is not re-flagged once a
//      later migration redefines the same policy name cleanly.
//
// CALIBRATION, DISCLOSED (lane R6-8, 2026-10-01, [CONFIRMED] by running both checks against the live
// corpus with an EMPTY allowlist before writing either allowlist below).
//
//   Check 1 returns exactly 12 tables with no enabling statement anywhere: the eleven CF-SEC-14 names
//   (audit-consolidated-2026-09-30.md line 142) plus one this check itself surfaced,
//   `intelligence_items_domain_backfill_audit` (migration 101, whose own header reads "PROPOSED, NOT
//   APPLIED" -- a drafted, never-executed backfill-audit snapshot table, not a live table). Both are
//   recorded in RLS_ENABLE_ALLOWLIST below, dated, with the 101 entry explicitly marked as this lane's
//   own addition, distinct from the CF-SEC-14 citation.
//
//   Check 2 returns exactly one unfixed instance NOT named by CF-DATA-8's own citation (migrations
//   249, 257, 330): migration 043's `canonical_source_candidates_admin_read` /
//   `canonical_source_candidates_admin_write`, whose header comment literally reads "RLS-gated to
//   platform admins (org_memberships role IN owner/admin)" -- the identical bug 048 shipped, never
//   redefined by a later migration the way 048's was by 249. [CONFIRMED, NEW FINDING, lane R6-8,
//   2026-10-01.]
//
//   FIXED, NOT WORKED AROUND (operator ruling 2026-10-01, verbatim). Migration 342
//   (`342_canonical_source_candidates_admin_gate.sql`) DROPs and redefines both policy names,
//   repointing them to `profiles.is_platform_admin`, matching migration 249's own pattern exactly,
//   with precondition and post-check DO blocks. AUTHOR-ONLY / NOT YET APPLIED to the live database --
//   the coordinator applies it via the Supabase CLI/MCP (standing rule 3), since this worktree carries
//   no DB credentials -- same posture migration 335's own "AUTHOR-ONLY, NOT APPLIED" header documents
//   for a DDL change awaiting the coordinator's apply. The `ADMIN_GATE_PREEXISTING_ALLOWLIST` entry
//   that previously held this finding open is REMOVED (this same commit), not replaced: check 2's
//   existing "current (highest-numbered) definition wins" resolution (the same rule that already
//   clears migration 048's superseded policies once 249 redefines them) now resolves this pair on its
//   own the moment migration 342's text exists in the corpus -- 342 outnumbers 043, so its clean
//   is_platform_admin definition is what "current" means for these two policy names, with no allowlist
//   entry needed. (This is a FILE-level check, same as every other check in this function: it reads
//   what migration 342 says, not whether the coordinator has run it yet against the live database --
//   the same posture every other AUTHOR-ONLY migration in this corpus is checked under.)
//
// node: builtins plus the repo's own fitness lib helpers only (loaded by the no-npm discipline test
// glob via run-test-suite.sh's existing `fitness/functions/*.test.mjs` line).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { violation } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { getRepoRoot } from '../../lib/context.mjs';

const MIGRATIONS_GLOB = 'fsi-app/supabase/migrations/*.sql';

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function numericIdOf(path) {
  const base = String(path).replace(/\\/g, '/').split('/').pop();
  const m = /^(\d+)_/.exec(base);
  return m ? Number(m[1]) : -1;
}

function lineOf(content, index) {
  return content.slice(0, index).split(/\r?\n/).length;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// CHECK 1: RLS-enable gap. Pure functions take plain data (content strings / file arrays), never touch
// the filesystem directly -- the production wrapper at the bottom supplies the real corpus.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

/** Find every `CREATE TABLE [IF NOT EXISTS] [public.]name (` in `content`. PURE.
 *  @returns {{table: string, line: number}[]} */
export function findCreateTables(content) {
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?["`]?([A-Za-z_][A-Za-z0-9_]*)["`]?\s*\(/gi;
  const out = [];
  let m;
  while ((m = re.exec(content))) {
    out.push({ table: m[1].toLowerCase(), line: lineOf(content, m.index) });
  }
  return out;
}

/** Does ANY file in `allFiles` ([{path, text}]) contain an ALTER TABLE ... ENABLE ROW LEVEL SECURITY
 *  statement for `table`? PURE. */
export function hasRlsEnableAnywhere(allFiles, table) {
  const esc = escapeRegex(table);
  const re = new RegExp(
    `ALTER\\s+TABLE\\s+(?:public\\.)?["\`]?${esc}["\`]?\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
    'i',
  );
  return allFiles.some(({ text }) => re.test(text));
}

// The eleven tables CF-SEC-14 names (audit-consolidated-2026-09-30.md line 142), plus one this lane's
// own run of check 1 surfaced. RLS is confirmed live-enabled (deny-all, zero policies) for the eleven
// by the coordinator's live-schema export; no migration file anywhere in the corpus carries the
// enabling statement for any of them, so this is a traceability gap, not a live exposure. Every other
// table with no enabling statement anywhere is still a violation.
export const RLS_ENABLE_ALLOWLIST = {
  agent_run_searches: {
    decidedOn: '2026-10-01',
    reason: 'CF-SEC-14: live RLS-enabled, zero policies (deny-all), confirmed safe; enabling migration not identifiable in the corpus.',
  },
  gate_a_health_cache: {
    decidedOn: '2026-10-01',
    reason: 'CF-SEC-14: live RLS-enabled, zero policies (deny-all), confirmed safe; enabling migration not identifiable in the corpus.',
  },
  institutions: {
    decidedOn: '2026-10-01',
    reason: 'CF-SEC-14: live RLS-enabled, zero policies (deny-all), confirmed safe; enabling migration not identifiable in the corpus.',
  },
  intelligence_item_citations: {
    decidedOn: '2026-10-01',
    reason: 'CF-SEC-14: live RLS-enabled, zero policies (deny-all), confirmed safe; enabling migration not identifiable in the corpus.',
  },
  intelligence_summaries: {
    decidedOn: '2026-10-01',
    reason: 'CF-SEC-14: live RLS-enabled, zero policies (deny-all), confirmed safe; enabling migration not identifiable in the corpus.',
  },
  item_type_required_slots: {
    decidedOn: '2026-10-01',
    reason: 'CF-SEC-14: live RLS-enabled, zero policies (deny-all), confirmed safe; enabling migration not identifiable in the corpus.',
  },
  section_claim_provenance: {
    decidedOn: '2026-10-01',
    reason: 'CF-SEC-14: live RLS-enabled, zero policies (deny-all), confirmed safe; enabling migration not identifiable in the corpus.',
  },
  sector_contexts: {
    decidedOn: '2026-10-01',
    reason: 'CF-SEC-14: live RLS-enabled, zero policies (deny-all), confirmed safe; enabling migration not identifiable in the corpus.',
  },
  source_bias_tags: {
    decidedOn: '2026-10-01',
    reason: 'CF-SEC-14 and CF-DATA-12 (migration 092): live RLS-enabled, zero policies (deny-all), confirmed safe; enabling migration not identifiable in the corpus.',
  },
  system_state: {
    decidedOn: '2026-10-01',
    reason: 'CF-SEC-14 and CF-DATA-12 (migration 016): live RLS-enabled, zero policies (deny-all), confirmed safe; enabling migration not identifiable in the corpus.',
  },
  system_state_flag_audit: {
    decidedOn: '2026-10-01',
    reason: 'CF-SEC-14: live RLS-enabled, zero policies (deny-all), confirmed safe; enabling migration not identifiable in the corpus.',
  },
  // NOT a CF-SEC-14 name -- this lane's own discovery (2026-10-01), disclosed in this file's header.
  // Migration 101's own header reads "PROPOSED, NOT APPLIED": a drafted, never-executed backfill-audit
  // snapshot table for a classification backfill dry-run, not a live table. Re-verify this entry if
  // migration 101 is ever applied -- an applied audit table would need either a real RLS-enable
  // statement or a fresh, live-verified CF-SEC-14-style entry, not a carry-over of this one.
  intelligence_items_domain_backfill_audit: {
    decidedOn: '2026-10-01',
    reason: 'lane R6-8 own finding: migration 101 header states "PROPOSED, NOT APPLIED" -- draft backfill-audit snapshot table, never run against the live database, not a CF-SEC-14-cited table.',
  },
};

/** Pure core of check 1. `filepath`/`content` are the file under test; `allFiles` is the whole corpus
 *  ([{path, text}], including `filepath` itself) check 1 searches for the enabling statement. */
export function checkRlsEnableGap({ content, allFiles, allowlist = RLS_ENABLE_ALLOWLIST }) {
  const out = [];
  for (const { table, line } of findCreateTables(content)) {
    if (allowlist[table]) continue;
    if (hasRlsEnableAnywhere(allFiles, table)) continue;
    out.push(
      violation(
        line,
        `CREATE TABLE "${table}" has no matching ALTER TABLE ... ENABLE ROW LEVEL SECURITY ` +
          'anywhere in the migration corpus (F64 check 1, CF-SEC-14/CF-DATA-12 class). If RLS was ' +
          'genuinely enabled live out-of-band, add a dated RLS_ENABLE_ALLOWLIST entry naming the ' +
          'ruling; otherwise this table ships with RLS never enabled.',
      ),
    );
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// CHECK 2: admin-gate class. Same pure/production split.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

/** Find every `CREATE POLICY "name" ... ;` statement in `content`. Non-greedy to the first terminating
 *  `;`, matching this corpus's own formatting (no embedded semicolons inside a policy body). PURE.
 *  @returns {{name: string, stmt: string, line: number}[]} */
export function findCreatePolicies(content) {
  const re = /CREATE\s+POLICY\s+["`]?([A-Za-z0-9_]+)["`]?[\s\S]*?;/gi;
  const out = [];
  let m;
  while ((m = re.exec(content))) {
    out.push({ name: m[1].toLowerCase(), stmt: m[0], line: lineOf(content, m.index) });
  }
  return out;
}

/** Does `stmt` read org_memberships for a role check with no org_id tie-back? PURE. A legitimate
 *  per-org admin check always compares the membership's own org_id against the target row (migration
 *  076: `m.org_id = org_invitations.org_id`; migration 006: `org_id = organizations.id`); absence of
 *  any `org_id` token in the statement is what distinguishes a global "I administer SOME org" check
 *  from a scoped "I administer THIS org" check. */
export function looksLikeOrgMembershipsAdminCheck(stmt) {
  if (!/org_memberships/i.test(stmt)) return false;
  if (!/role\s*(?:IN|=)\s*\(?\s*'?(?:owner|admin|moderator)/i.test(stmt)) return false;
  if (/\borg_id\b/i.test(stmt)) return false;
  return true;
}

// EMPTY as of 2026-10-01 (lane R6-8). Previously held two dated entries for migration 043's
// canonical_source_candidates_admin_read/_write (a genuine, previously-uncited instance of CF-DATA-8's
// pattern this lane's check 2 discovered, flagged to the coordinator rather than silently dropped per
// rule 13). Operator ruling 2026-10-01, verbatim, "fixed, not worked around": migration 342 redefines
// both policy names on profiles.is_platform_admin, and check 2's existing "current (highest-numbered)
// definition wins" resolution clears the pair on its own once 342's text exists in the corpus -- no
// allowlist entry is needed, so none is kept. Left as an empty, still-exported const (not deleted) so
// a future genuine finding of this same shape has a named home to land in, dated and reasoned, exactly
// like this one was, rather than a silent new allowlist being invented from scratch.
export const ADMIN_GATE_PREEXISTING_ALLOWLIST = {};

/** Pure core of check 2. `filepath` is the file under test (its numeric id decides whether its
 *  definition of a matched policy name is the CURRENT one); `allFiles` is the whole corpus. */
export function checkAdminGateClass({
  filepath, content, allFiles, allowlist = ADMIN_GATE_PREEXISTING_ALLOWLIST,
}) {
  const out = [];
  const thisNumId = numericIdOf(filepath);
  for (const { name, stmt, line } of findCreatePolicies(content)) {
    if (!looksLikeOrgMembershipsAdminCheck(stmt)) continue;

    let maxNumId = -Infinity;
    for (const f of allFiles) {
      for (const p of findCreatePolicies(f.text)) {
        if (p.name === name) maxNumId = Math.max(maxNumId, numericIdOf(f.path));
      }
    }
    if (thisNumId !== maxNumId) continue; // a superseded definition; its redefinition is checked there

    if (allowlist[name]) continue;
    out.push(
      violation(
        line,
        `CREATE POLICY "${name}" reads org_memberships for a role check (owner/admin/moderator) with ` +
          'no org_id tie-back anywhere in its body -- a global admin check via org membership instead ' +
          'of profiles.is_platform_admin (F64 check 2, CF-DATA-8 class; migration 048 shipped this ' +
          'exact shape, fixed by migration 249). Use "EXISTS (SELECT 1 FROM public.profiles p WHERE ' +
          'p.id = auth.uid() AND p.is_platform_admin = true)" instead, or add a dated ' +
          'ADMIN_GATE_PREEXISTING_ALLOWLIST entry with a tracked fix.',
      ),
    );
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// PRODUCTION READS: the real migration corpus, loaded once per process and reused across every
// enumerated file's check() call (both checks need whole-corpus context, not just their own file).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

let _corpusCache = null;

function loadCorpus() {
  if (_corpusCache) return _corpusCache;
  const root = getRepoRoot();
  _corpusCache = globFiles([MIGRATIONS_GLOB]).map((path) => ({
    path,
    text: readFileSync(join(root, path), 'utf8'),
  }));
  return _corpusCache;
}

export const fitnessFunction = {
  id: 'F64',
  name: 'rls-admin-gate-class',
  description:
    'A migration that CREATE TABLEs must have a matching ENABLE ROW LEVEL SECURITY somewhere in the ' +
    'migration corpus (allowlisted, dated, for the eleven CF-SEC-14 tables plus one draft-table ' +
    'exception this lane found); and a CREATE POLICY must never gate an admin check on org_memberships ' +
    'role-membership with no org_id tie-back instead of profiles.is_platform_admin (CF-DATA-8 class; ' +
    "migration 043's canonical_source_candidates instance was fixed, not allowlisted, by migration 342).",
  source: 'fsi-app/.discipline/fitness/functions/F64-rls-admin-gate-class.mjs',

  enumerate() {
    return globFiles([MIGRATIONS_GLOB]);
  },

  check(filepath, content) {
    const allFiles = loadCorpus();
    return [
      ...checkRlsEnableGap({ content, allFiles }),
      ...checkAdminGateClass({ filepath, content, allFiles }),
    ];
  },
};
