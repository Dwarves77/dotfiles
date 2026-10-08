// logic.ts for POST /api/dashboard/coverage/request (lane COV-1, 2026-10-08). Route files export only handlers (F34).
//
// "Request coverage" on a named coverage gap writes ONE coverage_gap row to the existing platform-flag channel
// (integrity_flags, migration 048) through src/lib/coverage/request-coverage.mjs, which is the writer. This is a
// request for coverage, not customer data: the body is a page path and a short label, both validated.
//
// Authenticated and rate-limited by the shared guard. Any signed-in reader may ask; a viewer role is not
// withheld, because the write is to a platform queue, not to a workspace table.

import { NextRequest, NextResponse } from "next/server";
import { requireUserRoute, isRefusal, type UserRouteDeps } from "@/lib/api/route-guard";
import { rateLimitHeaders } from "@/lib/api/rate-limit";
import { recordCoverageRequest, validateCoverageRequest } from "@/lib/coverage/request-coverage.mjs";

export interface RequestRouteDeps extends UserRouteDeps {
  serviceClient: () => Parameters<typeof recordCoverageRequest>[0];
}

export async function handleCoverageRequest(request: NextRequest, deps: RequestRouteDeps): Promise<NextResponse> {
  const user = await requireUserRoute(request, deps);
  if (isRefusal(user)) return user;
  const headers = rateLimitHeaders(user.userId);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a JSON body with subjectRef and label." }, { status: 400, headers });
  }
  const parsed = validateCoverageRequest(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400, headers });

  let result;
  try {
    result = await recordCoverageRequest(deps.serviceClient(), parsed.value);
  } catch {
    result = { ok: false as const, error: "Could not record the request." };
  }
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503, headers });
  return NextResponse.json({ ok: true, already: result.already }, { status: result.already ? 200 : 201, headers });
}
