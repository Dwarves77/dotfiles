-- subject: Migration 362 (lane S8-D, 2026-10-07, NOT APPLIED; spec 00 section 5 "the portfolio", plan Stage 8 "portfolio", complete-build-plan L18). Adds `portfolios` (workspace-owned, many per org, name unique per org case-insensitively) and `portfolio_members` (one row per held item, corridor or other spine entity chosen into a portfolio; items by intelligence_items.id, corridors and entities by entities.entity_id). Org-scoped RLS on both, composite FK so a member can never carry a different org than its portfolio, immutable members (add or remove only), caps of 100 portfolios per org and 500 members per portfolio so every read stays bounded. The rolled-up figures a portfolio shows (counts per surface and band, nearest binding date, weakest origin class, the held-over-total denominator) are NEVER stored: they are computed at read time from held data only. A portfolio is a SELECTION of already-held items and entities (ADR-042: no customer-entered data; ADR-043: no typed input produces a result); the only typed text is its name. Ends in a self-check that ATTACKS the policies as two real orgs' members inside a rolled-back sub-transaction (cross-org read, forged author, cross-org write, cross-org member injection, org_id rewrite) and skips with a NOTICE when fewer than two orgs with disjoint members exist.
-- 362, portfolios + portfolio_members (lane S8-D, 2026-10-07). APPLIED (production ledger version 20261008022411, as of 2026-10-08).
--
-- WHY. Spec 00 section 5 (docs/specs/00-foundation-the-spine.md): "one 'my things' object across five
-- surfaces", heterogeneous and spine-typed, team-shareable, owned, multiple per user, "one object, not
-- five per-surface subscriptions". Spec 06 names its absence S-7 (P0). Spec 00 section 8 assertion 14:
-- adding an entity to a portfolio from any surface produces the same record. That is a UNIQUE
-- (portfolio, member) shape plus an idempotent add, both here.
--
-- WHAT A MEMBER IS.
--   member_kind = 'item'      -> item_id   references intelligence_items(id)   (ON DELETE CASCADE)
--   member_kind = 'corridor'  -> entity_id references entities(entity_id), id shaped cl:corridor:*
--   member_kind = 'entity'    -> entity_id references entities(entity_id), any other kind
-- Exactly one of item_id / entity_id is set, matching the kind (CHECK). Corridors are entities; the
-- separate kind exists so the highest-value proprietary entity (spec 00 section 1.2) is a first-class
-- member type and so a reader can group without joining entities.
--
-- OWNERSHIP AND SHARING. org_id is the workspace; created_by / added_by is the author. Every member of
-- the org reads, creates, renames and deletes portfolios and adds or removes members (the same posture
-- as workspace tags, migration 313, and org_watchlist, migration 077: team-shareable by default).
-- INSERT additionally requires the author column to equal auth.uid(), so an author cannot be forged.
--
-- WHAT RLS CANNOT DO ALONE, AND WHAT COVERS IT.
--   - A member row could name another org's portfolio id with its own org_id. The composite FK
--     (portfolio_id, org_id) -> portfolios(id, org_id) makes that impossible: the pair must exist.
--   - A portfolio update could try to move a portfolio to another org the caller also belongs to.
--     Column privileges: authenticated may UPDATE only `name`. org_id and created_by are fixed at insert.
--   - portfolio_members has no UPDATE policy and no UPDATE privilege for authenticated: a member is
--     added or removed, never edited.
--   The API routes use the service-role client and always filter by the caller's org resolved from
--   org_memberships on the server (never a client-supplied org_id), the same posture as /api/workspace/tags.
--   RLS is the second layer, proven below.
--
-- ROLL-UPS ARE NOT TABLES. Nothing here stores a count, a band or a class. src/lib/portfolio/portfolio-core.mjs
-- computes them per request from the held rows (verified, not archived), shows the held-over-total
-- denominator beside every aggregate (spec 00 section 8 assertion 13) and propagates the weakest origin
-- class (assertion 9). A portfolio member that is no longer held is counted in the denominator and named,
-- never silently dropped.
--
-- Idempotent (IF NOT EXISTS / OR REPLACE / DROP POLICY IF EXISTS throughout). Reversible:
--   DROP TABLE public.portfolio_members; DROP TABLE public.portfolios;
--   DROP FUNCTION public.portfolios_org_cap(); DROP FUNCTION public.portfolio_members_cap();
-- Both tables are new and empty at apply time, so the reversal loses nothing.
--
-- Migration two-track policy (CLAUDE.md standing rule 3): this is schema DDL. The coordinator applies it
-- BEFORE the dependent code (the routes and the /dashboard/portfolio pages) is exercised against live data.
-- The code reads fail-soft when the tables are absent (an empty state, never a crash).

BEGIN;

-- ── Preconditions ────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.organizations') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.organizations does not exist, migration 006 must be applied first';
  END IF;
  IF to_regclass('public.org_memberships') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.org_memberships does not exist, migration 006 must be applied first';
  END IF;
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.profiles does not exist';
  END IF;
  IF to_regclass('public.intelligence_items') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.intelligence_items does not exist';
  END IF;
  IF to_regclass('public.entities') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.entities does not exist, migration 282 must be applied first';
  END IF;
  PERFORM 1 FROM pg_proc WHERE proname = 'user_belongs_to_org';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ABORT: user_belongs_to_org() does not exist, migration 006 must be applied first';
  END IF;
END $$;

-- ── portfolios ───────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.portfolios (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name       text NOT NULL,
  name_key   text GENERATED ALWAYS AS (lower(btrim(name))) STORED,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT portfolios_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT portfolios_name_len CHECK (length(name) <= 80),
  -- The target of portfolio_members' composite FK: a member must carry its portfolio's own org.
  CONSTRAINT portfolios_id_org_uniq UNIQUE (id, org_id)
);

-- Names unique per workspace, case-insensitively (same rule as workspace tags, migration 313).
CREATE UNIQUE INDEX IF NOT EXISTS portfolios_org_name_key_uidx ON public.portfolios (org_id, name_key);

COMMENT ON TABLE public.portfolios IS
  'Workspace-owned "my things" selections (migration 362, spec 00 section 5). A selection of held items and spine entities, never customer-entered data (ADR-042). Roll-ups are computed at read time, never stored.';
COMMENT ON COLUMN public.portfolios.name_key IS
  'GENERATED lower(btrim(name)): case-insensitive uniqueness per org via portfolios_org_name_key_uidx.';

-- Cap: at most 100 portfolios per org, so the list read is bounded by design (F38).
CREATE OR REPLACE FUNCTION public.portfolios_org_cap() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  IF (SELECT count(*) FROM public.portfolios p WHERE p.org_id = NEW.org_id) >= 100 THEN
    RAISE EXCEPTION 'portfolio_cap_reached: a workspace holds at most 100 portfolios' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS portfolios_org_cap_trg ON public.portfolios;
CREATE TRIGGER portfolios_org_cap_trg BEFORE INSERT ON public.portfolios
  FOR EACH ROW EXECUTE FUNCTION public.portfolios_org_cap();

ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS portfolios_org_read ON public.portfolios;
CREATE POLICY portfolios_org_read ON public.portfolios FOR SELECT
  USING (public.user_belongs_to_org(org_id) OR auth.role() = 'service_role');

DROP POLICY IF EXISTS portfolios_org_insert ON public.portfolios;
CREATE POLICY portfolios_org_insert ON public.portfolios FOR INSERT
  WITH CHECK (
    (public.user_belongs_to_org(org_id) AND created_by = auth.uid())
    OR auth.role() = 'service_role'
  );

DROP POLICY IF EXISTS portfolios_org_update ON public.portfolios;
CREATE POLICY portfolios_org_update ON public.portfolios FOR UPDATE
  USING (public.user_belongs_to_org(org_id) OR auth.role() = 'service_role')
  WITH CHECK (public.user_belongs_to_org(org_id) OR auth.role() = 'service_role');

DROP POLICY IF EXISTS portfolios_org_delete ON public.portfolios;
CREATE POLICY portfolios_org_delete ON public.portfolios FOR DELETE
  USING (public.user_belongs_to_org(org_id) OR auth.role() = 'service_role');

-- A signed-in member may rename a portfolio and nothing else: org_id and created_by are fixed at insert.
REVOKE ALL ON public.portfolios FROM anon;
REVOKE UPDATE ON public.portfolios FROM authenticated;
GRANT UPDATE (name) ON public.portfolios TO authenticated;

-- ── portfolio_members ────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.portfolio_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL,
  org_id       uuid NOT NULL,
  member_kind  text NOT NULL,
  item_id      uuid REFERENCES public.intelligence_items(id) ON DELETE CASCADE,
  entity_id    text REFERENCES public.entities(entity_id),
  added_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  added_at     timestamptz NOT NULL DEFAULT now(),
  -- The pair must exist: a member cannot name another org's portfolio, whatever org_id it claims.
  CONSTRAINT portfolio_members_portfolio_fk FOREIGN KEY (portfolio_id, org_id)
    REFERENCES public.portfolios (id, org_id) ON DELETE CASCADE,
  CONSTRAINT portfolio_members_kind_check CHECK (member_kind IN ('item', 'corridor', 'entity')),
  CONSTRAINT portfolio_members_shape_check CHECK (
    (member_kind = 'item'     AND item_id IS NOT NULL AND entity_id IS NULL)
    OR (member_kind = 'corridor' AND item_id IS NULL AND entity_id LIKE 'cl:corridor:%')
    OR (member_kind = 'entity'   AND item_id IS NULL AND entity_id IS NOT NULL AND entity_id NOT LIKE 'cl:corridor:%')
  )
);

-- One row per (portfolio, member): adding the same thing twice from any surface is the same record.
CREATE UNIQUE INDEX IF NOT EXISTS portfolio_members_item_uidx
  ON public.portfolio_members (portfolio_id, item_id) WHERE item_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS portfolio_members_entity_uidx
  ON public.portfolio_members (portfolio_id, entity_id) WHERE entity_id IS NOT NULL;
-- "Which of my portfolios hold this?" from a detail page or a list row.
CREATE INDEX IF NOT EXISTS portfolio_members_org_item_idx
  ON public.portfolio_members (org_id, item_id) WHERE item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS portfolio_members_org_entity_idx
  ON public.portfolio_members (org_id, entity_id) WHERE entity_id IS NOT NULL;

COMMENT ON TABLE public.portfolio_members IS
  'One held item, corridor or spine entity chosen into a portfolio (migration 362). Immutable: added or removed, never edited. The composite FK to portfolios(id, org_id) pins the member to its portfolio''s org.';

-- Cap: at most 500 members per portfolio, so the member read is bounded by design (F38).
CREATE OR REPLACE FUNCTION public.portfolio_members_cap() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  IF (SELECT count(*) FROM public.portfolio_members m WHERE m.portfolio_id = NEW.portfolio_id) >= 500 THEN
    RAISE EXCEPTION 'portfolio_member_cap_reached: a portfolio holds at most 500 members' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS portfolio_members_cap_trg ON public.portfolio_members;
CREATE TRIGGER portfolio_members_cap_trg BEFORE INSERT ON public.portfolio_members
  FOR EACH ROW EXECUTE FUNCTION public.portfolio_members_cap();

ALTER TABLE public.portfolio_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS portfolio_members_org_read ON public.portfolio_members;
CREATE POLICY portfolio_members_org_read ON public.portfolio_members FOR SELECT
  USING (public.user_belongs_to_org(org_id) OR auth.role() = 'service_role');

DROP POLICY IF EXISTS portfolio_members_org_insert ON public.portfolio_members;
CREATE POLICY portfolio_members_org_insert ON public.portfolio_members FOR INSERT
  WITH CHECK (
    (public.user_belongs_to_org(org_id) AND added_by = auth.uid())
    OR auth.role() = 'service_role'
  );

DROP POLICY IF EXISTS portfolio_members_org_delete ON public.portfolio_members;
CREATE POLICY portfolio_members_org_delete ON public.portfolio_members FOR DELETE
  USING (public.user_belongs_to_org(org_id) OR auth.role() = 'service_role');

-- No UPDATE policy and no UPDATE privilege: a member is added or removed, never edited.
REVOKE ALL ON public.portfolio_members FROM anon;
REVOKE UPDATE ON public.portfolio_members FROM authenticated;

-- ── Structural post-check ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  n_policies int;
BEGIN
  IF to_regclass('public.portfolios') IS NULL THEN RAISE EXCEPTION 'ABORT: portfolios was not created'; END IF;
  IF to_regclass('public.portfolio_members') IS NULL THEN RAISE EXCEPTION 'ABORT: portfolio_members was not created'; END IF;
  SELECT count(*) INTO n_policies FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname IN (
        'portfolios_org_read', 'portfolios_org_insert', 'portfolios_org_update', 'portfolios_org_delete',
        'portfolio_members_org_read', 'portfolio_members_org_insert', 'portfolio_members_org_delete'
      );
  IF n_policies <> 7 THEN RAISE EXCEPTION 'ABORT: expected 7 portfolio policies, found %', n_policies; END IF;
END $$;

-- ── Self-check: ATTACK the policies as two real orgs' members, then roll everything back ──────────────
-- A presence check is necessary, never sufficient (CLAUDE.md standing rule 15). Fixtures are REAL rows
-- (two orgs that each have a member whose user belongs to neither the other org), never minted ones: a
-- migration cannot mint a profiles row (migration 311 learned this the hard way). Everything runs in a
-- sub-transaction that is always rolled back, so nothing persists. SKIPPED with a NOTICE, never faked,
-- when fewer than two such orgs exist.
DO $selfcheck$
DECLARE
  v_org_a   uuid;
  v_org_b   uuid;
  v_user_a  uuid;
  v_user_b  uuid;
  v_item    uuid;
  v_item2   uuid;
  v_ent     text;
  v_ent2    text;
  v_pa      uuid;
  v_pb      uuid;
  v_n       int;
  v_n2      int;
  v_n3      int;
  v_name    text;
  v_refused boolean;
BEGIN
  BEGIN
    SELECT m.org_id, m.user_id INTO v_org_a, v_user_a
      FROM public.org_memberships m ORDER BY m.org_id, m.created_at LIMIT 1;
    SELECT m.org_id, m.user_id INTO v_org_b, v_user_b
      FROM public.org_memberships m
     WHERE m.org_id <> v_org_a
       AND NOT EXISTS (SELECT 1 FROM public.org_memberships x WHERE x.org_id = v_org_a AND x.user_id = m.user_id)
       AND NOT EXISTS (SELECT 1 FROM public.org_memberships y WHERE y.org_id = m.org_id AND y.user_id = v_user_a)
     ORDER BY m.org_id, m.created_at LIMIT 1;
    IF v_org_a IS NULL OR v_org_b IS NULL THEN
      RAISE NOTICE '362 self-check: fewer than two orgs with disjoint members, skipped';
      RAISE EXCEPTION 'c362_selfcheck_rollback';
    END IF;
    SELECT i.id INTO v_item FROM public.intelligence_items i ORDER BY i.id LIMIT 1;
    SELECT e.entity_id INTO v_ent FROM public.entities e WHERE e.kind <> 'corridor' ORDER BY e.entity_id LIMIT 1;
    -- A second item and entity, read as the owner BEFORE any role switch, so a refusal below can only be the policy.
    SELECT i.id INTO v_item2 FROM public.intelligence_items i WHERE i.id <> v_item ORDER BY i.id LIMIT 1;
    SELECT e.entity_id INTO v_ent2 FROM public.entities e WHERE e.kind <> 'corridor' AND e.entity_id <> v_ent ORDER BY e.entity_id LIMIT 1;

    -- Fixtures, written as the migration owner (RLS does not apply to the owner).
    INSERT INTO public.portfolios (org_id, name, created_by)
      VALUES (v_org_a, 'zz selfcheck 362 org a', v_user_a) RETURNING id INTO v_pa;
    IF v_item IS NOT NULL THEN
      INSERT INTO public.portfolio_members (portfolio_id, org_id, member_kind, item_id, added_by)
        VALUES (v_pa, v_org_a, 'item', v_item, v_user_a);
    ELSIF v_ent IS NOT NULL THEN
      INSERT INTO public.portfolio_members (portfolio_id, org_id, member_kind, entity_id, added_by)
        VALUES (v_pa, v_org_a, 'entity', v_ent, v_user_a);
    END IF;
    SELECT count(*) INTO v_n2 FROM public.portfolio_members WHERE portfolio_id = v_pa;

    -- 1. Read isolation: org A's member sees its portfolio and members, org B's member sees none.
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO v_n FROM public.portfolios WHERE id = v_pa;
    RESET ROLE;
    IF v_n <> 1 THEN RAISE EXCEPTION '362 self-check FAILED: an org member could not read its own portfolio (saw %)', v_n; END IF;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO v_n FROM public.portfolio_members WHERE portfolio_id = v_pa;
    RESET ROLE;
    IF v_n <> v_n2 THEN RAISE EXCEPTION '362 self-check FAILED: an org member could not read its own members (saw % of %)', v_n, v_n2; END IF;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_b, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO v_n FROM public.portfolios WHERE id = v_pa;
    SELECT count(*) INTO v_n3 FROM public.portfolio_members WHERE portfolio_id = v_pa;
    RESET ROLE;
    IF v_n <> 0 THEN RAISE EXCEPTION '362 self-check FAILED: another org read a portfolio (saw %)', v_n; END IF;
    IF v_n3 <> 0 THEN RAISE EXCEPTION '362 self-check FAILED: another org read portfolio members (saw %)', v_n3; END IF;

    -- 2. Org B cannot create a portfolio inside org A.
    v_refused := false;
    BEGIN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_b, 'role', 'authenticated')::text, true);
      SET LOCAL ROLE authenticated;
      INSERT INTO public.portfolios (org_id, name, created_by) VALUES (v_org_a, 'zz selfcheck 362 forged org', v_user_b);
    EXCEPTION WHEN insufficient_privilege THEN v_refused := true;
    END;
    RESET ROLE;
    IF NOT v_refused THEN RAISE EXCEPTION '362 self-check FAILED: another org created a portfolio in this org'; END IF;

    -- 3. A forged author is refused; the honest insert in its own org is allowed (so the policy is not deny-all).
    v_refused := false;
    BEGIN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_b, 'role', 'authenticated')::text, true);
      SET LOCAL ROLE authenticated;
      INSERT INTO public.portfolios (org_id, name, created_by) VALUES (v_org_b, 'zz selfcheck 362 forged author', v_user_a);
    EXCEPTION WHEN insufficient_privilege THEN v_refused := true;
    END;
    RESET ROLE;
    IF NOT v_refused THEN RAISE EXCEPTION '362 self-check FAILED: a portfolio was created with a forged author'; END IF;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_b, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    INSERT INTO public.portfolios (org_id, name, created_by) VALUES (v_org_b, 'zz selfcheck 362 org b', v_user_b) RETURNING id INTO v_pb;
    RESET ROLE;
    IF v_pb IS NULL THEN RAISE EXCEPTION '362 self-check FAILED: an org member could not create its own portfolio'; END IF;

    -- 4. Member injection: org B cannot add a member to org A's portfolio, claiming either org.
    IF v_item IS NOT NULL OR v_ent IS NOT NULL THEN
      v_refused := false;
      BEGIN
        PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_b, 'role', 'authenticated')::text, true);
        SET LOCAL ROLE authenticated;
        IF v_item IS NOT NULL THEN
          INSERT INTO public.portfolio_members (portfolio_id, org_id, member_kind, item_id, added_by)
            VALUES (v_pa, v_org_a, 'item', v_item, v_user_b);
        ELSE
          INSERT INTO public.portfolio_members (portfolio_id, org_id, member_kind, entity_id, added_by)
            VALUES (v_pa, v_org_a, 'entity', v_ent, v_user_b);
        END IF;
      EXCEPTION WHEN insufficient_privilege THEN v_refused := true;
      END;
      RESET ROLE;
      IF NOT v_refused THEN RAISE EXCEPTION '362 self-check FAILED: another org added a member claiming the portfolio''s org'; END IF;

      v_refused := false;
      BEGIN
        PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_b, 'role', 'authenticated')::text, true);
        SET LOCAL ROLE authenticated;
        IF v_item IS NOT NULL THEN
          INSERT INTO public.portfolio_members (portfolio_id, org_id, member_kind, item_id, added_by)
            VALUES (v_pa, v_org_b, 'item', v_item, v_user_b);
        ELSE
          INSERT INTO public.portfolio_members (portfolio_id, org_id, member_kind, entity_id, added_by)
            VALUES (v_pa, v_org_b, 'entity', v_ent, v_user_b);
        END IF;
      EXCEPTION WHEN foreign_key_violation THEN v_refused := true;
      END;
      RESET ROLE;
      IF NOT v_refused THEN RAISE EXCEPTION '362 self-check FAILED: a member was injected into another org''s portfolio under its own org id'; END IF;

      -- A forged author inside the caller's own org is refused as well.
      v_refused := false;
      BEGIN
        PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a, 'role', 'authenticated')::text, true);
        SET LOCAL ROLE authenticated;
        IF v_item IS NOT NULL THEN
          INSERT INTO public.portfolio_members (portfolio_id, org_id, member_kind, item_id, added_by)
            VALUES (v_pa, v_org_a, 'item', COALESCE(v_item2, v_item), v_user_b);
        ELSE
          INSERT INTO public.portfolio_members (portfolio_id, org_id, member_kind, entity_id, added_by)
            VALUES (v_pa, v_org_a, 'entity', COALESCE(v_ent2, v_ent), v_user_b);
        END IF;
      EXCEPTION WHEN insufficient_privilege THEN v_refused := true;
      END;
      RESET ROLE;
      IF NOT v_refused THEN RAISE EXCEPTION '362 self-check FAILED: a member was added with a forged author'; END IF;

      -- Adding the same member twice is a unique violation (the add is idempotent in the API, one record).
      v_refused := false;
      BEGIN
        IF v_item IS NOT NULL THEN
          INSERT INTO public.portfolio_members (portfolio_id, org_id, member_kind, item_id, added_by)
            VALUES (v_pa, v_org_a, 'item', v_item, v_user_a);
        ELSE
          INSERT INTO public.portfolio_members (portfolio_id, org_id, member_kind, entity_id, added_by)
            VALUES (v_pa, v_org_a, 'entity', v_ent, v_user_a);
        END IF;
      EXCEPTION WHEN unique_violation THEN v_refused := true;
      END;
      IF NOT v_refused THEN RAISE EXCEPTION '362 self-check FAILED: the same member was added twice'; END IF;
    END IF;

    -- 5. Shape: a corridor member must carry a corridor id.
    v_refused := false;
    BEGIN
      INSERT INTO public.portfolio_members (portfolio_id, org_id, member_kind, entity_id, added_by)
        VALUES (v_pa, v_org_a, 'corridor', 'cl:org:zz362notacorridor', v_user_a);
    EXCEPTION WHEN check_violation THEN v_refused := true;
    END;
    IF NOT v_refused THEN RAISE EXCEPTION '362 self-check FAILED: a corridor member with a non-corridor id was accepted'; END IF;

    -- 6. Org B cannot rename, delete or empty org A's portfolio: the statements match zero rows.
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_b, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    UPDATE public.portfolios SET name = 'zz selfcheck 362 hijacked' WHERE id = v_pa;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RESET ROLE;
    IF v_n <> 0 THEN RAISE EXCEPTION '362 self-check FAILED: another org renamed a portfolio'; END IF;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_b, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    DELETE FROM public.portfolio_members WHERE portfolio_id = v_pa;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RESET ROLE;
    IF v_n <> 0 THEN RAISE EXCEPTION '362 self-check FAILED: another org deleted portfolio members'; END IF;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_b, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    DELETE FROM public.portfolios WHERE id = v_pa;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RESET ROLE;
    IF v_n <> 0 THEN RAISE EXCEPTION '362 self-check FAILED: another org deleted a portfolio'; END IF;
    SELECT name INTO v_name FROM public.portfolios WHERE id = v_pa;
    IF v_name IS DISTINCT FROM 'zz selfcheck 362 org a' THEN RAISE EXCEPTION '362 self-check FAILED: the portfolio did not survive the cross-org attack intact'; END IF;
    SELECT count(*) INTO v_n FROM public.portfolio_members WHERE portfolio_id = v_pa;
    IF v_n < v_n2 THEN RAISE EXCEPTION '362 self-check FAILED: portfolio members did not survive the cross-org attack'; END IF;

    -- 7. org_id cannot be rewritten, even by the owning org's own member; a rename is allowed.
    v_refused := false;
    BEGIN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a, 'role', 'authenticated')::text, true);
      SET LOCAL ROLE authenticated;
      UPDATE public.portfolios SET org_id = v_org_b WHERE id = v_pa;
    EXCEPTION WHEN insufficient_privilege THEN v_refused := true;
    END;
    RESET ROLE;
    IF NOT v_refused THEN RAISE EXCEPTION '362 self-check FAILED: a portfolio was moved to another org'; END IF;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    UPDATE public.portfolios SET name = 'zz selfcheck 362 renamed' WHERE id = v_pa;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RESET ROLE;
    IF v_n <> 1 THEN RAISE EXCEPTION '362 self-check FAILED: an org member could not rename its own portfolio'; END IF;

    -- 8. A member row is immutable: no UPDATE privilege for a signed-in user.
    IF v_item IS NOT NULL OR v_ent IS NOT NULL THEN
      v_refused := false;
      BEGIN
        PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a, 'role', 'authenticated')::text, true);
        SET LOCAL ROLE authenticated;
        UPDATE public.portfolio_members SET added_by = v_user_b WHERE portfolio_id = v_pa;
      EXCEPTION WHEN insufficient_privilege THEN v_refused := true;
      END;
      RESET ROLE;
      IF NOT v_refused THEN RAISE EXCEPTION '362 self-check FAILED: a portfolio member row was edited'; END IF;
    END IF;

    RAISE EXCEPTION 'c362_selfcheck_rollback';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'c362_selfcheck_rollback' THEN RAISE; END IF;
  END;
  RAISE NOTICE '362 self-check passed (fixtures rolled back)';
END
$selfcheck$;

COMMIT;
