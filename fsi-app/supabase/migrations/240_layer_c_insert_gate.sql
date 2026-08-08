-- Migration 240: LAYER C INSERT GATE — data-audit block enforced at the intelligence_items INSERT
-- chokepoint (enforcement-gap fix, root-caused 2026-08-02; operator ruled to build).
--
-- DEFECT THIS CLOSES. The Layer C block-next-run gate (audit-gate.ts readOpenDataAuditBlock +
-- hasValidWaiver, consumed by preflightStep in src/workflows/generate-brief.ts) is correct but lives
-- ONLY in the generate-brief workflow and the funded-pass runner. The recurring fleet never invokes
-- either — 500+ fleet-authored intelligence_items rows carry ZERO agent_runs rows, so an OPEN
-- data-audit block (integrity_flags row, e.g. cfb1799a, waiver expired 2026-07-28) was never
-- consulted at insert time. Same defect class and fix shape as the mig-115/118 provenance triggers
-- and the mig-201 pause-flag guard: an invariant that lives only in one code path is not enforced —
-- it moves into the database, where EVERY writer passes through it by construction (BYPASSRLS does
-- not skip triggers; service_role cannot disable them).
--
-- SEMANTICS (exact mirror of the unit-tested audit-gate-core.mjs — NO LOGIC DRIFT; keep in sync):
--   * A block is OPEN iff an integrity_flags row exists with category='data_integrity',
--     subject_ref='data-audit-lane', status='open' (the DATA_AUDIT_BLOCK shape the nightly lane
--     maintains as ONE row: reflected on RED, resolved on GREEN).
--   * hasValidWaiver: the block is dispositioned ONLY by an explicit dated waiver — an element of
--     recommended_actions (jsonb array) with action='waiver' and an until date whose UTC midnight is
--     >= now(). Mirrors JS `new Date("YYYY-MM-DD").getTime() >= now.getTime()` exactly, including
--     the edge that a waiver dated today expired at 00:00 UTC today. An unparseable until is NOT a
--     valid waiver (JS NaN → false). Time alone never clears a block; deliberate acts do: fix the
--     lane to green (row resolved) or record a dated waiver disposition.
--   * FAIL-CLOSED superset: the lane convention is one open row, but if several open block rows ever
--     exist, ALL must carry a valid waiver for inserts to proceed (the TS reader samples one row;
--     the DB gate must not let an unwaived row hide behind a waived one).
--   * When NO block is open, inserts are entirely unaffected.
--
-- EXEMPTION (deliberate-act shaped, mirroring mig-201's app.pause_flag_writer and mig-118's
-- app.prov_flip_origin transaction-local GUC precedent): a transaction-local marker
-- `SELECT set_config('app.data_audit_override', '<actor: why>', true)` lets a DELIBERATE
-- operator/ops act (a data migration, a sanctioned backfill) insert during red. The marker is
-- transaction-local (never leaks past COMMIT/ROLLBACK), its use RAISEs a WARNING into the Postgres
-- log naming the declared actor, and it is deliberately NOT mentioned in the rejection message —
-- generation has no escape hatch (the preflight doctrine); the override is for non-generation
-- deliberate acts only.
--
-- Defense in depth: preflightStep and funded-pass keep their app-layer checks (better error UX,
-- halts before spend); THIS trigger is the enforcement point — no insert path can skip it.
--
-- ADDITIVE + IDEMPOTENT: CREATE OR REPLACE / DROP IF EXISTS; no existing objects altered. Nothing
-- fires at apply time. Reversible: DROP TRIGGER guard_data_audit_block_trg ON intelligence_items;
-- DROP FUNCTION public.guard_data_audit_block(). Proof harness (red-then-green, rollback-only):
-- scripts/verify/layer-c-insert-gate-proof.mjs.
--
-- TWO-TRACK POLICY: schema DDL — apply via Supabase BEFORE this merges. NOT applied at authoring.

BEGIN;

CREATE OR REPLACE FUNCTION public.guard_data_audit_block()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions, pg_temp  -- mig-160 pin convention
AS $fn$
DECLARE
  v_override text := current_setting('app.data_audit_override', true);
  v_block    record;
  v_act      jsonb;
  v_waived   boolean;
BEGIN
  -- Deliberate-act exemption (transaction-local marker; see header). Logged, never silent.
  IF v_override IS NOT NULL AND v_override <> '' THEN
    RAISE WARNING 'layer-c-insert-gate: insert into intelligence_items admitted under app.data_audit_override=%; this is a deliberate-act exemption and must correspond to a recorded disposition.', v_override;
    RETURN NEW;
  END IF;

  -- Every OPEN data-audit block row must carry a valid dated waiver (fail-closed superset of the
  -- one-row lane convention). No open rows -> loop body never runs -> insert proceeds untouched.
  FOR v_block IN
    SELECT id, description, recommended_actions
    FROM public.integrity_flags
    WHERE category = 'data_integrity'
      AND subject_ref = 'data-audit-lane'
      AND status = 'open'
  LOOP
    v_waived := false;
    IF jsonb_typeof(v_block.recommended_actions) = 'array' THEN
      FOR v_act IN SELECT jsonb_array_elements(v_block.recommended_actions)
      LOOP
        IF jsonb_typeof(v_act) = 'object'
           AND v_act ->> 'action' = 'waiver'
           AND v_act ->> 'until' IS NOT NULL THEN
          BEGIN
            -- Mirror of hasValidWaiver: JS parses 'YYYY-MM-DD' as UTC midnight and requires
            -- midnight >= now. Unparseable dates fall to the EXCEPTION arm (JS NaN -> false).
            IF ((v_act ->> 'until')::date::timestamp AT TIME ZONE 'UTC') >= now() THEN
              v_waived := true;
              EXIT;
            END IF;
          EXCEPTION WHEN others THEN
            NULL; -- invalid until -> not a valid waiver; keep scanning
          END;
        END IF;
      END LOOP;
    END IF;

    IF NOT v_waived THEN
      RAISE EXCEPTION
        'layer-c-insert-gate: intelligence_items insert blocked — the data-audit lane is RED with no current dated waiver (integrity_flags %). Corpus red is cleared only by a deliberate act, never by time: fix the lane to green (the block row resolves) or record a dated waiver disposition in docs/data-audit-dispositions.md and on the flag (recommended_actions += {"action":"waiver","until":"YYYY-MM-DD"}). %',
        v_block.id, coalesce(left(v_block.description, 160), '')
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.guard_data_audit_block() IS
  'Layer C insert gate (migration 240). BEFORE INSERT on intelligence_items: rejects the insert while an open data-audit block (integrity_flags category=data_integrity, subject_ref=data-audit-lane, status=open) lacks a valid dated waiver ({action:"waiver",until>=today-UTC} in recommended_actions). Exact SQL mirror of audit-gate-core.mjs hasValidWaiver — keep in sync. Closes the fleet-bypass gap (500+ inserts that never passed preflightStep''s app-layer check). Deliberate-act exemption: transaction-local GUC app.data_audit_override (set_config(...,true)), logged via RAISE WARNING; precedent app.pause_flag_writer (mig 201). Proof: scripts/verify/layer-c-insert-gate-proof.mjs.';

DROP TRIGGER IF EXISTS guard_data_audit_block_trg ON public.intelligence_items;
CREATE TRIGGER guard_data_audit_block_trg
  BEFORE INSERT ON public.intelligence_items
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_data_audit_block();

COMMIT;
