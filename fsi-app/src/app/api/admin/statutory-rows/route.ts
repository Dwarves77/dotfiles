// POST /api/admin/statutory-rows
//
// Lane M7a (2026-09-20), plan row M7 data-layer half: the ONE product-reachable path for
// write-statutory.mjs's statutory_computations writer, replacing the fixture-only CLI path (audit
// finding: "the writer is not reachable from the product" , its one invoker was an opt-in step of
// propagation-drain.yml and the only rows-file in the repo is a self-labelled FIXTURE that never
// reaches production apply).
//
// PLATFORM DATA, NOT WORKSPACE DATA: statutory_computations is a filing-grade table with no org_id
// column and no per-tenant scope (migration 286) , gated with the SAME platform-admin gate every
// other /api/admin/** route uses (requireAdminRoute, src/lib/api/route-guard.ts; fitness F2 checks
// this path), not the workspace-membership gate the spec-09 upload route uses.
//
// mode=dry (default, query param) previews every row's outcome and writes nothing. mode=apply writes.
// The actual validate/parse/write orchestration lives in ./logic.mjs (F34's named residual: a route.ts
// may export only route handlers/config, so testable logic lives in a sibling module) , that file is
// the ONE path that imports validateRowsFile/parseRow/writeOneRow from the two script modules the CLI
// and the workflow gate already use; nothing here reimplements them.
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
