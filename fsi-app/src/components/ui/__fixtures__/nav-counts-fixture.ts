/**
 * nav-counts-fixture.ts (lane W10-NavCard, 2026-09-23, parts-brief 2.14 NAV CARD).
 *
 * Frozen corpus-wide counts for the NavCard sign-off page (`/admin/parts/nav-card`), via read-only
 * SELECTs against the live database (project kwrsbpiseruzbfwjpvsp), 2026-09-23:
 *
 *   - surface counts: `select case when item_type in ('regulation','directive','standard',
 *     'guidance','framework') then 'regulations' when item_type in ('market_signal','initiative')
 *     then 'market' when item_type='research_finding' then 'research' when
 *     item_type='regional_data' then 'operations' else 'other' end as surface, count(*) from
 *     intelligence_items where is_archived=false and provenance_status='verified' group by 1`,
 *     regulations 1319, market 62, research 32, operations 23.
 *   - community rooms: `select count(*) from community_groups`, 7 (matches nav-counts.ts's own
 *     comment, "COUNTS-61 ... the /community page's own header states" regional rooms).
 *   - byPriority: `select priority, count(*) from intelligence_items where is_archived=false and
 *     provenance_status='verified' group by 1`, CRITICAL 22, HIGH 41, MODERATE 1018, LOW 359.
 *   - watchlist: `select count(*) from org_watchlist`, 0, genuinely empty at capture time; an
 *     honest real value, not invented (operator ruling: "fixtures read from a frozen real record,
 *     never invented strings").
 *
 * These are corpus-wide totals, not one workspace's per-org counts (org_watchlist has no rows to
 * scope by org today), the same shape getNavCounts() itself falls back to when it can't resolve a
 * per-org read, and the honest reading of "frozen real record" for a nav rail whose four
 * surface counts are corpus-routed, not per-org-filtered, tables.
 */

import type { NavCounts } from "@/lib/nav/nav-counts";

export const NAV_COUNTS_FIXTURE_DATE = "2026-09-23";
export const NAV_COUNTS_FIXTURE_PROJECT = "kwrsbpiseruzbfwjpvsp";

export const NAV_COUNTS_FIXTURE: NavCounts = {
  regulations: 1319,
  market: 62,
  research: 32,
  operations: 23,
  community: 7,
  watchlist: 0,
  byPriority: { CRITICAL: 22, HIGH: 41, MODERATE: 1018, LOW: 359 },
};
