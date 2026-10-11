import { NextRequest, NextResponse } from "next/server";
import { captureError } from "@/lib/telemetry/capture-error";
import { isRefusal, requireUserRoute } from "@/lib/api/route-guard";

export const dynamic = "force-dynamic";

// Bounded payload: a legitimate error report is well under this; anything
// larger is malformed or abusive and gets rejected before JSON.parse.
const BODY_MAX_BYTES = 32 * 1024;

export async function POST(request: NextRequest) {
  const auth = await requireUserRoute(request);
  if (isRefusal(auth)) return auth;

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
