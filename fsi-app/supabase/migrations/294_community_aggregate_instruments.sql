-- 294 — Community: the house-seeded recurring benchmark instrument (Lane COMMUNITY-A, Wave 3, 2026-09-03;
-- docs/specs/05-community.md §1, §3, §5 components 3, 4).
--
-- WHAT THIS IS. Two tables (`community_benchmark_instruments`, the calendar-driven poll definitions;
-- `community_benchmark_responses`, the private, per-organisation submissions), house-seeded ONLY
-- (`scripts/community/seed-benchmark-instruments.mjs`, this lane) — never a member-created poll, matching
-- this lane's own governing brief ("seeds aggregate instruments only, never posts pretending to be
-- members"). Individual responses are NEVER selectable by anon or authenticated roles (REVOKE posture
-- below, matching migration 287's aggregate_query_log/sensitive_field_policy) — the ONLY read path is the
-- aggregate GET /api/community/benchmarks/current route, which computes the published figure server-side
-- via src/lib/community/benchmark.mjs and, for a live gate proof, via public.publish_aggregate() itself
-- (see the seed row below).
--
-- REUSES migration 287's antitrust infrastructure rather than rebuilding it (COMMON lane contract
-- "Quality bar": no duplication of an existing module). Migration 287 shipped `sensitive_field_policy`,
-- `aggregate_query_log` and `publish_aggregate()` COMPLETE and REAL, but seeded against a
-- `community_contributions`-shaped table that "DOES NOT EXIST YET" (287's own header, three times, in
-- capitals). This migration is that table finally landing — under the name this lane's write set actually
-- gives it (`community_benchmark_responses`, not `community_contributions`; the shape 287 anticipated —
-- one numeric value per contributing organisation per field — is otherwise identical) — and registers it
-- in `sensitive_field_policy` so `publish_aggregate('community_benchmark_responses', 'value_numeric', ...)`
-- is a REAL, DB-enforced k-anonymity / dominance-cap / freeze-window / forward-looking gate for the house
-- benchmark, with its own durable audit log, on day one. `src/lib/community/benchmark.mjs`'s pure JS
-- aggregation (unit-tested on constructed fixtures, no database) and this SQL gate answer two different
-- questions honestly kept separate — see that module's header.
--
-- k_min=5, max_share_pct=25.0, min_lag_days=90 are the EXACT numbers spec 05 §1 states ("minimum five
-- contributors, no contributor above 25% share, and a lag of more than three months") — not a
-- coincidence: migration 287 registered the identical floor for spec 08 §5's own antitrust language, and
-- spec 05 §1 cites the same underlying defensible-exchange criteria (Winston & Strawn / ABA Antitrust,
-- both linked in spec 05 §1). One set of numbers, two specs describing the same legal standard.

-- ── Preconditions ────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.sensitive_field_policy') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.sensitive_field_policy does not exist — migration 287 must be applied first';
  END IF;
  -- to_regclass only resolves relations, not functions; check pg_proc directly for publish_aggregate().
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'publish_aggregate') THEN
    RAISE EXCEPTION 'ABORT: public.publish_aggregate() does not exist — migration 287 must be applied first';
  END IF;
END $$;

-- ── community_benchmark_instruments ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.community_benchmark_instruments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key            text NOT NULL UNIQUE,   -- e.g. 'saf-premium-eu-us-air-2026-q3' — stable, human-readable, calendar-encoded
  title          text NOT NULL,
  question       text NOT NULL,
  field_key      text NOT NULL
                 CHECK (field_key IN ('rate_per_feu','wage_per_hour','capacity_teu','saf_premium_pct','pricing')),
                 -- mirrors src/lib/community/antitrust.mjs SENSITIVE_FIELDS — a literal copy, same
                 -- posture as every other origin_class/derivation CHECK in this schema (the JS module is
                 -- the readable source of truth; the CHECK is the DB-enforced twin).
  unit           text,
  sector_profile text,   -- canonical sector id (ALL_SECTORS) or NULL for cross-sector — see
                         -- src/lib/community/benchmark.mjs scopeBenchmarksForReader()
  region         text NOT NULL DEFAULT 'GLOBAL'
                 CHECK (region IN ('EU','UK','US','LATAM','APAC','HK','MEA','GLOBAL')),
  calendar_cycle text NOT NULL CHECK (calendar_cycle IN ('monthly','quarterly','annual')),
  opens_at       timestamptz NOT NULL,
  closes_at      timestamptz NOT NULL,
  period_end     date NOT NULL,   -- the historical period this instrument's data reflects (feeds the three-month lag gate)
  created_by     text NOT NULL DEFAULT 'house' CHECK (created_by = 'house'),
                 -- LOCKED to 'house': this table is exclusively the house-seeded recurring benchmark
                 -- (spec 05 §3, component 4). A future member-created poll (spec 05 §5 component 3's
                 -- broader "polls, benchmark surveys" language) is out of THIS lane's scope and gets its
                 -- own table when built, rather than widening this CHECK to blur the two.
  status         text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','open','closed')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_benchmark_instruments_window_check CHECK (closes_at > opens_at)
);

COMMENT ON TABLE public.community_benchmark_instruments IS
  'Spec 05 §3, component 4: the house-seeded, fixed-calendar recurring benchmark. Seeded exclusively by '
  'scripts/community/seed-benchmark-instruments.mjs (dry by default). Scoping and window logic in '
  'src/lib/community/benchmark.mjs (scopeBenchmarksForReader, isOpenForResponses).';

CREATE INDEX IF NOT EXISTS idx_community_benchmark_instruments_status_closes
  ON public.community_benchmark_instruments (status, closes_at);
CREATE INDEX IF NOT EXISTS idx_community_benchmark_instruments_sector
  ON public.community_benchmark_instruments (sector_profile) WHERE sector_profile IS NOT NULL;

ALTER TABLE public.community_benchmark_instruments ENABLE ROW LEVEL SECURITY;

-- Instrument DEFINITIONS (question/title/window) are not sensitive — any authenticated member can see
-- what's currently being asked, same as a public poll listing.
CREATE POLICY "community_benchmark_instruments_select_authenticated"
  ON public.community_benchmark_instruments
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "community_benchmark_instruments_service_role"
  ON public.community_benchmark_instruments
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
-- No authenticated INSERT/UPDATE/DELETE policy: only the house seeder (service role) creates instruments.

-- ── community_benchmark_responses ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.community_benchmark_responses (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument_id       uuid NOT NULL REFERENCES public.community_benchmark_instruments(id) ON DELETE CASCADE,
  respondent_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  organisation_key    text NOT NULL,
                      -- a pseudonymous, SERVER-DERIVED identifier for the respondent's employer (e.g. a
                      -- salted hash of their verified corporate email domain) — NEVER the raw domain or
                      -- company name, and NEVER client-supplied (see RLS below: only the service role
                      -- writes this table, precisely so organisation_key cannot be spoofed to fake
                      -- k-anonymity by one actor claiming many distinct "organisations").
  value_numeric       numeric,
  submitted_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (instrument_id, organisation_key),
  UNIQUE (instrument_id, respondent_user_id)
);

COMMENT ON TABLE public.community_benchmark_responses IS
  'Spec 05 §1, §3: individual aggregate-instrument submissions. NEVER individually rendered — no SELECT '
  'grant for anon/authenticated (see RLS below), mirroring migration 287''s aggregate_query_log/'
  'sensitive_field_policy REVOKE posture. The ONLY read path is GET /api/community/benchmarks/current, '
  'which computes a k-anonymous, dominance-capped, lag-gated aggregate server-side via '
  'src/lib/community/benchmark.mjs and public.publish_aggregate(''community_benchmark_responses'', '
  '''value_numeric'', ...) — see sensitive_field_policy seed row below. organisation_key is the live '
  'subject migration 287''s own header named as "NOT YET LIVE" for community_contributions; this is that '
  'table, landing under this lane''s actual name.';
COMMENT ON COLUMN public.community_benchmark_responses.organisation_key IS
  'Server-derived pseudonymous organisation identifier. Never client-supplied — see RLS below and this '
  'migration''s header for why (spoofable k-anonymity is worse than no k-anonymity check at all).';

CREATE INDEX IF NOT EXISTS idx_community_benchmark_responses_instrument
  ON public.community_benchmark_responses (instrument_id);

ALTER TABLE public.community_benchmark_responses ENABLE ROW LEVEL SECURITY;
-- No SELECT policy for anon/authenticated at all — raw responses are never individually readable by
-- anyone but the service role (the aggregate route). No authenticated INSERT policy either:
-- organisation_key must be server-derived (see column comment), so the guard-enforced route writes via
-- the service role after validating auth.uid() itself, exactly like migration 287's own posture for
-- aggregate_query_log/sensitive_field_policy ("the ONLY read path is this function").
CREATE POLICY "community_benchmark_responses_service_role"
  ON public.community_benchmark_responses
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

REVOKE ALL ON public.community_benchmark_responses FROM authenticated, anon;

-- ── Register the live subject with migration 287's gate (extends the existing policy table; does not
-- edit migration 287's file) ─────────────────────────────────────────────────────────────────────────
INSERT INTO public.sensitive_field_policy (table_name, column_name, k_min, max_share_pct, min_lag_days, forward_looking_allowed, bucket_scheme, policy)
VALUES (
  'community_benchmark_responses', 'value_numeric', 5, 25.0, 90, false, 'abs:1',
  'Spec 05 §1: the Community house-seeded benchmark''s live subject for migration 287''s publish_aggregate() gate. Rounded to the nearest whole unit (rate/wage/capacity/premium figures are already coarse); see community_benchmark_instruments.field_key/unit for what each instrument actually measures.'
)
ON CONFLICT (table_name, column_name) DO UPDATE SET bucket_scheme = EXCLUDED.bucket_scheme, policy = EXCLUDED.policy;

-- ── Post-checks ──────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  n_policy int;
  result1 jsonb;
  result2 jsonb;
  n_logged_before int;
  n_logged_after int;
BEGIN
  IF to_regclass('public.community_benchmark_instruments') IS NULL THEN
    RAISE EXCEPTION 'ABORT: community_benchmark_instruments did not land';
  END IF;
  IF to_regclass('public.community_benchmark_responses') IS NULL THEN
    RAISE EXCEPTION 'ABORT: community_benchmark_responses did not land';
  END IF;

  SELECT count(*) INTO n_policy FROM public.sensitive_field_policy
   WHERE table_name = 'community_benchmark_responses' AND column_name = 'value_numeric' AND k_min = 5 AND max_share_pct = 25.0 AND min_lag_days = 90;
  IF n_policy <> 1 THEN
    RAISE EXCEPTION 'ABORT: sensitive_field_policy was not registered for community_benchmark_responses.value_numeric as expected (found %)', n_policy;
  END IF;

  -- Prove the REAL gate is live for this field, not merely registered — same self-check discipline
  -- migration 287 itself uses, kept to two calls (the full check-order matrix is already proven there;
  -- this is "is our new field actually wired," not a re-proof of publish_aggregate() itself).
  SELECT count(*) INTO n_logged_before FROM public.aggregate_query_log WHERE table_name = 'community_benchmark_responses';

  result1 := public.publish_aggregate('community_benchmark_responses', 'value_numeric', '{"member_ids": ["org-a","org-b","org-c"]}'::jsonb);
  IF (result1->>'refused')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'ABORT: publish_aggregate did not refuse a 3-organisation cohort against k_min=5 for community_benchmark_responses: %', result1;
  END IF;

  result2 := public.publish_aggregate('community_benchmark_responses', 'value_numeric', '{"member_ids": ["org-a","org-b","org-c","org-d","org-e"], "member_values": {"org-a": 100, "org-b": 100, "org-c": 100, "org-d": 100, "org-e": 100}}'::jsonb);
  IF (result2->>'refused')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'ABORT: publish_aggregate refused a genuinely balanced 5-organisation cohort for community_benchmark_responses: %', result2;
  END IF;

  SELECT count(*) INTO n_logged_after FROM public.aggregate_query_log WHERE table_name = 'community_benchmark_responses';
  IF n_logged_after - n_logged_before <> 2 THEN
    RAISE EXCEPTION 'ABORT: expected exactly 2 new aggregate_query_log rows for community_benchmark_responses, found %', n_logged_after - n_logged_before;
  END IF;

  -- Clean up this migration's own self-check footprint from the shared audit log (matches migration
  -- 287's own convention: "this migration must land with... NOTHING ELSE").
  DELETE FROM public.aggregate_query_log WHERE table_name = 'community_benchmark_responses';

  RAISE NOTICE 'migration 294 OK: community_benchmark_instruments, community_benchmark_responses landed; sensitive_field_policy registered and publish_aggregate() proven live for the new field';
END $$;
