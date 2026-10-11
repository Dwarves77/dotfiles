import { NextRequest } from "next/server";
import { withErrorCapture } from "@/lib/telemetry/capture-error";
import { getCoverageMatrix } from "@/lib/coverage/matrix-data";
import { handleMatrixRequest } from "./logic";

async function handleGET(request: NextRequest) {
  return handleMatrixRequest(request, { loadMatrix: getCoverageMatrix });
}

export const GET = withErrorCapture("/api/dashboard/coverage/matrix", handleGET);
