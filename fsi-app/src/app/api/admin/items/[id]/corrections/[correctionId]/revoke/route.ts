// POST /api/admin/items/[id]/corrections/[correctionId]/revoke , revoke one active correction
//
// Lane G7-CORR (2026-10-06). Revoking stops enforcement only: a tag, brief or section keeps its value until the
// next machine write stands, a suppressed claim reappears at once. Contract at the top of ../../logic.mjs.
// Platform-admin only through requireAdminRoute (F2); the handler runs it first.
import { NextRequest } from "next/server";
import { requireAdminRoute } from "@/lib/api/route-guard";
import { withErrorCapture } from "@/lib/telemetry/capture-error";
import { handleRevoke } from "../../handlers";

type Ctx = { params: Promise<{ id: string; correctionId: string }> };

async function handlePOST(request: NextRequest, { params }: Ctx) {
  const { id, correctionId } = await params;
  return handleRevoke(request, id, correctionId, (req) => requireAdminRoute(req));
}

export const POST = withErrorCapture("/api/admin/items/[id]/corrections/[correctionId]/revoke", handlePOST);
