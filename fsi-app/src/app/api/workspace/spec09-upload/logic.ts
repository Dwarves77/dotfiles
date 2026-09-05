// Pure decision logic for POST /api/workspace/spec09-upload, split out of route.ts (F34's named
// residual, same pattern as src/app/api/admin/sources/bulk-import/logic.ts — a route.ts may export only
// route handlers/config, so anything else lives here and route.ts imports it).
//
// This route is the HTTP half of the "one shared column contract" the lane brief names —
// src/lib/spec09/csv-upload-contract.mjs is the contract itself (parseCsvUpload / entityRefValuesForTable /
// validateEntityRefs), imported here AND by scripts/spec09/*-producer.mjs unchanged, one body.

import type { OrgRole } from "@/lib/api/org";
import { UPLOAD_TABLES } from "@/lib/spec09/csv-upload-contract.mjs";
import { suggestHoldRiskFromValidationState } from "@/lib/spec09/eudr-custody.mjs";

/** One of the six customer-data spec09 tables this route accepts. Kept as a plain string union here
 *  (not re-exported from the .mjs contract, which carries no TS types) — UPLOAD_TABLES is the one
 *  runtime source of truth; isKnownUploadTable narrows an unknown request value down to this type. */
export type TableKey =
  | "surcharge_audits"
  | "tce_data_quality"
  | "auxiliary_energy_profiles"
  | "eudr_plot_claims"
  | "custody_chains"
  | "indexation_clauses";

/** viewer role may read; upload is a write action, gated to member/admin/owner (a viewer cannot mutate
 *  the org's own operational data). Matches the role gate's own vocabulary (migration 006 CHECK). */
export function isRoleAllowedToUpload(role: OrgRole): boolean {
  return role !== "viewer";
}

export function isKnownUploadTable(value: unknown): value is TableKey {
  return typeof value === "string" && (UPLOAD_TABLES as readonly string[]).includes(value);
}

export interface AcceptedRow {
  rowNumber: number;
  // `object` (not Record<string, unknown>) so this type accepts whatever shape the .mjs contract's
  // parseRow() returns (the .mjs module carries no TS types — allowJs infers a plain `object`); narrowed
  // to Record<string, unknown> only where a property is actually indexed, below.
  data: object;
}
export interface RejectedRow {
  rowNumber: number;
  errors: string[];
}

/**
 * Build the final row objects to insert: stamps org_id server-side on every row (the caller must never
 * pass a client-supplied org_id through to this function — route.ts resolves it from the authenticated
 * session before calling), and applies eudr_plot_claims' one write-time default (a blank hold_risk is
 * filled from validation_state, spec 09 §2.1 "materialise it" — see
 * scripts/spec09/eudr-custody-producer.mjs's applyHoldRiskDefault, which wraps the SAME
 * suggestHoldRiskFromValidationState this function calls, so the CLI producer and this route can never
 * drift on the default).
 */
export function buildRowsForInsert(
  table: TableKey,
  rows: AcceptedRow[],
  orgId: string
): Record<string, unknown>[] {
  return rows.map(({ data }) => {
    const row: Record<string, unknown> = { ...(data as Record<string, unknown>), org_id: orgId };
    if (table === "eudr_plot_claims" && row.hold_risk === null) {
      row.hold_risk = suggestHoldRiskFromValidationState(row.validation_state as string);
    }
    return row;
  });
}

/** Merge parse-stage rejections and entity-ref-stage rejections into one rowNumber-ordered list, for a
 *  single, honest per-row rejection feed in the response body (rather than two separate arrays the caller
 *  has to reconcile). */
export function mergeRejections(
  parseRejected: RejectedRow[],
  entityRefRejected: RejectedRow[]
): RejectedRow[] {
  return [...parseRejected, ...entityRefRejected].sort((a, b) => a.rowNumber - b.rowNumber);
}
