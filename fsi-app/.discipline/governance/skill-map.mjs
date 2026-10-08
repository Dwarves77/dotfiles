// Governance skill-map — THE single source of truth linking every governing skill to the
// objective file/operation signals that must fire it. Read by BOTH enforcement surfaces:
//   - the .discipline content-verifier rules (commit-time backstop), and
//   - the PreToolUse auto-fire hook (action-time, non-optional).
//
// Design constraints (operator-stated):
//   * Every skill is linked to an automatic trigger — NOTHING is judgment-load-only (no NONE).
//   * A trigger demands the CORRECT skill for the touched file/op, not "any skill"
//     (else editing trust.ts could be satisfied by citing the wrong skill — gap looks closed).
//   * This map is DATA, one lookup — not logic scattered across rules that drift.
//
// Action-classes:
//   G = generation/grounding logic   S = new customer surface/route   M = row/schema mutation
//
// NOTE on enforcement vs ceremony (manifest 5e3ae41 lesson): this map does NOT define
// trailer-attestation gates. It defines (a) which skill the action-time hook must surface,
// and (b) which CONTENT-verifiable violations the rules catch. Trailers are audit-only.

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const GOVERNED = [
  {
    skill: 'environmental-policy-and-innovation',
    classes: ['G', 'M'],
    why: 'item taxonomy (item_type→format), grounding/integrity rule, source≠item, mint chokepoint (EP-9)',
    // generation + grounding logic files
    files: [
      // DIRECTORY MAPPINGS (2026-08-11, operator wiring census): the hand list of individual files had
      // drifted, gate-a-scan.mjs (grounding-path year/number gate) and census-writer.mjs (corpus census
      // writes; since deleted, lane DEAD-1) were unmapped while sibling files were governed. The agent/ and intake/ directories ARE
      // this skill's domain (generation, grounding, intake mint); per-file listing was the drift vector.
      'fsi-app/src/lib/agent/',
      'fsi-app/src/lib/intake/',
      // 4c relabel executor (claim-label domain) — live script, referenced by run-4c-relabel.mjs.
      'fsi-app/scripts/apply-4c-plan.mjs',
      // corpus-turn / source-sweep drivers (lane RT, 2026-09-01): census ledger + forward-event applies
      // run through the same intake domain this skill governs.
      'fsi-app/scripts/turns/',
      // lane G5-READ (2026-10-07): mints entities rows (instrument, material) for adopted vocabulary terms. The
      // other entities writers (link-item-entities.mjs, backfill-lineage-edges.mjs) reach this skill through its
      // ops signals; this module carries no intelligence_items op, so it is mapped by file, to the same skill.
      'fsi-app/src/lib/vocabulary/adopted-entities.mjs',
    ],
    // row mutations on the intelligence taxonomy (item_type / provenance / classification)
    ops: [/intelligence_items/i, /\bitem_type\b/i, /\bprovenance_status\b/i],
  },
  {
    skill: 'analysis-construction-spec',
    classes: ['G'],
    why: 'per-format section construction + the four grounding models',
    files: [
      'fsi-app/src/lib/agent/format-spec.ts',
      'fsi-app/src/lib/agent/extract-registry.ts',
      'fsi-app/src/lib/agent/formats/', // directory: any formats/*.ts
    ],
    ops: [],
  },
  {
    skill: 'caros-ledge-platform-intent',
    classes: ['S'],
    why: 'the binding five-surface model; no new customer surface outside the five',
    files: [
      'fsi-app/src/app/', // any new page.tsx route
      // Community surface shell context (lane L33, 2026-09-17): the one loader behind every /community/* page's
      // CommunityShell props; it reads the same rows the pages read, so it is governed as the pages are.
      'fsi-app/src/lib/community/shell-context.ts',
      // WIRE item: group-member preference toggle (lane W2-B, 2026-09-29/2026-10-02): the shared PATCH
      // handler body for the self-only starred/muted columns GroupHeader.tsx renders, pulled out of the
      // star/mute route.ts files to close an F45 duplicate-code regression. It writes the same
      // community_group_members row the /community/[slug] page and GroupHeader already surface, so it
      // is governed as the pages are, same precedent as shell-context.ts above.
      'fsi-app/src/lib/community/member-pref-route.mjs',
      'fsi-app/src/components/Sidebar.tsx', // nav entry = surface exposure
      // Gate A gauges (lane OPS-1, 2026-10-07): shapes the gate_a_health() RPC read that /api/health/surfaces serves
      // to the uptime probe. The write detector matches its `.rpc(` call shape (a read RPC, the scan cannot tell);
      // it reports the health of the five customer surfaces' provenance gate, so it is governed with the surfaces.
      'fsi-app/src/lib/health/gate-a-gauges.mjs',
      // Workspace-layer writers (lane S8-A, 2026-10-08, coordinator ruling on PR 988): private workspace notes and
      // multi-person assignment at the foot of every detail page. They write item_notes and item_assignments
      // (migrations 358, 359), org-scoped workspace commentary and coordination for the customer surfaces' detail
      // pages, never intelligence data, so they are governed with the surfaces. Mapped here, no exemption.
      'fsi-app/src/lib/workspace/item-notes.mjs',
      'fsi-app/src/lib/workspace/item-assignments.mjs',
    ],
    ops: [],
  },
  {
    skill: 'source-credibility-model',
    classes: ['G'],
    why: 'trust scoring, citation-network, convergence-count, tier derivation',
    files: [
      'fsi-app/src/lib/trust.ts',
      // source-pool.ts entry removed 2026-07-11: file deleted (retired module, zero importers — audit CODE-1 F-04)
      'fsi-app/src/types/source.ts',
      // DIRECTORY MAPPINGS (2026-08-11): the source machinery (change detection, reconcile, seek-more,
      // snapshot store, verify-item) and the citation/connection graph (write-edges' provenance-origin
      // ownership contract) are this skill's domain — five of them carried writes with NO governing
      // skill while trust.ts alone was mapped.
      'fsi-app/src/lib/sources/',
      'fsi-app/src/lib/connections/',
    ],
    ops: [/trust_score|base_tier|effective_tier|convergence/i],
  },
  {
    skill: 'remediation-discipline',
    classes: ['M'],
    why: 'classify-before-delete; verify-before-discard; no archive over an undiagnosed bucket; spend/transport chokepoints (RD-10/RD-11)',
    // the spend + transport chokepoint modules — an edit here changes the single-home guarantees
    // (RD-10 spend chokepoint / F15; RD-11 transport-hold gate / F16) the whole pipeline funnels through.
    files: [
      // DIRECTORY MAPPINGS (2026-08-11): the whole spend layer (metered-emit ledger writes ride RD-10's
      // chokepoint doctrine), the D3 disposition hooks, and the funded-pass lease/lock machinery are this
      // skill's domain; the prior hand list covered only three files of it.
      'fsi-app/src/lib/llm/',
      'fsi-app/src/lib/sources/fetch-hold.mjs',
      'fsi-app/src/lib/sources/canonical-fetch.mjs',
      'fsi-app/src/lib/d3/',
      'fsi-app/scripts/lib/funded-pass-lock.mjs',
      'fsi-app/scripts/lib/mutation-lease.mjs',
    ],
    // delete / archive operations on existing rows
    ops: [/is_archived\b/i, /archive_reason\b/i, /\.delete\s*\(/, /\bDELETE\s+FROM\b/i],
  },
  {
    skill: 'sprint-followups-discipline',
    classes: ['process'],
    why: 'inventory consistency, migration discipline, loop-closure (already enforced by 014/F2/F6)',
    files: [
      'docs/inventories/',
      'fsi-app/supabase/migrations/',
    ],
    ops: [],
  },
];

// ---- ACTION-TIME CLASSIFICATION TABLES (lane GATE-2, 2026-10-08) ----
// DATA ONLY, read by governance/pretooluse-skill-gate.mjs. The evaluation (gate-evaluation-A, section 5,
// P2) measured these three classifiers as the gate's false-positive sources: a DANGER regex that matched
// prose inside commit messages and heredocs, an MCP read/write NAME REGEX that classed list_*, query_logs,
// mark_chapter and navigate as writes, and a worktree-isolation matcher that asked on read-only git. Each
// is now an explicit table, so a name or a form is a line here, not a regex edit in the gate.

// Bash: patterns that mark a command as a data write / destructive op. Applied ONLY to the command's own
// argv tokens (the gate strips heredoc bodies, quoted strings and `#` comments first), case-insensitive.
// `truncate` is word-bounded so `echo truncated` is not the SQL/shell verb.
export const BASH_DANGER_PATTERNS = [
  '--apply\\b', '--execute\\b', '--write\\b',
  'b2-runner', 'git\\s+push', 'rm\\s+-rf', 'drop\\s+(table|column)', '\\btruncate\\b', 'delete\\s+from',
  'set\\s+not\\s+null', 'add\\s+constraint', 'update\\s+intelligence_items', 'update\\s+sources',
  'set\\s+provenance_status', 'supabase\\s+db\\s+(reset|push)', 'run-migration', 'exec_sql', 'seed/apply-',
];

// MCP: the tool NAME is the part after `mcp__<server>__`. READ names never reach the skill demand; WRITE
// names are skill-gated (deny when the governing skill is not loaded); a name in neither table is UNKNOWN
// and is ASKED, never denied.
export const MCP_READ_PREFIXES = ['list_', 'get_', 'read_', 'search_'];
export const MCP_READ_NAMES = [
  'query_logs', 'find', 'navigate', 'read_page', 'get_page_text', 'screenshot', 'mark_chapter',
  'tabs_context', 'tabs_context_mcp', 'status',
];
export const MCP_WRITE_PREFIXES = ['create_', 'update_', 'delete_', 'deploy_', 'upload_', 'set_', 'run_', 'push_', 'merge_'];
export const MCP_WRITE_NAMES = ['apply_migration', 'execute_sql'];
// `execute_sql` is a READ when the statement's first token is SELECT (see classifyMcp in the gate).
export const MCP_SQL_TOOL_NAMES = ['execute_sql'];
// `browser_batch` is read-only when EVERY action in `input.actions` classifies as read. A `computer`
// action is read-only for these `input.action` values only (a click or a keypress is not).
export const MCP_BATCH_NAMES = ['browser_batch'];
export const MCP_COMPUTER_NAMES = ['computer'];
export const MCP_COMPUTER_READ_ACTIONS = ['screenshot', 'zoom', 'wait', 'scroll', 'scroll_to', 'hover'];

// Worktree isolation (RD-19): the git forms that move or rewrite a branch ask the operator to confirm the
// assigned worktree. One row per subcommand. `none` forms never ask: merge-base, branch --list/-a/
// --show-current, checkout -- <path>, rebase --abort, log, diff, status, fetch, rev-parse.
//   needsArgs        the subcommand asks only when it has at least one argument
//   exceptFirstArg   do not ask when the first argument is one of these (`checkout -- <path>`)
//   exceptAnyArg     do not ask when any argument is one of these (`rebase --abort`)
//   firstArg         ask only when the first argument is one of these (`worktree add`)
//   anyArg           ask only when any argument is one of these (`reset --hard`)
//   anyArgRe         ask only when any argument matches (`branch -d/-D`, `push --force/-f`)
export const GIT_ISOLATION_FORMS = [
  { sub: 'checkout', needsArgs: true, exceptFirstArg: ['--'] },
  { sub: 'switch' },
  { sub: 'rebase', exceptAnyArg: ['--abort'] },
  { sub: 'merge' },
  { sub: 'worktree', firstArg: ['add'] },
  { sub: 'reset', anyArg: ['--hard'] },
  { sub: 'branch', anyArgRe: /^(?:--delete|-[a-zA-Z]*[dD][a-zA-Z]*)$/ },
  { sub: 'push', anyArgRe: /^(?:--force(?:-with-lease|-if-includes)?(?:=.*)?|-[a-zA-Z]*f[a-zA-Z]*)$/ },
];

// ---- matching ----
function norm(p) {
  return (p || '').replaceAll('\\', '/');
}
// A file pattern matches if: exact path, OR directory prefix (ends with '/'),
// OR (for the special 'src/app/' surface case) any descendant.
// Patterns are repo-relative (e.g. 'fsi-app/src/...'); callers pass EITHER a repo-relative
// path (commit-time rules) OR an ABSOLUTE path (the PreToolUse hook, e.g. '<abs-checkout>/fsi-app/
// src/...'). Match on the repo-relative SUFFIX so both forms resolve identically. Every pattern is
// a multi-segment path, so suffix matching cannot collide.
function fileMatches(path, pattern) {
  const f = norm(path), pat = norm(pattern);
  if (pat.endsWith('/')) return f.startsWith(pat) || f.includes('/' + pat);   // directory: relative OR absolute
  return f === pat || f.endsWith('/' + pat);                                  // exact file: relative OR absolute
}

// Return the governing entries whose FILE patterns match this path.
export function skillsForFile(path) {
  return GOVERNED.filter((g) => g.files.some((pat) => fileMatches(path, pat)));
}

// Return the governing entries whose OP regexes match this text (Bash payload or staged file content).
export function skillsForOp(text) {
  if (!text) return [];
  return GOVERNED.filter((g) => g.ops.some((re) => { re.lastIndex = 0; return re.test(text); }));
}

// ---- CLI (consumed by the shell PreToolUse hook) ----
// Usage:
//   node skill-map.mjs --file <path>     → prints governing skill names (one per line), empty if none
//   node skill-map.mjs --op "<text>"     → prints governing skill names for an operation
//   node skill-map.mjs --list            → prints the full map
// task 0.3b: the Windows-safe main guard, inlined (no scripts/lib import precedent under
// .discipline/governance/, unlike .discipline/fitness/functions/ which already imports scripts/lib -
// see scripts/lib/is-main.mjs for the shared primitive this mirrors).
if (Boolean(process.argv[1]) && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2);
  const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  if (args.includes('--list')) {
    for (const g of GOVERNED) console.log(`${g.classes.join('/')}  ${g.skill}  — ${g.why}`);
  } else if (get('--file')) {
    for (const g of skillsForFile(get('--file'))) console.log(g.skill);
  } else if (get('--op')) {
    for (const g of skillsForOp(get('--op'))) console.log(g.skill);
  } else {
    console.error('usage: skill-map.mjs --file <path> | --op "<text>" | --list');
    process.exit(2);
  }
}
