#!/usr/bin/env node
// Generator for supabase/migrations/271_assumption_register.sql.
//
// WO-20 (assumption register), docs/plans/wo20-assumption-register-spec.md §3/§5. This table is
// envelope-carrying (a NARROWED subset — see below), the same shape 268 (market_series) already proved
// for a brand-new table: hand-written `CREATE TABLE` for the table's own identity columns, followed by
// the GENERATED `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` block spliced from the SAME single generalised
// renderer 267/268 already use, src/lib/contracts/provenance-envelope.mjs renderEnvelopeDDL() — never a
// hand-typed CHECK, per the same migration-263 duplicated-CHECK cautionary tale 268's own header cites.
//
// NUMBERING CORRECTION against the spec. docs/plans/wo20-assumption-register-spec.md §5 names this
// "supabase/migrations/269_assumption_register.sql", itself already a correction of a lost v1 draft's
// "268" — the spec's own §5 step 2 header explains 269 was the next free number "as landed" when the
// spec-from-repo pass was written (commit 36896813). Two more migrations (269_routing_rpcs_use_surface_of,
// 270_widen_org_watchlist_market_series) landed on top of that between the spec being written and this
// generator being run, both same-day (2026-08-30) — so 269 and 270 are now real, unrelated migrations on
// disk and this table is 271, the next free number as of THIS session. The spec's own DDL content (§3) is
// unaffected; only the file number and this generator's own filename move. Re-verify before reuse: `ls
// fsi-app/supabase/migrations | sort -t_ -k1 -n | tail -1` names the next free number at the time this is
// re-run.
//
// THE ENVELOPE — NARROWED, not the full 268/267 shape. spec §3 excludes `currency` (none of the 10 §2
// rows are monetary rates — a scorer weight, an idf coefficient, a confidence cutoff and a pedigree rank
// are none of them a price) and `reference_period` (none are period aggregates — a scorer weight is not
// "Q2's scorer weight"; it is a standing modelling choice, current until retuned). Per
// renderEnvelopeDDL's own contract (provenance-envelope.mjs), passing a narrower `columns` list is exactly
// how a caller opts out of envelope columns that don't fit; the origin_class/derivation CHECKs are still
// BYTE-IDENTICAL to migration 258's, asserted by the anti-drift test
// (src/__tests__/contracts-assumption-register-migration.test.mjs), never hand-copied.
//
// THE HAND-WRITTEN COLUMNS THE ENVELOPE DOES NOT OWN (spec §3): assumption_key (the natural key — a
// dot-namespaced, greppable identity a reader can construct from first principles, the same role
// intelligence_items' canonical-key convention plays for instrument identity, migration 200), subsystem
// (denormalized first key-segment, for filtering — free text in v1, spec §7 Q2), label, rationale,
// code_location (the drift-detectable file:line pointer — this is what a future
// scripts/verify/assumption-register-drift.mjs, named but NOT built by this WO per spec §4, would re-read
// and compare against value_numeric), governing_decision (nullable — an ADR id or NULL, honestly, per
// spec §7 Q1: a value with no ratified decision behind it stays NULL rather than citing an ADR that does
// not state it), status (+CHECK active/superseded/retired), superseded_by (self-referential FK, append-
// only-supersession shape — the SAME posture emission_factors' own superseded_by column already models,
// migration 258).
//
// Re-run with:  node scripts/gen/migration-271-assumption-register.mjs
// It rewrites the migration in place. Committing the regenerated diff is how a column-set change ships.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { renderEnvelopeDDL } from "../../src/lib/contracts/provenance-envelope.mjs";

// The narrowed column set, spec §3's own code block, verbatim:
//   columns: ['value_numeric','unit','derivation','origin_class','source_key','source_ref',
//             'n_observations','method_version','as_at_date']
export const ASSUMPTION_REGISTER_ENVELOPE_COLUMNS = Object.freeze([
  "value_numeric", "unit", "derivation", "origin_class",
  "source_key", "source_ref", "n_observations", "method_version", "as_at_date",
]);

export const MARKERS = {
  assumption_register_envelope: () =>
    renderEnvelopeDDL("assumption_register", { columns: ASSUMPTION_REGISTER_ENVELOPE_COLUMNS }),
};

export function block(name) {
  return `-- >>> GENERATED: ${name} >>>\n${MARKERS[name]()}\n-- <<< END GENERATED: ${name} <<<`;
}

export function renderMigration() {
  return `-- 271 — assumption_register: WO-20, the register for modelling constants THIS PRODUCT chose
-- (docs/plans/wo20-assumption-register-spec.md), as distinct from emission_factors (WO-12/18 — numbers
-- the WORLD published). Confirmed greenfield, spec §0: no assum*/parameter*/constant*/config*/weight*/
-- threshold*/register*/tuning*/default* table exists in the live public schema (84-table sweep, this
-- session's re-verification of master execution plan v2 Appendix A's "confirmed ABSENT" claim).
--
-- WHAT THIS CREATES. One row per modelling constant catalogued in spec §2 (10 catalogued today,
-- spanning src/lib/connections/discover.mjs, src/lib/connections/pair-view.mjs,
-- src/app/api/admin/{canonical-sources,sources}/recommend-classification/route.ts,
-- scripts/lib/urgency.mjs, src/lib/contracts/factor-tier.mjs) — a connection-scorer weight, an idf
-- coefficient, a score floor, a bias-tag confidence cutoff, an urgency score mapping, a pedigree floor —
-- none of which has a DB row today, most of which have nothing more than an inline code comment as their
-- only record of why the value is what it is (spec §1).
--
-- Natural key: assumption_key text UNIQUE NOT NULL, dot-namespaced <subsystem>.<mechanism>.<parameter>
-- (e.g. connections-scorer.weight.shared_source, urgency.priority_and_tier.score_mapping). NOT a
-- surrogate UUID as the LOOKUP key (id still exists, for FK targets like superseded_by) — the register's
-- job is to be joinable against source by a string a reader can construct from first principles, exactly
-- the role uq_intelligence_items_canonical_key_verified_live's key plays for instrument identity
-- (migration 200). subsystem is free text in v1 (spec §7 Q2 — too small a population, 4 values today, to
-- justify a managed vocabulary alongside origin_class/derivation).
--
-- THE ENVELOPE, NARROWED. Every column from value_numeric through as_at_date below is emitted by
-- src/lib/contracts/provenance-envelope.mjs renderEnvelopeDDL("assumption_register", { columns: [
-- 'value_numeric','unit','derivation','origin_class','source_key','source_ref','n_observations',
-- 'method_version','as_at_date'] }) — the SAME renderer, importing the SAME origin_class (7-value) and
-- derivation (9-value) vocabularies migration 258/267/268 already use. currency and reference_period are
-- DELIBERATELY EXCLUDED (spec §3): none of the 10 catalogued rows are monetary rates or period
-- aggregates. The origin_class and derivation CHECKs below are therefore BYTE-IDENTICAL to 258's/267's/
-- 268's, asserted by an anti-drift test (src/__tests__/contracts-assumption-register-migration.test.mjs),
-- never hand-copied.
--
-- WHAT THIS DELIBERATELY DOES NOT DO (spec §6, anti-scope):
--   NO seed rows (schema-only, this migration). NO change to discover.mjs, pair-view.mjs, urgency.mjs,
--   factor-tier.mjs or the two recommend-classification routes — every constant stays exactly where it
--   is, in code, as the live value the product runs on; this table is a parallel RECORD, never a runtime
--   read path (spec §4 — discover.mjs's own header states "PURE, no DB, no LLM" and this migration does
--   not touch that). NO resolution of row 8's ADR-007/code drift (spec §2 row 8, §7 Q1) — registered
--   as-is, current code value, governing_decision NULL, the disagreement flagged not silently reconciled.
--   NO drift-check script (spec §4's named-but-unbuilt scripts/verify/assumption-register-drift.mjs).
--   NO widening of the origin_class/derivation vocabularies — all 10 rows fit the live 7/9-value sets.
--
-- POST-APPLY PROOF (run these; every count is a live number, not [PLAN-STATED]):
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'assumption_register';                                          -- 20 rows
--   SELECT conname FROM pg_constraint
--     WHERE conrelid = 'public.assumption_register'::regclass AND contype = 'u';          -- 1 row
--   SELECT count(*) FROM public.assumption_register;                                      -- 0 (schema only)
--   INSERT ... origin_class = 'not-a-real-value' ON public.assumption_register            -- must FAIL
--     (23514 check_violation) on assumption_register_origin_class_check.
--   INSERT ... status = 'not-a-real-status' ON public.assumption_register                 -- must FAIL
--     (23514 check_violation) on assumption_register_status_check.
--
-- DDL IS GENERATED. scripts/gen/migration-271-assumption-register.mjs splices the GENERATED block below
-- from src/lib/contracts/provenance-envelope.mjs renderEnvelopeDDL(); do not hand-edit inside the markers.
--
-- Two-track policy (CLAUDE.md standing rule 3): schema DDL applies via the sanctioned lane BEFORE the
-- dependent code merges (spec §4's admin panel reader, spec §5's later, separately-ratified 10-row
-- backfill). This migration is schema-only — additive, no data write, no dependency on either — so it is
-- safe to apply as soon as it is reviewed. APPLIED BY THE COORDINATOR ONLY (spec §5 step 5); this file is
-- written by an executor lane and left unapplied.

-- ── assumption_register: identity + registry columns (spec §3, hand-written, not part of the envelope) ─
CREATE TABLE IF NOT EXISTS public.assumption_register (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assumption_key      text NOT NULL UNIQUE,
  subsystem           text NOT NULL,
  label               text NOT NULL,
  rationale           text NOT NULL,
  code_location       text NOT NULL,
  governing_decision  text,
  status              text NOT NULL DEFAULT 'active',
  superseded_by       uuid REFERENCES public.assumption_register(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assumption_register_status_check CHECK (status IN ('active','superseded','retired'))
);

COMMENT ON TABLE public.assumption_register IS
  'WO-20: the register for modelling constants this product chose (a scorer weight, a confidence cutoff, '
  'a pedigree floor) — distinct from emission_factors, the register for numbers the world published. '
  'Read-only display consumer only (spec src/app/admin AdminDashboard "Assumptions" panel, not yet built '
  'by this migration); never a runtime read path for the code that embodies each constant.';

COMMENT ON COLUMN public.assumption_register.assumption_key IS
  'Dot-namespaced natural key, <subsystem>.<mechanism>.<parameter> (e.g. '
  'connections-scorer.weight.shared_source). The lookup identity a reader constructs from first '
  'principles, not a surrogate id — see this table''s own COMMENT.';

COMMENT ON COLUMN public.assumption_register.subsystem IS
  'First assumption_key segment, denormalized for filtering/grouping (spec §2''s "File" grouping). Free '
  'text in v1 (spec §7 Q2) — too small a population (4 values today) to justify a managed vocabulary.';

COMMENT ON COLUMN public.assumption_register.label IS
  'Short human label, e.g. "Shared-source signal weight" — what a reader sees in the admin panel.';

COMMENT ON COLUMN public.assumption_register.rationale IS
  'Why this value — the durable, queryable form of today''s inline code comment (spec §1). May also carry '
  'sub-parameters packed into one row''s value_numeric where the source constant is a small lookup table '
  '(e.g. a multi-tier pedigree floor or a multi-branch confidence cutoff) rather than a single scalar.';

COMMENT ON COLUMN public.assumption_register.code_location IS
  'file:line where the literal is DEFINED today (spec §2 col 2) — the drift-detectable pointer a future '
  'scripts/verify/assumption-register-drift.mjs (named, not built, spec §4) would re-read and compare '
  'against value_numeric. Verified against the live file this row was authored, not copied from a plan.';

COMMENT ON COLUMN public.assumption_register.governing_decision IS
  'ADR id or session-log ruling citation (e.g. "ADR-019"), or NULL where no ratified decision governs '
  'this value today — NULL is an honest answer, never a placeholder for "not checked" (spec §7 Q1).';

COMMENT ON COLUMN public.assumption_register.status IS
  'active | superseded | retired. A retuned constant gets a NEW row with superseded_by set on the old '
  'one (append-only supersession, the same posture emission_factors already models) — never an in-place '
  'edit, per CLAUDE.md standing rule 1.';

COMMENT ON COLUMN public.assumption_register.superseded_by IS
  'Self-referential FK to the row that replaced this one, when status = ''superseded''. NULL otherwise.';

-- ── the envelope (WO-12 shape, narrowed — no currency, no reference_period; generated) ─────────────────
${block("assumption_register_envelope")}

-- ── lookups ──────────────────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS assumption_register_subsystem_idx
  ON public.assumption_register (subsystem, assumption_key);

-- ── RLS and grants ───────────────────────────────────────────────────────────────────────────────────
-- Same posture as migration 258/268's reference tables: read-only to authenticated, no INSERT/UPDATE/
-- DELETE policy (writes arrive through the service role via the guarded path, scripts/lib/db.mjs).
ALTER TABLE public.assumption_register ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assumption_register_read ON public.assumption_register;
CREATE POLICY assumption_register_read ON public.assumption_register FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.assumption_register TO authenticated;

-- ── Post-checks ──────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  n_cols   int;
  n_unique int;
  n_rows   int;
BEGIN
  SELECT count(*) INTO n_cols FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'assumption_register';
  SELECT count(*) INTO n_unique FROM pg_constraint
    WHERE conrelid = 'public.assumption_register'::regclass AND contype = 'u';
  SELECT count(*) INTO n_rows FROM public.assumption_register;

  IF n_cols <> 20 THEN
    RAISE EXCEPTION 'ABORT: assumption_register has % columns, expected 20 (11 identity/registry + 9 narrowed envelope)', n_cols;
  END IF;
  IF n_unique <> 1 THEN
    RAISE EXCEPTION 'ABORT: assumption_register does not carry exactly one UNIQUE constraint (found %)', n_unique;
  END IF;
  IF n_rows <> 0 THEN
    RAISE EXCEPTION 'ABORT: assumption_register is not empty (% rows) — this migration must ship schema-only', n_rows;
  END IF;

  RAISE NOTICE 'migration 271 OK: assumption_register created, 20 columns, UNIQUE(assumption_key), 0 rows (schema only)';
END $$;
`;
}

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, "..", "..", "supabase", "migrations", "271_assumption_register.sql");

if (process.argv[1] && process.argv[1].endsWith("migration-271-assumption-register.mjs")) {
  writeFileSync(target, renderMigration(), "utf8");
  console.log(`wrote ${target}`);
}
