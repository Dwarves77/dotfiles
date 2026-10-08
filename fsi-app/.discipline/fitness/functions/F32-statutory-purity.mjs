// F32: STATUTORY PURITY MIRROR. Lane DP-ENGINE, system-completion train, 2026-09-02. Spec 08 §4 Layer 3's
// DB-level backstop is migration 286's `assert_statutory_purity()` trigger — proven LIVE by that
// migration's own self-check DO block (which builds a real estimated_values row, attempts a
// statutory_computations INSERT whose inputs cite it, and proves BEGIN/EXCEPTION rejection; see that
// migration's header for the full narrative, including the exception-rollback-loses-log-row pitfall found
// and fixed while proving migration 287 — a DIFFERENT function, kept as a cross-reference for a reader
// tracing this family's testing discipline). F32 does NOT re-run that DB proof (a fitness function has no
// database — filesystem only, same posture as every other holistic function in this directory); it does
// two THINGS ONLY A DATABASE-FREE CHECK CAN DO:
//
//   (1) STRUCTURAL PRESENCE — migration 286 still DEFINES assert_statutory_purity() and still ATTACHES it
//       as a BEFORE INSERT OR UPDATE trigger on statutory_computations. A migration file is technically
//       editable after the fact (Postgres has already applied it in a deployed environment, but the
//       REPOSITORY COPY could be silently weakened by a later commit with no new migration number) — this
//       catches that regression the same moment F24 (db-object-migration-home) would catch a DDL object
//       moved out of the migrations/ home, but for THIS specific trigger's continued presence rather than
//       its file location.
//
//   (2) A TESTED JS MIRROR — `assertStatutoryPurity(inputs, lookup)` reproduces the SQL trigger's exact
//       two-EXISTS-query logic (byte-transcribed from migration 286's own body, not re-derived) as a pure
//       function, the SAME "SQL is truth, JS mirrors it, the two are proven to agree on fixtures" pattern
//       src/lib/propagation/effective-confidence.mjs already establishes for effective_confidence(). A
//       future JS-side statutory-computation writer (Layer 2's `computeStatutory`, DP-SURF's write set per
//       spec §4) can call this BEFORE writing, to fail fast with a message instead of relying solely on the
//       DB round-trip to catch a purity violation.
//
// COST: filesystem only. No network, no database — this function proves the JS mirror against
// CONSTRUCTED fixtures (its own selftest), never a live Postgres instance; the live-DB proof is migration
// 286's own self-check, already run and passing (see this lane's REPORT).
//
// Holistic: one sentinel (the migration file itself) => check() runs once, matching F23/F27/F28/F30's
// idiom for a repo-wide-shaped concern rather than a per-file scan.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { violation, PASS } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { maskSql } from '../lib/sql-mask.mjs';
import { getRepoRoot } from '../../lib/context.mjs';

const MIGRATION_286_PATH = 'fsi-app/supabase/migrations/286_statutory_and_estimates.sql';

// Byte-identical to types.ts's NonContractable union / envelope.mjs's DERIVATION[...].contractable===false
// set — hand-transcribed here (not imported: this file has zero dependency on src/lib/propagation, by the
// same "generator-owned source of truth, hand-copied CHECK" posture migration 285's own derivation CHECK
// documents for itself) so a reader can see the exact set this mirror enforces without following an import.
export const NON_CONTRACTABLE_DERIVATIONS = new Set(['modelled', 'estimated', 'interpolated']);

/**
 * Pure JS mirror of migration 286's assert_statutory_purity() trigger body. `inputs` is an InputRef[]
 * (types.ts / statutory_computations.inputs' own documented shape). `lookup` supplies the two facts the
 * SQL trigger queries the database for:
 *   - `estimatedValueExists(pk)` — true iff a LIVE estimated_values row exists for that entity_id (mirrors
 *     the SQL's `EXISTS (SELECT 1 FROM estimated_values ev WHERE ev.entity_id = (ref->>'pk'))`)
 *   - `derivedValueDerivation(pk)` — the `derivation` column of the derived_values row for that value_id,
 *     or null/undefined if no such row exists (mirrors the SQL's JOIN)
 * Returns `{ok:true}` or `{ok:false, reason}` — NEVER throws; a caller decides whether a refusal is fatal,
 * matching methods/index.ts's MethodResult convention rather than admissible-for.ts's Verdict shape (this
 * is a pre-flight validator, not an admissibility gate — no "reason" vocabulary to align with there).
 * @param {{table:string, pk:string, version?:string|null}[]} inputs
 * @param {{estimatedValueExists:(pk:string)=>boolean, derivedValueDerivation:(pk:string)=>(string|null|undefined)}} lookup
 * @returns {{ok:true}|{ok:false, reason:string}}
 */
export function assertStatutoryPurity(inputs, lookup) {
  const refs = Array.isArray(inputs) ? inputs : [];

  const badEstimate = refs.some(
    (ref) => ref && ref.table === 'estimated_values' && lookup.estimatedValueExists(ref.pk),
  );
  const badDerived = refs.some(
    (ref) =>
      ref &&
      ref.table === 'derived_values' &&
      NON_CONTRACTABLE_DERIVATIONS.has(lookup.derivedValueDerivation(ref.pk)),
  );

  if (badEstimate || badDerived) {
    return {
      ok: false,
      reason:
        'statutory computation depends on a non-contractable input (an estimated_values row, or a ' +
        'derived_values row whose derivation is modelled/estimated/interpolated) — spec 08 §4 Layer 3',
    };
  }
  return { ok: true };
}

/** Structural presence check over migration 286's raw text — pure, so the selftest can prove BOTH the
 *  pass and every regression shape against constructed migration text rather than only the live file.
 *  @param {string} content @returns {string[]} problems ([] = pass) */
export function checkTriggerPresence(rawContent) {
  // Lane GATE-8 (2026-10-08, AUD-AT-4 B5-15): read on the comment-masked text. The required definition kept only in
  // a trailing comment (`-- BEFORE INSERT OR UPDATE ON public.statutory_computations`) is not a definition.
  const content = maskSql(rawContent);
  const problems = [];
  if (!/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.assert_statutory_purity\s*\(\s*\)/i.test(content)) {
    problems.push('assert_statutory_purity() function definition is missing from migration 286.');
  }
  if (!/CREATE\s+TRIGGER\s+statutory_purity_trg/i.test(content)) {
    problems.push('statutory_purity_trg trigger definition is missing from migration 286.');
  }
  // The trigger must fire BEFORE (not AFTER — a purity check that runs after the bad row already committed
  // is not a gate) INSERT OR UPDATE (an UPDATE that swaps in a bad input after the fact must be caught too,
  // not only the original INSERT) ON statutory_computations.
  if (!/BEFORE\s+INSERT\s+OR\s+UPDATE\s+ON\s+public\.statutory_computations[\s\S]{0,200}?statutory_purity_trg|CREATE\s+TRIGGER\s+statutory_purity_trg[\s\S]{0,120}?BEFORE\s+INSERT\s+OR\s+UPDATE\s+ON\s+public\.statutory_computations/i.test(
      content,
    )
  ) {
    problems.push(
      'statutory_purity_trg is not wired as a BEFORE INSERT OR UPDATE trigger on public.statutory_computations.',
    );
  }
  return problems;
}

const FN = '(?:"?public"?\\s*\\.\\s*)?"?assert_statutory_purity"?';
const TBL = '(?:"?public"?\\s*\\.\\s*)?"?statutory_computations"?';

/** Dollar-quoted body of every `CREATE [OR REPLACE] FUNCTION assert_statutory_purity()` in masked `text`, with its index. */
function purityFunctionBodies(text) {
  const out = [];
  const re = new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+${FN}\\s*\\(\\s*\\)`, 'gi');
  let m;
  while ((m = re.exec(text))) {
    const tagRe = /\$[A-Za-z_0-9]*\$/g;
    tagRe.lastIndex = m.index + m[0].length;
    const tag = tagRe.exec(text);
    if (!tag) { out.push({ index: m.index, body: '' }); continue; }
    const end = text.indexOf(tag[0], tag.index + tag[0].length);
    out.push({ index: m.index, body: end === -1 ? '' : text.slice(tag.index + tag[0].length, end) });
  }
  return out;
}

/** The assertions a working purity function carries. The function body's content is the invariant, not its
 *  existence (AUD-AT-4 B5-16): a later `CREATE OR REPLACE` with a no-op body still "defines" the function. The
 *  body must raise, must read both non-contractable sources, and must run both EXISTS queries over NEW.inputs. */
export function purityBodyProblems(body) {
  const problems = [];
  const b = String(body);
  if (!/\bRAISE\s+EXCEPTION\b/i.test(b)) problems.push('it never RAISEs EXCEPTION');
  if (!/\bestimated_values\b/i.test(b)) problems.push('it does not read estimated_values');
  if (!/\bderived_values\b/i.test(b)) problems.push('it does not read derived_values');
  if (!/\bNEW\s*\.\s*inputs\b/i.test(b)) problems.push('it does not inspect NEW.inputs');
  if ((b.match(/\bEXISTS\s*\(/gi) || []).length < 2) problems.push('it has fewer than the two EXISTS assertions');
  return problems;
}

/**
 * Corpus replay (AUD-AT-4 B5-15, B5-16): the CURRENT state of the purity function and the purity trigger after every
 * migration, in order. `files`: [{ path, text }]. Returns problems ([] = pass).
 *   - the highest-numbered definition of assert_statutory_purity() must still carry its assertions;
 *   - a later DROP FUNCTION with no later CREATE removes it;
 *   - the trigger must end up created BEFORE INSERT OR UPDATE ON statutory_computations, executing the function,
 *     and not dropped or disabled (ALTER TABLE ... DISABLE TRIGGER statutory_purity_trg | ALL | USER) by a later one.
 */
export function checkPurityCorpus(files) {
  const idOf = (p) => { const m = /(?:^|\/)(\d+)_/.exec(String(p).replace(/\\/g, '/')); return m ? Number(m[1]) : -1; };
  const ordered = [...files].sort((a, b) => idOf(a.path) - idOf(b.path) || (a.path < b.path ? -1 : 1));
  let fn = null; // { path, body }
  let trig = null; // { timing, events, executes, enabled }
  for (const f of ordered) {
    const text = maskSql(f.text);
    const events = [];
    for (const b of purityFunctionBodies(text)) events.push({ index: b.index, kind: 'fn', body: b.body });
    let m;
    const dropFn = new RegExp(`DROP\\s+FUNCTION\\s+(?:IF\\s+EXISTS\\s+)?${FN}`, 'gi');
    while ((m = dropFn.exec(text))) events.push({ index: m.index, kind: 'dropfn' });
    const create = new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:CONSTRAINT\\s+)?TRIGGER\\s+statutory_purity_trg\\s+(BEFORE|AFTER|INSTEAD\\s+OF)\\s+([\\s\\S]*?)\\s+ON\\s+${TBL}([\\s\\S]*?);`, 'gi');
    while ((m = create.exec(text))) {
      events.push({
        index: m.index,
        kind: 'trig',
        timing: m[1].toUpperCase().replace(/\s+/g, ' '),
        evs: m[2].toUpperCase(),
        executes: new RegExp(`EXECUTE\\s+(?:FUNCTION|PROCEDURE)\\s+${FN}`, 'i').test(m[3]),
      });
    }
    const dropTrig = new RegExp(`DROP\\s+TRIGGER\\s+(?:IF\\s+EXISTS\\s+)?statutory_purity_trg\\s+ON`, 'gi');
    while ((m = dropTrig.exec(text))) events.push({ index: m.index, kind: 'droptrig' });
    const alter = new RegExp(`ALTER\\s+TABLE\\s+(?:ONLY\\s+)?(?:IF\\s+EXISTS\\s+)?${TBL}\\s+(DISABLE|ENABLE)\\s+(?:ALWAYS\\s+|REPLICA\\s+)?TRIGGER\\s+("?statutory_purity_trg"?|ALL|USER)`, 'gi');
    while ((m = alter.exec(text))) events.push({ index: m.index, kind: m[1].toUpperCase() === 'DISABLE' ? 'disable' : 'enable' });
    const dropTable = new RegExp(`DROP\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?[^;]*${TBL}`, 'gi');
    while ((m = dropTable.exec(text))) events.push({ index: m.index, kind: 'droptrig' });
    events.sort((a, b) => a.index - b.index);
    for (const e of events) {
      if (e.kind === 'fn') fn = { path: f.path, body: e.body };
      else if (e.kind === 'dropfn') fn = null;
      else if (e.kind === 'trig') trig = { timing: e.timing, evs: e.evs, executes: e.executes, enabled: true };
      else if (e.kind === 'droptrig') trig = null;
      else if (e.kind === 'disable' && trig) trig.enabled = false;
      else if (e.kind === 'enable' && trig) trig.enabled = true;
    }
  }
  const problems = [];
  if (!fn) problems.push('assert_statutory_purity() is not defined after the last migration (it was dropped, or never created).');
  else for (const p of purityBodyProblems(fn.body)) problems.push(`assert_statutory_purity() as last defined in ${fn.path} is a weakened body: ${p}.`);
  if (!trig) problems.push('statutory_purity_trg does not exist after the last migration.');
  else {
    if (trig.timing !== 'BEFORE') problems.push(`statutory_purity_trg is ${trig.timing}, not BEFORE, after the last migration.`);
    if (!/\bINSERT\b/.test(trig.evs) || !/\bUPDATE\b/.test(trig.evs)) problems.push('statutory_purity_trg does not fire on both INSERT and UPDATE after the last migration.');
    if (!trig.executes) problems.push('statutory_purity_trg does not EXECUTE assert_statutory_purity() after the last migration.');
    if (!trig.enabled) problems.push('statutory_purity_trg is DISABLED by a later migration.');
  }
  return problems;
}

export const fitnessFunction = {
  id: 'F32',
  name: 'statutory-purity',
  description:
    "Migration 286's assert_statutory_purity() trigger (spec §4 Layer 3) is still defined and still " +
    'attached as a BEFORE INSERT OR UPDATE gate on statutory_computations, AND its pure JS mirror ' +
    '(assertStatutoryPurity) agrees with the SQL trigger\'s exact refusal logic on fixtures — a tested, ' +
    'callable pre-flight check for a future JS-side statutory-computation writer.',
  source:
    'docs/specs/08-flywheel-design.md §4 Layer 3 (statutory purity — no estimate/model may feed a ' +
    'statutory formula); migration 286 (assert_statutory_purity(), proven live by that migration\'s own ' +
    'self-check)',

  enumerate() {
    return [MIGRATION_286_PATH];
  },

  check() {
    const root = getRepoRoot();
    let content;
    try {
      content = readFileSync(resolve(root, MIGRATION_286_PATH), 'utf8');
    } catch (err) {
      return [violation(1, `Cannot read ${MIGRATION_286_PATH}: ${err.message}`)];
    }
    const problems = checkTriggerPresence(content);
    // The CURRENT state, after every later migration (lane GATE-8, AUD-AT-4 B5-16): a later migration that replaces
    // the function with a no-op, drops it, or drops, retimes or disables the trigger is as bad as editing 286.
    const corpus = globFiles(['fsi-app/supabase/migrations/*.sql']).map((path) => ({ path, text: readFileSync(resolve(root, path), 'utf8') }));
    problems.push(...checkPurityCorpus(corpus));
    if (problems.length === 0) return PASS;
    return problems.map((msg) => violation(1, msg));
  },
};
