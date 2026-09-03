-- 293 — Community: verified-pseudonymous identity, origin_class carriage, entity-bound posting
-- (Lane COMMUNITY-A, Wave 3, 2026-09-03; docs/specs/05-community.md §2, §4, §5 components 1, 2, 11;
-- spec 00 §3.6).
--
-- THREE THINGS, EACH NAMED IN THE WAVE-3 WRITE SET.
--
--   1. `community_member_profiles` — spec 05 §2's "verified backing, displayed pseudonymity" (Gartner
--      Peer Insights model, transferred directly): a member's ORG TYPE, ROLE, SECTOR and REGION, plus a
--      VERIFIED flag, and NOTHING ELSE — no name, no email, no company. This is a NEW table, deliberately
--      separate from the existing `profiles` table (migration 075), because `profiles` carries exactly
--      the identity fields (full_name, avatar_url) spec 05 §2 says a Community profile must never surface
--      ("profiles display job title, role, industry and company size, and not name or company"). Keeping
--      the two tables separate means the pseudonymity guarantee is structural (the row simply does not
--      HAVE a name column to leak), not a read-time filter that a future SELECT * regresses. Read by
--      `src/lib/community/identity.mjs` (`projectAuthorIdentity`), which projects only these five columns
--      even so — belt and suspenders, not a substitute for this table's own shape.
--
--   2. `community_posts.origin_class` — spec 00 §3.6 carriage, required on "everything community-origin"
--      (this lane's own governing brief). UNLIKE migration 267/268/271's NULLABLE, no-backfill posture
--      (Addendum 26: a pre-existing row this migration cannot CONFIDENTLY classify stays NULL rather than
--      guessed), every row in `community_posts` is, by construction, community-origin — there is no
--      ambiguity to preserve. This column is therefore NOT NULL DEFAULT 'community', both for new rows
--      and for the backfill of every existing row (a real, correct backfill, not an omission): a
--      community post's origin_class starts at 'community' and only ever advances via the promotion
--      state machine (migration 295's `community_promotion_transitions`, `src/lib/community/promotion.mjs`
--      `originClassFor()`). CHECK is byte-identical to the shared 7-value vocabulary
--      (src/lib/contracts/vocabularies.mjs ORIGIN_CLASS) other origin_class columns already enforce
--      (migrations 258/267/268/271/285) — this migration does not define a second vocabulary, it reuses
--      the one that exists.
--
--   3. `community_thread_entities` — spec 05 §5 component 2 ("every thread binds to spine entities") /
--      §6 acceptance criterion 6 ("every thread binds to at least one spine entity"). A join table,
--      `entities.entity_id` FK (migration 282's spine — `text`, format `cl:<kind>:<16 hex>`, NOT a uuid),
--      many-to-many because a thread can legitimately bind to more than one entity (a corridor AND the
--      instrument governing it, say). CARDINALITY ENFORCEMENT (>=1 entity per top-level thread) is done
--      at the APPLICATION layer (`POST /api/community/posts`, this lane's guard-enforced route), not by a
--      DB trigger: a hard "at least one child row must exist" invariant needs either a deferred
--      constraint trigger (which only fires if the post AND its entity link are written inside the SAME
--      transaction — PostgREST's single-table REST inserts are each their own transaction, so the app
--      would need a new RPC wrapping both writes, a bigger surface change than this migration's stated
--      scope) or an eventually-consistent sweep (weaker than "refused at write time", the exact posture
--      spec 05 §1 explicitly warns against for the antitrust guard — the same standard should not be
--      lowered here). The route enforces it synchronously in the request that creates the post; this
--      table is the schema truth the route and `GET /api/community/entities/[entityId]/threads` both
--      read from.
--
-- HEADER STYLE, SELF-CHECK, RLS — matching migrations 288-290 (this wave's own stated convention).

-- ── Preconditions ────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.community_posts') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.community_posts does not exist — migration 030 must be applied first';
  END IF;
  IF to_regclass('public.entities') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.entities does not exist — migration 282 must be applied first';
  END IF;
END $$;

-- ── 1. community_member_profiles ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.community_member_profiles (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_type    text NOT NULL
              CHECK (org_type IN ('forwarder','carrier','shipper','customs-broker','3pl','regulator','ngo','analyst','other')),
  role        text,
  sector      text,   -- canonical sector id from ALL_SECTORS (src/lib/constants.ts) — no CHECK here,
                       -- same "grows without a migration" posture migration 155 states for
                       -- community_groups.vertical.
  region      text
              CHECK (region IS NULL OR region IN ('EU','UK','US','LATAM','APAC','HK','MEA','GLOBAL')),
  organisation_key text,
              -- INTERNAL-ONLY, never surfaced by projectAuthorIdentity() (identity.mjs's allowlist does
              -- not carry this column, on purpose). A pseudonymous, server-derived identifier for the
              -- member's employer (e.g. a salted hash of their verified corporate email domain) — set
              -- ONLY alongside verification (see the CHECK below), so it can distinguish "3 distinct
              -- organisations" (corroborationCount, spec 05 §4 gate 2) from "1 organisation posting 3
              -- times" WITHOUT ever revealing which organisation that is. Same concept and same posture
              -- as community_benchmark_responses.organisation_key (migration 294) — kept as two columns
              -- rather than one shared lookup because the two rows they key off (a profile vs. a
              -- benchmark response) have independent lifecycles.
  verified          boolean     NOT NULL DEFAULT false,
  verified_at       timestamptz,
  verification_method text CHECK (verification_method IS NULL OR verification_method IN ('corporate-email','linkedin','write-in')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_member_profiles_verified_has_method
    CHECK (verified = false OR (verified_at IS NOT NULL AND verification_method IS NOT NULL AND organisation_key IS NOT NULL))
);

COMMENT ON TABLE public.community_member_profiles IS
  'Spec 05 §2: verified backing, displayed pseudonymity. Deliberately carries NO name, email or company '
  '— org_type/role/sector/region/verified only. "The platform knows exactly who you are. The room does '
  'not." Never SELECT * this table into a client response; read through '
  'src/lib/community/identity.mjs projectAuthorIdentity() so the allowlist projection is the ONE place '
  'that decision is enforced in code, even though this table structurally cannot leak a name.';
COMMENT ON COLUMN public.community_member_profiles.sector IS
  'Canonical sector id from ALL_SECTORS (src/lib/constants.ts). No CHECK — the sector taxonomy grows '
  'without a migration, matching community_groups.vertical (migration 155).';

CREATE INDEX IF NOT EXISTS idx_community_member_profiles_verified
  ON public.community_member_profiles (verified);

ALTER TABLE public.community_member_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "community_member_profiles_select_authenticated"
  ON public.community_member_profiles
  FOR SELECT
  USING (auth.role() = 'authenticated');
-- Any authenticated member may read another member's pseudonymous identity chip — that IS the product
-- (author identity rendering on every post). Safe because the table carries no PII to begin with.

CREATE POLICY "community_member_profiles_upsert_own"
  ON public.community_member_profiles
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "community_member_profiles_update_own"
  ON public.community_member_profiles
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
-- A member may declare org_type/role/sector/region for themselves but NEVER self-verify — `verified`,
-- `verified_at` and `verification_method` are set only by the service-role verification workflow. This
-- table has no per-column RLS (Postgres RLS is row-scoped, not column-scoped); the application route
-- that handles self-service profile edits MUST strip verified/verified_at/verification_method from a
-- member-originated PATCH before writing, and the service-role verification path is the only writer of
-- those three columns in practice — stated here so a future route author does not assume the DB enforces
-- it column-by-column.

CREATE POLICY "community_member_profiles_service_role"
  ON public.community_member_profiles
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Column-level lock on organisation_key: RLS is ROW-scoped, not column-scoped, so the broad
-- authenticated SELECT policy above would otherwise let any client SELECT organisation_key directly via
-- PostgREST even though it is meant to be server-derived-and-internal-only (see the column's own
-- comment). A NAIVE `REVOKE SELECT (organisation_key) ... FROM authenticated` is NOT sufficient here and
-- was proven wrong by this migration's own self-check during authoring: Postgres column-level privileges
-- are an ADDITIVE grant used only in the ABSENCE of a table-wide SELECT grant — once a role holds
-- table-wide SELECT (which `authenticated`/`anon` do, via the project's own default-privilege grant on
-- every new table), revoking one column's privilege has no effect, because the broader table-wide grant
-- still covers it. The only way to actually narrow what authenticated/anon can read is to REVOKE the
-- table-wide SELECT entirely and re-GRANT SELECT on an explicit column allowlist that omits
-- organisation_key.
REVOKE SELECT ON public.community_member_profiles FROM authenticated, anon;
GRANT SELECT (user_id, org_type, role, sector, region, verified, verified_at, verification_method, created_at, updated_at)
  ON public.community_member_profiles TO authenticated, anon;

-- ── 2. community_posts.origin_class ──────────────────────────────────────────────────────────────────
ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS origin_class text;

UPDATE public.community_posts SET origin_class = 'community' WHERE origin_class IS NULL;

ALTER TABLE public.community_posts
  ALTER COLUMN origin_class SET DEFAULT 'community',
  ALTER COLUMN origin_class SET NOT NULL;

ALTER TABLE public.community_posts
  ADD CONSTRAINT community_posts_origin_class_check
  CHECK (origin_class IN ('community', 'community-corroborated', 'modelled', 'derived', 'partner', 'verified', 'official'));

COMMENT ON COLUMN public.community_posts.origin_class IS
  'Spec 00 §3.6, spec 05 §4: same 7-value vocabulary as intelligence_items.origin_class (migration 267), '
  'owned by src/lib/contracts/vocabularies.mjs ORIGIN_CLASS. NOT NULL DEFAULT ''community'' — unlike '
  'other origin_class columns'' no-backfill posture (Addendum 26), every community_posts row IS '
  'community-origin by construction, so backfilling the default here is a correct classification, not a '
  'guess. Advances only via the promotion state machine (migration 295, src/lib/community/promotion.mjs '
  'originClassFor()) — community -> community-corroborated -> verified; under-review and retired '
  '(promotion_state values, migration 295) do NOT change this column, see that migration''s header.';

-- ── 3. community_thread_entities ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.community_thread_entities (
  thread_id   uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  entity_id   text NOT NULL REFERENCES public.entities(entity_id) ON DELETE CASCADE,
  entity_kind public.entity_kind,   -- denormalized for a filterable read without a join; NULL only if entities.kind changes after linking (entities rows are not hard-deleted, so this stays in sync in practice — see migration 282's header on retire/merge, never delete)
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, entity_id)
);

COMMENT ON TABLE public.community_thread_entities IS
  'Spec 05 §5 component 2 / §6 acceptance criterion 6: every community thread binds to at least one spine '
  'entity (corridor, jurisdiction, instrument, technology, organisation — migration 282''s entity_kind). '
  'Cardinality (>=1 per top-level thread) is enforced by the guard-enforced route '
  '(POST /api/community/posts), not a DB trigger — see this migration''s header for why. Only top-level '
  'posts (community_posts.parent_post_id IS NULL) are expected to carry a row here; a reply binds through '
  'its parent thread.';

CREATE INDEX IF NOT EXISTS idx_community_thread_entities_entity
  ON public.community_thread_entities (entity_id, thread_id);

ALTER TABLE public.community_thread_entities ENABLE ROW LEVEL SECURITY;

-- SELECT inherits the bound thread's own visibility (public group OR caller is a member) — identical
-- shape to community_posts_select_inherits_group (migration 030), joined one hop further.
CREATE POLICY "community_thread_entities_select_inherits_thread"
  ON public.community_thread_entities
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.community_posts p
      JOIN public.community_groups g ON g.id = p.group_id
      WHERE p.id = community_thread_entities.thread_id
        AND (
          g.privacy = 'public'
          OR EXISTS (
            SELECT 1 FROM public.community_group_members m
            WHERE m.group_id = g.id AND m.user_id = auth.uid()
          )
        )
    )
  );

-- INSERT: only the thread's own author, at the same time they create the post (the guard-enforced route
-- performs both writes as the authenticated caller, immediately after the community_posts insert it just
-- made — RLS on community_posts_insert_member already proved membership for that same request).
CREATE POLICY "community_thread_entities_insert_author"
  ON public.community_thread_entities
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.community_posts p
      WHERE p.id = community_thread_entities.thread_id
        AND p.author_user_id = auth.uid()
    )
  );

CREATE POLICY "community_thread_entities_service_role"
  ON public.community_thread_entities
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── Post-checks ──────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  n_cols int;
  n_unclassified int;
BEGIN
  SELECT count(*) INTO n_cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'community_posts' AND column_name = 'origin_class';
  IF n_cols <> 1 THEN
    RAISE EXCEPTION 'ABORT: community_posts.origin_class did not land (found % matching columns)', n_cols;
  END IF;

  SELECT count(*) INTO n_unclassified FROM public.community_posts WHERE origin_class IS NULL;
  IF n_unclassified <> 0 THEN
    RAISE EXCEPTION 'ABORT: % community_posts rows still have NULL origin_class after backfill', n_unclassified;
  END IF;

  IF to_regclass('public.community_member_profiles') IS NULL THEN
    RAISE EXCEPTION 'ABORT: community_member_profiles did not land';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.column_privileges
    WHERE table_schema = 'public' AND table_name = 'community_member_profiles'
      AND column_name = 'organisation_key' AND grantee = 'authenticated' AND privilege_type = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'ABORT: authenticated still holds SELECT on community_member_profiles.organisation_key after REVOKE';
  END IF;
  IF to_regclass('public.community_thread_entities') IS NULL THEN
    RAISE EXCEPTION 'ABORT: community_thread_entities did not land';
  END IF;

  RAISE NOTICE 'migration 293 OK: community_member_profiles (verified-pseudonymous identity), community_posts.origin_class (NOT NULL, backfilled ''community''), community_thread_entities (spine binding) all landed';
END $$;
