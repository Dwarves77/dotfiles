// C6: vercel.json crons array matches docs/inventories/cron-jobs.md.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { drift, DRIFT_KIND, NO_DRIFT } from '../lib/drift.mjs';
import { getRepoRoot } from '../../lib/context.mjs';
import { readInventory, parseMarkdownTables, cleanCell } from '../lib/inventory-parser.mjs';

function readJsonSafe(relPath) {
  const abs = join(getRepoRoot(), relPath);
  if (!existsSync(abs)) return null;
  try {
    return JSON.parse(readFileSync(abs, 'utf-8'));
  } catch {
    return null;
  }
}

export const consistencyCheck = {
  id: 'C6',
  name: 'cron-jobs.md reality',
  description: 'Vercel cron jobs in fsi-app/vercel.json crons array are documented in docs/inventories/cron-jobs.md.',
  source: 'Layer 4 dispatch + ADR-005',

  run() {
    const drifts = [];
    const vercel = readJsonSafe('fsi-app/vercel.json');
    const inventoryContent = readInventory('docs/inventories/cron-jobs.md');

    if (!inventoryContent) {
      drifts.push(drift(
        DRIFT_KIND.ORPHAN_CLAIM,
        'docs/inventories/cron-jobs.md does not exist.',
        'docs/inventories/cron-jobs.md',
      ));
      return drifts;
    }

    const crons = (vercel && Array.isArray(vercel.crons)) ? vercel.crons : [];
    const cronPaths = new Set(crons.map((c) => c.path).filter(Boolean));

    // Parse inventory paths
    const tables = parseMarkdownTables(inventoryContent);
    const inventoryPaths = new Set();
    for (const t of tables) {
      const pathCol = t.header.find((h) => /path|endpoint|route/i.test(h));
      if (!pathCol) continue;
      for (const row of t.rows) {
        const cell = cleanCell(row[pathCol] || '');
        const m = cell.match(/(\/api\/[^\s,]+)/);
        if (m) inventoryPaths.add(m[1]);
      }
    }

    // Also check whether the inventory file mentions the path anywhere (looser check for stub inventories)
    const mentionsPath = (path) => inventoryContent.includes(path);

    for (const path of cronPaths) {
      if (!inventoryPaths.has(path) && !mentionsPath(path)) {
        drifts.push(drift(
          DRIFT_KIND.MISSING_CLAIM,
          `vercel.json crons array references ${path} but it is not documented in docs/inventories/cron-jobs.md.`,
          'docs/inventories/cron-jobs.md',
        ));
      }
    }

    for (const path of inventoryPaths) {
      if (!cronPaths.has(path)) {
        drifts.push(drift(
          DRIFT_KIND.ORPHAN_CLAIM,
          `docs/inventories/cron-jobs.md lists cron endpoint ${path} but no matching entry exists in vercel.json crons.`,
          'docs/inventories/cron-jobs.md',
        ));
      }
    }

    return drifts.length === 0 ? NO_DRIFT : drifts;
  },
};
