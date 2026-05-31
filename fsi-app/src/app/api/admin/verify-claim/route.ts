// POST /api/admin/verify-claim  — Sprint 4 Block 1 task 1.12 (UNVERIFIED-PENDING-RUNTIME)
//
// The per-claim human-verification tick. The admin verification queue calls this
// once per FACT claim. It resumes the durable generate-brief workflow that is
// suspended on the claim's hook:
//
//   resumeHook( verifyHookToken(item_id, claim_id), { tick, claim_id, reviewer } )
//
// The workflow's recordClaimVerification step then stamps verified_by/verified_at
// (the 1.13 audit log), and flipToVerifiedIfAllTicked flips the item to 'verified'
// once every FACT claim is ticked.
//
// TOKEN CONTRACT: the token is built by the SHARED verifyHookToken so it is
// byte-identical to the createHook token in src/workflows/generate-brief.ts. Do
// not inline the template here — a mismatch silently drops the tick.
//
// PER-CLAIM TICK ONLY (locked decision) — there is deliberately no batch endpoint.
//
// NOT YET RUNTIME-VERIFIED: this needs a running, suspended workflow to resume.
// Next session: start a workflow for a sentinel CRITICAL/HIGH item with FACT
// claims, confirm it suspends, tick here, and verify the DB write + status flip.
//
// Body: { item_id: string, claim_id: string, reviewer?: string }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { d3AuditEvent } from "@/lib/d3/hooks.mjs";
import { resumeHook } from "workflow/api";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { isPlatformAdmin } from "@/lib/auth/admin";
import { verifyHookToken } from "@/lib/agent/verify-token";

interface VerifyClaimBody {
  item_id: string;
  claim_id: string;
  reviewer?: string;
}

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const supabase = getServiceClient();
  const admin = await isPlatformAdmin(auth.userId, supabase);
  if (!admin) {
    return NextResponse.json({ error: "Platform admin access required" }, { status: 403 });
  }

  let body: VerifyClaimBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.item_id || !body.claim_id) {
    return NextResponse.json({ error: "item_id and claim_id are required" }, { status: 400 });
  }

  const reviewer = body.reviewer || auth.userId;
  const token = verifyHookToken(body.item_id, body.claim_id);

  try {
    await resumeHook(token, { tick: true, claim_id: body.claim_id, reviewer });
  } catch (e) {
    // The most likely cause is no workflow currently suspended on this token
    // (run not started, already completed, or a token mismatch). Surface it
    // explicitly so the runtime verification next session is unambiguous.
    return NextResponse.json(
      { error: `resumeHook failed for token "${token}": ${(e as Error).message}` },
      { status: 500 }
    );
  }

  await d3AuditEvent(supabase, { scope: "data", event: "ingest:provenance" });

  return NextResponse.json(
    { success: true, token, item_id: body.item_id, claim_id: body.claim_id, reviewer },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
