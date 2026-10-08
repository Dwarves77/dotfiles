// POST /api/dashboard/coverage/request: the "request coverage" action (lane COV-1, 2026-10-08). The handler body is in
// logic.ts (F34: a route file exports only handlers).
import { NextRequest } from "next/server";
import { withErrorCapture } from "@/lib/telemetry/capture-error";
import { getServiceSupabase } from "@/lib/supabase-service";
import { handleCoverageRequest } from "./logic";

async function handlePOST(request: NextRequest) {
  return handleCoverageRequest(request, { serviceClient: getServiceSupabase });
}

export const POST = withErrorCapture("/api/dashboard/coverage/request", handlePOST);
