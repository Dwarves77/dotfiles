import { NextRequest } from "next/server";
import { withErrorCapture } from "@/lib/telemetry/capture-error";
import { readJsonObject, runCollab, type CollabRouteContext } from "@/lib/workspace/item-collab-route";
import {
  assignMembers,
  listAssignments,
  removeAssignment,
  setAssignmentState,
} from "@/lib/workspace/item-assignments.mjs";

// /api/workspace/items/[id]/assignments: multi-person assignment of one item (lane S8-A, migration 359).
//   GET                                    the item's assignments for the caller's org, plus the org roster for the picker
//   POST   { assignees: [uuid], dueOn? }   assign several members at once; each new assignee is notified
//   PATCH  { assignee, state }             set open or done (assignee, assigner, or workspace owner or admin)
//   DELETE ?assignee=<uuid>                remove an assignment (same three parties)
// [id] is the detail page id (legacy_id or uuid). Org, role and item are resolved server-side
// (item-collab-route.ts); the rules live in src/lib/workspace/item-assignments.mjs.

async function handleGET(request: NextRequest, context: CollabRouteContext) {
  return runCollab(request, context, (deps, ctx) => listAssignments(deps, ctx));
}

async function handlePOST(request: NextRequest, context: CollabRouteContext) {
  const input = await readJsonObject(request);
  return runCollab(request, context, (deps, ctx) => assignMembers(deps, ctx, input));
}

async function handlePATCH(request: NextRequest, context: CollabRouteContext) {
  const input = await readJsonObject(request);
  return runCollab(request, context, (deps, ctx) => setAssignmentState(deps, ctx, input));
}

async function handleDELETE(request: NextRequest, context: CollabRouteContext) {
  const assignee = request.nextUrl.searchParams.get("assignee");
  return runCollab(request, context, (deps, ctx) => removeAssignment(deps, ctx, { assignee }));
}

export const GET = withErrorCapture("/api/workspace/items/[id]/assignments", handleGET);
export const POST = withErrorCapture("/api/workspace/items/[id]/assignments", handlePOST);
export const PATCH = withErrorCapture("/api/workspace/items/[id]/assignments", handlePATCH);
export const DELETE = withErrorCapture("/api/workspace/items/[id]/assignments", handleDELETE);
