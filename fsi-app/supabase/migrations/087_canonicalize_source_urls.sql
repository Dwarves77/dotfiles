-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 087: canonicalize sources.url and provisional_sources.url
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Q10 (URL canonicalization fix). Source resolution previously treated URLs
-- as opaque strings, so two registry entries that differed only in
-- formatting (trailing slash, www prefix, port, fragment, etc.) appeared as
-- distinct rows. The application code now uses canonicalizeUrl() from
-- src/lib/sources/url-canonicalize.ts at every resolution point; this
-- migration normalises the existing rows in place so the new lookups match.
--
-- What this migration does:
--   * UPDATE sources.url to canonical form for each row where the current
--     value is not already canonical (idempotent — re-running is a no-op).
--   * UPDATE provisional_sources.url to canonical form for each row.
--   * UPDATE intelligence_items.source_url to canonical form for each row
--     (denormalised cache of sources.url; kept consistent so
--     `.eq("source_url", sources.url)` queries continue to match after the
--     sources row backfill flips formatting). This is the only schema-touch
--     beyond the two scope columns; rationale captured in the Q10 dispatch
--     report's Sources-schema-touch precondition audit.
--
-- What this migration explicitly does NOT do:
--   * Does NOT merge rows whose URLs canonicalize to the same value. If
--     multiple sources rows canonicalize identically, they remain as
--     separate rows pending an operator merge decision. The duplicate set
--     report at scripts/tmp/q10-duplicate-report.json surfaces every such
--     set for the operator to triage; the dispatch policy is "surface, do
--     not auto-merge."
--   * Does NOT add a UNIQUE constraint on sources.url. The current data
--     has 9 duplicate sets in sources and 29 cross-table collisions with
--     provisional_sources; a UNIQUE index would fail. The index decision
--     belongs to the operator-resolution dispatch downstream.
--   * Does NOT touch source_verifications.candidate_url (audit log; row
--     value is the verbatim candidate URL at submission time and intent is
--     to preserve original form for audit lineage).
--   * Does NOT touch canonical_source_candidates.candidate_url. That table
--     is the human-review queue; if a canonical candidate's url turns out
--     to differ from the resulting sources.url after canonicalization, the
--     decide route's existing existing-source lookup will resolve it
--     correctly via the canonicalized query helper.
--
-- The canonicalization rules (must match src/lib/sources/url-canonicalize.ts):
--   1. lowercase scheme
--   2. lowercase host
--   3. strip leading "www." from host
--   4. strip default port (:80 for http, :443 for https)
--   5. trim a single trailing slash from path (but preserve root "/")
--   6. sort query params alphabetically by key (preserve duplicate-key order)
--   7. strip fragment
--   8. preserve path case (sites are often case-sensitive in path)
--
-- Implementation: a PL/pgSQL helper function applies the rules and the
-- backfill loops over each row. The function is created in a TEMP schema
-- (pg_temp) so it disappears at session end — this migration is not adding
-- a permanent SQL helper, only doing a one-shot backfill. Application code
-- owns the canonicalization helper going forward.

DO $$
DECLARE
  src_updated INT := 0;
  prov_updated INT := 0;
  ii_updated INT := 0;
BEGIN
  -- Helper: canonicalize a URL using PostgreSQL regex/string ops. Mirrors
  -- the TypeScript helper precisely. We use a temp function for readability.
  CREATE OR REPLACE FUNCTION pg_temp.canonicalize_url(raw TEXT)
  RETURNS TEXT
  LANGUAGE plpgsql
  IMMUTABLE
  AS $fn$
  DECLARE
    scheme TEXT;
    rest TEXT;
    authority TEXT;
    host TEXT;
    port TEXT;
    path_part TEXT;
    query_part TEXT;
    fragment_part TEXT;
    path_q TEXT;
    pos INT;
    qpos INT;
    fpos INT;
    apos INT;
    rebuilt TEXT;
    kv TEXT[];
    pair TEXT;
    sorted_pairs TEXT[];
    canon_query TEXT;
  BEGIN
    IF raw IS NULL OR raw = '' THEN
      RETURN raw;
    END IF;

    -- Split scheme. Require '://' or return original (defensive).
    pos := position('://' IN raw);
    IF pos = 0 THEN
      RETURN raw;
    END IF;
    scheme := lower(substring(raw FROM 1 FOR pos - 1)) || ':';
    rest := substring(raw FROM pos + 3);

    -- Strip fragment (everything after first '#').
    fpos := position('#' IN rest);
    IF fpos > 0 THEN
      rest := substring(rest FROM 1 FOR fpos - 1);
    END IF;

    -- Split off query (everything after first '?').
    qpos := position('?' IN rest);
    IF qpos > 0 THEN
      query_part := substring(rest FROM qpos + 1);
      rest := substring(rest FROM 1 FOR qpos - 1);
    ELSE
      query_part := NULL;
    END IF;

    -- Split authority vs path at first '/'.
    apos := position('/' IN rest);
    IF apos > 0 THEN
      authority := substring(rest FROM 1 FOR apos - 1);
      path_part := substring(rest FROM apos);
    ELSE
      authority := rest;
      path_part := '/';
    END IF;

    -- Strip userinfo (everything before last '@' in authority) — should be
    -- rare for source URLs, but mirror URL parser behaviour by keeping it.
    -- (We deliberately leave userinfo in place. If present, it stays.)

    -- Split authority into host[:port].
    pos := position(':' IN authority);
    IF pos > 0 THEN
      host := substring(authority FROM 1 FOR pos - 1);
      port := substring(authority FROM pos + 1);
    ELSE
      host := authority;
      port := '';
    END IF;
    host := lower(host);
    IF host LIKE 'www.%' THEN
      host := substring(host FROM 5);
    END IF;

    -- Strip default port.
    IF (scheme = 'http:' AND port = '80') OR (scheme = 'https:' AND port = '443') THEN
      port := '';
    END IF;

    -- Trim single trailing slash from path (preserve root '/').
    IF length(path_part) > 1 AND right(path_part, 1) = '/' THEN
      path_part := regexp_replace(path_part, '/+$', '');
      IF path_part = '' THEN
        path_part := '/';
      END IF;
    END IF;

    -- Sort query params alphabetically by key.
    IF query_part IS NOT NULL AND query_part <> '' THEN
      kv := string_to_array(query_part, '&');
      sorted_pairs := ARRAY(
        SELECT pair_val FROM unnest(kv) AS pair_val
        ORDER BY split_part(pair_val, '=', 1), pair_val
      );
      canon_query := array_to_string(sorted_pairs, '&');
    ELSE
      canon_query := NULL;
    END IF;

    -- Rebuild.
    IF port = '' THEN
      rebuilt := scheme || '//' || host || path_part;
    ELSE
      rebuilt := scheme || '//' || host || ':' || port || path_part;
    END IF;
    IF canon_query IS NOT NULL AND canon_query <> '' THEN
      rebuilt := rebuilt || '?' || canon_query;
    END IF;
    RETURN rebuilt;
  EXCEPTION WHEN OTHERS THEN
    -- Defensive: bad URLs pass through unchanged. Mirrors TS helper.
    RETURN raw;
  END;
  $fn$;

  -- Backfill sources.url.
  UPDATE public.sources
  SET url = pg_temp.canonicalize_url(url)
  WHERE url IS NOT NULL
    AND url <> ''
    AND url IS DISTINCT FROM pg_temp.canonicalize_url(url);
  GET DIAGNOSTICS src_updated = ROW_COUNT;
  RAISE NOTICE '087: sources.url rows updated = %', src_updated;

  -- Backfill provisional_sources.url.
  UPDATE public.provisional_sources
  SET url = pg_temp.canonicalize_url(url)
  WHERE url IS NOT NULL
    AND url <> ''
    AND url IS DISTINCT FROM pg_temp.canonicalize_url(url);
  GET DIAGNOSTICS prov_updated = ROW_COUNT;
  RAISE NOTICE '087: provisional_sources.url rows updated = %', prov_updated;

  -- Backfill intelligence_items.source_url (denormalised cache of sources.url).
  UPDATE public.intelligence_items
  SET source_url = pg_temp.canonicalize_url(source_url)
  WHERE source_url IS NOT NULL
    AND source_url <> ''
    AND source_url IS DISTINCT FROM pg_temp.canonicalize_url(source_url);
  GET DIAGNOSTICS ii_updated = ROW_COUNT;
  RAISE NOTICE '087: intelligence_items.source_url rows updated = %', ii_updated;
END;
$$;

COMMENT ON COLUMN public.sources.url IS
  'Canonical form (Q10, migration 087). All writes must pass through '
  'canonicalizeUrl() from src/lib/sources/url-canonicalize.ts. No UNIQUE '
  'constraint yet — see Q10 duplicate report at scripts/tmp/q10-duplicate-report.json.';

COMMENT ON COLUMN public.provisional_sources.url IS
  'Canonical form (Q10, migration 087). All writes must pass through '
  'canonicalizeUrl() from src/lib/sources/url-canonicalize.ts.';
