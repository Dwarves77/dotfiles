import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { resolveServerBootstrapFromClient, type ServerBootstrap } from "@/lib/api/server-bootstrap";
import { captureError, withErrorCapture } from "@/lib/telemetry/capture-error";

// GET /api/auth/identity — PERF-10 (2026-09-04, root-cause fix,
// docs/decisions/ADR-026-detail-cache-and-viewer-state-split.md Follow-up).
//
// THE ROOT CAUSE THIS ROUTE EXISTS TO REMOVE: src/app/layout.tsx used to call `headers()`
// unconditionally (via BootstrapResolver, PERF-9) to decide whether to run `resolveServerBootstrap()`
// server-side, so every mounted route could seed AuthProvider (nav chrome: signed-in state, org name,
// role, sector profile) on first paint. `headers()`/`cookies()` used ANYWHERE in a route's render
// tree — even inside a `<Suspense fallback={null}>` boundary — makes Next's classical (non-PPR)
// renderer treat the WHOLE route as dynamic (`ƒ`) at build time; PERF-9 measured this directly
// (ADR-026 Context §1): moving the call inside Suspense did NOT move `/privacy` (zero dynamic APIs of
// its own) off `ƒ`, because Suspense only reorders STREAMING for an already-dynamic render — it does
// not create a static/dynamic split without Next 16's `cacheComponents` (evaluated and deferred,
// ADR-026 §2, as a whole-app flag outside this lane's contained write-set).
//
// THE FIX: identity/nav-chrome seeding moves ENTIRELY out of the server render tree into this Route
// Handler, fetched client-side by AuthProvider on mount (see AuthProvider.tsx). A Route Handler's own
// dynamism (this one reads cookies(), so `next build` correctly reports it as `ƒ` too — confirmed in
// the route table) does NOT propagate to any PAGE that merely `fetch()`s it from the browser: only a
// Dynamic API call made DURING a page's OWN server render affects that page's static/dynamic
// classification. Moving the read here is what actually lets a route with no dynamic API of its own
// (`/privacy`, `/login`, `/signup`) build `○`.
//
// NO ANONYMOUS FLASH, same contract BootstrapBoundary.tsx used to document: every consumer of
// AuthContext already renders nothing for `user === null` regardless of whether that's "confirmed
// anonymous" or "not yet seeded" (UserMenu, AppShell's no-workspace banner, AskAssistant's gate) — see
// AuthProvider.tsx's `loading` field. The one consumer that branches on knowing the real state first
// (useAdminAttention) already reads `loading` for exactly this reason. Trading a sometimes-free
// (React cache()-shared) server-side resolve for an always-paid client fetch on every document load is
// a real, honestly-reported latency trade — see this lane's REPORT for the measured cost.
//
// Reuses resolveServerBootstrapFromClient (server-bootstrap.ts) unchanged — this route is a new
// TRANSPORT for the exact same resolution logic /onboarding and /workspace/new already call directly
// server-side for their own (still-dynamic, still-cookie-reading) render, not a reimplementation.
async function handleGET() {
  try {
    const supabase = await createSupabaseServerClient();
    const bootstrap: ServerBootstrap = await resolveServerBootstrapFromClient(supabase);
    return NextResponse.json(bootstrap, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    // Lane AUTH-IDENTITY (2026-09-24): a failed resolution is answered as a FAILURE (503), never as the
    // anonymous 200 shape it used to return. That shape carried `orgId: null`, and the client paired it
    // with the browser's own session user, which is exactly "signed in, no workspace": the false banner
    // and the missing Admin row the operator saw at 16:51Z. The client (identity-loader.ts) retries a
    // non-200 on a bounded schedule. The failure is also recorded in error_events now: before this, a
    // failed lookup here left no trace, which is why the 16:51Z cause could not be read back.
    console.error("[api/auth/identity] resolution failed, answering 503:", e);
    await captureError({ side: "server", route: "/api/auth/identity", error: e });
    return NextResponse.json(
      { error: "identity_lookup_failed" },
      { status: 503, headers: { "Cache-Control": "private, no-store", "Retry-After": "1" } }
    );
  }
}

// R0.2 first-party error tracking: capture thrown failures as error_events groups, then rethrow
// (matching every other route in this codebase's convention). handleGET above captures and answers
// its own resolution failures, so this is a backstop for a failure in NextResponse.json itself.
export const GET = withErrorCapture("/api/auth/identity", handleGET);
