// SHARED-WRITER: integrity_flags
// @ts-check
// SEEK-MORE candidate generation (paired with the RD-14 transport escalation ladder). When a declared primary
// is a genuine not-found, seek-more GENERATES an ordered list of candidate URLs from the instrument's IDENTITY;
// the LIVE consumer is fetchPrimaryWithFallback / fetchPrimaryDeep (canonical-pipeline), which hands the array
// to the escalation ladder and persists the per-(candidate × transport) EXHAUSTION RECORD (persistPrimaryExhaustion).
//
// THE DOCTRINE (remediation-discipline, Section 4 category 13 — transport failure is never terminal): a hold or
// delete is honest ONLY after PROVEN exhaustion. Candidate generation is DETERMINISTIC-IDENTIFIER-FIRST (no
// fetch): an instrument's own identity (CELEX/ELI, UK SI number, a Norwegian forskrift citation, a national
// gazette reference, a known API endpoint) resolves to the OFFICIAL canonical URL BY MACHINE — never hand-fed.
// Only when the identity yields nothing does the open-web search fallback run. Candidates are HYPOTHESES: a
// wrong one simply fails into the exhaustion record and the next candidate is tried (the moat qualifies only
// content that grounds), so the resolvers can be liberal without risk.
//
// PURE + DEP-INJECTED: generateCandidates takes an optional injected `webSearch`; exhaustionFlagRow /
// persistExhaustionRecord build + write the interim exhaustion record — NO real fetch and NO db write happen
// here except through the injected writer (scrape hold honored). NO-SHADOW (2026-07-14): the runSeekMore
// orchestrator was RETIRED — the live one home is fetchPrimaryWithFallback (proven by reground-ladder.golden),
// which consumes generateCandidates directly; a second orchestrator here was a dormant duplicate. GOVERNING:
// remediation-discipline (category 13, RD-14; no-shadow) + source-credibility-model (qualification).

import { apiEndpointFor } from "./transport-escalation.mjs";
import { discoverCandidateUrls, celexTxtHtmlUrl, eliPathUrl, legislationUkUrl } from "./identifier-variants.mjs"; // F46: eur-lex.europa.eu + www.legislation.gov.uk's one home (lane L35)
import { hashSourcePool } from "../agent/source-pool-hash.mjs"; // the ONE pool-identity hash (record-briefs / brief-export share it)

/** @param {unknown} u */
const httpsOnly = (u) => typeof u === "string" && /^https:\/\//i.test(u);

// ── DETERMINISTIC IDENTIFIER RESOLVERS (no fetch) ───────────────────────────────────────────────────────────

/** EU: a CELEX (3{year}{R|L}{number}) or ELI citation → the eur-lex canonical enacted-text URL(s). The CELEX
 *  form is the /TXT/HTML/ rendering (the bare /TXT soft-404s for many ids — see primary-fallback).
 *  @param {{identifier?:string|null, sourceUrl?:string|null}} [a] @returns {string[]} */
export function eurlexCandidates({ identifier, sourceUrl } = {}) {
  const out = [];
  const hay = `${identifier || ""} ${sourceUrl || ""}`;
  const celex = hay.match(/CELEX[:\s]*(3\d{4}[A-Z]\d+)/i) || String(identifier || "").match(/^(3\d{4}[A-Z]\d+)$/i);
  if (celex) out.push(celexTxtHtmlUrl(celex[1].toUpperCase()));
  // ELI already in a URL: /eli/{reg|dir|...}/{year}/{number}[/oj]
  const eliInUrl = hay.match(/\/eli\/((?:reg|dir|dec|regdel|regimpl|dirdel|dirimpl)\/\d{4}\/\d+(?:\/[a-z]+)?)/i);
  if (eliInUrl) out.push(eliPathUrl(eliInUrl[1].toLowerCase()));
  else {
    // an ELI-style bare identifier: "eli/reg/2023/1115" or "reg/2023/1115"
    const m = String(identifier || "").match(/^(?:eli\/)?((?:reg|dir|dec|regdel|regimpl|dirdel|dirimpl)\/\d{4}\/\d+)$/i);
    if (m) out.push(eliPathUrl(m[1].toLowerCase()));
  }
  return out;
}

/** UK: a statutory-instrument reference ("uksi/2023/123", "SI 2023/123", "2023 No. 123") → legislation.gov.uk.
 *  @param {{identifier?:string|null}} [a] @returns {string[]} */
export function ukCandidates({ identifier } = {}) {
  const id = String(identifier || "");
  const m = id.match(/uksi\/(\d{4})\/(\d+)/i) || id.match(/\bS\.?I\.?\s*(\d{4})\/(\d+)/i) || id.match(/^(\d{4})\s*No\.?\s*(\d+)$/i);
  return m ? [legislationUkUrl(`uksi/${m[1]}/${m[2]}`)] : [];
}

/** Norway (THE DESIGN FIXTURE): a forskrift citation "FOR-YYYY-MM-DD-N" — or the bare "YYYY-MM-DD-N" when the
 *  jurisdiction is Norway — → the lovdata.no canonical forskrift URL. The machine DERIVES it from the instrument
 *  identity (its legal citation), the same way a CELEX resolves to eur-lex — never hand-fed a URL. This is how
 *  lovdata.no would have been found mechanically.
 *  @param {{identifier?:string|null, jurisdiction?:(string[]|string|null)}} [a] @returns {string[]} */
export function lovdataCandidates({ identifier, jurisdiction } = {}) {
  const id = String(identifier || "");
  const isNorway = /\bnorway\b|\bnorwegian\b|^no$/i.test(String(jurisdiction || ""));
  let m = id.match(/^FOR[-\s.](\d{4})[-.](\d{2})[-.](\d{2})[-.](\d+)$/i);
  if (!m && isNorway) m = id.match(/^(\d{4})[-.](\d{2})[-.](\d{2})[-.](\d+)$/);
  return m ? [`https://lovdata.no/dokument/SF/forskrift/${m[1]}-${m[2]}-${m[3]}-${m[4]}`] : [];
}

// National-gazette resolvers, keyed by a jurisdiction test → identifier→URL fn. EXTENSIBLE: seeded conservatively
// (Ireland's ELI-based Statute Book); grows per-jurisdiction as instruments land. A wrong pattern fails safely
// into the exhaustion record (candidates are hypotheses), so this layer can be liberal.
const GAZETTE_RESOLVERS = [
  {
    // Ireland: Statutory Instrument "S.I. No. 123 of 2023" → irishstatutebook.ie ELI print form.
    test: (/** @type {unknown} */ j) => /\bireland\b|\birish\b|^ie$/i.test(String(j || "")),
    resolve: (/** @type {unknown} */ id) => {
      const m = String(id || "").match(/(?:S\.?I\.?\s*(?:No\.?)?\s*)?(\d+)\s*of\s*(\d{4})/i) || String(id || "").match(/^(\d+)\/(\d{4})$/);
      return m ? [`https://www.irishstatutebook.ie/eli/${m[2]}/si/${m[1]}/made/en/print`] : [];
    },
  },
];

/** Gazette candidates for a jurisdiction + identifier (extensible registry).
 *  @param {{identifier?:string|null, jurisdiction?:(string[]|string|null)}} [a] @returns {string[]} */
export function gazetteCandidates({ identifier, jurisdiction } = {}) {
  /** @type {string[]} */ const out = [];
  for (const g of GAZETTE_RESOLVERS) if (g.test(jurisdiction)) out.push(...g.resolve(identifier));
  return out;
}

/** Known API-endpoint hosts (federalregister.gov + eCFR): if the declared source is already an API-routable
 *  host, re-offer it as a candidate — the ladder's apiFetchForHost routes it to the official JSON/XML API where
 *  the HTML returned "Request Access". @param {{sourceUrl?:string|null}} [a] @returns {string[]} */
export function apiCandidates({ sourceUrl } = {}) {
  return sourceUrl && apiEndpointFor(sourceUrl) ? [sourceUrl] : [];
}

/**
 * Generate an ORDERED, de-duplicated candidate-URL list for an instrument identity. Deterministic identifier
 * resolvers FIRST (official/identifier-resolved → API → gazette), then the open-web `webSearch` fallback LAST.
 * NO fetch happens for the deterministic layers; `webSearch` is dep-injected (returns string[]).
 * @param {{title?:string|null, identifier?:string|null, jurisdiction?:(string[]|string|null), sourceUrl?:string|null, canonicalKey?:string|null, itemType?:string|null, instrumentType?:string|null}} identity
 * @param {{ webSearch?: (query:string)=>Promise<string[]>|string[] }} [deps]
 * @returns {Promise<string[]>}
 */
export async function generateCandidates(identity = {}, deps = {}) {
  const { title, jurisdiction } = identity;
  const { webSearch } = deps;
  // SMART-SEARCH DELTA (operator amendment, 2026-07-14): the richer variant derivation adds what the legacy
  // resolvers miss — bare-number→CELEX with type fan-out (2024_1610 → 32024R1610), separator mutations, US
  // Federal-Register-by-doc-number, and the ENDPOINT-first search-URL ladder (the source's OWN search surface
  // before open web). ENDPOINT-FIRST ORDERING: identifier-resolved canonical URLs → source-own search surface
  // → open web LAST. The legacy resolvers (lovdata/gazette) still run — this MERGES, never replaces (RD-8).
  const dc = discoverCandidateUrls({
    identifier: identity.identifier, canonicalKey: identity.canonicalKey,
    itemType: identity.itemType, instrumentType: identity.instrumentType,
    title, jurisdiction, sourceUrl: identity.sourceUrl,
  });
  const canonical = dc.candidates.filter((c) => c.kind === "canonical").map((c) => c.url);
  const searchEndpoints = dc.candidates.filter((c) => c.kind === "search").map((c) => c.url);
  const ordered = [
    ...eurlexCandidates(identity),   // official / identifier-resolved (EU)
    ...ukCandidates(identity),       // official / identifier-resolved (UK)
    ...lovdataCandidates(identity),  // official / identifier-resolved (Norway — the fixture)
    ...apiCandidates(identity),      // known API endpoints (federalregister / eCFR)
    ...gazetteCandidates(identity),  // national-gazette patterns
    ...canonical,                    // smart-search delta: identifier variant mutations → canonical URLs
    ...searchEndpoints,              // endpoint-first: the source's OWN search surface (before open web)
  ];
  // open-web fallback LAST (aims at the official issuer page; the floor still qualifies whatever it returns).
  if (webSearch) {
    const q = [title, jurisdiction, "official legislation text"].filter(Boolean).join(" ").trim();
    try { const hits = (await webSearch(q)) || []; for (const u of hits) ordered.push(u); } catch { /* search failed — deterministic candidates stand */ }
  }
  // de-dupe (stable order), https only.
  return [...new Set(ordered.filter(httpsOnly))];
}

// ── EXHAUSTION-RECORD PERSISTENCE (interim, pre-DDL) ─────────────────────────────────────────────────────────
// INTERIM STORE (Jason's explicit question — where per-attempt records live until migration 147 lands): the
// FLAG PATTERN. The per-(candidate × transport) exhaustion record persists as an `integrity_flags` row
// (created_by='exhaustion_record', category='source_issue', subject_ref=itemId, the attempts array in the
// recommended_actions jsonb). SUPERSEDED by migration 147's dedicated exhaustion column/table — at which point
// this writer moves to that column and the flag pattern is retired. Built as a PURE row-builder + a dep-injected
// writer + fixture test ONLY; NEVER written live here (scrape hold).

/** PURE builder for the interim exhaustion-record integrity_flags row. @param {string} itemId
 *  @param {Array<object>} exhaustionRecord @param {{outcome?:string,holdReason?:string|null}} [verdict] */
export function exhaustionFlagRow(itemId, exhaustionRecord, verdict = {}) {
  const record = Array.isArray(exhaustionRecord) ? exhaustionRecord : [];
  return {
    category: "source_issue",
    subject_type: "item",
    subject_ref: itemId,
    status: "open",
    created_by: "exhaustion_record",
    description: `Transport exhaustion record: ${record.length} (candidate × transport) attempt(s); outcome ${verdict.outcome ?? "unknown"}${verdict.holdReason ? ` (${verdict.holdReason})` : ""}. Interim FLAG-PATTERN store, superseded by migration 147.`.slice(0, 480),
    recommended_actions: record.map((/** @type {any} */ a) => ({
      url: a.url, transport: a.transport, verdict: a.verdict,
      bytes: typeof a.bytes === "number" ? a.bytes : null,
      reason: a.reason ?? null, status: a.status ?? null,
    })),
  };
}

/** Dep-injected writer: persist the exhaustion record via the interim flag pattern. `sb` is the Supabase client
 *  (injected; a fake in tests — NEVER a live write during build).
 *  @param {any} sb @param {string} itemId @param {Array<object>} exhaustionRecord
 *  @param {{outcome?:string,holdReason?:string|null}} [verdict] @returns {Promise<object>} the row written. */
export async function persistExhaustionRecord(sb, itemId, exhaustionRecord, verdict = {}) {
  const row = exhaustionFlagRow(itemId, exhaustionRecord, verdict);
  await sb.from("integrity_flags").insert(row);
  return row;
}

// ── S2: answer-seeking for a trigger_question (learning-loop-design-2026-09-25.md section 6, ADR-036 ─────────
// decision 1). GENERALISES this file's own deterministic-identifier-first / spend-gated-fallback shape
// (above) beyond a source-URL miss: the input is now a `trigger_question` row (S1, src/lib/learning/
// trigger-questions.mjs), and the residual, when retrieval against held pools finds nothing, produces a
// PRICED ACQUISITION REQUEST RECORD ONLY, never a fetch, unless the caller already holds an operator-priced
// SpendTicket (RD-31: operator-priced line, no machine-proposed cost; RD-32: no fetch without a cited
// inventory-miss). spend-client.ts is UNCHANGED and NOT imported here, this module only inspects the SHAPE
// of a ticket the caller already obtained through that chokepoint (`pricedLine: {operatorCostUsd,
// inventoryMiss}`, the exact fields spend-client.ts's `guardPricedLine` reads), it never authorizes spend
// itself. Retrieval-first (RD-8) by construction: `queryHeldPools` runs BEFORE any residual/acquisition
// logic is even considered.

/** PURE builder for the priced-acquisition REQUEST record a residual produces, never a fetch, never an
 *  auto-price. Mirrors exhaustionFlagRow's shape (an integrity_flags-compatible row) so this rides the
 *  SAME operator-inbox pattern as the rest of this file, not a new review surface.
 *  @param {{itemId:string, surface:string, productQuestion:string, questionText:string, subjectRef:string}} triggerQuestion
 *  @param {{inventoryMiss?:string|null}} [ctx]
 *  @returns {object} */
export function acquisitionRequestRecord(triggerQuestion, { inventoryMiss = null } = {}) {
  return {
    category: "coverage_gap",
    subject_type: "item",
    subject_ref: triggerQuestion.subjectRef,
    status: "open",
    created_by: "seek-more:acquisition-request",
    description:
      `Priced acquisition REQUEST for "${triggerQuestion.questionText}" (surface=${triggerQuestion.surface}, ` +
      `product_question=${triggerQuestion.productQuestion}) - held pools carried no answer; this REQUESTS an ` +
      "operator-priced line, it does not fetch anything (ADR-036 decision 1, QUESTION_ACQUISITION=operator-priced-only).".slice(0, 480),
    recommended_actions: [
      {
        action: "operator-price-this-request",
        rationale: inventoryMiss
          ? `named inventory-miss: ${inventoryMiss}`
          : "no held-pool hit for this question; an operator-priced line (RD-31) plus a cited inventory-miss (RD-32) is required before any fetch.",
      },
    ],
  };
}

// ── HELD-POOL RETRIEVAL: the real implementation of seekAnswerForQuestion's step 1 (lane L4-B, ADR-044) ─────
// seekAnswerForQuestion's `deps.queryHeldPools` was an injected dependency with no implementation anywhere in
// the repo. This is that implementation, written as a PURE function over injected reads so the question
// export (scripts/turns/export-questions-for-answers.mjs, through scripts/turns/question-answers/data.mjs)
// and the apply validator read the SAME held text the SAME way. A "held pool" is the item's usable
// agent_run_searches captures (the rows `usableCapturesOrdered` keeps, ADR-016: stored whole, never capped);
// the question's reach is the item itself plus the items connected to it by an edge (the caller owns which
// edges and how many, `readConnectedItemIds`). Free: no model call, no search, no network.

/** Pool identity of a set of held-pool hits: the shared sha256 recipe over every capture of every hit, each
 *  url prefixed with its item id so the same capture held by two items stays two rows. Order-independent
 *  (hashSourcePool sorts). Pure. @param {Array<{item_id:string, pool:Array<{url:string,text:string}>}>} hits
 *  @returns {string} */
export function heldPoolHash(hits) {
  const rows = [];
  for (const h of Array.isArray(hits) ? hits : []) {
    for (const c of Array.isArray(h?.pool) ? h.pool : []) rows.push({ url: `${h.item_id}#${c.url}`, text: c.text });
  }
  return hashSourcePool(rows);
}

/**
 * Retrieve the held pool text a question can be answered from: the question's own item first, then its
 * connected items in the order the caller supplies. Only an item with at least one usable capture is a hit.
 * seekAnswerForQuestion calls this with one argument through a closure over the deps below; the question
 * export calls it with the same deps over its preloaded material.
 * @param {{itemId:string}} triggerQuestion
 * @param {{
 *   readConnectedItemIds?: (itemId:string) => Promise<string[]>|string[],
 *   readPools: (itemIds:string[]) => Promise<Map<string,Array<{url:string,text:string}>>|Record<string,Array<{url:string,text:string}>>>|Map<string,Array<{url:string,text:string}>>|Record<string,Array<{url:string,text:string}>>,
 * }} deps
 * @returns {Promise<Array<{item_id:string, relation:"self"|"connected", pool:Array<{url:string,text:string}>, item_pool_hash:string}>>}
 */
export async function queryHeldPools(triggerQuestion, deps) {
  const itemId = triggerQuestion && triggerQuestion.itemId;
  if (!itemId || !deps || typeof deps.readPools !== "function") return [];
  /** @type {string[]} */
  const connected = typeof deps.readConnectedItemIds === "function" ? (await deps.readConnectedItemIds(itemId)) || [] : [];
  const ids = [...new Set([itemId, ...connected.filter((id) => typeof id === "string" && id)])];
  const got = (await deps.readPools(ids)) || new Map();
  const poolOf = (/** @type {string} */ id) => (got instanceof Map ? got.get(id) : got[id]) || [];
  /** @type {Array<{item_id:string, relation:"self"|"connected", pool:Array<{url:string,text:string}>, item_pool_hash:string}>} */
  const hits = [];
  for (const id of ids) {
    const pool = poolOf(id).filter((c) => c && typeof c.url === "string" && typeof c.text === "string" && c.text.trim() !== "");
    if (pool.length) hits.push({ item_id: id, relation: id === itemId ? "self" : "connected", pool, item_pool_hash: hashSourcePool(pool) });
  }
  return hits;
}

/**
 * Answer-seeking for one trigger_question: retrieval-first against held pools (RD-8); a residual with
 * no operator-priced ticket returns a REQUEST record only (never fetches); a residual WITH a
 * caller-supplied, well-formed priced ticket escalates to this file's own deterministic-identifier
 * candidate generation (generateCandidates, still no fetch unless the caller ALSO injects
 * `deps.webSearch`, the same gate generateCandidates already applies to a source-URL miss).
 * @param {{itemId:string, surface:string, productQuestion:string, questionText:string, subjectRef:string}} triggerQuestion
 * @param {{
 *   queryHeldPools?: (q:object) => Promise<Array<object>>|Array<object>,
 *   spendTicket?: { pricedLine?: { operatorCostUsd:number, inventoryMiss:string, toleranceUsd?:number } } | null,
 *   identity?: { title?:string|null, identifier?:string|null, jurisdiction?:(string[]|string|null), sourceUrl?:string|null },
 *   webSearch?: (query:string)=>Promise<string[]>|string[],
 * }} [deps]
 * @returns {Promise<{resolved:boolean, source:"held-pool"|"none"|"priced-candidates", candidates:Array<object>|string[], requestRecord:object|null}>}
 */
export async function seekAnswerForQuestion(triggerQuestion, deps = {}) {
  const { queryHeldPools: queryPools, spendTicket, identity } = deps; // aliased: the module's own queryHeldPools is the implementation callers inject

  // RD-8: retrieval against held pools FIRST, before any residual/acquisition logic runs at all.
  const hits = queryPools ? (await queryPools(triggerQuestion)) || [] : [];
  if (hits.length > 0) {
    return { resolved: true, source: "held-pool", candidates: hits, requestRecord: null };
  }

  const line = spendTicket && spendTicket.pricedLine;
  const hasPricedLine = !!(line && typeof line.operatorCostUsd === "number" && line.operatorCostUsd >= 0 && line.inventoryMiss);
  const requestRecord = acquisitionRequestRecord(triggerQuestion, { inventoryMiss: line?.inventoryMiss ?? null });

  if (!hasPricedLine) {
    // ADR-036 decision 1: QUESTION_ACQUISITION="operator-priced-only" - a residual with no operator-
    // priced ticket NEVER fetches. The REQUEST record is the whole outcome.
    return { resolved: false, source: "none", candidates: [], requestRecord };
  }

  // A priced ticket already exists (obtained by the caller through the real spend chokepoint, not this
  // module): escalate to deterministic-identifier candidate generation. Still no fetch unless the
  // caller separately injects `deps.webSearch`, identical gate to a source-URL miss above.
  const candidates = identity ? await generateCandidates(identity, deps) : [];
  return { resolved: false, source: "priced-candidates", candidates, requestRecord };
}

// ── ORCHESTRATOR RETIRED (no-shadow, 2026-07-14) ──────────────────────────────────────────────────────────────
// The former runSeekMore orchestrator (generateCandidates → escalateFetch → captureForStorage → persistExhaustion
// in one call) had ZERO live callers: the live one home is fetchPrimaryWithFallback / fetchPrimaryDeep, which
// consumes generateCandidates directly, routes candidates through the escalation ladder (transport-runtime →
// escalateFetch), and persists the record via persistPrimaryExhaustion. Keeping a second orchestrator here was a
// dormant duplicate (the exact shadow the census flagged), so it was retired; its behavior is proven end-to-end
// on the WIRED path by reground-ladder.golden.test.mjs (win + total-exhaustion). generateCandidates + the
// resolvers + exhaustionFlagRow/persistExhaustionRecord remain the live exports this file owns.
