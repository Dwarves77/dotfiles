// F3: Application code in fsi-app/src/ must not import from fsi-app/.discipline/.
// Source: Sprint Architecture dispatch (operator-specified initial fitness function).
//
// Rationale: the discipline engine is gating infrastructure, not application code.
// If src/ imported from .discipline/, runtime behavior would couple to enforcement
// logic, which would (a) make the engine non-removable and (b) risk circular gates
// (the engine validating code that imports the engine that validates the code).
//
// Scope: every file under fsi-app/src/
// Check: no import statement (es-module or commonjs) referencing fsi-app/.discipline/
//        or its relative equivalents (../.discipline/, ../../.discipline/, etc.)

import { violation, PASS } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { isOverridden } from '../lib/file-content.mjs';

const IMPORT_REGEX = /(?:from\s+['"]|require\s*\(\s*['"]|import\s*\(\s*['"])([^'"]*?)['"]/g;
const DISCIPLINE_FRAGMENTS = ['.discipline', 'fsi-app/.discipline'];

export const fitnessFunction = {
  id: 'F3',
  name: 'src-no-discipline-imports',
  description: 'Application code under fsi-app/src/ must not import from fsi-app/.discipline/ (decoupling enforcement infrastructure from runtime).',
  source: 'Sprint Architecture dispatch (operator-specified)',

  enumerate() {
    return globFiles(['fsi-app/src/**/*.{ts,tsx,mjs,js}']);
  },

  check(filepath, content) {
    const violations = [];
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (isOverridden(line, 'F3')) continue;

      IMPORT_REGEX.lastIndex = 0;
      let match;
      while ((match = IMPORT_REGEX.exec(line)) !== null) {
        const importPath = match[1];
        if (DISCIPLINE_FRAGMENTS.some((frag) => importPath.includes(frag))) {
          violations.push(violation(
            i + 1,
            `Application code imports from .discipline/ (import path: "${importPath}"). The discipline engine must remain decoupled from runtime; if you need to expose a primitive to src/, move it to fsi-app/scripts/lib/ or fsi-app/src/lib/.`,
          ));
        }
      }
    }
    return violations;
  },
};
