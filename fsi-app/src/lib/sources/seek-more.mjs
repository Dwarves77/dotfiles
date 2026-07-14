// @ts-check
// SEEK-MORE unit (paired with the RD-14 transport escalation ladder). When a declared primary is a genuine
// not-found after the ladder (step (e)), OR an item is enqueued for re-collection, seek-more GENERATES an
// ordered list of candidate URLs from the instrument's IDENTITY and hands the ARRAY to escalateFetch (the
// ladder's candidate seam). The ladder tries each candidate through the full per-failure-class ladder and
// returns the winner + the per-(candidate × transport) EXHAUSTION RECORD.
//
// THE DOCTRINE (remediation-discipline, Section 4 category 13 — transport failure is never terminal): a hold or
// delete is honest ONLY after PROVEN exhaustion. Candidate generation is DETERMINISTIC-IDENTIFIER-FIRST (no
// fetch): an instrument's own identity (CELEX/ELI, UK SI number, a Norwegian forskrift citation, a national
// gazette reference, a known API endpoint) resolves to the OFFICIAL canonical URL BY MACHINE — never hand-fed.
// Only when the identity yields nothing does the open-web search fallback run. Candidates are HYPOTHESES: a
// wrong one simply fails into the exhaustion record and the next candidate is tried (the moat qualifies only
// content that grounds), so the resolvers can be liberal without risk.
//
// PURE + DEP-INJECTED: generateCandidates takes an optional injected `webSearch`; runSeekMore takes the ladder
// transports + an optional exhaustion PERSISTER — so NO real fetch and NO db write happen here (scrape hold
// honored). GOVERNING: remediation-discipline (category 13, RD-14) + source-credibility-model (qualification).

import { escalateFetch, captureForStorage, apiEndpointFor } from "./transport-escalation.mjs";
import { discoverCandidateUrls } from "./identifier-variants.mjs";

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
  if (celex) out.push(`https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:${celex[1].toUpperCase()}`);
  // ELI already in a URL: /eli/{reg|dir|...}/{year}/{number}[/oj]
  const eliInUrl = hay.match(/\/eli\/((?:reg|dir|dec|regdel|regimpl|dirdel|dirimpl)\/\d{4}\/\d+(?:\/[a-z]+)?)/i);
  if (eliInUrl) out.push(`https://eur-lex.europa.eu/eli/${eliInUrl[1].toLowerCase()}`);
  else {
    // an ELI-style bare identifier: "eli/reg/2023/1115" or "reg/2023/1115"
    const m = String(identifier || "").match(/^(?:eli\/)?((?:reg|dir|dec|regdel|regimpl|dirdel|dirimpl)\/\d{4}\/\d+)$/i);
    if (m) out.push(`https://eur-lex.europa.eu/eli/${m[1].toLowerCase()}`);
  }
  return out;
}

/** UK: a statutory-instrument reference ("uksi/2023/123", "SI 2023/123", "2023 No. 123") → legislation.gov.uk.
 *  @param {{identifier?:string|null}} [a] @returns {string[]} */
export function ukCandidates({ identifier } = {}) {
  const id = String(identifier || "");
  const m = id.match(/uksi\/(\d{4})\/(\d+)/i) || id.match(/\bS\.?I\.?\s*(\d{4})\/(\d+)/i) || id.match(/^(\d{4})\s*No\.?\s*(\d+)$/i);
  return m ? [`https://www.legislation.gov.uk/uksi/${m[1]}/${m[2]}`] : [];
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
export const GAZETTE_RESOLVERS = [
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

// ── THE ORCHESTRATOR ────────────────────────────────────────────────────────────────────────────────────────

/**
 * Run seek-more for an item: generate candidates → hand the ARRAY to escalateFetch (the ladder seam) → on the
 * first content success apply the write-side gate (captureForStorage) → return { captured, exhaustionRecord }.
 * Every (candidate × transport) attempt is in the exhaustion record (escalateFetch's verdict.attempts shape).
 * PURE given its injected deps — no real fetch, no live db write.
 * @param {{id:string, title?:string|null, identifier?:string|null, jurisdiction?:(string[]|string|null), source_url?:string|null, sourceUrl?:string|null, canonical_instrument_key?:string|null, canonicalKey?:string|null, item_type?:string|null, itemType?:string|null, instrument_type?:string|null, instrumentType?:string|null}} item
 * @param {{
 *   webSearch?: (query:string)=>Promise<string[]>|string[],
 *   transports?: object,                                  // escalateFetch deps (cacheGet/apiFetch/directFetch/browserlessRender/seekMore)
 *   persistExhaustion?: (itemId:string, record:Array<object>, verdict:object)=>Promise<any>|any,
 * }} [deps]
 * @returns {Promise<{ captured: {url?:string,text:string}|null, exhaustionRecord: Array<object>, outcome:string, holdReason:string|null, candidates:string[] }>}
 */
export async function runSeekMore(item, deps = {}) {
  const { webSearch, transports = {}, persistExhaustion } = deps;
  const identity = {
    title: item.title, identifier: item.identifier, jurisdiction: item.jurisdiction,
    sourceUrl: item.source_url ?? item.sourceUrl,
    canonicalKey: item.canonical_instrument_key ?? item.canonicalKey,
    itemType: item.item_type ?? item.itemType, instrumentType: item.instrument_type ?? item.instrumentType,
  };
  const candidates = await generateCandidates(identity, { webSearch });
  const verdict = await escalateFetch(candidates, transports);
  const exhaustionRecord = Array.isArray(verdict.attempts) ? verdict.attempts : [];
  let captured = null;
  if (verdict.outcome === "content" && verdict.text) {
    const cap = captureForStorage([{ url: verdict.url, text: verdict.text }]);
    captured = cap.store[0] ?? null; // write-side gate: only real content is ever captured
  }
  if (persistExhaustion) await persistExhaustion(item.id, exhaustionRecord, verdict);
  return { captured, exhaustionRecord, outcome: verdict.outcome, holdReason: verdict.holdReason ?? null, candidates };
}
