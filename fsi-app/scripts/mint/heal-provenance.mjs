// heal-provenance.mjs — the healing runtime for HEAL (2026-09-03).
//
// OPERATOR RULING THIS BUILDS (verbatim, 2026-09-03): "if items are being flagged as not credible for
// the site because of not having sources that is an issue with finding the source not that item. you
// need to attach a source. the item isn't [bad] because you didn't do that." A quarantined/gap-carrying
// item is NOT evidence the item is wrong — it is evidence this repo has not yet gone and found/attached
// its grounding. This module goes and does that: fetch the missing capture, locate a claim's span in
// what was captured (under honest normalization, never invented), fill a missing required slot with a
// FACT when the source states it or an HONEST GAP when it does not, refresh Gate A, then re-derive
// provenance_status through the real trigger and read the row back. An item that still fails after all
// five steps is reported with EXACTLY which criterion remains and why — never silently left unexplained,
// never forced.
//
// FIVE STEPS, EACH READING WHAT THE PREVIOUS WROTE (docs/dispatches HEAL brief):
//   1. CAPTURE — no fetch invented here: Cellar-first for CELEX (EUR-Lex), the Federal Register API for
//      federalregister.gov, a plain polite GET otherwise — importing scripts/mint/export-census-rows.mjs's
//      own resolveRowCapture/captureDocument/makePoliteFetch UNMODIFIED (this file never re-derives that
//      per-family resolution). $0, 1 req/s. A refused fetch is held with evidence, never retried blind.
//   2. GROUND — a FACT claim already failing criterion 3 gets its `source_span` LOCATED in the item's
//      captured text under normalization (whitespace runs, curly/straight quotes, HTML entities, soft
//      hyphens, case-insensitive fallback — see locateSpanInText) and REWRITTEN to the exact verbatim
//      substring the normalized match resolves to. `claim_text` is NEVER touched. A claim neither the span
//      nor the claim_text can locate anywhere in the item's captures is `ungrounded_after_capture`, with
//      the closest fuzzy match (Dice coefficient) reported as evidence — never written.
//   3. SLOTS — a missing required slot (item-type-required-slots.json, the kit's own vocabulary, imported
//      read-only) gets one claim: a FACT (verbatim span, via the SAME extractors record-facts.mjs /
//      record-facts-research.mjs already use to mint new items) when the captured text states it, else an
//      honest GAP in the kit's own wording. Never invented, never guessed.
//   4. GATE A — the live scanner (gate-a-scan.mjs / gate-a-match.mjs, via write-item.ts's buildGateARow,
//      imported unmodified) re-scans the item's current full_brief against its current FACT claims and the
//      item_gate_a_state row is upserted.
//   5. RE-DERIVE — touch the item (the same touch rederive-record-provenance.mjs uses) so the
//      set_provenance_status trigger re-runs validate_item_provenance and stamps the row; read the row back
//      fresh (never trust an UPDATE's own RETURNING — it is filled before the AFTER trigger runs). An
//      `archived-unreasoned` item that comes back `verified` is un-archived (archive_reason stays null).
//      An item still failing is left exactly as it is, reported with the remaining criterion.
//
// GOVERNING FILES, IMPORTED, NEVER COPIED OR EDITED (per the brief): export-census-rows.mjs (capture
// resolution), record-facts.mjs / record-facts-research.mjs (slot extraction), write-item.ts
// (buildGateARow), item-type-required-slots.json (slot vocabulary, read-only). This file adds NOTHING to
// any of those vocabularies or thresholds.
//
// DI, DRY BY DEFAULT, $0. Every DB read/write and every network fetch is an injected `deps` function —
// this module runs, and is tested, with ZERO DB credentials and ZERO network access. The MAINT wrapper
// (scripts/maintenance/provenance-heal.mjs) is the only place real db.mjs / fetch wiring happens.
// `main()` never writes or fetches unless `mode === "apply"`.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  classifyHost,
  captureDocument,
  resolveRowCapture,
  extractFrDocumentNumber,
} from "./export-census-rows.mjs";
import { deriveKey } from "../lib/canonical-key.mjs";
// buildGateARow -- THE live Gate-A scanner (gate-a-scan.mjs) wrapped exactly as apply-mint-batch.mjs's own
// computeGateAState wraps it. Imported unmodified (see this file's header).
import { buildGateARow } from "../../src/lib/intake/write-item.ts";
// record-facts.mjs's own exported slot extractors -- the SAME functions buildRecordFacts routes to
// (buildRecordSlotClaim, private to that file) for a brand-new mint. Reused unmodified for an EXISTING
// item's missing slot; the routing switch below is a 4-line dispatch, not a re-implementation of any of
// these functions' own regex/verbatim logic.
import {
  extractSlotFact,
  extractBindingPositionFact,
  extractDueDateFact,
  extractCorridorFact,
} from "../../src/lib/intake/record-facts.mjs";
import {
  extractResearchSlotFact,
  extractAlwaysPresentResearchFact,
  RESEARCH_ALWAYS_PRESENT_SLOTS,
} from "../../src/lib/intake/record-facts-research.mjs";

export const HEAL_VERSION = "hp1-2026-09-03.1";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SLOTS_PATH = resolve(HERE, "item-type-required-slots.json");

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// item-type-required-slots.json — read-only import of the kit's own slot vocabulary. Never edited here.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

/** Load the kit's item_type -> required slot_key[] map. Pure past the one fs.readFileSync (matches
 *  export-census-rows.mjs's own loadReviewedVerdicts: a script-level read at CALL time, never module
 *  scope — scripts/mint/** is not under the src/lib no-I/O discipline, but keeping the read out of module
 *  scope keeps this file importable/testable with a stubbed path). */
export function loadRequiredSlots(path = DEFAULT_SLOTS_PATH) {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const out = {};
  for (const [itemType, slots] of Object.entries(raw)) {
    if (Array.isArray(slots)) out[itemType] = slots;
  }
  return out;
}

/** The exact criterion-5 check (migration 299's own self-check SQL, verbatim shape): a claim covers
 *  `slotKey` when claim_kind IN (FACT, GAP) and claim_text case-insensitively CONTAINS the slot_key
 *  literal. Pure. Mirrors the live SQL `claim_kind IN ('FACT','GAP') AND claim_text ILIKE '%'||slot_key||'%'`
 *  exactly, so this module's own idea of "already covered" can never disagree with the DB's. */
export function claimCoversSlot(claim, slotKey) {
  if (!claim) return false;
  if (claim.claim_kind !== "FACT" && claim.claim_kind !== "GAP") return false;
  return String(claim.claim_text ?? "").toLowerCase().includes(String(slotKey ?? "").toLowerCase());
}

/** The required slot_keys for `itemType` (per `requiredSlotsMap`) that no existing claim covers yet.
 *  Pure. Empty array when the item_type has no entry (nothing required) or every slot is already covered. */
export function missingRequiredSlots(itemType, claims, requiredSlotsMap) {
  const required = requiredSlotsMap?.[itemType] ?? [];
  return required.filter((slotKey) => !(claims ?? []).some((c) => claimCoversSlot(c, slotKey)));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// NORMALIZATION — position-preserving. Builds a normalized string alongside a map back to the ORIGINAL
// character index every normalized character came from, so a match found under normalization still
// yields a verbatim slice of the ORIGINAL captured text (never the normalized text itself — a normalized
// string is not what agent_run_searches.result_content holds, and criterion 3 checks the original).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

const CURLY_QUOTES = Object.freeze({
  "‘": "'", "’": "'", "‚": "'", "‛": "'", "′": "'",
  "“": '"', "”": '"', "„": '"', "‟": '"', "″": '"',
});
const SOFT_HYPHEN = "­";
const NAMED_ENTITIES = Object.freeze({
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  hellip: "…", mdash: "—", ndash: "–",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
});
const ENTITY_RE = /^&(#x[0-9a-f]+|#\d+|[a-z]+);/i;

function decodeEntityToken(token) {
  if (token[0] === "#") {
    const isHex = token[1] === "x" || token[1] === "X";
    const code = isHex ? parseInt(token.slice(2), 16) : parseInt(token.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : null;
  }
  return NAMED_ENTITIES[token.toLowerCase()] ?? null;
}

/**
 * Normalize `text`, returning `{ normalized, map }` where `map[i]` is the ORIGINAL string index the
 * character at `normalized[i]` came from (the first source index, for output collapsed from a run), and
 * `map[normalized.length]` is a sentinel (the original text's length) so an end-of-match boundary at the
 * very end of the normalized string still resolves. Transformations: HTML entities decoded to their
 * single character; soft hyphens (U+00AD) dropped; curly quotes folded to straight; any whitespace run
 * (including a decoded `&nbsp;`) collapsed to one space. Case is preserved — case-folding is a separate,
 * later fallback (see locateSpanInText), never conflated with this structural normalization. Pure.
 */
export function buildNormalizedIndex(text) {
  const s = String(text ?? "");
  let out = "";
  const map = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] === "&") {
      const m = s.slice(i, i + 12).match(ENTITY_RE);
      if (m) {
        const decoded = decodeEntityToken(m[1]);
        if (decoded != null) {
          for (const ch of decoded) { out += ch; map.push(i); }
          i += m[0].length;
          continue;
        }
      }
    }
    const ch = s[i];
    if (ch === SOFT_HYPHEN) { i += 1; continue; }
    if (/\s/.test(ch)) {
      const start = i;
      while (i < s.length && /\s/.test(s[i])) i += 1;
      out += " ";
      map.push(start);
      continue;
    }
    out += CURLY_QUOTES[ch] ?? ch;
    map.push(i);
    i += 1;
  }
  map.push(s.length);
  return { normalized: out, map };
}

/**
 * Locate `needle` inside `haystackText`: exact literal substring first (the common, cheap case), then a
 * normalized match (structural normalization only, case preserved), then a normalized CASE-INSENSITIVE
 * fallback. Returns `{ span, method }` — `span` is a VERBATIM slice of the ORIGINAL `haystackText` (never
 * the normalized form), `method` one of `"exact" | "normalized" | "normalized_ci"`. Returns null when no
 * method locates it. Pure.
 */
export function locateSpanInText(needle, haystackText) {
  const needleTrim = String(needle ?? "").trim();
  const hay = String(haystackText ?? "");
  if (!needleTrim || !hay) return null;

  const litIdx = hay.indexOf(needleTrim);
  if (litIdx !== -1) return { span: hay.slice(litIdx, litIdx + needleTrim.length), method: "exact" };

  const { normalized: hayNorm, map } = buildNormalizedIndex(hay);
  const { normalized: needleNorm } = buildNormalizedIndex(needleTrim);
  if (!needleNorm) return null;

  let idx = hayNorm.indexOf(needleNorm);
  let method = "normalized";
  if (idx === -1) {
    idx = hayNorm.toLowerCase().indexOf(needleNorm.toLowerCase());
    method = "normalized_ci";
  }
  if (idx === -1) return null;

  const origStart = map[idx];
  const origEnd = map[idx + needleNorm.length];
  if (origStart == null || origEnd == null || origEnd <= origStart) return null;
  const span = hay.slice(origStart, origEnd).trim();
  return span ? { span, method } : null;
}

/** The exact criterion-3 test (migration 218's restored shape): does `haystack` contain `needle` as a
 *  case-insensitive, btrim'd literal substring? Pure. Used to check whether a claim is ALREADY grounded
 *  against a (possibly newly captured) source before attempting to heal it. */
export function containsCaseInsensitive(haystack, needle) {
  const n = String(needle ?? "").trim();
  if (!haystack || !n) return false;
  return String(haystack).toLowerCase().includes(n.toLowerCase());
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// FUZZY FALLBACK — Dice coefficient over character bigrams. REPORTING ONLY: a fuzzy match is never
// written as a source_span (only locateSpanInText's verbatim result ever is).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

function bigramCounts(s) {
  const t = String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  const counts = new Map();
  for (let i = 0; i < t.length - 1; i++) {
    const bg = t.slice(i, i + 2);
    counts.set(bg, (counts.get(bg) ?? 0) + 1);
  }
  return counts;
}

/** Dice coefficient (0..1) between two strings' character-bigram multisets. Pure. 0 for a string with
 *  fewer than 2 characters on either side (no bigrams to compare). */
export function diceCoefficient(a, b) {
  const A = bigramCounts(a);
  const B = bigramCounts(b);
  let totalA = 0, totalB = 0, overlap = 0;
  for (const v of A.values()) totalA += v;
  for (const v of B.values()) totalB += v;
  if (totalA + totalB === 0) return 0;
  for (const [bg, ca] of A) {
    const cb = B.get(bg);
    if (cb) overlap += Math.min(ca, cb);
  }
  return (2 * overlap) / (totalA + totalB);
}

const FUZZY_MAX_WINDOWS = 5000;

/** Slide a `needle`-length (or 20-char minimum) window across `haystackText`, scoring each by Dice
 *  coefficient, and return the best `{ score, window, start, end }` — or null for an empty needle/haystack.
 *  Pure, bounded: the stride grows with haystack length so a multi-MB capture (ADR-016) never runs more
 *  than ~FUZZY_MAX_WINDOWS scoring passes. Reporting only — see this section's header. */
export function findClosestFuzzyMatch(needle, haystackText) {
  const n = String(needle ?? "").trim();
  const hay = String(haystackText ?? "");
  if (!n || !hay) return null;
  const winLen = Math.max(20, n.length);
  const stride = Math.max(15, Math.ceil(hay.length / FUZZY_MAX_WINDOWS));
  let best = null;
  for (let start = 0; start < hay.length; start += stride) {
    const window = hay.slice(start, start + winLen);
    if (!window) break;
    const score = diceCoefficient(n, window);
    if (!best || score > best.score) best = { score, window, start, end: start + window.length };
  }
  return best;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// STEP 1 — CAPTURE. Per-family resolution imported from export-census-rows.mjs, unmodified. "Plain GET
// otherwise" is this file's own minimal wrap of that module's exported captureDocument (a >200-char
// usability threshold, the same one buildExportRow / resolveRowCapture already apply) — never a
// re-derivation of the Cellar/FR logic itself.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

/** True when NONE of an item's existing capture rows carry >200 trimmed chars of result_content — the
 *  same usability floor export-census-rows.mjs's buildExportRow uses. Pure. */
export function needsCapture(captures) {
  return !(captures ?? []).some((c) => String(c?.result_content ?? "").trim().length > 200);
}

/** The URL to capture for `item`: its own source_url, else the caller-resolved source-registry URL
 *  fallback (dispatch: "has a source_url (or sources row url)"). Pure. */
export function resolveCaptureUrl(item, sourceUrlFallback) {
  return item?.source_url || sourceUrlFallback || null;
}

/** Reduce a plain captureDocument() result to the same usable/evidence envelope shape resolveRowCapture's
 *  per-family branches return, for the "plain GET otherwise" family (a host none of eurlex/federal_register
 *  claims). Pure over its input (the network call already happened in the caller). */
export function envelopeFromPlainGet(res, endpoint) {
  const text = res.text ?? "";
  const usable = !!(res.ok && text.trim().length > 200);
  return {
    usable,
    status: res.status,
    bytes: Buffer.byteLength(res.html ?? "", "utf8"),
    head: text.slice(0, 300),
    endpoint,
    text: usable ? text : null,
    title: null,
    error: res.error,
  };
}

/**
 * Capture one item's missing grounding, live. Resolves the per-family identity from the URL's host
 * (`classifyHost`, imported), then defers to `resolveRowCapture` (Cellar-first / FR-API — imported,
 * unmodified) for eurlex/federal_register, or a plain polite GET otherwise. Returns
 * `{ status: "captured", url, text, title, evidence }` or `{ status: "held", reason, url?, evidence? }` —
 * a refusal is ALWAYS returned with evidence, never thrown past this function.
 * @param {{fetchImpl: Function}} deps
 */
export async function captureItem(item, url, deps) {
  if (!url) return { status: "held", reason: "no_source_url" };
  const host = classifyHost(url);

  if (host === "eurlex") {
    const canonicalKey = item.canonical_instrument_key || deriveKey(item.instrument_identifier ?? null, url);
    if (!canonicalKey) return { status: "held", reason: "canonical_key_unresolved", url };
    const env = await resolveRowCapture({ document_url: url }, { scheme: "celex", canonicalKey }, { fetchImpl: deps.fetchImpl });
    return envelopeToOutcome(env, url);
  }

  if (host === "federal_register") {
    const frDocumentNumber = extractFrDocumentNumber(url);
    if (!frDocumentNumber) return { status: "held", reason: "fr_document_number_unresolved", url };
    const env = await resolveRowCapture({ document_url: url }, { scheme: "federal_register", frDocumentNumber }, { fetchImpl: deps.fetchImpl });
    return envelopeToOutcome(env, url);
  }

  const res = await captureDocument(url, { fetchImpl: deps.fetchImpl });
  const env = envelopeFromPlainGet(res, url);
  return envelopeToOutcome(env, url);
}

function envelopeToOutcome(env, url) {
  if (!env.usable) {
    return {
      status: "held",
      reason: env.noCapturePath ? "no_capture_path" : "capture_blocked",
      url,
      evidence: { status: env.status ?? null, bytes: env.bytes ?? 0, head: env.head ?? "", endpoint: env.endpoint ?? null, error: env.error ?? null },
    };
  }
  return {
    status: "captured",
    url: env.endpoint ?? url,
    text: env.text,
    title: env.title ?? null,
    evidence: { status: env.status ?? null, bytes: env.bytes ?? 0, endpoint: env.endpoint ?? null },
  };
}

/** agent_run_searches INSERT row for a fresh HEAL capture (migration 112 / write-item.ts's own shape).
 *  `result_content` is the FULL captured text, never truncated (ADR-016). Pure. */
export function buildCaptureSearchRow(itemId, captureResult, nowIso = new Date().toISOString()) {
  return {
    intelligence_item_id: itemId,
    search_query: "heal-provenance:capture",
    result_url: captureResult.url,
    result_title: captureResult.title ?? null,
    result_index: 0,
    result_content: captureResult.text,
    searched_at: nowIso,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// STEP 2 — GROUND.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Plan the GROUND outcome for one FACT claim against the item's current captures (each
 * `{ id, result_content }`). Pure. Outcomes: `"already_grounded"` (criterion 3 already passes — nothing
 * to do), `"healed"` (a verbatim span was located, under normalization, in some capture — `newSpan` +
 * `searchId` name where), `"ungrounded_after_capture"` (neither the span nor the claim_text was found in
 * any capture — `fuzzy` names the closest Dice-scored match, evidence only, never written). A non-FACT
 * claim (GAP/ANALYSIS/LEGAL) is `"not_applicable"` — GROUND only ever touches FACT source_span.
 */
export function planGroundingForClaim(claim, captures) {
  if (claim.claim_kind !== "FACT") return { outcome: "not_applicable" };
  const caps = captures ?? [];

  if (claim.source_span && caps.some((c) => containsCaseInsensitive(c.result_content, claim.source_span))) {
    return { outcome: "already_grounded" };
  }

  if (claim.source_span) {
    for (const c of caps) {
      const found = locateSpanInText(claim.source_span, c.result_content);
      if (found) return { outcome: "healed", newSpan: found.span, method: found.method, searchId: c.id };
    }
  }
  for (const c of caps) {
    const found = locateSpanInText(claim.claim_text, c.result_content);
    if (found) return { outcome: "healed", newSpan: found.span, method: `claim_text_${found.method}`, searchId: c.id };
  }

  let bestFuzzy = null;
  const fuzzyNeedle = claim.source_span || claim.claim_text;
  for (const c of caps) {
    const fz = findClosestFuzzyMatch(fuzzyNeedle, c.result_content);
    if (fz && (!bestFuzzy || fz.score > bestFuzzy.score)) bestFuzzy = { score: fz.score, window: fz.window, searchId: c.id };
  }
  return {
    outcome: "ungrounded_after_capture",
    fuzzy: bestFuzzy ? { score: bestFuzzy.score, window: bestFuzzy.window, search_id: bestFuzzy.searchId, meets_dice_0_8: bestFuzzy.score >= 0.8 } : null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// STEP 3 — SLOTS. Routing over record-facts.mjs / record-facts-research.mjs's own exported extractors —
// the SAME 4-line dispatch buildRecordSlotClaim (record-facts.mjs, private) already makes for a fresh
// mint, replicated here (not the extractors' own logic) so an EXISTING item's missing slot gets the exact
// same extractor a new item of that type would.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

const RESEARCH_GAP_TEXT = Object.freeze({
  key_figure:
    "No verbatim quantified figure (digit plus a unit/%/currency marker) was located in the captured " +
    "source text — no key figure yet, matching the Research surface's own honest em-dash state " +
    "(docs/design/redesign/DESIGN-DEVIATIONS.md D06-2) until the source itself carries one.",
  evidence_agreement_signal:
    "No verbatim evidence-agreement statement (docs/specs/03-research.md §4 credibility input) was " +
    "located in the captured source text for this record-grade item.",
  source_authority_signal:
    "No verbatim source-authority statement (docs/specs/03-research.md §4 credibility input) was " +
    "located in the captured source text for this record-grade item.",
});

/** One slot claim for `itemType`'s `slotKey`, over `capturedText` — a FACT (verbatim span) when the
 *  source states it, else an honest GAP in the kit's own wording. Routes to the specialised extractor
 *  (binding_position/due_date/corridor_identity, or the research-profile triggers for research_finding),
 *  falling back to the generic SLOT_TRIGGERS floor (record-facts.mjs's own extractSlotFact) otherwise —
 *  never invents, never widens what counts as "found." Pure (every extractor it calls is pure). */
export function buildSlotClaim({ slotKey, itemType, capturedText, sourceUrl }) {
  if (itemType === "research_finding") {
    if (RESEARCH_ALWAYS_PRESENT_SLOTS.includes(slotKey)) {
      return extractAlwaysPresentResearchFact({
        slotKey, capturedText, sourceUrl,
        gapText: RESEARCH_GAP_TEXT[slotKey] ?? `No verbatim ${slotKey.replace(/_/g, " ")} statement was located in the captured source text.`,
      });
    }
    const fact = extractResearchSlotFact({ slotKey, capturedText, sourceUrl });
    if (fact) return fact;
    return extractSlotFact({ slotKey, capturedText, sourceUrl }); // honest GAP floor, same as a fresh mint
  }
  if (slotKey === "binding_position") return extractBindingPositionFact({ capturedText, sourceUrl });
  if (slotKey === "due_date") return extractDueDateFact({ capturedText, sourceUrl });
  if (slotKey === "corridor_identity") return extractCorridorFact({ capturedText, sourceUrl });
  return extractSlotFact({ slotKey, capturedText, sourceUrl });
}

/** The longest existing capture's text for an item — the best available evidence pool for slot
 *  extraction when several captures exist. Pure. Null when there are no usable (>200 char) captures. */
export function bestCaptureText(captures) {
  const usable = (captures ?? []).filter((c) => String(c?.result_content ?? "").trim().length > 200);
  if (!usable.length) return null;
  return usable.reduce((best, c) => (c.result_content.length > best.result_content.length ? c : best)).result_content;
}

/** Which capture (by id) a healed/newly-built FACT span actually came from, for `search_result_id` —
 *  criterion 3 requires this to resolve to a real agent_run_searches row containing the span (write-item.ts's
 *  own header). Pure. Null when no capture contains it (should not happen for a span this module itself
 *  just verbatim-located, but never assumed). */
export function findSearchIdForSpan(span, captures) {
  if (!span) return null;
  const hit = (captures ?? []).find((c) => containsCaseInsensitive(c.result_content, span));
  return hit ? hit.id : null;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// STEP 4 — GATE A. buildGateARow is write-item.ts's own wrapper over the live scanner (gate-a-scan.mjs) —
// imported unmodified; this file only decides insert-vs-update (the table's PK is intelligence_item_id).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

/** The item_gate_a_state row for `item`'s CURRENT full_brief and CURRENT FACT claims (post GROUND/SLOTS).
 *  Pure (buildGateARow is pure — the live scanner is pure text computation, no I/O). */
export function planGateA(item, claims) {
  const factClaims = (claims ?? [])
    .filter((c) => c.claim_kind === "FACT")
    .map((c) => ({ claim_text: c.claim_text ?? "", source_span: c.source_span ?? "" }));
  return buildGateARow({ itemId: item.id, fullBrief: item.full_brief ?? "", factClaims });
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// STEP 5 — RE-DERIVE. Same touch rederive-record-provenance.mjs uses; the trigger, not this module,
// writes provenance_status.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

/** True when an `archived-unreasoned`-selected item that just re-derived `verified` should be
 *  un-archived (archive_reason stays null — this file never invents one). Pure. */
export function shouldUnarchive(selectionMode, freshStatus, item) {
  return selectionMode === "archived-unreasoned" && freshStatus === "verified" && item.is_archived === true;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// SELECTION
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

/** Parse `--arg` into this runtime's selection shape. Pure. */
export function parseSelection(arg) {
  const raw = String(arg ?? "").trim();
  if (!raw || raw === "quarantined-live") return { ok: true, mode: "quarantined-live", ids: null };
  if (raw === "archived-unreasoned") return { ok: true, mode: "archived-unreasoned", ids: null };
  if (raw === "slots-backfill") return { ok: true, mode: "slots-backfill", ids: null };
  if (raw.startsWith("ids:")) {
    const ids = raw.slice(4).split(",").map((s) => s.trim()).filter(Boolean);
    if (!ids.length) return { ok: false, error: '--arg "ids:<uuid,uuid,...>" requires at least one id.' };
    return { ok: true, mode: "ids", ids };
  }
  return {
    ok: false,
    error: `unrecognized --arg ${JSON.stringify(raw)} (expected blank/"quarantined-live", "archived-unreasoned", "ids:<uuid,uuid,...>", or "slots-backfill").`,
  };
}

/** The slots-backfill candidate set: every item deps.readCandidateTypeItems returns (market_signal /
 *  initiative / research_finding, verified, live) that is ACTUALLY missing >=1 kit-required slot right
 *  now — narrowed here (not left to the caller) so a dispatch of this selection never runs the pipeline
 *  over an item that has nothing to backfill. */
export async function resolveSlotsBackfillCandidates(deps, requiredSlotsMap) {
  const items = await deps.readCandidateTypeItems(["market_signal", "initiative", "research_finding"]);
  const kept = [];
  for (const item of items) {
    const claims = await deps.readClaims(item.id);
    if (missingRequiredSlots(item.item_type, claims, requiredSlotsMap).length) kept.push(item);
  }
  return kept;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// ORCHESTRATION — one item, five steps, each reading what the previous wrote.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Heal ONE item through all five steps. `deps` (all DB reads/writes + fetch, injected):
 *   fetchImpl, readCaptures(itemId), readClaims(itemId), readSections(itemId), readGateAState(itemId),
 *   readSourceUrl(sourceId), validateProvenance(itemId) -> {valid, recommended_status, failures[]},
 *   insertSearch(row) -> {id, result_url}, insertClaim(row) -> {id},
 *   updateClaimSpan(id, patch) -> {...}, insertSection(row) -> {id, section_key},
 *   updateSectionContent(id, content_md) -> {...}, upsertGateA(row, exists:boolean) -> {...},
 *   touchItem(itemId) -> {...}, readProvenanceStatus(itemId) -> string|null,
 *   unarchiveItem(itemId) -> {...}.
 * In dry mode (`apply:false`) every write/fetch is SKIPPED and reported as `would_*` — every read still
 * runs (dry mode plans against the item's REAL current captures/claims, per the brief).
 */
export async function healOneItem(item, { deps, apply, selectionMode, requiredSlotsMap }) {
  const report = { id: item.id, item_type: item.item_type, steps: {} };

  // ── 1. CAPTURE ──────────────────────────────────────────────────────────────────────────────────
  let captures = await deps.readCaptures(item.id);
  if (needsCapture(captures)) {
    const sourceUrlFallback = item.source_id ? await deps.readSourceUrl(item.source_id) : null;
    const url = resolveCaptureUrl(item, sourceUrlFallback);
    if (!url) {
      report.steps.capture = { outcome: "held", reason: "no_source_url" };
    } else if (!apply) {
      report.steps.capture = { outcome: "would_fetch", url };
    } else {
      const res = await captureItem(item, url, deps);
      if (res.status === "captured") {
        const row = buildCaptureSearchRow(item.id, res);
        const ins = await deps.insertSearch(row);
        captures = [...captures, { id: ins.id, result_url: row.result_url, result_content: row.result_content }];
        report.steps.capture = { outcome: "captured", url: res.url, length: res.text.length, search_id: ins.id, evidence: res.evidence };
      } else {
        report.steps.capture = res;
      }
    }
  } else {
    report.steps.capture = { outcome: "already_captured", captures: captures.length };
  }

  // ── 2. GROUND ───────────────────────────────────────────────────────────────────────────────────
  const claims = await deps.readClaims(item.id);
  const groundResults = [];
  for (const c of claims) {
    if (c.claim_kind !== "FACT") continue;
    const plan = planGroundingForClaim(c, captures);
    if (plan.outcome === "healed") {
      if (apply) await deps.updateClaimSpan(c.id, { source_span: plan.newSpan, search_result_id: plan.searchId });
      groundResults.push({ claim_id: c.id, outcome: apply ? "healed" : "would_heal", new_span: plan.newSpan, method: plan.method });
    } else if (plan.outcome !== "already_grounded") {
      groundResults.push({ claim_id: c.id, ...plan });
    }
  }
  report.steps.ground = groundResults;

  // ── 3. SLOTS ────────────────────────────────────────────────────────────────────────────────────
  const missingSlots = missingRequiredSlots(item.item_type, claims, requiredSlotsMap);
  const slotResults = [];
  if (missingSlots.length) {
    const capturedText = bestCaptureText(captures);
    if (!capturedText) {
      for (const slotKey of missingSlots) slotResults.push({ slot_key: slotKey, outcome: "held_no_capture" });
    } else {
      let sectionId = null;
      let sectionAppend = [];
      if (apply) {
        const sections = await deps.readSections(item.id);
        const existing = sections.find((s) => s.section_key === "record_facts");
        if (existing) {
          sectionId = existing.id;
        } else {
          const order = sections.length ? Math.max(...sections.map((s) => s.section_order ?? 0)) + 1 : 2;
          const ins = await deps.insertSection({ item_id: item.id, section_key: "record_facts", section_order: order, content_md: "", is_conditional: false });
          sectionId = ins.id;
        }
      }
      for (const slotKey of missingSlots) {
        const claim = buildSlotClaim({ slotKey, itemType: item.item_type, capturedText, sourceUrl: item.source_url });
        if (apply) {
          const isFact = claim.claim_kind === "FACT";
          const ins = await deps.insertClaim({
            section_row_id: sectionId,
            intelligence_item_id: item.id,
            claim_text: claim.claim_text,
            claim_kind: claim.claim_kind,
            source_span: claim.source_span ?? null,
            source_id: isFact ? (item.source_id ?? null) : null,
            search_result_id: isFact ? findSearchIdForSpan(claim.source_span, captures) : null,
            source_tier_at_grounding: isFact ? (item.source_tier ?? null) : null,
          });
          sectionAppend.push(claim.claim_text);
          slotResults.push({ slot_key: slotKey, claim_kind: claim.claim_kind, outcome: "written", claim_id: ins.id });
        } else {
          slotResults.push({ slot_key: slotKey, claim_kind: claim.claim_kind, outcome: "would_write" });
        }
      }
      if (apply && sectionAppend.length) {
        const sections2 = await deps.readSections(item.id);
        const sec = sections2.find((s) => s.id === sectionId);
        const priorContent = sec?.content_md ?? "";
        const newContent = [priorContent, ...sectionAppend].filter(Boolean).join("\n");
        await deps.updateSectionContent(sectionId, newContent);
      }
    }
  }
  report.steps.slots = slotResults;

  // ── 4. GATE A ───────────────────────────────────────────────────────────────────────────────────
  const freshClaims = apply ? await deps.readClaims(item.id) : claims;
  const gateRow = planGateA(item, freshClaims);
  if (apply) {
    const existing = await deps.readGateAState(item.id);
    await deps.upsertGateA(gateRow, !!existing);
  }
  report.steps.gate_a = { outcome: apply ? "written" : "would_write", orphan_count: gateRow.orphan_count, scanned_hash: gateRow.scanned_hash };

  // ── 5. RE-DERIVE ────────────────────────────────────────────────────────────────────────────────
  const verdict = await deps.validateProvenance(item.id);
  if (!apply) {
    report.steps.rederive = { outcome: verdict?.valid ? "would_heal_verified" : "still_failing", failures: verdict?.failures ?? [] };
  } else if (verdict?.valid) {
    await deps.touchItem(item.id);
    const status = await deps.readProvenanceStatus(item.id);
    report.steps.rederive = { outcome: status === "verified" ? "healed_verified" : "touched_not_verified", status };
    if (shouldUnarchive(selectionMode, status, item)) {
      await deps.unarchiveItem(item.id);
      report.steps.rederive.unarchived = true;
    }
  } else {
    report.steps.rederive = { outcome: "still_failing", failures: verdict?.failures ?? [] };
  }

  return report;
}

/** Fold per-item reports into the summary counts the report contract names. Pure. */
export function summarizeReports(perItem) {
  const s = {
    healed_verified: 0, would_heal_verified: 0, still_failing: 0,
    capture_held: 0, ungrounded_after_capture: 0,
    slots_written_fact: 0, slots_written_gap: 0,
    gate_a_written: 0, unarchived: 0,
  };
  for (const r of perItem) {
    if (r.steps.capture?.outcome === "held") s.capture_held += 1;
    for (const g of r.steps.ground ?? []) if (g.outcome === "ungrounded_after_capture") s.ungrounded_after_capture += 1;
    for (const sl of r.steps.slots ?? []) {
      if (sl.outcome === "written" && sl.claim_kind === "FACT") s.slots_written_fact += 1;
      if (sl.outcome === "written" && sl.claim_kind === "GAP") s.slots_written_gap += 1;
    }
    if (r.steps.gate_a?.outcome === "written") s.gate_a_written += 1;
    if (r.steps.rederive?.outcome === "healed_verified") s.healed_verified += 1;
    if (r.steps.rederive?.outcome === "would_heal_verified") s.would_heal_verified += 1;
    if (r.steps.rederive?.outcome === "still_failing") s.still_failing += 1;
    if (r.steps.rederive?.unarchived) s.unarchived += 1;
  }
  return s;
}

/**
 * @param {{ mode?: "dry"|"apply", arg?: string }} opts
 * @param {object} deps — see healOneItem's own header, plus selection resolvers:
 *   readQuarantinedLive(), readArchivedUnreasoned(), readCandidateTypeItems(itemTypes), readByIds(ids),
 *   and optionally `requiredSlotsMap` (defaults to loadRequiredSlots()).
 */
export async function main({ mode = "dry", arg = "" } = {}, deps) {
  const apply = mode === "apply";
  const summary = { step: "provenance-heal", mode, counts: {}, applied: 0, read_back: {}, exitCode: 0 };

  const selection = parseSelection(arg);
  if (!selection.ok) {
    summary.note = `REFUSED — ${selection.error}`;
    summary.exitCode = 1;
    return summary;
  }

  const requiredSlotsMap = deps.requiredSlotsMap ?? loadRequiredSlots();

  let items;
  if (selection.mode === "quarantined-live") items = await deps.readQuarantinedLive();
  else if (selection.mode === "archived-unreasoned") items = await deps.readArchivedUnreasoned();
  else if (selection.mode === "slots-backfill") items = await resolveSlotsBackfillCandidates(deps, requiredSlotsMap);
  else items = await deps.readByIds(selection.ids);

  const perItem = [];
  for (const item of items) {
    perItem.push(await healOneItem(item, { deps, apply, selectionMode: selection.mode, requiredSlotsMap }));
  }

  const counts = summarizeReports(perItem);
  summary.counts = { selection: { mode: selection.mode, ids: selection.ids }, candidates: items.length, ...counts };
  summary.applied = counts.healed_verified;
  summary.per_item = perItem;
  summary.note = apply
    ? `Healed ${counts.healed_verified}/${items.length} to verified; ${counts.still_failing} still failing; ` +
      `${counts.capture_held} capture-held; ${counts.ungrounded_after_capture} ungrounded_after_capture; ` +
      `${counts.unarchived} un-archived.`
    : `DRY — plan only, nothing written or fetched. ${counts.would_heal_verified}/${items.length} would ` +
      `heal to verified on current captures; the rest need capture/grounding/slots work this run's per_item ` +
      `lists explicitly.`;

  return summary;
}

export default main;
