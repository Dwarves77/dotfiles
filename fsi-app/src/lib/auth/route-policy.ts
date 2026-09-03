// route-policy.ts — pure routing decision for src/proxy.ts (Next 16 middleware), PERF-2 lane
// (2026-09-03, docs/audits/perf-load-times-2026-09-03.md §8).
//
// WHY THIS EXISTS. proxy.ts previously inlined this decision (public route? static/api passthrough?
// scanner probe? authenticated?) directly in the middleware function body, alongside the Supabase client
// construction and the auth network call — meaning the only way to prove "a protected route with no
// session redirects to /login" was to run the whole Next middleware, which `node --test` cannot do
// (proxy.ts value-imports `@supabase/ssr`'s createServerClient and next/server's NextResponse; neither
// resolves outside Next's own bundler the same way next/cache does not — see
// src/lib/detail/load-detail-core.ts's header for the identical, already-proven reasoning). Splitting the
// decision out into a PURE function (no framework imports, takes a plain `{ pathname, authenticated }`
// input, returns a plain action descriptor) makes the full public/static/api/protected ×
// claim-present/absent/expired matrix testable by a plain `node --test` proof
// (route-policy.test.mjs) — proxy.ts becomes a thin wiring layer: build `authenticated` from
// supabase.auth.getClaims() (see proxy.ts's own header for why getClaims() replaces getUser()), call
// decideRoute, switch on the returned action.
//
// SCOPE: this module owns the SAME decision proxy.ts always made — it changes nothing about which routes
// are public, which are passthrough, or when a redirect fires. It is a pure extraction, not a behavior
// change.

/** Routes that don't require authentication. /privacy is public by design (Wave-α A7, CODE-4b F2): the
 *  page declares robots index:true and a privacy policy must be readable before signup (GDPR/CCPA
 *  notice-at-collection). */
export const PUBLIC_ROUTES = ["/login", "/signup", "/auth/callback", "/privacy"];

// perf item #9: scanner/probe short-circuit. Production logs show repeated hits to WordPress/PHP admin
// paths (this app runs neither) — each one previously ran the full proxy body (Supabase client
// construction + an auth network round trip) before falling through to a 307 redirect. Bail out to a
// plain 404 before any of that runs.
//
// DELIBERATELY NARROW: a false positive here 404s a real page, so this list only matches path PREFIXES
// that are exclusively WordPress/PHP territory — never a plausible route in this Next.js app — plus the
// literal `.php` extension. Do not broaden this list without checking it against the app's actual route
// table.
export const SCANNER_PROBE_PREFIXES = ["/wp-admin", "/wp-includes", "/wp-content", "/wp-login", "/xmlrpc.php"];

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

export type RouteDecision =
  | { action: "scanner-404" }
  | { action: "allow" }
  /** An authenticated viewer hit /login or /signup — bounce to the dashboard instead of showing the
   *  auth form again. */
  | { action: "redirect-home" }
  /** A protected route with no authenticated viewer — bounce to /login, preserving the original path
   *  as the post-login return target (consumed by safe-return-path.mjs's sanitizeReturnPath). */
  | { action: "redirect-login"; redirectTo: string };

export interface RouteDecisionInput {
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
