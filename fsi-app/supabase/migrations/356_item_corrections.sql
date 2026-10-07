-- subject: Migration 356 (lane G7-CORR, 2026-10-06, plan Stage 7 correction layer, operator ruling: the admin can edit data quality when needed, never by default, and automatic writers respect an admin override): `item_corrections`, one append-only table holding every admin correction to item data (fact, tag, connection, section_text, full_brief) applied OVER the machine value; the DATABASE preserves corrections through every re-run (BEFORE INSERT OR UPDATE triggers on `intelligence_items`, `intelligence_item_sections`, `section_claim_provenance` call ONE apply function, a BEFORE INSERT trigger on `item_cross_references` holds connection tombstones); a fact `replace` must carry a span verbatim in a held capture (same rule as `validate_item_provenance` criterion 3, ADR-016) and is re-checked by the validator itself inside `create_item_correction`; `suppress` hides a claim from customer reads and never deletes it; NOT APPLIED. Sibling `item_correction_evidence` records the latest machine value a writer tried to store.
-- 356 -- item_corrections: the admin correction layer (lane G7-CORR, 2026-10-06).
--
-- NOT APPLIED. Authored by lane G7-CORR; the coordinator applies it (two-track policy, CLAUDE.md standing rule 3)
-- before the admin routes under src/app/api/admin/items/[id]/corrections/ are exercised. The readers that consult
-- the table (callers of src/lib/corrections/item-corrections.mjs) fail closed on a read error, so apply this
-- migration before deploying the code that reads it. Requires migrations 004 (item_cross_references), 103
-- (intelligence_item_sections), 112 (section_claim_provenance, agent_run_searches), 114/302 (validate_item_provenance,
-- validation_result), 146 (item_cross_references.origin), 264 (agent_run_searches.result_content), 277 (profiles-gated
-- admin read policy pattern).
--
-- DESIGN (coordinator, binding).
--   * ONE append-only table. A correction row is never updated except to set revoked_at / revoked_by /
--     revoked_reason. Active = revoked_at IS NULL. The LATEST active correction per (item_id, target_kind,
--     target_ref) wins (item_corrections_latest()).
--   * target_kind and the ops each kind allows (item_corrections_kind_op_chk):
--       fact          suppress | replace   target_ref = section_claim_provenance.id (uuid text)
--       tag           add | remove         target_ref = '<tag column>:<tag>' for topic_tags, operational_scenario_tags,
--                                          compliance_object_tags
--       connection    add | remove         target_ref = the OTHER item id (uuid text); add writes origin 'manual'
--       section_text  replace              target_ref = intelligence_item_sections.section_key, value {content_md}
--       full_brief    replace              target_ref = 'full_brief', value {text}
--     A fact `add` is not offered: a claim belongs to a section row and the validator requires its slot and label
--     context; an admin adds a fact by replacing the section text and re-running the ledger. Recorded, not hidden.
--   * PRESERVATION IS THE DATABASE'S JOB, not each writer's. item_corrections_patch() is the ONE apply rule. The
--     zz_item_corrections_apply_* BEFORE INSERT OR UPDATE triggers (named zz_ so they fire LAST among BEFORE triggers,
--     after every other trigger has shaped NEW) build a small jsonb of the machine columns being written, ask the
--     function for a patch, and merge it into NEW with jsonb_populate_record. A regeneration, a ledger apply, a heal
--     or a mint therefore cannot overwrite a correction, and no writer file changes.
--   * The machine value a writer tried to store is recorded in item_correction_evidence (latest_machine_value,
--     observed_count) so the admin screen can show what the machine now says. It is written only when the machine
--     value DIFFERED from what the correction enforces.
--   * FACTS follow ADR-016 and validate_item_provenance. A `replace` must carry source_span and search_result_id; the
--     span must be verbatim (lower(btrim(span)) contained in lower(agent_run_searches.result_content) for a capture of
--     THIS item), checked at insert by item_corrections_span_is_verbatim() (the same position() rule criterion 3
--     applies) and re-checked after the claim row is rewritten by calling validate_item_provenance() itself inside
--     create_item_correction(); a failure on the corrected claim raises and the whole call rolls back. `suppress` never
--     deletes: the read path (src/lib/detail/load-detail-core.ts fetchClaimTierMap) filters suppressed claims.
--     A fact correction matches its claim by id OR by the original machine claim_text (so a regeneration that
--     re-inserts the same claim under a new id is still corrected). A regeneration that CHANGES the claim text leaves
--     the correction unmatched; the admin list reports that, it is not hidden.
--   * CONNECTIONS. `remove` deletes the existing edge rows between the pair (both directions) and is a TOMBSTONE: the
--     BEFORE INSERT trigger on item_cross_references returns NULL (skips the row) for any non-manual edge whose pair's
--     latest active connection correction is a remove; write-edges, link-items and lineage-backfill also read the
--     tombstones (src/lib/corrections/item-corrections.mjs) so they plan around them and report skippedTombstoned.
--     `add` writes both directed rows with origin 'manual' and an admin_correction basis entry.
--   * TAGS. `remove` holds against apply-tags and propose-tags (the trigger strips the tag from any write, the two
--     scripts read the removals and skip). An admin tag edit touches the tag columns, which fires the existing
--     enqueue_corpus_turn_request trigger (migration 277); that is wanted.
--   * AUDIT. The table is the trail. intelligence_item_versions (migration 053) additionally snapshots the item row on
--     every changed full_brief or topic_tags value through its AFTER UPDATE trigger; no later migration drops it
--     (grep of supabase/migrations: only 053 names it), so it is live as far as the committed chain shows. It records
--     no actor, which is why item_corrections.created_by exists.
--   * REVOKE RESTORES (operator ruling 2026-10-06). revoke_item_correction sets revoked_at first, then, in the SAME
--     transaction and through the normal row write (so every trigger and the version snapshot see it), puts back the
--     latest machine value recorded in item_correction_evidence, or the machine_value captured at correction time when
--     the machine never wrote again. tag: the tag's membership is set to what the machine array had (an `add` is taken
--     out, a `remove` is put back); full_brief and section_text: the machine text; fact replace: the machine claim_text,
--     source_span, source_id and search_result_id; connection add: the pair's rows are replaced by the rows captured at
--     correction time (none, normally). A revoked connection `remove` does NOT re-create the edge; the next discovery
--     pass may. A revoked fact `suppress` needs no write (the read path stops hiding the claim at once). Corrections
--     still active on the same target are re-applied by the triggers as usual.
--   * SECURITY. RLS on, one profiles.is_platform_admin SELECT policy, no write policy; INSERT/UPDATE/DELETE revoked from
--     anon and authenticated. create_item_correction and revoke_item_correction are SECURITY DEFINER, execute granted to
--     service_role only; created_by is a parameter the admin route fills from the session, never from the request body.
--
-- SELF-CHECK. The final DO block attacks the layer on a real item and rolls everything back: each target_kind survives
-- a simulated regeneration write, a revoked correction RESTORES the machine value at once and lets the next machine
-- write stand, a non-verbatim fact span is refused, a tombstoned edge is not re-created by a machine insert, and the table refuses UPDATE of anything but
-- revoked_* and refuses DELETE. It skips (NOTICE) any step whose fixture row is absent.
--
-- Reversible: DROP TRIGGER zz_item_corrections_apply_items_trg ON public.intelligence_items; DROP TRIGGER
-- zz_item_corrections_apply_sections_trg ON public.intelligence_item_sections; DROP TRIGGER
-- zz_item_corrections_apply_claims_trg ON public.section_claim_provenance; DROP TRIGGER
-- item_corrections_block_tombstoned_edge_trg ON public.item_cross_references; then DROP the functions named below and
-- DROP TABLE public.item_correction_evidence, public.item_corrections.

BEGIN;

-- 1. The table -------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.item_corrections (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id        uuid        NOT NULL,
  target_kind    text        NOT NULL CHECK (target_kind IN ('fact', 'tag', 'connection', 'section_text', 'full_brief')),
  target_ref     text        NOT NULL CHECK (btrim(target_ref) <> ''),
  op             text        NOT NULL CHECK (op IN ('suppress', 'add', 'remove', 'replace')),
  value          jsonb,
  machine_value  jsonb,
  reason         text        NOT NULL CHECK (btrim(reason) <> ''),
  created_by     uuid        NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  revoked_at     timestamptz,
  revoked_by     uuid,
  revoked_reason text,
  CONSTRAINT item_corrections_kind_op_chk CHECK (
       (target_kind = 'fact'         AND op IN ('suppress', 'replace'))
    OR (target_kind = 'tag'          AND op IN ('add', 'remove'))
    OR (target_kind = 'connection'   AND op IN ('add', 'remove'))
    OR (target_kind = 'section_text' AND op = 'replace')
    OR (target_kind = 'full_brief'   AND op = 'replace')
  ),
  CONSTRAINT item_corrections_revoked_together_chk CHECK ((revoked_at IS NULL) = (revoked_by IS NULL))
);

COMMENT ON TABLE public.item_corrections IS
  'Migration 356. Append-only admin corrections to item data (fact, tag, connection, section_text, full_brief) applied over the machine value and preserved through re-runs by triggers. Active = revoked_at IS NULL; latest active per (item_id, target_kind, target_ref) wins. item_id is a soft reference (no FK) so the trail survives an item delete, same posture as claim_versions (migration 208).';

CREATE INDEX IF NOT EXISTS item_corrections_active_item_idx
  ON public.item_corrections (item_id, target_kind) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS item_corrections_item_created_idx
  ON public.item_corrections (item_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.item_correction_evidence (
  correction_id        uuid        PRIMARY KEY REFERENCES public.item_corrections(id),
  latest_machine_value jsonb,
  observed_at          timestamptz NOT NULL DEFAULT now(),
  observed_count       integer     NOT NULL DEFAULT 1
);

COMMENT ON TABLE public.item_correction_evidence IS
  'Migration 356. The latest machine value a writer tried to store where a correction overrode it (one row per correction, upserted by item_corrections_note()). Evidence for the admin screen; never read by a customer surface.';

-- 2. Append-only guard -----------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.item_corrections_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'item_corrections is append-only: a correction is revoked, never deleted'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'item_corrections is append-only: correction % is already revoked', OLD.id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.revoked_at IS NULL THEN
    RAISE EXCEPTION 'item_corrections is append-only: an UPDATE may only set revoked_at, revoked_by, revoked_reason'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (to_jsonb(NEW) - 'revoked_at' - 'revoked_by' - 'revoked_reason')
     IS DISTINCT FROM (to_jsonb(OLD) - 'revoked_at' - 'revoked_by' - 'revoked_reason') THEN
    RAISE EXCEPTION 'item_corrections is append-only: only revoked_at, revoked_by, revoked_reason may change'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS item_corrections_append_only_trg ON public.item_corrections;
CREATE TRIGGER item_corrections_append_only_trg
  BEFORE UPDATE OR DELETE ON public.item_corrections
  FOR EACH ROW EXECUTE FUNCTION public.item_corrections_append_only();

-- 3. Helpers ---------------------------------------------------------------------------------------------------------

-- Latest ACTIVE correction per target_ref for one item and one kind.
CREATE OR REPLACE FUNCTION public.item_corrections_latest(p_item_id uuid, p_kind text)
RETURNS SETOF public.item_corrections
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT DISTINCT ON (c.target_ref) c.*
    FROM public.item_corrections c
   WHERE c.item_id = p_item_id
     AND c.target_kind = p_kind
     AND c.revoked_at IS NULL
   ORDER BY c.target_ref, c.created_at DESC, c.id DESC;
$fn$;

-- The span is verbatim in a held capture of THIS item. The same containment rule validate_item_provenance criterion 3
-- applies (lower(btrim(span)) inside lower(agent_run_searches.result_content)), ADR-016.
CREATE OR REPLACE FUNCTION public.item_corrections_span_is_verbatim(p_item_id uuid, p_search_result_id uuid, p_span text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT p_span IS NOT NULL
     AND btrim(p_span) <> ''
     AND EXISTS (
       SELECT 1
         FROM public.agent_run_searches ars
        WHERE ars.id = p_search_result_id
          AND ars.intelligence_item_id = p_item_id
          AND ars.result_content IS NOT NULL
          AND position(lower(btrim(p_span)) IN lower(ars.result_content)) > 0
     );
$fn$;

-- Record the latest machine value a writer tried to store where a correction overrode it.
CREATE OR REPLACE FUNCTION public.item_corrections_note(p_correction_id uuid, p_machine_value jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  INSERT INTO public.item_correction_evidence AS e (correction_id, latest_machine_value)
  VALUES (p_correction_id, p_machine_value)
  ON CONFLICT (correction_id) DO UPDATE
     SET latest_machine_value = EXCLUDED.latest_machine_value,
         observed_at = now(),
         observed_count = e.observed_count + 1;
END;
$fn$;

-- True when the latest active connection correction between the pair (either direction) is a remove.
CREATE OR REPLACE FUNCTION public.item_corrections_pair_tombstoned(p_a uuid, p_b uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_op text;
BEGIN
  SELECT c.op INTO v_op
    FROM public.item_corrections c
   WHERE c.target_kind = 'connection'
     AND c.revoked_at IS NULL
     AND ((c.item_id = p_a AND c.target_ref = p_b::text) OR (c.item_id = p_b AND c.target_ref = p_a::text))
   ORDER BY c.created_at DESC, c.id DESC
   LIMIT 1;
  RETURN COALESCE(v_op = 'remove', false);
END;
$fn$;

-- 4. The ONE apply rule ----------------------------------------------------------------------------------------------
-- Input: the machine columns being written, as a small jsonb. Output: a jsonb patch holding ONLY the columns a
-- correction changed ('{}' when nothing changes). p_table is intelligence_items | intelligence_item_sections |
-- section_claim_provenance.
CREATE OR REPLACE FUNCTION public.item_corrections_patch(p_item_id uuid, p_table text, p_row jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_patch    jsonb := '{}'::jsonb;
  c          record;
  v_col      text;
  v_tag      text;
  v_cur      text[];
  v_new      text[];
  v_cols     text[] := ARRAY['topic_tags', 'operational_scenario_tags', 'compliance_object_tags'];
  v_enforced text;
BEGIN
  IF p_table = 'intelligence_items' THEN
    -- tags: remove strips the tag, add makes sure it is present.
    FOREACH v_col IN ARRAY v_cols LOOP
      IF p_row -> v_col IS NULL THEN CONTINUE; END IF;
      v_cur := ARRAY(
        SELECT jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(p_row -> v_col) = 'array' THEN p_row -> v_col ELSE '[]'::jsonb END));
      v_new := v_cur;
      FOR c IN
        SELECT * FROM public.item_corrections_latest(p_item_id, 'tag')
         WHERE split_part(target_ref, ':', 1) = v_col
         ORDER BY created_at, id
      LOOP
        v_tag := substr(c.target_ref, length(v_col) + 2);
        IF c.op = 'remove' THEN
          IF v_tag = ANY (v_cur) THEN
            PERFORM public.item_corrections_note(c.id, to_jsonb(v_cur));
          END IF;
          v_new := array_remove(v_new, v_tag);
        ELSIF c.op = 'add' THEN
          IF NOT (v_tag = ANY (v_cur)) THEN
            PERFORM public.item_corrections_note(c.id, to_jsonb(v_cur));
          END IF;
          IF NOT (v_tag = ANY (v_new)) THEN
            v_new := v_new || v_tag;
          END IF;
        END IF;
      END LOOP;
      IF v_new IS DISTINCT FROM v_cur THEN
        v_patch := v_patch || jsonb_build_object(v_col, to_jsonb(v_new));
      END IF;
    END LOOP;

    -- full_brief: replace enforces the corrected text.
    IF p_row -> 'full_brief' IS NOT NULL THEN
      SELECT * INTO c FROM public.item_corrections_latest(p_item_id, 'full_brief') LIMIT 1;
      IF FOUND AND c.op = 'replace' THEN
        v_enforced := c.value ->> 'text';
        IF v_enforced IS NOT NULL AND (p_row ->> 'full_brief') IS DISTINCT FROM v_enforced THEN
          PERFORM public.item_corrections_note(c.id, p_row -> 'full_brief');
          v_patch := v_patch || jsonb_build_object('full_brief', v_enforced);
        END IF;
      END IF;
    END IF;

  ELSIF p_table = 'intelligence_item_sections' THEN
    SELECT * INTO c FROM public.item_corrections_latest(p_item_id, 'section_text')
     WHERE target_ref = (p_row ->> 'section_key') LIMIT 1;
    IF FOUND AND c.op = 'replace' THEN
      v_enforced := c.value ->> 'content_md';
      IF v_enforced IS NOT NULL AND (p_row ->> 'content_md') IS DISTINCT FROM v_enforced THEN
        PERFORM public.item_corrections_note(c.id, p_row -> 'content_md');
        v_patch := v_patch || jsonb_build_object('content_md', v_enforced);
      END IF;
    END IF;

  ELSIF p_table = 'section_claim_provenance' THEN
    -- a claim matches by id OR by the original machine claim_text, so a regeneration that re-inserts the same
    -- claim under a new id is still corrected. Oldest first, so the latest matching correction wins.
    FOR c IN
      SELECT * FROM public.item_corrections_latest(p_item_id, 'fact')
       WHERE op = 'replace'
         AND (target_ref = (p_row ->> 'id')
              OR (machine_value ->> 'claim_text') = (p_row ->> 'claim_text'))
       ORDER BY created_at, id
    LOOP
      IF (c.value ->> 'source_span') IS DISTINCT FROM (p_row ->> 'source_span')
         OR (c.value ->> 'search_result_id') IS DISTINCT FROM (p_row ->> 'search_result_id')
         OR (c.value -> 'claim_text' IS NOT NULL AND (c.value ->> 'claim_text') IS DISTINCT FROM (p_row ->> 'claim_text'))
         OR (c.value -> 'source_id' IS NOT NULL AND (c.value ->> 'source_id') IS DISTINCT FROM (p_row ->> 'source_id'))
      THEN
        PERFORM public.item_corrections_note(c.id, p_row);
      END IF;
      v_patch := v_patch || jsonb_build_object(
        'source_span', c.value ->> 'source_span',
        'search_result_id', c.value ->> 'search_result_id');
      IF c.value -> 'claim_text' IS NOT NULL THEN
        v_patch := v_patch || jsonb_build_object('claim_text', c.value ->> 'claim_text');
      END IF;
      IF c.value -> 'source_id' IS NOT NULL THEN
        v_patch := v_patch || jsonb_build_object('source_id', c.value ->> 'source_id');
      END IF;
    END LOOP;
  END IF;

  RETURN v_patch;
END;
$fn$;

-- 5. Validate and capture on insert ----------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.item_corrections_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_col    text;
  v_tag    text;
  v_mv     jsonb;
  v_target uuid;
  v_claim  record;
  v_sr     uuid;
  v_span   text;
BEGIN
  IF NEW.revoked_at IS NOT NULL OR NEW.revoked_by IS NOT NULL OR NEW.revoked_reason IS NOT NULL THEN
    RAISE EXCEPTION 'correction_insert_must_be_active: a correction is inserted active and revoked later';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.intelligence_items i WHERE i.id = NEW.item_id) THEN
    RAISE EXCEPTION 'correction_item_not_found: item % does not exist', NEW.item_id;
  END IF;

  IF NEW.target_kind = 'tag' THEN
    v_col := split_part(NEW.target_ref, ':', 1);
    v_tag := substr(NEW.target_ref, length(v_col) + 2);
    IF v_col NOT IN ('topic_tags', 'operational_scenario_tags', 'compliance_object_tags') OR btrim(v_tag) = '' THEN
      RAISE EXCEPTION 'correction_tag_ref_invalid: target_ref must be <topic_tags|operational_scenario_tags|compliance_object_tags>:<tag>, got %', NEW.target_ref;
    END IF;
    EXECUTE format('SELECT to_jsonb(%I) FROM public.intelligence_items WHERE id = $1', v_col)
      INTO v_mv USING NEW.item_id;

  ELSIF NEW.target_kind = 'full_brief' THEN
    IF NEW.target_ref <> 'full_brief' THEN
      RAISE EXCEPTION 'correction_full_brief_ref_invalid: target_ref must be full_brief';
    END IF;
    IF NEW.value IS NULL OR btrim(COALESCE(NEW.value ->> 'text', '')) = '' THEN
      RAISE EXCEPTION 'correction_value_invalid: a full_brief replace needs value {"text": "<non-empty brief>"}';
    END IF;
    SELECT to_jsonb(i.full_brief) INTO v_mv FROM public.intelligence_items i WHERE i.id = NEW.item_id;

  ELSIF NEW.target_kind = 'section_text' THEN
    IF NEW.value IS NULL OR btrim(COALESCE(NEW.value ->> 'content_md', '')) = '' THEN
      RAISE EXCEPTION 'correction_value_invalid: a section_text replace needs value {"content_md": "<non-empty text>"}';
    END IF;
    SELECT to_jsonb(s.content_md) INTO v_mv
      FROM public.intelligence_item_sections s
     WHERE s.item_id = NEW.item_id AND s.section_key = NEW.target_ref;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'correction_section_not_found: item % has no section %', NEW.item_id, NEW.target_ref;
    END IF;

  ELSIF NEW.target_kind = 'fact' THEN
    BEGIN
      v_target := NEW.target_ref::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'correction_fact_ref_invalid: target_ref must be a section_claim_provenance id, got %', NEW.target_ref;
    END;
    SELECT scp.claim_text, scp.claim_kind, scp.source_span, scp.source_id, scp.search_result_id
      INTO v_claim
      FROM public.section_claim_provenance scp
     WHERE scp.id = v_target AND scp.intelligence_item_id = NEW.item_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'correction_claim_not_found: item % has no claim %', NEW.item_id, NEW.target_ref;
    END IF;
    v_mv := jsonb_build_object(
      'claim_text', v_claim.claim_text,
      'claim_kind', v_claim.claim_kind,
      'source_span', v_claim.source_span,
      'source_id', v_claim.source_id,
      'search_result_id', v_claim.search_result_id);
    IF NEW.op = 'replace' THEN
      IF v_claim.claim_kind <> 'FACT' THEN
        RAISE EXCEPTION 'correction_fact_not_a_fact_claim: claim % is %, only a FACT claim takes a replace', NEW.target_ref, v_claim.claim_kind;
      END IF;
      IF NEW.value IS NULL OR btrim(COALESCE(NEW.value ->> 'source_span', '')) = '' OR (NEW.value ->> 'search_result_id') IS NULL THEN
        RAISE EXCEPTION 'correction_fact_needs_span: a fact replace needs value {"source_span", "search_result_id"} (ADR-016)';
      END IF;
      IF NEW.value -> 'claim_text' IS NOT NULL AND btrim(COALESCE(NEW.value ->> 'claim_text', '')) = '' THEN
        RAISE EXCEPTION 'correction_value_invalid: claim_text, when given, must be non-empty';
      END IF;
      BEGIN
        v_sr := (NEW.value ->> 'search_result_id')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'correction_fact_needs_span: search_result_id must be a uuid';
      END;
      v_span := NEW.value ->> 'source_span';
      IF NOT public.item_corrections_span_is_verbatim(NEW.item_id, v_sr, v_span) THEN
        RAISE EXCEPTION 'correction_fact_span_not_verbatim: the span is not verbatim in a held capture of item % (ADR-016, validate_item_provenance criterion 3)', NEW.item_id;
      END IF;
      IF NEW.value -> 'source_id' IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM public.sources s WHERE s.id::text = (NEW.value ->> 'source_id')) THEN
        RAISE EXCEPTION 'correction_value_invalid: source_id % is not a registered source', NEW.value ->> 'source_id';
      END IF;
    END IF;

  ELSIF NEW.target_kind = 'connection' THEN
    BEGIN
      v_target := NEW.target_ref::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'correction_connection_ref_invalid: target_ref must be the other item id, got %', NEW.target_ref;
    END;
    IF v_target = NEW.item_id THEN
      RAISE EXCEPTION 'correction_connection_ref_invalid: an item cannot connect to itself';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.intelligence_items i WHERE i.id = v_target) THEN
      RAISE EXCEPTION 'correction_item_not_found: connection target % does not exist', v_target;
    END IF;
    IF NEW.op = 'add' AND NEW.value -> 'relationship' IS NOT NULL
       AND (NEW.value ->> 'relationship') NOT IN ('related', 'supersedes', 'implements', 'conflicts', 'amends', 'depends_on') THEN
      RAISE EXCEPTION 'correction_value_invalid: relationship % is not in the edge vocabulary', NEW.value ->> 'relationship';
    END IF;
    SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb) INTO v_mv
      FROM public.item_cross_references x
     WHERE (x.source_item_id = NEW.item_id AND x.target_item_id = v_target)
        OR (x.source_item_id = v_target AND x.target_item_id = NEW.item_id);
  END IF;

  NEW.machine_value := v_mv;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS item_corrections_before_insert_trg ON public.item_corrections;
CREATE TRIGGER item_corrections_before_insert_trg
  BEFORE INSERT ON public.item_corrections
  FOR EACH ROW EXECUTE FUNCTION public.item_corrections_before_insert();

-- 6. The preservation triggers ---------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.item_corrections_apply_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_patch jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.item_corrections c
     WHERE c.item_id = NEW.id AND c.revoked_at IS NULL AND c.target_kind IN ('tag', 'full_brief')
  ) THEN
    RETURN NEW;
  END IF;
  v_patch := public.item_corrections_patch(NEW.id, 'intelligence_items', jsonb_build_object(
    'topic_tags', to_jsonb(NEW.topic_tags),
    'operational_scenario_tags', to_jsonb(NEW.operational_scenario_tags),
    'compliance_object_tags', to_jsonb(NEW.compliance_object_tags),
    'full_brief', to_jsonb(NEW.full_brief)));
  IF v_patch <> '{}'::jsonb THEN
    NEW := jsonb_populate_record(NEW, v_patch);
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.item_corrections_apply_sections()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_patch jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.item_corrections c
     WHERE c.item_id = NEW.item_id AND c.revoked_at IS NULL AND c.target_kind = 'section_text'
  ) THEN
    RETURN NEW;
  END IF;
  v_patch := public.item_corrections_patch(NEW.item_id, 'intelligence_item_sections', jsonb_build_object(
    'section_key', NEW.section_key,
    'content_md', NEW.content_md));
  IF v_patch <> '{}'::jsonb THEN
    NEW := jsonb_populate_record(NEW, v_patch);
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.item_corrections_apply_claims()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_patch jsonb;
BEGIN
  IF NEW.intelligence_item_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.item_corrections c
     WHERE c.item_id = NEW.intelligence_item_id AND c.revoked_at IS NULL AND c.target_kind = 'fact'
  ) THEN
    RETURN NEW;
  END IF;
  v_patch := public.item_corrections_patch(NEW.intelligence_item_id, 'section_claim_provenance', jsonb_build_object(
    'id', NEW.id,
    'claim_text', NEW.claim_text,
    'source_span', NEW.source_span,
    'source_id', NEW.source_id,
    'search_result_id', NEW.search_result_id));
  IF v_patch <> '{}'::jsonb THEN
    NEW := jsonb_populate_record(NEW, v_patch);
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.item_corrections_block_tombstoned_edge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  -- a manual edge is an admin act and is never blocked; every other origin is skipped when the pair is tombstoned
  IF NEW.origin IS DISTINCT FROM 'manual'
     AND public.item_corrections_pair_tombstoned(NEW.source_item_id, NEW.target_item_id) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS zz_item_corrections_apply_items_trg ON public.intelligence_items;
CREATE TRIGGER zz_item_corrections_apply_items_trg
  BEFORE INSERT OR UPDATE ON public.intelligence_items
  FOR EACH ROW EXECUTE FUNCTION public.item_corrections_apply_items();

DROP TRIGGER IF EXISTS zz_item_corrections_apply_sections_trg ON public.intelligence_item_sections;
CREATE TRIGGER zz_item_corrections_apply_sections_trg
  BEFORE INSERT OR UPDATE ON public.intelligence_item_sections
  FOR EACH ROW EXECUTE FUNCTION public.item_corrections_apply_sections();

DROP TRIGGER IF EXISTS zz_item_corrections_apply_claims_trg ON public.section_claim_provenance;
CREATE TRIGGER zz_item_corrections_apply_claims_trg
  BEFORE INSERT OR UPDATE ON public.section_claim_provenance
  FOR EACH ROW EXECUTE FUNCTION public.item_corrections_apply_claims();

DROP TRIGGER IF EXISTS item_corrections_block_tombstoned_edge_trg ON public.item_cross_references;
CREATE TRIGGER item_corrections_block_tombstoned_edge_trg
  BEFORE INSERT ON public.item_cross_references
  FOR EACH ROW EXECUTE FUNCTION public.item_corrections_block_tombstoned_edge();

-- 7. The two entry points the admin routes call ----------------------------------------------------------------------
-- create_item_correction inserts the correction (the BEFORE INSERT trigger validates it and captures machine_value)
-- and then applies it NOW by touching the target row at top level of this call, so every other trigger (provenance
-- re-derivation, the corpus-turn enqueue, the version snapshot) fires exactly as for any other write.
CREATE OR REPLACE FUNCTION public.create_item_correction(
  p_item_id     uuid,
  p_target_kind text,
  p_target_ref  text,
  p_op          text,
  p_value       jsonb,
  p_reason      text,
  p_created_by  uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_id         uuid;
  v_ref        text := btrim(p_target_ref);
  v_claim_text text;
  v_res        public.validation_result;
  v_target     uuid;
  v_rel        text;
BEGIN
  IF p_created_by IS NULL THEN
    RAISE EXCEPTION 'correction_actor_required: created_by is required';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'correction_reason_required: a reason is required';
  END IF;

  INSERT INTO public.item_corrections (item_id, target_kind, target_ref, op, value, reason, created_by)
  VALUES (p_item_id, p_target_kind, v_ref, p_op, p_value, btrim(p_reason), p_created_by)
  RETURNING id INTO v_id;

  IF p_target_kind = 'tag' THEN
    UPDATE public.intelligence_items SET topic_tags = topic_tags WHERE id = p_item_id;
  ELSIF p_target_kind = 'full_brief' THEN
    UPDATE public.intelligence_items SET full_brief = full_brief WHERE id = p_item_id;
  ELSIF p_target_kind = 'section_text' THEN
    UPDATE public.intelligence_item_sections SET content_md = content_md
     WHERE item_id = p_item_id AND section_key = v_ref;
  ELSIF p_target_kind = 'fact' AND p_op = 'replace' THEN
    UPDATE public.section_claim_provenance SET claim_text = claim_text
     WHERE id = v_ref::uuid
    RETURNING claim_text INTO v_claim_text;
    v_res := public.validate_item_provenance(p_item_id);
    IF v_res.failures IS NOT NULL AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_res.failures) f
       WHERE f ->> 'reason' IN ('fact_missing_source_span', 'fact_span_not_in_source')
         AND f ->> 'claim' = v_claim_text
    ) THEN
      RAISE EXCEPTION 'correction_fact_failed_validation: validate_item_provenance rejects the corrected claim on item %', p_item_id;
    END IF;
  ELSIF p_target_kind = 'connection' THEN
    v_target := v_ref::uuid;
    IF p_op = 'remove' THEN
      DELETE FROM public.item_cross_references
       WHERE (source_item_id = p_item_id AND target_item_id = v_target)
          OR (source_item_id = v_target AND target_item_id = p_item_id);
    ELSE
      v_rel := COALESCE(NULLIF(p_value ->> 'relationship', ''), 'related');
      INSERT INTO public.item_cross_references (source_item_id, target_item_id, relationship, origin, basis, score)
      SELECT pairs.a, pairs.b, v_rel, 'manual',
             jsonb_build_array(jsonb_build_object('signal', 'admin_correction', 'detail', btrim(p_reason), 'weight', 1)),
             1
        FROM (VALUES (p_item_id, v_target), (v_target, p_item_id)) AS pairs(a, b)
      ON CONFLICT (source_item_id, target_item_id) DO UPDATE
         SET relationship = EXCLUDED.relationship,
             origin = 'manual',
             basis = EXCLUDED.basis,
             score = EXCLUDED.score;
    END IF;
  END IF;

  RETURN v_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.revoke_item_correction(
  p_item_id        uuid,
  p_correction_id  uuid,
  p_revoked_by     uuid,
  p_reason         text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  c            public.item_corrections;
  v_has_ev     boolean;
  v_ev         jsonb;
  v_mv         jsonb;
  v_col        text;
  v_tag        text;
  v_cur        text[];
  v_new        text[];
  v_in_machine boolean;
  v_target     uuid;
BEGIN
  IF p_revoked_by IS NULL THEN
    RAISE EXCEPTION 'correction_actor_required: revoked_by is required';
  END IF;

  UPDATE public.item_corrections
     SET revoked_at = now(),
         revoked_by = p_revoked_by,
         revoked_reason = NULLIF(btrim(COALESCE(p_reason, '')), '')
   WHERE id = p_correction_id AND item_id = p_item_id AND revoked_at IS NULL
  RETURNING * INTO c;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'correction_not_active: no active correction % on item %', p_correction_id, p_item_id;
  END IF;

  -- The value to put back: the latest machine value a writer tried to store, else the value captured at write.
  SELECT true, e.latest_machine_value INTO v_has_ev, v_ev
    FROM public.item_correction_evidence e WHERE e.correction_id = c.id;
  IF COALESCE(v_has_ev, false) THEN v_mv := v_ev; ELSE v_mv := c.machine_value; END IF;

  IF c.target_kind = 'tag' THEN
    v_col := split_part(c.target_ref, ':', 1);
    v_tag := substr(c.target_ref, length(v_col) + 2);
    EXECUTE format('SELECT %I FROM public.intelligence_items WHERE id = $1', v_col) INTO v_cur USING c.item_id;
    v_cur := COALESCE(v_cur, ARRAY[]::text[]);
    v_in_machine := v_tag = ANY (ARRAY(
      SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_mv) = 'array' THEN v_mv ELSE '[]'::jsonb END)));
    v_new := NULL;
    IF v_in_machine AND NOT (v_tag = ANY (v_cur)) THEN
      v_new := v_cur || v_tag;
    ELSIF NOT v_in_machine AND v_tag = ANY (v_cur) THEN
      v_new := array_remove(v_cur, v_tag);
    END IF;
    IF v_new IS NOT NULL THEN
      EXECUTE format('UPDATE public.intelligence_items SET %I = $1 WHERE id = $2', v_col) USING v_new, c.item_id;
    END IF;

  ELSIF c.target_kind = 'full_brief' THEN
    UPDATE public.intelligence_items SET full_brief = (v_mv #>> '{}') WHERE id = c.item_id;

  ELSIF c.target_kind = 'section_text' THEN
    IF v_mv IS NOT NULL THEN
      UPDATE public.intelligence_item_sections SET content_md = (v_mv #>> '{}')
       WHERE item_id = c.item_id AND section_key = c.target_ref;
    END IF;

  ELSIF c.target_kind = 'fact' AND c.op = 'replace' THEN
    v_target := c.target_ref::uuid;
    UPDATE public.section_claim_provenance
       SET claim_text = COALESCE(v_mv ->> 'claim_text', claim_text),
           source_span = v_mv ->> 'source_span',
           source_id = NULLIF(v_mv ->> 'source_id', '')::uuid,
           search_result_id = NULLIF(v_mv ->> 'search_result_id', '')::uuid
     WHERE id = v_target AND intelligence_item_id = c.item_id;

  ELSIF c.target_kind = 'connection' AND c.op = 'add' THEN
    v_target := c.target_ref::uuid;
    DELETE FROM public.item_cross_references
     WHERE (source_item_id = c.item_id AND target_item_id = v_target)
        OR (source_item_id = v_target AND target_item_id = c.item_id);
    INSERT INTO public.item_cross_references
    SELECT * FROM jsonb_populate_recordset(NULL::public.item_cross_references, COALESCE(c.machine_value, '[]'::jsonb))
    ON CONFLICT (source_item_id, target_item_id) DO NOTHING;
  END IF;
  -- connection remove: the edge is NOT re-created here; fact suppress: nothing was written, nothing to restore.
END;
$fn$;

REVOKE ALL ON FUNCTION public.create_item_correction(uuid, text, text, text, jsonb, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_item_correction(uuid, text, text, text, jsonb, text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.revoke_item_correction(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_item_correction(uuid, uuid, uuid, text) TO service_role;

-- 8. RLS: admin read through the policy, every write through the service path only ------------------------------------
ALTER TABLE public.item_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_correction_evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS item_corrections_admin_read ON public.item_corrections;
CREATE POLICY item_corrections_admin_read ON public.item_corrections
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_platform_admin = true));

DROP POLICY IF EXISTS item_correction_evidence_admin_read ON public.item_correction_evidence;
CREATE POLICY item_correction_evidence_admin_read ON public.item_correction_evidence
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_platform_admin = true));

REVOKE INSERT, UPDATE, DELETE ON public.item_corrections FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.item_correction_evidence FROM anon, authenticated;

-- 9. Self-check: attack the layer on a real item and roll everything back -------------------------------------------
DO $selfcheck$
DECLARE
  v_actor   constant uuid := '00000000-0000-0000-0000-000000000356';
  v_item    uuid;
  v_peer    uuid;
  v_sec     record;
  v_fact    record;
  v_cid     uuid;
  v_add_cid uuid;
  v_arr     text[];
  v_txt     text;
  v_n       int;
  v_refused boolean;
BEGIN
  BEGIN
    SELECT i.id INTO v_item FROM public.intelligence_items i ORDER BY i.id LIMIT 1;
    SELECT i.id INTO v_peer FROM public.intelligence_items i WHERE i.id <> v_item ORDER BY i.id LIMIT 1;
    IF v_item IS NULL THEN
      RAISE NOTICE '356 self-check: no intelligence_items row, skipped';
      RAISE EXCEPTION 'c356_selfcheck_rollback';
    END IF;

    -- tag add survives a machine write that omits it
    v_add_cid := public.create_item_correction(v_item, 'tag', 'operational_scenario_tags:zz_selfcheck_added', 'add', NULL, 'selfcheck', v_actor);
    SELECT operational_scenario_tags INTO v_arr FROM public.intelligence_items WHERE id = v_item;
    IF NOT ('zz_selfcheck_added' = ANY (COALESCE(v_arr, ARRAY[]::text[]))) THEN
      RAISE EXCEPTION '356 self-check FAILED: a tag add was not applied at create time';
    END IF;
    UPDATE public.intelligence_items SET operational_scenario_tags = ARRAY[]::text[] WHERE id = v_item;
    SELECT operational_scenario_tags INTO v_arr FROM public.intelligence_items WHERE id = v_item;
    IF NOT ('zz_selfcheck_added' = ANY (COALESCE(v_arr, ARRAY[]::text[]))) THEN
      RAISE EXCEPTION '356 self-check FAILED: a tag add did not survive a machine write that omitted it';
    END IF;

    -- tag remove holds against a machine write that re-adds it, and a revoke lets the next machine write stand
    UPDATE public.intelligence_items SET operational_scenario_tags = ARRAY['zz_selfcheck_removed']::text[] WHERE id = v_item;
    v_cid := public.create_item_correction(v_item, 'tag', 'operational_scenario_tags:zz_selfcheck_removed', 'remove', NULL, 'selfcheck', v_actor);
    UPDATE public.intelligence_items SET operational_scenario_tags = ARRAY['zz_selfcheck_removed']::text[] WHERE id = v_item;
    SELECT operational_scenario_tags INTO v_arr FROM public.intelligence_items WHERE id = v_item;
    IF 'zz_selfcheck_removed' = ANY (COALESCE(v_arr, ARRAY[]::text[])) THEN
      RAISE EXCEPTION '356 self-check FAILED: a removed tag survived a machine write that re-added it';
    END IF;
    PERFORM public.revoke_item_correction(v_item, v_cid, v_actor, 'selfcheck');
    SELECT operational_scenario_tags INTO v_arr FROM public.intelligence_items WHERE id = v_item;
    IF NOT ('zz_selfcheck_removed' = ANY (COALESCE(v_arr, ARRAY[]::text[]))) THEN
      RAISE EXCEPTION '356 self-check FAILED: revoking a tag remove did not put the machine tag back';
    END IF;
    UPDATE public.intelligence_items SET operational_scenario_tags = ARRAY['zz_selfcheck_removed']::text[] WHERE id = v_item;
    SELECT operational_scenario_tags INTO v_arr FROM public.intelligence_items WHERE id = v_item;
    IF NOT ('zz_selfcheck_removed' = ANY (COALESCE(v_arr, ARRAY[]::text[]))) THEN
      RAISE EXCEPTION '356 self-check FAILED: a revoked tag correction still blocked the next machine write';
    END IF;
    -- revoking the earlier tag ADD takes the added tag back out (the machine array never had it)
    PERFORM public.revoke_item_correction(v_item, v_add_cid, v_actor, 'selfcheck');
    SELECT operational_scenario_tags INTO v_arr FROM public.intelligence_items WHERE id = v_item;
    IF 'zz_selfcheck_added' = ANY (COALESCE(v_arr, ARRAY[]::text[])) THEN
      RAISE EXCEPTION '356 self-check FAILED: revoking a tag add did not take the added tag back out';
    END IF;

    -- full_brief replace survives a machine write
    v_cid := public.create_item_correction(v_item, 'full_brief', 'full_brief', 'replace', jsonb_build_object('text', 'zz selfcheck brief'), 'selfcheck', v_actor);
    UPDATE public.intelligence_items SET full_brief = 'machine regeneration text' WHERE id = v_item;
    SELECT full_brief INTO v_txt FROM public.intelligence_items WHERE id = v_item;
    IF v_txt IS DISTINCT FROM 'zz selfcheck brief' THEN
      RAISE EXCEPTION '356 self-check FAILED: a full_brief correction did not survive a machine write';
    END IF;
    PERFORM public.revoke_item_correction(v_item, v_cid, v_actor, 'selfcheck');
    SELECT full_brief INTO v_txt FROM public.intelligence_items WHERE id = v_item;
    IF v_txt IS DISTINCT FROM 'machine regeneration text' THEN
      RAISE EXCEPTION '356 self-check FAILED: revoking a full_brief correction did not restore the machine brief';
    END IF;
    UPDATE public.intelligence_items SET full_brief = 'machine regeneration text' WHERE id = v_item;
    SELECT full_brief INTO v_txt FROM public.intelligence_items WHERE id = v_item;
    IF v_txt IS DISTINCT FROM 'machine regeneration text' THEN
      RAISE EXCEPTION '356 self-check FAILED: a revoked full_brief correction still blocked the next machine write';
    END IF;

    -- section_text replace survives a machine write
    SELECT s.item_id, s.section_key, s.content_md INTO v_sec
      FROM public.intelligence_item_sections s ORDER BY s.item_id, s.section_key LIMIT 1;
    IF v_sec.item_id IS NULL THEN
      RAISE NOTICE '356 self-check: no intelligence_item_sections row, section_text step skipped';
    ELSE
      v_cid := public.create_item_correction(v_sec.item_id, 'section_text', v_sec.section_key, 'replace', jsonb_build_object('content_md', 'zz selfcheck section'), 'selfcheck', v_actor);
      UPDATE public.intelligence_item_sections SET content_md = v_sec.content_md
       WHERE item_id = v_sec.item_id AND section_key = v_sec.section_key;
      SELECT content_md INTO v_txt FROM public.intelligence_item_sections
       WHERE item_id = v_sec.item_id AND section_key = v_sec.section_key;
      IF v_txt IS DISTINCT FROM 'zz selfcheck section' THEN
        RAISE EXCEPTION '356 self-check FAILED: a section_text correction did not survive a machine write';
      END IF;
      PERFORM public.revoke_item_correction(v_sec.item_id, v_cid, v_actor, 'selfcheck');
      SELECT content_md INTO v_txt FROM public.intelligence_item_sections
       WHERE item_id = v_sec.item_id AND section_key = v_sec.section_key;
      IF v_txt IS DISTINCT FROM v_sec.content_md THEN
        RAISE EXCEPTION '356 self-check FAILED: revoking a section_text correction did not restore the machine text';
      END IF;
      UPDATE public.intelligence_item_sections SET content_md = v_sec.content_md
       WHERE item_id = v_sec.item_id AND section_key = v_sec.section_key;
      SELECT content_md INTO v_txt FROM public.intelligence_item_sections
       WHERE item_id = v_sec.item_id AND section_key = v_sec.section_key;
      IF v_txt IS DISTINCT FROM v_sec.content_md THEN
        RAISE EXCEPTION '356 self-check FAILED: a revoked section_text correction still blocked the next machine write';
      END IF;
    END IF;

    -- fact replace: a non-verbatim span is refused; a verbatim span survives a machine rewrite
    SELECT scp.id, scp.intelligence_item_id AS item_id, scp.claim_text, scp.source_span, scp.search_result_id INTO v_fact
      FROM public.section_claim_provenance scp
      JOIN public.agent_run_searches ars ON ars.id = scp.search_result_id AND ars.intelligence_item_id = scp.intelligence_item_id
     WHERE scp.claim_kind = 'FACT'
       AND scp.source_span IS NOT NULL AND btrim(scp.source_span) <> ''
       AND ars.result_content IS NOT NULL
       AND position(lower(btrim(scp.source_span)) IN lower(ars.result_content)) > 0
     ORDER BY scp.id LIMIT 1;
    IF v_fact.id IS NULL THEN
      RAISE NOTICE '356 self-check: no verbatim-grounded FACT claim, fact steps skipped';
    ELSE
      v_refused := false;
      BEGIN
        PERFORM public.create_item_correction(v_fact.item_id, 'fact', v_fact.id::text, 'replace',
          jsonb_build_object('source_span', 'zz_not_in_any_capture_zz', 'search_result_id', v_fact.search_result_id::text),
          'selfcheck', v_actor);
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE 'correction_fact_span_not_verbatim%' THEN v_refused := true; ELSE RAISE; END IF;
      END;
      IF NOT v_refused THEN
        RAISE EXCEPTION '356 self-check FAILED: a fact replace with a non-verbatim span was accepted';
      END IF;
      v_cid := public.create_item_correction(v_fact.item_id, 'fact', v_fact.id::text, 'replace',
        jsonb_build_object('claim_text', v_fact.claim_text || ' (zz selfcheck)', 'source_span', v_fact.source_span, 'search_result_id', v_fact.search_result_id::text),
        'selfcheck', v_actor);
      UPDATE public.section_claim_provenance SET claim_text = v_fact.claim_text WHERE id = v_fact.id;
      SELECT claim_text INTO v_txt FROM public.section_claim_provenance WHERE id = v_fact.id;
      IF v_txt IS DISTINCT FROM v_fact.claim_text || ' (zz selfcheck)' THEN
        RAISE EXCEPTION '356 self-check FAILED: a fact replace did not survive a machine rewrite of the claim';
      END IF;
      PERFORM public.revoke_item_correction(v_fact.item_id, v_cid, v_actor, 'selfcheck');
      SELECT claim_text INTO v_txt FROM public.section_claim_provenance WHERE id = v_fact.id;
      IF v_txt IS DISTINCT FROM v_fact.claim_text THEN
        RAISE EXCEPTION '356 self-check FAILED: revoking a fact replace did not restore the machine claim';
      END IF;
      UPDATE public.section_claim_provenance SET claim_text = v_fact.claim_text WHERE id = v_fact.id;
      SELECT claim_text INTO v_txt FROM public.section_claim_provenance WHERE id = v_fact.id;
      IF v_txt IS DISTINCT FROM v_fact.claim_text THEN
        RAISE EXCEPTION '356 self-check FAILED: a revoked fact replace still blocked the next machine write';
      END IF;
      -- suppress never deletes
      v_cid := public.create_item_correction(v_fact.item_id, 'fact', v_fact.id::text, 'suppress', NULL, 'selfcheck', v_actor);
      SELECT count(*) INTO v_n FROM public.section_claim_provenance WHERE id = v_fact.id;
      IF v_n <> 1 THEN
        RAISE EXCEPTION '356 self-check FAILED: a suppress deleted the claim row';
      END IF;
    END IF;

    -- connection remove is a tombstone a machine insert cannot get past; add writes a manual pair
    IF v_peer IS NULL THEN
      RAISE NOTICE '356 self-check: only one item, connection steps skipped';
    ELSE
      v_cid := public.create_item_correction(v_item, 'connection', v_peer::text, 'remove', NULL, 'selfcheck', v_actor);
      INSERT INTO public.item_cross_references (source_item_id, target_item_id, relationship, origin)
      VALUES (v_item, v_peer, 'related', 'provenance_discovery'), (v_peer, v_item, 'related', 'provenance_discovery')
      ON CONFLICT (source_item_id, target_item_id) DO NOTHING;
      SELECT count(*) INTO v_n FROM public.item_cross_references
       WHERE (source_item_id = v_item AND target_item_id = v_peer) OR (source_item_id = v_peer AND target_item_id = v_item);
      IF v_n <> 0 THEN
        RAISE EXCEPTION '356 self-check FAILED: a machine edge insert got past a connection tombstone';
      END IF;
      -- revoking a tombstone does NOT re-create the edge
      PERFORM public.revoke_item_correction(v_item, v_cid, v_actor, 'selfcheck');
      SELECT count(*) INTO v_n FROM public.item_cross_references
       WHERE (source_item_id = v_item AND target_item_id = v_peer) OR (source_item_id = v_peer AND target_item_id = v_item);
      IF v_n <> 0 THEN
        RAISE EXCEPTION '356 self-check FAILED: revoking a connection remove re-created the edge';
      END IF;
      v_cid := public.create_item_correction(v_item, 'connection', v_peer::text, 'add', NULL, 'selfcheck', v_actor);
      SELECT count(*) INTO v_n FROM public.item_cross_references
       WHERE origin = 'manual'
         AND ((source_item_id = v_item AND target_item_id = v_peer) OR (source_item_id = v_peer AND target_item_id = v_item));
      IF v_n <> 2 THEN
        RAISE EXCEPTION '356 self-check FAILED: a connection add did not write both manual rows';
      END IF;
    END IF;

    -- the table refuses an UPDATE of anything but revoked_*, and a DELETE
    v_refused := false;
    BEGIN
      UPDATE public.item_corrections SET reason = 'tampered' WHERE id = v_cid;
    EXCEPTION WHEN insufficient_privilege THEN v_refused := true;
    END;
    IF NOT v_refused THEN
      RAISE EXCEPTION '356 self-check FAILED: the append-only guard let an UPDATE of reason through';
    END IF;
    v_refused := false;
    BEGIN
      DELETE FROM public.item_corrections WHERE id = v_cid;
    EXCEPTION WHEN insufficient_privilege THEN v_refused := true;
    END;
    IF NOT v_refused THEN
      RAISE EXCEPTION '356 self-check FAILED: the append-only guard let a DELETE through';
    END IF;

    -- revoking a connection add puts the pair back to what the machine had (nothing, here)
    IF v_peer IS NOT NULL THEN
      PERFORM public.revoke_item_correction(v_item, v_cid, v_actor, 'selfcheck');
      SELECT count(*) INTO v_n FROM public.item_cross_references
       WHERE (source_item_id = v_item AND target_item_id = v_peer) OR (source_item_id = v_peer AND target_item_id = v_item);
      IF v_n <> 0 THEN
        RAISE EXCEPTION '356 self-check FAILED: revoking a connection add did not restore the pair to the machine state';
      END IF;
    END IF;

    RAISE EXCEPTION 'c356_selfcheck_rollback';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'c356_selfcheck_rollback' THEN RAISE; END IF;
  END;
  RAISE NOTICE '356 self-check passed (fixtures rolled back)';
END
$selfcheck$;

COMMIT;
