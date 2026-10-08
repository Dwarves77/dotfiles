// GET /api/dashboard/coverage/matrix: the generated Coverage matrix (lane COV-1, 2026-10-08). The handler body is in
// logic.ts (F34: a route file exports only handlers). See that file for the three response shapes.
import { NextRequest } from "next/server";
import { withErrorCapture } from "@/lib/telemetry/capture-error";
import { getCoverageMatrix } from "@/lib/coverage/matrix-data";
import { handleMatrixRequest } from "./logic";

async function handleGET(request: NextRequest) {
  return handleMatrixRequest(request, { loadMatrix: getCoverageMatrix });
}

export const GET = withErrorCapture("/api/dashboard/coverage/matrix", handleGET);
