// item-corrections.mjs , the ONE JS home for the admin correction layer's read side (lane G7-CORR, 2026-10-06).
//
// Migration 356 (item_corrections) holds every admin correction to item data (fact, tag, connection,
// section_text, full_brief). The DATABASE preserves a correction through every machine write (BEFORE
// triggers call item_corrections_patch()), so no writer needs to change. This module is what the READERS
// share: the scripts and modules that PLAN around a correction so they report accurately instead of
// writing something the trigger will strip or skip.
//
//   write-edges.mjs / link-items.ts / lineage-backfill.mjs  -> tombstonedPairKeys(), isPairTombstoned()
//   apply-tags.mjs / propose-tags.mjs                       -> removedTagsFor(), filterTagProposals()
//   load-detail-core.ts fetchClaimTierMap                    -> suppressedClaimMatcher()
//   the admin API logic                                      -> validateCorrectionInput(), latestPerTarget()
//
// Semantics mirror the SQL exactly (item_corrections_latest, item_corrections_pair_tombstoned):
//   active  = revoked_at is null
//   latest  = newest active correction per (item_id, target_kind, target_ref), ties broken by id
//   a connection pair is tombstoned when the newest active connection correction between the two items, in
//   either direction, is a `remove`.
// Pure except readItemCorrections / readAllCorrections, which take a caller-supplied client and never
// construct one (same posture as write-edges.mjs). A read ERROR throws (fail closed): a reader that cannot
// see the corrections must not plan as if there were none.

import { fetchAllRows } from "../db/paginate.mjs";

export const TARGET_KINDS = Object.freeze(["fact", "tag", "connection", "section_text", "full_brief"]);
export const OPS = Object.freeze(["suppress", "add", "remove", "replace"]);

/** The ops each target_kind allows. Mirrors the item_corrections_kind_op_chk CHECK in migration 356. */
export const OPS_BY_KIND = Object.freeze({
  fact: Object.freeze(["suppress", "replace"]),
  tag: Object.freeze(["add", "remove"]),
  connection: Object.freeze(["add", "remove"]),
  section_text: Object.freeze(["replace"]),
  full_brief: Object.freeze(["replace"]),
});

export const TAG_COLUMNS = Object.freeze(["topic_tags", "operational_scenario_tags", "compliance_object_tags"]);
export const EDGE_RELATIONSHIPS = Object.freeze(["related", "supersedes", "implements", "conflicts", "amends", "depends_on"]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const tagRef = (column, tag) => `${column}:${tag}`;

/** Split a tag target_ref into { column, tag }, or null when malformed. */
export function parseTagRef(ref) {
  if (typeof ref !== "string") return null;
  const i = ref.indexOf(":");
  if (i <= 0) return null;
  const column = ref.slice(0, i);
  const tag = ref.slice(i + 1);
  if (!TAG_COLUMNS.includes(column) || tag.trim() === "") return null;
  return { column, tag };
}

/** Active corrections only (revoked_at is null). */
export function activeCorrections(rows) {
  return (Array.isArray(rows) ? rows : []).filter((r) => r && (r.revoked_at === null || r.revoked_at === undefined));
}

const newer = (a, b) => {
  const ta = Date.parse(a.created_at ?? "") || 0;
  const tb = Date.parse(b.created_at ?? "") || 0;
  if (ta !== tb) return ta > tb;
  return String(a.id ?? "") > String(b.id ?? "");
};

/**
 * The newest ACTIVE correction per (item_id, target_kind, target_ref), as a Map keyed `${item_id}|${kind}|${ref}`.
 * @param {Array<object>} rows item_corrections rows
 */
export function latestPerTarget(rows) {
  const out = new Map();
  for (const r of activeCorrections(rows)) {
    const key = `${r.item_id}|${r.target_kind}|${r.target_ref}`;
    const cur = out.get(key);
    if (!cur || newer(r, cur)) out.set(key, r);
  }
  return out;
}

// ---- connections ---------------------------------------------------------------------------------------------

const pairKey = (a, b) => (String(a) < String(b) ? `${a}|${b}` : `${b}|${a}`);

/**
 * The tombstoned connection pairs: for each unordered pair, the newest active connection correction (either
 * direction) decides; the pair is tombstoned when that correction is a `remove`.
 * @returns {Set<string>} canonical `min|max` pair keys
 */
export function tombstonedPairKeys(rows) {
  const newest = new Map();
  for (const r of activeCorrections(rows)) {
    if (r.target_kind !== "connection") continue;
    const k = pairKey(r.item_id, r.target_ref);
    const cur = newest.get(k);
    if (!cur || newer(r, cur)) newest.set(k, r);
  }
  const out = new Set();
  for (const [k, r] of newest) if (r.op === "remove") out.add(k);
  return out;
}

/** True when the pair (either direction) is in the tombstone set built by tombstonedPairKeys. */
export function isPairTombstoned(tombstones, a, b) {
  return tombstones instanceof Set && tombstones.has(pairKey(a, b));
}

// ---- tags ----------------------------------------------------------------------------------------------------

/**
 * The tags an admin removed from one item, per tag column (latest active correction per tag ref is a `remove`).
 * @returns {{topic_tags:Set<string>, operational_scenario_tags:Set<string>, compliance_object_tags:Set<string>}}
 */
export function removedTagsFor(rows, itemId) {
  const out = { topic_tags: new Set(), operational_scenario_tags: new Set(), compliance_object_tags: new Set() };
  for (const r of latestPerTarget(rows).values()) {
    if (r.target_kind !== "tag" || r.item_id !== itemId || r.op !== "remove") continue;
    const p = parseTagRef(r.target_ref);
    if (p) out[p.column].add(p.tag);
  }
  return out;
}

/**
 * Drop the proposals an admin removed. PURE.
 * @param {Array<{field:string, tag:string}>} proposals
 * @param {{[column:string]: Set<string>}} removed from removedTagsFor
 * @returns {{kept:Array<object>, blocked:Array<object>}}
 */
export function filterTagProposals(proposals, removed) {
  const kept = [];
  const blocked = [];
  for (const p of Array.isArray(proposals) ? proposals : []) {
    if (removed?.[p?.field] instanceof Set && removed[p.field].has(p.tag)) blocked.push(p);
    else kept.push(p);
  }
  return { kept, blocked };
}

// ---- facts ---------------------------------------------------------------------------------------------------

/**
 * A predicate telling whether a claim row is suppressed for one item. A claim matches a fact correction by its
 * id (target_ref) OR by the original machine claim_text captured in machine_value (so a claim re-inserted by a
 * regeneration under a new id is still matched). The newest matching active correction decides; the claim is
 * suppressed when that one is a `suppress`. A later `replace` therefore un-suppresses it, same as the SQL's
 * latest-wins rule. A correction naming the claim's id outranks any text match: the id decides first, the text
 * only for a claim no correction names by id.
 * @param {Array<object>} rows item_corrections rows (any kinds, any items)
 * @param {string} itemId
 * @returns {(claim:{id?:string, claim_text?:string}) => boolean}
 */
export function suppressedClaimMatcher(rows, itemId) {
  const facts = [...latestPerTarget(rows).values()].filter((r) => r.target_kind === "fact" && r.item_id === itemId);
  return (claim) => {
    // ID FIRST (lane DFIX-2): a correction that names this claim's id decides it, whatever newer corrections
    // happen to share its text. The captured machine text is the fallback only for a claim no correction names
    // by id, i.e. one a regeneration re-inserted under a new id.
    let idDecider = null;
    let textDecider = null;
    for (const r of facts) {
      const byId = claim?.id !== undefined && claim.id !== null && String(claim.id) === r.target_ref;
      const byText = typeof claim?.claim_text === "string" && r.machine_value && r.machine_value.claim_text === claim.claim_text;
      if (byId) {
        if (!idDecider || newer(r, idDecider)) idDecider = r;
      } else if (byText) {
        if (!textDecider || newer(r, textDecider)) textDecider = r;
      }
    }
    const decider = idDecider ?? textDecider;
    return decider !== null && decider.op === "suppress";
  };
}

/**
 * Active fact corrections that match no current claim: no claim carries the correction's target id, its original
 * machine claim_text, or (for a replace) the corrected claim_text. A regeneration that changed or dropped the claim
 * orphans its correction. Reported only; nothing is re-matched automatically. PURE.
 * @param {Array<object>} rows item_corrections rows
 * @param {Array<{id?:string, claim_text?:string}>} claims the CURRENT claims of the item
 * @returns {Array<object>} the orphaned corrections
 */
export function findOrphanedFactCorrections(rows, claims) {
  const list = Array.isArray(claims) ? claims : [];
  return activeCorrections(rows).filter((r) => {
    if (r.target_kind !== "fact") return false;
    return !list.some((c) => {
      if (c?.id !== undefined && c.id !== null && String(c.id) === r.target_ref) return true;
      if (typeof c?.claim_text !== "string") return false;
      return c.claim_text === r.machine_value?.claim_text || (r.value && c.claim_text === r.value.claim_text);
    });
  });
}

// ---- input validation (shared by the admin API logic; the database re-checks everything) ---------------------

/**
 * Validate and normalise an admin correction request body. PURE. Never reads `created_by` (the caller takes the
 * actor from the session). Returns { ok:true, input } or { ok:false, code, error }.
 */
export function validateCorrectionInput(body) {
  const b = body && typeof body === "object" ? body : {};
  const reason = typeof b.reason === "string" ? b.reason.trim() : "";
  if (!reason) return { ok: false, code: "reason_required", error: "reason is required: say why the machine value is being overridden" };
  const kind = b.target_kind;
  if (!TARGET_KINDS.includes(kind)) return { ok: false, code: "target_kind_invalid", error: `target_kind must be one of ${TARGET_KINDS.join(", ")}` };
  const op = b.op;
  if (!OPS_BY_KIND[kind].includes(op)) return { ok: false, code: "op_invalid", error: `op for ${kind} must be one of ${OPS_BY_KIND[kind].join(", ")}` };
  const ref = typeof b.target_ref === "string" ? b.target_ref.trim() : "";
  if (!ref) return { ok: false, code: "target_ref_required", error: "target_ref is required" };
  const value = b.value === undefined ? null : b.value;
  if (value !== null && (typeof value !== "object" || Array.isArray(value))) return { ok: false, code: "value_invalid", error: "value must be a JSON object when given" };

  if (kind === "tag" && !parseTagRef(ref)) return { ok: false, code: "target_ref_invalid", error: `a tag target_ref is <${TAG_COLUMNS.join("|")}>:<tag>` };
  if ((kind === "fact" || kind === "connection") && !UUID_RE.test(ref)) return { ok: false, code: "target_ref_invalid", error: `a ${kind} target_ref is a uuid` };
  if (kind === "full_brief" && ref !== "full_brief") return { ok: false, code: "target_ref_invalid", error: "a full_brief target_ref is the literal full_brief" };
  if (kind === "full_brief" && !(typeof value?.text === "string" && value.text.trim())) return { ok: false, code: "value_invalid", error: 'a full_brief replace needs value {"text": "..."}' };
  if (kind === "section_text" && !(typeof value?.content_md === "string" && value.content_md.trim())) return { ok: false, code: "value_invalid", error: 'a section_text replace needs value {"content_md": "..."}' };
  if (kind === "fact" && op === "replace") {
    if (!(typeof value?.source_span === "string" && value.source_span.trim()) || !(typeof value?.search_result_id === "string" && UUID_RE.test(value.search_result_id))) {
      return { ok: false, code: "fact_needs_span", error: 'a fact replace needs value {"source_span", "search_result_id"} (ADR-016: the span must be verbatim in a held capture)' };
    }
  }
  if (kind === "connection" && op === "add" && value?.relationship !== undefined && !EDGE_RELATIONSHIPS.includes(value.relationship)) {
    return { ok: false, code: "value_invalid", error: `relationship must be one of ${EDGE_RELATIONSHIPS.join(", ")}` };
  }
  return { ok: true, input: { target_kind: kind, target_ref: ref, op, value, reason } };
}

// ---- reads (caller-supplied client; read error throws) -------------------------------------------------------

/** Every correction of one item (any kind, active and revoked). PostgREST-style client. */
export async function readItemCorrections(sb, itemId) {
  const { data, error } = await sb.from("item_corrections").select("*").eq("item_id", itemId);
  if (error) throw new Error(`item_corrections read failed: ${error.message}`);
  return data ?? [];
}

/**
 * Every connection correction that involves one item, on either side: recorded against it (item_id) or
 * naming it as the other end (target_ref). Two plain equality reads, merged by id.
 */
export async function readConnectionCorrectionsFor(sb, itemId) {
  const own = (await readItemCorrections(sb, itemId)).filter((r) => r.target_kind === "connection");
  const { data, error } = await sb.from("item_corrections").select("*").eq("target_kind", "connection").eq("target_ref", itemId);
  if (error) throw new Error(`item_corrections read failed: ${error.message}`);
  const seen = new Set(own.map((r) => r.id));
  return [...own, ...(data ?? []).filter((r) => !seen.has(r.id))];
}

/** Every correction of every item, paginated on the unique id. Small table; callers filter in memory. */
export async function readAllCorrections(sb) {
  return fetchAllRows((from, to) =>
    sb.from("item_corrections").select("*").order("id", { ascending: true }).range(from, to),
  );
}
