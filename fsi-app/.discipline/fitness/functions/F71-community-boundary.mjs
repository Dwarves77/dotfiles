// F71: community-boundary (lane REG-1, 2026-10-11, ADR-041). The operator ruling, 2026-10-03: Community is a
// social place, not a source of information; no Community-derived content, count, state or aggregate may appear
// on, or feed, any page or pipeline outside /community and its own API. System to Community links are allowed.
// Community to anything else is not.
//
// MECHANISM. The Community scope is four directories: src/app/community, src/app/api/community,
// src/components/community and src/lib/community. A module OUTSIDE that scope must not (a) import from
// src/lib/community or src/components/community (an alias import, or a relative one that resolves into them), or
// (b) name a community_* table in a string literal (a read of Community data). A line in a comment never counts.
// The reasoned ALLOWLIST below carries the sites that touch the Community scope without feeding another surface;
// each has a reason and a date and is audited (an entry whose file no longer touches the scope is stale).
//
// ATTACK (F71 test): a fixture import from src/lib/community into a regulations data path is RED.
import { violation } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { isTestFile } from './F25-module-liveness.mjs';

const SCOPE_GLOBS = ['fsi-app/src/**/*.{ts,tsx,mjs}'];

/** The four directories that make up the Community scope (repo-relative prefixes). */
export const COMMUNITY_SCOPE = [
  'fsi-app/src/app/community/',
  'fsi-app/src/app/api/community/',
  'fsi-app/src/components/community/',
  'fsi-app/src/lib/community/',
];

/** Sites outside the scope that touch it without feeding another surface. Reason and date required. */
export const ALLOWLIST = {
  'fsi-app/src/app/api/health/surfaces/route.ts': {
    reason: 'Admin surface-health counter: it counts rows of the Community surface own table to report that surface health, and the count is not shown on or fed to any customer surface.',
    decidedOn: '2026-10-11',
  },
  'fsi-app/src/lib/orgs/create-org.mjs': {
    reason: 'Imports REGIONS, a static policy constant from community/profile-policy, to validate the org region field: no member content, count, state or aggregate crosses.',
    decidedOn: '2026-10-11',
  },
  'fsi-app/src/components/onboarding/NoWorkspaceLanding.tsx': {
    reason: 'Imports REGIONS, a static policy constant from community/profile-policy, for the onboarding region picker: no member content, count, state or aggregate crosses.',
    decidedOn: '2026-10-11',
  },
};

const IMPORT_RE = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)(["'])([^"']+)\1/g;
const TABLE_RE = /(["'`])community_[a-z_]+\1/g;

function inScope(filepath) {
  return COMMUNITY_SCOPE.some((p) => filepath.startsWith(p));
}

function resolveSpecifier(fromFile, spec) {
  if (spec.startsWith('@/')) return `fsi-app/src/${spec.slice(2)}`;
  if (!spec.startsWith('.')) return null;
  const parts = fromFile.split('/').slice(0, -1);
  for (const seg of spec.split('/')) {
    if (seg === '.' || seg === '') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}

function intoCommunityScope(resolved) {
  if (!resolved) return false;
  return /^fsi-app\/src\/(?:lib|components)\/community(?:\/|$)/.test(resolved);
}

/** Pure: the boundary crossings in `content` of a file OUTSIDE the scope. [{ line, what }] */
export function findCrossings(filepath, content) {
  const out = [];
  content.split(/\r?\n/).forEach((text, i) => {
    const trimmed = text.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
    IMPORT_RE.lastIndex = 0;
    let m;
    while ((m = IMPORT_RE.exec(text)) !== null) {
      if (intoCommunityScope(resolveSpecifier(filepath, m[2]))) out.push({ line: i + 1, what: `imports ${m[2]}` });
    }
    TABLE_RE.lastIndex = 0;
    while ((m = TABLE_RE.exec(text)) !== null) out.push({ line: i + 1, what: `names the Community table ${m[0]}` });
  });
  return out;
}

export const fitnessFunction = {
  id: 'F71',
  name: 'community-boundary',
  description:
    'ADR-041: Community feeds nothing. A module outside src/app/community, src/app/api/community, ' +
    'src/components/community and src/lib/community may not import from src/lib/community or ' +
    'src/components/community, nor name a community_* table. The reasoned ALLOWLIST holds the sites that touch ' +
    'the scope without feeding another surface, and is itself audited for stale entries.',
  source: 'ADR-041 (docs/decisions/ADR-041-community-is-social-only.md), operator ruling 2026-10-03',

  enumerate() {
    return globFiles(SCOPE_GLOBS).filter((f) => !isTestFile(f) && !f.includes('/_archive/'));
  },

  check(filepath, content) {
    if (inScope(filepath)) return [];
    const crossings = findCrossings(filepath, content);
    if (ALLOWLIST[filepath]) {
      return crossings.length === 0
        ? [violation(1, `F71 ALLOWLIST STALE: ${filepath} no longer touches the Community scope; remove its entry.`)]
        : [];
    }
    return crossings.map((c) =>
      violation(
        c.line,
        `ADR-041 boundary: this module is outside the Community scope and ${c.what}. Community is social only; ` +
          'no Community-derived content, count, state or aggregate may feed another surface or pipeline. A system to ' +
          'Community link is allowed, the reverse is not. If this site genuinely does not feed another surface, add it ' +
          'to F71 ALLOWLIST with a reason and a date.',
      ),
    );
  },
};
