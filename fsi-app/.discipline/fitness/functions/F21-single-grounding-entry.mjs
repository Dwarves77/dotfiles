// F21: single grounding entry. Grounding acquisition (fetch + model to produce/verify a brief) has ONE entry:
// the durable workflow (generate-brief.ts) over the canonical pipeline (canonical-pipeline.ts), reached through
// the snapshot-first verify-item entry point. No OTHER production file may directly invoke the grounding-entry
// functions (generateBriefWorkflow / generateBrief / groundBrief / generateBriefFromStored /
// generateBriefRefreshPrimary) — a direct call outside the sanctioned set re-creates the old bypass path that
// spent $65 unattributed in July. Direct invocation = build failure. Source: snapshot-first rebuild PR-2
// (operator ruling 2026-07-13). Scope: all of src and all of scripts (lane GATE-8, 2026-10-08, AUD-AT-4 B2-30,
// B2-31: the earlier scope was src/lib, src/app/api and src/workflows, "one-off scripts are held at the commit
// layer (rule 016)", but rule 016 was removed by GATE-1; a script or a component that grounds is now caught here).

import { violation } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { views, overrideLines, lineOfIndex } from '../lib/code-scan.mjs';

// Files ALLOWED to invoke the grounding entry: the pipeline that DEFINES the primitives, the workflow that
// orchestrates them, the intake orchestrator + the two routes that START the workflow, and the new
// snapshot-first entry point that hands off to the paid pipeline once unlocked.
export const SANCTIONED = new Set([
  'fsi-app/src/lib/agent/canonical-pipeline.ts',   // defines generateBrief / groundBrief / …
  'fsi-app/src/workflows/generate-brief.ts',       // the durable workflow (generateBriefWorkflow + steps)
  'fsi-app/src/lib/intake/run-intake-cycle.ts',    // calls generateBriefWorkflow
  'fsi-app/src/app/api/agent/run/route.ts',        // start(generateBriefWorkflow)
  'fsi-app/src/lib/sources/verify-item.mjs',       // the snapshot-first entry point
  // Script-side callers of the injected-ledger seam, each with its reason (lane GATE-8 widened the scope to
  // scripts). Both hand groundBrief a pre-built ledger and spend nothing metered.
  'fsi-app/scripts/_reground/executor-ground.mjs', // the free grounding executor: submits a hand-made ledger through groundBrief's injectedLedger seam
  'fsi-app/scripts/turns/apply-record-briefs.mjs', // the record-briefs applier: grounds an entry's injected claims through the same seam, no acquire lock
]);

// Every name only the sanctioned set may mention. Lane GATE-8 (AUD-AT-4 B2-26 to B2-31): the gate reads the NAME
// in code, not a `name(` call on one line. An indirect call `(0, generateBrief)(x)`, an import alias
// (`import { generateBrief as g }`), a namespace bracket call `m["generateBrief"](x)` and a call split across
// lines all name the entry point; so does a destructuring or a re-export. A comment and a string that merely
// contains the name do not. `regenerateBrief` and `groundBriefImpl` are different identifiers and stay clear.
export const ENTRY_NAMES = ['generateBriefWorkflow', 'generateBriefFromStored', 'generateBriefRefreshPrimary', 'generateBrief', 'groundBrief'];
const NAME_ALT = ENTRY_NAMES.join('|');
export const ENTRY_NAME_RE = new RegExp(`(?<![\\w$])(?:${NAME_ALT})(?![\\w$])`, 'g');
const BRACKET_RE = new RegExp(`\\[\\s*(["'\`])(?:${NAME_ALT})\\1\\s*\\]`, 'g');
// Kept for callers that import them: the workflow symbol alone, and a direct call to a pipeline primitive.
export const WORKFLOW_RE = /\bgenerateBriefWorkflow\b/;
export const GROUNDING_CALL_RE = /\b(generateBrief|groundBrief|generateBriefFromStored|generateBriefRefreshPrimary)\s*\(/;

/** Lines (1-based) naming a grounding-entry function in code, overrides applied. @param {string} content */
export function groundingEntryLines(content) {
  const { code, text } = views(content);
  const overridden = overrideLines(content, 'F21');
  const lines = new Set();
  let m;
  ENTRY_NAME_RE.lastIndex = 0;
  while ((m = ENTRY_NAME_RE.exec(code))) lines.add(lineOfIndex(code, m.index));
  BRACKET_RE.lastIndex = 0;
  while ((m = BRACKET_RE.exec(text))) lines.add(lineOfIndex(text, m.index));
  return [...lines].filter((ln) => !overridden.has(ln)).sort((a, b) => a - b);
}

export const fitnessFunction = {
  id: 'F21',
  name: 'single-grounding-entry',
  description: 'Grounding acquisition has one entry (the workflow over the canonical pipeline, via verify-item); no other production file directly invokes the grounding-entry functions.',
  source: 'snapshot-first rebuild PR-2 (operator ruling 2026-07-13)',

  enumerate() {
    return globFiles([
      'fsi-app/src/**/*.{ts,tsx,mjs,js,cjs,jsx}',
      'fsi-app/scripts/**/*.{mjs,js,cjs,ts}',
    ]).filter((p) => !/\.(test|selftest|npmtest|golden)\.(ts|tsx|mjs|js|cjs)$/.test(p) && !p.includes('/__tests__/'));
  },

  check(filepath, content) {
    if (SANCTIONED.has(filepath)) return [];
    return groundingEntryLines(content).map((ln) => violation(ln,
      `Direct grounding-entry invocation outside the single pipeline (${[...SANCTIONED][0]} + the workflow). Route grounding through the snapshot-first verify-item entry point / generateBriefWorkflow — a direct generateBrief/groundBrief/generateBriefWorkflow call re-creates the old bypass path. Override (single line): \`// fitness-allow: F21 (reason)\`.`));
  },
};
