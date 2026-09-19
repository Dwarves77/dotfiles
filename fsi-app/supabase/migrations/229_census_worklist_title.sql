-- subject: Migration 229 (Coverage Index human-readable title, B1/P1, 2026-07-28). Adds nullable `title` + `title_source` to `census_worklist` so the customer Coverage panel shows a real title, never a bare identifier. FINDING it addresses: the prior enrichment pass (`unit3-enrich-titles.mjs`) captured 19,782 real titles via the FREE path (EUR-Lex Cellar SPARQL `expression_title` + legislation.gov.uk `dc:title`) but persisted them ONLY to gitignored scratch (`scripts/tmp/census-titles.json`) — not durable. `scripts/coverage/persist-titles.mjs` loads that capture into the column ($0, no re-fetch): 2,896/3,661 would_mint titled (79.1%), 765 residual URL-only feeds fall back to the notes descriptor in the panel (still human-readable). Additive/nullable. **APPLIED 2026-07-28** via apply_migration before the consumer (`getCoverageIndex` displayTitle + `CoverageIndexPanel`) committed. Reversible (drop the 2 columns). [glyph:verbatim]
-- 229 — Coverage Index human-readable title (B1/P1). The operator cannot evaluate bare identifiers on the
-- Coverage panel; every row must show a real title. The prior title-enrichment pass (unit3-enrich-titles.mjs)
-- captured 19,782 real titles via the FREE path (EUR-Lex Cellar SPARQL expression_title + legislation.gov.uk
-- dc:title) but wrote them ONLY to gitignored scratch (scripts/tmp/census-titles.json) — the
-- not-durably-persisted finding. This migration adds the durable columns; scripts/coverage/persist-titles.mjs
-- loads the free-path capture into them ($0, no re-fetch for the covered set). Residual title-less rows fall
-- back to the notes descriptor in the panel (still human-readable, never a bare number).
--
-- Additive + nullable. APPLIED 2026-07-28 via apply_migration before the consumer (getCoverageIndex displayTitle
-- + CoverageIndexPanel) committed. Reversible (drop the two columns).

BEGIN;

ALTER TABLE public.census_worklist
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS title_source text;

COMMENT ON COLUMN public.census_worklist.title IS
  'B1/P1 human-readable instrument title, durably persisted (the prior enrichment pass wrote titles only to gitignored scratch — the not-persisted finding). Populated by scripts/coverage/persist-titles.mjs from the free-path capture (EUR-Lex Cellar SPARQL expression_title + legislation.gov.uk dc:title), $0. NULL = not yet enriched (residual re-capture worklist); the Coverage panel falls back to the notes descriptor, never ships a bare identifier once enrichment completes.';

COMMENT ON COLUMN public.census_worklist.title_source IS
  'Provenance of title: eurlex-cellar | uk-legislation | notes-descriptor | null. Audit of which free path produced the title.';

COMMIT;
