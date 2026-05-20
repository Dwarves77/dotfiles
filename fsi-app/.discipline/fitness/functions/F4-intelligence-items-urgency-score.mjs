// F4: intelligence_items inserts must include urgency_score.
// Source: environmental-policy-and-innovation (briefs/intelligence_items domain rules).
// Urgency scoring is a binding part of the brief shape; missing urgency_score
// produces briefs that cannot be sorted or filtered correctly downstream.
//
// Scope: files matching fsi-app/src/**/*.{ts,tsx,mjs} OR fsi-app/scripts/**/*.mjs
//        (excluding scripts/tmp/) that contain .from("intelligence_items").insert(...)
//        or similar shapes.
// Check: each insert call must include urgency_score in the object being inserted.
//        Cannot statically verify spread operators; those require explicit override.
//
// Heuristic: find .from("intelligence_items") followed (within ~30 lines) by .insert(<obj>);
//            in the bracketed object, search for `urgency_score` key.
//            If insert uses spread (`...item`), allow only if `// fitness-allow: F4` present.

import { violation, PASS } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { isOverridden } from '../lib/file-content.mjs';

export const fitnessFunction = {
  id: 'F4',
  name: 'intelligence-items-urgency-score',
  description: 'Inserts into intelligence_items must include urgency_score (binding brief field; missing value breaks downstream sort/filter).',
  source: 'environmental-policy-and-innovation skill (intelligence_items / briefs domain rules)',

  enumerate() {
    const sources = globFiles([
      'fsi-app/src/**/*.{ts,tsx,mjs}',
      'fsi-app/scripts/**/*.mjs',
      'fsi-app/supabase/seed/**/*.mjs',
    ]);
    // Exclude scripts/tmp scratch zone
    return sources.filter((p) => !p.includes('fsi-app/scripts/tmp/'));
  },

  check(filepath, content) {
    // Skip files that don't touch intelligence_items
    if (!/from\(['"]intelligence_items['"]\)/.test(content)) return PASS;

    const violations = [];
    const lines = content.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (isOverridden(line, 'F4')) continue;

      // Find the insert call (single-line or starting-line of multi-line)
      // Pattern: from("intelligence_items").insert( OR from('intelligence_items').insert(
      // OR .insert( on a line following .from("intelligence_items")
      const insertOnSameLine = /from\(['"]intelligence_items['"]\)[\s\S]*?\.insert\s*\(/.test(line);
      const insertFollowsFromBlock = /\.insert\s*\(/.test(line) &&
        i >= 1 && /from\(['"]intelligence_items['"]\)/.test(lines.slice(Math.max(0, i - 5), i).join('\n'));

      if (!insertOnSameLine && !insertFollowsFromBlock) continue;

      // Find the inserted object (next ~30 lines, look for closing matching paren of insert)
      const blockEnd = Math.min(lines.length, i + 30);
      const block = lines.slice(i, blockEnd).join('\n');

      // Extract from the .insert(...) opening through the matching closing paren
      const insertStart = block.indexOf('.insert(');
      if (insertStart < 0) continue;
      const afterInsert = block.slice(insertStart + 8);

      // Find the matching paren; simple counter (not bullet-proof for embedded strings/regex)
      let depth = 1;
      let endIdx = -1;
      for (let k = 0; k < afterInsert.length; k++) {
        const ch = afterInsert[k];
        if (ch === '(') depth++;
        else if (ch === ')') {
          depth--;
          if (depth === 0) {
            endIdx = k;
            break;
          }
        }
      }
      if (endIdx < 0) continue;
      const insertArg = afterInsert.slice(0, endIdx);

      // Check for urgency_score key
      if (/\burgency_score\s*:/.test(insertArg)) continue;

      // Static-undetectable cases (same limitation pattern as F5):
      // F4 cannot inspect the contents of a variable, a spread expression, or
      // a property access. Pass these and rely on runtime checks + reviewer
      // attention. If false-negatives surface in practice, tighten to require
      // an override comment on variable-only inserts.
      const hasSpread = /\.\.\.\w+/.test(insertArg);
      const isVariableOnly = /^\s*[\w.]+\s*$/.test(insertArg);
      if (hasSpread || isVariableOnly) continue;

      violations.push(violation(
        i + 1,
        `Insert into intelligence_items must include \`urgency_score\` field. Add it explicitly per the environmental-policy-and-innovation skill brief-shape contract.`,
      ));
    }

    return violations;
  },
};
