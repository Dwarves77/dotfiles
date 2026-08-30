// The provenance envelope, EXTENDED off the migration-258 precedent to tables outside emission_factors.
// WO-19 (origin_class extension) + WO-12 (regional_data_facts number envelope), master execution plan
// v2 (docs/plans/master-execution-plan-2026-08-17.md), Stage 8.
//
// VOCABULARY OWNERSHIP — READ THIS BEFORE EDITING ANYTHING BELOW. The master plan's own corrections
// registry (C1/C2) says the vocabulary homes are "src/lib/contracts/factor-tier.mjs + source-licence.mjs".
// That is WRONG, and this file corrects it rather than repeating it: reading factor-tier.mjs end to end
// shows it does not DEFINE origin_class or derivation at all — it IMPORTS both:
//
//     import { DERIVATION } from "./envelope.mjs";
//     import { ORIGIN_CLASS, PEDIGREE_AXES, LEG_MODE_CODES } from "./vocabularies.mjs";
//
// The real homes, confirmed by reading vocabularies.mjs and envelope.mjs end to end:
//   - origin_class (7 values)  -> src/lib/contracts/vocabularies.mjs   (spec 00 §3.6; ORIGIN_CLASS)
//   - derivation   (9 values)  -> src/lib/contracts/envelope.mjs       (IOSCO/PD391; DERIVATION)
// factor-tier.mjs is a CONSUMER of both: it re-exports nothing, it only reads them to codegen
// emission_factors' envelope columns (renderEnvelopeColumnsSql). source-licence.mjs owns a THIRD,
// unrelated vocabulary (REDISTRIBUTION / the data_sources licence register) that this file does not
// touch. What C1/C2 got right is the shape of the lesson — "adopt the existing vocabulary home, do not
// invent a second one" — just not the file name. This module follows that lesson correctly: it imports
// ORIGIN_CLASS and DERIVATION from their real homes, defines NEITHER, and exists only to (a) re-export
// them under the names WO-19/WO-12 expect and (b) generalise factor-tier.mjs's CHECK-rendering pattern
// from "one table, one column set" to "any table, any subset of the envelope".
//
// WHY A SEPARATE MODULE FROM factor-tier.mjs, RATHER THAN GENERALISING renderEnvelopeColumnsSql()
// IN PLACE. factor-tier.mjs's version is emission_factors-specific by contract: every column it emits
// is NOT NULL (a factor row is either complete or it does not exist) and it always emits the full five
// pedigree axes, which nothing outside emission_factors carries. intelligence_items gets origin_class
// ALONE, nullable (WO-19: no backfill in this migration, so a NOT NULL would reject every existing row
// at apply time). regional_data_facts gets the full envelope, nullable and additive (WO-12: the 75
// legacy free-text rows are re-keyed in a LATER pass, not this migration). Bending one function to cover
// both shapes would mean a parameter that flips NOT NULL on and off per caller, which is exactly the
// kind of one-function-two-doctrines shape the corridor-view precedent (see envelope.mjs's own header
// note on the retired active_corridor_emission_factor view) warns against. A second, narrower generator
// that shares the SAME upstream vocabulary is the shape that scales to a third table without a NOT NULL
// flag threading through every caller.
//
// GENERATED THE 258 WAY: scripts/gen/migration-267-origin-class-and-envelope.mjs imports this module and
// splices its render*() output into supabase/migrations/267_origin_class_and_envelope.sql between
// >>> GENERATED <<< markers, exactly as scripts/gen/migration-258.mjs does for factor-tier.mjs. The CHECK
// literals in that migration are never hand-typed; src/__tests__/contracts-provenance-envelope.test.mjs
// regenerates them at test time and byte-compares against both migration files (258 for the shared
// origin_class/derivation vocabularies, 267 for the tables this module targets).
//
// PLAIN ESM, ZERO DEPENDENCIES — same constraint as vocabularies.mjs, envelope.mjs and factor-tier.mjs.
// Imported by `node --test` with no tsc and no bundler.

import { ORIGIN_CLASS, ORIGIN_CLASSES } from "./vocabularies.mjs";
import { DERIVATION, DERIVATIONS } from "./envelope.mjs";

// Re-exported, not redefined — see the header. Anyone reaching for "the 7 origin_class values" or "the
// 9 derivation values" from this module gets the SAME array vocabularies.mjs / envelope.mjs already
// export under a different name, never a second list that can drift from it.
export const ORIGIN_CLASS_VALUES = ORIGIN_CLASSES;
export const DERIVATION_VALUES = DERIVATIONS;

/** Quote and join an array of string literals the way every codegen'd CHECK in this repo does. */
function quotedList(values) {
  return values.map((v) => `'${v}'`).join(", ");
}

/** Escape a string for a single-quoted SQL literal (doubled single quotes — standard SQL escaping). */
function sqlLiteral(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

/**
 * The bare CHECK expression for origin_class on an arbitrary column — no CONSTRAINT wrapper, no table
 * name. This is the fragment that must be BYTE-IDENTICAL to what migration 258 already embeds for
 * emission_factors.origin_class, which is what the anti-drift test in
 * contracts-provenance-envelope.test.mjs asserts directly against 258's source text.
 */
export function originClassCheckExpr(column = "origin_class") {
  return `CHECK (${column} IN (${quotedList(ORIGIN_CLASS_VALUES)}))`;
}

/** Same shape, for derivation. Byte-identical to migration 258's `derivation text NOT NULL CHECK (...)`. */
export function derivationCheckExpr(column = "derivation") {
  return `CHECK (${column} IN (${quotedList(DERIVATION_VALUES)}))`;
}

/**
 * A NAMED constraint clause for origin_class, suitable for `ALTER TABLE ... ADD CONSTRAINT <this>` or for
 * splicing into a CREATE TABLE's constraint list. `table` names the constraint so two tables extending
 * the envelope never collide on constraint name (Postgres constraint names are per-table, but a shared
 * name across generated migrations is a drift smell the moment someone greps for it).
 */
export function renderOriginClassCheck(table, column = "origin_class") {
  return `CONSTRAINT ${table}_${column}_check ${originClassCheckExpr(column)}`;
}

/** Same shape, for derivation. */
export function renderDerivationCheck(table, column = "derivation") {
  return `CONSTRAINT ${table}_${column}_check ${derivationCheckExpr(column)}`;
}

/**
 * THE REUSABLE ENVELOPE SHAPE (WO-12 step 2): every column migration 258 already carries on
 * emission_factors that is NOT specific to a physical emission factor (the five pedigree axes and the
 * gas-species/scope columns stay in factor-tier.mjs — they are a factor's doctrine, not the envelope's).
 *
 * Each entry:
 *   sql         — the PostgreSQL column type, exactly as it would read after the column name.
 *   references  — optional FK target, appended to `sql` (e.g. source_key -> the SAME licence register
 *                 emission_factors.source_key points at: public.data_sources(source_key). This is
 *                 DELIBERATELY the licence register, not the `sources` trust-tier table intelligence_items
 *                 already has a source_id FK to — they answer different questions (which licence-cleared
 *                 external dataset produced this number, vs which trust-tier register vetted this content)
 *                 and conflating them would silently narrow one registry's meaning to the other's shape.
 *   checkValues — when present, the column gets a codegen'd CHECK against this list (only origin_class
 *                 and derivation carry one; the rest of the envelope is intentionally unconstrained text/
 *                 numeric, because inventing a closed vocabulary for e.g. `unit` or `reference_period`
 *                 that nobody has designed yet is exactly the "vocabulary decided at the render site"
 *                 disease vocabularies.mjs's own header warns about).
 *   extraCheck  — a second, non-enum CHECK (e.g. n_observations must be positive when present).
 *   comment     — the COMMENT ON COLUMN text. Every added column gets one; that requirement lives in
 *                 the migration generator, not here, but the text originates from this table so the two
 *                 cannot say different things about the same column.
 */
export const ENVELOPE_COLUMNS = Object.freeze({
  value_numeric: {
    sql: "numeric",
    comment:
      "The number itself, decomposed out of a legacy free-text display column. NULL means this row has " +
      "not been re-keyed through the envelope yet; a legacy text column (where one exists on the table) " +
      "remains the display source until it is.",
  },
  unit: {
    sql: "text",
    comment:
      "Unit of value_numeric (e.g. \"EUR/tonne\", \"index_points\", \"USD/hour\"). Required to interpret " +
      "value_numeric; a populated value_numeric with a NULL unit is a malformed envelope, not a valid one " +
      "— enforced at the write path (this migration does not add a DB-level co-nullability CHECK, so a " +
      "later hardening pass may).",
  },
  currency: {
    sql: "text",
    comment: "ISO 4217 currency code, where `unit` denotes a monetary rate. NULL for a non-monetary fact.",
  },
  derivation: {
    sql: "text",
    checkValues: DERIVATION_VALUES,
    comment:
      "How value_numeric was produced (IOSCO PD391 2.3(a)): statutory_fixed | statutory_formula | " +
      "observed | transacted_index | assessed | calculated | interpolated | modelled | estimated. Same " +
      "9-value vocabulary as emission_factors.derivation (migration 258), owned by " +
      "src/lib/contracts/envelope.mjs DERIVATION — this column never defines a second one.",
  },
  origin_class: {
    sql: "text",
    checkValues: ORIGIN_CLASS_VALUES,
    comment:
      "Where the content came from (spec 00 §3.6): community | community-corroborated | modelled | " +
      "derived | partner | verified | official. Same 7-value vocabulary as emission_factors.origin_class " +
      "(migration 258), owned by src/lib/contracts/vocabularies.mjs ORIGIN_CLASS. Nullable here: the " +
      "vocabulary is NOT widened for pre-existing rows (operator ruling, Addendum 26) — a row this " +
      "migration cannot confidently classify stays NULL, documented as pre-vocabulary, rather than being " +
      "forced into the weakest class it might not deserve.",
  },
  source_key: {
    sql: "text",
    references: "public.data_sources(source_key)",
    comment:
      "The licence-cleared external dataset this value came from, joined through the SAME licence " +
      "register emission_factors.source_key already uses (public.data_sources / licence_clear_sources). " +
      "Deliberately not the `sources` table other columns on this row may already reference — that FK is " +
      "the trust-tier register for editorial content, a different question from which redistributable " +
      "dataset supplied a number.",
  },
  source_ref: {
    sql: "text",
    comment: "The table, row, page or series id within the source, so a reader can check the figure without re-deriving it.",
  },
  n_observations: {
    sql: "integer",
    extraCheck: (col, table) => `CONSTRAINT ${table}_${col}_positive_check CHECK (${col} IS NULL OR ${col} > 0)`,
    comment: "Sample size behind an aggregated figure, where the derivation is an aggregate. Governs significant-figure rounding at render (see envelope.mjs significantFigures()).",
  },
  method_version: {
    sql: "text",
    comment: "Version tag of the method that produced value_numeric, when derivation is calculated/modelled/estimated. Lets a later method change be told apart from a data change in the same series.",
  },
  as_at_date: {
    sql: "date",
    comment: "When the source asserted this value (not when we ingested it, not when the underlying event occurred — envelope.mjs's as-of triple keeps those three questions separate).",
  },
  reference_period: {
    sql: "text",
    comment: "The period value_numeric describes (e.g. \"2026-Q2\", \"2026-07\"), for a fact that is a period aggregate rather than a point-in-time observation.",
  },
});

export const ENVELOPE_COLUMN_KEYS = Object.freeze(Object.keys(ENVELOPE_COLUMNS));

/**
 * Render the DDL for adding a chosen subset of the envelope to `table`: an idempotent
 * `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` block, one `ADD CONSTRAINT` per CHECK-bearing column
 * included, and one `COMMENT ON COLUMN` per column — in that order, matching the order every hand-written
 * migration in this repo already uses (column, then constraint, then comment).
 *
 * `columns` defaults to the full envelope (the regional_data_facts shape); pass a narrower list (e.g.
 * `["origin_class"]`) for a table that is only extending one dimension, which is exactly what WO-19 needs
 * for intelligence_items and state_cost_facts. Passing an unknown key throws rather than silently
 * skipping it — a typo'd column name here is a migration that silently ships less than intended.
 */
export function renderEnvelopeDDL(table, { columns = ENVELOPE_COLUMN_KEYS } = {}) {
  for (const key of columns) {
    if (!ENVELOPE_COLUMNS[key]) {
      throw new Error(`renderEnvelopeDDL: unknown envelope column "${key}" (one of ${ENVELOPE_COLUMN_KEYS.join(", ")})`);
    }
  }

  const colLines = columns.map((key) => {
    const col = ENVELOPE_COLUMNS[key];
    const type = col.references ? `${col.sql} REFERENCES ${col.references}` : col.sql;
    return `  ADD COLUMN IF NOT EXISTS ${key} ${type}`;
  });
  const alterColumns = `ALTER TABLE public.${table}\n${colLines.join(",\n")};`;

  const constraints = [];
  for (const key of columns) {
    const col = ENVELOPE_COLUMNS[key];
    if (col.checkValues === ORIGIN_CLASS_VALUES) {
      constraints.push(`ALTER TABLE public.${table} ADD ${renderOriginClassCheck(table, key)};`);
    } else if (col.checkValues === DERIVATION_VALUES) {
      constraints.push(`ALTER TABLE public.${table} ADD ${renderDerivationCheck(table, key)};`);
    }
    if (col.extraCheck) {
      constraints.push(`ALTER TABLE public.${table} ADD ${col.extraCheck(key, table)};`);
    }
  }

  const comments = columns.map(
    (key) => `COMMENT ON COLUMN public.${table}.${key} IS ${sqlLiteral(ENVELOPE_COLUMNS[key].comment)};`,
  );

  return [alterColumns, ...constraints, ...comments].join("\n\n");
}
