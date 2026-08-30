/**
 * watchlist-scope.ts — the single, dependency-free home for "which watchlist
 * item types are TEAM SCOPE ONLY", shared across the client/server boundary.
 *
 * WHY THIS MODULE EXISTS (L6, WO-23 follow-up). market_series (migration 270)
 * is watchable at TEAM scope (org_watchlist) only: user_watchlist's CHECK was
 * deliberately not widened, and /api/watchlist/route.ts's isTeamOnlyScopeViolation
 * rejects a personal-scope market_series write with a clean 400 instead of
 * letting it hit the CHECK and surface as a raw Postgres 500.
 *
 * That decision used to live ONLY inside route.ts. WatchButton.tsx (a
 * "use client" component, src/components/ui/WatchButton.tsx) needs the SAME
 * decision so it never renders a personal watch control the API will reject
 * — a button offering an action the server refuses is broken, not merely
 * incomplete. But route.ts is not safe for a client component to import: it
 * pulls in getServiceSupabase, next/cache's revalidateTag, requireAuth and
 * other genuinely server-only runtime code. Unlike WatchlistItemType (a pure
 * TYPE, erased by `import type` — see WatchButton.tsx and watchlist-links.ts
 * for that precedent), isTeamOnlyScopeViolation is a real function the button
 * must CALL at runtime, so a type-only import cannot carry it across the
 * boundary. This module holds nothing but the vocabulary and pure decisions
 * — zero imports, zero I/O — so both sides can depend on it directly:
 * route.ts imports and re-exports TEAM_ONLY_TYPES/isTeamOnlyScopeViolation
 * under their existing names (its own tests, route.npmtest.mjs, import them
 * straight from route.ts and keep passing unchanged), and WatchButton.tsx
 * imports isTeamOnlyWatchType to decide what to render.
 */

/**
 * item_types watchable at TEAM scope (org_watchlist) only, never personal
 * (user_watchlist). market_series (WO-23, migration 270) is the only member
 * today: org_watchlist's CHECK admits it, user_watchlist's deliberately does
 * not.
 */
export const TEAM_ONLY_TYPES: ReadonlySet<string> = new Set(["market_series"]);

/** True when `itemType` may only be watched at scope=team, never personal. */
export function isTeamOnlyWatchType(itemType: string): boolean {
  return TEAM_ONLY_TYPES.has(itemType);
}

/**
 * The real scope-conditional decision: does this (itemType, scope) pair
 * violate the team-only rule? route.ts's POST/DELETE handlers use this to
 * reject a write with a clean 400; WatchButton uses isTeamOnlyWatchType
 * (itemType alone, scope is a UI branch not a request) to decide what to
 * render in the first place — same underlying vocabulary, one function each
 * side actually needs.
 */
export function isTeamOnlyScopeViolation(itemType: string, scope: string): boolean {
  return isTeamOnlyWatchType(itemType) && scope !== "team";
}
