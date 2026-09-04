// F36: DATE-FORMAT TIMEZONE PIN. Lane PERF-8, 2026-09-04, after diagnosing today's React error #418 on
// /regulations: src/components/regulations/RegulationsLedger.tsx's RegRow ("use client", hydrated) called
// `md.toLocaleDateString("en-US", { month: "short", day: "numeric" })` with no `timeZone`. A date-only DB
// value ("2026-09-25") parses as UTC midnight; the SERVER render (a Vercel Lambda, UTC, no TZ env var) and
// the CLIENT hydration render (the viewer's local zone) disagreed on the calendar day whenever the viewer
// sat west of UTC — a genuine server/client text mismatch, exactly React's minified #418. Fixed in commit
// 27f6a358 (src/components/regulations/format-fixed-date.ts, timeZone: "UTC" pinned, the convention already
// used by DashboardTopPriority.tsx / UserProfilePage.tsx / OrganizationPanel.tsx for the same class of
// call). This function is the mechanical gate for that class so the fix cannot regress unnoticed and no
// sibling component reintroduces it.
//
// RULE. Only a HYDRATED component is at risk here: a Server Component renders once, server-side only, so
// there is no second render to disagree with (see regulations/page.tsx's `today`/`lastSyncLabel`, both
// Server Component calls the PERF-8 commit pinned for TZ-correctness but which never carried a #418 risk
// on their own). The risk is specific to a `"use client"` module: React renders it once on the server (SSR)
// and once more in the browser during hydration, and diffs the two text outputs. So: a `.tsx`/`.ts` file
// under fsi-app/src/app/** or fsi-app/src/components/** that carries a top-of-file `"use client"` directive
// and calls `.toLocaleDateString(`, `.toLocaleTimeString(`, or `new Intl.DateTimeFormat(` with an options
// argument that does not include a `timeZone` key is a violation. `.toLocaleString()` (bare) is
// deliberately EXCLUDED — it is also `Number.prototype.toLocaleString`, and a static scan cannot tell a
// number call from a date call; the two Date-specific method names carry no such ambiguity.
//
// SCOPE, STATED HONESTLY. A codebase-wide first run (2026-09-04) found 20 further call sites missing
// timeZone across 15 other "use client" files (community/, admin/, profile/, sources/, settings/, home/,
// resource/, onboarding/, market/ detail) — none of them touched by this lane's diagnosis, none read this
// lane to confirm whether they are genuinely at risk (some may format a value that never differs by
// timezone, e.g. a `new Date()` computed inside a client-only effect that never runs during SSR) or already
// provably safe some other way. Rather than assert 15 unaudited files are fine (rule B3: no claim ahead of
// evidence) or silently widen this gate's failure surface with call sites nobody has looked at, they are
// named in PRE_EXISTING_ALLOWLIST below, file-scoped (not line-scoped — a NEW call site in an already-
// listed file still passes today, but the file is a known, named residual for a follow-up audit, not a
// clean bill of health). Any file NOT in the allowlist is enforced from this commit forward: the exact
// mechanism that prevents this regression from recurring, in this lane's own write set (regulations/
// operations) and in any file nobody has yet added to the debt list.
//
// COST: filesystem only. Per-file: enumerate() lists candidates, check(file, content) scans one.

import { violation, PASS } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { stripNoise } from './F34-bundle-safe-module-evaluation.mjs';

const TEST_RE = /\.(test|selftest|npmtest|spec)\.[cm]?[jt]sx?$|\/__tests__\//;

// "use client" as the module's directive prologue — a string literal at the very top of the file (only
// blank lines / line or block comments may precede it), matching how Next.js itself recognizes the
// directive. Checked against the RAW content (not stripNoise'd output) because stripNoise blanks string
// literal bodies, which would erase the directive text itself.
const USE_CLIENT_RE = /^(?:\s*|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']\s*;?/;

export function isClientComponent(rawContent) {
  return USE_CLIENT_RE.test(rawContent);
}

const CALL_RE = /\.(toLocaleDateString|toLocaleTimeString)\s*\(|Intl\.DateTimeFormat\s*\(/g;

/** Balanced-paren span starting at the '(' found at or after fromIdx. Pure. */
function callSpan(s, fromIdx) {
  const open = s.indexOf('(', fromIdx);
  if (open === -1) return '';
  let depth = 0;
  for (let i = open; i < s.length; i += 1) {
    if (s[i] === '(') depth += 1;
    else if (s[i] === ')') {
      depth -= 1;
      if (depth === 0) return s.slice(open, i + 1);
    }
  }
  return s.slice(open);
}

/**
 * Date-formatting calls in one module's (already noise-stripped) source that lack a `timeZone` key
 * anywhere in the call's argument list. Returns [{ line, call }]. Pure — the caller decides whether the
 * file is a hydrated client component at all.
 */
export function findUnpinnedDateCalls(strippedSrc) {
  const hits = [];
  CALL_RE.lastIndex = 0;
  let m;
  while ((m = CALL_RE.exec(strippedSrc))) {
    const span = callSpan(strippedSrc, m.index);
    if (!/timeZone/.test(span)) {
      const line = (strippedSrc.slice(0, m.index).match(/\n/g) || []).length + 1;
      const call = m[1] ? `${m[1]}()` : 'Intl.DateTimeFormat()';
      hits.push({ line, call });
    }
  }
  return hits;
}

// File-scoped, not a claim of safety — see this module's header "SCOPE, STATED HONESTLY".
export const PRE_EXISTING_ALLOWLIST = Object.freeze({
  'fsi-app/src/components/community/CommunitySearchResults.tsx': 'Pre-existing at F36 introduction (2026-09-04), not audited this lane.',
  'fsi-app/src/components/community/GroupModals.tsx': 'Pre-existing at F36 introduction (2026-09-04), not audited this lane.',
  'fsi-app/src/components/admin/redesign/WorkspacesUsageRow.tsx': 'Pre-existing at F36 introduction (2026-09-04), not audited this lane.',
  'fsi-app/src/components/admin/redesign/MembersPanel.tsx': 'Pre-existing at F36 introduction (2026-09-04), not audited this lane.',
  'fsi-app/src/components/admin/IntegrityFlagsView.tsx': 'Pre-existing at F36 introduction (2026-09-04), not audited this lane.',
  'fsi-app/src/components/admin/OrganizationsTable.tsx': 'Pre-existing at F36 introduction (2026-09-04), not audited this lane.',
  'fsi-app/src/components/admin/CoverageMatrixView.tsx': 'Pre-existing at F36 introduction (2026-09-04), not audited this lane.',
  'fsi-app/src/components/profile/MembersPanel.tsx': 'Pre-existing at F36 introduction (2026-09-04), not audited this lane.',
  'fsi-app/src/components/resource/IntelligenceMetadataStrip.tsx': 'Pre-existing at F36 introduction (2026-09-04), not audited this lane.',
  'fsi-app/src/components/settings/SavedSearchesSection.tsx': 'Pre-existing at F36 introduction (2026-09-04), not audited this lane.',
  'fsi-app/src/components/home/HomeSurface.tsx': 'Pre-existing at F36 introduction (2026-09-04), not audited this lane.',
  'fsi-app/src/components/sources/SourceHealthDashboard.tsx': 'Pre-existing at F36 introduction (2026-09-04), not audited this lane.',
  'fsi-app/src/components/AskAssistant.tsx': 'Pre-existing at F36 introduction (2026-09-04), not audited this lane.',
  'fsi-app/src/components/onboarding/NoWorkspaceLanding.tsx': 'Pre-existing at F36 introduction (2026-09-04), not audited this lane.',
  'fsi-app/src/components/pages/MarketSignalDetailSurface.tsx': 'Pre-existing at F36 introduction (2026-09-04), not audited this lane.',
});

export const fitnessFunction = {
  id: 'F36',
  name: 'date-format-timezone-pin',
  description:
    'A "use client" module under fsi-app/src/app/** or fsi-app/src/components/** must not call ' +
    '.toLocaleDateString(...)/.toLocaleTimeString(...)/new Intl.DateTimeFormat(...) without a `timeZone` ' +
    'key: the server render (UTC Lambda) and the client hydration render (viewer local zone) disagree on ' +
    'a date-only value near a local-midnight boundary, throwing React #418 (regulations/page.tsx, ' +
    '2026-09-04). Files listed in PRE_EXISTING_ALLOWLIST are named debt from this gate\'s introduction, not ' +
    'a safety claim; every other file is enforced from here forward.',
  source: 'Lane PERF-8, Addendum 85 postscript 27 measurement (React #418 on /regulations), commit 27f6a358',

  enumerate() {
    return globFiles(['fsi-app/src/app/**/*.{ts,tsx}', 'fsi-app/src/components/**/*.{ts,tsx}']).filter(
      (f) => !TEST_RE.test(f) && !f.includes('/src/_archive/'),
    );
  },

  check(file, content) {
    if (!isClientComponent(content)) return PASS;
    const hits = findUnpinnedDateCalls(stripNoise(content));
    if (hits.length === 0) return PASS;
    if (PRE_EXISTING_ALLOWLIST[file]) return PASS;
    return hits.map((h) =>
      violation(
        h.line,
        `${h.call} with no timeZone in a "use client" component: the server (UTC) and client hydration ` +
          'renders can disagree on the calendar day for a date-only value, throwing React #418. Pin ' +
          'timeZone: "UTC" (see src/components/regulations/format-fixed-date.ts), or the convention already ' +
          'used by DashboardTopPriority.tsx / UserProfilePage.tsx / OrganizationPanel.tsx.',
      ),
    );
  },
};
