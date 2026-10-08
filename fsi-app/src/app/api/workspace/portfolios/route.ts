import { NextRequest, NextResponse } from "next/server";
import { withErrorCapture } from "@/lib/telemetry/capture-error";
import { requireOrgWriter } from "@/lib/api/org";
import { createPortfolio, listPortfolios } from "@/lib/portfolio/portfolio-core.mjs";
import { portfolioResponse, readJsonBody, resolvePortfolioCaller } from "@/lib/portfolio/route-support";

// /api/workspace/portfolios (lane S8-D, 2026-10-07; spec 00 section 5; migration 362).
//
// GET  : the caller's workspace portfolios, newest first, each with its member count. Bounded: the
//        database caps a workspace at 100 portfolios, and the count read is capped (the response says
//        `countsTruncated` when the cap was hit).
// POST : create a portfolio. Body { name }. A case-insensitive duplicate name returns the EXISTING
//        portfolio with `existed: true` (the same record, spec 00 section 8 assertion 14).
//
// The org is resolved on the server from org_memberships, never from the request. The rules live in
// src/lib/portfolio/portfolio-core.mjs so they are proven with a fake client under node --test.

async function handleGET(request: NextRequest) {
  const caller = await resolvePortfolioCaller(request);
  if (caller instanceof NextResponse) return caller;
  return portfolioResponse(caller.userId, await listPortfolios(caller.sb, caller.orgId));
}

async function handlePOST(request: NextRequest) {
  const caller = await resolvePortfolioCaller(request);
  if (caller instanceof NextResponse) return caller;
  // SEC-3b: a viewer reads portfolios but does not write them (the service-role client bypasses RLS).
  const writer = await requireOrgWriter(caller.userId, caller.orgId, caller.sb);
  if ("response" in writer) return writer.response;
  const body = await readJsonBody(request);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  const result = await createPortfolio(caller.sb, { orgId: caller.orgId, userId: caller.userId, name: body.name });
  return portfolioResponse(caller.userId, result, result.ok && !result.existed ? 201 : 200);
}

export const GET = withErrorCapture("/api/workspace/portfolios", handleGET);
export const POST = withErrorCapture("/api/workspace/portfolios", handlePOST);
