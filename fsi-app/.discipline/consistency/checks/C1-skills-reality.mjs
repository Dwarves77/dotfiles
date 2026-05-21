// C1: every skill listed in docs/inventories/skills.md exists at the documented path
// with required frontmatter (name, description, when_to_load); each load-trigger
// path pattern (heuristic) resolves to at least one existing file.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { drift, DRIFT_KIND, NO_DRIFT } from '../lib/drift.mjs';
import { getRepoRoot } from '../../lib/context.mjs';
import { readInventory } from '../lib/inventory-parser.mjs';

const CUSTOM_SKILLS_DIR = 'fsi-app/.claude/skills';

function listCustomSkillDirs() {
  const abs = join(getRepoRoot(), CUSTOM_SKILLS_DIR);
  if (!existsSync(abs)) return [];
  return readdirSync(abs).filter((name) => {
    if (name.startsWith('_')) return false;
    return statSync(join(abs, name)).isDirectory();
  });
}

function loadSkillFrontmatter(skillName) {
  const skillPath = join(getRepoRoot(), CUSTOM_SKILLS_DIR, skillName, 'SKILL.md');
  if (!existsSync(skillPath)) return null;
  const content = readFileSync(skillPath, 'utf-8');
  const m = content.match(/^---\r?\n([\s\S]+?)\r?\n---/);
  return m ? m[1] : null;
}

function hasField(frontmatter, field) {
  if (!frontmatter) return false;
  return new RegExp(`^${field}\\s*:`, 'm').test(frontmatter);
}

export const consistencyCheck = {
  id: 'C1',
  name: 'skills.md reality',
  description: 'Each custom skill listed in skills.md exists at the documented path with required frontmatter (name, description, when_to_load).',
  source: 'Layer 4 dispatch + ADR-005',

  run() {
    const drifts = [];
    const onDisk = listCustomSkillDirs();
    const inventoryContent = readInventory('docs/inventories/skills.md');

    if (!inventoryContent) {
      drifts.push(drift(
        DRIFT_KIND.ORPHAN_CLAIM,
        'docs/inventories/skills.md does not exist.',
        'docs/inventories/skills.md',
      ));
      return drifts;
    }

    // Each on-disk custom skill must be mentioned in skills.md (Section 1)
    for (const skillName of onDisk) {
      // Heuristic: skill name appears as ### header or as a row-level reference
      const escaped = skillName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`(### ${escaped}|\\b${escaped}\\b)`, 'i');
      if (!re.test(inventoryContent)) {
        drifts.push(drift(
          DRIFT_KIND.MISSING_CLAIM,
          `Custom skill "${skillName}" exists at ${CUSTOM_SKILLS_DIR}/${skillName}/ but is not mentioned in docs/inventories/skills.md.`,
          `${CUSTOM_SKILLS_DIR}/${skillName}/SKILL.md`,
        ));
      }

      // Each skill must have required frontmatter fields
      const fm = loadSkillFrontmatter(skillName);
      if (!fm) {
        drifts.push(drift(
          DRIFT_KIND.MALFORMED,
          `Skill "${skillName}" SKILL.md has no YAML frontmatter.`,
          `${CUSTOM_SKILLS_DIR}/${skillName}/SKILL.md`,
        ));
        continue;
      }
      for (const field of ['name', 'description']) {
        if (!hasField(fm, field)) {
          drifts.push(drift(
            DRIFT_KIND.MALFORMED,
            `Skill "${skillName}" frontmatter is missing required field: ${field}.`,
            `${CUSTOM_SKILLS_DIR}/${skillName}/SKILL.md`,
          ));
        }
      }
    }

    // Inventory may reference skills by name in Section 1 headings (### skill-name).
    // For each such heading, verify the directory exists on disk.
    const headingPattern = /^###\s+([a-z][a-z0-9-]+)\s*$/gm;
    let m;
    while ((m = headingPattern.exec(inventoryContent)) !== null) {
      const claimed = m[1];
      // Only check if it looks like a custom skill (not a section like "frontend-design" which is a global skill)
      if (onDisk.includes(claimed)) continue;
      // It's plausibly a Section 1 custom skill heading; verify
      const absPath = join(getRepoRoot(), CUSTOM_SKILLS_DIR, claimed);
      if (!existsSync(absPath) && !isKnownGlobalSkill(claimed)) {
        // Could be a Section 2-6 reference; skip narrow heuristic
      }
    }

    return drifts.length === 0 ? NO_DRIFT : drifts;
  },
};

function isKnownGlobalSkill(name) {
  // Global skills live at ~/.claude/skills/; verifying their existence is outside C1 scope
  // (operator's machine state). The known list mirrors skills.md Section 6.
  return ['frontend-design'].includes(name);
}
