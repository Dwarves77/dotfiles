// recent-changes-window.mjs -- the What-changed feed's day window, decided by the scrape cadence.
//
// Operator ruling (2026-09-13): "I want data in the what's changed section so we can see it working.
// Hold data there until we start regular updates to data." In build mode (CLAUDE.md rule 16,
// system_state.scrape_cadence = 'off') the corpus changes only on explicit dispatches, days apart, so a
// moving 7-day window empties the card between batches. While the cadence is off the feed reads a
// 90-day window; the moment a cadence is set the window returns to 7 days without a code change.
// Pure; the caller (src/lib/supabase-server.ts) reads the cadence and passes it in.

export const BUILD_MODE_WINDOW_DAYS = 90;
export const LIVE_WINDOW_DAYS = 7;

/**
 * @param {string | null | undefined} cadence system_state.scrape_cadence ('off' in build mode)
 * @returns {number} days passed as p_days to get_workspace_recent_changes
 */
export function recentChangesWindowDays(cadence) {
  return cadence === "off" || cadence == null ? BUILD_MODE_WINDOW_DAYS : LIVE_WINDOW_DAYS;
}
