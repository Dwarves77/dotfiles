// C3: docs/inventories/migrations.md is DERIVED, not hand-maintained (plan 6.8, Rule A, lane N5,
// coordinator amendment 1 item 3). Two checks, both against the module that also drives the CLI
// (fsi-app/scripts/inventories/generate-migrations-inventory.mjs) so C3 and the generator can never
// silently drift onto two different ideas of what the page should look like:
//   (a) WELL-FORMEDNESS: every fsi-app/supabase/migrations/*.sql file carries a well-formed
//       `-- subject: <text>` line (after an optional leading `/* fitness-allow */` line) as the first
//       thing in the file after that optional line. A file without one is named, with the exact line
//       to add.
//   (b) PARITY: the committed docs/inventories/migrations.md equals the generator's own derived output,
//       byte for byte. A migration lane that adds a file and forgets to run the generator is caught
//       here, the same way the OLD C3 caught a migration missing from a hand-maintained table.
//
// The Subject column moved INTO each migration file (once, lane N5, 2026-09-19) because [CONFIRMED,
// measured against all 296 on-disk files]: the cleanest mechanical rule derivable from a migration's own
// header comment (first `--` line, truncated to 80 chars) reproduces only ~95 of 296 rows exactly; the
// rest carry hand-authored prose beyond the header. A `-- subject:` line makes the Subject a fact the
// file itself carries, so this table can be a real derivation of the tree again without guessing.

import { drift, DRIFT_KIND, NO_DRIFT } from '../lib/drift.mjs';
import { getRepoRoot } from '../../lib/context.mjs';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  parseSubjectLine,
  buildRows,
  buildInventoryPage,
  extractFooter,
  extractGapRows,
  MIG_DIR_REL,
  DOC_PATH_REL,
} from '../../../scripts/inventories/generate-migrations-inventory.mjs';

export const consistencyCheck = {
  id: 'C3',
  name: 'migrations.md reality',
  description:
    'Every migration file carries a well-formed `-- subject:` line, and the committed ' +
    'docs/inventories/migrations.md equals fsi-app/scripts/inventories/generate-migrations-inventory.mjs\'s ' +
    'own derived output, byte for byte.',
  source: 'Layer 4 dispatch + ADR-005; plan 6.8 Rule A (lane N5, 2026-09-19)',

  run() {
    const root = getRepoRoot();
    const migDir = resolve(root, MIG_DIR_REL);
    const docPath = resolve(root, DOC_PATH_REL);
    const drifts = [];

    if (!existsSync(migDir)) {
      return [drift(DRIFT_KIND.ORPHAN_CLAIM, `${MIG_DIR_REL} does not exist; cannot check migration subject lines.`, MIG_DIR_REL)];
    }

    // (a) WELL-FORMEDNESS.
    const files = readdirSync(migDir).filter((f) => f.endsWith('.sql'));
    for (const file of files) {
      const text = readFileSync(resolve(migDir, file), 'utf8');
      const parsed = parseSubjectLine(text);
      if (!parsed) {
        drifts.push(drift(
          DRIFT_KIND.MALFORMED,
          `${MIG_DIR_REL}/${file} has no well-formed "-- subject: <text>" line (after an optional ` +
          `leading "/* fitness-allow */" line). Add one as the first comment line naming this ` +
          `migration's subject, then run \`node fsi-app/scripts/inventories/generate-migrations-inventory.mjs --write\`.`,
          `${MIG_DIR_REL}/${file}`,
        ));
      }
    }

    // (b) PARITY. Skipped when (a) already found a malformed file (buildRows can't derive a subject
    // for it either, and reporting a parity mismatch on top would just restate the same root cause).
    if (drifts.length === 0) {
      const { rows, malformed } = buildRows(migDir);
      if (malformed.length > 0) {
        // Defensive: buildRows and parseSubjectLine share the same well-formedness rule, so this
        // should be unreachable given (a) found nothing; a mismatch here is itself a bug to report.
        drifts.push(drift(DRIFT_KIND.MALFORMED, `buildRows found malformed files (a) did not: ${malformed.join(', ')}`, MIG_DIR_REL));
      } else {
        const currentDocText = existsSync(docPath) ? readFileSync(docPath, 'utf8') : null;
        const derived = buildInventoryPage(rows, extractGapRows(currentDocText), extractFooter(currentDocText));
        if (currentDocText !== derived) {
          drifts.push(drift(
            DRIFT_KIND.STALE_STATUS,
            `${DOC_PATH_REL} does not equal the generator's derived output. Run ` +
            `\`node fsi-app/scripts/inventories/generate-migrations-inventory.mjs --write\` and commit the result.`,
            DOC_PATH_REL,
          ));
        }
      }
    }

    return drifts.length === 0 ? NO_DRIFT : drifts;
  },
};
