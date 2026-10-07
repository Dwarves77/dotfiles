// adopted-terms.mjs (lane G5-READ, 2026-10-07, buildout plan Stage 5). The ONE loader of adopted vocabulary
// terms and the ONE place a code vocabulary is unioned with them. G5-TERMS (migration 355) counts mentions of
// things the system does not hold and adopts a term by rule; an adopted term that no reader sees is a table
// write with no effect (CLAUDE.md standing rule 17). Every reader (system prompt glossary, parse-output,
// derive-tags, entity-resolve, the theme write boundary) takes the adopted set as an ARGUMENT so the pure
// functions stay pure; a caller with database access loads it once per run through this module.
//
// SHAPE. `AdoptedTerms` is a plain object, one array per term kind, each entry `{ key, label }`:
//   key   = vocabulary_terms.term_key (normaliseTermKey form: lower case, single spaces)
//   label = vocabulary_terms.label (the first-seen surface text; falls back to the key)
// Only status = 'adopted' rows are ever read. A proposed or retired term is NOT held, so the same term while
// proposed is not accepted by any reader (the acceptance fixture of the lane brief).
//
// FAIL CLOSED. A read failure (migration 355 not applied, a transient error) returns the empty set: every
// reader then behaves exactly as it did before this lane, on the code constants alone. The union can only ADD.
//
// PLAIN ESM. Imports the shared page reader and the one term normaliser; no node built-ins, so a script, a
// route and a fitness function can all import it.

import { fetchAllRows } from "../db/paginate.mjs";
import { normaliseTermKey } from "../connections/term-recurrence.mjs";

/** Every kind vocabulary_terms.kind allows (migration 355). */
export const ADOPTED_KINDS = Object.freeze(["standard", "material", "theme", "scenario", "compliance_object", "term"]);

/** @returns {Record<string, Array<{key: string, label: string}>>} an adopted set holding nothing. */
export function emptyAdopted() {
  return Object.fromEntries(ADOPTED_KINDS.map((k) => [k, []]));
}

/**
 * Group vocabulary_terms rows into the adopted set. PURE. Rows whose status is not 'adopted', whose kind is
 * unknown, or whose key is empty are ignored; entries are deduplicated by key and sorted by key so the same
 * rows always produce the same arrays (deterministic prompts and tag proposals).
 * @param {Array<{kind?: string, term_key?: string, label?: string|null, status?: string}>} rows
 */
export function groupAdoptedTerms(rows) {
  const out = emptyAdopted();
  const seen = new Set();
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || r.status !== "adopted" || !ADOPTED_KINDS.includes(r.kind)) continue;
    const key = normaliseTermKey(r.term_key);
    if (!key || seen.has(`${r.kind}|${key}`)) continue;
    seen.add(`${r.kind}|${key}`);
    const label = typeof r.label === "string" && r.label.trim() ? r.label.trim() : key;
    out[r.kind].push({ key, label });
  }
  for (const k of ADOPTED_KINDS) out[k].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return out;
}

/**
 * Read the adopted set. The only database read of this module; `sb` is a Supabase client (service role in a
 * script or route, the injected fake in a test). Fails closed to the empty set (see the header) and says so.
 * @param {any} sb
 * @returns {Promise<Record<string, Array<{key: string, label: string}>>>}
 */
export async function adoptedTermsFromSupabase(sb) {
  try {
    const rows = await fetchAllRows((from, to) =>
      sb.from("vocabulary_terms").select("kind, term_key, label, status").eq("status", "adopted").order("id", { ascending: true }).range(from, to),
    );
    return groupAdoptedTerms(rows);
  } catch (e) {
    console.warn(`[adopted-terms] adopted terms unreadable (${e instanceof Error ? e.message : String(e)}); readers use the code vocabularies only`);
    return emptyAdopted();
  }
}

/**
 * A once-per-run loader: the first call reads, every later call returns the same promise. For a caller that
 * decides many items in one run (tag ratification decides one flag at a time).
 * @param {any} sb @returns {() => Promise<Record<string, Array<{key: string, label: string}>>>}
 */
export function memoAdoptedTerms(sb) {
  let cached = null;
  return () => (cached ??= adoptedTermsFromSupabase(sb));
}

/** The adopted keys of one kind, [] when the set or the kind is absent. PURE. @param {any} adopted @param {string} kind @returns {string[]} */
export function adoptedKeys(adopted, kind) {
  const list = adopted && Array.isArray(adopted[kind]) ? adopted[kind] : [];
  return list.map((e) => e.key);
}

/** The adopted entries of one kind, [] when absent. PURE. @param {any} adopted @param {string} kind */
export function adoptedEntries(adopted, kind) {
  return adopted && Array.isArray(adopted[kind]) ? adopted[kind] : [];
}

/**
 * The union of a code vocabulary and the adopted keys of one kind. PURE. Code values come first and are
 * NEVER dropped or rewritten (the drift guards pin the code constants); an adopted key already present
 * (case-insensitively) adds nothing.
 * @param {readonly string[]} codeValues @param {any} adopted @param {string} kind @returns {string[]}
 */
export function unionVocabulary(codeValues, adopted, kind) {
  const out = [...codeValues];
  const have = new Set(out.map((v) => String(v).toLowerCase()));
  for (const key of adoptedKeys(adopted, kind)) {
    if (!have.has(key.toLowerCase())) {
      have.add(key.toLowerCase());
      out.push(key);
    }
  }
  return out;
}

/**
 * The stored theme token of a term key: whitespace runs become one underscore (migration 357's trigger applies
 * the same rule in SQL). The agent emits a theme as a snake_case token; a term key is the normalised mention.
 * @param {string} key @returns {string}
 */
export function themeToken(key) {
  return String(key ?? "").trim().replace(/\s+/g, "_");
}

/** The stored tokens of the adopted themes. PURE. @param {any} adopted @returns {string[]} */
export function adoptedThemeTokens(adopted) {
  return adoptedKeys(adopted, "theme").map(themeToken);
}
