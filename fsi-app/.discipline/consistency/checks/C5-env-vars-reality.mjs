// C5: vercel.json env references match docs/inventories/env-vars.md.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { drift, DRIFT_KIND, NO_DRIFT } from '../lib/drift.mjs';
import { getRepoRoot } from '../../lib/context.mjs';
import { readInventory } from '../lib/inventory-parser.mjs';

function readJsonSafe(relPath) {
  const abs = join(getRepoRoot(), relPath);
  if (!existsSync(abs)) return null;
  try {
    return JSON.parse(readFileSync(abs, 'utf-8'));
  } catch {
    return null;
  }
}

function extractEnvNames(obj, acc = new Set()) {
  if (!obj || typeof obj !== 'object') return acc;
  if (Array.isArray(obj)) {
    for (const item of obj) extractEnvNames(item, acc);
    return acc;
  }
  // Vercel uses ENV references as @env-name or $env-name in some places;
  // here we surface explicit `env` keys and any value matching the pattern.
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'env' && (Array.isArray(v) || typeof v === 'object')) {
      if (Array.isArray(v)) for (const name of v) acc.add(String(name));
      else for (const envName of Object.keys(v)) acc.add(envName);
    }
    if (typeof v === 'string') {
      const m = v.match(/^@([A-Z_][A-Z0-9_]*)$/);
      if (m) acc.add(m[1]);
    }
    if (typeof v === 'object') extractEnvNames(v, acc);
  }
  return acc;
}

export const consistencyCheck = {
  id: 'C5',
  name: 'env-vars.md reality',
  description: 'Env vars referenced in fsi-app/vercel.json are documented in docs/inventories/env-vars.md.',
  source: 'Layer 4 dispatch + ADR-005',

  run() {
    const drifts = [];
    const vercel = readJsonSafe('fsi-app/vercel.json');
    const inventoryContent = readInventory('docs/inventories/env-vars.md');

    if (!inventoryContent) {
      drifts.push(drift(
        DRIFT_KIND.ORPHAN_CLAIM,
        'docs/inventories/env-vars.md does not exist.',
        'docs/inventories/env-vars.md',
      ));
      return drifts;
    }

    const vercelEnvs = vercel ? extractEnvNames(vercel) : new Set();

    // Check each vercel-referenced env appears in the inventory (substring match)
    for (const envName of vercelEnvs) {
      if (!inventoryContent.includes(envName)) {
        drifts.push(drift(
          DRIFT_KIND.MISSING_CLAIM,
          `vercel.json references env var ${envName} but it is not documented in docs/inventories/env-vars.md.`,
          'docs/inventories/env-vars.md',
        ));
      }
    }

    return drifts.length === 0 ? NO_DRIFT : drifts;
  },
};
