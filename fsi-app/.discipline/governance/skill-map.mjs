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

export const GOVERNED = [
  {
    skill: 'environmental-policy-and-innovation',
    classes: ['G', 'M'],
    why: 'item taxonomy (item_type→format), grounding/integrity rule, source≠item, mint chokepoint (EP-9)',
    // generation + grounding logic files
    files: [
      // DIRECTORY MAPPINGS (2026-08-11, operator wiring census): the hand list of individual files had
      // drifted — gate-a-scan.mjs (grounding-path year/number gate) and census-writer.mjs (corpus census
      // writes) were unmapped while sibling files were governed. The agent/ and intake/ directories ARE
      // this skill's domain (generation, grounding, intake mint); per-file listing was the drift vector.
      'fsi-app/src/lib/agent/',
      'fsi-app/src/lib/intake/',
      // 4c relabel executor (claim-label domain) — live script, referenced by run-4c-relabel.mjs.
      'fsi-app/scripts/apply-4c-plan.mjs',
      // corpus-turn / source-sweep drivers (lane RT, 2026-09-01): census ledger + forward-event applies
      // run through the same intake domain this skill governs.
      'fsi-app/scripts/turns/',
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
      'fsi-app/src/components/Sidebar.tsx', // nav entry = surface exposure
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

// Convenience: governing skills for a class.
export function skillsForClass(cls) {
  return GOVERNED.filter((g) => g.classes.includes(cls));
}

// ---- CLI (consumed by the shell PreToolUse hook) ----
// Usage:
//   node skill-map.mjs --file <path>     → prints governing skill names (one per line), empty if none
//   node skill-map.mjs --op "<text>"     → prints governing skill names for an operation
//   node skill-map.mjs --list            → prints the full map
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('skill-map.mjs')) {
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
