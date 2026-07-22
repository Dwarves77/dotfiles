// F17: size-cap doctrine (the size-axis analog of the spend ceiling F15). Every size cap on the capture →
// synthesis → grounding → judge path is either sized so it never binds in normal operation, or fails LOUD
// (surfaced wall + integrity flag) when it binds — silent slicing is forbidden (the category-2 defect:
// GROUND_SECTION_MAX_CHARS=12000 silently hid the back of every long section). This guard maintains a REGISTRY
// of every cap constant on the path, each classified; a NEW `*_MAX_CHARS`/`*_BUDGET_CHARS`/`*_CEILING_CHARS`
// constant declared on a path file that is NOT registered is RED (it must be classified before it lands), and
// any registry entry marked silent-binding-on-the-grounding-path is RED (the doctrine forbids it). Source:
// completeness/size-cap dispatch (2026-07-06). Full inventory: docs/design/cap-inventory-2026-07-06.md.

import { violation } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { isOverridden } from '../lib/file-content.mjs';

// Files that DECLARE size caps on the generation/grounding path.
export const PATH_FILES = new Set([
  'fsi-app/src/lib/agent/generation-config.ts',
  'fsi-app/src/lib/agent/section-grounding.mjs',
]);

// A cap constant declaration: export const NAME_MAX_CHARS|_BUDGET_CHARS|_CEILING_CHARS = ...
export const CAP_DECL_RE = /export\s+const\s+([A-Z][A-Z0-9_]*(?:_MAX_CHARS|_BUDGET_CHARS|_CEILING_CHARS))\b/g;

// THE REGISTRY — every path cap, classified. status ∈ { surfaced, never-binds }. A `silent-grounding` status is
// FORBIDDEN (the doctrine): if any entry ever carries it, F17 is RED. New caps must be added here with a
// non-silent classification before they can land.
export const CAP_REGISTRY = {
  STORAGE_MAX_CHARS: { status: 'surfaced', why: 'ADR-016: pathological-page sanity ceiling (10M), NOT an operating cap; a hit reports truncated+fullLength → recordTruncation fires the truncation-guard flag. Retired PRIMARY_MAX_CHARS + CORROBORATOR_MAX_CHARS: storage-side caps made incompleteness permanent — capping is now a synthesis-window decision (SYNTH_* below) over a complete stored capture.' },
  SYNTH_INPUT_BUDGET_CHARS: { status: 'surfaced', why: 'buildSourceBlocks trims → recordTruncation' },
  SYNTH_PRIMARY_HARD_CEILING_CHARS: { status: 'surfaced', why: 'ceilingWalls → recordTruncation' },
  GROUND_SECTION_HARD_CEILING_CHARS: { status: 'never-binds', why: 'max real section 32K ≪ 200K; over-ceiling SURFACED via recordTruncation(section-ceiling)' },
};
const FORBIDDEN_STATUS = 'silent-grounding';

export const fitnessFunction = {
  id: 'F17',
  name: 'size-cap-doctrine',
  description: 'Every size cap on the grounding path is registered + classified (surfaced or never-binds); a new unregistered cap constant is RED, and a silent-binding grounding cap is RED. Kills the silent-slice class (the GROUND_SECTION_MAX_CHARS category-2 defect).',
  source: 'completeness/size-cap dispatch (2026-07-06)',

  enumerate() {
    return globFiles(['fsi-app/src/lib/agent/generation-config.ts', 'fsi-app/src/lib/agent/section-grounding.mjs']);
  },

  check(filepath, content) {
    if (!PATH_FILES.has(filepath)) return [];
    const out = [];
    // 1. a silent-binding grounding cap in the registry is forbidden
    for (const [name, e] of Object.entries(CAP_REGISTRY)) {
      if (e.status === FORBIDDEN_STATUS) out.push(violation(1, `CAP_REGISTRY entry ${name} is '${FORBIDDEN_STATUS}' — the size-cap doctrine forbids a silent-binding grounding cap. Surface it (recordTruncation) or size it to never bind.`));
    }
    // 2. any cap constant declared here but NOT in the registry is RED (classify it first)
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
      CAP_DECL_RE.lastIndex = 0;
      let m;
      while ((m = CAP_DECL_RE.exec(line)) !== null) {
        const name = m[1];
        if (!(name in CAP_REGISTRY) && !isOverridden(line, 'F17')) {
          out.push(violation(i + 1, `New size cap ${name} on the grounding path is NOT in F17 CAP_REGISTRY. Add it with a classification (status: 'surfaced' if it fails loud on bind, or 'never-binds' if sized above any real input) — a silent slice is forbidden. See docs/design/cap-inventory-2026-07-06.md.`));
        }
      }
    }
    return out;
  },
};
