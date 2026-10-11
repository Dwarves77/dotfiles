import { NextRequest } from "next/server";
import { withErrorCapture } from "@/lib/telemetry/capture-error";
import { getServiceSupabase } from "@/lib/supabase-service";
import { handleCoverageRequest } from "./logic";

async function handlePOST(request: NextRequest) {
  return handleCoverageRequest(request, { serviceClient: getServiceSupabase });
}

export const POST = withErrorCapture("/api/dashboard/coverage/request", handlePOST);
