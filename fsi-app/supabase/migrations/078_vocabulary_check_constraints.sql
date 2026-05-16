-- Migration 078 — Vocabulary CHECK constraints at the DB boundary
--
-- Date: 2026-05-15
-- Workstream: Dispatch 2 (vocabulary integrity at storage layer)
-- Pre-work: docs/dispatch-2-prework-2026-05-15.md
--
-- Background
-- ----------
-- The v2 product audit (S6 + S7) and the schema audit identified that
-- the agent path validates vocabulary via parse-output.ts but three
-- other writer paths (staged_updates materializer, pre-B.2 legacy seed,
-- direct admin SQL) bypass that gate. The result: 209 rows violate the
-- locked severity-to-priority mapping. This migration enforces vocab
-- contracts at the storage layer so every writer path is bound by the
-- same rule per rule-cross-reference-integrity.
--
-- Verified ground truth (2026-05-15 introspection via
-- scripts/tmp/dispatch2-prework-introspect.mjs):
--   - 16 existing CHECK constraints on intelligence_items + sources
--   - ZERO existing constraints on the 4 columns this migration touches
--   - 209 rows violate the severity-priority lock (top class:
--     MONITORING+MODERATE = 124, MONITORING+HIGH = 66,
--     ACTION REQUIRED+HIGH = 16, COMPETITIVE EDGE+HIGH = 3)
--   - sources.scope_topics: 14 distinct values, all in canonical list,
--     ZERO drift -- constraint lands without backfill
--   - intelligence_items.compliance_object_tags: 15 distinct values,
--     all in 19-value canonical list, ZERO drift -- constraint lands
--     without backfill (4 canonical values unused: carrier-rail, nvocc,
--     airport-operator, terminal-operator)
--   - intelligence_items.operational_scenario_tags: ~32 distinct top
--     values, all shape-conformant, case-insensitive per existing
--     parse-output.ts /i regex flag -- constraint lands without backfill
--
-- DESCOPED: intelligence_items.topic_tags. Production has 1,781
-- distinct values (319 in old 7-value list, 92 in new 14-value list,
-- 2,636 rows across 1,770 drift values including legitimate operational
-- concepts like air_quality, decarbonization, biodiversity that don't
-- reduce cleanly to a single canonical value). Per operator decision
-- 2026-05-15, this column goes to dispatch 3 with content-judgment
-- prework. See docs/dispatch-3-topic-tags-rethink.md.
--
-- Two-phase pattern
-- -----------------
-- Phase A: backfill the 209 severity-priority violators per the locked
--          canonical mapping. Idempotent (WHERE clause excludes rows
--          already conforming). Safe to re-run.
-- Phase B: ADD CONSTRAINT for the 4 enforced columns. Each guard wrapped
--          in a DO block that checks pg_constraint first, because
--          PostgreSQL does not support ADD CONSTRAINT IF NOT EXISTS
--          natively. Safe to re-run.
--
-- Reversibility
-- -------------
-- Phase A reversibility: no, the prior (non-canonical) priority values
--   are lost. The original distribution is captured in the prework doc
--   (dispatch-2-prework-2026-05-15.md severity_priority_distribution
--   table) and in scripts/tmp/dispatch2-prework-introspect.json.
-- Phase B reversibility: yes, each constraint can be DROPped if
--   downstream code needs to bypass.

BEGIN;

-- ═════════════════════════════════════════════════════════════════════
-- PHASE A: BACKFILL (severity-priority lock violations)
-- ═════════════════════════════════════════════════════════════════════
--
-- Remap rule (per vocabulary-severity-labels canonical mapping, also
-- enforced at fsi-app/src/lib/agent/parse-output.ts:258-263):
--
--   ACTION REQUIRED  -> CRITICAL
--   COST ALERT       -> HIGH
--   WINDOW CLOSING   -> HIGH
--   COMPETITIVE EDGE -> MODERATE
--   MONITORING       -> LOW
--
-- This UPDATE conforms 209 rows to the mapping. The WHERE clause is
-- IS DISTINCT FROM, which excludes rows already conforming AND
-- correctly handles NULL semantics (rows with severity IS NULL are
-- excluded by the outer WHERE severity IS NOT NULL).
--
-- Safe to re-run: a second run finds zero violators and is a no-op.

UPDATE intelligence_items
SET priority = CASE severity
  WHEN 'ACTION REQUIRED'   THEN 'CRITICAL'
  WHEN 'COST ALERT'        THEN 'HIGH'
  WHEN 'WINDOW CLOSING'    THEN 'HIGH'
  WHEN 'COMPETITIVE EDGE'  THEN 'MODERATE'
  WHEN 'MONITORING'        THEN 'LOW'
END
WHERE severity IS NOT NULL
  AND priority IS DISTINCT FROM CASE severity
    WHEN 'ACTION REQUIRED'   THEN 'CRITICAL'
    WHEN 'COST ALERT'        THEN 'HIGH'
    WHEN 'WINDOW CLOSING'    THEN 'HIGH'
    WHEN 'COMPETITIVE EDGE'  THEN 'MODERATE'
    WHEN 'MONITORING'        THEN 'LOW'
  END;

-- ═════════════════════════════════════════════════════════════════════
-- PHASE B: ADD CONSTRAINTS
-- ═════════════════════════════════════════════════════════════════════
--
-- PostgreSQL does not support `ALTER TABLE ... ADD CONSTRAINT IF NOT
-- EXISTS` natively (as of PG 16). Pattern: DO block that checks
-- pg_constraint first. Idempotent.

-- ─────────────────────────────────────────────────────────────────────
-- B.1: severity-priority lock
-- ─────────────────────────────────────────────────────────────────────
-- Closes the audit S6 gap. After Phase A backfill, 0 violators remain.
-- The constraint allows severity IS NULL (the 41 rows with null severity
-- are intentional; not every item carries a severity label). When
-- severity is set, priority MUST match the canonical mapping.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'intelligence_items_severity_priority_mapping_check'
      AND conrelid = 'public.intelligence_items'::regclass
  ) THEN
    ALTER TABLE public.intelligence_items
      ADD CONSTRAINT intelligence_items_severity_priority_mapping_check
      CHECK (
        severity IS NULL
        OR (severity = 'ACTION REQUIRED'  AND priority = 'CRITICAL')
        OR (severity = 'COST ALERT'       AND priority = 'HIGH')
        OR (severity = 'WINDOW CLOSING'   AND priority = 'HIGH')
        OR (severity = 'COMPETITIVE EDGE' AND priority = 'MODERATE')
        OR (severity = 'MONITORING'       AND priority = 'LOW')
      );

    COMMENT ON CONSTRAINT intelligence_items_severity_priority_mapping_check
      ON public.intelligence_items IS
      'Enforces the locked severity-to-priority mapping per vocabulary-severity-labels skill. Closes the audit S6 gap (209 violators backfilled in this migration). Every writer path now bound by this contract at the storage layer; previously only the agent path enforced via parse-output.ts:258-263. NULL severity is allowed (~41 rows without an emitted severity label).';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- B.2: sources.scope_topics ⊆ 14 canonical values
-- ─────────────────────────────────────────────────────────────────────
-- Verified clean (14/14 distinct values in the canonical list per
-- migration 063 + vocabulary-topic-tags skill; 0 drift). Constraint
-- prevents future drift. The <@ operator means "is contained in" for
-- arrays: every element of scope_topics must be in the canonical set.
-- An empty array passes (empty is contained in any set).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sources_scope_topics_vocab_check'
      AND conrelid = 'public.sources'::regclass
  ) THEN
    ALTER TABLE public.sources
      ADD CONSTRAINT sources_scope_topics_vocab_check
      CHECK (
        scope_topics <@ ARRAY[
          'regulatory', 'finance', 'technology', 'fuel', 'labor',
          'infrastructure', 'environmental', 'social', 'governance',
          'transport', 'packaging', 'customs', 'conservation',
          'materials_science'
        ]::text[]
      );

    COMMENT ON CONSTRAINT sources_scope_topics_vocab_check ON public.sources IS
      'Enforces the 14-value canonical content-topic vocabulary per migration 063 and vocabulary-topic-tags skill. Verified at constraint-add time: 14/14 distinct values in canonical, 0 drift. This constraint prevents any future writer path from introducing drift.';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- B.3: intelligence_items.compliance_object_tags ⊆ 19 canonical values
-- ─────────────────────────────────────────────────────────────────────
-- Verified clean (15 distinct values used, all in the 19-value
-- canonical list per vocabulary-compliance-objects skill; 0 drift).
-- The 4 unused values are: carrier-rail, nvocc, airport-operator,
-- terminal-operator (legitimately not yet tagged in the corpus).
--
-- Two constraints: vocabulary (which tags) + cardinality (max 4 tags
-- per item). Both per the skill's contract.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'intelligence_items_compliance_object_tags_vocab_check'
      AND conrelid = 'public.intelligence_items'::regclass
  ) THEN
    ALTER TABLE public.intelligence_items
      ADD CONSTRAINT intelligence_items_compliance_object_tags_vocab_check
      CHECK (
        compliance_object_tags <@ ARRAY[
          'carrier-ocean', 'carrier-air', 'carrier-road', 'carrier-rail',
          'vessel-operator', 'aircraft-operator', 'road-fleet-operator',
          'freight-forwarder', 'customs-broker', 'nvocc',
          'shipper', 'importer', 'exporter', 'manufacturer-producer',
          'distributor', 'port-operator', 'airport-operator',
          'terminal-operator', 'warehouse-operator'
        ]::text[]
      );

    COMMENT ON CONSTRAINT intelligence_items_compliance_object_tags_vocab_check
      ON public.intelligence_items IS
      'Enforces the 19-value canonical supply-chain-role vocabulary per vocabulary-compliance-objects skill. Verified at constraint-add time: 15/15 distinct values used in canonical, 0 drift; 4 unused canonical values are legitimately unrepresented in the current corpus.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'intelligence_items_compliance_object_tags_max_check'
      AND conrelid = 'public.intelligence_items'::regclass
  ) THEN
    ALTER TABLE public.intelligence_items
      ADD CONSTRAINT intelligence_items_compliance_object_tags_max_check
      CHECK (
        array_length(compliance_object_tags, 1) IS NULL
        OR array_length(compliance_object_tags, 1) <= 4
      );

    COMMENT ON CONSTRAINT intelligence_items_compliance_object_tags_max_check
      ON public.intelligence_items IS
      'Enforces max 4 compliance_object_tags per item per vocabulary-compliance-objects skill (rule 2: 0-4 tags per item).';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- B.4: intelligence_items.operational_scenario_tags shape + cardinality
-- ─────────────────────────────────────────────────────────────────────
-- Open vocabulary per reference-operational-scenarios. Shape constraint
-- only (case-insensitive kebab-case). Matches existing parse-output.ts
-- regex at line 61 (which uses the /i flag). Case-insensitive is per
-- operator Decision 2 in the prework: emissions-reporting-Scope3 (106
-- rows with capital S) is canonical in the operator brief itself, and
-- mixed case is consistent with existing runtime behavior.
--
-- Two constraints: shape (regex) + cardinality (max 5).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'intelligence_items_operational_scenario_tags_shape_check'
      AND conrelid = 'public.intelligence_items'::regclass
  ) THEN
    ALTER TABLE public.intelligence_items
      ADD CONSTRAINT intelligence_items_operational_scenario_tags_shape_check
      CHECK (
        NOT EXISTS (
          SELECT 1 FROM unnest(operational_scenario_tags) AS t
          WHERE t !~* '^[a-z0-9][a-z0-9-]*[a-z0-9]$'
        )
      );

    COMMENT ON CONSTRAINT intelligence_items_operational_scenario_tags_shape_check
      ON public.intelligence_items IS
      'Enforces case-insensitive kebab-case shape on operational_scenario_tags per reference-operational-scenarios. Open vocabulary; only shape is gated. Matches parse-output.ts line 61 regex /^[a-z0-9][a-z0-9-]*[a-z0-9]$/i. Verified at constraint-add time: top 32 distinct values all conformant.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'intelligence_items_operational_scenario_tags_max_check'
      AND conrelid = 'public.intelligence_items'::regclass
  ) THEN
    ALTER TABLE public.intelligence_items
      ADD CONSTRAINT intelligence_items_operational_scenario_tags_max_check
      CHECK (
        array_length(operational_scenario_tags, 1) IS NULL
        OR array_length(operational_scenario_tags, 1) <= 5
      );

    COMMENT ON CONSTRAINT intelligence_items_operational_scenario_tags_max_check
      ON public.intelligence_items IS
      'Enforces max 5 operational_scenario_tags per item per parse-output.ts agent contract (hard cap). Drives intersection detection; over-tagging dilutes the signal.';
  END IF;
END $$;

COMMIT;
