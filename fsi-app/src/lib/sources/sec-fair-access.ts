// SEC fair-access User-Agent helper.
//
// Re-homed here 2026-07-18 (dormant-systems purge P-5) out of the retired rss-fetch.ts transport.
// This helper has no RSS dependency; it is a pure host-check consumed by the scrape path
// (browserless.ts). It stayed live when the RSS transport around it was ruled dead and deleted.

/**
 * SEC fair-access policy requires a `User-Agent` of the form
 * `Sample Company AdminContact@sample.com` for all programmatic access.
 * Returns the env-configured UA when the URL host is sec.gov (or a
 * subdomain), otherwise returns null so the caller uses its default UA.
 *
 * Centralised so the scrape path can apply the same logic without
 * duplicating host parsing.
 */
export function secFairAccessUaForUrl(url: string): string | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (host !== "sec.gov" && !host.endsWith(".sec.gov")) return null;
  const ua = process.env.SEC_FAIR_ACCESS_UA;
  return ua && ua.trim().length > 0 ? ua : null;
}
