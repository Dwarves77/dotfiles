import { NextRequest, NextResponse } from "next/server";
import { withErrorCapture } from "@/lib/telemetry/capture-error";
import { requireOrgWriter } from "@/lib/api/org";
import { addMember, removeMember } from "@/lib/portfolio/portfolio-core.mjs";
import { portfolioResponse, readJsonBody, resolvePortfolioCaller } from "@/lib/portfolio/route-support";
import { resolveItemUuid } from "@/lib/tags/server";

// /api/workspace/portfolios/[id]/members (lane S8-D, 2026-10-07; spec 00 section 5; migration 362).
//
// POST   : add ONE held thing to the portfolio. Body { itemId } (an item uuid or its legacy id) or
//          { entityId } (cl:<kind>:<id>, a corridor or any other spine entity). Held means the item is
//          verified and not archived, or the entity is active (a merged entity is followed to its
//          survivor; a retired one is refused). Adding what is already a member is not an error: it
//          answers 200 with `existed: true` and the same record, however many surfaces add it.
// DELETE : remove ONE member. Same body. Removing what is absent is not an error.
//
// A selection of held things, never customer-entered data (ADR-042). The org comes from the session.

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** The legacy-id form of itemId resolves to the uuid first (the same helper the tag routes use). */
async function normaliseInput(sb: Parameters<typeof resolveItemUuid>[0], body: Record<string, unknown>) {
  if (typeof body.itemId === "string" && body.itemId.length > 0) {
    const uuid = await resolveItemUuid(sb, body.itemId);
    return { ...body, itemId: uuid ?? body.itemId };
  }
  return body;
}

async function handlePOST(request: NextRequest, context: RouteContext) {
  const caller = await resolvePortfolioCaller(request);
  if (caller instanceof NextResponse) return caller;
  // SEC-3b: a viewer reads portfolios but does not write them (the service-role client bypasses RLS).
  const writer = await requireOrgWriter(caller.userId, caller.orgId, caller.sb);
  if ("response" in writer) return writer.response;
  const { id } = await context.params;
  const body = await readJsonBody(request);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  const result = await addMember(caller.sb, {
    orgId: caller.orgId,
    userId: caller.userId,
    portfolioId: id,
    input: await normaliseInput(caller.sb, body),
  });
  return portfolioResponse(caller.userId, result, result.ok && !result.existed ? 201 : 200);
}

async function handleDELETE(request: NextRequest, context: RouteContext) {
  const caller = await resolvePortfolioCaller(request);
  if (caller instanceof NextResponse) return caller;
  // SEC-3b: a viewer reads portfolios but does not write them (the service-role client bypasses RLS).
  const writer = await requireOrgWriter(caller.userId, caller.orgId, caller.sb);
  if ("response" in writer) return writer.response;
  const { id } = await context.params;
  const body = await readJsonBody(request);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  return portfolioResponse(
    caller.userId,
    await removeMember(caller.sb, { orgId: caller.orgId, portfolioId: id, input: await normaliseInput(caller.sb, body) })
  );
}

export const POST = withErrorCapture("/api/workspace/portfolios/[id]/members", handlePOST);
export const DELETE = withErrorCapture("/api/workspace/portfolios/[id]/members", handleDELETE);
