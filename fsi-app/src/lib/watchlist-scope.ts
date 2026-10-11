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
