import { NextRequest, NextResponse } from "next/server";
import { isRefusal, requireAdminRoute } from "@/lib/api/route-guard";
import { withErrorCapture } from "@/lib/telemetry/capture-error";
import { processStatutoryRowsFile } from "./logic.mjs";

export const maxDuration = 60;

async function handlePOST(request: NextRequest) {
  const auth = await requireAdminRoute(request);
  if (isRefusal(auth)) return auth;
  const { supabase, headers } = auth;

  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") === "apply" ? "apply" : "dry";

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers });
  }

  const result = await processStatutoryRowsFile(supabase, body, mode);
  if (!result.ok) {
    return NextResponse.json(
      { error: "rows-file failed validation - nothing written", violations: result.violations },
      { status: result.status, headers }
    );
  }

  return NextResponse.json(
    { mode, total: result.total, counts: result.counts, outcomes: result.outcomes },
    { headers }
  );
}

export const POST = withErrorCapture("/api/admin/statutory-rows", handlePOST);
