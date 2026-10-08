// Multi-person assignment of an intelligence item, with notification (lane S8-A, 2026-10-07; migration 359
// item_assignments). Handlers for /api/workspace/items/[id]/assignments. Contract and the cross-org rule: see
// item-collab-shared.mjs.
//
// RULES (the same as migration 359's RLS and guard trigger, enforced here in code):
//   read     any member of the caller's org; the response also carries the org roster for the picker
//   assign   owner, admin or member; every assignee must be a member of the CALLER'S org (never another org)
//   state    open or done; the assignee, whoever assigned, or an owner or admin
//   remove   the same three parties
// Each newly assigned member other than the caller gets one notification of kind `assignment`, through the
// existing Community notification machinery (dispatchNotification, migration 032/235/359). A notification that
// fails to write never undoes the assignment; the response reports how many were delivered.

import { itemDetailHref } from "../item-links.ts";
import {
  MAX_ASSIGNEES_PER_REQUEST,
  UUID_RE,
  canWrite,
  isOrgAdmin,
  loadRoster,
  nameIndex,
  ok,
  fail,
} from "./item-collab-shared.mjs";

const ASSIGNMENT_COLUMNS = "id, assignee_user_id, assigned_by, due_on, state, created_at";
const LIST_LIMIT = 200;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const ASSIGNMENT_STATES = ["open", "done"];

/** True for a real calendar date written YYYY-MM-DD. */
export function isIsoDate(value) {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function mayChange(row, ctx) {
  return canWrite(ctx.role) && (row.assignee_user_id === ctx.userId || row.assigned_by === ctx.userId || isOrgAdmin(ctx.role));
}

function view(row, ctx, names) {
  return {
    id: row.id,
    assignee_user_id: row.assignee_user_id,
    assignee_name: names.get(row.assignee_user_id) ?? null,
    assigned_by: row.assigned_by,
    assigned_by_name: row.assigned_by == null ? null : names.get(row.assigned_by) ?? null,
    due_on: row.due_on,
    state: row.state,
    created_at: row.created_at,
    can_change: mayChange(row, ctx),
  };
}

function viewer(ctx) {
  return { role: ctx.role, can_write: canWrite(ctx.role) };
}

export async function listAssignments({ supabase }, ctx) {
  const [rowsRes, roster] = await Promise.all([
    supabase
      .from("item_assignments")
      .select(ASSIGNMENT_COLUMNS)
      .eq("org_id", ctx.orgId)
      .eq("item_id", ctx.item.id)
      .order("created_at", { ascending: true })
      .limit(LIST_LIMIT),
    loadRoster(supabase, ctx.orgId),
  ]);
  if (rowsRes.error) return fail(500, rowsRes.error.message);
  if (roster.error) return fail(500, roster.error);
  const names = nameIndex(roster.members);
  return ok(200, {
    assignments: (rowsRes.data || []).map((row) => view(row, ctx, names)),
    members: roster.members.map((m) => ({ user_id: m.user_id, display_name: m.display_name })),
    viewer: viewer(ctx),
  });
}

/** Validate the POST body. Returns { assignees, dueOn } or { error }. */
export function parseAssignInput(input) {
  const list = Array.isArray(input?.assignees) ? input.assignees : null;
  if (!list || list.length === 0) return { error: "Choose at least one person to assign." };
  if (list.length > MAX_ASSIGNEES_PER_REQUEST) {
    return { error: `Assign at most ${MAX_ASSIGNEES_PER_REQUEST} people at a time.` };
  }
  const assignees = [];
  for (const a of list) {
    if (typeof a !== "string" || !UUID_RE.test(a)) return { error: "Each assignee must be a workspace member id." };
    if (!assignees.includes(a)) assignees.push(a);
  }
  let dueOn = null;
  if (input?.dueOn !== undefined && input.dueOn !== null && input.dueOn !== "") {
    if (!isIsoDate(input.dueOn)) return { error: "Enter the due date as a real date (YYYY-MM-DD) or leave it empty." };
    dueOn = input.dueOn;
  }
  return { assignees, dueOn };
}

export async function assignMembers({ supabase, notify }, ctx, input) {
  if (!canWrite(ctx.role)) return fail(403, "Your role in this workspace can see assignments but not make them.");
  const parsed = parseAssignInput(input);
  if (parsed.error) return fail(400, parsed.error);
  const { assignees, dueOn } = parsed;

  const roster = await loadRoster(supabase, ctx.orgId);
  if (roster.error) return fail(500, roster.error);
  const names = nameIndex(roster.members);
  // Org guard: every assignee must hold a membership in the CALLER'S org. One outsider refuses the whole request,
  // nothing is written, and an unverifiable roster (the read above failed) already failed closed.
  const outsiders = assignees.filter((id) => !names.has(id));
  if (outsiders.length > 0) {
    return fail(403, "Everyone you assign must be a member of your workspace. Pick from the list and try again.");
  }

  const { data: existing, error: existingErr } = await supabase
    .from("item_assignments")
    .select("assignee_user_id")
    .eq("org_id", ctx.orgId)
    .eq("item_id", ctx.item.id)
    // fitness-allow: F39 (bounded by MAX_ASSIGNEES_PER_REQUEST, parseAssignInput)
    .in("assignee_user_id", assignees);
  if (existingErr) return fail(500, existingErr.message);
  const already = new Set((existing || []).map((r) => r.assignee_user_id));
  const fresh = assignees.filter((id) => !already.has(id));

  let created = [];
  if (fresh.length > 0) {
    const { data, error } = await supabase
      .from("item_assignments")
      .insert(
        fresh.map((assignee) => ({
          org_id: ctx.orgId,
          item_id: ctx.item.id,
          assignee_user_id: assignee,
          assigned_by: ctx.userId,
          due_on: dueOn,
        })),
      )
      .select(ASSIGNMENT_COLUMNS);
    if (error) return fail(500, error.message);
    created = data || [];
  }

  let notified = 0;
  let notifyFailed = 0;
  if (typeof notify === "function") {
    const assigner = names.get(ctx.userId) ?? "A teammate";
    const href = itemDetailHref({ id: ctx.item.legacyId || ctx.item.id, type: ctx.item.type, domain: ctx.item.domain });
    for (const row of created) {
      if (row.assignee_user_id === ctx.userId) continue;
      const err = await notify({
        userId: row.assignee_user_id,
        kind: "assignment",
        payload: {
          title: "Assigned to you",
          body: `${assigner} assigned you "${ctx.item.title || "an item"}"${dueOn ? `, due ${dueOn}` : ""}.`,
          link: href,
          item_id: ctx.item.id,
          assigned_by: ctx.userId,
          due_on: dueOn,
        },
      });
      if (err) notifyFailed += 1;
      else notified += 1;
    }
  }

  return ok(201, {
    assignments: created.map((row) => view(row, ctx, names)),
    already_assigned: assignees.filter((id) => already.has(id)),
    notified,
    notify_failed: notifyFailed,
  });
}

async function findAssignment(supabase, ctx, assignee) {
  const { data, error } = await supabase
    .from("item_assignments")
    .select(ASSIGNMENT_COLUMNS)
    .eq("org_id", ctx.orgId)
    .eq("item_id", ctx.item.id)
    .eq("assignee_user_id", assignee)
    .maybeSingle();
  return { row: data ?? null, error };
}

export async function setAssignmentState({ supabase }, ctx, input) {
  const assignee = typeof input?.assignee === "string" ? input.assignee : "";
  if (!UUID_RE.test(assignee)) return fail(400, "assignee is required.");
  if (!ASSIGNMENT_STATES.includes(input?.state)) return fail(400, "state must be open or done.");

  const found = await findAssignment(supabase, ctx, assignee);
  if (found.error) return fail(500, found.error.message);
  if (!found.row) return fail(404, "That assignment no longer exists. Reload to see the current assignments.");
  if (!mayChange(found.row, ctx)) {
    return fail(403, "Only the assignee, the person who assigned it, or a workspace owner or admin can change this assignment.");
  }

  const { data, error } = await supabase
    .from("item_assignments")
    .update({ state: input.state })
    .eq("id", found.row.id)
    .eq("org_id", ctx.orgId)
    .select(ASSIGNMENT_COLUMNS)
    .single();
  if (error) return fail(500, error.message);
  const roster = await loadRoster(supabase, ctx.orgId);
  return ok(200, { assignment: view(data, ctx, nameIndex(roster.members)) });
}

export async function removeAssignment({ supabase }, ctx, input) {
  const assignee = typeof input?.assignee === "string" ? input.assignee : "";
  if (!UUID_RE.test(assignee)) return fail(400, "assignee is required.");

  const found = await findAssignment(supabase, ctx, assignee);
  if (found.error) return fail(500, found.error.message);
  if (!found.row) return fail(404, "That assignment no longer exists. Reload to see the current assignments.");
  if (!mayChange(found.row, ctx)) {
    return fail(403, "Only the assignee, the person who assigned it, or a workspace owner or admin can remove this assignment.");
  }

  const { error } = await supabase
    .from("item_assignments")
    .delete()
    .eq("id", found.row.id)
    .eq("org_id", ctx.orgId);
  if (error) return fail(500, error.message);
  return ok(200, { success: true });
}
