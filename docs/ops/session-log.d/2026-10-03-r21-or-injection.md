# 2026-10-03, lane R21 (PostgREST .or() filter injection, CF-SEC-15)

Dispatch: remediation plan 2026-09-30, section 21.

## Built

- `fsi-app/src/lib/detail/item-id-filter.ts` (new, pure): `itemIdColumn(value)` returns `id` for a uuid-shaped
  value, else `legacy_id`; callers use `.eq(column, value)`, one parameter, never a composed filter string.
  Importers: `operations/[slug]/page.tsx`, `research/[slug]/page.tsx`, `lib/supabase-server.ts`.
- `fsi-app/src/lib/community/search-merge.ts` (new, pure): `unionByRecency`; importer
  `api/community/search/route.ts`, which now issues one `.ilike(column, pattern)` read per column
  (title/body, name/description) and unions in JS instead of two `.or()` strings.
- `operations/[slug]` and `research/[slug]` self-lookup: `.or(orExpr)` replaced by `.eq(itemIdColumn(id), id)` plus
  the missing `.eq("provenance_status", "verified")` (same column/value as `fetchIntelligenceItem` and the
  related-item reads on the same page).
- `fsi-app/src/lib/supabase-server.ts` `fetchIntelligenceItemUncached` (same class, found by grep, outside the
  plan's three-file write set, fix is a two-line swap): `legacy_id.eq.${itemUiId}` was interpolated unvalidated
  (only the uuid half was shape-checked); now the same `.eq(itemIdColumn(...))`.
- Test `fsi-app/src/lib/detail/item-id-filter.test.mjs` (non-bracket path, F65): crafted inputs with `, ( ) .`
  resolve to a single `legacy_id` eq; union semantics; source guard that none of the sites contains `.or(` on input.

## Other `.or(` sites reviewed (not changed)

`check-sources/route.ts:94` (server-computed timestamp), `canonical-pipeline.ts:740` (internal item uuid),
`supabase-server.ts` cross-reference/supersession reads (`row.id` from the DB), `portal-harvest.ts:292`
(operator CLI keyset cursor, not request input), `RESEARCH_CANDIDATE_OR` (constant).

## Read and reused

Read in full: the three write-set files; reused the safe pattern from `api/workspace/archive-impact/route.ts`
(branch on shape, `.eq`) and `isItemUuid` from `lib/detail/id-redirect.ts` (the one uuid predicate, no new regex);
`provenance_status='verified'` taken from `supabase-server.ts` `fetchIntelligenceItemUncached`.

## UX compliance

Query-only change. No component, markup, copy, layout or interaction changed on any screen; `.tsx` edits are
two data-read filters in server pages. Primary goal, path, primary action and async feedback states are
unchanged. The one behavioural effect: an unverified item's related-items strip on `/operations/[slug]` and
`/research/[slug]` now renders its empty state, the same gate the page's main read already applies.
