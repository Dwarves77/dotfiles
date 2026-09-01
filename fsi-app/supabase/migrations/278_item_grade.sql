-- 278 — intelligence_items.item_grade: the record/brief item-tier column (Lane POP, 2026-09-01).
--
-- WHY THIS EXISTS. The system review (docs/audits/system-review-2026-09-01.md §10, "Lane POP, the
-- population engine") measured the actual population gap: 2,561 sources, 21,609 census documents,
-- 3,661 census_worklist rows marked `would_mint`, only 322 live verified items. Every item today
-- requires a synthesized, grounded BRIEF (LLM- or session-authored, 5-8 per batch) — at that rate the
-- 3,661-row backlog is roughly 500 batches. The product needs a cheaper item tier that still clears
-- `validate_item_provenance` honestly: a RECORD-GRADE item carries identity (title, instrument
-- key/CELEX, item_type, jurisdiction(s), source), dates, forward events, tags, and a short extracted
-- description made ONLY of verbatim FACT/GAP spans from the captured source — no synthesis, no LLM,
-- $0 — that passes provenance because every claim it carries is a grounded FACT/GAP claim, and later
-- upgrades to a full brief when grounding is armed (`GROUNDING_ACQUIRE_ENABLED`).
--
-- OPERATOR RULING (2026-09-01, cited in this lane's dispatch): record-grade items MAY appear on
-- customer surfaces, labeled. This column is the durable marker that labeling reads; the surface-side
-- half (RecordGradeBadge) ships in this same commit but is a separate, non-DDL change.
--
-- WHAT THIS DOES NOT CHANGE. `public.validate_item_provenance` (migrations 114 → 202, criteria 1-7) is
-- UNTOUCHED by this migration and stays UNCONDITIONAL on `item_grade` — a record-grade item must clear
-- the exact same seven criteria a brief-grade item does (source validity, citation grounding,
-- claim-level FACT span-proof, labeling discipline, the item_type's required slots, full_brief
-- presence, and Gate A). This column is a LABEL for what already passed the gate honestly, never a
-- second, looser gate. See `scripts/mint/validate-mint-payload.mjs`'s grade discriminator (this lane,
-- same commit) for how a record payload is built to clear C1-C7 without synthesis: its `full_brief` is
-- assembled ONLY by concatenating the same FACT/GAP claims' own text, so Gate A's coverage scan is
-- satisfied by construction, not by a parallel weaker rule.
--
-- WHY A CHECK-CONSTRAINED TEXT COLUMN, NOT AN ENUM. Every other item-classifying column on this table
-- (`item_type`, `priority`, `provenance_status`) is `text` + `CHECK (... IN (...))`, never a Postgres
-- ENUM (an ENUM's value set requires a DDL migration to extend, the article this table has repeatedly
-- avoided per migration 033's own precedent) — this column matches that established convention rather
-- than introducing a new pattern for one column.
--
-- DEFAULT 'brief', NO DATA MIGRATION. Every existing row (all 322 live verified items, and every
-- quarantined/archived row) was minted through the pre-record-tier path — a synthesized brief, not an
-- extracted-facts-only record — so 'brief' is the historically correct default for 100% of existing
-- rows. No backfill UPDATE is needed or run by this migration; `ADD COLUMN ... DEFAULT 'brief'` stamps
-- every existing row in the same DDL statement (fast-path default, Postgres 11+: no per-row rewrite for
-- a non-volatile default on an existing column add).
--
-- TWO-TRACK POLICY (CLAUDE.md standing rule 3): schema DDL, so it applies via the sanctioned lane
-- BEFORE the dependent code (mint-item.ts's grade param, run-mint-batch.mjs's --grade record path,
-- RecordGradeBadge) reaches a live invocation. Authored by lane POP, LEFT UNAPPLIED — the number (278)
-- is reserved for this lane per the dispatch; applied only by the coordinator, per the same ordering
-- constraint migration 276's header states in full (a run between "code deployed" and "migration
-- applied" would otherwise write/read a column that does not yet exist).
--
-- REVERSAL. Unconditionally safe (additive, nullable-by-default-not-actually-nullable-but-defaulted,
-- no backfill, no dependent object yet — RecordGradeBadge reads `resource.itemGrade` which is
-- `undefined` until the column exists, same dormant-passthrough posture migration 272 documents for
-- `jurisdiction_iso`): `ALTER TABLE public.intelligence_items DROP COLUMN IF EXISTS item_grade;` — noted
-- here rather than authored as a separate file, matching 276's convention for a from-scratch additive
-- change with no existing risk surface. No rollback file shipped.

BEGIN;

ALTER TABLE public.intelligence_items
  ADD COLUMN IF NOT EXISTS item_grade text NOT NULL DEFAULT 'brief'
    CHECK (item_grade IN ('record', 'brief'));

CREATE INDEX IF NOT EXISTS intelligence_items_item_grade_idx
  ON public.intelligence_items (item_grade)
  WHERE item_grade = 'record';

COMMENT ON COLUMN public.intelligence_items.item_grade IS
  'Item tier (Lane POP, 2026-09-01). ''brief'' = a synthesized, grounded brief (the historical default '
  'every existing row carries — 5-8 authored per batch, LLM- or session-authored). ''record'' = a '
  'catalogue record: identity + dates + forward events + tags + a short description made ONLY of '
  'verbatim FACT/GAP spans extracted from the captured source, no synthesis, $0 — clears the exact same '
  'validate_item_provenance C1-C7 gate a brief does (this column changes no gate logic; it only labels '
  'what already passed honestly). Operator ruling 2026-09-01: record-grade items MAY appear on customer '
  'surfaces, labeled (see RecordGradeBadge). Upgrades from ''record'' to ''brief'' in place (same row, '
  'same id) once grounding is armed and a real brief is authored over it — never a second row.';

-- ── Post-checks ──────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  col_type   text;
  col_null   text;
  col_def    text;
  n_idx      int;
BEGIN
  SELECT data_type, is_nullable, column_default
    INTO col_type, col_null, col_def
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'intelligence_items' AND column_name = 'item_grade';

  IF col_type IS NULL THEN
    RAISE EXCEPTION 'ABORT: intelligence_items.item_grade was not created';
  END IF;
  IF col_type <> 'text' THEN
    RAISE EXCEPTION 'ABORT: intelligence_items.item_grade has type %, expected text', col_type;
  END IF;
  IF col_null <> 'NO' THEN
    RAISE EXCEPTION 'ABORT: intelligence_items.item_grade must be NOT NULL (got is_nullable=%)', col_null;
  END IF;
  IF col_def NOT ILIKE '%brief%' THEN
    RAISE EXCEPTION 'ABORT: intelligence_items.item_grade default does not mention ''brief'' (got %)', col_def;
  END IF;

  SELECT count(*) INTO n_idx FROM pg_indexes
   WHERE schemaname = 'public' AND tablename = 'intelligence_items' AND indexname = 'intelligence_items_item_grade_idx';
  IF n_idx <> 1 THEN
    RAISE EXCEPTION 'ABORT: intelligence_items_item_grade_idx was not created';
  END IF;

  RAISE NOTICE 'migration 278 OK: intelligence_items.item_grade added (text NOT NULL DEFAULT ''brief'', CHECK record/brief, partial index on record)';
END $$;

COMMIT;
