// GET  /api/admin/items/[id]/corrections , list every admin correction of one item (machine value, active state)
// POST /api/admin/items/[id]/corrections , create a correction (reason mandatory, created_by = the session user)
//
// Lane G7-CORR (2026-10-06): the admin correction layer over item data, migration 356 (item_corrections). The
// request and response shapes are documented at the top of ./logic.mjs. Platform-admin only: requireAdminRoute is
// the ONE gate (src/lib/api/route-guard.ts, fitness F2); the handlers in ./handlers.ts run it first and never
// touch the database for a refused caller.
import { NextRequest } from "next/server";
import { requireAdminRoute } from "@/lib/api/route-guard";
import { withErrorCapture } from "@/lib/telemetry/capture-error";
import { handleList, handleCreate } from "./handlers";

type Ctx = { params: Promise<{ id: string }> };

async function handleGET(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return handleList(request, id, (req) => requireAdminRoute(req));
}

async function handlePOST(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return handleCreate(request, id, (req) => requireAdminRoute(req));
}

export const GET = withErrorCapture("/api/admin/items/[id]/corrections", handleGET);
export const POST = withErrorCapture("/api/admin/items/[id]/corrections", handlePOST);
