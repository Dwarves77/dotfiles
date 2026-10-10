// ────────────────────────────────────────────────────────────────────────────
// URL canonicalization helper (Q10)
// ────────────────────────────────────────────────────────────────────────────
//
// Source resolution across Caro's Ledge previously operated on URLs as opaque
// strings. Every `.eq("url", urlString)` lookup against `sources` or
// `provisional_sources` performed exact-string comparison, which produced
// silent duplicates whenever a citation differed from the registered URL in
// purely-formatting ways:
//
//   * trailing slash drift   https://example.gov/page/  vs  https://example.gov/page
//   * scheme case drift      HTTPS://example.gov/page   vs  https://example.gov/page
//   * host case drift        https://Example.Gov/page   vs  https://example.gov/page
//   * www prefix drift       https://www.example.gov/   vs  https://example.gov/
//   * default port drift     https://example.gov:443/   vs  https://example.gov/
//   * query param ordering   ?a=1&b=2                   vs  ?b=2&a=1
//   * fragment presence      https://example.gov/p#x    vs  https://example.gov/p
//
// `canonicalizeUrl()` normalises all of the above so two URLs that mean the
// same resource canonicalize to the same string. Resolution sites pass the
// raw URL through this helper before any `.eq("url", ...)` lookup or any
// INSERT into the URL-keyed columns (`sources.url`, `provisional_sources.url`).
//
// What the helper does NOT do (out of scope, surface separately if needed):
//
//   * does NOT resolve path segments like `..` or `.`
//   * does NOT resolve relative URLs against a base
//   * does NOT decode percent-encoded characters in path or query
//   * does NOT strip tracking params (utm_source etc.) — those carry intent
//     that the registry may want to preserve
//   * does NOT touch the path beyond the trailing-slash rule (so case in
//     path segments is preserved, since many sites are case-sensitive in path)
//   * does NOT validate that the URL is reachable
//
// Defensive: if the input is not a parseable URL, the helper returns the
// input string unchanged. Bad URLs pass through without throwing so callers
// can use this helper unconditionally on any string-typed url-shaped field.

/**
 * Canonicalize a URL string for storage and lookup parity.
 *
 * Normalises scheme case, host case, www prefix, default ports, trailing
 * slash, query param ordering, and fragment so two URLs that mean the same
 * resource canonicalize to the same string.
 *
 * Returns the input unchanged if the string is not a parseable URL — bad
 * inputs never throw from this helper.
 *
 * @example
 *   canonicalizeUrl("HTTPS://WWW.Example.GOV:443/Path/?b=2&a=1#sec")
 *   // → "https://example.gov/Path?a=1&b=2"
 *
 * @example
 *   canonicalizeUrl("not a url")
 *   // → "not a url"  (unchanged, defensive pass-through)
 */
export function canonicalizeUrl(rawUrl: string): string {
  if (typeof rawUrl !== "string" || rawUrl.length === 0) {
    return rawUrl;
  }

  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    // Not a parseable URL. Defensive: return unchanged so callers can use
    // this helper on any url-shaped field without worrying about throws.
    return rawUrl;
  }

  // Scheme: lowercase. URL parser already does this, but normalise defensively.
  const scheme = u.protocol.toLowerCase();

  // Host: lowercase + strip www. prefix.
  let host = u.hostname.toLowerCase();
  if (host.startsWith("www.")) {
    host = host.slice(4);
  }

  // Port: strip default port for scheme. The URL parser exposes the port as
  // an empty string when the URL omits it OR when it equals the default;
  // explicitly drop :80 / :443 to be defensive on inputs that included them.
  let port = u.port;
  if ((scheme === "http:" && port === "80") || (scheme === "https:" && port === "443")) {
    port = "";
  }

  // Path: trim a single trailing slash, but preserve root "/". Empty path
  // is normalised to "/" by URL parser already; we leave that alone.
  let path = u.pathname;
  if (path.length > 1 && path.endsWith("/")) {
    path = path.replace(/\/+$/, "") || "/";
  }

  // Query: sort params alphabetically. URLSearchParams iteration order is
  // insertion order, so we rebuild from a sorted entries list. Preserves
  // duplicate keys (e.g. ?a=1&a=2) in their relative order.
  let query = "";
  if (u.search.length > 0) {
    const params = Array.from(u.searchParams.entries());
    params.sort((a, b) => {
      if (a[0] < b[0]) return -1;
      if (a[0] > b[0]) return 1;
      return 0;
    });
    const usp = new URLSearchParams();
    for (const [k, v] of params) {
      usp.append(k, v);
    }
    const qs = usp.toString();
    if (qs.length > 0) {
      query = "?" + qs;
    }
  }

  // Fragment: strip entirely. Fragments are client-side and do not change
  // the resource identity from a server's perspective.
  // (no-op; we just don't include u.hash in the rebuild)

  // Rebuild. We avoid u.toString() because it would re-introduce the
  // pre-normalised port/host/etc.
  const authority = port.length > 0 ? `${host}:${port}` : host;
  return `${scheme}//${authority}${path}${query}`;
}
