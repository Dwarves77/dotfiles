// POST /api/telemetry/error — client-side error ingest (Wave-β R0.2).
//
// Receives window.onerror / onunhandledrejection / React error-boundary
// reports from GlobalErrorReporter and writes them to error_events (migration
// 195) via the service-role captureError() lib. First-party by design: no
// Sentry, no third-party collector.
//
// Auth: requireAuth per the repo-wide API security policy (all routes
// authenticate; the app is auth-walled, so authed sessions are where client
// errors happen). KNOWN LIMIT, accepted: errors on the pre-auth pages
// (/login, /signup) are not captured — recorded as an R0.2 deviation rather
// than opening an unauthenticated public ingest endpoint.
//
// Abuse bounds: the shared per-user rate limit (60/min) applies, the client
// reporter additionally self-limits per session, the body is size-capped
// before parse, and every field is clamped in captureError. The stack hash is
// computed server-side, so a client cannot inject rows into another group's
// identity beyond what its own payload hashes to.
//
// This route NEVER fails the caller for telemetry reasons: capture failures
// are swallowed inside captureError (the permitted telemetry-loss swallow
// class — see src/lib/telemetry/capture-error.ts header) and the route
// returns 204 regardless.

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { captureError } from "@/lib/telemetry/capture-error";

export const dynamic = "force-dynamic";

// Bounded payload: a legitimate error report is well under this; anything
// larger is malformed or abusive and gets rejected before JSON.parse.
const BODY_MAX_BYTES = 32 * 1024;

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  let payload: { message?: unknown; stack?: unknown; path?: unknown } = {};
  try {
    const raw = await request.text();
    if (raw.length > BODY_MAX_BYTES) {
      return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    }
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const message = typeof payload.message === "string" ? payload.message : "";
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }
  const stack = typeof payload.stack === "string" ? payload.stack : null;
  const path = typeof payload.path === "string" ? payload.path : "";

  await captureError({
    side: "client",
    route: path,
    error: message,
    stack,
    // user_scope stays null on the client path: deriving the org id would
    // cost a lookup per error and the column is org-only by design (no PII).
    userScope: null,
  });

  return new NextResponse(null, { status: 204 });
}
