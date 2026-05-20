// F5: Briefs must reference at least one source from the registry.
// Source: environmental-policy-and-innovation (integrity rule: no invented facts;
// sourced cause-and-effect chains).
//
// Briefs land via:
//   - intelligence_items.insert() with source_id or sources_used array
//   - brief generation pipelines that resolve to one of those inserts
//
// Static check shape: every insert into intelligence_items or briefs must include
// a source-reference field (source_id, source_url, sources_used, citation_source_id,
// or similar). Pure-content inserts without any source reference are forbidden.
//
// What this catches:
//   - .insert({ title, body, urgency_score }) on intelligence_items without source_id
//   - generated briefs lacking the integrity-rule source binding
//
// What this allows:
//   - inserts that DO include any source-reference field (registry binding visible)
//   - non-brief inserts (other tables)
//
// Limitations: this checks STRUCTURAL presence of a source-reference field, not
// runtime registry validity. A wrong source_id passing the field-presence check
// would still pass F5; runtime checks (and ADR-tracked integrity rule) catch that.

import { violation, PASS } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { isOverridden } from '../lib/file-content.mjs';

const SOURCE_REFERENCE_FIELDS = [
  'source_id',
  'source_url',
  'sources_used',
  'citation_source_id',
  'citing_source_id',
];

const SOURCE_REFERENCE_RE = new RegExp(`\\b(${SOURCE_REFERENCE_FIELDS.join('|')})\\s*:`);

export const fitnessFunction = {
  id: 'F5',
  name: 'briefs-cite-registered-sources',
  description: 'Inserts into intelligence_items or briefs must include at least one source-reference field (source_id, source_url, sources_used, etc.) per the integrity rule.',
  source: 'environmental-policy-and-innovation skill (integrity rule: sourced cause-and-effect chains)',

  enumerate() {
    return globFiles([
      'fsi-app/src/**/*.{ts,tsx,mjs}',
      'fsi-app/scripts/**/*.mjs',
      'fsi-app/supabase/seed/**/*.mjs',
    ]).filter((p) => !p.includes('fsi-app/scripts/tmp/'));
  },

  check(filepath, content) {
    if (!/from\(['"](intelligence_items|briefs)['"]\)/.test(content)) return PASS;

    const violations = [];
    const lines = content.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (isOverridden(line, 'F5')) continue;

      // Find insert against intelligence_items or briefs
      const insertOnSameLine = /from\(['"](intelligence_items|briefs)['"]\)[\s\S]*?\.insert\s*\(/.test(line);
      const insertFollowsFromBlock = /\.insert\s*\(/.test(line) &&
        i >= 1 && /from\(['"](intelligence_items|briefs)['"]\)/.test(lines.slice(Math.max(0, i - 5), i).join('\n'));

      if (!insertOnSameLine && !insertFollowsFromBlock) continue;

      // Extract insert argument
      const blockEnd = Math.min(lines.length, i + 30);
      const block = lines.slice(i, blockEnd).join('\n');
      const insertStart = block.indexOf('.insert(');
      if (insertStart < 0) continue;
      const afterInsert = block.slice(insertStart + 8);

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

      // Static-undetectable cases: F5 cannot inspect the contents of a variable
      // or a spread expression. Pass these and rely on runtime checks + reviewer
      // attention. The limitation is documented; if false-negatives surface in
      // practice, tighten to require an override comment on variable-only inserts.
      const hasSpread = /\.\.\.\w+/.test(insertArg);
      if (hasSpread) continue;
      // Variable-only insert: insertArg is just whitespace + identifier (+ optional .property)
      const isVariableOnly = /^\s*[\w.]+\s*$/.test(insertArg);
      if (isVariableOnly) continue;

      // Check for any source-reference field
      if (SOURCE_REFERENCE_RE.test(insertArg)) continue;

      violations.push(violation(
        i + 1,
        `Insert into intelligence_items/briefs has no source-reference field (${SOURCE_REFERENCE_FIELDS.join(', ')}). The integrity rule requires every brief bind to at least one registered source.`,
      ));
    }

    return violations;
  },
};
