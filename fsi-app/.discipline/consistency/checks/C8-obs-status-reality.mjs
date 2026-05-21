// C8: each OBS entry in docs/sprint-*/followups.md is reflected in docs/inventories/obs-status.md (or the inventory is stub-shaped, surfaced as drift).

import { drift, DRIFT_KIND, NO_DRIFT } from '../lib/drift.mjs';
import { readInventory } from '../lib/inventory-parser.mjs';
import { globFiles } from '../../fitness/lib/glob.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getRepoRoot } from '../../lib/context.mjs';

function listOBSEntries() {
  const root = getRepoRoot();
  const followups = globFiles(['docs/sprint-1/followups.md', 'docs/sprint-2/followups.md', 'docs/sprint-3/followups.md']);
  const entries = [];
  for (const rel of followups) {
    const abs = join(root, rel);
    if (!existsSync(abs)) continue;
    const content = readFileSync(abs, 'utf-8');
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^##\s+OBS-(\d+):/);
      if (m) entries.push({ id: `OBS-${m[1]}`, file: rel, line: i + 1 });
    }
  }
  return entries;
}

export const consistencyCheck = {
  id: 'C8',
  name: 'obs-status.md reality',
  description: 'Each OBS entry in sprint-N/followups.md docs is reflected in docs/inventories/obs-status.md.',
  source: 'Layer 4 dispatch + ADR-005',

  run() {
    const drifts = [];
    const entries = listOBSEntries();
    const inventoryContent = readInventory('docs/inventories/obs-status.md');

    if (!inventoryContent) {
      drifts.push(drift(
        DRIFT_KIND.ORPHAN_CLAIM,
        'docs/inventories/obs-status.md does not exist.',
        'docs/inventories/obs-status.md',
      ));
      return drifts;
    }

    // Check whether each OBS-N is mentioned in the inventory.
    // A stub inventory (no OBS-N mentions) surfaces as drift.
    const mentionedIds = new Set();
    for (const e of entries) {
      if (inventoryContent.includes(e.id)) mentionedIds.add(e.id);
    }

    if (mentionedIds.size === 0 && entries.length > 0) {
      drifts.push(drift(
        DRIFT_KIND.STALE_STATUS,
        `docs/inventories/obs-status.md is stub-shaped (no OBS-N mentions) but ${entries.length} OBS entries exist in followups docs. Populate the inventory.`,
        'docs/inventories/obs-status.md',
      ));
      return drifts;
    }

    // For each existing OBS, verify it's referenced
    for (const e of entries) {
      if (!mentionedIds.has(e.id)) {
        drifts.push(drift(
          DRIFT_KIND.MISSING_CLAIM,
          `${e.id} exists at ${e.file}:${e.line} but is not mentioned in docs/inventories/obs-status.md.`,
          `${e.file}:${e.line}`,
        ));
      }
    }

    return drifts.length === 0 ? NO_DRIFT : drifts;
  },
};
