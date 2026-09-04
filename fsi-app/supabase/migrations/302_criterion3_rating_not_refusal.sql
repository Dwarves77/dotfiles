-- 302 — criterion 3's authority-floor half becomes a RATING, not a refusal (operator ruling
-- 2026-09-04, verbatim): "get the source. then rate the source. it's that simple. this isn't hard,
-- find the source and then publish the data on the site." Context (HEAL-6 measurement, re-confirmed
-- read-only for this lane, 2026-09-04): heal #21 (Actions 33829526120) left 94 items quarantined;
-- of the 824 Gate-A orphan figures in those briefs, 386 have no floor-qualifying source — 167 have
-- NO `sources` row at all for the URL the figure came from, 179 have a `sources` row whose derived
-- tier is ABOVE the item-type floor (migration 141: reg family <=2, research_finding <=4,
-- technology/innovation/tool <=5; market_signal/initiative/regional_data exempt; the standard/
-- voluntary-instrument own-body floor is 4, migrations 202 + the live "203" own-body-types
-- extension — see the DRIFT NOTE below).
--
-- THE RULING OVERRULES THE REFUSAL HALF OF THE FLOOR, NOT THE GROUNDING REQUIREMENT. A figure's
-- source is REGISTERED and RATED (its tier, from the deterministic class table the registry already
-- applies — src/lib/sources/host-authority.ts's classTierForHost/decidePoolHostRegistration, SC-13,
-- never a guess), the figure is grounded on it VERBATIM, and it is published WITH its rating visible
-- (the credibility tier chips already render per-claim/source tier on the surfaces). It does NOT
-- overrule grounding: `fact_missing_source_span` and `fact_span_not_in_source` (a FACT with no span,
-- or a span that is not verbatim in its cited capture) are UNCHANGED, still hard failures — a figure
-- with no source anywhere stays ungrounded and the sentence is not published as fact. Only
-- `fact_below_authority_floor` (the TIER comparison, once a claim IS verbatim-grounded on a REAL,
-- ACTIVE, rated source) moves from `v_failures` to a new non-blocking `v_result.warnings` field:
-- `{ below_floor_facts: <int>, claims: [ {criterion:3, reason:'fact_below_authority_floor', claim,
-- source_tier_derived, priority, item_type, floor_max, floor_scope, floor_basis}, ... ] }` — the
-- SAME payload shape criterion 3 always built, now recorded as a rating instead of discarded on
-- disqualification. `v_result.valid` and `recommended_status` no longer depend on it.
--
-- WHY A NEW ATTRIBUTE, NOT A NEW `v_failures` TAG. `validation_result` (migration 114) is a fixed
-- composite (valid, failures, recommended_status); `v_result.valid := (jsonb_array_length(v_failures)
-- = 0)` treats EVERY entry in `failures` as blocking, so a below-floor rating could not live in that
-- array without either (a) being counted against `valid` (the exact refusal the ruling overrules) or
-- (b) requiring every consumer of `failures` to learn a new non-blocking-entry convention overnight.
-- `ALTER TYPE ... ADD ATTRIBUTE` is additive and reversible (`DROP ATTRIBUTE` un-does it), and every
-- existing consumer (provenance-heal.mjs's `validateProvenance` RPC wrapper, the trigger in migration
-- 115, apply-mint-batch.mjs, etc. — all read named fields, none does positional/`SELECT *` binding
-- against a fixed column count; grepped for this lane) is unaffected by an unread extra field.
--
-- THE KIT MIRROR (fsi-app/scripts/mint/validate-mint-payload.mjs) IS UPDATED IN THE SAME LANE, SAME
-- SHAPE: its own `fact_below_authority_floor` push moves from `failures` to a new `warnings` return
-- field, `{ below_floor_facts, claims }`, so a payload the kit clears pre-apply and the row the DB
-- validates post-apply AGREE — the kit and the function never diverge on what counts as blocking.
-- (fact_missing_source_span / fact_span_not_in_source / fact_mint_hold in the kit are UNCHANGED,
-- same reasoning as the DB function: those are grounding checks, not tier checks.)
--
-- DRIFT NOTE (read-only, 2026-09-04, this lane). `pg_get_functiondef` on the LIVE function shows a
-- `c_own_body_types := ARRAY['standard','framework','initiative']` / `floor_scope`
-- 'voluntary_own_body' extension of migration 202's own-body floor, and `ars.result_content` (not
-- `result_content_excerpt`, migration 264's rename) — NEITHER appears in any committed file under
-- `supabase/migrations/` as of this lane's base (origin/master e6eff093; grepped in full, zero
-- matches for `c_own_body_types` or `voluntary_own_body`). The live schema is ahead of the committed
-- migration chain by at least one applied-but-uncommitted DDL change (permitted by CLAUDE.md's
-- migration two-track policy — schema DDL may apply via CLI before the dependent code commits — but
-- the commit itself appears to be missing, not merely pending). This migration is written against the
-- ACTUAL LIVE DEFINITION (md5 verified below), not against the locally-committed 202 file, precisely
-- because of this drift; the guard below aborts loudly rather than silently patching the wrong body if
-- the live function has moved again by the time this migration is applied. Reported, not fixed here —
-- outside this lane's write set (no other migration file is touched).
--
-- SHAPE. Same in-place-patch discipline as migrations 225 and 300 (read the live definition via
-- `pg_get_functiondef`, guard on the exact live source text before touching anything, `EXECUTE` the
-- patched definition, verify post-patch, `RAISE NOTICE`/`RAISE EXCEPTION` — no re-paste of the 14K-char
-- body). Two independent, idempotent parts:
--   PART 1 — `ALTER TYPE public.validation_result ADD ATTRIBUTE warnings jsonb` (no-op if already
--     present, checked via `pg_attribute`/`pg_type`, never a blind `ALTER TYPE`).
--   PART 2 — three anchored, uniqueness-guarded replacements against the CURRENT `pg_get_functiondef`
--     text: (a) declare `v_warnings jsonb` + `v_below_floor_facts integer` right after the existing
--     `v_failures` declare; (b) the `fact_below_authority_floor` IF-block now increments
--     `v_below_floor_facts` and appends to `v_warnings` instead of `v_failures` (the SAME
--     `jsonb_build_object` payload, byte-identical, so no existing reader of a below-floor entry's
--     shape needs to change); (c) `v_result.warnings := jsonb_build_object(...)` is set immediately
--     before the existing `v_result.valid := ...` anchor line migration 225 already injects criterion 7
--     ahead of. Every replacement is COUNT-GUARDED (exactly 1 occurrence of the target text) exactly
--     as migration 300's own `v_count <> 1` guard — if any of the three has drifted (0 or >1
--     occurrences), the whole migration ABORTS before any `EXECUTE`, never patches a partial/wrong
--     match. Idempotent: if `v_warnings` is already declared (a prior run of this migration already
--     applied), the whole PART 2 is a documented no-op.
--
-- SELF-CHECK SQL (run read-only before writing this file, 2026-09-04, via Supabase MCP `execute_sql`,
-- project kwrsbpiseruzbfwjpvsp — NO write performed by this lane; every number below is what PART 2's
-- own guards re-derive and re-check at apply time):
--
--   SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.proname='validate_item_provenance';
--   -- => da6b00972e5a9bdb089bbe1f1d65d697  (length 14190) — THE v_pre_md5 PART 2 guards on.
--
--   -- anchor 1 (declare), exactly 1 occurrence:
--   SELECT (length(def)-length(replace(def,$a$v_failures      jsonb := '[]'::jsonb;$a$,'')))
--            / length($a$v_failures      jsonb := '[]'::jsonb;$a$)
--     FROM (SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p JOIN pg_namespace n
--            ON n.oid=p.pronamespace WHERE n.nspname='public'
--            AND p.proname='validate_item_provenance') s;
--   -- => 1
--
--   -- anchor 2 (floor IF-block), exactly 1 occurrence of 'IF v_floor_armed' and of
--   -- 'fact_below_authority_floor':
--   -- => 1, 1
--
--   -- anchor 3 (tail), exactly 1 occurrence:
--   SELECT (length(def)-length(replace(def,'v_result.valid := (jsonb_array_length(v_failures) = 0);','')))
--            / length('v_result.valid := (jsonb_array_length(v_failures) = 0);')
--     FROM (SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p JOIN pg_namespace n
--            ON n.oid=p.pronamespace WHERE n.nspname='public'
--            AND p.proname='validate_item_provenance') s;
--   -- => 1
--
-- POST-APPLY VERIFICATION (to run after this migration is actually applied — not run by this lane,
-- Supabase MCP is read-only for this lane):
--   SELECT public.validate_item_provenance('<a currently-quarantined-on-tier-only item id>'::uuid);
--   -- expect: valid=true (if tier was its ONLY failure), warnings.below_floor_facts >= 1,
--   --         failures no longer carries a 'fact_below_authority_floor' entry for that item.
--
-- Reversible: `ALTER TYPE public.validation_result DROP ATTRIBUTE warnings;` + re-run the inverse of
-- PART 2's three replacements (swap old/new, same count-guard discipline) restores the pre-302 body.

-- ── PART 1 — additive composite-type attribute (idempotent) ──────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_attribute a
      JOIN pg_type t ON t.typrelid = a.attrelid
     WHERE t.typname = 'validation_result'
       AND a.attname = 'warnings'
       AND NOT a.attisdropped
  ) THEN
    ALTER TYPE public.validation_result ADD ATTRIBUTE warnings jsonb;
    RAISE NOTICE '302 PART 1: validation_result.warnings added';
  ELSE
    RAISE NOTICE '302 PART 1: validation_result.warnings already present — no-op';
  END IF;
END $$;

-- ── PART 2 — in-place function-body patch (idempotent, count-guarded, same technique as 225/300) ──
DO $$
DECLARE
  v_def       text;
  v_pre_md5   constant text := 'da6b00972e5a9bdb089bbe1f1d65d697';

  -- anchor 1 — DECLARE block: add v_warnings / v_below_floor_facts right after v_failures.
  v_decl_old  constant text := $a$v_failures      jsonb := '[]'::jsonb;$a$;
  v_decl_new  constant text := $a$v_failures      jsonb := '[]'::jsonb;
  v_warnings      jsonb := '[]'::jsonb;   -- 302: below-floor tier RATINGS (never blocks validity)
  v_below_floor_facts integer := 0;       -- 302: count mirrored into v_result.warnings$a$;

  -- anchor 2 — the fact_below_authority_floor IF-block: append to v_warnings instead of v_failures,
  -- and count it. The jsonb_build_object payload itself is BYTE-IDENTICAL to the live body — only the
  -- target array + a new counter increment change.
  v_floor_old constant text := $b$IF v_floor_armed
         AND v_fact_floor IS NOT NULL
         AND (r.derived_tier IS NULL
              OR r.derived_tier > v_fact_floor) THEN
        v_failures := v_failures || jsonb_build_object(
          'criterion', 3,
          'reason', 'fact_below_authority_floor',
          'claim', r.claim_text,
          'source_tier_derived', r.derived_tier,
          'priority', v_item.priority,
          'item_type', v_item.item_type,
          'floor_max', v_fact_floor,
          'floor_scope', CASE
                           WHEN v_fact_floor = 4 AND v_item.item_type = 'standard'
                             THEN 'standard_own_body'
                           WHEN v_fact_floor = 4 AND v_item.item_type = ANY (c_own_body_types)
                             THEN 'voluntary_own_body'
                           ELSE 'default'
                         END,
          'floor_basis', CASE WHEN v_priority_high THEN 'priority' ELSE 'item_type_unconditional' END
        );
      END IF;$b$;
  v_floor_new constant text := $b$IF v_floor_armed
         AND v_fact_floor IS NOT NULL
         AND (r.derived_tier IS NULL
              OR r.derived_tier > v_fact_floor) THEN
        v_below_floor_facts := v_below_floor_facts + 1;
        v_warnings := v_warnings || jsonb_build_object(
          'criterion', 3,
          'reason', 'fact_below_authority_floor',
          'claim', r.claim_text,
          'source_tier_derived', r.derived_tier,
          'priority', v_item.priority,
          'item_type', v_item.item_type,
          'floor_max', v_fact_floor,
          'floor_scope', CASE
                           WHEN v_fact_floor = 4 AND v_item.item_type = 'standard'
                             THEN 'standard_own_body'
                           WHEN v_fact_floor = 4 AND v_item.item_type = ANY (c_own_body_types)
                             THEN 'voluntary_own_body'
                           ELSE 'default'
                         END,
          'floor_basis', CASE WHEN v_priority_high THEN 'priority' ELSE 'item_type_unconditional' END
        );
      END IF;$b$;

  -- anchor 3 — tail: stamp v_result.warnings immediately before the existing valid-computation line
  -- (the same anchor migration 225 already injects criterion 7 ahead of — unchanged, untouched here).
  v_tail_old  constant text := 'v_result.valid := (jsonb_array_length(v_failures) = 0);';
  v_tail_new  constant text := $c$v_result.warnings := jsonb_build_object('below_floor_facts', v_below_floor_facts, 'claims', v_warnings);
  v_result.valid := (jsonb_array_length(v_failures) = 0);$c$;

  v_newdef    text;
  v_count     int;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'validate_item_provenance';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'ABORT 302: public.validate_item_provenance not found';
  END IF;

  IF position(v_decl_new IN v_def) > 0 THEN
    RAISE NOTICE '302 PART 2: already applied (v_warnings already declared) — no-op';
    RETURN;
  END IF;

  IF md5(v_def) <> v_pre_md5 THEN
    RAISE EXCEPTION 'ABORT 302: live validate_item_provenance md5 % differs from the body this patch was written for (%); read the live definition and re-derive before applying', md5(v_def), v_pre_md5;
  END IF;

  v_count := (length(v_def) - length(replace(v_def, v_decl_old, ''))) / length(v_decl_old);
  IF v_count <> 1 THEN RAISE EXCEPTION 'ABORT 302: expected exactly 1 occurrence of the declare anchor, found %', v_count; END IF;

  v_count := (length(v_def) - length(replace(v_def, v_floor_old, ''))) / length(v_floor_old);
  IF v_count <> 1 THEN RAISE EXCEPTION 'ABORT 302: expected exactly 1 occurrence of the floor IF-block anchor, found %', v_count; END IF;

  v_count := (length(v_def) - length(replace(v_def, v_tail_old, ''))) / length(v_tail_old);
  IF v_count <> 1 THEN RAISE EXCEPTION 'ABORT 302: expected exactly 1 occurrence of the tail anchor, found %', v_count; END IF;

  v_newdef := replace(v_def, v_decl_old, v_decl_new);
  v_newdef := replace(v_newdef, v_floor_old, v_floor_new);
  v_newdef := replace(v_newdef, v_tail_old, v_tail_new);
  IF v_newdef = v_def THEN RAISE EXCEPTION 'ABORT 302: replacements produced no change'; END IF;

  EXECUTE v_newdef;

  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'validate_item_provenance';
  IF position(v_decl_new IN v_def) = 0
     OR position(v_floor_new IN v_def) = 0
     OR position(v_tail_new IN v_def) = 0
     OR position('v_failures := v_failures || jsonb_build_object(
          ''criterion'', 3,
          ''reason'', ''fact_below_authority_floor''' IN v_def) > 0 THEN
    RAISE EXCEPTION 'ABORT 302: post-patch definition does not carry the new literals alone';
  END IF;

  RAISE NOTICE '302 PART 2 OK: criterion-3 authority-floor is now a rating (v_result.warnings.below_floor_facts), never a failure; post md5 %', md5(v_def);
END $$;
