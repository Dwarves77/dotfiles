// Deps-injectable CRUD logic for /api/workspace/assumptions, split out of route.ts (lane-common
// contract's F34: a route.ts exports only handlers/config; see list-order/logic.ts and
// workspace/bootstrap/logic.ts for the identical precedent). Every function here takes a plain
// SupabaseClient and plain args, no NextRequest/NextResponse, so logic.npmtest.mjs proves the
// CRUD behaviour against a fake client with no live database, and route.ts stays a thin wire-up of
// requireUserRoute + resolveOrgIdFromUserId + these functions.
import type { SupabaseClient } from "@supabase/supabase-js";
import { validateAssumptionInput } from "@/lib/assumptions/contract.mjs";
import { mapAssumptionRow, toInsertRow, toUpdateRow } from "@/lib/assumptions/row.mjs";
import { readWorkspaceAssumptions, type AssumptionRow } from "@/lib/assumptions/read";

export type LogicResult<T> =
  | { ok: true; status: number; body: T }
  | { ok: false; status: number; body: { error: string; errors?: string[] } };

export async function listAssumptions(
  supabase: SupabaseClient,
  orgId: string
): Promise<LogicResult<{ assumptions: AssumptionRow[] }>> {
  const assumptions = await readWorkspaceAssumptions(supabase, orgId);
  return { ok: true, status: 200, body: { assumptions } };
}

export async function createAssumption(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  input: unknown
): Promise<LogicResult<{ assumption: AssumptionRow }>> {
  const validated = validateAssumptionInput(input as Record<string, unknown>);
  if (!validated.valid) {
    return { ok: false, status: 400, body: { error: "Invalid assumption", errors: validated.errors } };
  }

  const { data, error } = await supabase
    .from("planning_assumption_register")
    .insert(toInsertRow(validated.value, { orgId, createdBy: userId }))
    .select(
      "id, org_id, name, value_numeric, unit, bound_to, load_bearing, vulnerable, review_date, source_note, status, created_at, updated_at"
    )
    .single();

  if (error || !data) {
    return { ok: false, status: 500, body: { error: error?.message ?? "Insert failed" } };
  }

  return { ok: true, status: 201, body: { assumption: mapAssumptionRow(data) as AssumptionRow } };
}

export async function updateAssumption(
  supabase: SupabaseClient,
  orgId: string,
  id: unknown,
  input: unknown
): Promise<LogicResult<{ assumption: AssumptionRow }>> {
  if (typeof id !== "string" || !id) {
    return { ok: false, status: 400, body: { error: "id is required" } };
  }

  const validated = validateAssumptionInput(input as Record<string, unknown>);
  if (!validated.valid) {
    return { ok: false, status: 400, body: { error: "Invalid assumption", errors: validated.errors } };
  }

  const { data, error } = await supabase
    .from("planning_assumption_register")
    .update(toUpdateRow(validated.value))
    .eq("id", id)
    .eq("org_id", orgId) // belt-and-suspenders: RLS already scopes this, this makes a cross-org
    // id guess a 404, not a silent RLS-filtered update of someone else's row.
    .select(
      "id, org_id, name, value_numeric, unit, bound_to, load_bearing, vulnerable, review_date, source_note, status, created_at, updated_at"
    )
    .maybeSingle();

  if (error) {
    return { ok: false, status: 500, body: { error: error.message } };
  }
  if (!data) {
    return { ok: false, status: 404, body: { error: "Assumption not found" } };
  }

  return { ok: true, status: 200, body: { assumption: mapAssumptionRow(data) as AssumptionRow } };
}

export async function deleteAssumption(
  supabase: SupabaseClient,
  orgId: string,
  id: unknown
): Promise<LogicResult<{ success: true }>> {
  if (typeof id !== "string" || !id) {
    return { ok: false, status: 400, body: { error: "id is required" } };
  }

  const { error } = await supabase
    .from("planning_assumption_register")
    .delete()
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) {
    return { ok: false, status: 500, body: { error: error.message } };
  }

  return { ok: true, status: 200, body: { success: true } };
}
