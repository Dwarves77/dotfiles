// model.mjs , the pure core of the admin corrections screen (lane G7-UI, 2026-10-06). No React, no network of
// its own: the screen's components import this, and the tests drive it with a stubbed fetch.
//
// The API contract is at the top of src/lib/corrections/admin-api/logic.mjs (lane G7-CORR). This module adds no
// behaviour to it: it builds the request bodies the contract names (through the SAME validateCorrectionInput the
// API runs, so the screen and the API cannot disagree), posts them through an injected fetcher, and turns every
// refusal into the API's own message, never a generic one.
import { validateCorrectionInput, OPS_BY_KIND, TAG_COLUMNS, EDGE_RELATIONSHIPS } from "../../../lib/corrections/item-corrections.mjs";

export { OPS_BY_KIND, TAG_COLUMNS, EDGE_RELATIONSHIPS };

export const KIND_FILTERS = Object.freeze(["fact", "tag", "connection", "section_text", "full_brief"]);
export const STATE_FILTERS = Object.freeze(["active", "revoked", "orphaned"]);

const KIND_LABEL = {
  fact: "Fact",
  tag: "Tag",
  connection: "Connection",
  section_text: "Section text",
  full_brief: "Full brief",
};
const STATE_LABEL = { active: "Active", revoked: "Revoked", orphaned: "Orphaned" };
const COLUMN_LABEL = {
  topic_tags: "Topic tags",
  operational_scenario_tags: "Scenario tags",
  compliance_object_tags: "Compliance object tags",
};
const RELATIONSHIP_LABEL = {
  related: "Related to",
  supersedes: "Supersedes",
  implements: "Implements",
  conflicts: "Conflicts with",
  amends: "Amends",
  depends_on: "Depends on",
};

export const kindLabel = (k) => KIND_LABEL[k] ?? "Correction";
export const stateLabel = (s) => STATE_LABEL[s] ?? "Active";
export const columnLabel = (c) => COLUMN_LABEL[c] ?? "Tags";
export const relationshipLabel = (r) => RELATIONSHIP_LABEL[r] ?? "Related to";

/** A plain sentence for what a correction does. No internal slugs. */
export function describeCorrection(c) {
  const k = c?.target_kind;
  const op = c?.op;
  if (k === "fact") return op === "suppress" ? "Hid a fact from customers" : "Replaced a fact";
  if (k === "tag") {
    const tag = String(c?.target_ref ?? "").split(":").slice(1).join(":");
    return op === "add" ? `Added the tag ${tag}` : `Removed the tag ${tag}`;
  }
  if (k === "connection") return op === "add" ? "Added a connection to another item" : "Removed a connection to another item";
  if (k === "section_text") return "Replaced the text of a section";
  if (k === "full_brief") return "Replaced the full brief";
  return "Corrected item data";
}

/** active | revoked | orphaned. An orphaned correction is an ACTIVE fact correction matching no current claim. */
export function stateOf(c) {
  if (!c || c.active === false || (c.revoked_at !== null && c.revoked_at !== undefined)) return "revoked";
  if (c.orphaned === true) return "orphaned";
  return "active";
}

/** The plain explanation shown on an orphaned correction. */
export const ORPHAN_EXPLANATION =
  "The fact this correction was made on has changed or been removed since, so it no longer matches anything on the item. Revoke it, then correct the current fact if it still needs fixing.";

/** Filter by state and target kind; an empty filter means all. */
export function filterCorrections(rows, { state = "", kind = "" } = {}) {
  return (Array.isArray(rows) ? rows : []).filter((c) => (!state || stateOf(c) === state) && (!kind || c.target_kind === kind));
}

export function countByState(rows) {
  const out = { active: 0, revoked: 0, orphaned: 0 };
  for (const c of Array.isArray(rows) ? rows : []) out[stateOf(c)] += 1;
  return out;
}

/** Newest first. */
export const newestFirst = (rows) =>
  [...(Array.isArray(rows) ? rows : [])].sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0));

/** The newest active, non-superseded correction for one target, or null. */
export function activeFor(corrections, kind, ref) {
  const hits = newestFirst(corrections).filter((c) => c.target_kind === kind && c.target_ref === ref && stateOf(c) !== "revoked");
  return hits.find((c) => c.superseded !== true) ?? hits[0] ?? null;
}

/** The machine value a correction overrode: what a writer last tried to store, else what was captured. */
export const machineValueOf = (c) => c?.latest_machine_value ?? c?.machine_value ?? null;

// ---- request building ------------------------------------------------------------------------------------------

function friendlyValidation(v) {
  if (v.code === "reason_required") return "Say why you are overriding the machine value. A reason is required.";
  if (v.code === "fact_needs_span") return "A replacement fact needs a source span and the capture id it came from.";
  return v.error;
}

/**
 * Build the POST body for one action and check it with the API's own validator.
 * @param {{kind:string, op:string, ref:string, value?:object|null, reason:string}} d
 * @returns {{ok:true, body:object}|{ok:false, code:string, message:string}}
 */
export function buildCorrectionBody(d) {
  const body = { target_kind: d.kind, target_ref: d.ref, op: d.op, reason: d.reason };
  if (d.value !== undefined && d.value !== null) body.value = d.value;
  const v = validateCorrectionInput(body);
  if (!v.ok) return { ok: false, code: v.code, message: friendlyValidation(v) };
  return { ok: true, body: { ...body, reason: v.input.reason, target_ref: v.input.target_ref } };
}

/** The value object for each action's form fields. Pure; trims where the API trims. */
export function valueFor(kind, op, f = {}) {
  if (kind === "full_brief" && op === "replace") return { text: String(f.text ?? "") };
  if (kind === "section_text" && op === "replace") return { content_md: String(f.content_md ?? "") };
  if (kind === "fact" && op === "replace") {
    const v = { source_span: String(f.source_span ?? "").trim(), search_result_id: String(f.search_result_id ?? "").trim() };
    if (String(f.claim_text ?? "").trim()) v.claim_text = String(f.claim_text).trim();
    return v;
  }
  if (kind === "connection" && op === "add") return f.relationship ? { relationship: f.relationship } : null;
  return null;
}

// ---- transport (the fetcher is injected: authedFetch in the app, a stub in tests) ------------------------------

const base = (itemId) => `/api/admin/items/${encodeURIComponent(itemId)}/corrections`;

async function readError(res) {
  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  const message = typeof payload?.error === "string" && payload.error ? payload.error : `The request failed (status ${res.status}).`;
  return { ok: false, status: res.status, code: typeof payload?.code === "string" ? payload.code : "", message };
}

/** GET the item's corrections.
 * @returns {Promise<{ok:true,corrections:Array<any>,counts:any}|{ok:false,status:number,code:string,message:string}>} */
export async function fetchItemCorrections(fetcher, itemId) {
  let res;
  try {
    res = await fetcher(base(itemId));
  } catch {
    return { ok: false, status: 0, code: "network", message: "Could not reach the server. Check the connection and try again." };
  }
  if (!res.ok) return readError(res);
  const data = await res.json();
  return { ok: true, corrections: Array.isArray(data?.corrections) ? data.corrections : [], counts: data?.counts ?? null };
}

/** POST one correction. Validates first, so a missing reason never leaves the browser.
 * @returns {Promise<{ok:true,id:string|null}|{ok:false,status:number,code:string,message:string}>} */
export async function postCorrection(fetcher, itemId, draft) {
  const built = buildCorrectionBody(draft);
  if (!built.ok) return { ok: false, status: 0, code: built.code, message: built.message };
  let res;
  try {
    res = await fetcher(base(itemId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(built.body),
    });
  } catch {
    return { ok: false, status: 0, code: "network", message: "Could not reach the server. Your input is kept. Try again." };
  }
  if (!res.ok) return readError(res);
  const data = await res.json();
  return { ok: true, id: data?.id ?? null };
}

/** POST a revoke. A reason is required on this screen even though the API treats it as optional.
 * @returns {Promise<{ok:true}|{ok:false,status:number,code:string,message:string}>} */
export async function postRevoke(fetcher, itemId, correctionId, reason) {
  const text = String(reason ?? "").trim();
  if (!text) return { ok: false, status: 0, code: "reason_required", message: "Say why you are revoking this correction. A reason is required." };
  let res;
  try {
    res = await fetcher(`${base(itemId)}/${encodeURIComponent(correctionId)}/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: text }),
    });
  } catch {
    return { ok: false, status: 0, code: "network", message: "Could not reach the server. Try again." };
  }
  if (!res.ok) return readError(res);
  return { ok: true };
}

// ---- the screen gate (a non-admin never reaches a read) --------------------------------------------------------

/**
 * The item screen's server flow: the platform-admin gate runs FIRST and a refusal (the gate redirects by
 * throwing) means the loader is never called. `requireAdmin` is src/lib/auth/admin.ts requirePlatformAdmin.
 */
export async function loadItemScreen({ requireAdmin, load }) {
  await requireAdmin();
  return load();
}
