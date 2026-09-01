-- 274 — item_forward_events: structured extraction target for the forward-events harness (FE lane, 2026-09-01).
--
-- WHY THIS EXISTS. Addendum 78 (session-log, 2026-09-01) measured the actual gap this table closes: the
-- corpus is NOT missing forward-looking dated obligations — 1,143 grounded FACT/GAP claims already name a
-- future year (324 carry a primary_deadline-shaped date, 327 an effective_date-shaped one), and EU Aviation
-- ETS has a rendered section reading "**Deadline:** Before 1 January 2026" today. What is missing is the
-- EXTRACTION of those already-grounded dates into a queryable column: 19 of 322 live items have
-- compliance_deadline set, 58 have entry_into_force, and 0 have next_review_date (a field with no prompt,
-- parser, or pipeline writer anywhere in the codebase). U5/L3 was blocked by that extraction gap, not by
-- absent intelligence, and the fix needs no re-grounding — the dates are already source-cited.
--
-- WHAT THIS FITS. This table is the write target for `scripts/forward-events/extract-forward-events.mjs`
-- (FE-1, EXTRACTOR_VERSION 'fe1-2026-09-01.1'), a pure, $0, no-LLM, dependency-injected function: it never
-- invents a date, it only locates a date already present in a FACT/GAP claim's verbatim `span` or a
-- section's rendered markdown, and binds it to an event ONLY when an explicit obligation-binding trigger
-- phrase ties that date to a legal/operational consequence (entered into force on / shall apply from / by
-- <date>, ... shall / consultation ending on / etc — never a bare year, a document-number citation, or an
-- "as of"/"since" status-snapshot marker with no deontic clause). The extractor's dry-run
-- (`scripts/forward-events/DRY-RUN-REPORT.md`, 24-item fixture, 796 claims + 220 sections, 122 events
-- emitted, hand-checked against every one of the 15 items that produced output) is what shapes this
-- table's exact column set below — every column here is a field the extractor's emitted event object
-- actually carries (`event_date`, `date_precision`, `event_kind`, `obligation_text`, `source_kind`,
-- `source_claim_id`, `source_section_id`, `source_span`, `confidence`, `extractor_version`), not a
-- speculative superset. `date_precision`'s three values and `event_kind`'s six values are exactly the
-- literal set the extractor's rule table emits (verified by grepping every `kind: '...'` in the extractor
-- source); `confidence` is exactly 'high' (claim-sourced) or 'medium' (section-sourced) — the extractor
-- never emits a third value, and the CHECK constraints below hold it to that rather than trusting the
-- writer to keep matching it.
--
-- ONE ROW PER DATED EVENT, NOT PER ITEM. A single item's brief can name many obligation-bound dates (a
-- tiered phase-out schedule, a review date plus a compliance deadline plus an entry-into-force date) — the
-- dry-run's own numbers make this concrete: Euro 7 alone produced 40 events from one item, Brazil PNCA 35
-- (a ten-tier GHG schedule stated four different ways across its claims and sections, each grounded
-- independently and each kept as its own row per the extractor's documented no-cross-source-dedup
-- decision — collapsing those is a downstream-loader/consumer question, not this table's job to pre-decide).
--
-- THE GROUNDING RULE, ENFORCED AS DDL RATHER THAN TRUSTED OF THE WRITER (CLAUDE.md standing rule 1 — facts
-- live in the database, and their integrity is owned by the database, not by hoping every future writer
-- gets it right):
--   * `source_kind = 'claim'` iff `source_claim_id IS NOT NULL` — a claim-sourced row must actually point
--     at the claim it came from, and a section-sourced row must not carry a claim id it doesn't have.
--   * `confidence = 'high'` is reachable ONLY from a grounded claim (`source_kind = 'claim'`) — a
--     section-sourced row (rendered markdown, not itself a source-cited verbatim quote) can never claim
--     'high' confidence no matter what a future writer's logic intends.
--   * `UNIQUE (intelligence_item_id, event_date, event_kind, source_span)` — the extractor is pure and
--     deterministic (same input, same output), so re-running it over an unchanged corpus slice must be a
--     no-op against rows already written, not a duplicate-generator. This is what makes a re-run
--     idempotent at the DB layer rather than requiring the loader to pre-diff every insert.
--   * `source_span` is REQUIRED and is, by the extractor's own construction (`assertVerbatim`, which
--     throws rather than silently drops a violation), always a verbatim substring of the exact claim.span
--     or section.md text the date came from — never a reconstructed or normalized string. This table
--     trusts that invariant as a NOT NULL, non-empty-by-construction column; it does not re-derive
--     verbatim-ness in SQL because the source text this column would need to check against
--     (`section_claim_provenance.claim_text`/section markdown) is not itself guaranteed stable at read
--     time the way the extractor's in-memory input was at write time — the extractor is the one place that
--     can and does check this against the real input string.
--
-- ADDITIVE AND SAFE. A brand-new table, zero existing consumers, zero existing rows at apply time (this
-- migration ships schema-only — no seed data, no backfill; the extraction/insert pass is separate,
-- lane-scoped work this migration does not perform). No existing table, function, view, or RLS policy is
-- touched. `intelligence_items`, `section_claim_provenance`, and `intelligence_item_sections` are read-only
-- FK targets here; none of their rows, columns, or policies change.
--
-- RLS — MIRRORS MIGRATION 103 (`intelligence_item_sections`), NOT 224 (`item_gate_a_state`). Both are the
-- closest analogues (a derived, item-owned table), but they model different things: `item_gate_a_state`
-- (224) is internal pipeline QA state — a scanner's pass/fail verdict on a brief's own prose — read only by
-- the service role, never by a customer. `item_forward_events` is the opposite: customer-visible content
-- (what a customer's org needs to know is coming due), the same role `intelligence_item_sections` plays
-- for a brief's structured per-section body. So this migration reuses 103's exact posture: a public SELECT
-- policy gated on the parent item's `is_archived` flag, nothing more restrictive, and no explicit GRANT
-- (103 ships none either — new public-schema tables already carry the default SELECT privilege the project
-- grants at schema level, and RLS is the actual gate, exactly as 103's own trailing comment states: "RLS is
-- auth.uid()-based and service role bypasses RLS by default"). No policy is invented here; the predicate
-- below is 103's, retargeted at this table's FK column.
--
-- TWO-TRACK POLICY (CLAUDE.md standing rule 3): this is schema DDL, so it applies via the sanctioned lane
-- BEFORE the dependent extraction/load code's writes land — this migration itself performs no data write.
-- Authored by lane FE-2, left UNAPPLIED. Applied only by the coordinator.
--
-- REVERSAL / ROLLBACK FILE. None shipped, by established convention for this exact migration shape. Found
-- by inspection, not assumed: `supabase/rollbacks/` holds 20 files today (`164`-`171`, `180`-`185`,
-- `190`-`195`, `200`, `264`, `267`), and every one of them reverses either a data-mutating migration, a
-- rename (264, trivially invertible), or an `ALTER TABLE ... ADD COLUMN` on an already-live, populated
-- table (267, adding origin_class/envelope columns to `intelligence_items`/`state_cost_facts`/
-- `regional_data_facts` — tables with real rows a bad column addition could affect). Separately, migration
-- 272's own header records the sibling convention for `CREATE OR REPLACE FUNCTION` migrations: "no
-- migration that only redefines existing SECURITY DEFINER functions via CREATE OR REPLACE ... has ever
-- shipped one [a rollback]; CREATE OR REPLACE FUNCTION is its own reversal once the prior body is known."
-- Neither precedent is this migration's shape. The actual comparable case — a from-scratch `CREATE TABLE`
-- shipping 0 rows with no existing consumer — is 271 (`assumption_register`), 268 (`market_series`), and
-- 266 (`theme_briefs`), the three most recent such migrations on this branch: NONE of the three has a
-- matching file under `supabase/rollbacks/`, and none is referenced from any doctrine or runbook as owing
-- one. This migration follows that established convention: a from-scratch `CREATE TABLE` with no data and
-- no dependent object is its own reversal — `DROP TABLE IF EXISTS public.item_forward_events;` (which,
-- because nothing yet reads or writes this table, is unconditionally safe) — and does not warrant a
-- maintained rollback file until the table carries rows or a consumer. If the coordinator wants an
-- explicit rollback file anyway for consistency with the numbered `164`-`200` block, it is exactly that
-- one `DROP TABLE IF EXISTS` statement — noted here rather than authored speculatively, since no comparable
-- recent CREATE-TABLE migration ships one.

BEGIN;

CREATE TABLE IF NOT EXISTS public.item_forward_events (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  intelligence_item_id  uuid        NOT NULL REFERENCES public.intelligence_items(id) ON DELETE CASCADE,
  event_date            date        NOT NULL,
  date_precision        text        NOT NULL,
  event_kind            text        NOT NULL,
  obligation_text       text        NOT NULL,
  source_kind           text        NOT NULL,
  source_claim_id       uuid        REFERENCES public.section_claim_provenance(id) ON DELETE SET NULL,
  source_section_id     uuid        REFERENCES public.intelligence_item_sections(id) ON DELETE CASCADE,
  source_span           text        NOT NULL,
  confidence            text        NOT NULL,
  extractor_version     text        NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT item_forward_events_date_precision_check
    CHECK (date_precision IN ('day', 'month', 'year')),

  CONSTRAINT item_forward_events_event_kind_check
    CHECK (event_kind IN (
      'entry_into_force', 'compliance_deadline', 'review_or_report',
      'phase_step', 'consultation_close', 'other'
    )),

  CONSTRAINT item_forward_events_source_kind_check
    CHECK (source_kind IN ('claim', 'section')),

  CONSTRAINT item_forward_events_confidence_check
    CHECK (confidence IN ('high', 'medium')),

  CONSTRAINT item_forward_events_source_span_not_empty_check
    CHECK (length(source_span) > 0),

  -- Grounding rule 1: a claim-sourced row carries a claim id; a section-sourced row does not pretend to.
  CONSTRAINT item_forward_events_claim_id_matches_source_kind_check
    CHECK ((source_kind = 'claim') = (source_claim_id IS NOT NULL)),

  -- Grounding rule 2: 'high' confidence is reachable only from a grounded claim, never from a section.
  CONSTRAINT item_forward_events_high_confidence_requires_claim_check
    CHECK (confidence <> 'high' OR source_kind = 'claim'),

  -- Idempotent re-runs: the extractor is pure/deterministic, so replaying it over an unchanged corpus
  -- slice must not duplicate rows.
  CONSTRAINT item_forward_events_dedupe_key
    UNIQUE (intelligence_item_id, event_date, event_kind, source_span)
);

COMMENT ON TABLE public.item_forward_events IS
  'One row per dated, obligation-bound event lifted from an already-grounded FACT/GAP claim span or '
  'rendered section markdown by scripts/forward-events/extract-forward-events.mjs (FE-1). Never invents a '
  'date; a bare date with no obligation-binding trigger phrase nearby is never promoted to a row here. An '
  'item can have many rows (a phase-out schedule is several). See this migration''s own header for the '
  'grounding-rule constraints and the RLS posture this table mirrors (migration 103, '
  'intelligence_item_sections).';

COMMENT ON COLUMN public.item_forward_events.event_date IS
  'The obligation date, normalized to a real calendar date even at reduced precision: a bare year (e.g. '
  '"by 2030") normalizes to YYYY-01-01, a month+year to YYYY-MM-01. date_precision is what stops a '
  'consumer reading that normalized day as a real, source-stated day.';

COMMENT ON COLUMN public.item_forward_events.date_precision IS
  'day | month | year — how much of event_date the source text actually specified. A "year" row''s '
  'January 1st is a normalization artifact, not a claim the source made about January 1st.';

COMMENT ON COLUMN public.item_forward_events.event_kind IS
  'entry_into_force | compliance_deadline | review_or_report | phase_step | consultation_close | other — '
  'the extractor''s own trigger-rule vocabulary (verified against every literal kind its rule table can '
  'emit). "other" covers deontic-adjacent dates the extractor deliberately declines to over-classify (a '
  'validity-window end, an institutional delegated-powers start) rather than guessing a more specific kind '
  'it cannot support from the trigger phrase alone.';

COMMENT ON COLUMN public.item_forward_events.obligation_text IS
  'The clause/sentence around the date (source text, whitespace-collapsed), giving a reader the obligation '
  'in context without re-opening the full brief or claim.';

COMMENT ON COLUMN public.item_forward_events.source_kind IS
  'claim | section — which corpus object the date was lifted from. Governs confidence: claim-sourced rows '
  'may reach ''high'' (the claim.span is already source-grounded with a verbatim quote); section-sourced '
  'rows are capped at ''medium'' (rendered markdown, not itself a per-claim verbatim citation). Enforced by '
  'this table''s CHECK constraints, not left to the writer to keep consistent.';

COMMENT ON COLUMN public.item_forward_events.source_claim_id IS
  'FK to section_claim_provenance(id) when source_kind = ''claim''; NULL when source_kind = ''section''. '
  'ON DELETE SET NULL: if the claim itself is later deleted, this event row survives as an orphaned-but-'
  'still-dated record rather than vanishing along with a provenance row it does not own.';

COMMENT ON COLUMN public.item_forward_events.source_section_id IS
  'FK to intelligence_item_sections(id) when source_kind = ''section''; NULL when source_kind = ''claim''. '
  'ON DELETE CASCADE: unlike source_claim_id, a forward event lifted from a section''s rendered markdown '
  'has no independent existence once that section row is gone — the text it quoted no longer exists '
  'anywhere else to re-verify against.';

COMMENT ON COLUMN public.item_forward_events.source_span IS
  'The verbatim substring of the source claim.span or section.md that the date came from — never '
  'reconstructed or normalized. The extractor''s own assertVerbatim guard throws rather than silently '
  'drops a violation before this row is ever produced; this column is NOT NULL and non-empty by that same '
  'construction.';

COMMENT ON COLUMN public.item_forward_events.confidence IS
  'high (claim-sourced, source-grounded verbatim quote) | medium (section-sourced, rendered markdown). '
  'Nothing else is ever emitted by the extractor; the CHECK constraints hold the column to that even if a '
  'future writer''s logic does not.';

COMMENT ON COLUMN public.item_forward_events.extractor_version IS
  'scripts/forward-events/extract-forward-events.mjs EXTRACTOR_VERSION at write time (e.g. '
  '''fe1-2026-09-01.1''), bumped whenever a rule changes semantics. Lets a downstream consumer tell events '
  'produced by different extractor rule generations apart without re-deriving it from created_at.';

-- ── indexes serving the two real read paths ─────────────────────────────────────────────────────────────
-- "what is due next" (a date-range scan across all items):
CREATE INDEX IF NOT EXISTS idx_item_forward_events_event_date
  ON public.item_forward_events (event_date);

-- "this item's forward events" (an item-detail-page read):
CREATE INDEX IF NOT EXISTS idx_item_forward_events_intelligence_item_id
  ON public.item_forward_events (intelligence_item_id);

-- ── RLS — mirrors migration 103 (intelligence_item_sections) exactly, retargeted at this table's FK ──────
ALTER TABLE public.item_forward_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS item_forward_events_read ON public.item_forward_events;
CREATE POLICY item_forward_events_read ON public.item_forward_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.intelligence_items i
      WHERE i.id = item_forward_events.intelligence_item_id
        AND i.is_archived = false
    )
  );

-- Service-role bypass via the Supabase service key (no policy needed; RLS is bypassed for service_role by
-- default) — same note migration 103 records for intelligence_item_sections, unchanged here.

-- ── Post-checks ──────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  n_cols  int;
  n_check int;
  n_uniq  int;
  n_idx   int;
  n_rows  int;
  rls_on  boolean;
BEGIN
  SELECT count(*) INTO n_cols FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'item_forward_events';
  IF n_cols <> 13 THEN
    RAISE EXCEPTION 'ABORT: item_forward_events has % columns, expected 13', n_cols;
  END IF;

  SELECT count(*) INTO n_check FROM pg_constraint
    WHERE conrelid = 'public.item_forward_events'::regclass AND contype = 'c';
  IF n_check <> 7 THEN
    RAISE EXCEPTION 'ABORT: item_forward_events has % CHECK constraints, expected 7', n_check;
  END IF;

  SELECT count(*) INTO n_uniq FROM pg_constraint
    WHERE conrelid = 'public.item_forward_events'::regclass AND contype = 'u';
  IF n_uniq <> 1 THEN
    RAISE EXCEPTION 'ABORT: item_forward_events does not carry exactly one UNIQUE constraint (found %)', n_uniq;
  END IF;

  SELECT count(*) INTO n_idx FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'item_forward_events'
      AND indexname IN ('idx_item_forward_events_event_date', 'idx_item_forward_events_intelligence_item_id');
  IF n_idx <> 2 THEN
    RAISE EXCEPTION 'ABORT: item_forward_events is missing one of the two named lookup indexes (found %)', n_idx;
  END IF;

  SELECT relrowsecurity INTO rls_on FROM pg_class
    WHERE oid = 'public.item_forward_events'::regclass;
  IF NOT rls_on THEN
    RAISE EXCEPTION 'ABORT: item_forward_events does not have RLS enabled';
  END IF;

  SELECT count(*) INTO n_rows FROM public.item_forward_events;
  IF n_rows <> 0 THEN
    RAISE EXCEPTION 'ABORT: item_forward_events is not empty (% rows) — this migration must ship schema-only', n_rows;
  END IF;

  RAISE NOTICE 'migration 274 OK: item_forward_events created, 13 columns, 7 CHECKs, 1 UNIQUE, 2 lookup indexes, RLS enabled, 0 rows (schema only)';
END $$;

COMMIT;
