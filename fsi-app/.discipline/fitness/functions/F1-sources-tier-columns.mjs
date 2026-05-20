// F1: sources-table reads must use base_tier or effective_tier; deprecated `tier` column reference fails.
// Source: Q2 tier schema split (migration 090; renamed sources.tier to sources.base_tier + added effective_tier).
// Phase 1.5 migrated consumer wiring; F1 mechanically enforces the migration going forward.
//
// Scope: every file under fsi-app/src/ that contains a sources-table reference.
// Check: detect uses of the deprecated `tier` column in a sources context.
//        Specifically: a select-string containing word-boundary `tier` (not base_tier,
//        effective_tier, tier_at_creation, etc.) where the file also contains a
//        .from("sources") or "sources(" join reference.
//
// What this catches:
//   - .select("id, tier, ...") on sources
//   - inline embedded selects like source:sources(id, name, tier, url)
//
// What this allows (not violations):
//   - audit-log payloads: classification: { tier: body.tier } — that's a JS object key, not a column read
//   - other tier columns: base_tier, effective_tier, tier_at_creation, provisional_tier, etc.
//   - tier on non-sources tables (provisional_sources.provisional_tier, source_trust_events, etc.)
//   - comments mentioning tier
//
// Override: trailing `// fitness-allow: F1 (reason)` on the matching line.

import { violation, PASS } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { isOverridden } from '../lib/file-content.mjs';

// Match a column reference inside what looks like a select string.
// We look for word-boundary `tier` NOT followed by `_at_creation`, NOT preceded by
// `base_` or `effective_` or `provisional_` or `tier_` etc.
// The regex below targets `tier` as a standalone token in a comma- or quote-delimited list.
const DEPRECATED_TIER_IN_SELECT_RE = /(?<![\w_])tier(?![\w_])/g;

// Heuristic: a line is a "sources select context" if it contains either:
//   - .from("sources") or .from('sources')
//   - source:sources( or sources:sources( (embedded select)
//   - is part of a SELECT_STRING block where the parent line had .from("sources")
// For simplicity, we check the FILE-level: if file contains .from("sources") AND the line
// containing tier is inside a select string (heuristic: line contains a quote+comma),
// flag it.

export const fitnessFunction = {
  id: 'F1',
  name: 'sources-tier-columns',
  description: 'Reads of the sources table must use base_tier or effective_tier; the deprecated `tier` column fails after Q2 split (migration 090).',
  source: 'Q2 tier schema split + Phase 1.5 consumer migration (commit 4a3da8d + 9a95afb)',

  enumerate() {
    return globFiles(['fsi-app/src/**/*.{ts,tsx,mjs,js}']);
  },

  check(filepath, content) {
    // Skip files that don't touch the sources table at all
    if (!/\.from\(['"]sources['"]\)|\bsources\s*\(/.test(content)) return PASS;

    const violations = [];
    const lines = content.split(/\r?\n/);

    // Scan for deprecated tier in select-string-shaped contexts.
    // A select string typically has: column names separated by commas, inside quotes.
    // We detect lines that look like they're inside a multi-line .select(`...`) template literal
    // OR a single-line .select("col1, col2, tier, ...").
    let inMultiLineSelect = false;
    let multiLineSelectStartLine = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (isOverridden(line, 'F1')) continue;

      // Track multi-line select template literal: .select(` ... `)
      const selectStart = line.match(/\.select\s*\(\s*[`]/);
      if (selectStart) {
        inMultiLineSelect = true;
        multiLineSelectStartLine = i + 1;
      }
      const selectEnd = inMultiLineSelect && /[`]\s*\)/.test(line);

      // Single-line .select("...") OR inside multi-line select OR embedded "sources(...)" select
      const isSelectContext =
        inMultiLineSelect ||
        /\.select\s*\(\s*["']/.test(line) ||
        /\bsource[s]?\s*:\s*sources\s*\(|\bsources\s*\(/.test(line);

      if (!isSelectContext) continue;

      // Look for deprecated `tier` token in this line
      DEPRECATED_TIER_IN_SELECT_RE.lastIndex = 0;
      let match;
      while ((match = DEPRECATED_TIER_IN_SELECT_RE.exec(line)) !== null) {
        // Confirm it's not part of base_tier, effective_tier, tier_at_creation, etc.
        // The negative lookbehind/lookahead in the regex already handles \w_ boundaries.
        // Also confirm this isn't inside a comment
        const beforeMatch = line.slice(0, match.index);
        if (/\/\//.test(beforeMatch)) continue; // line comment

        violations.push(violation(
          i + 1,
          `Reference to deprecated sources column \`tier\` in select context. Use \`base_tier\` (provenance/structural) or \`effective_tier\` (dynamic credibility) per the Q2 split + Phase 1.5 default rule. See docs/sprint-2/Phase-1.5-consumer-migration-list.md for per-consumer guidance.`,
        ));
      }

      if (selectEnd) {
        inMultiLineSelect = false;
      }
    }

    return violations;
  },
};
