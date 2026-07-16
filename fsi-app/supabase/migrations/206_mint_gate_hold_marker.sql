-- 206_mint_gate_hold_marker.sql
-- Hardening A1 flip (operator ruling 2026-07-16): the mint-time S-CONFLATE gate HARD-holds a FACT.
-- Adds section_claim_provenance.mint_hold_reason and makes validate_item_provenance (criterion 3) fail on any
-- non-null value, so a conflated FACT holds its item (fact_mint_hold) until a re-ground clears it.
--
-- NON-REGRESSIVE BY CONSTRUCTION: mint_hold_reason is a NEW column, NULL on every pre-flip fact, and the mint
-- pipeline sets it only on facts minted going forward. Proven at apply time: 196 verified items, 194 still
-- valid, 2 pre-existing drift (source_not_active, unlabeled_assertion — NOT fact_mint_hold, mint_held_facts=0).
-- S-NUMERIC is a SOFT hold (a data_quality integrity_flag, item stays verified-eligible) and does NOT set this.
--
-- The function is patched PROGRAMMATICALLY (fetch the exact current definition, inject two surgical edits, and
-- re-create) rather than hand-reproduced, to avoid transcribing the escaped label/legal/forward regex
-- constants. Idempotent: the DO block no-ops if the function is already patched.

ALTER TABLE public.section_claim_provenance ADD COLUMN IF NOT EXISTS mint_hold_reason text;
COMMENT ON COLUMN public.section_claim_provenance.mint_hold_reason IS
  'Hardening A1 flip (2026-07-16). Set by the mint-time S-CONFLATE HARD gate to hold a FACT (held-not-verified '
  'until re-ground clears it). validate_item_provenance criterion 3 fails on any non-null value. NULL on every '
  'pre-flip fact (non-regressive by construction). S-NUMERIC is a SOFT hold (integrity_flag) and does NOT set this.';

DO $mig$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.validate_item_provenance(uuid)'::regprocedure);
  IF d LIKE '%fact_mint_hold%' THEN RETURN; END IF;  -- already patched, idempotent
  -- 1) add mint_hold_reason to the criterion-3 FACT select
  d := replace(d, $a$scp.search_result_id,$a$, $b$scp.search_result_id, scp.mint_hold_reason,$b$);
  -- 2) add the HARD-hold criterion inside the criterion-3 loop (after the floor block, before its END LOOP)
  d := replace(d,
$a$'floor_basis', CASE WHEN v_priority_high THEN 'priority' ELSE 'item_type_unconditional' END
        );
      END IF;
    END LOOP;$a$,
$b$'floor_basis', CASE WHEN v_priority_high THEN 'priority' ELSE 'item_type_unconditional' END
        );
      END IF;

      IF r.mint_hold_reason IS NOT NULL THEN
        v_failures := v_failures || jsonb_build_object('criterion', 3, 'reason', 'fact_mint_hold', 'claim', r.claim_text, 'mint_hold_reason', r.mint_hold_reason);
      END IF;
    END LOOP;$b$);
  EXECUTE d;
END $mig$;
