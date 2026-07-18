-- 212_corpus_census.sql
--
-- CORPUS CENSUS (operator ruling 2026-07-16): the total-corpus classification table — one row per item (live +
-- archived). Live items carry their provenance_status; archived items additionally carry a Haiku verdict that
-- VERIFIES the existing archive_reason (archive_correct vs review_valuable-wrongly-archived) — the input to the
-- archive endgame and the true corpus number. Read-only classification (no item mutations); this table is the
-- result store. Additive.
create table if not exists public.corpus_census (
  intelligence_item_id  uuid primary key,
  is_archived           boolean,
  provenance_status     text,
  archive_reason        text,
  census_class          text,          -- coarse class: verified / quarantined / <archive_reason bucket>
  haiku_verdict         text,          -- archived only: 'archive_correct' | 'review_valuable' (null for live)
  haiku_confidence      integer,       -- 0-100
  haiku_rationale       text,
  classified_by         text,
  classified_at         timestamptz not null default now()
);
comment on table public.corpus_census is
  'Total-corpus census (operator ruling 2026-07-16). One row per item. Live = provenance_status. Archived = Haiku verdict verifying the archive_reason (archive_correct | review_valuable). Input to the archive endgame; read-only classification, no item mutations.';
