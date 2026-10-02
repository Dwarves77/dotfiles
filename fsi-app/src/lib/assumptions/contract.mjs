// Lane W2-R2 (ASSUMPTION-REGISTER), 2026-10-01.
//
// The per-tenant planning-assumption register, docs/specs/03-research.md section 5. This is a
// DIFFERENT object from the existing `assumption_register` table (migration 271): that table is
// WO-20's register for modelling constants THIS PRODUCT chose (a connection-scorer weight, an idf
// coefficient), read-only to authenticated, no workspace scoping, no write policy at all. Spec
// 03-research.md's own section 10 gap table says, verbatim: "Assumption register | Absent. Per-tenant
// object does not exist." The dispatch that opened this lane asked to grep `assumption_register` and
// build against what it found; what it found is the wrong table for this feature (CORRECTION, see
// this lane's session-log entry). This module is the shape for the NEW per-tenant object, backed by
// migration 345's `planning_assumption_register` table, never migration 271's table.
//
// The shape is spec 03 section 5's exemplar, read literally:
//   "We assume Frankfurt-Milan express road linehaul stays diesel-costed through 2030..."  -> name
//   "...sits under 34% of quoted margin on EU road"                                        -> boundTo
//   "Load-bearing: yes"                                                                     -> loadBearing
//   "Vulnerable: yes"                                                                       -> vulnerable
//   "the last responsible moment is [DATE]"                                                 -> reviewDate
// value/unit are the exemplar's quantified form (e.g. 34, "% of quoted margin") when the assumption
// carries a bare number; boundTo always carries the prose scope even when value/unit are absent (not
// every assumption reduces to one number, e.g. "this corridor stays diesel-costed" has no number of
// its own, only a downstream one).
//
// Pure module: no DB, no Next, no React. node:test only (contract.test.mjs). Consumed by
// src/app/api/workspace/assumptions/logic.ts (write-side validation) and
// src/lib/assumptions/read.ts (shape of what the reader returns).

export const ASSUMPTION_STATUSES = Object.freeze(["active", "superseded", "retired"]);

export const NAME_MAX = 300;
export const BOUND_TO_MAX = 300;
export const UNIT_MAX = 60;
export const SOURCE_NOTE_MAX = 2000;

/**
 * @typedef {Object} AssumptionInput
 * @property {string} name - the assumption itself, quantified where possible (spec 03 "ASSUMPTION AT RISK").
 * @property {number|null} [valueNumeric] - the bare number, when the assumption reduces to one (nullable).
 * @property {string|null} [unit] - unit of valueNumeric; required together with it.
 * @property {string} boundTo - what the assumption sits under, e.g. "34% of quoted margin on EU road"
 *   or "Frankfurt-Milan corridor cost base" (spec 03 section 7 #7, "assumption-register binding").
 * @property {boolean} loadBearing - this assumption sits under a material share of plan/margin.
 * @property {boolean} vulnerable - this assumption depends on an unresolved external outcome.
 * @property {string} reviewDate - ISO date (YYYY-MM-DD), the last responsible moment to revisit.
 * @property {string|null} [sourceNote] - citation or rationale for the figure/assumption.
 * @property {string} [status] - active | superseded | retired, default active.
 */

/**
 * Validate and normalize an assumption input. Returns { valid: true, value } on success, or
 * { valid: false, errors } on failure. Never throws, callers (the API route) turn `errors` into a
 * 400, and the component turns them into inline field messages (ux-laws #14/#15, errors recoverable).
 *
 * @param {Partial<AssumptionInput>} input
 * @returns {{ valid: true, value: AssumptionInput } | { valid: false, errors: string[] }}
 */
export function validateAssumptionInput(input) {
  const errors = [];
  const raw = input && typeof input === "object" ? input : {};

  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) errors.push("name is required");
  else if (name.length > NAME_MAX) errors.push(`name must be ${NAME_MAX} characters or fewer`);

  const boundTo = typeof raw.boundTo === "string" ? raw.boundTo.trim() : "";
  if (!boundTo) errors.push("boundTo is required (what this assumption sits under)");
  else if (boundTo.length > BOUND_TO_MAX) errors.push(`boundTo must be ${BOUND_TO_MAX} characters or fewer`);

  let valueNumeric = null;
  if (raw.valueNumeric !== undefined && raw.valueNumeric !== null && raw.valueNumeric !== "") {
    const n = Number(raw.valueNumeric);
    if (!Number.isFinite(n)) errors.push("valueNumeric must be a finite number");
    else valueNumeric = n;
  }

  let unit = typeof raw.unit === "string" ? raw.unit.trim() : "";
  if (unit.length > UNIT_MAX) errors.push(`unit must be ${UNIT_MAX} characters or fewer`);
  if (valueNumeric !== null && !unit) errors.push("unit is required when valueNumeric is set");
  if (valueNumeric === null) unit = "";

  if (typeof raw.loadBearing !== "boolean") errors.push("loadBearing must be a boolean");
  if (typeof raw.vulnerable !== "boolean") errors.push("vulnerable must be a boolean");

  const reviewDate = typeof raw.reviewDate === "string" ? raw.reviewDate.trim() : "";
  if (!reviewDate) errors.push("reviewDate is required");
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(reviewDate) || Number.isNaN(Date.parse(reviewDate))) {
    errors.push("reviewDate must be an ISO date (YYYY-MM-DD)");
  }

  const sourceNoteRaw = typeof raw.sourceNote === "string" ? raw.sourceNote.trim() : "";
  if (sourceNoteRaw.length > SOURCE_NOTE_MAX) errors.push(`sourceNote must be ${SOURCE_NOTE_MAX} characters or fewer`);

  const status = typeof raw.status === "string" && raw.status ? raw.status : "active";
  if (!ASSUMPTION_STATUSES.includes(status)) {
    errors.push(`status must be one of ${ASSUMPTION_STATUSES.join(", ")}`);
  }

  if (errors.length > 0) return { valid: false, errors };

  return {
    valid: true,
    value: {
      name,
      valueNumeric,
      unit: unit || null,
      boundTo,
      loadBearing: raw.loadBearing,
      vulnerable: raw.vulnerable,
      reviewDate,
      sourceNote: sourceNoteRaw || null,
      status,
    },
  };
}

/**
 * True when an assumption binds (spec 03 section 7 #7): load-bearing AND vulnerable. This is the
 * exact pairing the surface's "ASSUMPTION AT RISK" card keys off; a reader (lane W2-R) uses this to
 * decide whether an assumption is eligible to anchor a so-what, not just render in the register list.
 * @param {{ loadBearing: boolean, vulnerable: boolean }} assumption
 */
export function isAtRisk(assumption) {
  return Boolean(assumption && assumption.loadBearing && assumption.vulnerable);
}
