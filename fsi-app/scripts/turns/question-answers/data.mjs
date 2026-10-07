// data.mjs: the reads and the pure bundle assembly shared by the question export and the answer apply step
// (lane L4-B, 2026-10-05, ADR-044).
//
// ONE home for "what a question is answered from and validated against", so the export that hands an author
// the bundle and the apply step that validates the author's batch read the SAME rows the SAME way (a second
// copy would let the export show one thing and the validator check another). Every function takes its
// database reads as injected deps ({ readAll, readAllByIds }, the scripts/lib/db.mjs shapes) so the fixture
// tests run with no database, and nothing here writes.
//
// A question is an open integrity_flags row under the `question:` namespace (flag-namespaces.mjs, written by
// the trigger generator). Its held material is the question's item plus the items connected to it by an
// item_cross_references edge, at most MAX_CONNECTED of them, typed edges first (a typed edge is one whose
// relationship is not the generic "related"; the intersection signal rides on the same edge row's basis).
// Held pool text is retrieved by seek-more.mjs queryHeldPools and identified by heldPoolHash; both are the
// shared implementations, not copies.

import { QUESTION_NAMESPACE, HOLDINGS_NEED_NAMESPACE, HOLDINGS_NEED_ACTION, TERM_NEED_NAMESPACE, createdBy } from "../../../src/lib/connections/flag-namespaces.mjs";
import { TERM_KINDS } from "../../../src/lib/connections/term-recurrence.mjs";
import { PRODUCT_QUESTIONS } from "../../../src/lib/learning/constants.mjs";
import { usableCapturesOrdered } from "../../../src/lib/forward-events/read-and-extract.mjs";
import { surfaceOf } from "../../../src/lib/surface-of.mjs";
import { queryHeldPools, heldPoolHash } from "../../../src/lib/sources/seek-more.mjs";
import { CLAIM_COLUMNS, EVENT_COLUMNS } from "../theme-briefs/data.mjs";

/** The most connected items one question reaches. Stated in the README and the export summary. */
export const MAX_CONNECTED = 8;
/** The recommended_actions action that records "the holdings cannot answer this" on a question flag. */
export const UNANSWERABLE_ACTION = "unanswerable_from_holdings";
export const OPEN_STATUSES = Object.freeze(["open", "in_review"]);
/** The created_by values of every question flag (one per product question). */
export const QUESTION_CREATED_BY = Object.freeze(PRODUCT_QUESTIONS.map((pq) => createdBy(QUESTION_NAMESPACE, pq)));

/** The recommended_actions action that records an answered question's close-out (the pool it was answered against). */
export const ANSWERED_ACTION = "answered_from_holdings";
/** The created_by values of every holdings-need target (one per product question). */
export const NEED_CREATED_BY = Object.freeze(PRODUCT_QUESTIONS.map((pq) => createdBy(HOLDINGS_NEED_NAMESPACE, pq)));
/** The created_by values of every term-need target (one per vocabulary term kind; lane G5-NEED). */
export const TERM_NEED_CREATED_BY = Object.freeze(TERM_KINDS.map((k) => createdBy(TERM_NEED_NAMESPACE, k)));

export const FLAG_COLUMNS = "id, subject_ref, created_by, description, recommended_actions, status, created_at";
export const ITEM_COLUMNS = "id, title, item_type, domain, jurisdiction_iso, summary, provenance_status, is_archived, origin_class, instrument_entity_id";
const EDGE_COLUMNS = "source_item_id, target_item_id, relationship, origin, basis, score";
const POOL_COLUMNS = "id, intelligence_item_id, result_content, result_url, result_index";
const INFERENCE_COLUMNS = "inference_id, trigger_question_ref, claim_text, supersedes, computed_at";

const REF_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):([a-z_]+):([a-z_]+)$/i;

/** Parse a question subject_ref (`<item id>:<surface>:<product question>`). Null when it is not one. */
export function parseQuestionRef(subjectRef) {
  const m = REF_RE.exec(String(subjectRef ?? ""));
  return m ? { itemId: m[1], surface: m[2], productQuestion: m[3] } : null;
}

/** The event type the generator recorded in the flag's own rationale, when it did (event context). */
export function eventContextOf(flag) {
  for (const a of Array.isArray(flag?.recommended_actions) ? flag.recommended_actions : []) {
    const m = /event_type=([A-Za-z_]+)/.exec(String(a?.rationale ?? ""));
    if (m) return { event_type: m[1] };
  }
  return null;
}

/** The unanswerable outcome recorded on a flag, or null. */
export function recordedOutcome(flag) {
  const acts = Array.isArray(flag?.recommended_actions) ? flag.recommended_actions : [];
  return acts.find((a) => a && a.action === UNANSWERABLE_ACTION && typeof a.pool_hash === "string") ?? null;
}

/**
 * Why an item may not be cited, or null when it may: archived, not verified, or sourced only from Community
 * (ADR-041, origin_class community or community-corroborated).
 */
export function itemUnusableReason(item) {
  if (!item) return "item not found";
  if (item.is_archived) return "archived";
  if (item.provenance_status !== "verified") return `not verified (provenance_status ${item.provenance_status ?? "null"})`;
  if (item.origin_class === "community" || item.origin_class === "community-corroborated") return "sourced only from Community (ADR-041)";
  return null;
}

/** The answered close-out recorded on a question flag, or null. */
export function recordedAnswer(flag) {
  const acts = Array.isArray(flag?.recommended_actions) ? flag.recommended_actions : [];
  return acts.find((a) => a && a.action === ANSWERED_ACTION && typeof a.pool_hash === "string") ?? null;
}

/**
 * The recommended_actions array after recording an answered close-out: an earlier answered or unanswerable
 * element is replaced, the generator's own element is kept. Pure.
 */
export function withAnsweredOutcome(actions, { inferenceId, poolHash, batch, nowIso }) {
  const kept = (Array.isArray(actions) ? actions : []).filter((a) => !(a && (a.action === ANSWERED_ACTION || a.action === UNANSWERABLE_ACTION)));
  return [...kept, { action: ANSWERED_ACTION, rationale: `answered by inference ${inferenceId}`, inference_id: inferenceId, pool_hash: poolHash, batch, recorded_at: nowIso }];
}

/**
 * The holdings-need target for an unanswerable question: ONE open row per question subject_ref, in the
 * holdings-need namespace, carrying the need in words and its structured context in the find-source action.
 * Pure. @param {{subject_ref:string, missing:string, pool_hash:string}} entry
 * @param {{itemId:string, surface:string, productQuestion:string}} parsed @param {string} batch @param {string} nowIso
 */
export function holdingsNeedRow(entry, parsed, batch, nowIso) {
  return {
    category: "coverage_gap",
    subject_type: "item",
    subject_ref: entry.subject_ref,
    status: "open",
    created_by: createdBy(HOLDINGS_NEED_NAMESPACE, parsed.productQuestion),
    description: `Holdings need: ${entry.missing}`.slice(0, 480),
    recommended_actions: [needAction(entry, parsed, batch, nowIso)],
  };
}

/** The find-source action element of a holdings-need target. Pure. */
export function needAction(entry, parsed, batch, nowIso) {
  return {
    action: HOLDINGS_NEED_ACTION,
    need: entry.missing,
    item_id: parsed.itemId,
    surface: parsed.surface,
    product_question: parsed.productQuestion,
    pool_hash: entry.pool_hash,
    batch,
    recorded_at: nowIso,
    rationale: `held source text cannot answer ${entry.subject_ref}; a source stating the need in words is wanted`,
  };
}

/**
 * The structured need of a holdings-need or term-need target flag, or null when it carries none. Pure. A
 * term-need target (flag namespace term-need:, lane G5-NEED) also carries `namespace` and the term `kind`; a
 * holdings need keeps the exact shape it always had.
 */
export function needOfFlag(flag) {
  const acts = Array.isArray(flag?.recommended_actions) ? flag.recommended_actions : [];
  const a = acts.find((x) => x && x.action === HOLDINGS_NEED_ACTION && typeof x.need === "string" && x.need.trim());
  if (!a) return null;
  const base = { subject_ref: flag.subject_ref, need: a.need, item_id: a.item_id ?? null, surface: a.surface ?? null, product_question: a.product_question ?? null };
  return typeof flag.created_by === "string" && flag.created_by.startsWith(TERM_NEED_NAMESPACE)
    ? { ...base, namespace: "term-need", kind: a.kind ?? flag.created_by.slice(TERM_NEED_NAMESPACE.length) }
    : base;
}

/**
 * Every open need target: the holdings-need targets (default, what the answer apply step closes) and, with
 * `includeTermNeeds`, the term-need targets too (what the research walker searches). ONE reader for both
 * namespaces; the answer apply step never sees a term need because it does not ask for it.
 */
export async function loadOpenNeedTargets({ readAll }, { includeTermNeeds = false } = {}) {
  const createdBys = includeTermNeeds ? [...NEED_CREATED_BY, ...TERM_NEED_CREATED_BY] : [...NEED_CREATED_BY];
  return readAll("integrity_flags", FLAG_COLUMNS, {
    orderBy: "id",
    match: (q) => q.in("created_by", createdBys).in("status", [...OPEN_STATUSES]),
  });
}

/** Resolved question flags that carry an answered close-out (candidates for a re-answer). */
export async function loadAnsweredQuestionFlags({ readAll }) {
  const rows = await readAll("integrity_flags", `${FLAG_COLUMNS}, resolution_note`, {
    orderBy: "id",
    match: (q) => q.in("created_by", [...QUESTION_CREATED_BY]).in("status", ["resolved"]),
  });
  return rows.filter((r) => recordedAnswer(r));
}

/** Every open question flag. */
export async function loadOpenQuestionFlags({ readAll }) {
  return readAll("integrity_flags", FLAG_COLUMNS, {
    orderBy: "id",
    match: (q) => q.in("created_by", [...QUESTION_CREATED_BY]).in("status", [...OPEN_STATUSES]),
  });
}

/** Inference rows already written for the given question refs, keyed by ref. */
export async function loadInferencesByRef({ readAllByIds }, refs) {
  const out = new Map();
  if (!refs.length) return out;
  const rows = await readAllByIds("inference_records", INFERENCE_COLUMNS, refs, {
    idColumn: "trigger_question_ref",
    orderBy: ["trigger_question_ref", "inference_id"],
  });
  for (const r of rows) (out.get(r.trigger_question_ref) ?? out.set(r.trigger_question_ref, []).get(r.trigger_question_ref)).push(r);
  return out;
}

/** The inference of a ref's chain that no other row supersedes, or null. */
export function currentInference(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const superseded = new Set(list.map((r) => r.supersedes).filter(Boolean));
  const heads = list.filter((r) => !superseded.has(r.inference_id));
  heads.sort((a, b) => String(b.computed_at).localeCompare(String(a.computed_at)));
  return heads[0] ?? null;
}

/** Edge order: typed relationship first, then higher score, then the other item's id. */
const cmpEdge = (a, b) => {
  if (a.typed !== b.typed) return a.typed ? -1 : 1;
  if ((b.score ?? 0) !== (a.score ?? 0)) return (b.score ?? 0) - (a.score ?? 0);
  return a.other < b.other ? -1 : a.other > b.other ? 1 : 0;
};

/**
 * The material the given question item ids are answered from: items, their connected items (ranked, capped,
 * split into citable and not), grounded FACT claims, forward events and held pools. Read once for the union.
 * @returns {Promise<{items:Map<string,object>, connected:Map<string,{connected:object[], unusable:Map<string,string>, candidates:number}>, claimsByItem:Map, eventsByItem:Map, poolsByItem:Map}>}
 */
export async function loadQuestionMaterial({ readAllByIds }, questionItemIds) {
  const ids = [...new Set(questionItemIds)].sort();
  const items = new Map();
  const connected = new Map();
  const claimsByItem = new Map();
  const eventsByItem = new Map();
  const poolsByItem = new Map();
  if (!ids.length) return { items, connected, claimsByItem, eventsByItem, poolsByItem };

  for (const it of await readAllByIds("intelligence_items", ITEM_COLUMNS, ids)) items.set(it.id, it);
  const out = await readAllByIds("item_cross_references", EDGE_COLUMNS, ids, { idColumn: "source_item_id", orderBy: ["source_item_id", "target_item_id"] });
  const inn = await readAllByIds("item_cross_references", EDGE_COLUMNS, ids, { idColumn: "target_item_id", orderBy: ["target_item_id", "source_item_id"] });

  // Best edge per (question item, other item): typed beats generic, then higher score.
  const candidates = new Map(ids.map((id) => [id, new Map()]));
  const consider = (own, other, e) => {
    if (own === other || !candidates.has(own)) return;
    const cand = { other, relationship: e.relationship ?? null, origin: e.origin ?? null, score: e.score ?? null, basis: Array.isArray(e.basis) ? e.basis : [], typed: !!e.relationship && e.relationship !== "related" };
    const prior = candidates.get(own).get(other);
    if (!prior || cmpEdge(cand, prior) < 0) candidates.get(own).set(other, cand);
  };
  for (const e of out) consider(e.source_item_id, e.target_item_id, e);
  for (const e of inn) consider(e.target_item_id, e.source_item_id, e);

  const otherIds = [...new Set([...candidates.values()].flatMap((m) => [...m.keys()]))].filter((id) => !items.has(id)).sort();
  if (otherIds.length) for (const it of await readAllByIds("intelligence_items", ITEM_COLUMNS, otherIds)) items.set(it.id, it);

  for (const id of ids) {
    const ranked = [...candidates.get(id).values()].sort(cmpEdge);
    const usable = [];
    const unusable = new Map();
    for (const c of ranked) {
      const why = itemUnusableReason(items.get(c.other));
      if (why) unusable.set(c.other, why);
      else if (usable.length < MAX_CONNECTED) usable.push(c);
    }
    connected.set(id, { connected: usable, unusable, candidates: ranked.length });
  }

  const involved = [...new Set([...ids, ...[...connected.values()].flatMap((c) => c.connected.map((e) => e.other))])].sort();
  const claims = await readAllByIds("section_claim_provenance", CLAIM_COLUMNS, involved, { idColumn: "intelligence_item_id", orderBy: ["intelligence_item_id", "id"] });
  for (const c of claims) if (c.claim_kind === "FACT") (claimsByItem.get(c.intelligence_item_id) ?? claimsByItem.set(c.intelligence_item_id, []).get(c.intelligence_item_id)).push(c);
  const events = await readAllByIds("item_forward_events", EVENT_COLUMNS, involved, { idColumn: "intelligence_item_id", orderBy: ["intelligence_item_id", "id"] });
  for (const e of events) (eventsByItem.get(e.intelligence_item_id) ?? eventsByItem.set(e.intelligence_item_id, []).get(e.intelligence_item_id)).push(e);
  const pool = await readAllByIds("agent_run_searches", POOL_COLUMNS, involved, { idColumn: "intelligence_item_id", orderBy: ["intelligence_item_id", "id"] });
  const byItem = new Map();
  for (const r of pool) (byItem.get(r.intelligence_item_id) ?? byItem.set(r.intelligence_item_id, []).get(r.intelligence_item_id)).push(r);
  for (const [id, rows] of byItem) {
    poolsByItem.set(id, usableCapturesOrdered(rows).filter((r) => typeof r.result_url === "string").map((r) => ({ url: r.result_url, text: r.result_content })));
  }
  return { items, connected, claimsByItem, eventsByItem, poolsByItem };
}

/**
 * One question's context over loaded material: its item, the connected set, the held pool (through the
 * shared queryHeldPools) and the live pool identity. `parsed` is parseQuestionRef's result.
 */
export async function buildQuestionContext(flag, parsed, material) {
  const item = material.items.get(parsed.itemId) ?? null;
  const conn = material.connected.get(parsed.itemId) ?? { connected: [], unusable: new Map(), candidates: 0 };
  const hits = await queryHeldPools(
    { itemId: parsed.itemId },
    {
      readConnectedItemIds: () => conn.connected.map((c) => c.other),
      readPools: (idList) => new Map(idList.map((id) => [id, material.poolsByItem.get(id) ?? []])),
    },
  );
  const memberIds = [parsed.itemId, ...conn.connected.map((c) => c.other)];
  const members = new Map();
  for (const id of memberIds) {
    const hit = hits.find((h) => h.item_id === id);
    members.set(id, {
      title: material.items.get(id)?.title ?? null,
      claim_ids: new Set((material.claimsByItem.get(id) ?? []).map((c) => c.id)),
      poolText: (hit?.pool ?? []).map((c) => c.text).join("\u0000"),
    });
  }
  return {
    flag, parsed, item, itemUnusable: itemUnusableReason(item), questionText: flag.description ?? "",
    connectedEdges: conn.connected, unusable: conn.unusable, connectedCandidates: conn.candidates,
    hits, pool_hash: heldPoolHash(hits), members, open: true,
  };
}

const size = (x) => JSON.stringify(x).length;
const STRUCTURE_SHARE = 0.4;

/**
 * One question's export bundle, within a character budget, with honest truncation reporting. Structure
 * (the item records, claims, forward events) takes up to 40 percent of the budget; the held pool text shares
 * the rest, half to the question's own item and half split across its connected items (all of it to the own
 * item when nothing is connected). Every cut is counted in `truncation`, nothing is dropped silently.
 */
export function buildQuestionBundle(ctx, material, { charBudget }) {
  const { flag, parsed } = ctx;
  const head = {
    subject_ref: flag.subject_ref,
    pool_hash: ctx.pool_hash,
    item_id: parsed.itemId,
    surface: parsed.surface,
    product_question: parsed.productQuestion,
    question: flag.description ?? "",
    event_context: eventContextOf(flag),
    needs: recordedAnswer(flag) ? "reanswer_after_new_holdings" : recordedOutcome(flag) ? "reasked_after_new_holdings" : "unanswered",
    prior_outcome: (() => { const o = recordedOutcome(flag); return o ? { outcome: UNANSWERABLE_ACTION, missing: o.rationale ?? null, batch: o.batch ?? null, recorded_at: o.recorded_at ?? null } : null; })(),
    prior_inference_id: recordedAnswer(flag)?.inference_id ?? null,
  };
  let used = size(head);
  const structureCap = Math.floor(charBudget * STRUCTURE_SHARE);

  const ordered = [{ id: parsed.itemId, relation: "self", edge: null }, ...ctx.connectedEdges.map((c) => ({ id: c.other, relation: "connected", edge: c }))];
  const records = [];
  const omittedItems = [];
  let claimsTotal = 0, claimsOmitted = 0, eventsTotal = 0, eventsOmitted = 0;
  for (const o of ordered) {
    const it = material.items.get(o.id);
    const claims = (material.claimsByItem.get(o.id) ?? []).map((c) => ({ claim_id: c.id, kind: c.claim_kind, claim_text: c.claim_text, source_id: c.source_id ?? null }));
    const events = (material.eventsByItem.get(o.id) ?? []).map((e) => ({
      event_id: e.id, event_date: e.event_date, date_precision: e.date_precision, event_kind: e.event_kind,
      obligation_text: e.obligation_text, source_span: e.source_span, confidence: e.confidence,
    }));
    claimsTotal += claims.length;
    eventsTotal += events.length;
    const hit = ctx.hits.find((h) => h.item_id === o.id);
    const rec = {
      item_id: o.id,
      relation: o.relation,
      title: it?.title ?? null,
      item_type: it?.item_type ?? null,
      surface: it ? surfaceOf(it.item_type, it.domain) : "uncategorized",
      jurisdictions: it?.jurisdiction_iso ? [].concat(it.jurisdiction_iso) : [],
      summary: it?.summary ?? null,
      edge: o.edge ? { relationship: o.edge.relationship, origin: o.edge.origin, score: o.edge.score, basis_signals: o.edge.basis.map((b) => ({ signal: b?.signal ?? null, detail: b?.detail ?? null })) } : null,
      claims: [],
      forward_events: [],
      item_pool_hash: hit?.item_pool_hash ?? null,
      pool: [],
    };
    const bare = size(rec);
    if (used + bare > structureCap && o.relation !== "self") {
      omittedItems.push({ item_id: o.id, title: it?.title ?? null });
      claimsOmitted += claims.length;
      eventsOmitted += events.length;
      continue;
    }
    used += bare;
    for (const ev of events) {
      const s = size(ev);
      if (used + s > structureCap) { eventsOmitted++; continue; }
      rec.forward_events.push(ev);
      used += s;
    }
    for (const c of claims) {
      const s = size(c);
      if (used + s > structureCap) { claimsOmitted++; continue; }
      rec.claims.push(c);
      used += s;
    }
    records.push(rec);
  }

  const remaining = Math.max(0, charBudget - used);
  const connectedCount = records.filter((r) => r.relation === "connected").length;
  const selfShare = connectedCount ? Math.floor(remaining / 2) : remaining;
  const connShare = connectedCount ? Math.floor((remaining - selfShare) / connectedCount) : 0;
  let poolTotal = 0, poolIncluded = 0;
  for (const rec of records) {
    let left = rec.relation === "self" ? selfShare : connShare;
    const hit = ctx.hits.find((h) => h.item_id === rec.item_id);
    for (const c of hit?.pool ?? []) {
      const take = Math.min(c.text.length, left);
      rec.pool.push({ url: c.url, text: c.text.slice(0, take), chars_total: c.text.length, chars_included: take });
      poolTotal += c.text.length;
      poolIncluded += take;
      left -= take;
      used += take;
    }
  }
  // Pool text of an item the structure budget omitted still counts toward the totals.
  for (const o of omittedItems) {
    const hit = ctx.hits.find((h) => h.item_id === o.item_id);
    for (const c of hit?.pool ?? []) poolTotal += c.text.length;
  }

  return {
    ...head,
    items: records,
    truncation: {
      char_budget: charBudget,
      chars_used: used,
      connected_cap: MAX_CONNECTED,
      connected_candidates: ctx.connectedCandidates,
      connected_not_citable: ctx.unusable.size,
      items_included: records.length,
      items_omitted: omittedItems.length,
      omitted_items: omittedItems,
      claims_total: claimsTotal,
      claims_omitted: claimsOmitted,
      forward_events_total: eventsTotal,
      forward_events_omitted: eventsOmitted,
      pool_chars_total: poolTotal,
      pool_chars_included: poolIncluded,
      pool_chars_omitted: poolTotal - poolIncluded,
    },
  };
}
