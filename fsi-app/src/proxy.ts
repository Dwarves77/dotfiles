import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { decideRoute } from "@/lib/auth/route-policy";

// The routing DECISION (public/static/api/protected, scanner-probe short-circuit, the
// logged-in-hits-/login bounce) lives in src/lib/auth/route-policy.ts's pure decideRoute() — see that
// module's header for why the split exists (this file value-imports @supabase/ssr and next/server,
// neither resolvable by plain `node --test`, so the decision had to move out to become testable at all).
// This file is now the thin wiring layer: build the Supabase server client, resolve one boolean
// (`authenticated`), call decideRoute, act on the result.

// PERF-2 (2026-09-03, docs/audits/perf-load-times-2026-09-03.md §8): auth.getUser() sent a network round
// trip to Supabase Auth's server on EVERY request this proxy ran on, including every RSC prefetch
// (`?_rsc=...`) — the single largest fixed cost the middleware paid, on the hottest code path in the
// app. auth.getClaims() (supabase-js 2.98+ / @supabase/ssr 0.8+, confirmed present in
// node_modules/@supabase/auth-js/dist/module/GoTrueClient.d.ts) verifies the session's JWT locally
// against the project's cached JWKS instead: per its own JSDoc, "Prefer this method over getUser() which
// always sends a request to the Auth server for each JWT" — this is the Supabase-documented pattern for
// Next middleware, not a workaround. Two properties preserved exactly, both stated in getClaims()'s own
// JSDoc (@supabase/ssr's design.md corroborates the second): (1) "If the user's access token is about to
// expire when calling this function, the user's session will first be refreshed before validating the
// JWT" — the same refresh-then-setAll cookie flow getUser() triggered stays intact; (2) if the project
// signs JWTs with a symmetric secret rather than asymmetric keys, getClaims() "always sends a request
// similar to getUser()" — so the worst case is a wash, never a regression, and the common case (asymmetric
// keys) drops the per-request network round trip entirely.
export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Short-circuit BEFORE any auth/session logic — decideRoute checks this first too, but checking here
  // as well skips constructing the Supabase client at all for scanner traffic (the actual perf win #9
  // was written for), rather than paying that cost and then discarding the result.
  if (decideRoute({ pathname, authenticated: false }).action === "scanner-404") {
    return new NextResponse(null, { status: 404 });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Verify the session (refreshing it first if the access token is about to expire — see header).
  // GUARDED (diagnosis 2026-07-13, unchanged by PERF-2): under a Supabase-auth saturation spike, an
  // unguarded call REJECTING would throw out of the middleware → platform 503, bypassing every
  // downstream fail-closed handler. Catch it and treat the request as unauthenticated: protected routes
  // then fall through to the /login redirect below — a graceful redirect, not a 503.
  let authenticated = false;
  try {
    const { data, error } = await supabase.auth.getClaims();
    authenticated = !error && !!data?.claims;
  } catch (e) {
    console.warn("[proxy] auth.getClaims() failed (Supabase unreachable / saturated):", e instanceof Error ? e.message : String(e));
  }

  const decision = decideRoute({ pathname, authenticated });

  switch (decision.action) {
    case "scanner-404":
      // Unreachable in practice (already handled above before the Supabase client was even built) —
      // kept so this switch stays exhaustive over RouteDecision without an `as never` cast.
      return new NextResponse(null, { status: 404 });
    case "redirect-home": {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
    case "redirect-login": {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("redirect", decision.redirectTo);
      return NextResponse.redirect(url);
    }
    case "allow":
      return supabaseResponse;
  }
}

export const config = {
  matcher: [
    // `.well-known/workflow/` is excluded so this proxy handler never
    // intercepts the Workflow DevKit's internal queue request (e.g.
    // POST /.well-known/workflow/v1/flow). Per @workflow/next docs this is
    // easy to miss in Next.js 16 where proxy.ts replaced middleware.ts; the
    // symptom is a "[local world] Queue operation failed" / detached
    // ArrayBuffer error and a failing `npx workflow health`. (Sprint 4 1.0b)
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|.well-known/workflow/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
