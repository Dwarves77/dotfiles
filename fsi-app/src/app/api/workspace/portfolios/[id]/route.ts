import { NextRequest, NextResponse } from "next/server";
import { withErrorCapture } from "@/lib/telemetry/capture-error";
import { requireOrgWriter } from "@/lib/api/org";
import { deletePortfolio, renamePortfolio } from "@/lib/portfolio/portfolio-core.mjs";
import { readPortfolioDetail } from "@/lib/portfolio/read";
import { portfolioResponse, readJsonBody, resolvePortfolioCaller } from "@/lib/portfolio/route-support";

// /api/workspace/portfolios/[id] (lane S8-D, 2026-10-07; spec 00 section 5; migration 362).
//
// GET    : one portfolio with its members hydrated, grouped by surface, and the roll-ups computed at read
//          time from held data only (each carries its held-over-total denominator).
// PATCH  : rename. Body { name }.
// DELETE : delete the portfolio; its members go with it.
//
// A portfolio id from another workspace answers 404, exactly like a missing one: every statement is
// filtered by the caller's own org.

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function handleGET(request: NextRequest, context: RouteContext) {
  const caller = await resolvePortfolioCaller(request);
  if (caller instanceof NextResponse) return caller;
  const { id } = await context.params;
  const res = await readPortfolioDetail(caller.sb, caller.orgId, id, new Date());
  if (!res.ok) return portfolioResponse(caller.userId, res);
  if (!res.view) return portfolioResponse(caller.userId, { ok: false, status: 404, error: "Portfolio not found in your workspace" });
  return portfolioResponse(caller.userId, { ok: true, ...res.view });
}

async function handlePATCH(request: NextRequest, context: RouteContext) {
  const caller = await resolvePortfolioCaller(request);
  if (caller instanceof NextResponse) return caller;
  // SEC-3b: a viewer reads portfolios but does not write them (the service-role client bypasses RLS).
  const writer = await requireOrgWriter(caller.userId, caller.orgId, caller.sb);
  if ("response" in writer) return writer.response;
  const { id } = await context.params;
  const body = await readJsonBody(request);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  return portfolioResponse(caller.userId, await renamePortfolio(caller.sb, { orgId: caller.orgId, portfolioId: id, name: body.name }));
}

async function handleDELETE(request: NextRequest, context: RouteContext) {
  const caller = await resolvePortfolioCaller(request);
  if (caller instanceof NextResponse) return caller;
  // SEC-3b: a viewer reads portfolios but does not write them (the service-role client bypasses RLS).
  const writer = await requireOrgWriter(caller.userId, caller.orgId, caller.sb);
  if ("response" in writer) return writer.response;
  const { id } = await context.params;
  return portfolioResponse(caller.userId, await deletePortfolio(caller.sb, { orgId: caller.orgId, portfolioId: id }));
}

export const GET = withErrorCapture("/api/workspace/portfolios/[id]", handleGET);
export const PATCH = withErrorCapture("/api/workspace/portfolios/[id]", handlePATCH);
export const DELETE = withErrorCapture("/api/workspace/portfolios/[id]", handleDELETE);
