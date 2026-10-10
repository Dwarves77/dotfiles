/** Which column a detail-page `[slug]` value addresses, decided by SHAPE, never by composing a filter string.
 *  Lane R21 (remediation plan 2026-09-30, CF-SEC-15).
 *
 *  THE DEFECT THIS REPLACES: three read sites built a PostgREST `.or()` expression by interpolating the URL
 *  slug (`legacy_id.eq.${id},id.eq.${id}`). PostgREST parses `,` `(` `)` `.` inside an `.or()` string as filter
 *  structure, so a crafted slug could append or alter filter terms (an injection, not a parameter). `.eq(col, v)`
 *  sends the value as one parameter and cannot change the filter's shape.
 *
 *  A uuid-shaped value matches `id`; anything else matches `legacy_id`. Both are exact, single-column filters
 *  (a legacy_id is never uuid-shaped, so nothing resolvable is lost versus the old either/or). Pure, importing
 *  only id-redirect.ts's own shape predicate so it loads under plain `node --test`. */

import { isItemUuid } from "./id-redirect.ts";

type ItemIdColumn = "id" | "legacy_id";

export function itemIdColumn(value: string): ItemIdColumn {
  return isItemUuid(value) ? "id" : "legacy_id";
}
