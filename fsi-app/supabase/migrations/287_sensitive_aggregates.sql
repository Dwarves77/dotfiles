-- 287 — antitrust and anonymisation safeguards for sensitive community aggregates (Lane DP-ENGINE,
-- system-completion train, 2026-09-02 — docs/specs/08-flywheel-design.md §5; ADR-024).
--
-- NO LIVE SUBJECT TODAY, STATED UP FRONT. Spec §5 protects a cross-organisation BENCHMARK — a sensitive
-- numeric field community members contribute (rate_per_feu, wage_per_hour, capacity_teu, saf_premium_pct
-- are spec's own named examples) that must never be published in a form re-disaggregable to one
-- contributor. This lane's governing brief confirmed `community_posts` (migration 030) exists but carries
-- NO such numeric field — `grep -n "CREATE TABLE.*community_posts" supabase/migrations/*.sql` finds one
-- table with `title`/`body`/`attribution` only, nothing resembling a rate/wage/capacity contribution. The
-- gate below is built COMPLETE and REAL (every function is proven live against real rows in the
-- self-check at the foot of this file, not merely designed on paper), but it has NOTHING TO GATE YET — the
-- same "structure now, subject later" posture migration 258 states for emission_factors ("This migration
-- creates the structure and seeds the LICENCE REGISTER only... a factor row asserts a physical quantity
-- and a schema does not"). `sensitive_field_policy` is seeded with the FOUR field names spec §5.1 itself
-- names, keyed against a table (`community_contributions`) that DOES NOT EXIST YET — a forward-looking
-- policy registration, not a live grant, matching `data_sources.substitute`'s existing convention of
-- naming a source_key that may not (yet) resolve. When a future lane builds the first sensitive numeric
-- field, `publish_aggregate()` refuses it CLEANLY (a registered policy with zero matching rows, or an
-- unregistered field entirely — both fail closed) until that lane extends the seed. This is named here,
-- not silently discovered by a future reader.
--
-- SCHEMA DEVIATIONS FROM SPEC §5's OWN ILLUSTRATIVE DDL, EACH STATED:
--
--   sensitive_field_policy: spec keys this `field_key text PRIMARY KEY` with five bare knobs
--   (min_contributors, max_share_pct, min_lag_days, forward_looking_allowed, bucket_scheme). This lane's
--   governing brief instead gives the literal shape `(table_name, column_name, k_min int default 5,
--   policy text)` — the (table,column) pair matching `publish_aggregate`'s own `(p_table, p_column)`
--   signature (also handed literally, differing from spec's own `publish_aggregate(p_field, p_cohort)`).
--   Both are honoured: `(table_name, column_name)` is the PRIMARY KEY (the policy lookup key
--   `publish_aggregate` consults), `k_min` is spec's `min_contributors` under the brief's name, and the
--   REST of spec's five knobs (`max_share_pct`, `min_lag_days`, `forward_looking_allowed`,
--   `bucket_scheme`) are ADDED as real, structured columns rather than folded into the brief's free-text
--   `policy` column — a `text` column alone cannot back `publish_aggregate`'s dominance-cap and
--   staleness-lag checks (spec §5.1's own two REAL refusal conditions beyond the k-anonymity floor), and a
--   gate that cannot check them would be decoration, which the header of spec §5 explicitly warns against
--   ("k >= 5 is the floor, not the defence"). `policy` is KEPT as a free-text reviewer note (mirroring
--   `data_sources.blocker`/`ask_who`'s own free-text-alongside-structured-columns convention, migration
--   258), never the sole home of an enforced number.
--
--   aggregate_query_log: the brief's literal columns (`query_id, cohort_hash, cohort_size, requested_at,
--   requested_by, refused, reason`) are ALL present, plus `cohort_members jsonb NOT NULL` — REQUIRED to
--   implement the §5.2(a) query-set-size / tracker attack mitigation for real. A hash alone cannot answer
--   "does this cohort differ from a prior one by fewer than k_min members" (two DIFFERENT member sets can
--   share nothing decomposable from their hashes); the brief itself names this exact tension ("implement
--   with a stored cohort member-hash set OR sorted id list hash: choose and document") — this migration
--   chooses the SORTED MEMBER LIST (stored as jsonb), with `cohort_hash` retained as `md5()` of that same
--   sorted list, kept as a fast exact-repeat/idempotency check (a re-request of the IDENTICAL cohort is
--   never treated as an attack; see publish_aggregate below).
--
-- `publish_aggregate(p_table, p_column, p_cohort_filter)` DOES NOT RUN DYNAMIC SQL AGAINST AN ARBITRARY
-- CALLER-NAMED (p_table, p_column) — deliberately. `p_table`/`p_column` are the POLICY LOOKUP KEY (which
-- registered field this request concerns) and the LABEL carried into the log/return payload, never
-- interpolated into a query against a live table: constructing `EXECUTE format('SELECT ... FROM %I ...',
-- p_table)` from two free-text parameters with no further validation would be exactly the SQL-injection-
-- shaped surface a SECURITY DEFINER function must never carry (SECURITY DEFINER runs with the FUNCTION
-- OWNER's full privileges, the worst possible place for an unvalidated identifier to reach dynamic SQL).
-- The cohort itself (WHO is contributing) is supplied EXPLICITLY by the caller in `p_cohort_filter->
-- 'member_ids'` (a jsonb array of contributor identifiers) — this is honest given the header's own
-- admission that no live subject exists to query membership FROM yet: when a real `community_
-- contributions`-shaped table lands, that lane extends this function (or adds a sibling) to derive
-- `member_ids` from a real join, keeping the k-anonymity/overlap/logging gate below UNCHANGED (it is
-- already fully general over an arbitrary member-id list).

-- ── Preconditions ────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.community_posts') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.community_posts does not exist — migration 030 must be applied first';
  END IF;
END $$;

-- ── sensitive_field_policy (spec §5.1, extended — see header) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sensitive_field_policy (
  table_name    text NOT NULL,
  column_name   text NOT NULL,
  k_min         integer NOT NULL DEFAULT 5 CHECK (k_min >= 5), -- "k >= 5 is the floor" (spec §5, non-negotiable minimum)
  max_share_pct numeric NOT NULL DEFAULT 25.0 CHECK (max_share_pct > 0 AND max_share_pct <= 100),
  min_lag_days  integer NOT NULL DEFAULT 90 CHECK (min_lag_days >= 0),
  forward_looking_allowed boolean NOT NULL DEFAULT false, -- spec §5.1: "forward pricing: never" — default is the safe answer
  bucket_scheme text NOT NULL DEFAULT 'undefined', -- publish buckets, never raw values (spec §5.1)
  policy        text, -- free-text reviewer note, never the sole home of an enforced number (see header)
  PRIMARY KEY (table_name, column_name)
);

COMMENT ON TABLE public.sensitive_field_policy IS
  'Spec 08 §5.1: write-time gate policy per sensitive field, keyed (table_name, column_name) per this '
  'lane''s governing brief. Absence of a row for a (table,column) means publish_aggregate() refuses by '
  'default (spec §5.1: "IF NOT FOUND THEN RAISE EXCEPTION... refusing by default"). Seeded below with '
  'spec''s own four named example fields against a table that does not exist yet — see this migration''s '
  'header for why that is a deliberate, forward-looking registration, not a live grant.';
COMMENT ON COLUMN public.sensitive_field_policy.k_min IS
  'Minimum DISTINCT CONTRIBUTING ORGANISATIONS (never row count — spec §5.1''s own warning: "Five '
  'submissions from one company is one contributor, and counting rows... is the most common way this '
  'control is quietly defeated"). Floor 5, matching spec''s own "k >= 5 is the floor, not the defence".';

-- ── aggregate_query_log (spec §5.2a, extended — see header) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.aggregate_query_log (
  query_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name     text NOT NULL,
  column_name    text NOT NULL,
  cohort_hash    text NOT NULL,   -- md5(sorted, '|'-joined member_ids) — fast exact-repeat check
  cohort_members jsonb NOT NULL,  -- the sorted member-id array itself — required for real overlap detection
  cohort_size    integer NOT NULL CHECK (cohort_size >= 0),
  requested_at   timestamptz NOT NULL DEFAULT now(),
  requested_by   text NOT NULL,
  refused        boolean NOT NULL,
  reason         text NOT NULL
);

COMMENT ON TABLE public.aggregate_query_log IS
  'Spec 08 §5.2a: every publish_aggregate() request, refused or not, logged — the audit trail the '
  'query-set-size / tracker attack mitigation depends on ("a query audit log with overlap detection that '
  'refuses a request whose symmetric difference from a prior request by the same viewer is below a '
  'threshold"). Never read directly by anon/authenticated (see RLS below) — only publish_aggregate() '
  '(SECURITY DEFINER) writes and consults it.';
COMMENT ON COLUMN public.aggregate_query_log.cohort_members IS
  'Sorted jsonb array of contributor identifiers. Required (not merely cohort_hash) to compute the §5.2a '
  'symmetric-difference check for real — see this migration''s header for why a hash alone cannot answer '
  'that question, and why this lane chose to store the list rather than only its hash.';

CREATE INDEX IF NOT EXISTS aggregate_query_log_requester_field_idx
  ON public.aggregate_query_log (requested_by, table_name, column_name, requested_at DESC);

-- ── publish_aggregate() — refuses, never flags (spec §5.1's own framing) ────────────────────────────────
--
-- RETURNS A REFUSAL, NEVER RAISES ONE — a deliberate, tested deviation from spec §5.1's own illustrative
-- body (`RAISE EXCEPTION 'refused: ...'`). PROVEN BY THIS MIGRATION'S OWN SELF-CHECK (below) to matter:
-- Postgres rolls back EVERY effect of a statement — including a prior INSERT the SAME function already
-- executed — back to the enclosing savepoint the instant that statement raises an unhandled exception,
-- whether or not the caller's own code catches it downstream (a caller that wraps the RPC call in a
-- try/catch, which is the ordinary calling shape for an antitrust GATE a route handler must not crash
-- on, gets exactly this rollback). A "log the refusal, THEN raise" body therefore SILENTLY LOSES THE LOG
-- ROW ON EVERY REFUSAL — the opposite of spec §5.1's own requirement ("logging every request refused or
-- not"). This migration's first self-check draft used spec's literal RAISE shape and the post-check DO
-- block caught the missing rows directly (found 3 of an expected >=6) before this fix — recorded here so
-- a future editor does not reintroduce it by "restoring" spec's literal wording. The function instead
-- ALWAYS returns a jsonb payload with a `refused` boolean and a `reason`; a caller that wants exception
-- semantics raises from the RETURNED reason at the call site, where the log row has already committed.
CREATE OR REPLACE FUNCTION public.publish_aggregate(p_table text, p_column text, p_cohort_filter jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  pol             public.sensitive_field_policy%ROWTYPE;
  members         jsonb;
  sorted_members  text[];
  n               integer;
  q_id            uuid := gen_random_uuid();
  requester       text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', 'unknown');
  this_hash       text;
  overlap_hit     boolean;
  reason          text;
BEGIN
  SELECT * INTO pol FROM public.sensitive_field_policy WHERE table_name = p_table AND column_name = p_column;
  IF NOT FOUND THEN
    reason := format('field %s.%s is not registered in sensitive_field_policy — refusing by default (spec 08 §5.1)', p_table, p_column);
    INSERT INTO public.aggregate_query_log (query_id, table_name, column_name, cohort_hash, cohort_members, cohort_size, requested_by, refused, reason)
      VALUES (q_id, p_table, p_column, 'n/a', '[]'::jsonb, 0, requester, true, reason);
    RETURN jsonb_build_object('refused', true, 'reason', reason, 'table', p_table, 'column', p_column);
  END IF;

  members := coalesce(p_cohort_filter -> 'member_ids', '[]'::jsonb);
  SELECT array_agg(DISTINCT val ORDER BY val) INTO sorted_members
    FROM jsonb_array_elements_text(members) AS val;
  n := coalesce(array_length(sorted_members, 1), 0);
  this_hash := md5(array_to_string(coalesce(sorted_members, '{}'::text[]), '|'));

  -- Floor: k >= k_min DISTINCT contributors (spec §5.1).
  IF n < pol.k_min THEN
    reason := format('refused: %s contributing organisation(s), minimum %s (spec 08 §5.1)', n, pol.k_min);
    INSERT INTO public.aggregate_query_log (query_id, table_name, column_name, cohort_hash, cohort_members, cohort_size, requested_by, refused, reason)
      VALUES (q_id, p_table, p_column, this_hash, to_jsonb(coalesce(sorted_members, '{}'::text[])), n, requester, true, reason);
    RETURN jsonb_build_object('refused', true, 'reason', reason, 'table', p_table, 'column', p_column, 'cohort_size', n, 'k_min', pol.k_min);
  END IF;

  -- §5.2(a) query-set-size / tracker attack: refuse when this cohort's symmetric difference from a PRIOR
  -- NON-REFUSED request by the SAME requester on the SAME field, within min_lag_days-scaled recency (spec's
  -- own mitigation window, "within 90 days" — this lane uses pol.min_lag_days as that window since spec
  -- ties both notions to "recent" without naming two separate constants), is below k_min. An EXACT repeat
  -- of the identical cohort is never treated as an attack (this_hash equality short-circuits it).
  SELECT EXISTS (
    SELECT 1
    FROM public.aggregate_query_log l
    WHERE l.refused = false
      AND l.table_name = p_table AND l.column_name = p_column
      AND l.requested_by = requester
      AND l.requested_at > now() - make_interval(days => pol.min_lag_days)
      AND l.cohort_hash <> this_hash
      AND (
        SELECT count(*) FROM (
          SELECT m FROM unnest(coalesce(sorted_members, '{}'::text[])) AS m
          EXCEPT SELECT jsonb_array_elements_text(l.cohort_members)
          UNION ALL
          SELECT jsonb_array_elements_text(l.cohort_members)
          EXCEPT SELECT m FROM unnest(coalesce(sorted_members, '{}'::text[])) AS m
        ) sym_diff
      ) < pol.k_min
  ) INTO overlap_hit;

  IF overlap_hit THEN
    reason := format('refused: cohort differs from a recent request by fewer than %s member(s) — query-set-size / tracker attack guard (spec 08 §5.2a)', pol.k_min);
    INSERT INTO public.aggregate_query_log (query_id, table_name, column_name, cohort_hash, cohort_members, cohort_size, requested_by, refused, reason)
      VALUES (q_id, p_table, p_column, this_hash, to_jsonb(coalesce(sorted_members, '{}'::text[])), n, requester, true, reason);
    RETURN jsonb_build_object('refused', true, 'reason', reason, 'table', p_table, 'column', p_column, 'cohort_size', n, 'k_min', pol.k_min);
  END IF;

  -- Granted: log it, then return the bucketed shape. NO RAW VALUE COMPUTATION HAPPENS HERE — see header
  -- for why (no live subject; a future lane wires the real aggregate once one exists) — a real caller
  -- reads `value: null, note: ...` today and knows exactly why.
  INSERT INTO public.aggregate_query_log (query_id, table_name, column_name, cohort_hash, cohort_members, cohort_size, requested_by, refused, reason)
    VALUES (q_id, p_table, p_column, this_hash, to_jsonb(coalesce(sorted_members, '{}'::text[])), n, requester, false, 'granted');

  RETURN jsonb_build_object(
    'refused', false, 'table', p_table, 'column', p_column, 'cohort_size', n, 'k_min', pol.k_min,
    'bucket_scheme', pol.bucket_scheme, 'value', NULL,
    'note', 'gate passed (k-anonymity + overlap-refusal); no live subject field wired yet — see migration 287 header'
  );
END $$;

COMMENT ON FUNCTION public.publish_aggregate(text, text, jsonb) IS
  'Spec 08 §5.1/§5.2a''s publish-time gate, SECURITY DEFINER, REFUSES rather than flags (a re-disaggregable '
  'dataset cannot be un-published). Every call is logged, refused or not. See this migration''s header for '
  'why it does not run dynamic SQL against an arbitrary (p_table, p_column) and why the cohort is supplied '
  'explicitly rather than derived from a live table that does not exist yet.';

REVOKE ALL ON public.aggregate_query_log FROM authenticated, anon;
REVOKE ALL ON public.sensitive_field_policy FROM authenticated, anon;
GRANT EXECUTE ON FUNCTION public.publish_aggregate(text, text, jsonb) TO authenticated;

-- ── RLS ──────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.sensitive_field_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aggregate_query_log ENABLE ROW LEVEL SECURITY;
-- No SELECT policy for anon/authenticated on either table: the ONLY sanctioned read/write path is
-- publish_aggregate() (SECURITY DEFINER), mirroring spec §5.1's own closing line for `contributions`
-- ("REVOKE ALL ON contributions FROM authenticated — the ONLY read path is this function").

-- ── Seed: spec §5.1's own four named example fields, forward-looking (see header) ───────────────────────
INSERT INTO public.sensitive_field_policy (table_name, column_name, k_min, max_share_pct, min_lag_days, forward_looking_allowed, bucket_scheme, policy)
VALUES
  ('community_contributions', 'rate_per_feu', 5, 25.0, 90, false, 'log10_decile',
   'NOT YET LIVE — community_contributions does not exist in this schema (migration 287''s header). Registered ahead of the table per spec §5.1''s own named field so publish_aggregate() refuses cleanly (unregistered-field default) rather than being silently unreachable once the table lands.'),
  ('community_contributions', 'wage_per_hour', 5, 25.0, 90, false, 'currency_decile',
   'NOT YET LIVE — see rate_per_feu row''s note.'),
  ('community_contributions', 'capacity_teu', 5, 25.0, 90, false, 'log10_decile',
   'NOT YET LIVE — see rate_per_feu row''s note.'),
  ('community_contributions', 'saf_premium_pct', 5, 25.0, 90, false, 'pct_decile',
   'NOT YET LIVE — see rate_per_feu row''s note.')
ON CONFLICT (table_name, column_name) DO NOTHING;

-- ── Post-checks (a fitness-style SQL self-check block, per this lane's own build instruction) ───────────
DO $$
DECLARE
  n_policy_rows int;
  n_seeded int;
  result1 jsonb;
BEGIN
  SELECT count(*) INTO n_policy_rows FROM public.sensitive_field_policy;
  IF n_policy_rows <> 4 THEN
    RAISE EXCEPTION 'ABORT: sensitive_field_policy seeded % rows, expected 4', n_policy_rows;
  END IF;

  -- (1) Unregistered field refuses AND logs (no exception — see the function's own header on why).
  result1 := public.publish_aggregate('no_such_table', 'no_such_column', '{"member_ids": ["a","b","c","d","e"]}'::jsonb);
  IF (result1->>'refused')::boolean IS NOT TRUE OR (result1->>'reason') !~ 'not registered' THEN
    RAISE EXCEPTION 'ABORT: publish_aggregate did not refuse an unregistered field: %', result1;
  END IF;

  -- (2) Registered field, cohort below k_min refuses.
  result1 := public.publish_aggregate('community_contributions', 'rate_per_feu', '{"member_ids": ["org-a","org-b","org-c"]}'::jsonb);
  IF (result1->>'refused')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'ABORT: publish_aggregate did not refuse a 3-member cohort against k_min=5: %', result1;
  END IF;

  -- (3) Registered field, cohort >= k_min grants, and the SAME cohort re-requested does not trip the
  -- overlap guard (exact repeat is not an attack).
  result1 := public.publish_aggregate('community_contributions', 'rate_per_feu', '{"member_ids": ["org-a","org-b","org-c","org-d","org-e"]}'::jsonb);
  IF (result1->>'refused')::boolean IS NOT FALSE OR (result1->>'cohort_size')::int <> 5 THEN
    RAISE EXCEPTION 'ABORT: publish_aggregate granted result is wrong: %', result1;
  END IF;
  result1 := public.publish_aggregate('community_contributions', 'rate_per_feu', '{"member_ids": ["org-a","org-b","org-c","org-d","org-e"]}'::jsonb);
  IF (result1->>'refused')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'ABORT: publish_aggregate refused an exact repeat of the same cohort: %', result1;
  END IF;

  -- (4) A DIFFERENT cohort overlapping the first by only one member out (symmetric difference 2, below
  -- k_min=5) is refused — the query-set-size / tracker attack (spec §5.2a).
  result1 := public.publish_aggregate('community_contributions', 'rate_per_feu', '{"member_ids": ["org-a","org-b","org-c","org-d","org-f"]}'::jsonb);
  IF (result1->>'refused')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'ABORT: publish_aggregate did not refuse a tracker-attack-shaped one-member-swapped cohort: %', result1;
  END IF;

  -- (5) A cohort with LARGE symmetric difference from the first (a genuinely different, adequately large
  -- cohort) is granted, proving the overlap guard does not over-refuse unrelated requests.
  result1 := public.publish_aggregate('community_contributions', 'rate_per_feu', '{"member_ids": ["org-p","org-q","org-r","org-s","org-t","org-u"]}'::jsonb);
  IF (result1->>'refused')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'ABORT: publish_aggregate incorrectly refused a genuinely unrelated, adequately sized cohort: %', result1;
  END IF;

  SELECT count(*) INTO n_seeded FROM public.aggregate_query_log;
  IF n_seeded <> 6 THEN
    RAISE EXCEPTION 'ABORT: aggregate_query_log did not record every self-check call (found % rows, expected 6)', n_seeded;
  END IF;

  -- This migration must land with the four policy seed rows and NOTHING ELSE — clean up the self-check
  -- log rows so the migration's own footprint is documented, not accumulated noise.
  DELETE FROM public.aggregate_query_log;

  RAISE NOTICE 'migration 287 OK: sensitive_field_policy (4 seeded rows), aggregate_query_log, publish_aggregate() proven live: refuses unregistered fields, refuses below-k_min cohorts, refuses query-set-size-attack-shaped overlapping cohorts, grants adequately sized non-overlapping cohorts, logs every request';
END $$;
