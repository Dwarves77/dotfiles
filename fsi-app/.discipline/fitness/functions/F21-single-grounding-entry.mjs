// F21: single grounding entry. Grounding acquisition (fetch + model to produce/verify a brief) has ONE entry:
// the durable workflow (generate-brief.ts) over the canonical pipeline (canonical-pipeline.ts), reached through
// the snapshot-first verify-item entry point. No OTHER production file may directly invoke the grounding-entry
// functions (generateBriefWorkflow / generateBrief / groundBrief / generateBriefFromStored /
// generateBriefRefreshPrimary) — a direct call outside the sanctioned set re-creates the old bypass path that
// spent $65 unattributed in July. Direct invocation = build failure. Source: snapshot-first rebuild PR-2
// (operator ruling 2026-07-13). Scope mirrors F15/F16: production path only (src/lib, src/app/api,
// src/workflows); one-off scripts are held at the commit layer (rule 016) + the runner deletion, not here.

import { violation } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { isOverridden } from '../lib/file-content.mjs';

// Files ALLOWED to invoke the grounding entry: the pipeline that DEFINES the primitives, the workflow that
// orchestrates them, the intake orchestrator + the two routes that START the workflow, and the new
// snapshot-first entry point that hands off to the paid pipeline once unlocked.
export const SANCTIONED = new Set([
  'fsi-app/src/lib/agent/canonical-pipeline.ts',   // defines generateBrief / groundBrief / …
  'fsi-app/src/workflows/generate-brief.ts',       // the durable workflow (generateBriefWorkflow + steps)
  'fsi-app/src/lib/intake/run-intake-cycle.ts',    // calls generateBriefWorkflow
  'fsi-app/src/app/api/agent/run/route.ts',        // start(generateBriefWorkflow)
  'fsi-app/src/app/api/staged-updates/route.ts',   // start(generateBriefWorkflow) (legacy; retired by Unit 0c)
  'fsi-app/src/lib/sources/verify-item.mjs',       // the snapshot-first entry point
]);

// Any reference to the workflow symbol (import or start(...)) — only the sanctioned set may name it.
export const WORKFLOW_RE = /\bgenerateBriefWorkflow\b/;
// A direct CALL to a pipeline grounding primitive. Word-boundaried so `regenerateBrief(` does NOT match, and
// `\s*\(` so bare mentions in identifiers (groundBriefImpl) do not match.
export const GROUNDING_CALL_RE = /\b(generateBrief|groundBrief|generateBriefFromStored|generateBriefRefreshPrimary)\s*\(/;

/** Lines making a forbidden grounding-entry reference, skipping comments + overrides. @param {string} content */
export function groundingEntryLines(content) {
  const out = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue; // comment lines are not calls
    if (isOverridden(lines[i], 'F21')) continue;
    if (WORKFLOW_RE.test(lines[i]) || GROUNDING_CALL_RE.test(lines[i])) out.push(i + 1);
  }
  return out;
}

export const fitnessFunction = {
  id: 'F21',
  name: 'single-grounding-entry',
  description: 'Grounding acquisition has one entry (the workflow over the canonical pipeline, via verify-item); no other production file directly invokes the grounding-entry functions.',
  source: 'snapshot-first rebuild PR-2 (operator ruling 2026-07-13)',

  enumerate() {
    return globFiles([
      'fsi-app/src/lib/**/*.{ts,mjs}',
      'fsi-app/src/app/api/**/*.ts',
      'fsi-app/src/workflows/**/*.ts',
    ]);
  },

  check(filepath, content) {
    if (SANCTIONED.has(filepath)) return [];
    return groundingEntryLines(content).map((ln) => violation(ln,
      `Direct grounding-entry invocation outside the single pipeline (${[...SANCTIONED][0]} + the workflow). Route grounding through the snapshot-first verify-item entry point / generateBriefWorkflow — a direct generateBrief/groundBrief/generateBriefWorkflow call re-creates the old bypass path. Override (single line): \`// fitness-allow: F21 (reason)\`.`));
  },
};
