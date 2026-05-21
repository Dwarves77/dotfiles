// C9: Discipline manifest consistency.
// Every rule module file in fsi-app/.discipline/rules/ is in the manifest;
// every manifest entry references an existing rule file; rule IDs are sequential without unexpected gaps.
//
// Also checks the fitness manifest (analogous: every function file is registered).

import { drift, DRIFT_KIND, NO_DRIFT } from '../lib/drift.mjs';
import { globFiles } from '../../fitness/lib/glob.mjs';
import { readFile } from '../../fitness/lib/file-content.mjs';

export const consistencyCheck = {
  id: 'C9',
  name: 'discipline manifest consistency',
  description: 'Every rule and fitness function file on disk is registered in its manifest; every manifest entry references an existing file; rule IDs are sequential without gaps.',
  source: 'Layer 4 dispatch + ADR-005',

  run() {
    const drifts = [];

    // ---- Rules manifest check ----
    const ruleFiles = globFiles(['fsi-app/.discipline/rules/*.mjs'])
      .filter((f) => !f.endsWith('.test.mjs'));
    const ruleManifest = readFile('fsi-app/.discipline/manifest.mjs') || '';
    const fitnessManifest = readFile('fsi-app/.discipline/fitness/manifest.mjs') || '';

    for (const filePath of ruleFiles) {
      const baseName = filePath.split('/').pop().replace('.mjs', '');
      // The manifest imports via './rules/<basename>.mjs'
      const expected = `./rules/${baseName}.mjs`;
      if (!ruleManifest.includes(expected)) {
        drifts.push(drift(
          DRIFT_KIND.MISSING_CLAIM,
          `Rule file ${filePath} exists but is not imported in fsi-app/.discipline/manifest.mjs.`,
          filePath,
        ));
      }
    }

    // Extract import paths from manifest; check each points to an existing file
    const importPattern = /from\s+['"](\.\/rules\/[^'"]+\.mjs)['"]/g;
    let m;
    while ((m = importPattern.exec(ruleManifest)) !== null) {
      const importPath = m[1];
      const fullPath = 'fsi-app/.discipline/' + importPath.slice(2);
      if (!ruleFiles.includes(fullPath)) {
        drifts.push(drift(
          DRIFT_KIND.ORPHAN_CLAIM,
          `manifest.mjs imports "${importPath}" but file ${fullPath} does not exist.`,
          'fsi-app/.discipline/manifest.mjs',
        ));
      }
    }

    // Rule ID sequence check: extract 3-digit ID from each rule filename
    const ruleIds = ruleFiles
      .map((f) => {
        const m = f.match(/(\d{3})-/);
        return m ? parseInt(m[1], 10) : null;
      })
      .filter((id) => id !== null)
      .sort((a, b) => a - b);

    if (ruleIds.length > 0) {
      const min = ruleIds[0];
      const max = ruleIds[ruleIds.length - 1];
      const expected = [];
      for (let i = min; i <= max; i++) expected.push(i);
      const missing = expected.filter((i) => !ruleIds.includes(i));
      if (missing.length > 0) {
        drifts.push(drift(
          DRIFT_KIND.STALE_STATUS,
          `Rule ID sequence has gaps. Expected ${min}-${max}; missing IDs: ${missing.map((i) => String(i).padStart(3, '0')).join(', ')}.`,
          'fsi-app/.discipline/rules/',
        ));
      }
    }

    // ---- Fitness manifest check (analogous) ----
    const fitnessFiles = globFiles(['fsi-app/.discipline/fitness/functions/*.mjs'])
      .filter((f) => !f.endsWith('.test.mjs'));

    for (const filePath of fitnessFiles) {
      const baseName = filePath.split('/').pop().replace('.mjs', '');
      const expected = `./functions/${baseName}.mjs`;
      if (!fitnessManifest.includes(expected)) {
        drifts.push(drift(
          DRIFT_KIND.MISSING_CLAIM,
          `Fitness function file ${filePath} exists but is not imported in fsi-app/.discipline/fitness/manifest.mjs.`,
          filePath,
        ));
      }
    }

    const fitnessImportPattern = /from\s+['"](\.\/functions\/[^'"]+\.mjs)['"]/g;
    let f;
    while ((f = fitnessImportPattern.exec(fitnessManifest)) !== null) {
      const importPath = f[1];
      const fullPath = 'fsi-app/.discipline/fitness/' + importPath.slice(2);
      if (!fitnessFiles.includes(fullPath)) {
        drifts.push(drift(
          DRIFT_KIND.ORPHAN_CLAIM,
          `fitness/manifest.mjs imports "${importPath}" but file ${fullPath} does not exist.`,
          'fsi-app/.discipline/fitness/manifest.mjs',
        ));
      }
    }

    return drifts.length === 0 ? NO_DRIFT : drifts;
  },
};
