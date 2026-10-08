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
//
// Lane GATE-8 (2026-10-08, AUD-AT-4 B2-18 to B2-24): the same direct write in the forms an agent writes without
// trying to evade. The text is read through the one source lexer (comments blanked, string content kept) with
// adjacent string literals folded, so:
//   - an `.update(` / `.upsert(` / `.insert(` call whose arguments carry the column anywhere (nested braces
//     before the key, a spread, a quoted key) is a write (B2-18, B2-19);
//   - a payload held in a variable (`const patch = { scrape_cadence: "off" }; ... .update(patch)`) is a write:
//     the column as an object key (a value, not a type) in a file that also writes system_state (B2-20);
//   - a PostgREST PATCH through fetch carries the column as a JSON key in a file that names system_state
//     (B2-21);
//   - a column name built by concatenation is the same column (B2-22);
//   - scope is src plus scripts, .cjs, .js and .ts included (B2-23);
//   - the sanctioned route is matched by its full path, never by a path suffix (B2-24).

import { violation } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { views, overrideLines, lineOfIndex } from '../lib/code-scan.mjs';
import { tableCalls, matchClose } from '../lib/table-access.mjs';
import { foldStringConcat } from '../../governance/coverage-scan.mjs';

// judgement_drain joined 2026-10-06 (lane G6-DRAIN, migration 354): its ONE writer is the sibling RPC
// admin_set_judgement_drain, called from the same sanctioned route; a direct write is RED the same way.
const COLS = '(?:global_processing_paused|scrape_cadence|judgement_drain)';
// A bareword column followed by ` = ` in CODE (a property assignment), NOT preceded by a quote/word char (a
// preceding `.` for a property write IS allowed). Raw SQL is read separately and only when it targets
// system_state: a log line that spells `scrape_cadence=${cadence}`, or a proof that updates its own temporary
// probe table, is not a write to the flag.
export const ASSIGNMENT_RE = new RegExp(`(?<!["'\\w])${COLS}\\s*=\\s*[^=]`, 'g');
const SQL_TABLE = '(?:"?public"?\\.)?"?system_state"?';
const SQL_WRITE_RE = new RegExp(
  `\\bUPDATE\\s+${SQL_TABLE}\\s+SET\\b[^;]*?(?<![\\w])${COLS}\\s*=|\\bINSERT\\s+INTO\\s+${SQL_TABLE}\\s*\\([^)]*?(?<![\\w])${COLS}`,
  'gi',
);
// The column as an object key with a value that is not a type word: `scrape_cadence: "off"`, `"scrape_cadence": x`.
// A type member is `name: boolean` or `name?: boolean`; the optional marker does not match here at all.
const TYPE_WORD = '(?:boolean|string|number|unknown|any|null|undefined|never|bigint|symbol|void|Json|Date|Record\\b)';
const OBJECT_KEY_RE = new RegExp(`(?<![\\w.])["']?${COLS}["']?\\s*:(?!\\s*${TYPE_WORD}\\s*[;,}\\n|])`, 'g');
const WRITE_CALL_RE = /\.\s*(?:update|upsert|insert)\s*\(/g;
// The ONE file allowed to reference these columns in a write-adjacent way. Post-rework it calls the RPC
// (no direct write), but it stays the sanctioned home so a future direct write lands ONLY here, reviewed.
export const SANCTIONED = 'src/app/api/admin/sources/pause-global/route.ts';
const SANCTIONED_PATH = `fsi-app/${SANCTIONED}`;

/** 1-based lines of every direct pause-flag write in `content` (comments excluded, overrides applied). */
export function findPauseFlagWrites(content) {
  const { code, text } = views(content);
  const folded = foldStringConcat(text);
  const lines = new Set();

  // (1) property assignment in code, or raw SQL against system_state
  ASSIGNMENT_RE.lastIndex = 0;
  let m;
  while ((m = ASSIGNMENT_RE.exec(code))) lines.add(lineOfIndex(code, m.index));
  SQL_WRITE_RE.lastIndex = 0;
  while ((m = SQL_WRITE_RE.exec(folded))) lines.add(lineOfIndex(folded, m.index));

  // (2) a write call whose argument list names the column anywhere inside it
  const colRe = new RegExp(`(?<![\\w])${COLS}(?![\\w])`);
  WRITE_CALL_RE.lastIndex = 0;
  while ((m = WRITE_CALL_RE.exec(code))) {
    const open = m.index + m[0].length - 1;
    const close = matchClose(code, open);
    if (close < 0) continue;
    if (colRe.test(foldStringConcat(text.slice(open + 1, close)))) lines.add(lineOfIndex(code, m.index));
  }

  // (3) the column as an object key in a file that writes system_state (a payload held in a variable, or a
  //     PostgREST PATCH body): the file either calls a write method on system_state or names the table in a
  //     string next to a PATCH/POST/PUT method
  const writesSystemState = tableCalls(content).some(
    (c) => c.table === 'system_state' && c.methods.some((x) => ['update', 'upsert', 'insert'].includes(x.name)),
  ) || (/system_state/.test(folded) && /\b(?:PATCH|POST|PUT)\b/.test(folded));
  if (writesSystemState) {
    OBJECT_KEY_RE.lastIndex = 0;
    while ((m = OBJECT_KEY_RE.exec(folded))) lines.add(lineOfIndex(folded, m.index));
  }
  const overridden = overrideLines(content, 'F20');
  return [...lines].filter((ln) => !overridden.has(ln)).sort((a, b) => a - b);
}

/** 1-indexed line of the first direct pause-flag write, or 0 if none. */
export function findPauseFlagWrite(content) {
  return findPauseFlagWrites(content)[0] || 0;
}

export const fitnessFunction = {
  id: 'F20',
  name: 'pause-flag-one-writer',
  description:
    'system_state.global_processing_paused / scrape_cadence have EXACTLY ONE writer, the admin_set_pause_state RPC (migration 201), called by the admin pause route via supabase.rpc. A direct write (.update / assignment / SQL SET) to those columns anywhere in src or scripts outside the sanctioned route is RED. Pairs with the runtime guard trigger. Replaces the operator-credential design, no manual step, no secret.',
  source: 'pause-flag structural enforcement (operator 2026-07-12)',

  enumerate() {
    return globFiles(['fsi-app/src/**/*.{ts,tsx,mjs,js,cjs,jsx}', 'fsi-app/scripts/**/*.{mjs,js,cjs,ts}']).filter(
      (p) =>
        !p.includes('/__tests__/') &&
        !/\.(test|selftest|npmtest)\.(ts|tsx|mjs|js|cjs)$/.test(p) &&
        p !== SANCTIONED_PATH,
    );
  },

  check(filepath, content) {
    if (filepath === SANCTIONED_PATH) return []; // the sanctioned home (RPC caller), matched by its full path
    return findPauseFlagWrites(content).map((line) => violation(
      line,
      `Direct write to a pause stop-flag (global_processing_paused / scrape_cadence / judgement_drain; the drain's own writer is admin_set_judgement_drain, migration 354) outside the sanctioned admin route. These columns have ONE writer: the admin_set_pause_state RPC (migration 201), which declares the guard-trigger marker; call it via supabase.rpc, never a direct .update()/assignment/SQL SET. An unmarked write BOUNCES at runtime anyway; this gate keeps the class out of the codebase. Governing: pause-flag-has-one-writer / RD-23.`,
    ));
  },
};
