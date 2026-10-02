// Row <-> API-shape mapping for planning_assumption_register (migration 345). Pure, shared by
// read.ts (GET consumers, incl. lane W2-R's planning-assumption-shift renderer) and
// api/workspace/assumptions/logic.ts (the write-side CRUD). Kept separate from contract.mjs: that
// module validates INPUT shape; this one maps DB column names <-> the camelCase shape callers use.

/**
 * @typedef {Object} AssumptionRow
 * @property {string} id
 * @property {string} orgId
 * @property {string} name
 * @property {number|null} valueNumeric
 * @property {string|null} unit
 * @property {string} boundTo
 * @property {boolean} loadBearing
 * @property {boolean} vulnerable
 * @property {string} reviewDate
 * @property {string|null} sourceNote
 * @property {string} status
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/** DB row (snake_case) -> API shape (camelCase). */
export function mapAssumptionRow(row) {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    valueNumeric: row.value_numeric === undefined ? null : row.value_numeric,
    unit: row.unit ?? null,
    boundTo: row.bound_to,
    loadBearing: Boolean(row.load_bearing),
    vulnerable: Boolean(row.vulnerable),
    reviewDate: row.review_date,
    sourceNote: row.source_note ?? null,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** The field mapping toInsertRow and toUpdateRow share: every validated-value column except the
 *  identity/ownership columns each caller adds on top (org_id+created_by for insert, updated_at for
 *  update). One definition, so the two writers cannot drift from each other field by field. */
function sharedFields(value) {
  return {
    name: value.name,
    value_numeric: value.valueNumeric,
    unit: value.unit,
    bound_to: value.boundTo,
    load_bearing: value.loadBearing,
    vulnerable: value.vulnerable,
    review_date: value.reviewDate,
    source_note: value.sourceNote,
    status: value.status,
  };
}

/** Validated API shape (from contract.mjs) + orgId/createdBy -> DB insert row. */
export function toInsertRow(value, { orgId, createdBy }) {
  return { org_id: orgId, ...sharedFields(value), created_by: createdBy };
}

/** Validated API shape -> DB update row (no org_id/created_by, PATCH never moves ownership). */
export function toUpdateRow(value) {
  return { ...sharedFields(value), updated_at: new Date().toISOString() };
}
