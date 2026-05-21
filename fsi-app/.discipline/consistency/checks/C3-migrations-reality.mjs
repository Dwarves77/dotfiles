// C3: every file in fsi-app/supabase/migrations/ is listed in docs/inventories/migrations.md;
// every listed migration exists on disk.
//
// Inventory currently stub-shaped; populated check will surface drift = "stub doesn't enumerate"
// which is the expected initial finding.

import { drift, DRIFT_KIND, NO_DRIFT } from '../lib/drift.mjs';
import { globFiles } from '../../fitness/lib/glob.mjs';
import { readInventory, parseMarkdownTables, cleanCell } from '../lib/inventory-parser.mjs';

export const consistencyCheck = {
  id: 'C3',
  name: 'migrations.md reality',
  description: 'Every file in fsi-app/supabase/migrations/ is listed in docs/inventories/migrations.md; every listed migration exists on disk.',
  source: 'Layer 4 dispatch + ADR-005',

  run() {
    const drifts = [];
    const onDisk = globFiles(['fsi-app/supabase/migrations/*.sql'])
      .map((p) => p.split('/').pop());
    const inventoryContent = readInventory('docs/inventories/migrations.md');

    if (!inventoryContent) {
      drifts.push(drift(
        DRIFT_KIND.ORPHAN_CLAIM,
        'docs/inventories/migrations.md does not exist; cannot cross-reference migrations.',
        'docs/inventories/migrations.md',
      ));
      return drifts;
    }

    // Parse tables; extract filename cells
    const tables = parseMarkdownTables(inventoryContent);
    const inventoryFilenames = new Set();
    for (const t of tables) {
      const fileCol = t.header.find((h) => /file|migration|name/i.test(h));
      if (!fileCol) continue;
      for (const row of t.rows) {
        const cell = cleanCell(row[fileCol] || '');
        // Extract a *.sql filename if present
        const m = cell.match(/(\d{3}_[a-zA-Z0-9_-]+\.sql)/);
        if (m) inventoryFilenames.add(m[1]);
      }
    }

    // If inventory is stub-shaped (no migration filenames extracted), surface as drift
    if (inventoryFilenames.size === 0 && onDisk.length > 0) {
      drifts.push(drift(
        DRIFT_KIND.STALE_STATUS,
        `docs/inventories/migrations.md is stub-shaped (no migration entries parseable from tables) but ${onDisk.length} migration files exist on disk. Populate the inventory.`,
        'docs/inventories/migrations.md',
      ));
      return drifts;
    }

    // Each on-disk migration must be in inventory
    for (const name of onDisk) {
      if (!inventoryFilenames.has(name)) {
        drifts.push(drift(
          DRIFT_KIND.MISSING_CLAIM,
          `Migration file ${name} exists on disk but is not listed in docs/inventories/migrations.md.`,
          `fsi-app/supabase/migrations/${name}`,
        ));
      }
    }

    // Each inventory entry must correspond to a real file
    for (const name of inventoryFilenames) {
      if (!onDisk.includes(name)) {
        drifts.push(drift(
          DRIFT_KIND.ORPHAN_CLAIM,
          `docs/inventories/migrations.md claims migration ${name} but file does not exist.`,
          'docs/inventories/migrations.md',
        ));
      }
    }

    return drifts.length === 0 ? NO_DRIFT : drifts;
  },
};
