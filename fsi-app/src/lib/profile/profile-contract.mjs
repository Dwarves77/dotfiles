// profile-contract.mjs, the profile dimension vocabulary for role and organisation size
// (workstream 7, ADR-034 decision points 1-2, lane W2-E). PURE, no DB, no LLM.
//
// ADR-034 decision point 1: "The core's user is any organisation affected by regulation and market
// change, profiled by ROLE (e.g. shipper, importer of record, exporter, forwarder, carrier,
// warehouse operator, lender/borrower of goods, public body). One organisation may hold several
// roles." This module is the vocabulary + validator for that dimension, and for decision point 2
// ("Organisation size is a profile dimension. Thresholds (headcount, revenue, shipment volume) gate
// applicability").
//
// Storage: stored under `workspace_settings.profile` jsonb (migration 251, additive, no DDL needed ,
// see PROFILE_JSON_KEYS below) as NEW keys, deliberately separate from the EXISTING `profile.roles`
// key. That existing key is free text ("freight forwarder", "importer", "exporter", seeded by
// migration 251) consumed by src/lib/workspace/relevance.mjs as a read-time RELEVANCE LENS
// (highlighting, never a gate, see that file's header comment) and pinned by
// src/lib/workspace/profile.npmtest.mjs. This module's `org_roles` is a CONTROLLED VOCABULARY
// consumed by src/lib/applicability/compute-applicability.mjs as an APPLICABILITY GATE
// (applies / does not apply / needs profile input). Reusing the existing free-text key for a
// controlled-vocabulary gate would either break the pinned relevance contract or silently coerce
// prose into vocabulary tokens; two keys under the same jsonb column is additive and keeps both
// consumers honest about what they read.
//
// Bands, not free numbers (ADR-034 decision point 2: "Thresholds ... gate applicability"): headcount,
// revenue and shipment-volume are each a small NAMED band vocabulary, never a raw number typed by the
// reader or compared arithmetically against an obligation's threshold. An obligation names a band
// (e.g. "applies at 'medium' headcount or above"), never a number, so the comparison is always
// band-rank vs band-rank, no unit-conversion, no currency, no "as of" date to get wrong.

/** Role vocabulary (ADR-034 decision point 1). One organisation may hold several roles at once ,
 *  org_roles is always an ARRAY, never a single value. */
export const ORG_ROLES = Object.freeze([
  { id: "shipper", label: "Shipper" },
  { id: "importer_of_record", label: "Importer of record" },
  { id: "exporter", label: "Exporter" },
  { id: "forwarder", label: "Freight forwarder" },
  { id: "carrier", label: "Carrier" },
  { id: "warehouse_operator", label: "Warehouse operator" },
  { id: "lender_borrower_of_goods", label: "Lender / borrower of goods" },
  { id: "public_body", label: "Public body" },
]);

const ORG_ROLE_IDS = new Set(ORG_ROLES.map((r) => r.id));

/** Organisation-size dimensions (ADR-034 decision point 2). Each dimension is a small ordered band
 *  vocabulary, `rank` is the ordering used for threshold comparison (compute-applicability.mjs). */
export const ORG_SIZE_DIMENSIONS = Object.freeze({
  headcount: {
    id: "headcount",
    label: "Headcount",
    // EU SME thresholds (recognisable, freight-industry-neutral scheme; Commission Recommendation
    // 2003/361/EC Art. 2) reused as band boundaries, not invented, and already the shape most
    // regulatory size carve-outs cite.
    bands: Object.freeze([
      { id: "micro", label: "Micro (under 10 employees)", rank: 0 },
      { id: "small", label: "Small (10-49 employees)", rank: 1 },
      { id: "medium", label: "Medium (50-249 employees)", rank: 2 },
      { id: "large", label: "Large (250+ employees)", rank: 3 },
    ]),
  },
  revenue: {
    id: "revenue",
    label: "Annual revenue",
    // Same EU SME scheme's turnover axis (<=EUR2m / <=EUR10m / <=EUR50m / >EUR50m), named not numbered
    // in the UI, the band is what an obligation thresholds against, the currency figure is context.
    bands: Object.freeze([
      { id: "micro", label: "Micro (up to EUR 2m)", rank: 0 },
      { id: "small", label: "Small (up to EUR 10m)", rank: 1 },
      { id: "medium", label: "Medium (up to EUR 50m)", rank: 2 },
      { id: "large", label: "Large (over EUR 50m)", rank: 3 },
    ]),
  },
  shipment_volume: {
    id: "shipment_volume",
    label: "Annual shipment volume",
    // Freight-specific; no external standard to anchor to, so bands are qualitative and ordered,
    // not tied to a unit (TEU/tonnage/shipment-count vary too much by mode to pick one honestly).
    bands: Object.freeze([
      { id: "low", label: "Low (occasional shipments)", rank: 0 },
      { id: "medium", label: "Medium (regular, non-daily)", rank: 1 },
      { id: "high", label: "High (daily volume)", rank: 2 },
      { id: "very_high", label: "Very high (high-frequency, multi-lane)", rank: 3 },
    ]),
  },
});

/** Read-only lookup: band id -> {id, label, rank} for a given dimension, or undefined. */
export function findBand(dimension, bandId) {
  const dim = ORG_SIZE_DIMENSIONS[dimension];
  if (!dim || !bandId) return undefined;
  return dim.bands.find((b) => b.id === bandId);
}

/** The jsonb keys this module owns under workspace_settings.profile (additive; no DDL, migration
 *  251 already carries the column as '{}'::jsonb NOT NULL DEFAULT). Deliberately NOT `roles` or
 *  `transport_modes`/etc, see header comment. */
export const PROFILE_JSON_KEYS = Object.freeze({
  orgRoles: "org_roles",
  orgSize: "org_size",
});

/** DEFAULT profile for org_roles/org_size, empty, never invented. A profile that has not been
 *  configured is "needs profile input" territory for any obligation that scopes on these
 *  dimensions, never a silently-assumed default (absence wording rule, 2026-09-25 close). */
export const DEFAULT_ORG_PROFILE = Object.freeze({
  orgRoles: [],
  orgSize: Object.freeze({ headcount_band: null, revenue_band: null, shipment_volume_band: null }),
});

/**
 * Validate a candidate org-roles/org-size profile input (e.g. from the settings form before
 * persisting to workspace_settings.profile). Returns { valid, errors: string[] }.
 */
export function validateProfileInput(input = {}) {
  const errors = [];
  const orgRoles = Array.isArray(input.orgRoles) ? input.orgRoles : [];
  for (const r of orgRoles) {
    if (!ORG_ROLE_IDS.has(r)) errors.push(`unknown role id: ${r}`);
  }
  const orgSize = input.orgSize && typeof input.orgSize === "object" ? input.orgSize : {};
  for (const dimKey of Object.keys(ORG_SIZE_DIMENSIONS)) {
    const bandKey = `${dimKey}_band`;
    const value = orgSize[bandKey];
    if (value == null) continue; // unset is valid, "needs profile input" is computed downstream
    if (!findBand(dimKey, value)) errors.push(`unknown ${dimKey} band id: ${value}`);
  }
  return { valid: errors.length === 0, errors };
}

// ── compliance_object_tags to ORG_ROLES mapping (coordinator ruling 2026-09-29: wire the
// applicability gate from whatever scope field an item already carries) ─────────────────────────
//
// `compliance_object_tags` is intelligence_items' existing locked 18-value vocabulary naming "the
// supply-chain roles or operational entities the regulation imposes obligations on"
// (src/lib/agent/system-prompt.ts). It is the only role-scope-shaped field any item or obligations
// row carries today (checked: src/lib/obligations/read-register.mjs's REGISTER_SELECT has no role
// or size column; migration 290's obligations table has none either). This maps that vocabulary
// onto ADR-034's 8-role ORG_ROLES vocabulary where a clear correspondence exists. Tags with no
// ORG_ROLES counterpart (manufacturer-producer, distributor, port-operator, airport-operator,
// terminal-operator) are left unmapped, not force-fitted, per CLAUDE.md rule 2 (never fabricate).
const COMPLIANCE_OBJECT_TO_ORG_ROLE = Object.freeze({
  "carrier-ocean": "carrier",
  "carrier-air": "carrier",
  "carrier-road": "carrier",
  "carrier-rail": "carrier",
  "vessel-operator": "carrier",
  "aircraft-operator": "carrier",
  "road-fleet-operator": "carrier",
  "freight-forwarder": "forwarder",
  "customs-broker": "importer_of_record",
  nvocc: "forwarder",
  shipper: "shipper",
  importer: "importer_of_record",
  exporter: "exporter",
  "warehouse-operator": "warehouse_operator",
});

/**
 * Derive an ORG_ROLES-vocabulary roleScope from an item's `compliance_object_tags` (the only
 * role-shaped field intelligence_items already carries). Pure, no DB. Unmapped/unknown tags are
 * dropped (not fabricated into a nearest role); a tag list with no mapped entries returns [], which
 * compute-applicability.mjs's evaluateRoleScope treats as "no role scope named" (applies to every
 * role) when used as an obligation's roleScope, so this function should only feed an obligation
 * when at least one mapped role exists, per the caller (relevance.mjs).
 */
export function deriveRoleScopeFromComplianceObjectTags(tags) {
  const arr = Array.isArray(tags) ? tags : [];
  const mapped = arr.map((t) => COMPLIANCE_OBJECT_TO_ORG_ROLE[t]).filter(Boolean);
  return [...new Set(mapped)];
}

/**
 * Parse the raw `workspace_settings.profile` jsonb value into the {orgRoles, orgSize} shape this
 * module and the applicability engine consume. Never fails closed on malformed input, falls back
 * to DEFAULT_ORG_PROFILE per key, matching getWorkspaceProfile's "never fail closed on a missing
 * profile" convention (src/lib/workspace/profile.ts).
 */
export function parseOrgProfile(rawProfileJson) {
  const p = rawProfileJson && typeof rawProfileJson === "object" ? rawProfileJson : {};
  const orgRolesRaw = p[PROFILE_JSON_KEYS.orgRoles];
  const orgRoles = Array.isArray(orgRolesRaw) ? orgRolesRaw.filter((r) => ORG_ROLE_IDS.has(r)) : [];
  const orgSizeRaw = p[PROFILE_JSON_KEYS.orgSize] && typeof p[PROFILE_JSON_KEYS.orgSize] === "object"
    ? p[PROFILE_JSON_KEYS.orgSize]
    : {};
  const orgSize = {
    headcount_band: findBand("headcount", orgSizeRaw.headcount_band) ? orgSizeRaw.headcount_band : null,
    revenue_band: findBand("revenue", orgSizeRaw.revenue_band) ? orgSizeRaw.revenue_band : null,
    shipment_volume_band: findBand("shipment_volume", orgSizeRaw.shipment_volume_band)
      ? orgSizeRaw.shipment_volume_band
      : null,
  };
  return { orgRoles, orgSize };
}
