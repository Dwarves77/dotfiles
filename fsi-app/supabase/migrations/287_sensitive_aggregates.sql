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
--
-- ── SECOND COMMIT, SAME DAY — completing spec §5.2(b)-(d), the dominance cap, and the forward-looking
-- refusal (operator ruling: "nothing deferred"). The first commit above shipped the k-anonymity floor and
-- §5.2(a) alone; this commit edits the same unapplied migration in place to finish the gate. Same "no live
-- subject" honesty applies throughout: every new check activates only when the caller supplies the data it
-- needs, exactly like `member_ids` already does above — a real caller wires these once `community_
-- contributions` exists, and every one of them is proven live against explicit fixtures below regardless.
--
--   p_cohort_filter gains four new OPTIONAL keys, none of which change the existing 'member_ids' contract:
--     'member_values'      — jsonb object, contributor id -> numeric contribution. Feeds the dominance cap
--                             (max_share_pct) and the published bucketed value itself. Absent -> both are
--                             skipped (no data to check or publish), never a raw value withheld silently.
--     'parent_member_ids'  — jsonb array, the population this cohort is drawn from. Feeds §5.2(b)
--                             complementary-cell suppression (definition below). Absent -> that check does
--                             not run for this request (nothing supplied to define "parent," so nothing to
--                             detect a complement within).
--     'period_start' / 'period_end' — ISO date strings. Feeds the forward-looking refusal. 'period_end' is
--                             preferred when both are given; 'period_start' is the fallback when only a
--                             start is named. A request naming NEITHER is treated as not period-scoped (a
--                             current-state aggregate has no period to be forward-looking about) and the
--                             check does not apply.
--
--   §5.2(b) complementary-cell suppression — DEFINITION USED (spec leaves this to the implementor, "or as
--   you define it, documented"): a request's cohort C and a PRIOR GRANTED cohort P (same table, column)
--   are complements within a caller-supplied parent set S iff (i) C ⊆ S, (ii) P ⊆ S, (iii) C ∩ P = ∅, and
--   (iv) |C| + |P| = |S|. Because C, P and S are each deduplicated sets, (i)-(iv) together FORCE C ∪ P = S
--   exactly — there is no way to satisfy all four with a gap or overlap hidden in S. This is checkable
--   directly with array containment/overlap operators against every prior granted cohort for the field,
--   with no stored "parent registry" needed: the caller supplies S explicitly per request, the same
--   explicit-membership pattern 'member_ids' already establishes above.
--
--   §5.2(c) longitudinal freeze — a granted request is stored VERBATIM (`aggregate_query_log.
--   granted_payload`, a new column) and an identical (table, column, cohort_hash) request within
--   `min_lag_days` returns THAT SAME payload, never a fresh computation — even when the caller's supplied
--   `member_values` would, if recomputed, produce a different number (proven by the self-check below: a
--   frozen repeat with DOUBLED contribution values still returns the ORIGINAL bucketed value). This
--   matters because `cohort_hash` is derived from `member_ids` alone, not from the values a member
--   contributes — so two requests naming the identical roster at two different moments can carry two
--   different underlying values without any membership having changed, and re-publishing the fresh number
--   both times would let a reader difference the two published values even though nobody joined or left.
--   Freezing on the roster, not the values, is what keeps that channel closed. The freeze check runs FIRST,
--   before every other check (k_min, forward-looking, dominance, complement, overlap): its entire point is
--   "give the identical answer already given," not "re-derive that answer by re-running policy that may
--   since have changed."
--
--   §5.2(d) bucket-width scaling and the bucket_scheme GRAMMAR (spec leaves this undefined too — "define
--   the scheme grammar"). This migration defines three forms, implemented by the new `bucket_value()`:
--     'pct:N'  — round to the nearest N (the field is already percentage-denominated; matches this repo's
--                existing pp-vs-% convention — the prefix is a label, not a different rounding mechanism).
--     'abs:N'  — round to the nearest N, in the field's own units (currency, count, ...).
--     'log2'   — round DOWN to the nearest power of 2 (`2^floor(log2(value))`) — for fields spanning a wide
--                dynamic range, where a fixed absolute or percentage step is either too coarse near zero or
--                too fine at the top end.
--   Both 'pct:N' and 'abs:N' apply the IDENTICAL fixed-step rounding; the two names exist for readability
--   at the policy-authoring layer, not because the arithmetic differs.
--   WIDTH SCALING RULE (spec: "the bucket widens as cohort size approaches k_min... document the rule"):
--   `bucket_width_multiplier(n, k_min) = GREATEST(1, CEIL(2 * k_min / n))`. At n = k_min the multiplier is
--   2 (double-width buckets right at the floor); it falls to 1 (baseline width, no widening) exactly at
--   n = 2 * k_min and stays at 1 above that — deliberately reusing spec §5.2(c)'s own "2× the minimum"
--   safe-cohort-size threshold (already named there for longitudinal series) as the point this migration's
--   width scaling also treats as "large enough, stop widening," rather than inventing a second unrelated
--   constant. For 'pct:N'/'abs:N' the multiplier scales the step directly (`N * multiplier`); for 'log2' it
--   groups `multiplier` consecutive octaves into one bucket (`2^(floor(log2(value)/multiplier)*multiplier)`).
--   An unrecognised `bucket_scheme` returns NULL (never a guess, never the raw value) — `publish_aggregate`
--   treats a NULL bucketed value as "gate passed, but nothing publishable, because the policy is
--   misconfigured," which is a configuration problem to fix, not a privacy refusal to log as one.
--
--   Seed data note: the four seed rows' `bucket_scheme` values are UPDATED in this commit from the first
--   commit's placeholder names (`log10_decile`, `currency_decile`, `pct_decile`) to the real grammar this
--   commit defines (`abs:100`, `abs:5`, `log2`, `pct:5` respectively) — the placeholders predated the
--   grammar; this migration is unapplied, so the seed is corrected in place rather than left inconsistent
--   with the function that now reads it.
--
--   Dominance cap (`max_share_pct`) and the forward-looking refusal are both new refusal branches inside
--   `publish_aggregate`, each returning (never raising) exactly like every existing refusal branch, logged
--   the same way.

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
  bucket_scheme text NOT NULL DEFAULT 'undefined', -- publish buckets, never raw values (spec §5.1) — grammar defined in this migration's header
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
COMMENT ON COLUMN public.sensitive_field_policy.bucket_scheme IS
  'Grammar defined in this migration''s header (second-commit section): pct:N, abs:N, log2. Read by '
  'bucket_value(). An unrecognised value makes bucket_value() return NULL (never the raw value).';

-- ── aggregate_query_log (spec §5.2a, extended — see header) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.aggregate_query_log (
  query_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name     text NOT NULL,
  column_name    text NOT NULL,
  cohort_hash    text NOT NULL,   -- md5(sorted, '|'-joined member_ids) — fast exact-repeat/freeze-key check
  cohort_members jsonb NOT NULL,  -- the sorted member-id array itself — required for real overlap/complement detection
  cohort_size    integer NOT NULL CHECK (cohort_size >= 0),
  requested_at   timestamptz NOT NULL DEFAULT now(),
  requested_by   text NOT NULL,
  refused        boolean NOT NULL,
  reason         text NOT NULL,
  frozen         boolean NOT NULL DEFAULT false,   -- second commit: true when this row is a §5.2(c) frozen repeat
  frozen_from    uuid,                              -- second commit: the query_id of the grant this row is frozen from
  granted_payload jsonb                             -- second commit: the EXACT payload returned on a grant (or a frozen repeat's source payload) — NULL on any refusal
);

COMMENT ON TABLE public.aggregate_query_log IS
  'Spec 08 §5.2a: every publish_aggregate() request, refused or not, logged — the audit trail the '
  'query-set-size / tracker attack mitigation depends on ("a query audit log with overlap detection that '
  'refuses a request whose symmetric difference from a prior request by the same viewer is below a '
  'threshold"). Second commit: also the §5.2(c) freeze store (granted_payload) and its bookkeeping '
  '(frozen, frozen_from). Never read directly by anon/authenticated (see RLS below) — only '
  'publish_aggregate() (SECURITY DEFINER) writes and consults it.';
COMMENT ON COLUMN public.aggregate_query_log.cohort_members IS
  'Sorted jsonb array of contributor identifiers. Required (not merely cohort_hash) to compute the §5.2a '
  'symmetric-difference check and the §5.2(b) complement check for real — see this migration''s header for '
  'why a hash alone cannot answer either question.';
COMMENT ON COLUMN public.aggregate_query_log.granted_payload IS
  'Second commit, spec §5.2(c): the exact jsonb response returned the first time this (table, column, '
  'cohort_hash) was granted. A repeat request within min_lag_days returns THIS verbatim, never a fresh '
  'recomputation — see this migration''s header for why (membership-hash freeze, not a value freeze).';

CREATE INDEX IF NOT EXISTS aggregate_query_log_requester_field_idx
  ON public.aggregate_query_log (requested_by, table_name, column_name, requested_at DESC);
CREATE INDEX IF NOT EXISTS aggregate_query_log_field_hash_idx
  ON public.aggregate_query_log (table_name, column_name, cohort_hash, requested_at DESC);

-- ── bucket_value() / bucket_width_multiplier() — spec §5.2(d), grammar and widening rule in this
-- migration's header (second commit). Pure, IMMUTABLE, no table access — proven directly by the
-- self-check below against literal fixtures shared with src/lib/propagation/aggregate-safeguards.mjs's
-- test file, so the SQL and the CI-testable JS mirror agree on the same numbers. ────────────────────────
CREATE OR REPLACE FUNCTION public.bucket_width_multiplier(p_n integer, p_k_min integer)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT greatest(1, ceil((2.0 * p_k_min) / greatest(p_n, 1)));
$$;

COMMENT ON FUNCTION public.bucket_width_multiplier(integer, integer) IS
  'Spec 08 §5.2(d) width-scaling rule (this migration''s definition, header): GREATEST(1, CEIL(2*k_min/n)). '
  '2 at n=k_min, falling to 1 (no widening) at n=2*k_min and above — reuses spec §5.2(c)''s own "2x the '
  'minimum" threshold rather than inventing a second constant.';

CREATE OR REPLACE FUNCTION public.bucket_value(p_value numeric, p_scheme text, p_multiplier numeric DEFAULT 1)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  step numeric;
  m numeric := greatest(coalesce(p_multiplier, 1), 1);
BEGIN
  IF p_value IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_scheme ~ '^(pct|abs):[0-9]+(\.[0-9]+)?$' THEN
    step := substring(p_scheme from 5)::numeric * m;
    IF step <= 0 THEN
      RETURN NULL;
    END IF;
    RETURN round(p_value / step) * step;
  ELSIF p_scheme = 'log2' THEN
    IF p_value <= 0 THEN
      RETURN 0;
    END IF;
    RETURN power(2, floor(log(2, p_value) / m) * m);
  ELSE
    RETURN NULL; -- unrecognised scheme: caller must treat NULL as "cannot bucket, never publish raw" (spec §5.1)
  END IF;
END $$;

COMMENT ON FUNCTION public.bucket_value(numeric, text, numeric) IS
  'Spec 08 §5.2(d), grammar defined in this migration''s header: pct:N and abs:N round to the nearest '
  'N*multiplier; log2 rounds down to the nearest power of 2, grouping `multiplier` octaves per bucket. '
  'Returns NULL for a NULL value or an unrecognised scheme — never returns the raw value it cannot bucket.';

REVOKE ALL ON FUNCTION public.bucket_value(numeric, text, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bucket_width_multiplier(integer, integer) FROM PUBLIC;

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
--
-- SECOND COMMIT: check ORDER, documented once here rather than at every branch below — (1) freeze
-- (short-circuits everything else — see header), (2) k_min floor, (3) forward-looking, (4) dominance cap,
-- (5) §5.2(b) complementary-cell suppression, (6) §5.2(a) query-set-size/tracker overlap, (7) grant +
-- bucket. Each of (2)-(6) returns immediately on refusal, exactly like the original single-check version.
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
  -- second commit (§5.2 b-d + dominance + forward-looking):
  frozen_row      record;
  parent_sorted   text[];
  prior_sorted    text[];
  prior_row       record;
  complement_hit  boolean := false;
  period_end_txt  text;
  period_end_date date;
  total_value     numeric;
  max_value       numeric;
  max_share       numeric;
  agg_value       numeric;
  width_mult      numeric;
  bucketed_value  numeric;
  v_granted_payload jsonb;
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

  -- (1) §5.2(c) longitudinal freeze — see header for the full rationale. Runs first; short-circuits
  -- everything below.
  SELECT query_id, granted_payload INTO frozen_row
    FROM public.aggregate_query_log
    WHERE refused = false AND table_name = p_table AND column_name = p_column AND cohort_hash = this_hash
      AND requested_at > now() - make_interval(days => pol.min_lag_days)
    ORDER BY requested_at ASC
    LIMIT 1;
  IF FOUND THEN
    reason := format('frozen: identical cohort granted at request %s, within the %s-day freeze window (spec 08 §5.2c)', frozen_row.query_id, pol.min_lag_days);
    INSERT INTO public.aggregate_query_log (query_id, table_name, column_name, cohort_hash, cohort_members, cohort_size, requested_by, refused, reason, frozen, frozen_from, granted_payload)
      VALUES (q_id, p_table, p_column, this_hash, to_jsonb(coalesce(sorted_members, '{}'::text[])), n, requester, false, reason, true, frozen_row.query_id, frozen_row.granted_payload);
    RETURN frozen_row.granted_payload || jsonb_build_object('frozen', true, 'source_query_id', frozen_row.query_id);
  END IF;

  -- (2) Floor: k >= k_min DISTINCT contributors (spec §5.1).
  IF n < pol.k_min THEN
    reason := format('refused: %s contributing organisation(s), minimum %s (spec 08 §5.1)', n, pol.k_min);
    INSERT INTO public.aggregate_query_log (query_id, table_name, column_name, cohort_hash, cohort_members, cohort_size, requested_by, refused, reason)
      VALUES (q_id, p_table, p_column, this_hash, to_jsonb(coalesce(sorted_members, '{}'::text[])), n, requester, true, reason);
    RETURN jsonb_build_object('refused', true, 'reason', reason, 'table', p_table, 'column', p_column, 'cohort_size', n, 'k_min', pol.k_min);
  END IF;

  -- (3) Forward-looking refusal (spec §5.1: "forward pricing: never" when the policy disallows it). Period
  -- is expressed in p_cohort_filter as 'period_end' (preferred) or 'period_start' (fallback); neither
  -- present means the request is not period-scoped and this check does not apply — see header.
  period_end_txt := coalesce(p_cohort_filter ->> 'period_end', p_cohort_filter ->> 'period_start');
  IF NOT pol.forward_looking_allowed AND period_end_txt IS NOT NULL THEN
    period_end_date := NULL;
    BEGIN
      period_end_date := period_end_txt::date;
    EXCEPTION WHEN others THEN
      period_end_date := NULL; -- an unparseable period is not treated as forward-looking; it simply cannot be checked
    END;
    IF period_end_date IS NOT NULL AND period_end_date > current_date THEN
      reason := format('refused: request names a future period (%s), forward_looking_allowed=false for %s.%s (spec 08 §5.1)', period_end_date, p_table, p_column);
      INSERT INTO public.aggregate_query_log (query_id, table_name, column_name, cohort_hash, cohort_members, cohort_size, requested_by, refused, reason)
        VALUES (q_id, p_table, p_column, this_hash, to_jsonb(coalesce(sorted_members, '{}'::text[])), n, requester, true, reason);
      RETURN jsonb_build_object('refused', true, 'reason', reason, 'table', p_table, 'column', p_column, 'cohort_size', n, 'k_min', pol.k_min);
    END IF;
  END IF;

  -- (4) Dominance cap (spec §5.1, max_share_pct): checked only when the caller supplies 'member_values' —
  -- see header for why (no live contributions table to derive them from yet).
  IF p_cohort_filter ? 'member_values' THEN
    SELECT sum(val::numeric), max(val::numeric) INTO total_value, max_value
      FROM jsonb_each_text(p_cohort_filter -> 'member_values') AS t(key, val);
    IF total_value IS NOT NULL AND total_value > 0 THEN
      max_share := (max_value / total_value) * 100;
      IF max_share > pol.max_share_pct THEN
        reason := format('refused: a single contributor holds %s%% of the aggregate, maximum %s%% (spec 08 §5.1 dominance cap)', round(max_share, 1), pol.max_share_pct);
        INSERT INTO public.aggregate_query_log (query_id, table_name, column_name, cohort_hash, cohort_members, cohort_size, requested_by, refused, reason)
          VALUES (q_id, p_table, p_column, this_hash, to_jsonb(coalesce(sorted_members, '{}'::text[])), n, requester, true, reason);
        RETURN jsonb_build_object('refused', true, 'reason', reason, 'table', p_table, 'column', p_column, 'cohort_size', n, 'k_min', pol.k_min, 'max_share_observed', round(max_share, 1));
      END IF;
    END IF;
  END IF;

  -- (5) §5.2(b) complementary-cell suppression — definition in header. Checked only when the caller
  -- supplies 'parent_member_ids'.
  IF p_cohort_filter ? 'parent_member_ids' THEN
    SELECT array_agg(DISTINCT val ORDER BY val) INTO parent_sorted
      FROM jsonb_array_elements_text(p_cohort_filter -> 'parent_member_ids') AS val;
    IF parent_sorted IS NOT NULL AND coalesce(sorted_members, '{}'::text[]) <@ parent_sorted THEN
      FOR prior_row IN
        SELECT cohort_members FROM public.aggregate_query_log
        WHERE refused = false AND table_name = p_table AND column_name = p_column
      LOOP
        SELECT array_agg(val ORDER BY val) INTO prior_sorted
          FROM jsonb_array_elements_text(prior_row.cohort_members) AS val;
        IF prior_sorted IS NOT NULL
           AND prior_sorted <@ parent_sorted
           AND NOT (coalesce(sorted_members, '{}'::text[]) && prior_sorted)
           AND coalesce(array_length(sorted_members, 1), 0) + coalesce(array_length(prior_sorted, 1), 0) = array_length(parent_sorted, 1)
        THEN
          complement_hit := true;
          EXIT;
        END IF;
      END LOOP;
    END IF;
  END IF;

  IF complement_hit THEN
    reason := format('refused: cohort is the exact complement, within the supplied parent set, of a previously granted cohort for %s.%s — publishing both would reveal the suppressed cell by subtraction (spec 08 §5.2b)', p_table, p_column);
    INSERT INTO public.aggregate_query_log (query_id, table_name, column_name, cohort_hash, cohort_members, cohort_size, requested_by, refused, reason)
      VALUES (q_id, p_table, p_column, this_hash, to_jsonb(coalesce(sorted_members, '{}'::text[])), n, requester, true, reason);
    RETURN jsonb_build_object('refused', true, 'reason', reason, 'table', p_table, 'column', p_column, 'cohort_size', n, 'k_min', pol.k_min);
  END IF;

  -- (6) §5.2(a) query-set-size / tracker attack: refuse when this cohort's symmetric difference from a
  -- PRIOR NON-REFUSED request by the SAME requester on the SAME field, within min_lag_days-scaled recency,
  -- is below k_min. `cohort_hash <> this_hash` excludes an exact repeat here — those are handled by the
  -- freeze check above when inside the window, and must not self-flag as an attack once outside it.
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

  -- (7) Granted: compute the bucketed value (spec §5.2d) from 'member_values' when supplied, and store the
  -- EXACT returned payload so a later frozen repeat (see (1) above) can return it verbatim.
  agg_value := NULL;
  IF p_cohort_filter ? 'member_values' THEN
    SELECT sum(val::numeric) INTO agg_value FROM jsonb_each_text(p_cohort_filter -> 'member_values') AS t(key, val);
  END IF;
  width_mult := public.bucket_width_multiplier(n, pol.k_min);
  bucketed_value := public.bucket_value(agg_value, pol.bucket_scheme, width_mult);

  v_granted_payload := jsonb_build_object(
    'refused', false, 'table', p_table, 'column', p_column, 'cohort_size', n, 'k_min', pol.k_min,
    'bucket_scheme', pol.bucket_scheme, 'bucket_width_multiplier', width_mult, 'value', bucketed_value,
    'note', CASE
              WHEN agg_value IS NULL THEN 'gate passed; no live subject field wired yet — see migration 287 header'
              WHEN bucketed_value IS NULL THEN 'gate passed but bucket_scheme is unresolvable — value withheld, never published raw'
              ELSE 'gate passed; value is the bucketed (never raw) aggregate'
            END
  );

  INSERT INTO public.aggregate_query_log (query_id, table_name, column_name, cohort_hash, cohort_members, cohort_size, requested_by, refused, reason, granted_payload)
    VALUES (q_id, p_table, p_column, this_hash, to_jsonb(coalesce(sorted_members, '{}'::text[])), n, requester, false, 'granted', v_granted_payload);

  RETURN v_granted_payload;
END $$;

COMMENT ON FUNCTION public.publish_aggregate(text, text, jsonb) IS
  'Spec 08 §5.1/§5.2(a)-(d)''s publish-time gate, SECURITY DEFINER, REFUSES rather than flags (a '
  're-disaggregable dataset cannot be un-published). Every call is logged, refused or not. Check order and '
  'the p_cohort_filter optional-key contract are documented in this migration''s header (second commit).';

REVOKE ALL ON public.aggregate_query_log FROM authenticated, anon;
REVOKE ALL ON public.sensitive_field_policy FROM authenticated, anon;
GRANT EXECUTE ON FUNCTION public.publish_aggregate(text, text, jsonb) TO authenticated;

-- ── RLS ──────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.sensitive_field_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aggregate_query_log ENABLE ROW LEVEL SECURITY;
-- No SELECT policy for anon/authenticated on either table: the ONLY sanctioned read/write path is
-- publish_aggregate() (SECURITY DEFINER), mirroring spec §5.1's own closing line for `contributions`
-- ("REVOKE ALL ON contributions FROM authenticated — the ONLY read path is this function").

-- ── Seed: spec §5.1's own four named example fields, forward-looking (see header). bucket_scheme values
-- updated in the second commit to this migration's own grammar (was: log10_decile / currency_decile /
-- pct_decile placeholders that predated the grammar). ───────────────────────────────────────────────────
INSERT INTO public.sensitive_field_policy (table_name, column_name, k_min, max_share_pct, min_lag_days, forward_looking_allowed, bucket_scheme, policy)
VALUES
  ('community_contributions', 'rate_per_feu', 5, 25.0, 90, false, 'abs:100',
   'NOT YET LIVE — community_contributions does not exist in this schema (migration 287''s header). Registered ahead of the table per spec §5.1''s own named field so publish_aggregate() refuses cleanly (unregistered-field default) rather than being silently unreachable once the table lands. Dollars per FEU, rounded to the nearest $100 (second-commit grammar).'),
  ('community_contributions', 'wage_per_hour', 5, 25.0, 90, false, 'abs:5',
   'NOT YET LIVE — see rate_per_feu row''s note. Dollars per hour, rounded to the nearest $5.'),
  ('community_contributions', 'capacity_teu', 5, 25.0, 90, false, 'log2',
   'NOT YET LIVE — see rate_per_feu row''s note. Wide dynamic range across contributors, so log2 buckets rather than a fixed step.'),
  ('community_contributions', 'saf_premium_pct', 5, 25.0, 90, false, 'pct:5',
   'NOT YET LIVE — see rate_per_feu row''s note. Already percentage-denominated, rounded to the nearest 5 percentage points.')
ON CONFLICT (table_name, column_name) DO UPDATE SET bucket_scheme = EXCLUDED.bucket_scheme, policy = EXCLUDED.policy;

-- ── Post-checks (a fitness-style SQL self-check block, per this lane's own build instruction) ───────────
DO $$
DECLARE
  n_policy_rows int;
  n_logged int;
  result1 jsonb;
  result2 jsonb;
BEGIN
  SELECT count(*) INTO n_policy_rows FROM public.sensitive_field_policy;
  IF n_policy_rows <> 4 THEN
    RAISE EXCEPTION 'ABORT: sensitive_field_policy seeded % rows, expected 4', n_policy_rows;
  END IF;

  -- ── bucket_value() / bucket_width_multiplier() proven directly, literal fixtures (shared with
  -- src/lib/propagation/aggregate-safeguards.test.mjs) ─────────────────────────────────────────────────
  IF public.bucket_value(1234, 'abs:100', 1) <> 1200 THEN RAISE EXCEPTION 'ABORT: bucket_value abs:100 fixture failed: %', public.bucket_value(1234, 'abs:100', 1); END IF;
  IF public.bucket_value(1234, 'pct:5', 1) <> 1235 THEN RAISE EXCEPTION 'ABORT: bucket_value pct:5 fixture failed: %', public.bucket_value(1234, 'pct:5', 1); END IF;
  IF public.bucket_value(2000, 'log2', 1) <> 1024 THEN RAISE EXCEPTION 'ABORT: bucket_value log2 mult=1 fixture failed: %', public.bucket_value(2000, 'log2', 1); END IF;
  IF public.bucket_value(2000, 'log2', 3) <> 512 THEN RAISE EXCEPTION 'ABORT: bucket_value log2 mult=3 fixture failed: %', public.bucket_value(2000, 'log2', 3); END IF;
  IF public.bucket_value(100, 'nonsense_scheme', 1) IS NOT NULL THEN RAISE EXCEPTION 'ABORT: bucket_value did not return NULL for an unrecognised scheme'; END IF;
  IF public.bucket_value(NULL, 'abs:100', 1) IS NOT NULL THEN RAISE EXCEPTION 'ABORT: bucket_value did not return NULL for a NULL value'; END IF;
  IF public.bucket_width_multiplier(5, 5) <> 2 THEN RAISE EXCEPTION 'ABORT: bucket_width_multiplier(n=k_min) fixture failed: %', public.bucket_width_multiplier(5, 5); END IF;
  IF public.bucket_width_multiplier(10, 5) <> 1 THEN RAISE EXCEPTION 'ABORT: bucket_width_multiplier(n=2*k_min) fixture failed: %', public.bucket_width_multiplier(10, 5); END IF;
  IF public.bucket_width_multiplier(6, 5) <> 2 THEN RAISE EXCEPTION 'ABORT: bucket_width_multiplier(n=6,k_min=5) fixture failed: %', public.bucket_width_multiplier(6, 5); END IF;
  IF public.bucket_width_multiplier(15, 5) <> 1 THEN RAISE EXCEPTION 'ABORT: bucket_width_multiplier(n>2*k_min) fixture failed: %', public.bucket_width_multiplier(15, 5); END IF;

  -- ── rate_per_feu: k_min floor, freeze, tracker-attack overlap, clean grant (originally 6 calls; #3's
  -- exact-repeat now demonstrates FREEZE rather than plain overlap-exemption — same refused=false outcome,
  -- different mechanism, see assertion text) ────────────────────────────────────────────────────────────
  result1 := public.publish_aggregate('no_such_table', 'no_such_column', '{"member_ids": ["a","b","c","d","e"]}'::jsonb);
  IF (result1->>'refused')::boolean IS NOT TRUE OR (result1->>'reason') !~ 'not registered' THEN
    RAISE EXCEPTION 'ABORT: publish_aggregate did not refuse an unregistered field: %', result1;
  END IF;

  result1 := public.publish_aggregate('community_contributions', 'rate_per_feu', '{"member_ids": ["org-a","org-b","org-c"]}'::jsonb);
  IF (result1->>'refused')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'ABORT: publish_aggregate did not refuse a 3-member cohort against k_min=5: %', result1;
  END IF;

  result1 := public.publish_aggregate('community_contributions', 'rate_per_feu', '{"member_ids": ["org-a","org-b","org-c","org-d","org-e"]}'::jsonb);
  IF (result1->>'refused')::boolean IS NOT FALSE OR (result1->>'cohort_size')::int <> 5 THEN
    RAISE EXCEPTION 'ABORT: publish_aggregate granted result is wrong: %', result1;
  END IF;
  result2 := public.publish_aggregate('community_contributions', 'rate_per_feu', '{"member_ids": ["org-a","org-b","org-c","org-d","org-e"]}'::jsonb);
  IF (result2->>'refused')::boolean IS NOT FALSE OR (result2->>'frozen')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'ABORT: publish_aggregate did not freeze an exact repeat of the same cohort (spec 08 §5.2c): %', result2;
  END IF;

  result1 := public.publish_aggregate('community_contributions', 'rate_per_feu', '{"member_ids": ["org-a","org-b","org-c","org-d","org-f"]}'::jsonb);
  IF (result1->>'refused')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'ABORT: publish_aggregate did not refuse a tracker-attack-shaped one-member-swapped cohort: %', result1;
  END IF;

  result1 := public.publish_aggregate('community_contributions', 'rate_per_feu', '{"member_ids": ["org-p","org-q","org-r","org-s","org-t","org-u"]}'::jsonb);
  IF (result1->>'refused')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'ABORT: publish_aggregate incorrectly refused a genuinely unrelated, adequately sized cohort: %', result1;
  END IF;

  -- ── wage_per_hour: §5.2(b) complementary-cell suppression ────────────────────────────────────────────
  result1 := public.publish_aggregate('community_contributions', 'wage_per_hour', '{"member_ids": ["w1","w2","w3","w4","w5"], "parent_member_ids": ["w1","w2","w3","w4","w5","w6","w7","w8","w9","w10"]}'::jsonb);
  IF (result1->>'refused')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'ABORT: publish_aggregate refused the first half of a parent set that should have granted: %', result1;
  END IF;

  result1 := public.publish_aggregate('community_contributions', 'wage_per_hour', '{"member_ids": ["w6","w7","w8","w9","w10"], "parent_member_ids": ["w1","w2","w3","w4","w5","w6","w7","w8","w9","w10"]}'::jsonb);
  IF (result1->>'refused')::boolean IS NOT TRUE OR (result1->>'reason') !~ 'complement' THEN
    RAISE EXCEPTION 'ABORT: publish_aggregate did not refuse the exact complement of the first granted half (spec 08 §5.2b): %', result1;
  END IF;

  result1 := public.publish_aggregate('community_contributions', 'wage_per_hour', '{"member_ids": ["w11","w12","w13","w14","w15"]}'::jsonb);
  IF (result1->>'refused')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'ABORT: publish_aggregate incorrectly refused a fresh, non-complementary cohort: %', result1;
  END IF;

  -- ── capacity_teu: dominance cap, then §5.2(c) freeze proven to ignore CHANGED contribution values ─────
  result1 := public.publish_aggregate('community_contributions', 'capacity_teu', '{"member_ids": ["c1","c2","c3","c4","c5"], "member_values": {"c1": 1000, "c2": 20, "c3": 20, "c4": 20, "c5": 20}}'::jsonb);
  IF (result1->>'refused')::boolean IS NOT TRUE OR (result1->>'reason') !~ 'dominance' THEN
    RAISE EXCEPTION 'ABORT: publish_aggregate did not refuse a 92.6%%-dominant contributor against max_share_pct=25: %', result1;
  END IF;

  result1 := public.publish_aggregate('community_contributions', 'capacity_teu', '{"member_ids": ["c1","c2","c3","c4","c5"], "member_values": {"c1": 200, "c2": 200, "c3": 200, "c4": 200, "c5": 200}}'::jsonb);
  IF (result1->>'refused')::boolean IS NOT FALSE
     OR (result1->>'value')::numeric <> public.bucket_value(1000, 'log2', public.bucket_width_multiplier(5, 5))
  THEN
    RAISE EXCEPTION 'ABORT: publish_aggregate did not grant a balanced (20%% share) cohort with the expected bucketed value: %', result1;
  END IF;

  result2 := public.publish_aggregate('community_contributions', 'capacity_teu', '{"member_ids": ["c1","c2","c3","c4","c5"], "member_values": {"c1": 400, "c2": 400, "c3": 400, "c4": 400, "c5": 400}}'::jsonb);
  IF (result2->>'refused')::boolean IS NOT FALSE
     OR (result2->>'frozen')::boolean IS NOT TRUE
     OR (result2->>'value')::numeric <> (result1->>'value')::numeric
  THEN
    RAISE EXCEPTION 'ABORT: publish_aggregate did not freeze the SAME roster requested again with DOUBLED contribution values — froze value should equal the original grant''s value, not a fresh (2000-based) recomputation: original=% repeat=%', result1, result2;
  END IF;

  -- ── saf_premium_pct: forward-looking refusal, then the same roster with a past period grants ──────────
  result1 := public.publish_aggregate('community_contributions', 'saf_premium_pct', jsonb_build_object('member_ids', to_jsonb(ARRAY['s1','s2','s3','s4','s5']), 'period_end', to_char(current_date + 30, 'YYYY-MM-DD')));
  IF (result1->>'refused')::boolean IS NOT TRUE OR (result1->>'reason') !~ 'future period' THEN
    RAISE EXCEPTION 'ABORT: publish_aggregate did not refuse a future-dated period against forward_looking_allowed=false: %', result1;
  END IF;

  result1 := public.publish_aggregate('community_contributions', 'saf_premium_pct', jsonb_build_object('member_ids', to_jsonb(ARRAY['s1','s2','s3','s4','s5']), 'period_end', to_char(current_date - 30, 'YYYY-MM-DD')));
  IF (result1->>'refused')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'ABORT: publish_aggregate refused a PAST-dated period (should only gate future ones): %', result1;
  END IF;

  -- Exactly 14 publish_aggregate() calls made above, every one logged (refused, frozen, or freshly
  -- granted) — proves spec §5.2a's "logging every request refused or not" holds under the second
  -- commit's new refusal branches too.
  SELECT count(*) INTO n_logged FROM public.aggregate_query_log;
  IF n_logged <> 14 THEN
    RAISE EXCEPTION 'ABORT: aggregate_query_log did not record every self-check call (found % rows, expected 14)', n_logged;
  END IF;

  -- This migration must land with the four policy seed rows and NOTHING ELSE — clean up the self-check
  -- log rows so the migration's own footprint is documented, not accumulated noise.
  DELETE FROM public.aggregate_query_log;

  RAISE NOTICE 'migration 287 OK: sensitive_field_policy (4 seeded rows), aggregate_query_log, publish_aggregate() and its helpers proven live — k-anonymity floor, §5.2a tracker-attack overlap, §5.2b complementary-cell suppression, §5.2c longitudinal freeze (including under changed underlying values), §5.2d bucket rounding and width scaling, the dominance cap, and the forward-looking refusal all exercised against real rows, every request logged';
END $$;
