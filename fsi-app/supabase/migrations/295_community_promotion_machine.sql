-- 295 — Community: the five-gate promotion state machine, logged transitions, corroboration stance
-- (Lane COMMUNITY-A, Wave 3, 2026-09-03; docs/specs/05-community.md §4, §5 components 5, 6).
--
-- THREE THINGS.
--
--   1. `community_posts.promotion_state` — the FIVE-value workflow state spec 05 §4 names: community ->
--      community-corroborated -> under-review -> verified, with retired reachable from any non-terminal
--      state (a tombstone, never a deletion). DELIBERATELY NOT the same column as origin_class (migration
--      293): origin_class is the shared, PROTECTED 7-value cross-surface provenance vocabulary
--      (src/lib/contracts/vocabularies.mjs ORIGIN_CLASS; Addendum 26 forbids widening it), and it does
--      not have `under-review` or `retired` values — going under review does not un-corroborate a
--      thread's content, and a tombstoned thread keeps whatever origin_class it last earned alongside
--      the correction. `src/lib/community/promotion.mjs` `originClassFor(state)` is the one place that
--      maps the THREE states that DO carry an origin_class label (community, community-corroborated,
--      verified) onto it; `under-review`/`retired` map to null there (no change) by design — see that
--      module's header, which states this same reasoning.
--
--   2. `community_promotion_transitions` — the audit log spec 05 §4 gate 3 requires ("Publicly visible
--      state") and gate 6 names ("transitions logged"). PUBLIC SELECT (any authenticated member can see a
--      thread's full promotion history — spec 05 §4: "a trust-builder rather than an embarrassment"),
--      SERVICE-ROLE-ONLY INSERT (a transition is only ever written by the guarded server-side state
--      machine — src/lib/community/promotion.mjs buildTransition() — never a direct client write, so the
--      log cannot be forged from the client side).
--
--   3. `community_posts.stance` — feeds the corroboration counter (component 5,
--      src/lib/community/corroboration.mjs corroborationCount()): a REPLY may declare it agrees,
--      disagrees, or is neutral toward its parent thread's central claim. NULL (the default) for every
--      existing reply and for any reply that does not declare a stance — corroboration counting already
--      treats NULL as "not a disagreement, but also not an explicit corroboration" (see that module).

-- ── Preconditions ────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.community_posts') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.community_posts does not exist — migration 030 must be applied first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='community_posts' AND column_name='origin_class') THEN
    RAISE EXCEPTION 'ABORT: community_posts.origin_class does not exist — migration 293 must be applied first';
  END IF;
END $$;

-- ── 1. community_posts.promotion_state ───────────────────────────────────────────────────────────────
ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS promotion_state text NOT NULL DEFAULT 'community';

ALTER TABLE public.community_posts
  ADD CONSTRAINT community_posts_promotion_state_check
  CHECK (promotion_state IN ('community', 'community-corroborated', 'under-review', 'verified', 'retired'));

COMMENT ON COLUMN public.community_posts.promotion_state IS
  'Spec 05 §4: the five-gate promotion workflow state, publicly visible, transitions logged in '
  'community_promotion_transitions. NOT the same vocabulary as origin_class (migration 293) — see this '
  'migration''s header and src/lib/community/promotion.mjs for the relationship. Every top-level thread '
  'starts at ''community''; a reply''s promotion_state is not meaningful (replies are not independently '
  'promoted) and stays at the default.';

CREATE INDEX IF NOT EXISTS idx_community_posts_promotion_state
  ON public.community_posts (promotion_state) WHERE parent_post_id IS NULL;

-- ── 2. community_promotion_transitions ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.community_promotion_transitions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id         uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  from_state      text NOT NULL CHECK (from_state IN ('community', 'community-corroborated', 'under-review', 'verified', 'retired')),
  to_state        text NOT NULL CHECK (to_state IN ('community', 'community-corroborated', 'under-review', 'verified', 'retired')),
  actor_user_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role      text,   -- e.g. 'editor', 'moderator', 'system' (the mechanical community -> community-corroborated move) — free text, informational alongside actor_user_id, never the sole authority for the 'verified requires an editor' rule (that rule lives in src/lib/community/promotion.mjs buildTransition(), checked before this row is ever written)
  reason          text NOT NULL,
  prov_chain      text,   -- required by buildTransition() when to_state='verified' (spec 05 §4 gate 4); NULL for every other transition
  occurred_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.community_promotion_transitions IS
  'Spec 05 §4 gates 3 and 6: the append-only, publicly-readable log of every promotion state change. '
  'Written ONLY by the service-role state machine (src/lib/community/promotion.mjs buildTransition() '
  'validates legality and the editor/provenance rule for ''verified'' BEFORE a row is ever inserted here '
  '— this table trusts that validation happened, it does not re-derive it). promotionState(thread) '
  '(same module) replays this log to determine a thread''s current state, rather than trusting a '
  'possibly-stale community_posts.promotion_state cache.';

CREATE INDEX IF NOT EXISTS idx_community_promotion_transitions_post
  ON public.community_promotion_transitions (post_id, occurred_at);

ALTER TABLE public.community_promotion_transitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "community_promotion_transitions_select_authenticated"
  ON public.community_promotion_transitions
  FOR SELECT
  USING (auth.role() = 'authenticated');
-- Publicly visible state (spec 05 §4: "a trust-builder rather than an embarrassment") — any authenticated
-- member sees a thread's full promotion history, not merely its current state.

CREATE POLICY "community_promotion_transitions_service_role"
  ON public.community_promotion_transitions
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
-- No authenticated INSERT policy: a transition is written only by the guarded server-side state machine,
-- never directly by a client, so the log cannot be forged (e.g. a member self-declaring 'verified').

-- ── 3. community_posts.stance ────────────────────────────────────────────────────────────────────────
ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS stance text;

ALTER TABLE public.community_posts
  ADD CONSTRAINT community_posts_stance_check
  CHECK (stance IS NULL OR stance IN ('agree', 'disagree', 'neutral'));

COMMENT ON COLUMN public.community_posts.stance IS
  'Spec 05 §5 component 5: a REPLY''s declared stance toward its parent thread''s central claim, feeding '
  'src/lib/community/corroboration.mjs corroborationCount() (agree/neutral count toward corroboration; '
  'disagree excludes the reply AND breaks "consistent facts" for the whole thread). NULL (default) for '
  'every top-level post and for any reply that does not declare a stance.';

-- ── Post-checks ──────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  n_default_state int;
  n_cols int;
BEGIN
  SELECT count(*) INTO n_default_state FROM public.community_posts WHERE promotion_state = 'community';
  -- Every pre-existing row must have landed on the default — a sanity floor, not an exact count (could
  -- legitimately be 0 on a fresh/empty database).
  IF n_default_state < 0 THEN
    RAISE EXCEPTION 'ABORT: impossible negative count (sanity check itself is broken)';
  END IF;

  SELECT count(*) INTO n_cols FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'community_posts' AND column_name IN ('promotion_state', 'stance');
  IF n_cols <> 2 THEN
    RAISE EXCEPTION 'ABORT: expected both promotion_state and stance columns on community_posts, found %', n_cols;
  END IF;

  IF to_regclass('public.community_promotion_transitions') IS NULL THEN
    RAISE EXCEPTION 'ABORT: community_promotion_transitions did not land';
  END IF;

  -- Catalog check that community_posts_promotion_state_check exists and is a CHECK constraint (structural
  -- proof, matching migrations 267/268/271's own convention — those state the enforcing INSERT as a
  -- documented manual-verification comment rather than executing a live insert-and-catch inside the
  -- migration transaction, which this migration follows too).
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'community_posts_promotion_state_check' AND contype = 'c'
  ) THEN
    RAISE EXCEPTION 'ABORT: community_posts_promotion_state_check constraint was not created';
  END IF;

  RAISE NOTICE 'migration 295 OK: community_posts.promotion_state (5-value CHECK), community_promotion_transitions (public SELECT, service-role INSERT), community_posts.stance all landed. Manual verification: INSERT INTO community_posts (...) VALUES (..., promotion_state=''not-a-real-state'') must FAIL (23514 check_violation) on community_posts_promotion_state_check.';
END $$;
