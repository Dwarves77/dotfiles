import { NextRequest } from "next/server";
import { requireAdminRoute } from "@/lib/api/route-guard";
import { withErrorCapture } from "@/lib/telemetry/capture-error";
import { handleList, handleCreate } from "@/lib/corrections/admin-api/handlers";

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
