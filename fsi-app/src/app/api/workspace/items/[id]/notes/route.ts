import { NextRequest } from "next/server";
import { withErrorCapture } from "@/lib/telemetry/capture-error";
import { readJsonObject, runCollab, type CollabRouteContext } from "@/lib/workspace/item-collab-route";
import { addNote, deleteNote, editNote, listNotes } from "@/lib/workspace/item-notes.mjs";

// /api/workspace/items/[id]/notes: private-per-workspace notes on one item (lane S8-A, migration 358).
//   GET                          the item's notes for the caller's org, newest first, with the caller's rights
//   POST   { body }              add a note as the caller
//   PATCH  { noteId, body }      edit the caller's own note
//   DELETE ?noteId=<uuid>        soft delete (workspace owner or admin only)
// [id] is the detail page id (legacy_id or uuid). Org, role and item are resolved server-side
// (item-collab-route.ts); the rules live in src/lib/workspace/item-notes.mjs. A note is workspace
// commentary: it feeds no page but this item's own detail page, and never the flywheel.

async function handleGET(request: NextRequest, context: CollabRouteContext) {
  return runCollab(request, context, (deps, ctx) => listNotes(deps, ctx));
}

async function handlePOST(request: NextRequest, context: CollabRouteContext) {
  const input = await readJsonObject(request);
  return runCollab(request, context, (deps, ctx) => addNote(deps, ctx, input));
}

async function handlePATCH(request: NextRequest, context: CollabRouteContext) {
  const input = await readJsonObject(request);
  return runCollab(request, context, (deps, ctx) => editNote(deps, ctx, input));
}

async function handleDELETE(request: NextRequest, context: CollabRouteContext) {
  const noteId = request.nextUrl.searchParams.get("noteId");
  return runCollab(request, context, (deps, ctx) => deleteNote(deps, ctx, { noteId }));
}

export const GET = withErrorCapture("/api/workspace/items/[id]/notes", handleGET);
export const POST = withErrorCapture("/api/workspace/items/[id]/notes", handlePOST);
export const PATCH = withErrorCapture("/api/workspace/items/[id]/notes", handlePATCH);
export const DELETE = withErrorCapture("/api/workspace/items/[id]/notes", handleDELETE);
