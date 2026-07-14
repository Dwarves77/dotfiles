-- 203_holdings_quality.sql
-- Per-capture holdings-quality audit store (operator dispatch 2026-07-14, "SUPABASE HOLDINGS AUDIT").
--
-- WHAT THIS RECORDS: for every stored capture behind an intelligence item — a snapshot (raw_fetches
-- row) or the item's pool aggregate (agent_run_searches rows) — the audit's per-capture classification:
-- completeness against KNOWN DEFECT CLASSES, sufficiency for grounding, and the publisher shape it was
-- judged against.
--
-- WHAT THIS DOES NOT CLAIM (operator amendment, verbatim intent): this audit detects known defect
-- classes (truncation / furniture / stub); it NEVER proves completeness. `completeness='NO-KNOWN-DEFECT'`
-- means "no defect this audit can detect", not "provably whole". The integrity guarantee is GROUNDING-SIDE:
-- a fact grounds only if its span matches a floor-qualifying source read in FULL (the truncation moat,
-- source-credibility-model). This table is a triage index for re-collection, not a certificate.
--
-- Keying reality (schema-audited before write): raw_fetches is keyed by source_id (no item/url column);
-- a snapshot maps to an item via intelligence_items.source_id = raw_fetches.source_id. agent_run_searches
-- is keyed by intelligence_item_id. bytes_collected is BIGINT to match raw_fetches.html_bytes.
--
-- RLS mirrors integrity_flags: platform admins (org_memberships owner/admin) SELECT; service_role ALL
-- (the guarded write path writes as service_role). No public access.

CREATE TABLE IF NOT EXISTS public.holdings_quality (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intelligence_item_id uuid NOT NULL REFERENCES public.intelligence_items(id) ON DELETE CASCADE,
  source_id            uuid REFERENCES public.sources(id) ON DELETE SET NULL,
  capture_kind         text NOT NULL CHECK (capture_kind IN ('snapshot', 'pool')),
  capture_ref          uuid REFERENCES public.raw_fetches(id) ON DELETE SET NULL, -- raw_fetches.id; NULL for a pool aggregate
  bytes_collected      bigint NOT NULL DEFAULT 0,
  clean_content_chars  integer,       -- after chrome/nav strip, where computed
  declared_size        integer,       -- content-length / true doc size where knowable
  completeness         text NOT NULL CHECK (completeness IN ('NO-KNOWN-DEFECT', 'TRUNCATED', 'FURNITURE', 'STUB')),
  defect_evidence      jsonb NOT NULL DEFAULT '{}'::jsonb,  -- per-classification proof (the checks that fired + their measures)
  sufficiency          text NOT NULL CHECK (sufficiency IN ('covers_grounding', 'corroborators_only', 'insufficient')),
  publisher_shape      text CHECK (publisher_shape IN ('eur-lex', 'legislation.gov.uk', 'federal-register', 'gazette', 'other')),
  stale_verified       boolean NOT NULL DEFAULT false,  -- a verified-side item whose grounding evidence predates its latest capture
  audited_at           timestamptz NOT NULL DEFAULT now(),
  audit_version        text NOT NULL
);

-- One snapshot classification per raw_fetches row; one pool-aggregate classification per item.
CREATE UNIQUE INDEX IF NOT EXISTS holdings_quality_snapshot_uq
  ON public.holdings_quality (capture_ref) WHERE capture_kind = 'snapshot';
CREATE UNIQUE INDEX IF NOT EXISTS holdings_quality_pool_uq
  ON public.holdings_quality (intelligence_item_id) WHERE capture_kind = 'pool';
CREATE INDEX IF NOT EXISTS holdings_quality_item_idx ON public.holdings_quality (intelligence_item_id);
CREATE INDEX IF NOT EXISTS holdings_quality_completeness_idx ON public.holdings_quality (completeness);
CREATE INDEX IF NOT EXISTS holdings_quality_sufficiency_idx ON public.holdings_quality (sufficiency);

COMMENT ON TABLE public.holdings_quality IS
  'Per-capture holdings-quality audit (2026-07-14). One row per stored capture (snapshot=raw_fetches | pool=agent_run_searches aggregate) behind an item. completeness detects KNOWN DEFECT CLASSES (TRUNCATED/FURNITURE/STUB) and never proves wholeness — NO-KNOWN-DEFECT = no detectable defect, not certified-complete. The integrity guarantee is grounding-side (floor-first truncation moat). This is a re-collection triage index.';
COMMENT ON COLUMN public.holdings_quality.completeness IS
  'NO-KNOWN-DEFECT (no detectable defect; NOT proof of wholeness) | TRUNCATED (byte-cap/declared-size shortfall) | FURNITURE (chrome/nav dominates, low clean-content ratio) | STUB (JS/error shell, <=1000 bytes).';
COMMENT ON COLUMN public.holdings_quality.sufficiency IS
  'covers_grounding (a floor-qualifying capture usable to ground facts) | corroborators_only (below the item authority floor; contextualizes) | insufficient (too thin to ground or corroborate).';
COMMENT ON COLUMN public.holdings_quality.defect_evidence IS
  'The measures behind the classification: e.g. {"byte_cap":61440,"declared":218000,"ratio":0.28,"checks_fired":["byte_truncation"]}. Records what was detected, not a completeness proof.';

ALTER TABLE public.holdings_quality ENABLE ROW LEVEL SECURITY;

CREATE POLICY holdings_quality_admin_read ON public.holdings_quality
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.org_memberships m
            WHERE m.user_id = auth.uid() AND m.role = ANY (ARRAY['owner'::text, 'admin'::text]))
  );

CREATE POLICY holdings_quality_service_role_write ON public.holdings_quality
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
