#!/usr/bin/env node

import { FAMILIES } from './family-registry.mjs';

/**
 * Governing files per harness family, fsi-app-relative, the content `hashHarnessVersion`
 * (scripts/lib/run-artifact.mjs) hashes into that family's `harness_version`. DERIVED from FAMILIES
 * (family-registry.mjs): F28 imports this whole object; every family's own canonical runner script
 * imports its one entry and re-exports it under its historical `*_GOVERNING_FILES` name, unchanged by
 * this lane.
 */
function deriveGoverningFiles(families) {
  const base = Object.fromEntries(
    families.map((f) => [f.family, Object.freeze([...f.governing_files])]),
  );

  // The one deliberate addition described above: meta-harness watches every family's own descriptor file
  // too, sorted by family name so the list is deterministic regardless of FAMILIES's own sort order.
  const descriptorPaths = families
    .map((f) => `scripts/harness-runs/${f.family}/family.json`)
    .sort();

  return Object.freeze({
    ...base,
    'meta-harness': Object.freeze([...(base['meta-harness'] ?? []), ...descriptorPaths]),
  });
}

export const GOVERNING_FILES = deriveGoverningFiles(FAMILIES);
