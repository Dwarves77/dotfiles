-- Migration 101: intelligence_items.domain backfill (PROPOSED, NOT APPLIED).
--
-- Status: drafted 2026-05-22 by classification backfill dispatch. Awaiting
-- operator approval before execution. Not added to applied-migrations log.
--
-- Context (background):
--   Per docs/plans/ingest-pipeline-investigation-2026-05-22.md, the
--   `intelligence_items.domain` integer column has been hardcoded to 1
--   at three insert sites (drain-first-fetch, community-post promote,
--   admin scan). The Haiku first-fetch classifier emits `item_type` but
--   does NOT emit a domain. Result: ~212 of 646 non-archived items
--   (~33%) have a `domain` value that disagrees with the canonical
--   item_type-to-surface mapping in environmental-policy-and-innovation
--   SKILL.md section "format_type derivation from item_type" combined
--   with the four-canonical-category routing in migration 084 (which
--   uses sources.category to route items to the four customer-facing
--   intelligence surfaces).
--
--   /regulations filters `domain=1`. Today 193 of 588 items in `d=1`
--   (~33%) do not belong on the Regulations surface per the canonical
--   item_type routing. Customers see Market Intel signals, Operations
--   regional data, Research findings, and Technology profiles all
--   mis-rendered as "Regulations."
--
-- Scope (what this migration does):
--   1. Snapshots pre-state into an audit table (id, old_domain, item_type,
--      source_id, plus the joined source.category and source.source_role
--      used for the rule). Reversibility is via the audit table.
--   2. UPDATEs intelligence_items.domain on the rows whose proposed
--      domain differs from current, using JOIN against sources.category
--      and a CASE expression that encodes the operator-binding routing
--      rule from docs/plans/classification-backfill-plan-2026-05-22.md.
--   3. Single transaction. No DDL changes. CHECK constraint (domain
--      BETWEEN 1 AND 7) is preserved; every proposed value lies in {1,2,3,4,7}.
--
-- Out of scope (do NOT do here):
--   - Ingest code change at the three hardcoded `domain: 1` sites.
--     That is dispatch F territory.
--   - Classifier prompt change (domain emission from Haiku).
--   - Application code change to make d=7 visible on /research. (Today
--     /research filters by item_type=research_finding only; framework
--     items routed to d=7 by this migration land in the dashboard
--     "uncategorized" bucket until the category-RPC routing wires up
--     per REC-OBS-G. Surface tradeoff acknowledged in the plan doc.)
--   - Dropping the domain column (REC-OBS-G; Sprint 2+).
--
-- Surfaces affected post-backfill (per
-- fsi-app/src/lib/dashboard/surface-coverage.ts as of commit a5347c0):
--   - Regulations (d=1 OR reg item_types): 588 -> 395 items
--     (the 193 mis-classified leak items leave; the 4 reg-typed leaks
--     in d=2/5/6 return)
--   - Market Intel (d IN (2,4) OR market item_types):
--     receives moved market_signal, technology, tool, innovation,
--     initiative+market_source, framework+market_source items
--   - Operations (d IN (3,6) OR regional_data): receives moved
--     regional_data + tool/initiative+operational_data_source items
--   - Research (item_type=research_finding): UNCHANGED by domain moves;
--     domain backfill cannot push framework or initiative items into
--     /research without code-level changes. Surface tradeoff: 14
--     framework+research_source items get domain=7 (semantically
--     correct) but remain invisible on /research until REC-OBS-G.
--
-- Reversibility:
--   - Pre-state captured in intelligence_items_domain_backfill_audit.
--   - Reverse-migration SQL provided in the `-- REVERSE:` comment block
--     at the bottom of this file. Runs identical CASE in reverse against
--     the audit table; idempotent.
--   - Audit table is preserved indefinitely (not dropped on rollback).
--
-- Verification: appended at the bottom as commented SQL the operator
-- runs separately after committing the BEGIN/COMMIT block.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 0. OPERATOR OVERRIDES (per-item dispositions from the 7-row ambiguous
--    review on 2026-05-22). Runs BEFORE the snapshot so the audit table
--    captures the post-override routing for affected rows; the rule's
--    CASE expression naturally picks up these changes (initiative +
--    source.category='research' -> d=7 per the branch already in step 1).
--    Keeping these in the same BEGIN/COMMIT preserves atomicity.
-- ─────────────────────────────────────────────────────────────────────

-- Override 1: Centre for Sustainable Road Freight is an academic research
-- centre, not a market_news source. Setting source.category='research'
-- routes its 1 attached item (Project JOLT, item_type='initiative') to
-- d=7 (Research) via the existing rule branch on line 132, instead of
-- the default d=4 (Market Intel) the `initiative + null_source` fallback
-- would otherwise apply. Also unblocks /research surface visibility post-
-- backfill (/research filters by source.category='research' via
-- get_research_items RPC + surface-coverage.ts).
UPDATE public.sources
SET category = 'research'
WHERE id = 'b8ff2ebb-ab9a-456c-b3c9-8f869fb64f88';

-- ─────────────────────────────────────────────────────────────────────
-- 1. PRE-STATE CAPTURE (audit table). Mirrors all rows that will be
--    inspected; idempotent via IF NOT EXISTS but DROP first if you want
--    to re-snapshot pre-state on rerun.
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.intelligence_items_domain_backfill_audit (
  id UUID PRIMARY KEY,
  old_domain INTEGER NOT NULL,
  proposed_domain INTEGER NOT NULL,
  item_type TEXT NOT NULL,
  source_id UUID NULL,
  source_category TEXT NULL,
  source_role TEXT NULL,
  source_name TEXT NULL,
  rule_branch TEXT NOT NULL,
  certainty TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.intelligence_items_domain_backfill_audit IS
  'Pre-state snapshot for migration 101 (intelligence_items.domain backfill, 2026-05-22). One row per intelligence_item where the proposed domain differs from old_domain at migration time. Reverse migration uses this table to restore old_domain values. Do not drop; preserves provenance of every domain change.';

-- Snapshot ALL non-archived items where the routing rule produces a
-- DIFFERENT domain than the current value. The rule is encoded twice
-- (here in the snapshot and again in step 2 in the UPDATE); they MUST
-- stay in sync. If you modify the rule, modify BOTH.
INSERT INTO public.intelligence_items_domain_backfill_audit
  (id, old_domain, proposed_domain, item_type, source_id,
   source_category, source_role, source_name, rule_branch, certainty)
SELECT
  ii.id,
  ii.domain AS old_domain,
  -- Routing rule CASE (must match the UPDATE CASE below exactly):
  CASE
    -- Unambiguous regulatory item_types: route to Regulations
    WHEN ii.item_type IN ('regulation','directive','standard','guidance','law') THEN 1
    -- framework: by default regulatory, but routes by source.category when
    -- source is research / market_news / operational_data
    WHEN ii.item_type = 'framework' AND s.category = 'research' THEN 7
    WHEN ii.item_type = 'framework' AND s.category = 'market_news' THEN 4
    WHEN ii.item_type = 'framework' AND s.category = 'operational_data' THEN 3
    WHEN ii.item_type = 'framework' THEN 1
    -- Unambiguous Research finding
    WHEN ii.item_type = 'research_finding' THEN 7
    -- Operations
    WHEN ii.item_type = 'regional_data' THEN 3
    -- Market signals
    WHEN ii.item_type = 'market_signal' THEN 4
    -- Technology / innovation
    WHEN ii.item_type IN ('technology','innovation') THEN 2
    -- tool: by default technology, but route by source.category when known
    WHEN ii.item_type = 'tool' AND s.category = 'research' THEN 7
    WHEN ii.item_type = 'tool' AND s.category = 'operational_data' THEN 3
    WHEN ii.item_type = 'tool' THEN 2
    -- initiative: ambiguous; routes entirely by source.category
    WHEN ii.item_type = 'initiative' AND s.category = 'regulatory' THEN 1
    WHEN ii.item_type = 'initiative' AND s.category = 'research' THEN 7
    WHEN ii.item_type = 'initiative' AND s.category = 'market_news' THEN 4
    WHEN ii.item_type = 'initiative' AND s.category = 'operational_data' THEN 3
    -- initiative + NULL source category: default to Market Intel (low
    -- confidence); these rows ALSO appear in the ambiguous review list
    -- and may be re-routed per operator decision.
    WHEN ii.item_type = 'initiative' THEN 4
    -- Fallback: keep current (no rule matched)
    ELSE ii.domain
  END AS proposed_domain,
  ii.item_type,
  ii.source_id,
  s.category AS source_category,
  s.source_role,
  s.name AS source_name,
  -- rule_branch tags the CASE branch that fired, for auditability
  CASE
    WHEN ii.item_type IN ('regulation','directive','standard','guidance','law') THEN 'reg_type'
    WHEN ii.item_type = 'framework' AND s.category = 'research' THEN 'framework+research_source'
    WHEN ii.item_type = 'framework' AND s.category = 'market_news' THEN 'framework+market_source'
    WHEN ii.item_type = 'framework' AND s.category = 'operational_data' THEN 'framework+ops_source'
    WHEN ii.item_type = 'framework' THEN 'framework_default_reg'
    WHEN ii.item_type = 'research_finding' THEN 'research_finding'
    WHEN ii.item_type = 'regional_data' THEN 'regional_data'
    WHEN ii.item_type = 'market_signal' THEN 'market_signal'
    WHEN ii.item_type IN ('technology','innovation') THEN 'tech_innov'
    WHEN ii.item_type = 'tool' AND s.category = 'research' THEN 'tool+research_source'
    WHEN ii.item_type = 'tool' AND s.category = 'operational_data' THEN 'tool+ops_source'
    WHEN ii.item_type = 'tool' THEN 'tool_default_tech'
    WHEN ii.item_type = 'initiative' AND s.category = 'regulatory' THEN 'initiative+reg_source'
    WHEN ii.item_type = 'initiative' AND s.category = 'research' THEN 'initiative+research_source'
    WHEN ii.item_type = 'initiative' AND s.category = 'market_news' THEN 'initiative+market_source'
    WHEN ii.item_type = 'initiative' AND s.category = 'operational_data' THEN 'initiative+ops_source'
    WHEN ii.item_type = 'initiative' THEN 'initiative+null_source_default_market'
    ELSE 'no_rule'
  END AS rule_branch,
  -- certainty: 'ambiguous' when initiative + NULL source.category
  CASE
    WHEN ii.item_type = 'initiative' AND s.category IS NULL THEN 'ambiguous'
    WHEN ii.item_type IN ('framework','tool') AND s.category IN ('market_news','operational_data') THEN 'medium'
    ELSE 'high'
  END AS certainty
FROM public.intelligence_items ii
LEFT JOIN public.sources s ON s.id = ii.source_id
WHERE ii.is_archived = FALSE
  AND (
    -- Only snapshot rows where the rule would change the domain
    CASE
      WHEN ii.item_type IN ('regulation','directive','standard','guidance','law') THEN 1
      WHEN ii.item_type = 'framework' AND s.category = 'research' THEN 7
      WHEN ii.item_type = 'framework' AND s.category = 'market_news' THEN 4
      WHEN ii.item_type = 'framework' AND s.category = 'operational_data' THEN 3
      WHEN ii.item_type = 'framework' THEN 1
      WHEN ii.item_type = 'research_finding' THEN 7
      WHEN ii.item_type = 'regional_data' THEN 3
      WHEN ii.item_type = 'market_signal' THEN 4
      WHEN ii.item_type IN ('technology','innovation') THEN 2
      WHEN ii.item_type = 'tool' AND s.category = 'research' THEN 7
      WHEN ii.item_type = 'tool' AND s.category = 'operational_data' THEN 3
      WHEN ii.item_type = 'tool' THEN 2
      WHEN ii.item_type = 'initiative' AND s.category = 'regulatory' THEN 1
      WHEN ii.item_type = 'initiative' AND s.category = 'research' THEN 7
      WHEN ii.item_type = 'initiative' AND s.category = 'market_news' THEN 4
      WHEN ii.item_type = 'initiative' AND s.category = 'operational_data' THEN 3
      WHEN ii.item_type = 'initiative' THEN 4
      ELSE ii.domain
    END
  ) <> ii.domain
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- 2. THE BACKFILL UPDATE. Applies the same CASE rule. Scoped to the
--    rows captured in step 1 (so the audit table is the source of truth
--    for which rows changed and what the old values were).
-- ─────────────────────────────────────────────────────────────────────

UPDATE public.intelligence_items ii
SET domain = a.proposed_domain
FROM public.intelligence_items_domain_backfill_audit a
WHERE ii.id = a.id
  AND ii.domain = a.old_domain;  -- defensive: skip if domain changed between snapshot and update

-- ─────────────────────────────────────────────────────────────────────
-- 3. INTEGRITY ASSERTION. After UPDATE, every snapshot row's current
--    domain MUST equal the proposed_domain; if not, raise so the txn
--    rolls back. Catches concurrent writes between steps 1 and 2.
-- ─────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  bad_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO bad_count
  FROM public.intelligence_items ii
  JOIN public.intelligence_items_domain_backfill_audit a ON a.id = ii.id
  WHERE ii.domain <> a.proposed_domain;
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'Backfill integrity check failed: % rows have unexpected domain after update', bad_count;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 4. OPERATOR OVERRIDES, defensive post-integrity confirmations.
--    These are no-ops if step 0's source UPDATE made the rule route
--    these items correctly. Included per operator's explicit request
--    so the per-item disposition is visible in the migration file at
--    the row-id level (audit trail by direct reference, not via the
--    source.category transitive routing).
-- ─────────────────────────────────────────────────────────────────────

-- Override 2: Project JOLT must land in domain=7 (Research). Defensive
-- no-op: step 0 set source.category='research' on its source, so the
-- snapshot rule already routes this row to proposed_domain=7 and step
-- 2 already applied it. This explicit UPDATE makes the per-item
-- decision visible at the SQL level without depending on transitive
-- source-side state.
UPDATE public.intelligence_items
SET domain = 7
WHERE id = 'b813d0a5-211b-4b56-9cee-503087c11486';

COMMIT;


-- ═══════════════════════════════════════════════════════════════════════
-- REVERSE: re-apply old_domain values from the audit table + restore
-- pre-override source.category for JOLT's source.
-- ═══════════════════════════════════════════════════════════════════════
--
-- Run this block to roll back the migration. The audit table is the
-- single source of truth for what each row was before. Idempotent.
--
-- BEGIN;
--
-- -- Revert override 1: restore source.category=NULL on JOLT's source
-- -- (pre-migration state captured 2026-05-22). If the operator has
-- -- separately classified this source since the migration ran, DO NOT
-- -- run this line; it overwrites that work.
-- UPDATE public.sources
-- SET category = NULL
-- WHERE id = 'b8ff2ebb-ab9a-456c-b3c9-8f869fb64f88';
--
-- -- Revert backfill UPDATE: restore old_domain on every audited row
-- UPDATE public.intelligence_items ii
-- SET domain = a.old_domain
-- FROM public.intelligence_items_domain_backfill_audit a
-- WHERE ii.id = a.id;
--
-- -- Verification: every audited row's current domain MUST equal old_domain
-- DO $$
-- DECLARE
--   bad_count INTEGER;
-- BEGIN
--   SELECT COUNT(*) INTO bad_count
--   FROM public.intelligence_items ii
--   JOIN public.intelligence_items_domain_backfill_audit a ON a.id = ii.id
--   WHERE ii.domain <> a.old_domain;
--   IF bad_count > 0 THEN
--     RAISE EXCEPTION 'Reverse failed: % rows have unexpected domain after revert', bad_count;
--   END IF;
-- END $$;
--
-- COMMIT;
--
-- Note: the audit table itself is intentionally NOT dropped on reverse.
-- It preserves the change history. Operator may DROP TABLE
-- intelligence_items_domain_backfill_audit; manually after confirming
-- the reverse landed cleanly. The reverse does NOT capture pre-override
-- source.category history beyond JOLT's source; if other source UPDATEs
-- accumulate post-migration, capture them separately before running
-- this reverse.


-- ═══════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES (run separately, post-migration)
-- ═══════════════════════════════════════════════════════════════════════
--
-- Run these AFTER committing the migration to verify the backfill
-- produced the expected per-domain distribution and to spot-check moved
-- rows. The expected counts come from the live data snapshot the
-- backfill plan dispatch captured at 2026-05-22.
--
-- (V1) Per-domain count check. Expected after backfill (snapshot 2026-05-22,
-- updated 2026-05-22 for operator overrides):
--   d=1: 395 items
--   d=2: 24
--   d=3: 78
--   d=4: 83   (was 84 pre-override; JOLT moved to d=7 by override 2)
--   d=7: 66   (was 65 pre-override; JOLT moved in by override 2)
--   (d=5 and d=6 should remain at their pre-backfill counts (~8 and ~4)
--    since the rule does not route to those domains; the existing rows
--    there are legacy data this backfill does not touch.)
-- The actual counts may drift by a small amount if new items have been
-- inserted since snapshot. The shape and sign of the change is what
-- matters: d=1 drops from 588 to ~395; d=4 grows from 16 to ~83.
--
-- SELECT domain, COUNT(*) AS items
-- FROM public.intelligence_items
-- WHERE is_archived = FALSE
-- GROUP BY domain
-- ORDER BY domain;
--
-- (V2) Per-(item_type, domain) cross-tab check. After backfill, the
-- table SHOULD show no rows in the "leak" cells: e.g. no
-- (market_signal, 1) rows, no (regional_data, 1) rows, etc.
--
-- SELECT item_type, domain, COUNT(*) AS items
-- FROM public.intelligence_items
-- WHERE is_archived = FALSE
-- GROUP BY item_type, domain
-- ORDER BY item_type, domain;
--
-- (V3) Audit-table sanity. The audit table should have exactly the
-- moved-row count (snapshot expected 212 rows on 2026-05-22). Each
-- row's certainty is one of {high, medium, ambiguous}. After the
-- 2026-05-22 operator override (source.category='research' on JOLT's
-- source applied before snapshot), JOLT moves from certainty='ambiguous'
-- to certainty='high'; expected ambiguous-row count drops from 7 to 6.
-- Roll-up:
--
-- SELECT certainty, rule_branch, COUNT(*) AS moves
-- FROM public.intelligence_items_domain_backfill_audit
-- GROUP BY certainty, rule_branch
-- ORDER BY certainty, rule_branch;
--
-- (V4) Spot-check sample of 5 moved rows per destination domain,
-- joined with sources.name for human verification.
--
-- WITH ranked AS (
--   SELECT
--     a.proposed_domain AS dest_domain,
--     a.id, a.item_type, ii.title,
--     a.source_name, a.source_role, a.source_category,
--     a.old_domain, a.rule_branch, a.certainty,
--     ROW_NUMBER() OVER (PARTITION BY a.proposed_domain ORDER BY ii.added_date DESC, a.id) AS rn
--   FROM public.intelligence_items_domain_backfill_audit a
--   JOIN public.intelligence_items ii ON ii.id = a.id
-- )
-- SELECT dest_domain, item_type, title, source_name, source_role, source_category,
--        old_domain, rule_branch, certainty
-- FROM ranked WHERE rn <= 5
-- ORDER BY dest_domain, rn;
--
-- (V5) Ambiguous rows list (certainty='ambiguous'). Expected 6 rows
-- after the 2026-05-22 operator overrides (down from 7; JOLT resolved
-- by override 1 + 2). Each remaining row is an `initiative` with a
-- source that has no category set in the sources registry. Per-row
-- operator dispositions (all 6 to default d=4 Market Intel) recorded in
-- docs/plans/classification-backfill-ambiguous-2026-05-22.md. The 6
-- sources need source_role + category cleanup as a separate followup
-- dispatch so future backfills do not re-encounter the same gap.
--
-- SELECT a.id, ii.title, a.source_name, a.old_domain,
--        a.proposed_domain, a.rule_branch
-- FROM public.intelligence_items_domain_backfill_audit a
-- JOIN public.intelligence_items ii ON ii.id = a.id
-- WHERE a.certainty = 'ambiguous'
-- ORDER BY ii.title;
