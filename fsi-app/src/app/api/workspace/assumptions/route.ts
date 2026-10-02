import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase-service";
import { isRefusal, requireUserRoute } from "@/lib/api/route-guard";
import { rateLimitHeaders } from "@/lib/api/rate-limit";
import { resolveOrgIdFromUserId } from "@/lib/api/org";
import { withErrorCapture } from "@/lib/telemetry/capture-error";
import { listAssumptions, createAssumption, updateAssumption, deleteAssumption } from "./logic";

// /api/workspace/assumptions, the per-tenant planning-assumption register (docs/specs/03-research.md
// section 5, migration 345's planning_assumption_register). NOT the same table as the existing
// `assumption_register` (migration 271, WO-20's register for modelling constants this product
// chose, read-only, no workspace scoping). See src/lib/assumptions/contract.mjs's header for the
// correction history; this route is the write-and-read surface for the NEW per-tenant object spec
// 03-research.md section 10 names as "Absent. Per-tenant object does not exist" before this lane.
//
// GET, list the caller's workspace assumptions.
// POST, create one. Body: the AssumptionInput shape (see contract.mjs).
// PATCH, update one. Body: { id, ...AssumptionInput }.
// DELETE, remove one. Body: { id }.
//
// Member self-service (same posture as workspace_tags, migration 313): any org member may read,
// create, update, or delete their workspace's assumptions; org-scoping is enforced twice, once by
// this route's explicit .eq("org_id", orgId), once by RLS at the table (belt-and-suspenders, not a
// substitute for either).

/** Auth + org resolution shared by all four handlers below, collapsed to one definition so the
 *  "authenticate, get a service client, resolve the caller's org or 403" sequence is not hand-copied
 *  four times in this file (F45 duplicate-code). Returns a refusal Response, or the resolved
 *  {userId, orgId, supabase} the handler needs next. */
async function resolveAuthedOrg(
  request: NextRequest
): Promise<NextResponse | { userId: string; orgId: string; supabase: ReturnType<typeof getServiceSupabase> }> {
  const auth = await requireUserRoute(request);
  if (isRefusal(auth)) return auth;

  const supabase = getServiceSupabase();
  const orgId = await resolveOrgIdFromUserId(supabase, auth.userId);
  if (!orgId) {
    return NextResponse.json({ error: "User has no organization membership" }, { status: 403 });
  }
  return { userId: auth.userId, orgId, supabase };
}

function parseJsonBody(request: NextRequest): Promise<Record<string, unknown> | NextResponse> {
  return request.json().then(
    (body) => body as Record<string, unknown>,
    () => NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  );
}

async function handleGET(request: NextRequest) {
  const ctx = await resolveAuthedOrg(request);
  if (isRefusal(ctx)) return ctx;

  const result = await listAssumptions(ctx.supabase, ctx.orgId);
  return NextResponse.json(result.body, { status: result.status, headers: rateLimitHeaders(ctx.userId) });
}

async function handlePOST(request: NextRequest) {
  const ctx = await resolveAuthedOrg(request);
  if (isRefusal(ctx)) return ctx;

  const body = await parseJsonBody(request);
  if (isRefusal(body)) return body;

  const result = await createAssumption(ctx.supabase, ctx.orgId, ctx.userId, body);
  return NextResponse.json(result.body, { status: result.status, headers: rateLimitHeaders(ctx.userId) });
}

async function handlePATCH(request: NextRequest) {
  const ctx = await resolveAuthedOrg(request);
  if (isRefusal(ctx)) return ctx;

  const body = await parseJsonBody(request);
  if (isRefusal(body)) return body;

  const { id, ...rest } = body;
  const result = await updateAssumption(ctx.supabase, ctx.orgId, id, rest);
  return NextResponse.json(result.body, { status: result.status, headers: rateLimitHeaders(ctx.userId) });
}

async function handleDELETE(request: NextRequest) {
  const ctx = await resolveAuthedOrg(request);
  if (isRefusal(ctx)) return ctx;

  const body = await parseJsonBody(request);
  if (isRefusal(body)) return body;

  const result = await deleteAssumption(ctx.supabase, ctx.orgId, body.id);
  return NextResponse.json(result.body, { status: result.status, headers: rateLimitHeaders(ctx.userId) });
}

export const GET = withErrorCapture("/api/workspace/assumptions", handleGET);
export const POST = withErrorCapture("/api/workspace/assumptions", handlePOST);
export const PATCH = withErrorCapture("/api/workspace/assumptions", handlePATCH);
export const DELETE = withErrorCapture("/api/workspace/assumptions", handleDELETE);
