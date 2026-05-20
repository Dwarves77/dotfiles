// Rule 002: Source-credibility-model load-trigger
// Source: sprint-followups-discipline § Source-credibility-model load-trigger rule
//
// Trigger: commit touches any credibility-affected surface per the 9 triggers in the rule:
//   1. sources table (migrations touching sources)
//   2. source_citations / intelligence_item_citations edge tables
//   3. tier|base_tier|effective_tier|tier_override|override_reason|override_date|bias_tag* columns
//   4. candidate review surface (canonical_source_candidates, admin canonical-sources routes/components)
//   5. Haiku recommend-classification endpoints
//   6. verification pipeline (src/lib/sources/verification.ts)
//   7. customer-facing credibility signal rendering (seven Caro's Ledge surfaces)
//   8. discovery loop (citation extraction in agent run route, source resolution, candidate promotion)
//   9. citation network scoring (src/lib/trust.ts) / recency decay / override semantics
//
// Check: commit body contains "Skill-loaded: source-credibility-model" attestation line.

import { pass, fail, skip } from '../lib/result.mjs';
import {
  commitMessageHasLine,
  commitMessageMatches,
  hasFileMatching,
  filesMatching,
} from '../lib/predicates.mjs';

// Path/content predicates that detect any of the 9 trigger conditions.
function touchesCredibilitySurface(ctx) {
  // Trigger 1: sources table migrations
  if (hasFileMatching(ctx, 'fsi-app/supabase/migrations/')) {
    const migrationFiles = filesMatching(ctx, 'fsi-app/supabase/migrations/');
    if (migrationFiles.some((f) => /sources?/i.test(f.path))) return true;
    // Fallback: any migration that the commit message names as touching sources
    if (/\bsources?\b/i.test(ctx.commitMessage) && migrationFiles.length > 0) return true;
  }

  // Trigger 6: verification pipeline
  if (hasFileMatching(ctx, 'fsi-app/src/lib/sources/verification.ts')) return true;

  // Trigger 9: citation network scoring
  if (hasFileMatching(ctx, 'fsi-app/src/lib/trust.ts')) return true;

  // Triggers 1-3: any code path under fsi-app/src/lib/sources/ engages sources / tier / citation logic
  if (hasFileMatching(ctx, 'fsi-app/src/lib/sources/')) return true;

  // Trigger 4: candidate review surface (routes and components)
  if (hasFileMatching(ctx, 'fsi-app/src/app/api/admin/canonical-sources/')) return true;
  if (hasFileMatching(ctx, 'fsi-app/src/components/admin/canonical-sources/')) return true;

  // Trigger 5: Haiku recommend-classification endpoints
  if (hasFileMatching(ctx, 'fsi-app/src/app/api/admin/canonical-sources/recommend-classification/')) return true;
  if (hasFileMatching(ctx, 'fsi-app/src/app/api/admin/sources/recommend-classification/')) return true;

  // Trigger 8: discovery loop -- citation extraction in agent run route
  if (hasFileMatching(ctx, 'fsi-app/src/app/api/agent/run/route.ts')) return true;

  // Triggers 2, 3: edge-table / tier-column / bias-tag references surfaced by self-attestation
  // The commit message itself names the surface (column rename, table touch). This catches
  // SQL/migration commits whose filename doesn't include 'sources' but whose body or subject
  // names the credibility-affected column/table explicitly.
  if (commitMessageMatches(ctx, /\b(source_citations|intelligence_item_citations)\b/)) return true;
  if (commitMessageMatches(ctx, /\b(base_tier|effective_tier|tier_override|override_reason|override_date|bias_tag[a-z_]*)\b/i)) return true;
  if (commitMessageMatches(ctx, /\bcanonical_source_candidates\b/)) return true;

  return false;
}

export const rule = {
  id: '002',
  name: 'Source-credibility-model load-trigger',
  description: 'Commits touching credibility-affected surfaces must attest the source-credibility-model skill loaded.',
  ruleSource: 'sprint-followups-discipline § Source-credibility-model load-trigger rule',

  trigger(ctx) {
    if (ctx.isMergeCommit) return false;
    if (ctx.isRevertCommit) return false;
    return touchesCredibilitySurface(ctx);
  },

  check(ctx) {
    if (commitMessageHasLine(ctx, 'Skill-loaded: source-credibility-model')) return pass();
    return fail({
      message: 'Commit touches a credibility-affected surface but body is missing required "Skill-loaded: source-credibility-model" attestation.',
      remediation: [
        'Add a line to the commit body attesting the skill loaded.',
        'Format: Skill-loaded: source-credibility-model',
        'The 9 trigger conditions are listed in sprint-followups-discipline SKILL.md § Source-credibility-model load-trigger rule.',
        'If the touch is incidental (e.g. unrelated file rename in src/lib/sources/), state so on the attestation line and surface to operator.',
      ].join('\n  '),
    });
  },
};
