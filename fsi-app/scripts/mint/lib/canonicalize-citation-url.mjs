// canonicalize-citation-url.mjs — JS port of public.canonicalize_citation_url(text), the IMMUTABLE SQL
// helper added by supabase/migrations/150_criterion2_url_canonicalize.sql and used by validate_item_
// provenance criterion 2 (citation-URL grounding) on ALL THREE compare sides: item.source_url, the
// agent_run_searches.result_url pool, and the sources registry. Ported here so the local validator's
// criterion-2 check matches the live gate's semantics exactly (lowercase, strip trailing markdown-emphasis
// `*`/backtick, strip a leading `www.`, strip a trailing run of `/.,;:`). Live SQL (migration 150):
//
//   CREATE FUNCTION public.canonicalize_citation_url(u text) RETURNS text IMMUTABLE STRICT AS $$
//     SELECT regexp_replace(
//       regexp_replace(
//         regexp_replace(lower(btrim(u)), '[*`]+$', ''),
//         '^(https?://)www\.', '\1'
//       ),
//       '[/.,;:]+$', ''
//     );
//   $$;
//
// Keep this function byte-for-byte equivalent to the SQL above; if migration 150 (or a later migration
// that further revises canonicalize_citation_url) changes, update both this file and its docstring.

export function canonicalizeCitationUrl(u) {
  let s = String(u ?? "").trim().toLowerCase();
  s = s.replace(/[*`]+$/, "");
  s = s.replace(/^(https?:\/\/)www\./, "$1");
  s = s.replace(/[/.,;:]+$/, "");
  return s;
}
