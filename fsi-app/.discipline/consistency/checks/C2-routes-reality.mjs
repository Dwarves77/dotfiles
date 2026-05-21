// C2: every API route under fsi-app/src/app/api/**/route.ts is enumerated in docs/inventories/routes.md.
// Inventory currently stub-shaped; this check surfaces the stub-vs-reality gap.

import { drift, DRIFT_KIND, NO_DRIFT } from '../lib/drift.mjs';
import { globFiles } from '../../fitness/lib/glob.mjs';
import { readInventory, parseMarkdownTables, cleanCell } from '../lib/inventory-parser.mjs';

export const consistencyCheck = {
  id: 'C2',
  name: 'routes.md reality',
  description: 'Every API route file in fsi-app/src/app/api/**/route.ts is enumerated in docs/inventories/routes.md.',
  source: 'Layer 4 dispatch + ADR-005',

  run() {
    const drifts = [];
    const onDisk = globFiles(['fsi-app/src/app/api/**/route.ts']);
    const inventoryContent = readInventory('docs/inventories/routes.md');

    if (!inventoryContent) {
      drifts.push(drift(
        DRIFT_KIND.ORPHAN_CLAIM,
        'docs/inventories/routes.md does not exist; cannot cross-reference routes.',
        'docs/inventories/routes.md',
      ));
      return drifts;
    }

    // Parse routes from inventory tables
    const tables = parseMarkdownTables(inventoryContent);
    const inventoryRoutes = new Set();
    for (const t of tables) {
      const pathCol = t.header.find((h) => /path|route/i.test(h));
      if (!pathCol) continue;
      for (const row of t.rows) {
        const cell = cleanCell(row[pathCol] || '');
        // Normalize: extract the /api/... portion
        const m = cell.match(/(\/api\/[^\s,]+)/);
        if (m) inventoryRoutes.add(m[1]);
      }
    }

    if (inventoryRoutes.size === 0 && onDisk.length > 0) {
      drifts.push(drift(
        DRIFT_KIND.STALE_STATUS,
        `docs/inventories/routes.md is stub-shaped (no /api/ route paths parseable from tables) but ${onDisk.length} route files exist on disk. Populate the inventory.`,
        'docs/inventories/routes.md',
      ));
      return drifts;
    }

    // Convert filesystem paths to URL-shaped paths for comparison
    const fsToUrlPath = (filepath) => {
      const m = filepath.match(/fsi-app\/src\/app\/(api\/[^/]+(?:\/[^/]+)*)\/route\.ts$/);
      if (!m) return null;
      return '/' + m[1].replace(/\[([^\]]+)\]/g, '[$1]');
    };

    const onDiskUrlPaths = new Set();
    for (const f of onDisk) {
      const url = fsToUrlPath(f);
      if (url) onDiskUrlPaths.add(url);
    }

    for (const route of onDiskUrlPaths) {
      if (!inventoryRoutes.has(route)) {
        drifts.push(drift(
          DRIFT_KIND.MISSING_CLAIM,
          `API route ${route} exists on disk but is not listed in docs/inventories/routes.md.`,
          'docs/inventories/routes.md',
        ));
      }
    }

    for (const route of inventoryRoutes) {
      if (!onDiskUrlPaths.has(route)) {
        drifts.push(drift(
          DRIFT_KIND.ORPHAN_CLAIM,
          `docs/inventories/routes.md claims route ${route} but no route file exists at the corresponding path.`,
          'docs/inventories/routes.md',
        ));
      }
    }

    return drifts.length === 0 ? NO_DRIFT : drifts;
  },
};
