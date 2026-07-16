-- 207_hold_resolution_queue.sql
-- Phase E (hold-means-seek), E3 increment 1: the hold-resolution queue state + enter/exit mechanics.
-- Doctrine holds-are-conveyor-not-parking: a hold is a conveyor position, never a parking spot. Every held
-- entity (mint-gate hold, floor hold, hold-to-find, quarantine-with-next-action) is a ROW here with a state
-- and a per-mechanism attempt log; the loop drains it (seek -> capture -> re-ground -> exit) and escalates
-- only at an evidenced dead end. Persistence is DB state, not a doc.
--
-- Additive: new table + functions. Nothing else touched; no corpus mutation. Direct SQL reaches production.

CREATE TABLE IF NOT EXISTS public.hold_resolution_queue (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type      text NOT NULL CHECK (entity_type IN ('item', 'claim')),
  entity_ref       uuid NOT NULL,                 -- intelligence_items.id or section_claim_provenance.id
  hold_class       text NOT NULL CHECK (hold_class IN ('mint_gate_conflate', 's_numeric_soft', 'floor', 'hold_to_find', 'quarantine_next_action')),
  next_action      text,
  state            text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued', 'seeking', 'grounding', 'exited', 'escalated')),
  attempts         jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{mechanism, outcome, at}] per-mechanism try log
  escalation_reason text,
  deferred_until   timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.hold_resolution_queue IS
  'Phase E hold-resolution loop (holds-are-conveyor-not-parking). One row per (entity, hold_class); the loop '
  'drains it seek -> capture -> re-ground -> exit, escalating only at an evidenced dead end. RD-42.';

-- One ACTIVE row per (entity, hold_class); exited/escalated rows are historical (a new hold occurrence re-enqueues).
CREATE UNIQUE INDEX IF NOT EXISTS hrq_one_active_per_entity_class
  ON public.hold_resolution_queue (entity_type, entity_ref, hold_class)
  WHERE state IN ('queued', 'seeking', 'grounding');

CREATE INDEX IF NOT EXISTS hrq_state_idx ON public.hold_resolution_queue (state);

-- updated_at maintenance (reuse the shared trigger fn if present, else inline)
DROP TRIGGER IF EXISTS hrq_updated_at ON public.hold_resolution_queue;
CREATE TRIGGER hrq_updated_at BEFORE UPDATE ON public.hold_resolution_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ENQUEUE (idempotent): return the existing ACTIVE row for (entity, class) if present, else insert.
CREATE OR REPLACE FUNCTION public.hrq_enqueue(p_entity_type text, p_entity_ref uuid, p_hold_class text, p_next_action text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.hold_resolution_queue
   WHERE entity_type = p_entity_type AND entity_ref = p_entity_ref AND hold_class = p_hold_class
     AND state IN ('queued', 'seeking', 'grounding')
   LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  INSERT INTO public.hold_resolution_queue (entity_type, entity_ref, hold_class, next_action)
    VALUES (p_entity_type, p_entity_ref, p_hold_class, p_next_action)
    RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

-- RECORD ATTEMPT: append {mechanism, outcome} to the attempt log; auto-ESCALATE on the SAME mechanism failing
-- TWICE (cycle safety: no infinite seek loops).
CREATE OR REPLACE FUNCTION public.hrq_record_attempt(p_id uuid, p_mechanism text, p_outcome text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_fail_count int;
BEGIN
  UPDATE public.hold_resolution_queue
     SET attempts = attempts || jsonb_build_object('mechanism', p_mechanism, 'outcome', p_outcome)
   WHERE id = p_id;
  SELECT count(*) INTO v_fail_count
    FROM jsonb_array_elements((SELECT attempts FROM public.hold_resolution_queue WHERE id = p_id)) a
   WHERE a->>'mechanism' = p_mechanism AND a->>'outcome' = 'failed';
  IF v_fail_count >= 2 THEN
    UPDATE public.hold_resolution_queue
       SET state = 'escalated', escalation_reason = format('cycle-safety: mechanism %s failed %s times', p_mechanism, v_fail_count)
     WHERE id = p_id AND state IN ('queued', 'seeking', 'grounding');
    RETURN 'escalated';
  END IF;
  RETURN 'recorded';
END; $$;

-- EXIT (hold resolved) / ESCALATE (evidenced dead end).
CREATE OR REPLACE FUNCTION public.hrq_exit(p_id uuid, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.hold_resolution_queue
     SET state = 'exited', attempts = attempts || jsonb_build_object('mechanism', 'exit', 'outcome', COALESCE(p_reason, 'resolved'))
   WHERE id = p_id;
END; $$;

CREATE OR REPLACE FUNCTION public.hrq_escalate(p_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.hold_resolution_queue
     SET state = 'escalated', escalation_reason = p_reason
   WHERE id = p_id;
END; $$;
