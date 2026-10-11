import { NextRequest } from "next/server";
import { requireAdminRoute } from "@/lib/api/route-guard";
import { withErrorCapture } from "@/lib/telemetry/capture-error";
import { handleRevoke } from "@/lib/corrections/admin-api/handlers";

type Ctx = { params: Promise<{ id: string; correctionId: string }> };

async function handlePOST(request: NextRequest, { params }: Ctx) {
  const { id, correctionId } = await params;
  return handleRevoke(request, id, correctionId, (req) => requireAdminRoute(req));
}

export const POST = withErrorCapture("/api/admin/items/[id]/corrections/[correctionId]/revoke", handlePOST);
