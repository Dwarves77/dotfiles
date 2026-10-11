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
