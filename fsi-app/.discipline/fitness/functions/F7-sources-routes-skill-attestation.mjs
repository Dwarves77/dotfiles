// F7: API routes touching the sources table must be in source-credibility-model's load-trigger surface.
// Source: sprint-followups-discipline § Source-credibility-model load-trigger rule (also Sprint Architecture dispatch).
//
// The intent: when a route touches sources, the skill that governs the canonical
// credibility model (source-credibility-model) MUST be loaded for that dispatch.
// Rule 002 (attestation layer) checks the commit message attestation. F7 (this
// fitness function) verifies the structural relationship: every sources-touching
// route file SHOULD be implicitly in scope of source-credibility-model's load
// triggers, because the skill's load-trigger list IS the file-pattern enumeration
// of credibility-affected surfaces.
//
// What this catches:
//   - new admin route added that touches sources but the skill's load-trigger list
//     wasn't updated to include it. (The route file exists on disk; the skill's
//     trigger list mentions categories like "candidate review surface" but the
//     specific path was never added.)
//
// Approach: F7 is a SOFT cross-reference check.
//   - Enumerate route files that contain .from("sources") or sources joins
//   - For each, check the skill's trigger-list text (sprint-followups-discipline
//     SKILL.md Source-credibility-model load-trigger rule section)
//   - If the route's path family is NOT mentioned in any of the 9 trigger conditions,
//     flag it
//
// Practical limitation: trigger conditions are described in prose (e.g. "candidate
// review surface", "Haiku recommend-classification endpoints"), not as exact paths.
// F7 uses a fuzzy match: route path segments must appear (substring) in the trigger
// list text. False negatives possible; over time, codify trigger paths explicitly
// in the skill to make this check precise.

import { violation, PASS } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { readFile, isOverridden } from '../lib/file-content.mjs';

const TRIGGER_SECTION_PATH = 'fsi-app/.claude/skills/sprint-followups-discipline/SKILL.md';
const TRIGGER_SECTION_HEADER = 'Source-credibility-model load-trigger rule';

function extractTriggerSectionText() {
  const skillContent = readFile(TRIGGER_SECTION_PATH);
  if (!skillContent) return null;
  const startIdx = skillContent.indexOf(`## ${TRIGGER_SECTION_HEADER}`);
  if (startIdx < 0) return null;
  // Section ends at next `## ` header
  const afterStart = skillContent.slice(startIdx + 3);
  const endIdx = afterStart.indexOf('\n## ');
  return endIdx < 0 ? afterStart : afterStart.slice(0, endIdx);
}

// Extract the route's distinctive path segment(s) for fuzzy matching against the skill text.
// e.g. fsi-app/src/app/api/admin/canonical-sources/decide/route.ts → ['canonical-sources', 'decide']
function routePathSegments(filepath) {
  const m = filepath.match(/fsi-app\/src\/app\/api\/(.+)\/route\.ts$/);
  if (!m) return [];
  return m[1].split('/').filter((seg) => seg !== 'admin' && seg !== '[id]');
}

export const fitnessFunction = {
  id: 'F7',
  name: 'sources-routes-skill-attestation',
  description: 'API routes that touch the sources table should be representable in source-credibility-model load-trigger list (so rule 002 attestation is a verified relationship, not a self-attestation).',
  source: 'sprint-followups-discipline § Source-credibility-model load-trigger rule + Sprint Architecture dispatch',

  enumerate() {
    return globFiles(['fsi-app/src/app/api/**/route.ts']);
  },

  check(filepath, content) {
    // Only check routes that actually touch sources
    if (!/from\(['"]sources['"]\)|\bsource[s]?\s*:\s*sources\s*\(/.test(content)) return PASS;

    if (isOverridden(content.split('\n')[0] || '', 'F7')) return PASS;
    // Override can also be on any line via file-level scan; check whole file's first 5 lines
    const headerLines = content.split('\n').slice(0, 5).join('\n');
    if (isOverridden(headerLines, 'F7')) return PASS;

    const triggerText = extractTriggerSectionText();
    if (!triggerText) {
      return [violation(
        1,
        `Could not read source-credibility-model load-trigger section from ${TRIGGER_SECTION_PATH}; F7 cannot verify. If the skill was moved, update F7's TRIGGER_SECTION_PATH constant.`,
      )];
    }

    const segments = routePathSegments(filepath);
    if (segments.length === 0) return PASS;

    // Fuzzy match: at least one segment must appear in the trigger section text
    const matched = segments.some((seg) => triggerText.toLowerCase().includes(seg.toLowerCase()));
    if (matched) return PASS;

    return [violation(
      1,
      `Route file touches the sources table but no path segment (${segments.join(', ')}) appears in the source-credibility-model load-trigger section of ${TRIGGER_SECTION_PATH}. Either (a) update the skill's load-trigger list to enumerate this route family, OR (b) if the route's sources touch is incidental, add a trailing \`// fitness-allow: F7 (reason)\` comment on the first line.`,
    )];
  },
};
