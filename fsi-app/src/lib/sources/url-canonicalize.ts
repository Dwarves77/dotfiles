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
