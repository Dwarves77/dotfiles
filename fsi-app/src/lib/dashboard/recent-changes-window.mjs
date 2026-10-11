export const BUILD_MODE_WINDOW_DAYS = 90;
export const LIVE_WINDOW_DAYS = 7;

/**
 * @param {string | null | undefined} cadence the scrape cadence read by readScrapeState ('off' in build mode)
 * @returns {number} days passed as p_days to get_workspace_recent_changes
 */
export function recentChangesWindowDays(cadence) {
  return cadence === "off" || cadence == null ? BUILD_MODE_WINDOW_DAYS : LIVE_WINDOW_DAYS;
}
