// POST /api/admin/run-intake — the "Run intake now" operator control (Disposition Unit 0c-2).
//
// Fires ONE runIntakeCycle over a small candidate set and STOPS (no loop, no schedule side-effect). The
// machine gates ARE the approval (no-human-finish-of-intake / RD-20) — this route returns the disposition
// TRAIL for VISIBILITY (discovered / staged / minted / rejected+reason / verified); there are NO approve
// affordances. Admin-gated to the /api/agent/run standard (auth + isPlatformAdmin + rate limit) because it
// triggers paid generation. Enters the scrape hold ONLY through the F16 "manual-intake-run" signed caller
// (the pipeline threads it; the scheduled worker stays blocked — one mechanism, two callers, no third door).
//
// The saved-cadence / scheduled-worker mechanism is untouched by this control (ADR-012: manual-triggered by
// design, auto-cadence built + dormant).
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { isPlatformAdmin } from "@/lib/auth/admin";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { withErrorCapture } from "@/lib/telemetry/capture-error";
import { runIntakeCycle, type IntakeCandidate } from "@/lib/intake/run-intake-cycle";

// Grounding is synchronous (the sanctioned direct-lib chain); bound the set + the wall time.
export const maxDuration = 300;
const MAX_CANDIDATES = 5;

async function handlePOST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const gate = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const admin = await isPlatformAdmin(auth.userId, gate);
  if (!admin) {
    return NextResponse.json({ error: "Platform admin access required" }, { status: 403, headers: rateLimitHeaders(auth.userId) });
  }

  let candidates: IntakeCandidate[];
  try {
    const body = await request.json();
    candidates = Array.isArray(body?.candidates) ? body.candidates : [];
  } catch {
    return NextResponse.json({ error: "body must be { candidates: [{ title, source_url, item_type, … }] }" }, { status: 400 });
  }

  // Machine-validate the input shape (title + source_url + item_type). No human approval — a malformed
  // candidate is a client error, not a stage.
  const bad = candidates.find((c) => !c || typeof c.title !== "string" || typeof c.source_url !== "string" || typeof c.item_type !== "string");
  if (candidates.length === 0 || bad) {
    return NextResponse.json({ error: "each candidate needs string title + source_url + item_type" }, { status: 400 });
  }
  if (candidates.length > MAX_CANDIDATES) {
    return NextResponse.json({ error: `run-one-cycle-and-STOP: at most ${MAX_CANDIDATES} candidates per invocation` }, { status: 400 });
  }

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const trail = await runIntakeCycle(sb, candidates); // caller defaults to "manual-intake-run"

  return NextResponse.json(
    { ok: true, control: "run-intake-now", cycle_stopped: true, trail },
    { headers: rateLimitHeaders(auth.userId) }
  );
}

export const POST = withErrorCapture("/api/admin/run-intake", handlePOST);
