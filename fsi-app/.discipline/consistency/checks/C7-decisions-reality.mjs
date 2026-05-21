// C7: ADRs in docs/decisions/ exist with valid frontmatter, scope globs match real files (or annotated future-scoped), no orphaned ADRs.

import { drift, DRIFT_KIND, NO_DRIFT } from '../lib/drift.mjs';
import { listAllAdrs, matchScopeGlob } from '../../lib/adr-loader.mjs';
import { globFiles } from '../../fitness/lib/glob.mjs';
import { readInventory, parseMarkdownTables, cleanCell } from '../lib/inventory-parser.mjs';

export const consistencyCheck = {
  id: 'C7',
  name: 'decisions.md reality',
  description: 'Each ADR file referenced in docs/inventories/decisions.md exists with valid frontmatter; each ADR\'s scope glob matches at least one file (or is annotated future-scoped); no orphaned ADRs.',
  source: 'Layer 4 dispatch + ADR-005 + ADR-009',

  run() {
    const drifts = [];
    const adrs = listAllAdrs();
    const inventoryContent = readInventory('docs/inventories/decisions.md');

    if (!inventoryContent) {
      drifts.push(drift(
        DRIFT_KIND.ORPHAN_CLAIM,
        'docs/inventories/decisions.md does not exist; cannot cross-reference ADRs.',
        'docs/inventories/decisions.md',
      ));
      return drifts;
    }

    // Each ADR file must validate
    for (const adr of adrs) {
      if (adr._errors && adr._errors.length > 0) {
        for (const err of adr._errors) {
          drifts.push(drift(
            DRIFT_KIND.MALFORMED,
            `${adr.filePath || adr.id}: ${err}`,
            adr.filePath,
          ));
        }
        continue;
      }

      // Each accepted ADR's scope glob must match at least one file
      if (adr.status === 'accepted') {
        for (const scope of adr.scope) {
          const matches = globFiles([scope]);
          // Glob lib doesn't yet support every shape (e.g., dir/ might match many files)
          // Try also matching every file under repo against the scope glob via the loader's matcher
          // For broad scopes like "fsi-app/src/components/", at least one file should match.
          if (matches.length === 0) {
            // Fallback: scan a broader set and use the ADR-loader's matcher
            const broad = globFiles(['fsi-app/']);
            const matched = broad.some((p) => matchScopeGlob(p, scope));
            if (!matched) {
              drifts.push(drift(
                DRIFT_KIND.SCOPE_UNMATCHED,
                `${adr.id} scope glob "${scope}" matches no files in the repo. If this is intentionally future-scoped, add a comment in the ADR body explaining why; otherwise update the scope.`,
                adr.filePath,
              ));
            }
          }
        }
      }
    }

    // Each ADR file must be referenced in the inventory
    const tables = parseMarkdownTables(inventoryContent);
    const inventoryIds = new Set();
    for (const t of tables) {
      for (const row of t.rows) {
        const idCell = row['ID'] || row['Id'] || row['id'];
        if (!idCell) continue;
        const cleaned = cleanCell(idCell);
        if (/^ADR-\d{3}$/.test(cleaned)) inventoryIds.add(cleaned);
      }
    }

    for (const adr of adrs) {
      if (!inventoryIds.has(adr.id)) {
        drifts.push(drift(
          DRIFT_KIND.MISSING_CLAIM,
          `${adr.id} (${adr.title}) exists at ${adr.filePath} but is not listed in docs/inventories/decisions.md.`,
          adr.filePath,
        ));
      }
    }

    // Each inventory ID must have a corresponding ADR file
    const adrIds = new Set(adrs.map((a) => a.id));
    for (const id of inventoryIds) {
      if (!adrIds.has(id)) {
        drifts.push(drift(
          DRIFT_KIND.ORPHAN_CLAIM,
          `Inventory lists ${id} but no ADR file exists at docs/decisions/${id}-*.md.`,
          'docs/inventories/decisions.md',
        ));
      }
    }

    return drifts.length === 0 ? NO_DRIFT : drifts;
  },
};
