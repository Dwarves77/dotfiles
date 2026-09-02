-- 281 — data_sources: register 'ecb' (European Central Bank euro foreign exchange reference rates).
-- Lane PROD (system-completion train, docs/plans/system-completion-plan-2026-09-02.md §2 "Lane PROD"),
-- 2026-09-02.
--
-- WHY THIS MIGRATION EXISTS. scripts/producers/market/ecb-fx-producer.mjs (shipped, kill-switched off)
-- and src/lib/market/series-registry.mjs's own `ecb-fx` entry have both stated, since 2026-08-31, that
-- market_series.source_key = 'ecb' is NOT a registered row in this table — a live FK to
-- public.data_sources(source_key), same envelope 268 (market_series) attached. Until this row exists any
-- --apply write from ecb-fx-producer.mjs fails closed on 23503 (foreign_key_violation), independent of
-- and in addition to that producer's own two runtime gates (ENABLED, the kill switch). This migration
-- closes that one gate; the other two stay exactly as authored (see ecb-fx-producer.mjs's own header).
--
-- WHY THIS IS A HAND-WRITTEN INSERT, NOT A REGENERATED data_source_seed BLOCK. Migration 258's own
-- header states the sanctioned flow for adding a source: add it to src/lib/contracts/source-licence.mjs
-- (the ONE register renderDataSourceSeedSql() renders into 258's >>> GENERATED: data_source_seed <<<
-- block) and regenerate that block — the same two-step 'ec_weekly_oil_bulletin' went through on
-- 2026-08-30 (see 268's own header). This lane's write set does NOT include source-licence.mjs (the
-- system-completion plan scopes it out of Lane PROD deliberately — see docs/plans/
-- system-completion-plan-2026-09-02.md §2), so the sanctioned generated-flow cannot be used here. This
-- migration adds the row directly instead, as its own small, separate, ON CONFLICT DO NOTHING insert —
-- never touching 258's generated block. THE KNOWN CONSEQUENCE, RECORDED RATHER THAN HIDDEN: after this
-- migration applies, public.data_sources carries an 'ecb' row that src/lib/contracts/source-licence.mjs's
-- SOURCE_LICENCES register does NOT (yet) carry — the database half of the licence gate and the
-- application half (mayEmbedAsSeed / assertEmbeddable) disagree about 'ecb' until a future, separate
-- change adds the matching SOURCE_LICENCES entry and regenerates 258. Nothing in this codebase's
-- application code calls assertEmbeddable('ecb') today (ecb-fx-producer.mjs writes directly through
-- scripts/lib/db.mjs, the same guarded path 268's own producers use, not through the source-licence.mjs
-- seed-loader gate — that gate guards embedded REFERENCE-DATA seeding, e.g. emission_factors, not a
-- market_series time series), so this divergence is inert today. It is still a real gap: a future reader
-- of source-licence.mjs would not see 'ecb' listed and could reasonably believe it is unregistered
-- everywhere. Coordinator follow-up: add an 'ecb' entry to SOURCE_LICENCES (transcribing the verdict
-- below) and regenerate 258 so the two registers agree again.
--
-- LICENCE BASIS — STATED PLAINLY, [UNCONFIRMED THIS SESSION]. This sandbox's egress to every
-- ecb.europa.eu host (www / data-api / sdw-wsrest) returns a 403 policy denial from the agent-proxy
-- (confirmed via `curl -sS $HTTPS_PROXY/__agentproxy/status`, recentRelayFailures: connect_rejected,
-- "www.ecb.europa.eu:443" — the SAME denial ecb-fx-producer.mjs's own header records). The verdict below
-- is transcribed from the ECB's own well-documented, long-stable standing notice
-- (https://www.ecb.europa.eu/home/disclaimer/html/index.en.html, the ECB's legal/copyright notice
-- covering ecb.europa.eu content generally): "reproduction is permitted provided the source is
-- acknowledged". That is an AUTHORISATION, not a condition to discharge — mirrors this register's own
-- 'emsa_thetis_mrv' entry (migration 258, source-licence.mjs), which reads verbatim "Reproduction is
-- authorised, provided the source is acknowledged" and is filed 'permitted' rather than 'conditional' for
-- exactly this reason (source-licence.mjs's own definition: `conditional` is permitted-subject-to-an-act-
-- we-must-perform — notify, register, accredit — and acknowledgement is not such an act; every
-- `permitted` entry in that register already carries an attribution string). redistribution/embeddable
-- below follow that same precedent: 'permitted' / true. verified_on is left NULL rather than backfilled
-- with today's date, because "verified" in this register means a primary-source URL was actually read
-- this session, and it was not — this is a citation of the notice's well-documented wording, not a fresh
-- read. blocker carries the [UNCONFIRMED] flag text so a reader of this table sees the same caveat
-- ecb-fx-producer.mjs's own header carries, without having to cross-reference the code. Per this lane's
-- own gate: whoever next runs a producer where ecb.europa.eu is reachable (a GitHub Actions runner, same
-- posture as fetch-oil-bulletin.mjs's own header) should read the live notice and, if it confirms the
-- text above, a follow-up migration (or the coordinator's source-licence.mjs regeneration) sets
-- verified_on and clears blocker.
--
-- SCOPE. Additive only: one INSERT, ON CONFLICT (source_key) DO NOTHING (never DO UPDATE — a partial,
-- [UNCONFIRMED] verdict must not silently overwrite a future coordinator's fully-verified row; the
-- correction path is a NEW migration, not a re-run of this one). No DDL change. Reversible with
-- `DELETE FROM public.data_sources WHERE source_key = 'ecb';` (safe: no emission_factors row and no
-- market_series row can reference 'ecb' yet — the producer is still kill-switched off).

BEGIN;

INSERT INTO public.data_sources
  (source_key, name, redistribution, embeddable, licence, attribution, url, verified_on, blocker, ask_who, ask_what, substitute)
VALUES (
  'ecb',
  'European Central Bank — euro foreign exchange reference rates',
  'permitted',
  true,
  'ECB legal/copyright notice (ecb.europa.eu site-wide): reproduction is permitted provided the source is acknowledged',
  'Source: European Central Bank',
  'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html',
  NULL,
  'licence text [UNCONFIRMED until first runner dry run reads the ECB notice] — sandbox egress to every ecb.europa.eu host returned a 403 policy denial this session; the verdict above is transcribed from the ECB''s own well-documented standing notice, not a fetch performed this session. See this migration''s own header and ecb-fx-producer.mjs''s header for the full citation.',
  NULL,
  NULL,
  NULL
)
ON CONFLICT (source_key) DO NOTHING;

-- ── Post-checks ──────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r public.data_sources%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.data_sources WHERE source_key = 'ecb';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ABORT: data_sources has no ecb row after this migration''s insert';
  END IF;
  IF r.redistribution <> 'permitted' OR r.embeddable IS NOT TRUE THEN
    RAISE EXCEPTION 'ABORT: ecb row is not permitted/embeddable (redistribution=%, embeddable=%)', r.redistribution, r.embeddable;
  END IF;
  IF r.verified_on IS NOT NULL THEN
    RAISE EXCEPTION 'ABORT: ecb row unexpectedly carries a verified_on date — this migration ships it NULL/[UNCONFIRMED] on purpose';
  END IF;

  -- The FK ecb-fx-producer.mjs's --apply write depends on now resolves.
  IF NOT EXISTS (SELECT 1 FROM public.licence_clear_sources WHERE source_key = 'ecb') THEN
    RAISE EXCEPTION 'ABORT: ecb does not appear in licence_clear_sources — the FK gate would still refuse ecb-fx writes';
  END IF;

  RAISE NOTICE 'migration 281 OK: data_sources has an ecb row (permitted, embeddable, verified_on NULL/[UNCONFIRMED]) — the FK gate on market_series.source_key = ''ecb'' now resolves. ecb-fx-producer.mjs''s other two gates (ENABLED, the runtime kill switch) are unchanged by this migration.';
END $$;

COMMIT;
