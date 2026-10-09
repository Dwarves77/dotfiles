// relevance.mjs, READ-TIME contextualization core (Option B, mig 251). PURE, no DB, no LLM. The one function that
// reads a database, fetchObligationObjectsForItem (lane OBL-2), takes its client as an argument.
//
// The shared brief is role-generic (correct for shared canonical analysis). This computes, per VIEWER,
// how a given item relates to THEIR workspace profile, "relevance to your operation", by joining the
// item's own tags (transport_modes, jurisdictions, topics/scenarios) against the profile. Deterministic,
// $0, runs on every read. Level 2 (a cached authored paragraph) layers on top; this is Level 1.
//
// It is a LENS, not a filter: a broad global forwarder matches most items, and that is correct, the value
// is HIGHLIGHTING which of the reader's dimensions each item touches, not narrowing the corpus.
//
// APPLICABILITY (coordinator ruling 2026-09-29, rule 17 "nothing runs alone" + the lane contract's
// Reachable condition): the relevance result also carries `applicability`, computed by
// compute-applicability.mjs's computeApplicability against an obligation derived from whatever
// scope/threshold field the item already carries. Checked first (src/lib/obligations/read-register.mjs,
// migration 290): no role or size-threshold column exists anywhere on the obligation register or
// intelligence_items today, EXCEPT `compliance_object_tags` (the item's own locked 18-value
// role/entity vocabulary, already read above for the vertical-match hay), that is the one real
// field mapped to a roleScope (profile/profile-contract.mjs's COMPLIANCE_OBJECT_TO_ORG_ROLE). No
// size-threshold field exists on any live row, so `applicability` never derives one from real data
// today; `obligation.sizeThreshold` is read defensively from `item.size_threshold` ONLY if a caller
// (or a future producer) sets it, no schema change, no live writer sets it, but the gate's own
// needs_profile_input naming stays exercised end to end (see relevance.test.mjs) the moment one
// does. compliance_object_tags with zero ORG_ROLES-mapped entries yields an empty roleScope, which
// compute-applicability.mjs's evaluateRoleScope reads as "no role named" (applies to every role),
// never a false does_not_apply.
//
// OBLIGATION GRAIN (lane OBL-2, 2026-10-08, migration 376): when `item.obligation_objects` carries rows (the
// item's current obligation_objects), roleScope and sizeThreshold are read PER OBJECT, roleScope from
// duty_holder_class (DUTY_HOLDER_CLASSES in contracts/vocabularies.mjs maps each class to ORG_ROLES ids) plus an `org_role` applicability_trigger,
// sizeThreshold from a size-dimension applicability_trigger, and the item `applicability` is the aggregate of its
// objects (applies if any object applies, else needs_profile_input if any needs input, else does_not_apply). The
// result also carries `binding` (summariseObligationBinding): one line per distinct binding_position with the
// duty-holder classes and the trigger that put the customer in scope, which the Regulations detail page binding
// banner renders. When the item has NO objects the item-grain path above is used unchanged (memory:
// never-break-existing-display) and `binding.decomposed` is false.
//
// Inputs (all optional-safe):
//   item:    { transport_modes?, jurisdictions?, jurisdiction_iso?, topic_tags?, operational_scenario_tags?,
//              compliance_object_tags?, title?, full_brief?, size_threshold?, obligation_objects? }
//   profile: { verticals?: string[] (sector ids), jurisdictions?: Record<string,number> (weights),
//              transport_modes?: string[], roles?: string[], orgRoles?: string[],
//              orgSize?: { headcount_band?, revenue_band?, shipment_volume_band? } }
//   sectorDefs: Array<{ id, label, keywords: string[] }>  (from constants ALL_SECTORS; injected to keep pure)
// Output: { band: 'high'|'medium'|'low', matchedModes, matchedVerticals: [{id,label}], matchedJurisdictions,
//           roleSignals: string[], summary: string,
//           applicability: { status, reasons, missingDimensions, grain? }, binding: { decomposed, ... } }

import { computeApplicability } from "../applicability/compute-applicability.mjs";
import {
  deriveRoleScopeFromComplianceObjectTags,
  ORG_ROLES,
  ORG_SIZE_DIMENSIONS,
  findBand,
} from "../profile/profile-contract.mjs";
import { BINDING_POSITION, DUTY_HOLDER_CLASSES } from "../contracts/vocabularies.mjs";

const arr = (x) => (Array.isArray(x) ? x.filter((v) => typeof v === "string" && v.trim()) : []);
const lc = (s) => String(s || "").toLowerCase();
const uniq = (a) => [...new Set(a)];

// ── obligation grain (lane OBL-2) ─────────────────────────────────────────────────────────────────────────
// duty_holder_class values are read from DUTY_HOLDER_CLASSES in src/lib/contracts/vocabularies.mjs, the one site of
// the vocabulary (coordinator ruling 2026-10-08); each maps to ORG_ROLES ids, or to none. A class not in it is shown
// by its raw id and maps to no role.

const ORG_ROLE_LABEL = Object.fromEntries(ORG_ROLES.map((r) => [r.id, r.label]));
const POSITION_ORDER = Object.values(BINDING_POSITION).sort((a, b) => a.order - b.order).map((p) => p.code);
const APPLICABILITY_RANK = { applies: 0, needs_profile_input: 1, does_not_apply: 2 };

/** True when a duty-holder class list names no class that maps to the forwarder role: the monitoring_only test
 *  (an instrument whose duty holders exclude every forwarder role does not currently reach the customer). */
export function dutyHoldersExcludeForwarder(classes) {
  const list = arr(classes);
  if (!list.length) return false;
  return !list.some((c) => (DUTY_HOLDER_CLASSES[c]?.orgRoles ?? []).includes("forwarder"));
}

function dutyHolderEntry(id) {
  return { id, label: DUTY_HOLDER_CLASSES[id]?.label ?? id };
}

function triggerLabel(trigger) {
  const { attribute, value } = trigger;
  if (attribute === "org_role") return `Your organisation role is ${ORG_ROLE_LABEL[value] ?? value}`;
  const dim = ORG_SIZE_DIMENSIONS[attribute];
  if (dim) {
    const band = findBand(attribute, value);
    const cmp = trigger.comparison === "below" ? "below" : "at least";
    return `${dim.label} is ${cmp} ${band ? band.label : value}`;
  }
  return `${attribute}: ${value}`;
}

/** Read one object's gate inputs: { roleScope, sizeThreshold?, unsupported? }. roleScope is the roles its
 *  duty_holder_class values map to plus an `org_role` trigger value; a size-dimension trigger is the sizeThreshold;
 *  any other attribute is a profile answer this product does not hold, named as `unsupported`. */
function objectGateInputs(object) {
  const trigger = object?.applicability_trigger && typeof object.applicability_trigger === "object" ? object.applicability_trigger : {};
  const roles = arr(object?.duty_holder_class).flatMap((c) => DUTY_HOLDER_CLASSES[c]?.orgRoles ?? []);
  const out = { roleScope: [], sizeThreshold: undefined, unsupported: undefined };
  if (trigger.attribute === "org_role" && ORG_ROLES.some((r) => r.id === trigger.value)) roles.push(trigger.value);
  else if (ORG_SIZE_DIMENSIONS[trigger.attribute] && findBand(trigger.attribute, trigger.value)) {
    out.sizeThreshold = { dimension: trigger.attribute, band: trigger.value, comparison: trigger.comparison === "below" ? "below" : "at_least" };
  } else if (typeof trigger.attribute === "string" && trigger.attribute) out.unsupported = trigger.attribute;
  out.roleScope = uniq(roles);
  return out;
}

function objectApplicability(object, orgProfile) {
  const g = objectGateInputs(object);
  const result = computeApplicability(
    { ...(g.roleScope.length ? { roleScope: g.roleScope } : {}), ...(g.sizeThreshold ? { sizeThreshold: g.sizeThreshold } : {}) },
    orgProfile,
  );
  if (g.unsupported && result.status !== "does_not_apply") {
    return {
      status: "needs_profile_input",
      reasons: [
        ...(result.status === "needs_profile_input" ? result.reasons : []),
        `This obligation applies by "${g.unsupported}", which your profile does not hold yet.`,
      ],
      missingDimensions: uniq([...result.missingDimensions, g.unsupported]),
    };
  }
  return result;
}

function aggregateApplicability(results) {
  if (!results.length) return null;
  const best = [...results].sort((a, b) => APPLICABILITY_RANK[a.status] - APPLICABILITY_RANK[b.status])[0];
  const same = results.filter((r) => r.status === best.status);
  return {
    status: best.status,
    reasons: uniq(same.flatMap((r) => r.reasons)),
    missingDimensions: uniq(same.flatMap((r) => r.missingDimensions)),
  };
}

const SLOT_LABELS = Object.freeze({
  penalty_exposure: "Penalty exposure",
  direct_compliance_cost: "Direct compliance cost",
  effort: "Effort (person-days, not money)",
});

/** The three cost slots of spec 01 section 3.4, carried separately and never merged. A slot with nothing to show
 *  is omitted. Effort is person-days and recurrence only. */
function costSlotsFor(objects) {
  const penalty = [];
  const direct = [];
  const effort = [];
  for (const o of objects) {
    if (typeof o.statutory_maximum === "string" && o.statutory_maximum.trim()) penalty.push(o.statutory_maximum.trim());
    if (typeof o.cost_formula === "string" && o.cost_formula.trim()) penalty.push(`Formula: ${o.cost_formula.trim()}`);
    const d = o.direct_compliance_cost;
    if (d && typeof d === "object" && typeof d.amount === "number") {
      direct.push(`${d.amount} ${d.currency}, ${d.basis} (source: ${d.source})`);
    }
    const e = o.effort;
    if (e && typeof e === "object" && typeof e.person_days === "number") effort.push(`${e.person_days} person-days, ${e.recurrence}`);
  }
  return [["penalty_exposure", penalty], ["direct_compliance_cost", direct], ["effort", effort]]
    .map(([slot, entries]) => ({ slot, label: SLOT_LABELS[slot], entries: uniq(entries) }))
    .filter((s) => s.entries.length > 0);
}

/**
 * Summarise an item's obligation objects for the binding banner and the gate. PURE.
 * @returns {{ decomposed: boolean, objectCount: number, applicability: object|null, lines: object[] }}
 */
export function summariseObligationBinding(objects, orgProfile = {}) {
  const list = (Array.isArray(objects) ? objects : []).filter((o) => o && typeof o === "object");
  if (!list.length) return { decomposed: false, objectCount: 0, applicability: null, lines: [] };
  const profile = {
    orgRoles: arr(orgProfile.orgRoles),
    orgSize: orgProfile.orgSize && typeof orgProfile.orgSize === "object" ? orgProfile.orgSize : {},
  };
  const perObject = list.map((o) => ({ object: o, applicability: objectApplicability(o, profile) }));
  const positions = uniq(list.map((o) => o.binding_position).filter(Boolean));
  positions.sort((a, b) => (POSITION_ORDER.indexOf(a) + 1 || 99) - (POSITION_ORDER.indexOf(b) + 1 || 99));
  const lines = positions.map((position) => {
    const group = perObject.filter((p) => p.object.binding_position === position);
    const triggers = [];
    const seen = new Set();
    for (const { object } of group) {
      const t = object.applicability_trigger;
      if (!t || typeof t !== "object" || !t.attribute) continue;
      const key = `${t.attribute}|${t.value}|${t.comparison ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      triggers.push({ attribute: t.attribute, value: t.value, label: triggerLabel(t) });
    }
    return {
      position,
      label: BINDING_POSITION[position]?.label ?? position,
      note: BINDING_POSITION[position]?.note ?? "",
      dutyHolders: uniq(group.flatMap((p) => arr(p.object.duty_holder_class))).map(dutyHolderEntry),
      triggers,
      applicability: aggregateApplicability(group.map((p) => p.applicability)),
      objectCount: group.length,
      costSlots: costSlotsFor(group.map((p) => p.object)),
    };
  });
  const applicability = aggregateApplicability(perObject.map((p) => p.applicability));
  return { decomposed: true, objectCount: list.length, applicability: { ...applicability, grain: "obligation" }, lines };
}

/** Keep only the current version of each object: drop any row another row names in `supersedes`. PURE. */
export function currentObligationObjects(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const superseded = new Set(list.map((r) => r?.supersedes).filter(Boolean));
  return list.filter((r) => r && !superseded.has(r.obligation_id));
}

export const OBLIGATION_OBJECT_COLUMNS =
  "obligation_id, version, supersedes, pinpoint_citation, binding_position, duty_holder_class, applicability_trigger, " +
  "statutory_maximum, cost_formula, direct_compliance_cost, effort";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Read an item's current obligation objects through an INJECTED client (request-scoped, RLS applies, the register
 * route's posture; this is the only I/O in this module and it is dependency-injected). `itemId` is a uuid or a
 * legacy_id (resolved first, as /api/obligations/register does). Resolves [] for an id that does not resolve;
 * THROWS on a read error so the caller can say the load failed instead of claiming the item has no obligations.
 */
export async function fetchObligationObjectsForItem(supabase, itemId, { limit = 200 } = {}) {
  let uuid = typeof itemId === "string" ? itemId : "";
  if (!uuid) return [];
  if (!UUID_RE.test(uuid)) {
    const { data, error } = await supabase.from("intelligence_items").select("id").eq("legacy_id", uuid).maybeSingle();
    if (error) throw new Error(error.message ?? "item lookup failed");
    uuid = data?.id ?? "";
    if (!uuid) return [];
  }
  const { data, error } = await supabase
    .from("obligation_objects")
    .select(OBLIGATION_OBJECT_COLUMNS)
    .eq("instrument_item_id", uuid)
    .limit(limit);
  if (error) throw new Error(error.message ?? "obligation objects read failed");
  return currentObligationObjects(data ?? []);
}

// import/export/customs signals → the forwarder/importer/exporter roles all engage.
const ROLE_SIGNAL_RE =
  /\b(import|export|customs|declaration|clearance|tariff|duty|duties|hs code|origin|incoterm|manifest|carrier|forwarder|consignee|consignor|transit|cross-border|border)\b/;

export function computeItemRelevance(item = {}, profile = {}, sectorDefs = []) {
  const pModes = arr(profile.transport_modes);
  const iModes = arr(item.transport_modes);
  // Mode match: the item's modes that the workspace operates. If the item declares no modes, a
  // regulation is treated as mode-agnostic (applies across the reader's modes) rather than "no match".
  const matchedModes = iModes.length
    ? iModes.filter((m) => pModes.some((pm) => lc(pm) === lc(m)))
    : [];
  const modeAgnostic = iModes.length === 0;

  // Jurisdiction match: the item's jurisdictions the workspace weights above zero. Global profile → most.
  const weights = profile.jurisdictions && typeof profile.jurisdictions === "object" ? profile.jurisdictions : {};
  const globalScope = (weights.global ?? 0) > 0 || Object.keys(weights).length === 0;
  const iJur = uniq([...arr(item.jurisdictions), ...arr(item.jurisdiction_iso)]);
  const matchedJurisdictions = iJur.filter((j) => {
    if (globalScope) return true; // worldwide operator: every jurisdiction is in scope
    const key = lc(j);
    return Object.keys(weights).some((w) => lc(w) === key && (weights[w] ?? 0) > 0);
  });

  // Vertical match: profile verticals whose sector keywords appear in the item's text/tags.
  const hay = lc([
    item.title,
    ...arr(item.topic_tags),
    ...arr(item.operational_scenario_tags),
    ...arr(item.compliance_object_tags),
  ].join(" "));
  const pVerticals = new Set(arr(profile.verticals).map(lc));
  const matchedVerticals = (Array.isArray(sectorDefs) ? sectorDefs : [])
    .filter((s) => s && pVerticals.has(lc(s.id)) && arr(s.keywords).some((k) => hay.includes(lc(k))))
    .map((s) => ({ id: s.id, label: s.label || s.id }));

  // Role signals: import/export/customs language → the reader's roles engage directly.
  const roleHay = lc([item.title, ...arr(item.compliance_object_tags), ...arr(item.operational_scenario_tags)].join(" "));
  const roleSignals = ROLE_SIGNAL_RE.test(roleHay) ? arr(profile.roles) : [];

  // Band: a lens, not a gate. HIGH when the item touches the reader's modes/jurisdictions AND a vertical
  // or a role signal; MEDIUM on a partial touch; LOW when nothing lines up (rare for a global operator).
  const touchesModes = matchedModes.length > 0 || modeAgnostic;
  const touchesGeo = matchedJurisdictions.length > 0 || globalScope;
  const touchesFocus = matchedVerticals.length > 0 || roleSignals.length > 0;
  const band = touchesModes && touchesGeo && touchesFocus ? "high"
    : (touchesModes || touchesGeo) && (touchesFocus || matchedModes.length || matchedJurisdictions.length) ? "medium"
    : "low";

  // Summary: deterministic "Relevance to your operation" line assembled from the matches.
  const parts = [];
  if (matchedModes.length) parts.push(`your ${matchedModes.join("/")} operations`);
  else if (modeAgnostic) parts.push("your operations across modes");
  if (matchedVerticals.length) parts.push(`the ${matchedVerticals.map((v) => v.label).join(", ")} ${matchedVerticals.length === 1 ? "vertical" : "verticals"}`);
  if (roleSignals.length) parts.push(`your role as ${roleSignals.join("/")}`);
  const geo = globalScope
    ? (matchedJurisdictions.length && matchedJurisdictions.length <= 4 ? ` in ${matchedJurisdictions.join(", ")}` : "")
    : (matchedJurisdictions.length ? ` in ${matchedJurisdictions.slice(0, 4).join(", ")}` : "");
  const summary = parts.length
    ? `Relevance to your operation: affects ${parts.join(", ")}${geo}.`
    : "Relevance to your operation: general applicability to a freight operator.";

  // Applicability: derive an obligation from the item's own compliance_object_tags (roleScope) plus
  // an optional item.size_threshold (defensive read; no live field sets this today, see header),
  // then gate it against the profile's org_roles/org_size (profile-contract.mjs's parseOrgProfile
  // shape). roleScope is undefined, not [], when nothing mapped, so an empty mapping never reads as
  // "applies to zero roles".
  const derivedRoleScope = deriveRoleScopeFromComplianceObjectTags(item.compliance_object_tags);
  const obligation = {
    ...(derivedRoleScope.length ? { roleScope: derivedRoleScope } : {}),
    ...(item.size_threshold && typeof item.size_threshold === "object"
      ? { sizeThreshold: item.size_threshold }
      : {}),
  };
  const orgProfile = {
    orgRoles: arr(profile.orgRoles),
    orgSize: profile.orgSize && typeof profile.orgSize === "object" ? profile.orgSize : {},
  };
  // Obligation grain when the item has decomposed objects; the item-grain gate above is the fallback.
  const binding = summariseObligationBinding(item.obligation_objects, orgProfile);
  const applicability = binding.decomposed ? binding.applicability : computeApplicability(obligation, orgProfile);

  return { band, matchedModes, matchedVerticals, matchedJurisdictions, roleSignals, summary, applicability, binding };
}
