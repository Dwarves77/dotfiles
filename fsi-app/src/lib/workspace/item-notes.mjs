// Private-per-workspace notes on an intelligence item (lane S8-A, 2026-10-07; migration 358 item_notes).
// Handlers for /api/workspace/items/[id]/notes. Contract and the cross-org rule: see item-collab-shared.mjs.
//
// RULES (the same as migration 358's RLS and guard trigger, enforced here in code because the routes use the
// service-role client):
//   read    any member of the caller's org (a viewer reads), the caller's own org only
//   add     owner, admin or member, as themselves
//   edit    the author only, never an admin, never a deleted note
//   delete  the author's own note, or any note for an owner or admin, by soft delete (deleted_at); the row is kept
// A note is workspace commentary. Nothing here feeds analysis, another page or the flywheel.

import { NOTE_MAX_LENGTH, canWrite, isOrgAdmin, loadRoster, nameIndex, ok, fail } from "./item-collab-shared.mjs";

const NOTE_COLUMNS = "id, author_user_id, body, created_at, edited_at";
const LIST_LIMIT = 200;

function view(row, ctx, names) {
  const mine = row.author_user_id != null && row.author_user_id === ctx.userId;
  return {
    id: row.id,
    author_user_id: row.author_user_id,
    author_name: row.author_user_id == null ? null : names.get(row.author_user_id) ?? null,
    body: row.body,
    created_at: row.created_at,
    edited_at: row.edited_at,
    mine,
    can_edit: mine && canWrite(ctx.role),
    can_delete: mayDelete(row, ctx),
  };
}

/** The author deletes their own note (the same right as editing it); an owner or admin deletes any. */
function mayDelete(row, ctx) {
  const mine = row.author_user_id != null && row.author_user_id === ctx.userId;
  return isOrgAdmin(ctx.role) || (mine && canWrite(ctx.role));
}

function viewer(ctx) {
  return { role: ctx.role, can_write: canWrite(ctx.role) };
}

/** Validate a note body. Returns { body } or { error }. Accepts any string, trims it. */
export function parseNoteBody(raw) {
  if (typeof raw !== "string") return { error: "Write a note before saving." };
  const body = raw.trim();
  if (!body) return { error: "Write a note before saving." };
  if (body.length > NOTE_MAX_LENGTH) {
    return { error: `Notes are limited to ${NOTE_MAX_LENGTH} characters; this one is ${body.length}. Shorten it and save again.` };
  }
  return { body };
}

export async function listNotes({ supabase }, ctx) {
  const [notesRes, roster] = await Promise.all([
    supabase
      .from("item_notes")
      .select(NOTE_COLUMNS)
      .eq("org_id", ctx.orgId)
      .eq("item_id", ctx.item.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(LIST_LIMIT),
    loadRoster(supabase, ctx.orgId),
  ]);
  if (notesRes.error) return fail(500, notesRes.error.message);
  const names = nameIndex(roster.members);
  return ok(200, {
    notes: (notesRes.data || []).map((row) => view(row, ctx, names)),
    viewer: viewer(ctx),
  });
}

export async function addNote({ supabase }, ctx, input) {
  if (!canWrite(ctx.role)) return fail(403, "Your role in this workspace can read notes but not add them.");
  const parsed = parseNoteBody(input?.body);
  if (parsed.error) return fail(400, parsed.error);
  const { data, error } = await supabase
    .from("item_notes")
    .insert({ org_id: ctx.orgId, item_id: ctx.item.id, author_user_id: ctx.userId, body: parsed.body })
    .select(NOTE_COLUMNS)
    .single();
  if (error) return fail(500, error.message);
  const roster = await loadRoster(supabase, ctx.orgId);
  return ok(201, { note: view(data, ctx, nameIndex(roster.members)) });
}

/** Load one live note of THIS org and item, or null. Org and item scoping is the cross-org boundary. */
async function findNote(supabase, ctx, noteId) {
  const { data, error } = await supabase
    .from("item_notes")
    .select(NOTE_COLUMNS)
    .eq("id", noteId)
    .eq("org_id", ctx.orgId)
    .eq("item_id", ctx.item.id)
    .is("deleted_at", null)
    .maybeSingle();
  return { row: data ?? null, error };
}

export async function editNote({ supabase }, ctx, input) {
  const noteId = typeof input?.noteId === "string" ? input.noteId : "";
  if (!noteId) return fail(400, "noteId is required.");
  const parsed = parseNoteBody(input?.body);
  if (parsed.error) return fail(400, parsed.error);
  if (!canWrite(ctx.role)) return fail(403, "Your role in this workspace can read notes but not edit them.");

  const found = await findNote(supabase, ctx, noteId);
  if (found.error) return fail(500, found.error.message);
  if (!found.row) return fail(404, "That note no longer exists. Reload to see the current notes.");
  if (found.row.author_user_id == null || found.row.author_user_id !== ctx.userId) {
    return fail(403, "Only the author can edit a note.");
  }

  const { data, error } = await supabase
    .from("item_notes")
    .update({ body: parsed.body, edited_at: new Date().toISOString() })
    .eq("id", noteId)
    .eq("org_id", ctx.orgId)
    .eq("author_user_id", ctx.userId)
    .select(NOTE_COLUMNS)
    .single();
  if (error) return fail(500, error.message);
  const roster = await loadRoster(supabase, ctx.orgId);
  return ok(200, { note: view(data, ctx, nameIndex(roster.members)) });
}

export async function deleteNote({ supabase }, ctx, input) {
  const noteId = typeof input?.noteId === "string" ? input.noteId : "";
  if (!noteId) return fail(400, "noteId is required.");

  const found = await findNote(supabase, ctx, noteId);
  if (found.error) return fail(500, found.error.message);
  if (!found.row) return fail(404, "That note no longer exists. Reload to see the current notes.");
  if (!mayDelete(found.row, ctx)) return fail(403, "Only the author, or a workspace owner or admin, can delete a note.");

  const { error } = await supabase
    .from("item_notes")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", noteId)
    .eq("org_id", ctx.orgId);
  if (error) return fail(500, error.message);
  return ok(200, { success: true });
}
