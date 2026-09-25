// F58: no-standalone-obligations-strip (lane PARITY-PARTS, 2026-09-25, operator ruling under
// invariant RD-84).
//
// Operator ruling: "Upcoming-obligations strip: remove it as a separate element. Show each
// obligation in the timeline instead." UpcomingObligationsStrip's `variant="detail"` mount was the
// separate-element strip on a detail page (regulations/[slug]/page.tsx, removed this lane -
// mergeObligationEvents in timeline-math.ts folds the same item_forward_events data into the
// TIMELINE's own markers instead, F58's sibling static rule for the collapse bound lives in
// timeline-math.test.mjs, which the no-npm suite already runs). This function is the static,
// source-level gate so `variant="detail"` cannot re-enter a detail surface silently again - the same
// class fix F57 is for ImpactMeter's retired `variant="full"`.
//
// Scope: the four detail-surface files only (RegulationDetailSurface.tsx and its three siblings).
// The LIST strip (`variant="list"`, /regulations and /market list pages) is UNCHANGED by this ruling
// and stays out of scope - this function does not forbid importing UpcomingObligationsStrip
// entirely, only mounting it with `variant="detail"`, and only from the four surfaces the ruling
// names ("the shared parts on EVERY detail page that has obligations").
import { violation } from '../lib/result.mjs';

const DETAIL_SURFACE_FILES = [
  'fsi-app/src/components/regulations/RegulationDetailSurface.tsx',
  'fsi-app/src/components/pages/MarketSignalDetailSurface.tsx',
  'fsi-app/src/components/research/ResearchFindingDetailSurface.tsx',
  'fsi-app/src/components/operations/OperationsDetailSurface.tsx',
];

// Matches a JSX mount of UpcomingObligationsStrip carrying variant="detail" as one of its props,
// across line breaks (a multi-line-formatted mount is not a blind spot) - same bracket/quote-depth
// tag-close scan F57's findFullVariantMounts uses, reused here rather than re-derived (CLAUDE.md
// rule 13: same class of scan, kept as one small local copy since the two functions check different
// tag names and this file has no other reason to import F57).
const TAG_OPEN_RE = /<UpcomingObligationsStrip\b/g;

export function findDetailVariantMounts(content) {
  const src = String(content ?? '');
  const out = [];
  let m;
  TAG_OPEN_RE.lastIndex = 0;
  while ((m = TAG_OPEN_RE.exec(src))) {
    const tagStart = m.index;
    const lineStart = src.lastIndexOf('\n', tagStart) + 1;
    const linePrefix = src.slice(lineStart, tagStart);
    if (/^\s*(\/\/|\*)/.test(linePrefix)) continue; // tag opens on a comment-only line
    let depth = 0;
    let quote = null;
    let end = -1;
    for (let i = tagStart; i < src.length; i++) {
      const c = src[i];
      if (quote) {
        if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'") { quote = c; continue; }
      if (c === '{') { depth++; continue; }
      if (c === '}') { depth--; continue; }
      if (c === '>' && depth === 0) { end = i; break; }
    }
    if (end === -1) continue; // unterminated tag (malformed source); nothing to check
    const tagText = src.slice(tagStart, end + 1);
    if (/\bvariant="detail"/.test(tagText)) {
      const lineNo = src.slice(0, tagStart).split('\n').length;
      out.push(lineNo);
    }
  }
  return out;
}

export const fitnessFunction = {
  id: 'F58',
  name: 'no-standalone-obligations-strip',
  description:
    'No detail surface mounts <UpcomingObligationsStrip variant="detail">. Operator ruling (lane ' +
    'PARITY-PARTS, 2026-09-25): the strip is removed as a separate element; each obligation shows ' +
    'as a TIMELINE marker instead (mergeObligationEvents, timeline-math.ts). Scoped to the four ' +
    'detail-surface files only - the list strip (variant="list") is unaffected.',
  source: 'docs/ops/session-log.md, 2026-09-25 operator ruling; invariant RD-84',

  enumerate() {
    return DETAIL_SURFACE_FILES;
  },

  check(filepath, content) {
    const out = [];
    for (const line of findDetailVariantMounts(content)) {
      out.push(
        violation(
          line,
          'mounts <UpcomingObligationsStrip variant="detail">, which operator ruling (2026-09-25) ' +
            'retires - the same events must merge into the TIMELINE via mergeObligationEvents ' +
            'instead of rendering as a separate strip element.'
        )
      );
    }
    return out;
  },
};
