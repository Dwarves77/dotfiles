-- 290 — obligations: the register table for spec-01's stated core (Lane OBLIG, 2026-09-02).
--
-- WHY THIS EXISTS. Surface spec 01 (docs/specs/01-regulations.md) §2: "the atomic unit is not the
-- document, it is the obligation" — and §1: `binding_position` is "the single most important new field
-- on this surface... more important than any UI work." Today `binding_position` is a fully-defined
-- vocabulary (`src/lib/contracts/vocabularies.mjs` BINDING_POSITION, 4 values) with ZERO consumers
-- anywhere in the repo outside its own module and test — an unused enum. Separately, migration 274
-- (`item_forward_events`, 901+ rows) extracts "what is due, when" but has nowhere durable to become a
-- REGISTER: item_forward_events is deliberately grain-of-the-source-text (one row per dated clause,
-- re-derivable by re-running the extractor), not grain-of-the-register-row, and carries no
-- jurisdiction / mode / binding_position of its own (those live on `intelligence_items`). This
-- migration is the durable register spec-01 asks for: `scripts/obligations/derive-obligations.mjs`
-- (this lane) reads `item_forward_events` joined to its `intelligence_items` and writes ONE
-- `obligations` row per forward event, denormalizing the item's jurisdiction / transport mode /
-- computed binding_position onto it, so the register can be filtered and sorted without a join at read
-- time.
--
-- SCOPE, STATED HONESTLY. This is the MVP obligation register spec-01 needs to exist at all, not the
-- full §3.2 field list (pinpoint_citation, verbatim_text, plain_language, duty_holder_class,
-- applicability_trigger, four dates, evidence_required, sanction_class, cost_formula, owner/status/
-- review — all future work, most gated on data this corpus does not populate yet). What this migration
-- DOES ship, matching spec-01's own emphasis: `binding_position` actually used (classified
-- deterministically by `src/lib/obligations/classify-binding-position.mjs` from the spec's own §1
-- instrument table — no LLM, $0, unmapped instruments stay NULL rather than guessed), jurisdiction[],
-- transport mode (canonical `ocean`, never `sea` — the domain-wide rule `vocabularies.mjs` states for
-- itself), a due date that is NULL rather than invented when the source event has none, and full
-- provenance back to both the source forward event and the source item (§5's "on what basis, who said
-- so" test).
--
-- GRAIN: one row per `item_forward_events` row, not per item. A single item's phase-out schedule is
-- several forward events (migration 274's own header: Euro 7 alone produced 40) and is therefore
-- several distinct obligation-register rows, matching the source table's own grain rather than
-- collapsing it. `forward_event_id` is UNIQUE — this is what makes a derivation re-run idempotent at
-- the DB layer: the extractor and the classifier are both pure/deterministic, so re-deriving over an
-- unchanged corpus slice reproduces the same rows and a re-run inserts nothing new for them (enforced
-- as a constraint, not trusted of the writer — same posture migration 274 §"grounding rule" states for
-- itself).
--
-- WHY DUE_DATE IS NULLABLE EVEN THOUGH item_forward_events.event_date IS NOT NULL. Every row born from
-- a real forward event carries a real date today (274's own column is NOT NULL). This column is
-- nullable anyway, on purpose, for two reasons stated rather than silently assumed: (1) defensive
-- correctness — `derive-obligations.mjs` NEVER invents a due date it cannot verify from the source
-- event, and a schema that could not represent "no date" would tempt a future writer to synthesize one
-- rather than leave it honestly absent; (2) forward-compatibility — a future obligation source that is
-- NOT itself a dated forward event (a customer-contract obligation, spec-01 §4 item 12) will need this
-- same table's shape without a due date, and over-constraining NOT NULL now would force a breaking
-- migration later for a case spec-01 already names as required.
--
-- CANONICAL MODE, NEVER 'sea'. `vocabularies.mjs`'s own header: "CANONICAL TOKEN IS `ocean`, BY
-- OPERATOR RULING 2026-08-12... `sea` and `maritime` survive as INPUT ALIASES and are never stored."
-- `derive-obligations.mjs` normalizes every mode through `normaliseMode()` before writing (dropping
-- anything that does not resolve), and this migration ALSO enforces it as a CHECK constraint
-- (`obligations_modes_no_alias_check`) so a future writer cannot silently regress the rule the way an
-- application-layer-only convention always eventually does.
--
-- BINDING_POSITION IS NULLABLE. Not every item's instrument is one spec-01 §1's table names (that table
-- is itself explicitly non-exhaustive — "Almost nothing in the freight sustainability landscape binds a
-- forwarder directly," but the corpus carries hundreds of items outside that named set). NULL here means
-- "not yet classified," a real and distinct state from `monitoring_only` (which means "classified — and
-- the classification is that it doesn't currently reach you"). The read model
-- (`src/lib/obligations/read-register.mjs`) renders NULL as an explicit "Not classified" state, never as
-- a blank cell or a silently-dropped row — spec-01's own status-vocabulary discipline ("'Not assessed'
-- is a first-class state, never a null [rendered as a dash]") applied to this field by the same logic.
--
-- PROVENANCE (spec-01 §5's defensibility test: "on 14 March, what did we believe applied to us, on what
-- basis, who said so, against which text version?"). Every row carries `intelligence_item_id` (which
-- item) and `forward_event_id` (which dated clause), both FKs, plus `derivation_version` (the
-- classifier/derivation script version at write time, same pattern item_forward_events.extractor_version
-- already established) and `derived_at`. The event's own `obligation_text` / `source_span` /
-- `source_kind` / `confidence` / `date_precision` stay on `item_forward_events` (this table does not
-- duplicate them) and are reached via `forward_event_id` — one home per fact, not two.
--
-- ADDITIVE AND SAFE. A brand-new table, zero existing consumers, zero existing rows at apply time. No
-- existing table, function, view, or RLS policy is touched. `intelligence_items` and
-- `item_forward_events` are read-only FK targets here.
--
-- RLS — MIRRORS MIGRATION 274 EXACTLY (which itself mirrors 103), retargeted at this table's FK. Same
-- reasoning: this is customer-visible content (the obligation register a customer reads), not internal
-- pipeline QA state — a public SELECT policy gated on the parent item's `is_archived` flag, nothing
-- more restrictive, no explicit GRANT (default schema-level SELECT + RLS is the actual gate). The
-- read model ADDS `provenance_status = 'verified'` as defense-in-depth at the application layer
-- (same posture `src/lib/forward-events/read-upcoming.mjs` already takes for the sibling
-- item_forward_events read) — RLS itself does not check that column, only is_archived.
--
-- TWO-TRACK POLICY (CLAUDE.md standing rule 3): schema DDL, applies via the sanctioned lane BEFORE the
-- dependent derivation script's writes land. Authored by lane OBLIG, LEFT UNAPPLIED. Applied only by
-- the coordinator.
--
-- REVERSAL / ROLLBACK FILE. None shipped, matching the established convention migration 274's own header
-- documents in full for this exact migration shape (a from-scratch CREATE TABLE, 0 rows, no existing
-- consumer: 271/268/266/274 all ship no rollback file). This migration's own reversal is
-- `DROP TABLE IF EXISTS public.obligations;` — unconditionally safe (nothing yet reads or writes this
-- table) — noted here rather than authored as a speculative separate file, for the same reason 274
-- states.

BEGIN;

CREATE TABLE IF NOT EXISTS public.obligations (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  intelligence_item_id  uuid        NOT NULL REFERENCES public.intelligence_items(id) ON DELETE CASCADE,
  forward_event_id      uuid        NOT NULL REFERENCES public.item_forward_events(id) ON DELETE CASCADE,
  jurisdiction          text[]      NOT NULL DEFAULT '{}',
  modes                 text[]      NOT NULL DEFAULT '{}',
  binding_position      text,
  due_date              date,
  date_precision        text,
  event_kind            text        NOT NULL,
  status                text        NOT NULL DEFAULT 'active',
  derivation_version    text        NOT NULL,
  derived_at            timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT obligations_forward_event_unique
    UNIQUE (forward_event_id),

  CONSTRAINT obligations_binding_position_check
    CHECK (binding_position IS NULL OR binding_position IN (
      'direct_duty', 'carrier_passthrough', 'customer_contract', 'monitoring_only'
    )),

  CONSTRAINT obligations_date_precision_check
    CHECK (date_precision IS NULL OR date_precision IN ('day', 'month', 'year')),

  -- Mirrors item_forward_events_event_kind_check (migration 274) exactly — this column is a copy of
  -- the source event's own kind, not an independent classification.
  CONSTRAINT obligations_event_kind_check
    CHECK (event_kind IN (
      'entry_into_force', 'compliance_deadline', 'review_or_report',
      'phase_step', 'consultation_close', 'other'
    )),

  CONSTRAINT obligations_status_check
    CHECK (status IN ('active', 'archived')),

  -- due_date and date_precision travel together: a row with no due date has no precision to report,
  -- and a row with a due date must state how much of it the source actually specified (same discipline
  -- item_forward_events enforces for itself via NOT NULL; here both are nullable together instead,
  -- because this column pair CAN legitimately be absent, unlike the source table's).
  CONSTRAINT obligations_due_date_precision_pair_check
    CHECK ((due_date IS NULL) = (date_precision IS NULL)),

  -- Canonical mode enforcement, DDL-level (this migration's own header: "never trust a convention to
  -- hold at the application layer alone"). 'sea'/'maritime'/'water'/'vessel'/'marine' are input
  -- aliases (vocabularies.mjs MODE_ALIASES) that must resolve to 'ocean' before ever reaching this
  -- column; 'multimodal' is a corridor-only token (vocabularies.mjs TRANSPORT_MODES) that a single leg
  -- (and therefore a single obligation row) never carries either.
  CONSTRAINT obligations_modes_no_alias_check
    CHECK (NOT (modes && ARRAY['sea', 'maritime', 'water', 'vessel', 'marine', 'truck', 'lorry', 'hgv',
                                'barge', 'iww', 'inland-waterway', 'freighter', 'airfreight',
                                'multimodal']::text[]))
);

COMMENT ON TABLE public.obligations IS
  'The obligation register (surface spec 01 §2/§3.2 core), one row per public.item_forward_events row. '
  'Denormalizes the source items jurisdiction / transport mode / a deterministically classified '
  'binding_position onto the dated event so the register can be filtered and sorted without a join. '
  'Written only by scripts/obligations/derive-obligations.mjs (dry by default, --apply through the '
  'guarded db.mjs path). See this migrations own header for the grain, nullability and RLS rationale.';

COMMENT ON COLUMN public.obligations.jurisdiction IS
  'Denormalized copy of the source items jurisdiction_iso at derivation time (e.g. [''EU''], '
  '[''US-CA'']). Empty array, never null, when the item carries none.';

COMMENT ON COLUMN public.obligations.modes IS
  'Denormalized, canonicalized copy of the source items transport_modes (normaliseMode() applied; an '
  'unrecognised raw value is DROPPED, never guessed). Canonical ocean freight token is always ''ocean'' '
  '-- see obligations_modes_no_alias_check.';

COMMENT ON COLUMN public.obligations.binding_position IS
  'direct_duty | carrier_passthrough | customer_contract | monitoring_only | NULL. Classified '
  'deterministically by src/lib/obligations/classify-binding-position.mjs from surface spec 01 1s '
  'named instrument table -- never invented, never LLM-derived. NULL means not yet classified (a real, '
  'distinct state from monitoring_only, which is itself a classification) and the read model renders it '
  'as an explicit "Not classified" state, never a blank or a dropped row.';

COMMENT ON COLUMN public.obligations.due_date IS
  'Copied from the source forward events event_date. NULL only when the source event itself carries no '
  'date -- derive-obligations.mjs never invents one. Every row derivable from the live corpus today '
  'carries a value (item_forward_events.event_date is NOT NULL); this column stays nullable for a '
  'future non-dated obligation source (spec-01 4 item 12, customer-contract obligations) and as a '
  'defensive contract the derivation script is tested against.';

COMMENT ON COLUMN public.obligations.event_kind IS
  'Copy of the source forward events event_kind (item_forward_events_event_kind_check, migration 274) '
  '-- the register rows own due-window / kind filter reads this column directly rather than joining '
  'back to the source event for it.';

COMMENT ON COLUMN public.obligations.status IS
  'active | archived. Set from the source items is_archived at derivation time (an archived item never '
  'produces or keeps an active register row). Not spec-01 3.2s three-value owner-assessed status '
  '(Yes/No/Not assessed) -- this is a MACHINE lifecycle flag; the human-assessed status field is future '
  'work this migration deliberately does not claim to have built.';

COMMENT ON COLUMN public.obligations.derivation_version IS
  'scripts/obligations/derive-obligations.mjs DERIVATION_VERSION at write time, mirroring '
  'item_forward_events.extractor_version -- lets a downstream consumer tell rows produced by different '
  'classifier/derivation generations apart without re-deriving it from created_at.';

-- ── indexes serving the register reads (filter by jurisdiction/mode/binding_position, sort by due date) ──
CREATE INDEX IF NOT EXISTS idx_obligations_due_date
  ON public.obligations (due_date);

CREATE INDEX IF NOT EXISTS idx_obligations_intelligence_item_id
  ON public.obligations (intelligence_item_id);

CREATE INDEX IF NOT EXISTS idx_obligations_jurisdiction_gin
  ON public.obligations USING GIN (jurisdiction);

CREATE INDEX IF NOT EXISTS idx_obligations_modes_gin
  ON public.obligations USING GIN (modes);

-- ── RLS — mirrors migration 274 exactly, retargeted at this tables FK ───────────────────────────────
ALTER TABLE public.obligations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS obligations_read ON public.obligations;
CREATE POLICY obligations_read ON public.obligations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.intelligence_items i
      WHERE i.id = obligations.intelligence_item_id
        AND i.is_archived = false
    )
  );

-- Service-role bypass via the Supabase service key (no policy needed; RLS is bypassed for service_role
-- by default) — same note migrations 103/274 record for their own tables, unchanged here.

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
    WHERE table_schema = 'public' AND table_name = 'obligations';
  IF n_cols <> 14 THEN
    RAISE EXCEPTION 'ABORT: obligations has % columns, expected 14', n_cols;
  END IF;

  SELECT count(*) INTO n_check FROM pg_constraint
    WHERE conrelid = 'public.obligations'::regclass AND contype = 'c';
  IF n_check <> 6 THEN
    RAISE EXCEPTION 'ABORT: obligations has % CHECK constraints, expected 6', n_check;
  END IF;

  SELECT count(*) INTO n_uniq FROM pg_constraint
    WHERE conrelid = 'public.obligations'::regclass AND contype = 'u';
  IF n_uniq <> 1 THEN
    RAISE EXCEPTION 'ABORT: obligations does not carry exactly one UNIQUE constraint (found %)', n_uniq;
  END IF;

  SELECT count(*) INTO n_idx FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'obligations'
      AND indexname IN (
        'idx_obligations_due_date', 'idx_obligations_intelligence_item_id',
        'idx_obligations_jurisdiction_gin', 'idx_obligations_modes_gin'
      );
  IF n_idx <> 4 THEN
    RAISE EXCEPTION 'ABORT: obligations is missing one of the four named lookup indexes (found %)', n_idx;
  END IF;

  SELECT relrowsecurity INTO rls_on FROM pg_class
    WHERE oid = 'public.obligations'::regclass;
  IF NOT rls_on THEN
    RAISE EXCEPTION 'ABORT: obligations does not have RLS enabled';
  END IF;

  SELECT count(*) INTO n_rows FROM public.obligations;
  IF n_rows <> 0 THEN
    RAISE EXCEPTION 'ABORT: obligations is not empty (% rows) — this migration must ship schema-only', n_rows;
  END IF;

  RAISE NOTICE 'migration 290 OK: obligations created, 14 columns, 6 CHECKs, 1 UNIQUE, 4 lookup indexes, RLS enabled, 0 rows (schema only)';
END $$;

COMMIT;
