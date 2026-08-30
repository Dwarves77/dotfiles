#!/usr/bin/env node
// Generator for supabase/migrations/267_origin_class_and_envelope.sql.
//
// WHY A GENERATOR, mirroring scripts/gen/migration-258.mjs exactly: this migration's CHECK literals
// (origin_class 7 values, derivation 9 values) come from the SAME upstream vocabulary homes 258 already
// draws from (src/lib/contracts/vocabularies.mjs, src/lib/contracts/envelope.mjs), by way of the
// generalised renderer in src/lib/contracts/provenance-envelope.mjs. Typing either list by hand a second
// time is the duplicated-CHECK defect migration 263 (mode vocabulary) had to go back and fix. The blocks
// below are spliced in between markers; src/__tests__/contracts-provenance-envelope.test.mjs regenerates
// them and byte-compares against both this migration and migration 258, so origin_class/derivation cannot
// drift between the two migrations OR between either migration and the module.
//
// Re-run with:  node scripts/gen/migration-267-origin-class-and-envelope.mjs
// It rewrites the migration in place. Committing the regenerated diff is how a vocabulary change ships.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { renderEnvelopeDDL } from "../../src/lib/contracts/provenance-envelope.mjs";

export const MARKERS = {
  intelligence_items_origin_class: () => renderEnvelopeDDL("intelligence_items", { columns: ["origin_class"] }),
  regional_data_facts_envelope: () => renderEnvelopeDDL("regional_data_facts", {
    columns: [
      "value_numeric", "unit", "currency", "derivation", "origin_class",
      "source_key", "source_ref", "n_observations", "method_version",
      "as_at_date", "reference_period",
    ],
  }),
  state_cost_facts_origin_class: () => renderEnvelopeDDL("state_cost_facts", { columns: ["origin_class"] }),
};

export function block(name) {
  return `-- >>> GENERATED: ${name} >>>\n${MARKERS[name]()}\n-- <<< END GENERATED: ${name} <<<`;
}

export function renderMigration() {
  return `-- 267 — origin_class (WO-19) on intelligence_items and state_cost_facts, and the WO-12 number
-- envelope on regional_data_facts. Master execution plan v2, Stage 8 (docs/plans/master-execution-plan-
-- 2026-08-17.md), corrections C1/C2/C4/C8, Addendum 26 operator rulings.
--
-- WHY THIS MIGRATION EXISTS. Migration 258 (2026-08-12) built the number envelope and shipped it on
-- exactly one table, emission_factors — origin_class and derivation as codegen'd CHECKs, both owned by
-- src/lib/contracts/vocabularies.mjs and envelope.mjs respectively. Everywhere else in the schema,
-- provenance is either absent (intelligence_items has 80 columns and none of them says where a value came
-- from) or half-present (regional_data_facts has a free-text \`value\` column and a source_note that is
-- prose, not a foreign key; state_cost_facts has unit + source_id but no origin_class). This migration
-- extends the SAME two vocabularies outward, through src/lib/contracts/provenance-envelope.mjs — never a
-- second origin_class enum, never a second derivation enum.
--
-- WHAT THIS ADDS:
--   1. intelligence_items.origin_class text — NULLABLE, CHECK against the SAME 7 values as
--      emission_factors.origin_class. NO BACKFILL HERE. The backfill mapping (item_type + source tier ->
--      origin_class) is ratified separately in docs/plans/wo19-origin-class-backfill-mapping.md and runs
--      as its own pass; this migration only makes the column constructable. NOT NULL is deferred to a
--      later migration, after the backfill lands and the residual NULL population is a decision (pre-
--      vocabulary rows), not an accident.
--   2. regional_data_facts gains the full envelope: value_numeric, unit, currency, derivation (+CHECK),
--      origin_class (+CHECK), source_key (FK to the licence register, NOT the existing source_id FK to
--      \`sources\` — they answer different questions, see provenance-envelope.mjs), source_ref,
--      n_observations, method_version, as_at_date, reference_period. ALL NULLABLE, ALL ADDITIVE. NO
--      BACKFILL HERE: operator ruling (Addendum 26) is that the 75 existing free-text rows are RE-KEYED
--      through this envelope (option A — re-derive value_numeric/unit/source_key from each row's
--      source_note URL where possible), not grandfathered as permanent prose. That re-keying is priced,
--      guarded work for a separate pass; this migration only builds the columns it re-keys INTO. The
--      legacy \`value\` text column is untouched and stays the display source for any row not yet re-keyed.
--   3. state_cost_facts.origin_class text — NULLABLE, CHECK against the same 7 values. state_cost_facts is
--      already the envelope precedent at small scale (13/13 rows carry unit AND source_id per Appendix A
--      of the master plan); this is the one dimension it was missing.
--
-- WHAT THIS DELIBERATELY DOES NOT DO:
--   NO NOT NULL anywhere. NO backfill anywhere (rule per WO-12 step 3 / WO-19 step 2: nullable ->
--   backfill -> NOT NULL are three separate, separately-reviewed steps; collapsing them risks exactly the
--   "confidently wrong" failure mode factor-tier.mjs's own header warns about for an inverted DQI scale).
--   NO widening of the 7-value origin_class or the 9-value derivation vocabulary (Addendum 26, binding:
--   "the 7-value vocabulary is NOT widened. Backfill stamps what is derivable from source metadata; NULL
--   is explicitly documented as pre-vocabulary").
--
-- POST-APPLY PROOF (run these; every count is a live number, not [PLAN-STATED]):
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'intelligence_items' AND column_name = 'origin_class';        -- 1 row
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'regional_data_facts'
--       AND column_name IN ('value_numeric','unit','currency','derivation','origin_class',
--                            'source_key','source_ref','n_observations','method_version',
--                            'as_at_date','reference_period');                          -- 11 rows
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'state_cost_facts' AND column_name = 'origin_class';           -- 1 row
--   SELECT count(*) FROM intelligence_items WHERE origin_class IS NOT NULL;             -- 0 (no backfill yet)
--   SELECT count(*) FROM regional_data_facts WHERE origin_class IS NOT NULL;            -- 0 (no backfill yet)
--   SELECT count(*) FROM state_cost_facts WHERE origin_class IS NOT NULL;               -- 0 (no backfill yet)
--   INSERT ... origin_class = 'not-a-real-value' on any of the three tables                    -- must FAIL
--     (23514 check_violation) on the relevant *_origin_class_check constraint.
--
-- DDL IS GENERATED. scripts/gen/migration-267-origin-class-and-envelope.mjs splices the three GENERATED
-- blocks below from src/lib/contracts/provenance-envelope.mjs renderEnvelopeDDL(); do not hand-edit inside
-- the markers. Reversible: supabase/rollbacks/267_origin_class_and_envelope_rollback.sql (drops all three
-- CHECK constraints and all columns this migration adds; the legacy \`value\`/\`unit\`/\`source_id\` columns
-- on all three tables are untouched by both this migration and its rollback).
--
-- Two-track policy (CLAUDE.md standing rule 3): schema DDL applies via the sanctioned lane BEFORE the
-- dependent backfill code merges. This migration is schema-only — no data write, no backfill, no code
-- dependency — so it is safe to apply as soon as it is reviewed; the backfill in
-- docs/plans/wo19-origin-class-backfill-mapping.md is a SEPARATE, later, operator-ratified pass.

-- ── intelligence_items: origin_class (WO-19) ────────────────────────────────────────────────────────
${block("intelligence_items_origin_class")}

-- ── regional_data_facts: the full number envelope (WO-12) ──────────────────────────────────────────
${block("regional_data_facts_envelope")}

-- ── state_cost_facts: origin_class, completing the envelope dimension it was missing ───────────────
${block("state_cost_facts_origin_class")}

-- ── Post-checks ──────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  n_ii_cols  int;
  n_rdf_cols int;
  n_scf_cols int;
BEGIN
  SELECT count(*) INTO n_ii_cols FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'intelligence_items' AND column_name = 'origin_class';
  SELECT count(*) INTO n_rdf_cols FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'regional_data_facts'
      AND column_name IN ('value_numeric', 'unit', 'currency', 'derivation', 'origin_class',
                           'source_key', 'source_ref', 'n_observations', 'method_version',
                           'as_at_date', 'reference_period');
  SELECT count(*) INTO n_scf_cols FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'state_cost_facts' AND column_name = 'origin_class';

  IF n_ii_cols <> 1 THEN
    RAISE EXCEPTION 'ABORT: intelligence_items.origin_class did not land (found % matching columns)', n_ii_cols;
  END IF;
  IF n_rdf_cols <> 11 THEN
    RAISE EXCEPTION 'ABORT: regional_data_facts envelope incomplete (found % of 11 columns)', n_rdf_cols;
  END IF;
  IF n_scf_cols <> 1 THEN
    RAISE EXCEPTION 'ABORT: state_cost_facts.origin_class did not land (found % matching columns)', n_scf_cols;
  END IF;

  RAISE NOTICE 'migration 267 OK: origin_class on intelligence_items + state_cost_facts, full envelope on regional_data_facts, all nullable, zero rows backfilled';
END $$;
`;
}

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, "..", "..", "supabase", "migrations", "267_origin_class_and_envelope.sql");

if (process.argv[1] && process.argv[1].endsWith("migration-267-origin-class-and-envelope.mjs")) {
  writeFileSync(target, renderMigration(), "utf8");
  console.log(`wrote ${target}`);
}
