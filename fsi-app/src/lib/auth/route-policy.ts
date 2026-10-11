const PUBLIC_ROUTES = ["/login", "/signup", "/auth/callback", "/auth/reset-password", "/privacy"];

// perf item #9: scanner/probe short-circuit. Production logs show repeated hits to WordPress/PHP admin
// paths (this app runs neither) — each one previously ran the full proxy body (Supabase client
// construction + an auth network round trip) before falling through to a 307 redirect. Bail out to a
// plain 404 before any of that runs.
//
// DELIBERATELY NARROW: a false positive here 404s a real page, so this list only matches path PREFIXES
// that are exclusively WordPress/PHP territory — never a plausible route in this Next.js app — plus the
// literal `.php` extension. Do not broaden this list without checking it against the app's actual route
// table.
const SCANNER_PROBE_PREFIXES = ["/wp-admin", "/wp-includes", "/wp-content", "/wp-login", "/xmlrpc.php"];

export function isScannerProbe(pathname: string): boolean {
  return SCANNER_PROBE_PREFIXES.some((prefix) => pathname.startsWith(prefix)) || pathname.endsWith(".php");
}

export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => pathname.startsWith(route));
}

/** Static assets and API routes: API routes gate themselves (their own auth), and static/asset paths
 *  need no session at all. The proxy's own `config.matcher` already excludes most of `_next/static`,
 *  `_next/image`, `favicon.ico`, `robots.txt` and common image extensions (see proxy.ts) — this check is
 *  the belt to that matcher's suspenders, covering any `_next/*` or `/api/*` path the matcher's negative
 *  lookahead does not itself exclude (e.g. `_next/data`), not a redundant re-check of what the matcher
 *  already guarantees never reaches here. */
export function isStaticOrApiRoute(pathname: string): boolean {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/robots.txt" ||
    pathname === "/favicon.ico"
  );
}

type RouteDecision =
  | { action: "scanner-404" }
  | { action: "allow" }
  /** An authenticated viewer hit /login or /signup — bounce to the dashboard instead of showing the
   *  auth form again. */
  | { action: "redirect-home" }
  /** A protected route with no authenticated viewer — bounce to /login, preserving the original path
   *  as the post-login return target (consumed by safe-return-path.mjs's sanitizeReturnPath). */
  | { action: "redirect-login"; redirectTo: string };

interface RouteDecisionInput {
  pathname: string;
  /** Whether THIS request carries a valid, unexpired session. proxy.ts derives this from
   *  supabase.auth.getClaims() (fail-closed: any thrown/rejected claims check maps to `false`, matching
   *  the pre-existing catch-and-treat-as-unauthenticated posture the middleware already had for
   *  getUser()). This function takes the already-resolved boolean, not a token or a client, so it has
   *  no I/O of its own — every one of "claim present", "claim absent", and "claim expired" collapses to
   *  the same `authenticated: false` input from THIS function's point of view; proxy.ts's own wiring
   *  test (via route-policy.test.mjs) exercises the "expired" case by simulating getClaims() rejecting,
   *  same as an absent claim. */
  authenticated: boolean;
}

/**
 * The one decision proxy.ts needs per request. Order matters and is preserved exactly from the prior
 * inline logic: scanner probes short-circuit before anything else (cheapest check, most common abuse
 * traffic), then public routes (with the logged-in-user-hits-/login special case), then static/api
 * passthrough, then the protected-route gate.
 */
export function decideRoute({ pathname, authenticated }: RouteDecisionInput): RouteDecision {
  if (isScannerProbe(pathname)) {
    return { action: "scanner-404" };
  }

  if (isPublicRoute(pathname)) {
    if (authenticated && (pathname === "/login" || pathname === "/signup")) {
      return { action: "redirect-home" };
    }
    return { action: "allow" };
  }

  if (isStaticOrApiRoute(pathname)) {
    return { action: "allow" };
  }

  if (!authenticated) {
    return { action: "redirect-login", redirectTo: pathname };
  }

  return { action: "allow" };
}
