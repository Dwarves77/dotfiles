// handlers.ts , the request handlers of the admin item-corrections API (lane G7-CORR, 2026-10-06). A route.ts
// may export only route handlers (F34), and the admin gate must be reachable in a test without a real session,
// so each route file calls requireAdminRoute (F2 reads that call in the route file) and passes it in as `guard`;
// the tests pass a guard built with injected deps. The contract is documented in ./logic.mjs.
import { NextRequest, NextResponse } from "next/server";
import { isRefusal, type AdminRoute } from "@/lib/api/route-guard";
import { listCorrections, createCorrection, revokeCorrection } from "./logic.mjs";

export type AdminGuard = (request: NextRequest) => Promise<AdminRoute | NextResponse>;

interface LogicReply { status: number; body: unknown }

const send = (r: LogicReply, headers: Record<string, string>) => NextResponse.json(r.body, { status: r.status, headers });

async function readBody(request: NextRequest): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return { ok: false };
  }
}

export async function handleList(request: NextRequest, itemId: string, guard: AdminGuard): Promise<NextResponse> {
  const auth = await guard(request);
  if (isRefusal(auth)) return auth;
  return send(await listCorrections(auth.supabase, itemId), auth.headers);
}

export async function handleCreate(request: NextRequest, itemId: string, guard: AdminGuard): Promise<NextResponse> {
  const auth = await guard(request);
  if (isRefusal(auth)) return auth;
  const parsed = await readBody(request);
  if (!parsed.ok) return NextResponse.json({ error: "Invalid JSON body", code: "invalid_json" }, { status: 400, headers: auth.headers });
  // created_by is the authenticated session user, never anything the body carries.
  return send(await createCorrection(auth.supabase, { itemId, userId: auth.userId, body: parsed.body }), auth.headers);
}

export async function handleRevoke(request: NextRequest, itemId: string, correctionId: string, guard: AdminGuard): Promise<NextResponse> {
  const auth = await guard(request);
  if (isRefusal(auth)) return auth;
  // the body is optional on a revoke (it may carry a reason); an empty or invalid body is treated as none
  const parsed = await readBody(request);
  return send(await revokeCorrection(auth.supabase, { itemId, correctionId, userId: auth.userId, body: parsed.ok ? parsed.body : null }), auth.headers);
}
