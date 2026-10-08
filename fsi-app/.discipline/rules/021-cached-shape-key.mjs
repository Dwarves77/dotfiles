// Rule 021: The dashboard cache key must carry the current shape hash.
// Source: production defect 2026-08-01 (digest 2552218741). PR #395 added `recentChanges` to
// the DashboardData payload without bumping the "app-data-v2" unstable_cache key. Vercel's
// data cache persists across deployments and serves stale-while-revalidate, so after each
// subsequent deploy the OLD-shape cached payload reached NEW code and `recentChanges.filter`
// crashed SSR of `/`. A slow or failing background revalidation (the "getAppData timeout"
// class) extends that window indefinitely. The key HAD been bumped correctly one PR earlier
// (#393, v1→v2) — the discipline existed but lived in memory, and memory missed once. This
// rule makes the rotation mechanical: the key literal must end in a hash of the interface
// block, so any shape edit fails the commit until the key rotates — and the failure message
// prints the exact new key, so satisfying the rule IS the fix.
//
// Trigger: a commit that stages supabase-server.ts or data.ts (the shape and its consumer).
// Check:   1. supabase-server.ts declares DASHBOARD_DATA_CACHE_KEY = "app-data-<hash8>"
//             where <hash8> is sha1 (first 8 hex) of the DashboardData interface block,
//             normalized (block comments, line comments, and whitespace stripped).
//          2. lib/data.ts must not inline a raw "app-data-" string literal (it must consume
//             the constant), so the enforcement point cannot be bypassed by re-inlining.
//
// LIMIT (stated in the constant's comment too): the hash covers the interface's OWN text.
// Shape drift through nested types (Resource, Supersession, …) does not rotate the key
// mechanically — nested additions must be optional fields, or the key rotates by hand.

// HONEST FORMS (lane GATE-7, 2026-10-08, attacks A021-1, A021-1b, A021-3, A021-5 of the AUD-AT-3 register):
// the interface, the key constant and the consumer's literal are all located on the source with COMMENTS
// MASKED (lib/mask-source.mjs, positions preserved), so a comment that quotes the new key ahead of the real
// constant, or a block-comment copy of the old interface ahead of the real one, is not read as the thing it
// quotes; the hash itself is unchanged (it is taken over the same lines with the same normalization, so the
// committed key stays valid); a consumer's raw literal split across a plus sign is still the literal; and a
// commit that deletes or renames the shape file away is refused, because the anchor this rule hashes is gone.
// NOT covered, and why (the author's stated limit, restated): a shape change through a nested type, or a
// payload type declared in a file the rule does not watch (A021-2, A021-6), needs the TypeScript type graph,
// an npm dependency the no-npm discipline glob cannot import. The rule reads the STAGED BLOB.

import { createHash } from 'node:crypto';
import { pass, fail, skip } from '../lib/result.mjs';
import { maskNonCode, foldStringConcat } from '../lib/mask-source.mjs';

const SHAPE_FILE = 'fsi-app/src/lib/supabase-server.ts';
const CONSUMER_FILE = 'fsi-app/src/lib/data.ts';
const KEY_RE = /export const DASHBOARD_DATA_CACHE_KEY\s*=\s*["'`]([^"'`]+)["'`]/;

function normalize(p) {
  return String(p).replaceAll('\\', '/');
}

// Extract the DashboardData interface block and hash it. Normalization strips
// /* */ blocks, // line comments, and ALL whitespace, so comment and formatting
// edits do not rotate the key — only structural shape edits do.
export function computeShapeKey(source) {
  const lines = source.split(/\r?\n/);
  // Locate the block on the comment-masked source (same line numbers), hash the ORIGINAL lines.
  const masked = maskNonCode(source, { keepStrings: true }).split(/\r?\n/);
  const start = masked.findIndex((l) => /^export interface DashboardData \{/.test(l));
  if (start === -1) return null;
  let end = -1;
  for (let i = start + 1; i < masked.length; i++) {
    if (masked[i] === '}') {
      end = i;
      break;
    }
  }
  if (end === -1) return null;
  const block = lines
    .slice(start, end + 1)
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/\s+/g, '');
  const hash8 = createHash('sha1').update(block).digest('hex').slice(0, 8);
  return `app-data-${hash8}`;
}

function touchesEitherFile(ctx) {
  return ctx.stagedFiles.some(
    (f) => f.status !== 'D' && [SHAPE_FILE, CONSUMER_FILE].includes(normalize(f.path)),
  );
}

// The shape file deleted, or renamed away from its path: the anchor this rule hashes is gone.
function shapeFileGone(ctx) {
  return ctx.stagedFiles.some(
    (f) => (f.status === 'D' && normalize(f.path) === SHAPE_FILE) || (f.status === 'R' && normalize(f.oldPath || '') === SHAPE_FILE),
  );
}

export const rule = {
  id: '021',
  name: 'Dashboard cache key carries the shape hash',
  description:
    'DASHBOARD_DATA_CACHE_KEY in supabase-server.ts must equal "app-data-" + sha1[0:8] of the ' +
    'normalized DashboardData interface block, and lib/data.ts must consume the constant rather ' +
    'than an inline "app-data-" literal. Rotating the key on shape change prevents stale ' +
    'cross-deployment cache entries from reaching code compiled against a newer shape.',
  ruleSource:
    'Production SSR crash on / (digest 2552218741, 2026-08-01) — PR #395 shape change without key bump',

  trigger(ctx) {
    if (ctx.isMergeCommit) return false;
    if (ctx.isRevertCommit) return false;
    return touchesEitherFile(ctx) || shapeFileGone(ctx);
  },

  check(ctx) {
    if (shapeFileGone(ctx)) {
      return fail({
        message: `${SHAPE_FILE} was deleted or renamed away: the DashboardData interface this rule hashes is no longer at the path it watches.`,
        remediation: [
          'Move the file back, or update SHAPE_FILE and the anchor regex in rules/021-cached-shape-key.mjs in the same commit,',
          'and rotate DASHBOARD_DATA_CACHE_KEY to the hash the rule prints for the new location.',
          'Emergency bypass: git commit --no-verify.',
        ].join('\n  '),
      });
    }
    const shapeSrc = ctx.getFileContent(SHAPE_FILE);
    if (shapeSrc === null) {
      // File unreadable in this context (fixture without injection). Content
      // rules cannot verify what they cannot read; skip loudly rather than
      // guess.
      return skip(`${SHAPE_FILE} content unavailable in this context`);
    }

    const expected = computeShapeKey(shapeSrc);
    if (expected === null) {
      return fail({
        message:
          'Could not locate the `export interface DashboardData {` block in ' +
          `${SHAPE_FILE} — the shape anchor rule 021 hashes is gone or renamed.`,
        remediation: [
          'If DashboardData moved or was renamed, update SHAPE_FILE / the anchor regex in rules/021-cached-shape-key.mjs in the same commit.',
          'Emergency bypass: git commit --no-verify.',
        ].join('\n  '),
      });
    }

    const keyMatch = maskNonCode(shapeSrc, { keepStrings: true }).match(KEY_RE); // comments masked: a quoted key is not the constant
    if (!keyMatch) {
      return fail({
        message: `DASHBOARD_DATA_CACHE_KEY is not declared in ${SHAPE_FILE}.`,
        remediation: [
          `Declare: export const DASHBOARD_DATA_CACHE_KEY = "${expected}";`,
          'Keep it co-located directly above the DashboardData interface.',
        ].join('\n  '),
      });
    }

    if (keyMatch[1] !== expected) {
      return fail({
        message:
          `DASHBOARD_DATA_CACHE_KEY is "${keyMatch[1]}" but the DashboardData interface hashes to ` +
          `"${expected}" — the payload shape changed without rotating the cache key. A stale ` +
          'cross-deployment cache entry would reach code compiled against the new shape ' +
          '(the exact class that crashed / on 2026-08-01).',
        remediation: [
          `Set: export const DASHBOARD_DATA_CACHE_KEY = "${expected}";`,
          'That single edit rotates the cache namespace; no other change is needed.',
          'If a NESTED type changed shape (Resource, Supersession, …), this rule cannot see it — make nested additions optional, or rotate the key by hand.',
        ].join('\n  '),
      });
    }

    const consumerSrc = ctx.getFileContent(CONSUMER_FILE);
    if (consumerSrc !== null && /["'`]app-data-/.test(foldStringConcat(maskNonCode(consumerSrc, { keepStrings: true })))) {
      return fail({
        message:
          `${CONSUMER_FILE} contains a raw "app-data-" string literal. The cache key must come ` +
          'from DASHBOARD_DATA_CACHE_KEY so the shape-hash enforcement cannot be bypassed.',
        remediation: [
          'Replace the literal with the imported DASHBOARD_DATA_CACHE_KEY constant.',
        ].join('\n  '),
      });
    }

    return pass();
  },
};

export const _SHAPE_FILE = SHAPE_FILE;
export const _CONSUMER_FILE = CONSUMER_FILE;
