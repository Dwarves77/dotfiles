// F20: PAUSE-FLAG-HAS-ONE-WRITER. system_state.global_processing_paused + scrape_cadence are written through
// EXACTLY ONE path — the admin_set_pause_state RPC (migration 201), invoked by the sanctioned admin pause
// route via supabase.rpc. No src code writes those columns directly. Any DIRECT write (an object-property
// assignment `x.global_processing_paused = …`, an inline `.update({ … global_processing_paused … })`, or a
// raw SQL `SET global_processing_paused = …`) outside the sanctioned route is RED. String-literal READS
// (`.select("… global_processing_paused …")`, `.eq("global_processing_paused", …)`) and type annotations
// (`global_processing_paused?: boolean`) are NOT writes and pass. Pairs with the runtime guard trigger +
// the audit table (migration 201) — static one-writer + runtime bounce + detection. This is the replacement
// for the DEAD 2a operator-credential design: no human step, no secret.
// Source: pause-flag structural enforcement dispatch (operator 2026-07-12). Maps to invariant RD-23.

import { violation } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { isOverridden } from '../lib/file-content.mjs';

const COLS = '(?:global_processing_paused|scrape_cadence)';
// A bareword column followed by ` = ` (assignment OR raw SQL SET), NOT preceded by a quote/word char (so a
// string-literal read is excluded; a preceding `.` for a property write IS allowed). Plus an inline .update
// object carrying the column (object-key `:` form).
export const WRITE_RES = [
  new RegExp(`(?<!["'\\w])${COLS}\\s*=\\s*[^=]`),
  new RegExp(`\\.update\\s*\\(\\s*\\{[^}]*\\b${COLS}\\b`),
];
// The ONE file allowed to reference these columns in a write-adjacent way. Post-rework it calls the RPC
// (no direct write), but it stays the sanctioned home so a future direct write lands ONLY here, reviewed.
export const SANCTIONED = 'src/app/api/admin/sources/pause-global/route.ts';

/** 1-indexed line of the first direct pause-flag write, or 0 if none. */
export function findPauseFlagWrite(content) {
  for (const re of WRITE_RES) {
    const m = re.exec(content);
    if (m) return content.slice(0, m.index).split(/\r?\n/).length;
  }
  return 0;
}

export const fitnessFunction = {
  id: 'F20',
  name: 'pause-flag-one-writer',
  description:
    'system_state.global_processing_paused / scrape_cadence have EXACTLY ONE writer — the admin_set_pause_state RPC (migration 201), called by the admin pause route via supabase.rpc. A direct write (.update / assignment / SQL SET) to those columns anywhere in src outside the sanctioned route is RED. Pairs with the runtime guard trigger. Replaces the operator-credential design — no manual step, no secret.',
  source: 'pause-flag structural enforcement (operator 2026-07-12)',

  enumerate() {
    return globFiles(['fsi-app/src/**/*.{ts,tsx,mjs}']).filter(
      (p) =>
        !p.includes('/__tests__/') &&
        !/\.(test|selftest|npmtest)\.(ts|tsx|mjs)$/.test(p) &&
        !p.endsWith(SANCTIONED),
    );
  },

  check(filepath, content) {
    if (filepath.endsWith(SANCTIONED)) return []; // the sanctioned home (RPC caller)
    const line = findPauseFlagWrite(content);
    if (!line) return [];
    const matchedLine = content.split(/\r?\n/)[line - 1] || '';
    if (isOverridden(matchedLine, 'F20')) return [];
    return [violation(
      line,
      `Direct write to a pause stop-flag (global_processing_paused / scrape_cadence) outside the sanctioned admin route. These columns have ONE writer: the admin_set_pause_state RPC (migration 201), which declares the guard-trigger marker — call it via supabase.rpc, never a direct .update()/assignment/SQL SET. An unmarked write BOUNCES at runtime anyway; this gate keeps the class out of the codebase. Governing: pause-flag-has-one-writer / RD-23.`,
    )];
  },
};
