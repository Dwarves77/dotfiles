// F15: spend chokepoint. No Anthropic API call / client instantiation may exist outside the spend client
// (src/lib/llm/spend-client.ts) and its sanctioned transport (src/lib/agent/anthropic-stream.mjs). Every
// model call routes through the chokepoint so NECESSITY (the deterministic-lever gate) + BUDGET (the standing
// ceiling) are mechanized — the operator asking "did you check the free lever first?" was the detection
// mechanism; that is the defect. Source: spend-routing-correction dispatch (operator ruling 2026-07-04).
//
// A2-PATTERN SHRINKING ALLOWLIST: the not-yet-migrated legacy call sites are grandfathered with a reason +
// reviewByPhase; each MUST still contain a direct call (a stale entry is RED — enforced by the test). Any
// NEW direct-API file that is neither sanctioned nor allowlisted is RED with file:line. The allowlist shrinks
// to empty as each site migrates to spendStream/spendSearch.

import { violation } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { isOverridden } from '../lib/file-content.mjs';

// Direct Anthropic API access — a fetch to the messages endpoint, the x-api-key header, or the SDK.
export const DIRECT_API_RE = /api\.anthropic\.com|["']x-api-key["']|new\s+Anthropic\b|@anthropic-ai\/sdk/;

// The chokepoint itself + its sanctioned low-level transport. These are ALLOWED to touch the API directly.
export const SANCTIONED = new Set([
  'fsi-app/src/lib/llm/spend-client.ts',        // THE chokepoint
  'fsi-app/src/lib/agent/anthropic-stream.mjs', // the streaming transport spend-client wraps
]);

// Legacy call sites grandfathered pending migration to spendStream/spendSearch. Reason + reviewByPhase per
// A2. SHRINKS to empty. A stale entry (file no longer has a direct call) is RED (the test asserts it).
export const LEGACY_ALLOWLIST = [
  // canonical-pipeline.ts MIGRATED (2026-07-04): callSonnet/generateBriefText → spendStreamRaw,
  // callSonnetSearch → spendSearch. It routes through the chokepoint now — OFF the allowlist (12 → 11).
  { file: 'fsi-app/src/lib/llm/haiku-classify.ts', reason: 'Haiku classifier — standing-ticket class, migrates to spend-client with standingClass', reviewByPhase: 'chokepoint-classifier-migration' },
  { file: 'fsi-app/src/lib/llm/first-fetch-classify.ts', reason: 'first-fetch classify — standing-ticket class', reviewByPhase: 'chokepoint-classifier-migration' },
  { file: 'fsi-app/src/lib/sources/recommend-source-tier.ts', reason: 'recommend-classification Haiku — standing-ticket class', reviewByPhase: 'chokepoint-classifier-migration' },
  { file: 'fsi-app/src/lib/sources/discovery.ts', reason: 'source-discovery web_search — standing-ticket class', reviewByPhase: 'chokepoint-classifier-migration' },
  { file: 'fsi-app/src/lib/sources/api-fetch.ts', reason: 'shared Anthropic fetch helper — folds into spend-client transport', reviewByPhase: 'chokepoint-transport-consolidation' },
  // ask/route.ts MIGRATED (2026-07-07, PR #248): raw fetch → spendStream with a per-request
  // ticket. Routes through the chokepoint now — OFF the allowlist (11 → 10).
  { file: 'fsi-app/src/app/api/admin/scan/route.ts', reason: 'admin scan route — migrates to spend-client', reviewByPhase: 'chokepoint-route-migration' },
  { file: 'fsi-app/src/app/api/admin/spot-check/recurring/route.ts', reason: 'spot-check classifier route — standing-ticket class', reviewByPhase: 'chokepoint-route-migration' },
  { file: 'fsi-app/src/app/api/admin/canonical-sources/recommend-classification/route.ts', reason: 'canonical recommend-classification route — standing-ticket class', reviewByPhase: 'chokepoint-route-migration' },
  { file: 'fsi-app/src/app/api/admin/sources/recommend-classification/route.ts', reason: 'sources recommend-classification route — standing-ticket class', reviewByPhase: 'chokepoint-route-migration' },
  { file: 'fsi-app/src/app/api/admin/canonical-sources/bulk-classify/route.ts', reason: 'bulk-classify route — standing-ticket class', reviewByPhase: 'chokepoint-route-migration' },
];
const ALLOWLIST_FILES = new Set(LEGACY_ALLOWLIST.map((e) => e.file));

/** Lines (1-indexed) in `content` that make a direct Anthropic API call, ignoring comment lines + overrides.
 *  NB: test the FULL line (a URL like https://api.anthropic.com contains `//` — a naive comment-split would
 *  cut it and miss the match); skip only true comment/JSDoc lines. */
export function directApiCallLines(content) {
  const out = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue; // pure comment / JSDoc line
    if (DIRECT_API_RE.test(line) && !isOverridden(line, 'F15')) out.push(i + 1);
  }
  return out;
}

export const fitnessFunction = {
  id: 'F15',
  name: 'spend-chokepoint',
  description: 'No Anthropic API call / client outside the spend client + its sanctioned transport. Legacy sites are grandfathered in a reason-bearing, reviewByPhase-tagged shrinking allowlist; any NEW ungated call site is RED.',
  source: 'spend-routing-correction dispatch (operator ruling 2026-07-04)',

  enumerate() {
    return globFiles(['fsi-app/src/lib/**/*.{ts,mjs}', 'fsi-app/src/app/api/**/*.ts']);
  },

  check(filepath, content) {
    if (SANCTIONED.has(filepath) || ALLOWLIST_FILES.has(filepath)) return [];
    return directApiCallLines(content).map((ln) =>
      violation(
        ln,
        `Direct Anthropic API call outside the spend chokepoint. Route it through spendStream/spendSearch (src/lib/llm/spend-client.ts) with a SpendTicket, OR — if it is a legacy site pending migration — add it to F15 LEGACY_ALLOWLIST with a reason + reviewByPhase. Override (single line): \`// fitness-allow: F15 (reason)\`.`,
      ),
    );
  },
};
