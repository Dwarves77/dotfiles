import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Routes that don't require authentication.
// /privacy is public by design (Wave-α A7, CODE-4b F2): the page declares
// robots index:true and a privacy policy must be readable before signup
// (GDPR/CCPA notice-at-collection). It was previously 307'd to /login.
const PUBLIC_ROUTES = ["/login", "/signup", "/auth/callback", "/privacy"];

// perf item #9: scanner/probe short-circuit. Production logs show repeated
// hits to WordPress/PHP admin paths (this app runs neither) — each one
// previously ran the full proxy body (Supabase client construction +
// auth.getUser() round trip) before falling through to a 307 redirect.
// That burns a Supabase call and a function invocation on traffic that can
// never be a real user. Bail out to a plain 404 before any of that runs.
//
// DELIBERATELY NARROW: a false positive here 404s a real page, so this list
// only matches path PREFIXES that are exclusively WordPress/PHP territory —
// never a plausible route in this Next.js app — plus the literal `.php`
// extension. Do not broaden this list without checking it against the
// app's actual route table.
const SCANNER_PROBE_PREFIXES = [
  "/wp-admin",
  "/wp-includes",
  "/wp-content",
  "/wp-login",
  "/xmlrpc.php",
];

function isScannerProbe(pathname: string): boolean {
  return (
    SCANNER_PROBE_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    pathname.endsWith(".php")
  );
}

export async function proxy(request: NextRequest) {
  // Short-circuit BEFORE any auth/session logic — see comment above.
  if (isScannerProbe(request.nextUrl.pathname)) {
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

  // Refresh the auth session. GUARDED (diagnosis 2026-07-13): under a Supabase-auth saturation spike (the
  // detail-route prefetch fan-out), an unguarded getUser() REJECTS → middleware throws → platform 503,
  // bypassing every downstream fail-closed handler. Catch it and treat the request as unauthenticated:
  // protected routes then fall through to the /login redirect below — a graceful redirect, not a 503.
  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"] = null;
  try {
    ({ data: { user } } = await supabase.auth.getUser());
  } catch (e) {
    console.warn("[proxy] auth.getUser() failed (Supabase unreachable / saturated):", e instanceof Error ? e.message : String(e));
  }

  const pathname = request.nextUrl.pathname;

  // Allow public routes
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    // If user is already logged in and hits login/signup, redirect to dashboard
    if (user && (pathname === "/login" || pathname === "/signup")) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // Allow static assets and API routes (API routes have their own auth)
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/robots.txt" ||
    pathname === "/favicon.ico"
  ) {
    return supabaseResponse;
  }

  // Protected routes: redirect to login if not authenticated.
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
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
