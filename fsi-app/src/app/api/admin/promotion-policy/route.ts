// /api/admin/promotion-policy — the promotion policy engine's operator control (P2, ADMIN-ONLY).
//
// Promotion is admin-only (dispatch 3): this endpoint is the ONLY authorized way to read or set the
// promotion policy, and it is server-side gated — requireAuth (401 unauthenticated) + isPlatformAdmin
// (403 non-admin), matching every other /api/admin/** route. The policy table is RLS-enabled deny-all;
// even a leaked anon key cannot reach it. The policy IS the authorization for promotion spend — fail-
// closed: with no active/unexpired policy, GET reports none and the engine authorizes nothing.
//
//   GET  → the current active policy + spend-against-envelope, or {policy:null} when none (fail-closed).
//   POST → create + activate a policy (operator approval of the proposal). Validated + capped.
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { isPlatformAdmin } from "@/lib/auth/admin";
import { getServiceSupabase } from "@/lib/supabase-service";

async function gate(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return { error: auth as NextResponse };
  const limited = checkRateLimit(auth.userId);
  if (limited) return { error: limited };
  const sb = getServiceSupabase();
  const admin = await isPlatformAdmin(auth.userId, sb);
  if (!admin) {
    return { error: NextResponse.json({ error: "Platform admin access required" }, { status: 403 }) };
  }
  return { userId: auth.userId, sb };
}

export async function GET(request: NextRequest) {
  const g = await gate(request);
  if ("error" in g) return g.error;
  try {
    const { data, error } = await g.sb
      .from("promotion_policy")
      .select("*")
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (error) throw new Error(error.message);
    const policy = data ?? null;
    return NextResponse.json({
      policy,
      // fail-closed summary: no active unexpired policy → the engine authorizes nothing.
      authorizesSpend: !!policy,
      remainingUsd: policy ? Number(policy.budget_envelope_usd) - Number(policy.spent_usd) : 0,
    });
  } catch (e) {
    console.warn("GET /api/admin/promotion-policy:", e);
    return NextResponse.json({ error: "Policy read failed." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const g = await gate(request);
  if ("error" in g) return g.error;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // Validate the operator-authorized policy. authority + a positive envelope + a future expiry are required
  // (the metered-gate amendment contract: authorized, capped, expiring). Quality floor defaults to the
  // promotable set (dual-verified + firm-core).
  const authority = String(body.authority || "").trim();
  const envelope = Number(body.budget_envelope_usd);
  const expiresAt = String(body.expires_at || "").trim();
  const errs: string[] = [];
  if (!authority) errs.push("authority is required (operator authorization reference)");
  if (!(envelope > 0)) errs.push("budget_envelope_usd must be > 0");
  if (!expiresAt || Number.isNaN(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now())
    errs.push("expires_at must be a future timestamp");
  if (errs.length) return NextResponse.json({ error: errs.join("; ") }, { status: 400 });

  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
  const row = {
    authority,
    created_by: g.userId,
    status: "active" as const,
    expires_at: new Date(expiresAt).toISOString(),
    priority_jurisdictions: arr(body.priority_jurisdictions),
    priority_topics: arr(body.priority_topics),
    priority_instrument_types: arr(body.priority_instrument_types),
    require_dual_verified: body.require_dual_verified !== false,
    require_firm_core: body.require_firm_core !== false,
    budget_envelope_usd: envelope,
    batch_size: Number.isInteger(body.batch_size) ? Math.min(200, Math.max(1, Number(body.batch_size))) : 30,
    notes: body.notes ? String(body.notes) : null,
  };

  try {
    // Retire any current active policy first (the single-active partial unique index enforces one).
    await g.sb.from("promotion_policy").update({ status: "expired", updated_at: new Date().toISOString() }).eq("status", "active");
    const { data, error } = await g.sb.from("promotion_policy").insert(row).select("*").single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ policy: data, authorizesSpend: true }, { status: 201 });
  } catch (e) {
    console.warn("POST /api/admin/promotion-policy:", e);
    return NextResponse.json({ error: "Policy write failed." }, { status: 503 });
  }
}
