// inference-view.mjs: the pure view model for the customer "Inferences" section on the four detail pages
// (lane P2, 2026-10-05; ADR-044 decision 3: an inference "is shown to customers labelled as an inference";
// ADR-039 section (a): the pool-position inference stays internal). PURE: no I/O, no clock, dependency-free
// beyond the learning-loop constants, so a plain `node --test` process runs its test.
//
// WHAT THE READ KEEPS (stated once, here; supabase-server.ts fetchInferencesForItem applies it):
//   1. cites this item          cited_item_ids contains the item (the database does that filter);
//   2. current, never stale     admissibility = 'current' (a stale row is waiting on the governed drain);
//   3. not superseded           no other row names it in `supersedes` (migration 338: a recompute inserts a
//                               NEW row that points at the prior one, so "current" is the row nothing points
//                               at, NOT the row whose own supersedes is null);
//   4. a customer-visible method  method_id is in CUSTOMER_INFERENCE_METHOD_IDS below. This is the ADR-039(a)
//                               filter: an ALLOWLIST, so a method added later (the modelled pool-position
//                               inference, any future internal one) is hidden until someone adds it here on
//                               purpose, instead of leaking until someone remembers to block it.
// What a customer then SEES is decided by `admissibleForInference` (components/shared/InferenceClaim.tsx,
// use "display"): a REFUTED row and an uncited row never show. This module does not re-implement that gate;
// pickVisibleInferences takes it as a function so the one gate stays the one gate.
//
// THE QUESTION IN WORDS. inference_records.trigger_question_ref is the question's subject_ref, built as
// buildSubjectRef(itemId, surface, productQuestion) (connections/flag-namespaces.mjs, written by
// learning/trigger-questions.mjs). The product-question token is the last segment. It is shown as the plain
// question below, never as the raw reference. A reference that does not end in one of the four known tokens
// shows no question line (nothing is guessed).

import { PRODUCT_QUESTIONS } from "../learning/constants.mjs";

/** Methods whose inferences customers may see. ADR-039(a): an allowlist, the pool-position inference is not on it. */
export const CUSTOMER_INFERENCE_METHOD_IDS = Object.freeze(["infer-from-question"]);

/** Most inference rows the loader reads for one item (before the admissibility gate). */
export const INFERENCE_READ_CAP = 20;

/** Most inferences one detail page shows (after the gate, newest first). */
export const MAX_VISIBLE_INFERENCES = 5;

/** The four product questions in the words a reader would ask them (learning/constants.mjs PRODUCT_QUESTIONS). */
export const PRODUCT_QUESTION_WORDS = Object.freeze({
  what: "What changed?",
  affects_me: "Does this apply to me?",
  comply: "What must be done in response, and by when?",
  invest_wait_avoid: "Act now, wait, or take no action?",
});

/**
 * The question that raised an inference, in words, or null when the reference is absent or unrecognised.
 * @param {string|null|undefined} ref trigger_question_ref
 * @returns {string|null}
 */
export function questionInWords(ref) {
  if (typeof ref !== "string" || !ref.trim()) return null;
  const token = ref.trim().split(":").pop();
  return PRODUCT_QUESTIONS.includes(token) ? PRODUCT_QUESTION_WORDS[token] : null;
}

/**
 * THE ONE "current row" rule, shared by the customer read and the admin review page: a row is current when no
 * other row names it in `supersedes` (migration 338: a recompute inserts a NEW row that points at the prior one,
 * so the head of a chain is the row nothing points at, never the row whose own `supersedes` is null).
 * `supersededIds` is the set of ids some row names. Pure.
 * @param {{inference_id: string}} row
 * @param {Set<string>} supersededIds
 */
export function isCurrentInferenceRow(row, supersededIds) {
  return !!row && typeof row.inference_id === "string" && !supersededIds.has(row.inference_id);
}

/**
 * The current rows of a set that holds whole chains (the admin page reads every row): the originals that nobody
 * superseded and the recomputed heads, never the replaced originals. Status and method are NOT filtered here (the
 * admin sees refuted and every method); the customer read adds those rules on top.
 * @template {{inference_id: string, supersedes?: string|null}} T
 * @param {T[]} rows
 * @returns {T[]}
 */
export function currentInferenceRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const superseded = new Set(list.map((r) => r && r.supersedes).filter((x) => typeof x === "string"));
  return list.filter((r) => isCurrentInferenceRow(r, superseded));
}

/** True for a method the customer may see (ADR-039(a) allowlist). @param {string|null|undefined} methodId */
export function isCustomerInferenceMethod(methodId) {
  return typeof methodId === "string" && CUSTOMER_INFERENCE_METHOD_IDS.includes(methodId);
}

/**
 * Rows the customer read keeps, as view objects, newest first, at most INFERENCE_READ_CAP. Applies rules 2 to 4
 * above (rule 1 is the query's own filter). `supersededIds` is the set of inference ids some other row names
 * in `supersedes`. A row with a malformed shape is skipped, never thrown on.
 * @param {Array<object>} rows inference_records rows (inference_id, claim_text, status_token, confidence,
 *   cited_item_ids, origin_class, trigger_question_ref, method_id, admissibility, computed_at)
 * @param {Set<string>|string[]} [supersededIds]
 * @returns {Array<{id:string, claimText:string, statusToken:string, confidence:number, citedItemIds:string[],
 *   originClass:string, questionText:string|null, computedAt:string|null}>}
 */
export function selectCurrentInferences(rows, supersededIds = new Set()) {
  const superseded = supersededIds instanceof Set ? supersededIds : new Set(supersededIds ?? []);
  const out = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || typeof r.inference_id !== "string" || typeof r.claim_text !== "string" || !r.claim_text.trim()) continue;
    if (r.admissibility !== "current") continue;
    if (!isCurrentInferenceRow(r, superseded)) continue;
    if (!isCustomerInferenceMethod(r.method_id)) continue;
    if (!Array.isArray(r.cited_item_ids)) continue;
    out.push({
      id: r.inference_id,
      claimText: r.claim_text.trim(),
      statusToken: r.status_token,
      confidence: Number(r.confidence),
      citedItemIds: r.cited_item_ids.filter((x) => typeof x === "string"),
      originClass: r.origin_class,
      questionText: questionInWords(r.trigger_question_ref),
      computedAt: typeof r.computed_at === "string" ? r.computed_at : null,
    });
  }
  out.sort((a, b) => (b.computedAt ?? "").localeCompare(a.computedAt ?? "") || (a.id < b.id ? -1 : 1));
  return out.slice(0, INFERENCE_READ_CAP);
}

/**
 * Keep only the citations a customer may be shown (items that passed the customer read gate, `titles` holds
 * exactly those) and drop an inference left with none: an inference whose evidence the customer cannot see is
 * not shown, it is never presented without its citations.
 * @param {ReturnType<typeof selectCurrentInferences>} views
 * @param {Record<string,string>} titles id to title of the verified, non-archived cited items
 */
export function restrictToVisibleCitations(views, titles) {
  const known = titles && typeof titles === "object" ? titles : {};
  return views
    .map((v) => ({ ...v, citedItemIds: v.citedItemIds.filter((id) => typeof known[id] === "string" && known[id].trim()) }))
    .filter((v) => v.citedItemIds.length > 0);
}

/**
 * What the section draws: the inferences the gate admits, newest first, at most MAX_VISIBLE_INFERENCES.
 * `isAdmissible` is `(view) => boolean`; the section passes InferenceClaim's own `admissibleForInference`
 * (use "display") so there is one gate. An empty result means the section renders nothing.
 * @template T
 * @param {T[]} views
 * @param {(view: T) => boolean} isAdmissible
 * @returns {T[]}
 */
export function pickVisibleInferences(views, isAdmissible) {
  return (Array.isArray(views) ? views : []).filter((v) => isAdmissible(v)).slice(0, MAX_VISIBLE_INFERENCES);
}

/**
 * The customer read of `inference_records` for one item, given its resolved uuid (the caller has already
 * applied the customer read gate to the item). Three bounded reads, then the pure rules above: the current rows
 * of a customer-visible method that cite the item (cap INFERENCE_READ_CAP), the rows that supersede them, and
 * the cited items' titles through `readCitedTitles` (the customer read gate: verified, non-archived items only).
 * `supabase` must be the service-role client (the table has RLS and no customer policy, migration 338).
 * Returns null when there is nothing to show, and on any read error (the section renders nothing).
 * @param {{from: Function}} supabase
 * @param {string} itemId intelligence_items.id
 * @param {(ids: string[]) => Promise<Array<{id:string, title:string}>>} readCitedTitles
 * @returns {Promise<{claims: ReturnType<typeof selectCurrentInferences>, titles: Record<string,string>} | null>}
 */
export async function readCustomerInferences(supabase, itemId, readCitedTitles) {
  const { data: rows, error } = await supabase
    .from("inference_records")
    .select("inference_id, claim_text, status_token, confidence, cited_item_ids, origin_class, trigger_question_ref, method_id, admissibility, computed_at")
    .contains("cited_item_ids", [itemId])
    .eq("admissibility", "current")
    .in("method_id", [...CUSTOMER_INFERENCE_METHOD_IDS])
    .order("computed_at", { ascending: false })
    .limit(INFERENCE_READ_CAP);
  if (error || !Array.isArray(rows) || rows.length === 0) return null;
  const { data: successors } = await supabase
    .from("inference_records")
    .select("supersedes")
    // fitness-allow: F39 (ids.length <= INFERENCE_READ_CAP, bounded by the .limit() above)
    .in("supersedes", rows.map((r) => r.inference_id));
  const superseded = new Set((successors ?? []).map((r) => r.supersedes));
  const claims = selectCurrentInferences(rows, superseded);
  if (claims.length === 0) return null;
  const cited = await readCitedTitles(claims.flatMap((c) => c.citedItemIds));
  const titles = Object.fromEntries((cited ?? []).map((c) => [c.id, c.title]));
  const visible = restrictToVisibleCitations(claims, titles);
  return visible.length ? { claims: visible, titles } : null;
}
