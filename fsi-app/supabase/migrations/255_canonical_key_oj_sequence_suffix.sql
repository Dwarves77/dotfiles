-- 255 — canonical instrument key: preserve the OJ sequence suffix (2026-08-11).
--
-- ROOT CAUSE, found by the corpus revalidation sweep and the fleet's own Aug-2 shard-8 bug flags:
-- derive_canonical_instrument_key() extracted the bare CELEX token and DISCARDED the OJ sequence
-- suffix '(NN)'. EUR-Lex uses that suffix to distinguish distinct instruments published under one
-- CELEX stem — 22008A0221(01) and 22008A0221(02) are DIFFERENT agreements — so the derivation
-- collapsed them to one key and the partial unique index uq_intelligence_items_canonical_key_verified_live
-- refused to let both stand verified. The constraint was right; the derivation was wrong. One item
-- (bcdd0841) was briefly mis-archived as duplicate_of_verified on the strength of the collision and
-- has been un-archived with a corrected flag note; docs/audits/data-drift-remediation-2026-08-11.md
-- records the error and its reversal.
--
-- THE FIX: every branch that matches a CELEX token now first tries the suffixed form and returns
-- 'CELEXKEY(NN)' with the suffix zero-padded to two digits; the bare form remains the fallback. The
-- source_url branch accepts literal parens or their URL-encodings (%28/%29). ELI branches unchanged.
-- The BEFORE trigger machinery is untouched — re-keying existing rows is a data operation (done in
-- the same remediation pass: 81 affected, 78 re-keyed, 3 legitimate manual-key residuals).

CREATE OR REPLACE FUNCTION public.derive_canonical_instrument_key(p_instr text, p_src_url text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
  m     text[];
  v_map text;
BEGIN
  -- (1) CELEX token in instrument_identifier, WITH optional OJ sequence suffix '(NN)'
  m := regexp_match(COALESCE(p_instr, ''), '([1-9][0-9]{4}[A-Z][0-9]{4})\(([0-9]{1,2})\)');
  IF m IS NOT NULL THEN RETURN upper(m[1]) || '(' || lpad(m[2], 2, '0') || ')'; END IF;
  m := regexp_match(COALESCE(p_instr, ''), '([1-9][0-9]{4}[A-Z][0-9]{4})');
  IF m IS NOT NULL THEN RETURN upper(m[1]); END IF;

  -- (2) ELI relative path in instrument_identifier
  m := regexp_match(COALESCE(p_instr, ''), '^eli/(reg|dir|dec)/([0-9]{4})/([0-9]+)');
  IF m IS NOT NULL THEN
    v_map := CASE m[1] WHEN 'reg' THEN 'R' WHEN 'dir' THEN 'L' WHEN 'dec' THEN 'D' END;
    RETURN '3' || m[2] || v_map || lpad(m[3], 4, '0');
  END IF;

  -- (3) CELEX token in source_url, WITH optional suffix — parens may be literal or URL-encoded %28/%29
  m := regexp_match(COALESCE(p_src_url, ''), 'CELEX(?::|%3[Aa])?([1-9][0-9]{4}[A-Z][0-9]{4})(?:\(|%28)([0-9]{1,2})(?:\)|%29)');
  IF m IS NOT NULL THEN RETURN upper(m[1]) || '(' || lpad(m[2], 2, '0') || ')'; END IF;
  m := regexp_match(COALESCE(p_src_url, ''), 'CELEX(?::|%3[Aa])?([1-9][0-9]{4}[A-Z][0-9]{4})');
  IF m IS NOT NULL THEN RETURN upper(m[1]); END IF;

  -- (4) ELI path in source_url
  m := regexp_match(COALESCE(p_src_url, ''), '/eli/(reg|dir|dec)/([0-9]{4})/([0-9]+)');
  IF m IS NOT NULL THEN
    v_map := CASE m[1] WHEN 'reg' THEN 'R' WHEN 'dir' THEN 'L' WHEN 'dec' THEN 'D' END;
    RETURN '3' || m[2] || v_map || lpad(m[3], 4, '0');
  END IF;

  RETURN NULL;
END;
$function$;

-- Self-check: the two colliding agreements now derive DISTINCT keys; suffixless and ELI derivations
-- are byte-identical to what they produced before this migration. Fail loud, not in traffic.
DO $$
BEGIN
  IF public.derive_canonical_instrument_key('22008A0221(01)', NULL) IS DISTINCT FROM '22008A0221(01)' THEN
    RAISE EXCEPTION 'ABORT: suffixed CELEX (01) did not preserve its suffix';
  END IF;
  IF public.derive_canonical_instrument_key('22008A0221(02)', NULL) IS DISTINCT FROM '22008A0221(02)' THEN
    RAISE EXCEPTION 'ABORT: suffixed CELEX (02) did not preserve its suffix';
  END IF;
  IF public.derive_canonical_instrument_key('22008A0221(01)', NULL)
     = public.derive_canonical_instrument_key('22008A0221(02)', NULL) THEN
    RAISE EXCEPTION 'ABORT: (01) and (02) still collapse to one key';
  END IF;
  IF public.derive_canonical_instrument_key('22008A0221(1)', NULL) IS DISTINCT FROM '22008A0221(01)' THEN
    RAISE EXCEPTION 'ABORT: single-digit suffix not zero-padded';
  END IF;
  IF public.derive_canonical_instrument_key('32022L2464', NULL) IS DISTINCT FROM '32022L2464' THEN
    RAISE EXCEPTION 'ABORT: bare CELEX derivation changed';
  END IF;
  IF public.derive_canonical_instrument_key('eli/reg/2023/1805', NULL) IS DISTINCT FROM '32023R1805' THEN
    RAISE EXCEPTION 'ABORT: ELI derivation changed';
  END IF;
  IF public.derive_canonical_instrument_key(NULL, 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A21994A1231%2852%29') IS DISTINCT FROM '21994A1231(52)' THEN
    RAISE EXCEPTION 'ABORT: URL-encoded suffixed CELEX in source_url not derived';
  END IF;
  RAISE NOTICE 'OK: canonical key derivation preserves OJ sequence suffixes; bare-CELEX and ELI paths unchanged';
END $$;
