// src/lib/agent/canonical-pipeline.ts
//
// THE single canonical generation pipeline as plain, directly-executable lib functions the workflow
// steps call (no blind bodies). There is ONE generator and it is a DEEP DIVE — the thin single-source
// generate (the retired scripts/content-generate.mjs) does not exist anymore. generateBrief:
//   1. fetches the primary source,
//   2. uses web_search to DISCOVER corroborating/expanding sources (official, academic, named
//      participants, trade press) — the system's whole reason for being: a thin source triggers
//      deeper research, it is never accepted as-is,
//   3. fetches that multi-source pool, and
//   4. synthesises a rich brief ACROSS the pool under the Forward-Intelligence + No-Vacuum rules,
//      documenting the discovered sources (which then feed source-growth).
// This is the auto-discovery generalisation of the (now retired) jolt-exemplar-regen prototype,
// which hand-listed the corroborators; web_search discovery replaces that hand-list so it works for
// any item at scale. ground re-verifies FACT spans against the same pool; grow registers + credits
// the discovered sources.
// Uses the Supabase SERVICE client throughout (env-based -> works in the Vercel workflow runtime).
// The grounding "transaction" is emulated with a manual cleanup-on-invalid (delete the just-inserted
// claims/searches) since the REST client has no multi-statement transaction — atomic enough: an item
// is only ever flipped by validate_item_provenance. Browserless is the only content-fetch path.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { browserlessFetch } from "@/lib/sources/canonical-fetch.mjs";
import { fetchPrimaryWithFallback, detectRoadblock } from "@/lib/sources/primary-fallback.mjs";
import { generateCandidates, persistExhaustionRecord } from "@/lib/sources/seek-more.mjs";
import { looksLikePdfUrl, classifyBody, pdfToText } from "@/lib/sources/pdf-extract.mjs";
import { anthropicError, isFatalAnthropic } from "@/lib/agent/anthropic-error.mjs";
import { streamMessagesText } from "@/lib/agent/anthropic-stream.mjs";
// SPEND CHOKEPOINT (routing, ruling 2026-07-04): the pipeline's model calls route through the spend client
// (spendStreamRaw = the same streamMessagesText call, ticket-gated + ceiling-enforced + accounted;
// spendSearch = the web_search call). Behavior-preserving — the streaming body/params are unchanged.
import { spendStreamRaw, spendSearch, spendStream, setSpendTicket } from "@/lib/llm/spend-client";
import { cachedSystemBlocks } from "@/lib/agent/prompt-cache.mjs";
import { extractRegulationSections } from "@/lib/agent/extract-regulation-sections";
import { buildTimelineRows } from "@/lib/agent/timeline-harvest.mjs";
import { forceSlotCoverage, MAX_JUDGED_NOMINATIONS } from "@/lib/agent/slot-forcing.mjs";
import { summarizeLedger, ledgerRegression } from "@/lib/agent/ledger-dominance.mjs";
import { diffLedger, applyLedgerDiff } from "@/lib/agent/ledger-apply.mjs";
import { decodeHtmlBytes } from "@/lib/sources/charset-decode.mjs";
import { twoPassGenerate } from "@/lib/agent/two-pass-generate.mjs";
import { SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { parseAgentOutput, extractClaimLedgerLenient, crossLinkClaimSources, findYamlBlock } from "@/lib/agent/parse-output";
import { specForItemType } from "@/lib/agent/extract-registry";
import { growSourcesFromBrief, parseNewSourcesFromBrief, registerCitedSources, registerPoolHostsForGrounding } from "@/lib/sources/source-growth";
import { buildResolver, hostOf, hostInstitution, type SourceRow, type Resolver } from "@/lib/sources/institution";
import { perFactGates, identityCongruenceHolds } from "./mint-gates.mjs";
import { partitionCitedByHost } from "@/lib/sources/cited-host-gate.mjs";
import { buildSourceBlocks, authorityFloorFor } from "@/lib/agent/source-blocks.mjs";
import { floorSources, reattributeToFloor } from "@/lib/agent/floor-attribution.mjs";
import { officialnessOf } from "@/lib/sources/officialness.mjs";
import { verifyPoolTargetMatch } from "@/lib/sources/target-match.mjs";
import { mergeNullTierAggregate, summarizeNullTierAggregate } from "@/lib/agent/null-tier-flag.mjs";
// stripUrlMarkers: the SINGLE JS home for the write-site URL-marker strip (drift-guarded against migration
// 150's SQL canonicalize by url-canon.test.mjs — the two-home guarantee). Synthesis wraps URLs in emphasis
// (*https://x/*, `https://x/`); criterion-2's URL match would otherwise capture the trailing marker.
import { stripUrlMarkers } from "@/lib/agent/url-canon.mjs";
// ANALYSIS-LABEL VOCABULARY (C2 single home, 2026-07-11): the ledger prompt AND the kept-claims filter
// import the SAME closed set — the 4-vs-3 fracture (system prompt authorized a 4th label the filter
// dropped silently) is structurally closed. Ruling + corpus counts recorded in analysis-labels.mjs.
import { ANALYSIS_LABELS, ANALYSIS_LABELS_BY_KEY } from "@/lib/agent/analysis-labels.mjs";
// SLOT ENFORCEMENT AT SYNTHESIS (C1, 2026-07-11): the synthesis prompt now injects the item_type's
// REQUIRED SLOTS for ALL 12 types (was: reg-family only in the static SYSTEM_PROMPT — the 7 non-reg
// types got zero slot language, so missing_required_slot was deterministic). Post-synthesis the brief
// is checked against the SAME slots (one corrective retry, then honest failure — never silent pass).
import { buildSlotDirective, uncoveredSlots, buildSlotRetryFeedback, slotCacheGet, slotCachePut } from "@/lib/agent/slot-prompt.mjs";
import { BROWSERLESS_FETCH_CONCURRENCY, PRIMARY_MAX_CHARS, CORROBORATOR_MAX_CHARS, SYNTH_INPUT_BUDGET_CHARS, SYNTH_PRIMARY_HARD_CEILING_CHARS, sonnetCostUsd, GROUND_MODEL } from "@/lib/agent/generation-config";
import { prepareSectionForGrounding } from "@/lib/agent/section-grounding.mjs";
import { partitionErrorBodies } from "@/lib/sources/entity-gate.mjs";
import { captureForStorage, apiEndpointFor } from "@/lib/sources/transport-escalation.mjs";
import { escalateToFetchResult } from "@/lib/sources/transport-runtime.mjs";
// TRANSPORT HOLD GATE + FETCH CACHE (C5, 2026-07-11). assertFetchAllowed gates the direct-HTTP + API-ladder
// transports (the two raw-fetch entry points that live here, not in a sources/ module) so "hold LIVE, zero
// fetches" is airtight across ALL FOUR transports (CODE-1 F-02). The url-canon-keyed, per-source-TTL cache
// (built in fetch-hold.mjs but never injected — CODE-1 F-03) is wired into buildLiveTransports so a
// re-ground / retry / refresh of the SAME url reads the cache instead of re-fetching (stops double-paying).
import { assertFetchAllowed, cacheGet as fetchCacheGet, cachePut as fetchCachePut } from "@/lib/sources/fetch-hold.mjs";
import { assertAcquireAllowed } from "@/lib/sources/acquire-lock.mjs";
import { holdingsPresent, holdingsPrecondition, HOLDINGS_PRESENT_DETAIL } from "@/lib/sources/holdings-gate.mjs";
import { checkBriefContent } from "@/lib/sources/fetch-quality";
import {
  toDbSeverity, toDbTheme, toThemeCandidate, assertDbValue,
  DB_PRIORITY_VALUES, DB_URGENCY_TIER_VALUES, DB_FORMAT_TYPE_VALUES, DB_SIGNAL_BAND_VALUES,
} from "@/lib/agent/metadata-vocab";
const cleanCtl = (s: string | null | undefined) => (s == null ? s : String(s).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, " "));
const urlsIn = (md: string) => [...new Set((String(md || "").match(/https?:\/\/[^\s)\]}"'<>]+/g) || []).map((u) => u.replace(/[.,;:]+$/, "")))];

// SLOT-TABLE reader with an in-process cache (C1). item_type_required_slots is 48 rows and changes only
// by an operator spec decision, so a per-generation table read is wasteful — cache per item_type with a
// TTL so a spec change still lands without a process restart. The read FAILS CLOSED: a slot-table read
// error returns null (the caller treats null as "enforce nothing this run" rather than fabricating an
// empty slot set — an empty [] would silently claim the item HAS no required slots, misrepresenting the
// contract; null keeps the reg-family SYSTEM_PROMPT slots as the standing floor and the DB gate as the
// backstop). GROUNDing already reads the same table independently (:1053); this is the synthesis-side read.
type SlotRow = { slot_key: string; description: string | null };
const SLOT_CACHE = new Map<string, { slots: SlotRow[]; fetchedAtMs: number }>();
async function requiredSlotsFor(sb: SupabaseClient, itemType: string): Promise<SlotRow[] | null> {
  const cached = slotCacheGet(SLOT_CACHE, itemType, Date.now());
  if (cached) return cached as SlotRow[];
  const { data, error } = await sb.from("item_type_required_slots").select("slot_key, description").eq("item_type", itemType);
  if (error) { console.warn(`[canonical] slot-table read failed for item_type ${itemType} (synthesis enforces reg-family SYSTEM_PROMPT slots + DB gate only this run): ${error.message}`); return null; }
  const slots = (data ?? []) as SlotRow[];
  slotCachePut(SLOT_CACHE, itemType, slots, Date.now());
  return slots;
}

function svc(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}
// ── FETCH TRANSPORTS (Part A — full download + no-silent-truncation) ──
interface FetchResult { text: string; truncated: boolean; fullLength: number; cap: number; transport: string }

// Direct-vs-render TRANSPORT ORDER is no longer decided here: it is the single home of
// transport-escalation.selectTransportOrder (RD-14), which the live ladder (escalateToFetchResult) consumes —
// direct-HTTP first for a static/legal host (free, full enacted text; PROVEN: EUR-Lex returns the full 458KB
// PPWR text this way), Browserless render for a JS/bot-walled host, either-direction try-both on a block. The
// prior DIRECT_FETCH_HOSTS/directFetchEligible pair (a SECOND transport-order home) was folded into that SSOT.
function htmlToText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
// DIRECT-HTTP transport. Pulls the full document (no Browserless) for an eligible host; reports truncation
// against `max` exactly as the Browserless path does. Throws on a non-OK status so the caller's fallback fires.
async function directFetchClean(url: string, max: number, caller: string | null = null): Promise<FetchResult> {
  assertFetchAllowed(url, process.env, caller); // TRANSPORT HOLD GATE (C5) — direct-HTTP transport; F16 caller thread (Unit 0c), default null = blocked
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; CarosLedge/1.0)" }, redirect: "follow", signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error(`direct fetch ${res.status}`);
  const u8 = new Uint8Array(await res.arrayBuffer());
  // PDF-or-HTML by header-or-magic-bytes (codec choice lives in pdf-extract.mjs, pure + unit-tested): a
  // reachable PDF (the GLEC S3 whitepaper; many wave sources) extracts to text via unpdf; everything else
  // strips as HTML. truncated/fullLength reported identically for both so the no-silent-truncation guard
  // fires the same on a capped PDF as on a capped page.
  if (classifyBody(res.headers.get("content-type"), u8) === "pdf") {
    const { text: pdfText, fullLength } = await pdfToText(u8, max);
    const text = (cleanCtl(pdfText) || "").replace(/\s+/g, " ").trim();
    return { text, truncated: fullLength > max, fullLength, cap: max, transport: "direct-pdf" };
  }
  // CHARSET-AWARE DECODE (non-EN extraction fix, 2026-07-14): decode with the response's declared charset
  // (header > <meta> > utf-8), NOT a hardcoded utf-8 — a Latin-1 gov page (planalto.gov.br, EU/LatAm gazettes)
  // decoded as utf-8 corrupts every accent to U+FFFD, leaving the grounder no matchable original-language span
  // (Brazil Lei 12.305: 55 FACT -> 2 GAP). The transport HTML path is the single decode site for raw bytes.
  const full = htmlToText(decodeHtmlBytes(u8, res.headers.get("content-type")).text);
  const text = (cleanCtl(full.slice(0, max)) || "").replace(/\s+/g, " ").trim();
  return { text, truncated: full.length > max, fullLength: full.length, cap: max, transport: "direct" };
}
// API TRANSPORT (RD-14 ladder step d): federalregister.gov + eCFR expose OFFICIAL JSON/XML APIs; the HTML page
// returns "Request Access" to scrapers, so an API host MUST route to its API, never the HTML. Plain HTTP (these
// APIs are open, not bot-walled — same category as directFetchClean, no Browserless unit). Returns null when no
// document-specific endpoint can be derived from the URL, so the ladder falls through to the HTML transports
// (which for these hosts hold — the honest exhaustion path, not a silent success on a wall).
async function apiFetchForHost(url: string, max: number, caller: string | null = null): Promise<{ status: number; text: string; truncated: boolean; fullLength: number; cap: number } | null> {
  const apiBase = apiEndpointFor(url);
  if (!apiBase) return null;
  assertFetchAllowed(url, process.env, caller); // TRANSPORT HOLD GATE (C5) — API transport (ladder); F16 caller thread (Unit 0c), default null = blocked
  const ua = { "user-agent": "Mozilla/5.0 (compatible; CarosLedge/1.0)" };
  const clip = (full: string) => { const t = (cleanCtl(full) || "").replace(/\s+/g, " ").trim().slice(0, max); return { status: 200, text: t.length > 200 ? t : "", truncated: full.length > max, fullLength: full.length, cap: max }; };
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (/(^|\.)federalregister\.gov$/.test(host)) {
      // /documents/YYYY/MM/DD/{DOC_NUMBER}/slug → /api/v1/documents/{DOC_NUMBER}.json → its raw_text_url.
      const segs = u.pathname.split("/").filter(Boolean);
      const i = segs.indexOf("documents");
      const docNum = i >= 0 && segs.length > i + 4 ? segs[i + 4] : null;
      if (!docNum) return null;
      const jr = await fetch(`${apiBase}/documents/${encodeURIComponent(docNum)}.json?fields[]=title&fields[]=abstract&fields[]=raw_text_url`, { headers: ua, redirect: "follow", signal: AbortSignal.timeout(25000) });
      if (!jr.ok) return { status: jr.status, text: "", truncated: false, fullLength: 0, cap: max };
      const doc = (await jr.json()) as { title?: string; abstract?: string; raw_text_url?: string };
      if (doc.raw_text_url) {
        try {
          const tr = await fetch(doc.raw_text_url, { headers: ua, redirect: "follow", signal: AbortSignal.timeout(25000) });
          if (tr.ok) { const c = clip(htmlToText(await tr.text())); if (c.text) return c; }
        } catch { /* fall through to the title+abstract summary (still official content) */ }
      }
      const summary = [doc.title, doc.abstract].filter(Boolean).join(". ").trim();
      return { status: 200, text: summary.length > 200 ? summary.slice(0, max) : "", truncated: false, fullLength: summary.length, cap: max };
    }
    if (/(^|\.)ecfr\.gov$/.test(host)) {
      // eCFR versioner: full title XML as of a concrete date. /on/YYYY-MM-DD/title-N/... carries the date; a
      // bare /current/title-N/... has no versioner date → return null (HTML holds; seek-more at hold-lift).
      const titleM = u.pathname.match(/title-(\d+)/);
      const dateM = u.pathname.match(/\/on\/(\d{4}-\d{2}-\d{2})\//);
      if (!titleM || !dateM) return null;
      const xr = await fetch(`${apiBase}/versioner/v1/full/${dateM[1]}/title-${titleM[1]}.xml`, { headers: ua, redirect: "follow", signal: AbortSignal.timeout(25000) });
      if (!xr.ok) return { status: xr.status, text: "", truncated: false, fullLength: 0, cap: max };
      return clip(htmlToText(await xr.text()));
    }
    return null;
  } catch { return null; }
}

// THE ONE transport primitive — now the LIVE binding of the per-failure-class ESCALATION LADDER (RD-14). It
// delegates to escalateToFetchResult (transport-runtime.mjs → escalateFetch), so the live path routes PER CLASS
// exactly as the tested ladder: API hosts → API transport; JS-shell/soft-404 → Browserless render; block/bot-
// wall on one transport → try the OTHER (either direction, on the 403 class not only cdn_block); a genuine
// 404/410 → a seek-more task (never a stored body); exhaustion → NO_REACHABLE_SOURCE hold. Both the corroborator
// fetcher (fetchMeta) and the primary fetcher (blFetchClean) delegate here, so the transport rule lives in ONE
// place AND the "is this usable" decision is now the ladder classifier's (transport-escalation) single home — no
// more bare detectRoadblock on the primitive (the fold that eliminates the 600-vs-2500 two-detector leak).
//   - dropIfBlocked: a corroborator DROPS a non-content outcome (never pollute the pool with a block/404 body);
//     the primary KEEPS the terminal failure body (as content-shaped text) ONLY so fetchPrimaryWithFallback's
//     detectRoadblock re-derives the reason (cdn_block / soft_404 / ...) and runs the official-alternative
//     search — the error body is never STORED (captureForStorage gates the INSERT) and the ladder decided it.
//   - PDF fast-path is preserved: Browserless renders a PDF as an empty viewer shell, so a .pdf URL byte-fetches
//     + extracts directly (directFetchClean also detects PDF-by-content-type, covering non-.pdf PDF URLs).
// THE LIVE TRANSPORT BINDINGS for the RD-14 escalation ladder — the SINGLE HOME of the direct / render / api
// transport closures. fetchWithTransport consumes this, AND the one-time hold-lift BATCH-1 re-collection runner
// injects the SAME object into the escalation ladder (transport-runtime → escalateFetch), so the batch-1 fetch
// routes through the exact same live ladder the pipeline uses — the transports cannot diverge into aligned copies (the D1/D3
// class the codebase kills). Every render goes through browserlessFetch (the hold-gated single fetch home), so
// the batch-1 runner inherits the scrape-hold gate for free. Pure factory; `max` is the char cap.
// PROCESS-SCOPED FETCH CACHE (C5). A module-scoped Map keyed on canonical URL (fetch-hold.mjs owns the
// key + per-source TTL). Process-scoped is correct for the batch runners (one process per pass) and
// harmless on the serverless route path (a cold Map per invocation = a no-op, never a stale cross-request
// read). A ground/retry/refresh-primary of the SAME url within its host TTL reads this instead of paying
// for a second fetch — the F-03 "cache built, never injected" gap closed. Only REAL content is cached
// (>200ch, the same usability floor the pool uses) so an error/empty result never poisons a later real fetch.
const FETCH_CACHE = new Map<string, { url: string; payload: unknown; fetchedAtMs: number }>();
export function buildLiveTransports(max: number, caller: string | null = null) {
  // F16 CALLER CONVERGENCE (Unit 0c): the caller captured HERE flows into all three transport closures →
  // the three assertFetchAllowed gate sites (direct / browserless / api). Default null = fail-closed, so
  // the batch-1 seek-more runner (which injects buildLiveTransports(max) with no caller) stays blocked.
  const cachePutIfContent = (u: string, payload: { text?: string }) => {
    if (payload && typeof payload.text === "string" && payload.text.length > 200) fetchCachePut(FETCH_CACHE, u, payload, Date.now());
  };
  const directFetch = async (u: string) => {
    try { const d = await directFetchClean(u, max, caller); const p = { status: 200, text: d.text, truncated: d.truncated, fullLength: d.fullLength, cap: d.cap }; cachePutIfContent(u, p); return p; }
    catch (e) { const m = String((e as Error)?.message || "").match(/direct fetch (\d+)/); return { status: m ? Number(m[1]) : 0, text: "" }; }
  };
  const browserlessRender = async (u: string) => {
    try {
      const r = await browserlessFetch(u, { maxTextLength: max, caller });
      const text = (cleanCtl(r.text) || "").replace(/\s+/g, " ").trim();
      const p = { status: 200, text, truncated: !!r.truncated, fullLength: r.fullTextLength ?? text.length, cap: max };
      cachePutIfContent(u, p);
      return p;
    } catch { return { status: 0, text: "" }; }
  };
  const apiFetch = async (u: string) => { const r = await apiFetchForHost(u, max, caller); if (r) cachePutIfContent(u, r); return r; };
  return {
    // CACHE-FIRST (RD-11 seam): escalateFetch tries cacheGet before any transport — a fresh hit prevents
    // the duplicate fetch. Returns the stored RICH payload (truncation metadata preserved) or null.
    cacheGet: (u: string) => { const e = fetchCacheGet(FETCH_CACHE, u, Date.now()); return e ? (e.payload as { text?: string }) : null; },
    apiFetch,
    directFetch,
    browserlessRender,
    seekMore: async (u: string) => ({ kind: "seek_more_alternate_url", url: u }),
  };
}

/** Test-only: clear the process fetch cache between cases (never used in prod). */
export function __clearFetchCacheForTest() { FETCH_CACHE.clear(); }

async function fetchWithTransport(url: string, max: number, { dropIfBlocked = false }: { dropIfBlocked?: boolean } = {}, caller: string | null = null): Promise<FetchResult> {
  if (looksLikePdfUrl(url)) {
    try { const d = await directFetchClean(url, max, caller); if (d.text.length > 200 && !detectRoadblock(d.text).roadblocked) return d; } catch { /* not a usable PDF — fall through to the ladder */ }
  }
  const v = await escalateToFetchResult(url, max, buildLiveTransports(max, caller));
  if (v.outcome === "content") {
    return { text: v.text, truncated: v.truncated, fullLength: v.fullLength, cap: v.cap, transport: v.transport };
  }
  // NON-content (seek_more / no_reachable_source). A corroborator drops it; the primary keeps the terminal
  // failure body so its detectRoadblock re-derives the roadblock reason and the alternative-search fires.
  if (dropIfBlocked) return { text: "", truncated: false, fullLength: 0, cap: max, transport: "none" };
  const carried = v.lastFailureText || "";
  return { text: carried, truncated: false, fullLength: carried.length, cap: max, transport: v.reason || "none" };
}
// Corroborator / ground fetcher: drop a still-blocked result (a failed corroborator is dropped, not fatal,
// and a block page must never enter the pool).
async function fetchMeta(url: string, max: number, caller: string | null = null): Promise<FetchResult> {
  return fetchWithTransport(url, max, { dropIfBlocked: true }, caller);
}
async function fetchText(url: string, max = 40000, caller: string | null = null): Promise<string> {
  return (await fetchMeta(url, max, caller)).text;
}

// NO SILENT TRUNCATION (the must): when a fetch/read hit its cap and did NOT collect the whole document,
// surface it — one integrity_flags coverage_gap row naming each capped source (url, collected vs full
// length, cap, transport) PLUS a stderr warn. The operator is told WHAT was not collected and WHY; a
// partial collect can never again be invisible. Best-effort — the warn is the floor if the insert fails.
interface TruncEvent { url: string; collected: number; fullLength: number; cap: number; transport: string }
async function recordTruncation(sb: SupabaseClient, itemId: string, events: TruncEvent[]): Promise<void> {
  if (!events.length) return;
  // Announce EVERYTHING (no silent truncation) via warn — the floor, always.
  for (const e of events) console.warn(`[truncation-guard] item ${itemId}: ${e.url} — collected ${e.collected}/${e.fullLength} chars (cap ${e.cap}; ${e.transport})`);
  // integrity_flags (the operator queue) ONLY for a genuine coverage gap: a DOWNLOAD that exceeded its cap
  // ("notify on download" — operator's literal must), or the PRIMARY itself trimmed for synthesis (the law
  // did not fully fit → chunking case). A CORROBORATOR trimmed by the synthesis budget is EXPECTED operation
  // (corroborators share the remainder after the full primary) — warned above, never flagged, so the queue
  // carries real gaps, not a flag on every multi-source brief.
  const flagEvents = events.filter((e) => !e.transport.startsWith("synthesis-budget") || e.transport === "synthesis-budget(primary)");
  if (!flagEvents.length) return;
  const lines = flagEvents.map((e) => `${e.url} — collected ${e.collected}/${e.fullLength} chars (cap ${e.cap}; ${e.transport})`);
  try {
    await sb.from("integrity_flags").insert({
      category: "coverage_gap", subject_type: "item", subject_ref: itemId,
      description: `Source NOT fully collected for ${flagEvents.length} source(s) — the download exceeded its cap: ${lines.join("; ")}`.slice(0, 480),
      recommended_actions: flagEvents.map((e) => ({ action: "raise_cap_or_chunk", rationale: `${e.url}: collected ${e.collected}/${e.fullLength} chars (cap ${e.cap}, ${e.transport})` })),
      status: "open", created_by: "truncation-guard",
    });
  } catch { /* best-effort; the warn above is the floor */ }
}

// WRITE-SIDE ERROR-BODY CAPTURE GATE (RD-14, the class kill): surface captures EXCLUDED from storage as
// failed fetches (bot wall / 403 / 404 / Request-Access wall / nav shell / JS shell). The complement to
// RD-13's READ-side gate — an error body is never STORED into agent_run_searches in the first place, so the
// junk-pool cannot form. Excluded captures are SURFACED (a source_issue integrity_flag naming the failed-fetch
// URLs for re-fetch at hold-lift), never silently dropped. Best-effort — the warn is the floor.
async function surfaceCaptureExclusions(sb: SupabaseClient, itemId: string, excluded: Array<{ url?: string; text: string }>): Promise<void> {
  if (!excluded.length) return;
  for (const e of excluded) console.warn(`[error-body-gate:write] item ${itemId}: refused to STORE a failed-fetch capture — ${e.url ?? "(no url)"}`);
  try {
    await sb.from("integrity_flags").insert({
      category: "source_issue", subject_type: "item", subject_ref: itemId, status: "open", created_by: "error-body-gate-write",
      description: `${excluded.length} fetched capture(s) refused at STORE time as failed fetches (bot wall / 403 / 404 / Request-Access / nav shell): ${excluded.map((e) => e.url).filter(Boolean).slice(0, 6).join("; ")}`.slice(0, 480),
      recommended_actions: excluded.slice(0, 8).map((e) => ({ action: "refetch_source", rationale: `${e.url ?? "(no url)"}: capture was a failed fetch — re-fetch the real source at hold-lift (transport escalation), then re-ground` })),
    });
  } catch { /* best-effort; the warn above is the floor */ }
}

// Ruling-5 (span-attribution unit, 2026-07-03): surface FACT spans that ground to an UNREGISTERED host
// (null tier even after floor-first re-attribution) as ONE host-aggregated integrity_flag per host. Read-
// modify-write: merge THIS item's contribution into the open flag for the host (idempotent per item), so
// the flag accumulates item/fact counts across grounding runs — the self-surfacing signal that names the
// next host to register (how lovdata.no would have been found mechanically). Best-effort: never fails
// grounding. subject_ref = host is the aggregation key; verifyCandidate consumes these at hold-lift.
async function surfaceNullTierHosts(
  sb: SupabaseClient,
  itemId: string,
  hosts: Map<string, { factCount: number; samples: string[] }>,
): Promise<void> {
  for (const [host, contribution] of hosts) {
    try {
      const { data: existing } = await sb.from("integrity_flags")
        .select("id, recommended_actions")
        .eq("created_by", "null-tier-host").eq("subject_ref", host).eq("status", "open")
        .limit(1).maybeSingle();
      const prior = (existing?.recommended_actions as { aggregate?: { perItemFacts: Record<string, number>; sampleSpans: string[] } }[] | null)?.[0]?.aggregate ?? null;
      const agg = mergeNullTierAggregate(prior, itemId, contribution);
      const { itemCount, factCount, description } = summarizeNullTierAggregate(host, agg);
      const row = {
        category: "source_issue", subject_type: "source", subject_ref: host,
        description: description.slice(0, 480),
        recommended_actions: [{
          action: "register_source",
          rationale: `Register ${host} at its canonical institutional tier; ${factCount} FACT span(s) across ${itemCount} item(s) currently wall on fact_below_authority_floor because the host is unregistered.`,
          aggregate: agg, sample_spans: agg.sampleSpans,
        }],
        status: "open", created_by: "null-tier-host",
      };
      if (existing?.id) await sb.from("integrity_flags").update(row).eq("id", existing.id);
      else await sb.from("integrity_flags").insert(row);
    } catch { /* best-effort; the null-tier stamp on the claim is the durable floor */ }
  }
}

// PAGINATED registry read → resolver. The registry EXCEEDS the 1000-row PostgREST cap, so a single
// unpaginated read silently drops sources past row 1000 — a floor source in the dropped page would resolve
// to NULL tier and be mis-seen as sub-floor (mis-ordered by the truncation moat AND missed by the
// floor-first re-attribution). Read ALL pages. Returns null on a page-read error so the caller can decide
// fail-open (synthesis ordering) vs fail-closed (grounding stamp).
async function readAllSourcesForResolver(sb: SupabaseClient): Promise<SourceRow[] | null> {
  const all: SourceRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("sources").select("id, url, base_tier, tier_override, status").order("id").range(from, from + 999);
    if (error) return null;
    if (!data?.length) break;
    all.push(...(data as SourceRow[]));
    if (data.length < 1000) break;
  }
  return all;
}

// Attach each fetched source's canonical institutional tier (base_tier via buildResolver — the moat
// resolver, base_tier ONLY). Reuses a caller-supplied resolver when given (grounding shares the SAME
// paginated fail-closed resolver it stamps with, so the truncation window, the floor-first re-attribution,
// and the stamp all agree); otherwise builds one from a best-effort paginated read (synthesis path —
// unresolved → tier null degrades ordering, never a false stamp).
async function attachTiers(
  sb: SupabaseClient,
  fetched: { url: string; text: string }[],
  resolver?: Resolver,
): Promise<{ url: string; text: string; tier: number | null }[]> {
  const r = resolver ?? buildResolver((await readAllSourcesForResolver(sb)) ?? []);
  return fetched.map((f) => ({ ...f, tier: r.resolveSpan(f.url).tier }));
}
// Browserless enforces a hard concurrency cap (5 on the current plan). The pool fetch fired ~7
// sessions per item via Promise.all, and N concurrent batch shards multiplied that — exceeding the cap
// so Browserless REJECTED most fetches (counted as "no fetchable content", not actually unfetchable).
// Bound concurrent fetches so (shards x FETCH_CONCURRENCY) stays under the cap. Tune via the
// generation-config knob (rule 017: tuning knobs are named constants, not inline process.env).
const FETCH_CONCURRENCY = BROWSERLESS_FETCH_CONCURRENCY;
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let i = 0;
  async function worker() { while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]); } }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}
// TELEMETRY LEDGER (span-attribution unit 4f). Module-scoped token accumulator: every Sonnet call on this
// path (grounding callSonnet + synthesis generateBriefText's streamMessagesText) adds its usage here. The
// stored-path entry points RESET it at start and read it at end (takeUsageLedger) to attach real spend to
// their StepResult, which the runner logs to agent_runs.cost_usd_estimated — no DDL, no more $0 stored path.
// SEQUENTIAL-ONLY: the ledger is per-process; correct for the stored-path runner (one item at a time). The
// route path (generate-brief workflow) writes its own agent_runs row and does NOT call takeUsageLedger, so
// this never double-counts there.
let usageLedger = { inputTokens: 0, outputTokens: 0, calls: 0 };
function addUsage(u: { input_tokens?: number; output_tokens?: number } | undefined): void {
  if (!u) return;
  usageLedger.inputTokens += u.input_tokens || 0;
  usageLedger.outputTokens += u.output_tokens || 0;
  usageLedger.calls += 1;
}
function resetUsageLedger(): void { usageLedger = { inputTokens: 0, outputTokens: 0, calls: 0 }; }
export interface UsageTelemetry { inputTokens: number; outputTokens: number; calls: number; costUsd: number }
function takeUsageLedger(): UsageTelemetry {
  const l = usageLedger;
  return { inputTokens: l.inputTokens, outputTokens: l.outputTokens, calls: l.calls, costUsd: sonnetCostUsd(l.inputTokens, l.outputTokens) };
}
// Reset the ledger, run a stored-path step, attach the step's real usage to its StepResult (every return
// path). The caller sums usage across the steps it invokes to write ONE agent_runs cost row per item.
async function withTelemetry(fn: () => Promise<StepResult>): Promise<StepResult> {
  resetUsageLedger();
  const r = await fn();
  return { ...r, usage: takeUsageLedger() };
}

// TELEMETRY SINK (span-attribution unit 4f) — COST ZEROED (Phase-3a double-count fix, DEEP-AUDIT S3
// §3 C4): since the 2026-07-06 per-call telemetry, EVERY model call already writes its real cost as a
// fetch_method='spend-call' row inside the spend client. Writing the summed usage cost HERE TOO made
// the daily cap + MTD tile count the same dollars twice. This row remains as the per-item STATUS audit
// trail (token detail preserved in errors[].telemetry); its cost_usd_estimated is now 0 — the
// spend-call rows are the single cost ledger. Best-effort: a telemetry-write failure must not fail the
// recovery; it returns ok:false for the caller to log.
export async function logStoredPathRun(
  itemId: string,
  usage: { inputTokens: number; outputTokens: number; calls: number; costUsd: number },
  status: "success" | "error",
  sourceUrl?: string | null,
): Promise<{ ok: boolean; detail: string }> {
  const sb = svc();
  try {
    const nowIso = new Date().toISOString();
    const { error } = await sb.from("agent_runs").insert({
      intelligence_item_id: itemId, source_url: sourceUrl ?? null, fetch_method: "stored-pool",
      started_at: nowIso, ended_at: nowIso, status,
      cost_usd_estimated: 0, // spend-call rows carry the real cost (double-count fix); status row only
      errors: [{ telemetry: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, sonnet_calls: usage.calls, costUsdInformational: Number(usage.costUsd.toFixed(6)) } }],
    });
    if (error) return { ok: false, detail: `agent_runs insert failed: ${error.message}` };
    return { ok: true, detail: `status row logged; real cost $${usage.costUsd.toFixed(4)} already ledgered per-call (${usage.inputTokens}in/${usage.outputTokens}out, ${usage.calls} calls)` };
  } catch (e) { return { ok: false, detail: `agent_runs insert threw: ${(e as Error).message}` }; }
}

// Full-grounding model default = the GROUND_MODEL knob (generation-config, rule 017) — the Segment-0 A/B verdict
// flips it before coverage-floor scales the per-item price. Delta/change-review + classify stay Haiku.
async function callSonnet(system: string, user: string, cachedPool?: string, model: string = GROUND_MODEL): Promise<string> {
  // max_tokens 32000 (was 24000): the largest regs (CSRD, EU-ETS-maritime-class) overran 24000 — the
  // trailing Claim Provenance Ledger + YAML (and thus the 18-field metadata) are the FIRST casualties of
  // truncation, so a too-tight cap surfaced as an obscure "YAML frontmatter not found" parse failure that
  // quarantined the item. The cap is a CEILING not a target (the model stops at end_turn when done), so
  // normal-size briefs are unaffected; only the genuinely huge regs use the headroom.
  // STREAMING (not a buffered POST): a non-streaming large completion HANGS on some network paths — the
  // socket idles for the full multi-minute generation and never resolves (proven 2026-06-19; the identical
  // stream:true call completed). Streaming keeps the socket alive (so the larger cap is viable), bounds on
  // NO-PROGRESS, and preserves anthropicError classification end-to-end (out-of-credits HALT unchanged).
  // PROMPT-CACHE (Phase-3a): when a pool is supplied it becomes the FIRST system block with a
  // cache_control breakpoint (prompt-cache.mjs), so re-ground / retry / slot-forcing calls over the
  // same pool read the cached prefix at 0.1× instead of re-paying full input rate.
  const { text, stopReason, usage } = await spendStreamRaw({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    body: {
      model,
      max_tokens: 32000,
      system: cachedPool ? cachedSystemBlocks(cachedPool, system) : system,
      messages: [{ role: "user", content: user }],
    },
  });
  addUsage(usage);
  // DETERMINISTIC truncation signal (content-class, fatal=false → per-item failure, not a batch halt). This
  // path is now the GROUNDING ledger-extraction call only (generation uses generateBriefText's 2-pass); a
  // truncated ledger means too many claims for one call — a per-item failure, not an obscure parse crash.
  if (stopReason === "max_tokens") {
    const e = new Error("ANTHROPIC output truncated at max_tokens (32000).") as Error & { fatal?: boolean };
    e.fatal = false;
    throw e;
  }
  return text;
}

/** Reactive 2-pass brief generation — orchestration in two-pass-generate.mjs (unit-tested via DI). Binds
 *  the real deps (streaming + YAML-locate). DEFAULT one call (body + New Sources + YAML, NO ledger); splits
 *  to body-then-YAML ONLY on stop_reason truncation, so the body comes out whole and normal briefs stay 1
 *  call. */
async function generateBriefText(system: string, user: string, cachedPool?: string): Promise<string> {
  // Route every stream call twoPassGenerate makes (1 normal, 2 on truncation split) through the spend client
  // (spendStreamRaw = ticket-gated + ceiling-enforced + accounted) AND meter it into the stored-path ledger.
  const meteredStream: typeof streamMessagesText = async (opts) => {
    const r = await spendStreamRaw(opts);
    addUsage(r.usage);
    return r;
  };
  // PROMPT-CACHE (Phase-3a): pool as the cached first system block. twoPassGenerate passes `system`
  // through to the Messages body verbatim, so the block array flows unchanged — and the truncation
  // split's pass-1/pass-2 calls share the cached prefix (a guaranteed hit class).
  const systemArg = cachedPool ? cachedSystemBlocks(cachedPool, system) : system;
  return twoPassGenerate({ system: systemArg, user, stream: meteredStream, findYaml: findYamlBlock, apiKey: process.env.ANTHROPIC_API_KEY! });
}

// Sonnet WITH the server-side web_search tool — routed through the spend client (spendSearch owns the
// web_search body/beta wiring + the ticket/ceiling guard). Used for source discovery.
async function callSonnetSearch(system: string, user: string, maxUses = 6): Promise<string> {
  return spendSearch({ system, user, maxUses });
}

export interface Corroborator { name: string; url: string; type?: string; why: string }

/** DEEP DIVE step 1: web_search for authoritative corroborating/expanding sources for THIS item —
 *  official pages, academic institutions, named participants/partners, reputable trade press. Returns
 *  real reachable URLs only (from the search results). This is the auto-discovery that replaces the
 *  hand-listed source set in jolt-exemplar-regen.mjs. Never invents URLs; on any failure returns []. */
export async function discoverCorroborators(title: string, primaryUrl: string, primaryText: string): Promise<Corroborator[]> {
  const system = `You research corroborating and expanding sources for a freight-sustainability intelligence brief.
Use web_search to find AUTHORITATIVE sources that corroborate, expand, or add current status/detail to the topic:
official / regulator pages, academic institutions, named participants or consortium partners, and reputable trade press.
Return STRICT JSON ONLY (no prose, no code fences):
{"sources":[{"name":"...","url":"https://...","type":"official|academic|trade_press|participant|standards|aggregator","why":"<=160 chars"}]}
Rules: up to 6 sources; REAL reachable URLs only, taken from your search results — NEVER invent a URL; prefer
primary/authoritative over blogs; a deeper page on the primary's own domain is allowed when it adds material.`;
  const user = `Topic / item title: "${title}"
Primary source: ${primaryUrl}
Primary source extract (may be thin — that is exactly why you must search):
${(primaryText || "").slice(0, 3000)}

Search the web and return the JSON list of corroborating / expanding sources.`;
  let txt: string;
  try { txt = await callSonnetSearch(system, user, 6); } catch { return []; }
  const m = txt.match(/\{[\s\S]*\}/);
  if (!m) return [];
  try {
    const o = JSON.parse(m[0]) as { sources?: Array<Record<string, unknown>> };
    const out: Corroborator[] = [];
    const seen = new Set<string>();
    for (const s of o.sources ?? []) {
      const url = typeof s.url === "string" ? s.url.trim() : "";
      const name = typeof s.name === "string" ? s.name.trim() : "";
      if (!name || !/^https?:\/\//i.test(url) || seen.has(url.toLowerCase())) continue;
      seen.add(url.toLowerCase());
      out.push({ name, url, type: typeof s.type === "string" ? s.type : undefined, why: typeof s.why === "string" ? s.why.slice(0, 160) : "" });
      if (out.length >= 6) break;
    }
    return out;
  } catch { return []; }
}

// web_search for the OFFICIAL alternative when a declared primary roadblocks. Aims at the issuer's OWN
// English page / authoritative text (EUR-Lex EN, a regulator's .gov/.go.jp/.gov.in English page, an
// official press release) — NEVER a summary, explainer, news, or commentary (a summary resolves
// sub-floor anyway; the per-type floor enforces qualification regardless of what this returns).
// (The title-only `webSearchAlternatives` shadow was RETIRED 2026-07-14 — folded into the ONE discovery
//  home `generateCandidates`, whose `webSearch` rung is the query-shaped `webSearchCandidatesForQuery`
//  below. Two search mechanisms with the inferior one live was the shadow-capability / one-home violation.)

// QUERY-SHAPED official-source web search for the seek-more candidate fallback. generateCandidates
// (seek-more.mjs) runs its deterministic identifier resolvers FIRST (CELEX/ELI/UK-SI/lovdata/gazette/API — no
// spend); only when those yield nothing does it call this open-web fallback with a free-text query. Reuses
// callSonnetSearch → spendSearch (THE spend chokepoint), so the candidate search is ticketed + budget-gated
// like every other model call. Returns official issuer URLs, [] on failure. Never invents URLs.
export async function webSearchCandidatesForQuery(query: string): Promise<string[]> {
  const system = `You locate the OFFICIAL PRIMARY legislation / issuer page for a freight-sustainability instrument. You return ONLY the issuer's own authoritative pages (the regulator / ministry / official body / gazette), in English where an official English version exists. You NEVER return summaries, law-firm explainers, news articles, blogs, or third-party commentary.`;
  const user = `Find the OFFICIAL issuer page(s) carrying the authoritative text for: ${query}. Search the web and return STRICT JSON { "urls": ["..."] } of up to 5 official-source URLs, most authoritative first. Real reachable URLs taken from your search results only — NEVER invent a URL.`;
  let txt: string;
  try { txt = await callSonnetSearch(system, user, 4); } catch { return []; }
  return [...new Set((txt.match(/https?:\/\/[^\s)\]}"'<>]+/g) || []).map((u) => u.replace(/[.,;:]+$/, "")))];
}

// PRIMARY fetcher (injected into fetchPrimaryWithFallback). Delegates to the ONE transport primitive
// (direct-eligible-first -> Browserless -> try-both plain fallback). KEEPS a still-blocked result (does NOT
// drop) so fetchPrimaryWithFallback's detectRoadblock sees the reason (cdn_block / soft_404 / ...) and runs
// the official-alternative web search. Reports truncation up via the FetchResult.
// F16 CALLER THREAD (Unit 0c): built per-call as a closure over `caller` (see fetchPrimaryDeep) so the
// signed caller reaches the transport; fetchPrimaryWithFallback stays UNTOUCHED (it calls the injected
// closure, which already carries the caller — no threading through primary-fallback.mjs).
const blFetchCleanFor = (caller: string | null) => async (url: string): Promise<FetchResult> => fetchWithTransport(url, PRIMARY_MAX_CHARS, {}, caller);

/** Canonical primary fetch with the roadblock→bounded-alternative-search capability bound to the real
 *  deps (Browserless + official-alternative web_search). BOTH generateBrief and phase2-reground call this
 *  so they inherit the fallback uniformly. Returns usable content + the full audit trail (discovery only —
 *  tier/floor qualification is unchanged downstream). */
export async function fetchPrimaryDeep(
  item: { title: string; primaryUrl: string; itemType: string; identifier?: string | null; canonicalKey?: string | null; jurisdiction?: string[] | string | null; instrumentType?: string | null },
  caller: string | null = null,
) {
  // DISCOVERY-FIRST, ONE HOME (operator CRITICAL DISPATCH + amendments, 2026-07-14): the injected
  // discoverCandidates IS seek-more's generateCandidates — the SINGLE discovery mechanism. It orders
  // identifier-DERIVED canonical URLs (CELEX/ELI → eur-lex enacted text, UK-SI, FR-by-doc, gazette) FIRST,
  // then the source's own search surface, then open-web search LAST (webSearchCandidatesForQuery folded in
  // as its `webSearch` rung). This WIRES the once-dormant discovery rung (seek-more had zero callers) into
  // the live reground/generate ladder AND retires the title-only webSearchAlternatives shadow — no parallel
  // second search mechanism (one-home).
  const discoverCandidates = () =>
    generateCandidates(
      {
        title: item.title, identifier: item.identifier ?? undefined, canonicalKey: item.canonicalKey ?? undefined,
        itemType: item.itemType, instrumentType: item.instrumentType ?? undefined,
        jurisdiction: (Array.isArray(item.jurisdiction) ? item.jurisdiction[0] : item.jurisdiction) ?? undefined,
        sourceUrl: item.primaryUrl,
      },
      { webSearch: (q: string) => webSearchCandidatesForQuery(q) },
    );
  return fetchPrimaryWithFallback(item, { browserlessFetch: blFetchCleanFor(caller), discoverCandidates, perFetchMs: 20000, maxAlts: 3 });
}

/** EARTH-EXHAUSTION durable record (operator CRITICAL DISPATCH 2026-07-14 — closes the split-wake): when
 *  discovery RAN and every candidate was EXHAUSTED (pf.ok=false after fellBack), persist the N×M attempt
 *  record so a subsequent hold/erase carries PROOF-OF-EXHAUSTION (RD-15 / earth-exhaustion-before-hold),
 *  not just an ephemeral in-memory `alternatives[]`. Only fires on genuine exhaustion (not on a healthy
 *  primary, not when an alternative won) — so the flag queue carries real "searched + exhausted" records.
 *  Best-effort: a write failure never blocks the pipeline. */
async function persistPrimaryExhaustion(sb: SupabaseClient, itemId: string, pf: { ok?: boolean; fellBack?: boolean; primaryReason?: string | null; alternatives?: Array<{ url?: string; len?: number; reason?: string | null; role?: string }> }): Promise<void> {
  if (pf.ok || !pf.fellBack) return; // only when discovery ran AND exhausted
  const record = (pf.alternatives ?? []).map((a) => ({
    url: a.url, transport: a.role === "declared_primary" ? "declared_primary" : "discovery_candidate",
    verdict: a.reason ?? "roadblocked", bytes: typeof a.len === "number" ? a.len : null,
    reason: a.reason ?? null, status: "exhausted",
  }));
  try {
    await persistExhaustionRecord(sb, itemId, record, { outcome: "no_reachable_source", holdReason: pf.primaryReason ?? null });
  } catch (e) { console.warn(`[canonical] exhaustion-record persist failed for ${itemId}: ${e instanceof Error ? e.message : String(e)}`); }
}

// item 5b (unreadable-source flag): map the transport's primary-fetch outcome to a sources.fetch_status
// value. A blocked primary (fell back to an alternative because the declared source was a cdn_block /
// soft_404 / challenge) marks the SOURCE unreadable so customer surfaces can gate its link; a readable
// primary marks it 'ok' (clearing a stale block). Ambiguous → leave unchanged.
function fetchStatusFromPf(pf: { fellBack?: boolean; primaryReason?: string | null; text?: string }): string | null {
  const reason = pf.primaryReason || null;
  if (pf.fellBack && reason) {
    if (reason === "cdn_block") return "cdn_block";
    if (reason === "soft_404") return "soft_404";
    return "blocked"; // challenge_stub / empty_stub / access-denied / etc.
  }
  if (!pf.fellBack && typeof pf.text === "string" && pf.text.length > 200) return "ok";
  return null;
}

// Write the source-level fetch outcome. Guarded + non-fatal, and BEHIND migration 147: until the
// fetch_status column exists the update errors and is swallowed (zero behaviour change pre-apply).
async function recordSourceFetchStatus(
  sb: SupabaseClient,
  sourceId: string | null | undefined,
  pf: { fellBack?: boolean; primaryReason?: string | null; text?: string }
): Promise<void> {
  if (!sourceId) return;
  const status = fetchStatusFromPf(pf);
  if (!status) return;
  await sb
    .from("sources")
    .update({ fetch_status: status, fetch_status_at: new Date().toISOString() })
    .eq("id", sourceId)
    .then(() => {}, () => {});
}

export interface SlotForcingResult { audit: unknown[]; relabelCandidates: { slot_key: string; section: string; reason: string }[]; judgeCalls: number; factsForced: number; gapsForced: number }
export interface StepResult { ok: boolean; detail: string; usage?: UsageTelemetry; slotForcing?: SlotForcingResult }

// Sentinel returned by generateBriefFromStored when no reusable pool exists. The cache-checked retry
// (Edit B) falls back to a fresh fetch ONLY on this exact signal — a synthesis failure on the cached
// path is retryable FROM CACHE (re-scraping it would defeat the persist-before-process protection), so
// the fallback must key on "no pool", not on any ok:false.
export const NO_STORED_POOL = "no usable stored pool (needs a fresh scrape)";

/** Synthesise the format-selected brief ACROSS a source pool and persist full_brief. SHARED by
 *  generateBrief (fresh-fetched pool) and generateBriefFromStored (saved pool) so the skill-bearing
 *  synthesis prompt lives in ONE place (no drift). Does NOT touch agent_run_searches — the caller owns
 *  the pool (fresh-fetch overwrites it; from-stored reuses it). */
async function synthesiseAndWriteBrief(
  sb: SupabaseClient,
  it: { id: string; title: string; item_type: string; source_id: string | null; source_url: string },
  fetched: { url: string; text: string }[],
  corroborators: Corroborator[],
): Promise<StepResult> {
  // SLOT ENFORCEMENT (C1): read the item_type's required slots (cached) so the SYNTHESIS prompt names them
  // for ALL 12 types — not just the reg family the static SYSTEM_PROMPT covers. null = read failed → keep
  // the standing SYSTEM_PROMPT reg-family floor + the DB gate as backstop (fail-closed, never fabricate []).
  const slotRows = await requiredSlotsFor(sb, it.item_type);
  const slotDirective = slotRows ? buildSlotDirective(slotRows) : "";
  // Part C: build synthesis blocks TIER-ORDERED under the input budget — the floor-qualifying source(s)
  // for this item_type reach the model in FULL (the moat), corroborators share the remainder lowest-tier-
  // first, and every trim/ceiling-wall is ANNOUNCED (no silent truncation). The SAME builder + tiers + budget
  // grounding uses → spans stay matchable.
  const withTier = await attachTiers(sb, fetched);
  const { blocks, trims, ceilingWalls } = buildSourceBlocks(withTier, SYNTH_INPUT_BUDGET_CHARS, {
    floorTier: authorityFloorFor(it.item_type),
    hardCeiling: SYNTH_PRIMARY_HARD_CEILING_CHARS,
  });
  await recordTruncation(sb, it.id, [...trims, ...ceilingWalls]);
  const discoveredHint = corroborators.length
    ? `\nCorroborating sources discovered for this item (cite the ones you actually use; list each under "## New Sources Identified" with a tier estimate + why it matters — these grow the source registry):\n${corroborators.map((c) => `- ${c.name} — ${c.url}${c.why ? " — " + c.why : ""}`).join("\n")}`
    : "";
  // FORMAT DETERMINISM (2026-06-09): the brief format is f(item_type) by contract (CLAUDE.md format
  // mapping), NOT an agent free-choice. The agent was emitting the wrong format (e.g. market_signal_brief
  // for a regulation/framework) → a market brief structurally has no reg slots → criterion-5
  // missing_required_slot fails every time → quarantine. Pin the format + its section set into the prompt
  // so the STRUCTURE is right (and override format_type post-parse so metadata cannot drift).
  const fmtSpec = specForItemType(it.item_type);
  const formatDirective = fmtSpec
    ? `\nFORMAT — MANDATORY, do NOT pick another: item_type "${it.item_type}" is a ${fmtSpec.formatType}. Emit exactly "format_type: ${fmtSpec.formatType}" in the YAML and structure the brief with ONLY this format's sections (omit-with-note any you cannot honestly ground; NEVER substitute another format's sections): ${fmtSpec.sections.map((s) => s.heading).join("; ")}.`
    : "";
  // Part D — coverage-forcing for the REGULATORY format only (qualification capture / per-year trajectory /
  // defined terms verbatim / legal line). Mirrors the env-policy SKILL.md + system-prompt contract; lands in
  // the same change as those (doctrine-with-mechanism). The pipeline now feeds the FULL enacted text, so the
  // instruction to READ ALL OF IT and capture qualifications is enforceable, not aspirational.
  const regCoverage = fmtSpec?.formatType === "regulatory_fact_document"
    ? `\nREGULATORY COMPLETENESS — you have the FULL enacted text below; READ ALL OF IT, not the opening. For EVERY requirement you state, capture its QUALIFICATIONS, not just the headline number/date:
- Exceptions / carve-outs / exemptions ("except …", "shall not apply to …") — each a verbatim FACT span.
- The CALCULATION BASIS and conditions (e.g. "calculated as an average per manufacturing plant and year" — a per-plant-per-year basis is NOT per-unit; state it as written).
- The DEFINED TERMS the requirement turns on — quote the regulation's OWN definitions article verbatim; never swap in a loose synonym.
- The PER-YEAR TRAJECTORY — when a threshold changes by date, state the WHOLE time series (e.g. a 2030 floor → a 2035 added requirement → a 2038 restriction/ban), not just the entry-year value; a date-conditioned trigger ("or N years from the implementing act, whichever is later") is part of the requirement.
A requirement stated with ZERO qualifications is a FLAG that you have not read far enough — return to the source text before asserting it.
LEGAL LINE — state what the text REQUIRES and whom it falls on AS DEFINED. Do NOT assert that the workspace (or any entity) IS a producer / importer / distributor / manufacturer, or that an obligation attaches: matching an entity to a defined role is a legal determination → route it to a "*Legal Confirmation Required:*" callout.`
    : "";
  // PROMPT-CACHE (Phase-3a): the pool no longer rides the END of this user message — it is the CACHED
  // first system block (cachedSystemBlocks via generateBriefText's third arg), so grounding / re-ground /
  // the two-pass split re-read it at 0.1× instead of re-paying the full input rate. The wording below says
  // "reference corpus" instead of "blocks below" because the pool now precedes these instructions.
  const user = `Generate the ${it.item_type} brief for: "${it.title}".${formatDirective}${regCoverage}${slotDirective}
Synthesise ACROSS ALL the SOURCE blocks in your reference corpus (the SOURCE CONTENT in your system context) — do NOT rely on the primary source alone; the corroborating sources carry detail (participants, phase, timing, operational specifics) the primary may lack. The corpus carries ${fetched.length} sources.
Apply the Forward-Intelligence Rule: for in-progress work surface design, participants/parties, current phase/status, and expected timing as first-class (these ARE the finding); a stated schedule is a FACT (cite it), otherwise emit a labeled "Analytical inference:" estimate; set severity MONITORING with a re-check window when the outcome is still pending.
Apply the No-Vacuum Rule: where the topic connects to a specific regulation, market signal, or operational decision, name and link it — that connection is direction, not decoration.
Ground every FACT claim's source_span as a VERBATIM substring of one of the SOURCE blocks in the reference corpus; set source_url to THAT block's url. HARD RULE: a FACT claim's source_url MUST be one of the SOURCE block urls actually provided in the corpus — never a URL you only saw while searching. A source you know of but that is NOT among the corpus blocks may be listed under "## New Sources Identified" as a lead for later retrieval, but MUST NOT be used as a FACT source_url or source_span; carry its content as a labeled "Analytical inference:" or omit it. Item source_id for the primary FACT source_id: ${it.source_id}.${discoveredHint}
VALIDATION DISCIPLINE — the brief is auto-validated and REJECTED (rolled back to quarantine) if violated. Before you finish, RE-READ the WHOLE brief and fix every instance — these two are the dominant rejection causes on long briefs:
- LABELING / binding verbs: every analytical, interpretive or forward-looking sentence MUST start with "Analytical inference:", "Industry interpretation:", or "Operational implication:". In particular ANY sentence using a binding-obligation verb (must, requires, mandates, obligates, prohibits, "applies to", shall) MUST EITHER (a) be a VERBATIM quote from a SOURCE block (so it grounds as a FACT) OR (b) begin with one of those labels. No unlabeled, unsourced "X must/requires Y" is allowed ANYWHERE — sweep every section, not just the first; this is the single most common long-brief rejection.
- URL discipline: every URL anywhere in the brief body MUST be EITHER (a) copied exactly from a SOURCE block url, OR (b) listed in your "## New Sources Identified" table. A URL that appears in prose but is in NEITHER place WILL REJECT the brief — grounding only recognises SOURCE-block urls and New-Sources-table urls. To reference a source you did not fetch, put it in the New Sources table; never drop a bare/known URL into prose, never invent a path, no markdown emphasis around URLs.
Follow your output contract exactly: brief body, then a "## New Sources Identified" table of the corroborating sources you used (if any), then the YAML frontmatter as the FINAL block. Do NOT emit a Claim Provenance Ledger — provenance is carried inline in the prose (labels + GAP statements); grounding extracts it downstream.`;
  // GENERATE + POST-SYNTHESIS SLOT CHECK + ONE CORRECTIVE RETRY (C1). The brief is checked against the
  // SAME required slots that were injected (uncoveredSlots = the grounding pre-gate heuristic, so synthesis
  // and grounding agree on "the prose speaks to this slot"). A brief that leaves a required slot completely
  // unaddressed is regenerated ONCE with explicit slot feedback appended; a second miss FAILS HONESTLY with
  // a named detail (missing_required_slot(synthesis)) — never a silent pass-through of a slot-blind brief.
  // A slot-table read failure (slotRows == null) skips the check this run (the DB gate remains the backstop).
  let parsed = parseAgentOutput(await generateBriefText(SYSTEM_PROMPT, user, blocks));
  let body = stripUrlMarkers((parsed.body || "").trim()) as string;
  if (slotRows && slotRows.length && body.length >= 600) {
    const missing = uncoveredSlots(body, slotRows);
    if (missing.length) {
      console.warn(`[canonical] item ${it.id}: synthesis left ${missing.length} required slot(s) unaddressed (${missing.map((s) => s.slot_key).join(", ")}) — one corrective retry`);
      const retryUser = `${user}${buildSlotRetryFeedback(missing)}`;
      parsed = parseAgentOutput(await generateBriefText(SYSTEM_PROMPT, retryUser, blocks));
      body = stripUrlMarkers((parsed.body || "").trim()) as string;
      const stillMissing = body.length >= 600 ? uncoveredSlots(body, slotRows) : missing;
      if (stillMissing.length) {
        return { ok: false, detail: `missing_required_slot(synthesis): after one corrective retry the brief still leaves ${stillMissing.length} required slot(s) unaddressed (${stillMissing.map((s) => s.slot_key).join(", ")})` };
      }
    }
  }
  if (body.length < 600) return { ok: false, detail: `parsed body too short (${body.length})` };
  // research-or-erase gate: a brief that reads as a fetch-failure explanation must NOT persist.
  const cc = checkBriefContent(body);
  if (!cc.ok) return { ok: false, detail: `brief_failure_gate: ${cc.reason}` };
  // Persist the FULL 13-field contract, not just the body. The agent emits the validated YAML metadata
  // (parseAgentOutput validates severity/format_type/topic_tags vocab); writing only full_brief left
  // format_type/severity/topic_tags/intersection fields stale — items re-grounded but stayed
  // non-conformant. (env-policy "every regeneration writes 13 fields".) last_regenerated_at is overridden
  // with REAL now (the agent's emitted timestamp is unreliable); UUID arrays are filtered to valid UUIDs.
  const md = parsed.metadata;
  // FORMAT DETERMINISM (cont.): force format_type to the canonical f(item_type) value regardless of what
  // the agent emitted — metadata must never drift from item_type (sectionBrief extracts by item_type, so a
  // mismatched format_type guaranteed criterion-5 failure). The prompt directive above makes the structure
  // comply; this makes the stored label match.
  if (fmtSpec) md.format_type = fmtSpec.formatType as typeof md.format_type;
  const nowIso = new Date().toISOString();
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const cleanUuids = (a: unknown) => (Array.isArray(a) ? a.filter((x) => typeof x === "string" && UUID.test(x)) : []);
  // Map/validate every CHECK-constrained field to its LIVE DB vocabulary BEFORE the write (metadata-vocab
  // is the single source of truth). severity: skill DISPLAY form ("MONITORING") -> db lowercase_underscore
  // ("monitoring") — this mismatch silently rejected the WHOLE update before. theme: gate to the live
  // /research vocab, else null (no force-fit; the dropped value is logged pending the Emergence-Capture
  // residual store). priority/urgency_tier/format_type/signal_band: defensive assert (the parser already
  // guarantees these against sets identical to the DB, so a throw here means parser/DB drift — fail LOUD,
  // named, not a silent whole-row reject).
  const dbSeverity = toDbSeverity(md.severity);
  const dbTheme = toDbTheme(md.theme);
  // capture-not-null (INV-1, migration 136): bank an out-of-vocab theme instead of dropping it.
  const themeCandidate = toThemeCandidate(md.theme);
  if (themeCandidate) console.warn(`[canonical-pipeline] theme "${themeCandidate}" out-of-vocab on item ${it.id} -> theme=null, banked in theme_candidate (Emergence-Capture residual)`);
  assertDbValue("priority", md.priority, DB_PRIORITY_VALUES, /*nullable*/ false);
  assertDbValue("urgency_tier", md.urgency_tier, DB_URGENCY_TIER_VALUES);
  assertDbValue("format_type", md.format_type, DB_FORMAT_TYPE_VALUES);
  assertDbValue("signal_band", md.signal_band, DB_SIGNAL_BAND_VALUES);
  const { error: writeErr } = await sb.from("intelligence_items").update({
    full_brief: cleanCtl(body),
    severity: dbSeverity, priority: md.priority, urgency_tier: md.urgency_tier,
    format_type: md.format_type, topic_tags: md.topic_tags,
    signal_band: md.signal_band, theme: dbTheme, theme_candidate: themeCandidate, trajectory_points: md.trajectory_points,
    what_it_changes: md.what_it_changes, does_not_resolve: md.does_not_resolve,
    conversion_trigger: md.conversion_trigger, cross_references: md.cross_references,
    operational_scenario_tags: md.operational_scenario_tags, compliance_object_tags: md.compliance_object_tags,
    intersection_summary: md.intersection_summary,
    sources_used: cleanUuids(md.sources_used), regeneration_skill_version: md.regeneration_skill_version,
    last_regenerated_at: nowIso, updated_at: nowIso,
  }).eq("id", it.id);
  // FAIL LOUD: the prior code dropped `error` here, so a CHECK violation rejected the ENTIRE update
  // (full_brief + all metadata) while the function still reported ok:true. Surface it with field context
  // so any future constraint mismatch self-identifies (CLAUDE.md error-swallow post-mortem; Emergence INV-3).
  if (writeErr) {
    return { ok: false, detail: `metadata_write_rejected: ${writeErr.message} (sev=${dbSeverity}, fmt=${md.format_type}, theme=${dbTheme ?? "null"}, prio=${md.priority})` };
  }
  // related_items is READ-DERIVED from item_cross_references (migration 146, Option A: related_items_derived()
  // + item_related_items_derived view — NO write-back trigger; the provenance guard stays untouched). Route the
  // agent's semantic intersections to edges (origin=agent_semantic), never to the column. FK-safe, never self.
  const relTargets = cleanUuids(md.related_items).filter((t) => t && t !== it.id);
  if (relTargets.length) {
    const { data: existing } = await sb.from("intelligence_items").select("id").in("id", relTargets);
    const valid = new Set((existing ?? []).map((x: { id: string }) => x.id));
    const edges = relTargets.filter((t) => valid.has(t)).map((t) => ({ source_item_id: it.id, target_item_id: t, relationship: "related", origin: "agent_semantic" }));
    if (edges.length) await sb.from("item_cross_references").upsert(edges, { onConflict: "source_item_id,target_item_id", ignoreDuplicates: true });
  }
  return { ok: true, detail: `brief ${body.length}ch + 19-field metadata (fmt=${md.format_type}, sev=${dbSeverity}) from ${fetched.length} sources` };
}

/** STEP generate — the DEEP DIVE (the only generator). Fetch the primary source, web_search for
 *  corroborating/expanding sources, fetch that multi-source pool, then synthesise the format-selected
 *  brief ACROSS the pool (system prompt selects by item_type; Forward-Intelligence + No-Vacuum apply).
 *  A thin primary source is the TRIGGER to research wider, never a reason to emit a thin brief. */
/** LIVE holdings for an item (the no-execution-from-stale-state fetch guard): the largest stored snapshot for
 *  the item's source (raw_fetches.html_bytes) + the count of content-bearing pool rows (agent_run_searches with
 *  result_content_excerpt > 200ch). Read FRESH at the fetch seam — never from a plan/manifest. */
async function holdingsForItem(sb: ReturnType<typeof svc>, itemId: string, sourceId: string | null): Promise<{ snapshotBytes: number; usablePoolRows: number }> {
  let snapshotBytes = 0;
  if (sourceId) {
    const { data: snaps } = await sb.from("raw_fetches").select("html_bytes").eq("source_id", sourceId).order("html_bytes", { ascending: false }).limit(1);
    snapshotBytes = Number(snaps?.[0]?.html_bytes ?? 0);
  }
  const { data: pool } = await sb.from("agent_run_searches").select("result_content_excerpt").eq("intelligence_item_id", itemId);
  const usablePoolRows = (pool ?? []).filter((r) => ((r as { result_content_excerpt?: string }).result_content_excerpt || "").length > 200).length;
  return { snapshotBytes, usablePoolRows };
}
export async function generateBrief(itemId: string, caller: string | null = null, opts: { forceRefresh?: boolean } = {}): Promise<StepResult> {
  const sb = svc();
  const { data: it, error: itErr } = await sb.from("intelligence_items").select("id, title, item_type, source_id, source_url, instrument_identifier, canonical_instrument_key, instrument_type, jurisdiction_iso").eq("id", itemId).single();
  if (itErr || !it) return { ok: false, detail: `item not found${itErr ? `: ${itErr.message}` : ""}` };
  // NO-EXECUTION-FROM-STALE-STATE (operator ruling 2026-07-14): this fetch function re-verifies its OWN
  // precondition against LIVE holdings as its first act — a manifest/dispatch that classified the item "needs
  // fetch" is a PROPOSAL, never authority. It REFUSES to fetch when usable holdings already exist (a real
  // snapshot OR >=2 content-bearing pool rows), regardless of caller, killing the fetch-when-held waste class
  // at the seam (o9: 76KB already held, re-fetched, bought nothing). `forceRefresh` is the single explicit
  // freshness escape (generateStep(refresh=true) / reresearch widen). The holdings posture is recorded on the
  // spend ticket (amendment 1) so an authorized-but-wasteful fetch is machine-visible at the moment of spend.
  const hold = await holdingsForItem(sb, itemId, it.source_id ?? null);
  if (!opts.forceRefresh && holdingsPresent(hold)) {
    return { ok: false, detail: `${HOLDINGS_PRESENT_DETAIL} (snapshot=${hold.snapshotBytes}B, pool=${hold.usablePoolRows})` };
  }
  // I1 (attribution) + amendment-1 precondition posture: every agent_runs spend row carries itemId + sourceId
  // AND the precondition this fetch passed (holdings-absence: confirmed_absent, or 'present' when forceRefresh
  // deliberately overrode). A paid fetch row lacking a precondition record is the new spend-watch alarm class.
  setSpendTicket({ purpose: "canonical:generate", itemId, sourceId: it.source_id ?? null, precondition: holdingsPrecondition(hold) });

  // 1. primary source — with the roadblock→bounded-alternative-search capability: a hanging / blocked /
  //    wrong-language declared primary is replaced by an OFFICIAL alternative (discovery only — the
  //    resolver + per-type floor still qualify whatever it returns). A thin REAL primary is kept as-is;
  //    discovery below carries the weight. Fetched ONCE here (never re-fetched in the pool below).
  const pf = await fetchPrimaryDeep({ title: it.title, primaryUrl: it.source_url, itemType: it.item_type, identifier: it.instrument_identifier, canonicalKey: it.canonical_instrument_key, instrumentType: it.instrument_type, jurisdiction: it.jurisdiction_iso }, caller);
  await recordSourceFetchStatus(sb, it.source_id, pf); // item 5b: source-level unreadable flag (guarded, behind mig 147)
  await persistPrimaryExhaustion(sb, itemId, pf); // earth-exhaustion: durable N×M record when discovery exhausted (RD-15)
  const primaryUrl = pf.url, primary = pf.text;
  // NO SILENT TRUNCATION: collect a truncation event if the primary (or, below, any corroborator) hit its cap.
  const truncEvents: TruncEvent[] = [];
  if (pf.truncated) truncEvents.push({ url: primaryUrl, collected: primary.length, fullLength: pf.fullLength ?? primary.length, cap: pf.cap ?? PRIMARY_MAX_CHARS, transport: "primary" });
  // 2. DEEP DIVE: discover corroborating/expanding sources via web_search
  const corroborators = await discoverCorroborators(it.title, primaryUrl, primary);
  // 3. multi-source fetch (the discovered corroborators), then prepend the already-fetched primary
  const poolUrls = ([...new Set(corroborators.map((c) => c.url).filter(Boolean))] as string[]).filter((u) => u !== primaryUrl);
  const fetchedCorrMeta = await mapLimit(poolUrls, FETCH_CONCURRENCY, async (u) => ({ url: u, ...(await fetchMeta(u, CORROBORATOR_MAX_CHARS, caller)) }));
  for (const m of fetchedCorrMeta) if (m.truncated) truncEvents.push({ url: m.url, collected: m.text.length, fullLength: m.fullLength, cap: m.cap, transport: m.transport });
  const fetchedCorr = fetchedCorrMeta.filter((b) => b.text.length > 200).map((b) => ({ url: b.url, text: b.text }));
  const fetchedRaw = [...(primary.length > 200 ? [{ url: primaryUrl, text: primary }] : []), ...fetchedCorr];
  if (!fetchedRaw.length) return { ok: false, detail: `no fetchable source content (primary ${primary.length}ch ${pf.fellBack ? `via fallback after ${pf.primaryReason}` : "declared"}; ${corroborators.length} discovered, none fetchable)` };
  // WRITE-SIDE ERROR-BODY GATE (RD-14): an error body (bot wall / 403 / 404 / Request-Access wall / nav shell)
  // is NEVER stored as source content — the complement to RD-13's read-side gate. Gated here so BOTH synthesis
  // AND the pool INSERT below use only real content; a junk-only capture HOLDS with NO_REACHABLE_SOURCE
  // (event-bound to re-collection at hold-lift), never a fabricated brief over an error page.
  const cap = captureForStorage(fetchedRaw);
  const fetched = cap.store as Array<{ url: string; text: string }>;
  if (cap.excluded.length) await surfaceCaptureExclusions(sb, itemId, cap.excluded);
  if (!fetched.length) return { ok: false, detail: `NO_REACHABLE_SOURCE: all ${cap.excluded.length} fetched capture(s) were failed fetches (bot wall / 403 / 404 / nav shell); primary ${primary.length}ch ${pf.fellBack ? `via fallback after ${pf.primaryReason}` : "declared"} — held for re-fetch at hold-lift` };

  // PERSIST-BEFORE-PROCESS (Edit A — failure-path protection): write the fetched pool to
  // agent_run_searches BEFORE the synthesis call below, so a synthesis hang/throw (the network-failing
  // step) never discards the already-paid-for Browserless + web_search bytes. A retry then re-synthesises
  // from this stored pool (generateBriefFromStored) with zero re-fetch. `fetched` is final here — the
  // L241 mapLimit has fully resolved — so the reorder is safe.
  //
  // GUARD 1 — ALL-OR-NOTHING: the persist is a SINGLE batched INSERT (one Postgres statement, atomic), so
  // a mid-insert link drop can never leave a PARTIAL pool that the stored-reader later treats as complete
  // (its >200ch filter is a usability check, not an integrity guarantee against partial writes). A
  // regeneration replaces the prior pool: DELETE then the one batched INSERT. If the INSERT fails the run
  // returns generate_failed with no brief written and no partial pool — a clean retry, never a fragment.
  //
  // The generate-pool rows carry the fetched source CONTENT. The discovered-ref rows register EVERY
  // discovered corroborator URL (even those not fetched) as a known, web_search-sourced reference:
  // criterion-2 URL grounding accepts a URL only if it is the item source, in the fetched pool, in
  // agent_run_searches, or in the sources registry. A brief that legitimately cites an authoritative
  // source it FOUND via web_search but could NOT fetch (World Bank / EEA dashboards that block server
  // fetch) would otherwise quarantine on an "ungrounded_url" — a real URL, not an invented one. The
  // discovered-ref stubs are <200ch so the >200 grounding-corpus filter excludes them: a discovered-but-
  // unfetched URL can be CITED but can never source a FACT span (the "discovered real URL is not an
  // invented URL" distinction, bounded to the web_search-discovered set; arbitrary URLs still fail).
  const ts = new Date().toISOString();
  const fetchedUrlSet = new Set(fetched.map((b) => b.url));
  const poolRows = fetched.map((b, i) => ({
    intelligence_item_id: itemId, search_query: "canonical:generate-pool", result_url: b.url,
    result_title: "generate pool source", result_index: i, result_content_excerpt: cleanCtl(b.text), searched_at: ts,
  }));
  const refRows = corroborators
    .filter((c) => c.url && !fetchedUrlSet.has(c.url))
    .map((c) => ({
      intelligence_item_id: itemId, search_query: "canonical:discovered-ref", result_url: c.url,
      result_title: c.name || "discovered reference", result_index: 80,
      result_content_excerpt: (c.name || c.why || "discovered reference").slice(0, 180), searched_at: ts,
    }));
  await sb.from("agent_run_searches").delete().eq("intelligence_item_id", itemId);
  const { error: poolErr } = await sb.from("agent_run_searches").insert([...poolRows, ...refRows]);
  if (poolErr) return { ok: false, detail: `pool persist failed (pre-synthesis): ${poolErr.message}` };
  // NO SILENT TRUNCATION: announce any source the FETCH could not fully collect, now that the pool (and its
  // stored excerpts) is durable — the operator sees the partial collect on the item via integrity_flags.
  await recordTruncation(sb, itemId, truncEvents);

  // 4. synthesise across the WHOLE pool (shared with generateBriefFromStored — same skill-bearing prompt).
  // The pool is already durable above; a failure here is resumable from the stored pool, not a re-scrape.
  const r = await synthesiseAndWriteBrief(sb, it, fetched, corroborators);
  if (!r.ok) return r;
  return { ok: true, detail: `${r.detail} (${corroborators.length} discovered via web_search)` };
}

/** REBUILD-FROM-STORED: re-synthesise the brief from the SAVED agent_run_searches pool — NO Browserless,
 *  NO web_search. For the first-build conformance redo: reformat the corpus to the current skills using
 *  content ALREADY pulled, instead of re-scraping. (Re-scrape stays a SEPARATE future capability for
 *  freshness/change-detection + new-item discovery.) Returns ok:false (caller falls back to a fresh
 *  generateBrief) when no usable stored pool exists. Reuses the saved pool as-is — does NOT overwrite it. */
export async function generateBriefFromStored(itemId: string): Promise<StepResult> {
  return withTelemetry(() => generateBriefFromStoredImpl(itemId));
}
async function generateBriefFromStoredImpl(itemId: string): Promise<StepResult> {
  const sb = svc();
  const { data: it, error: itErr } = await sb.from("intelligence_items").select("id, title, item_type, source_id, source_url, instrument_identifier, canonical_instrument_key, instrument_type, jurisdiction_iso").eq("id", itemId).single();
  if (itErr || !it) return { ok: false, detail: `item not found${itErr ? `: ${itErr.message}` : ""}` };
  // I1 (attribution): rich ticket for the stored-path re-synthesis Sonnet call (see generate for rationale).
  setSpendTicket({ purpose: "canonical:generate-stored", itemId, sourceId: it.source_id ?? null });
  const { data: pool, error: poolErr } = await sb.from("agent_run_searches").select("result_url, result_title, result_content_excerpt, search_query, searched_at, result_index").eq("intelligence_item_id", itemId).order("result_index");
  if (poolErr) console.warn(`[canonical] stored-pool read failed for ${itemId}: ${poolErr.message}`);
  const rows = pool ?? [];
  // generate-pool rows carry the fetched source CONTENT (>200ch); discovered-ref stubs (<200ch) are leads only.
  const usable = rows.filter((r) => typeof r.result_url === "string" && (r.result_content_excerpt || "").length > 200);
  const fetched = usable.map((r) => ({ url: r.result_url as string, text: r.result_content_excerpt as string }));
  if (!fetched.length) return { ok: false, detail: NO_STORED_POOL };
  // GUARD 3 — staleness visible: the pool's OLDEST fetch date is the age of the grounding bytes being
  // reused, and fetch date is part of regulatory provenance. Surface it in the detail (-> agent_runs)
  // so reused-stale-content is a DETECTABLE condition, never invisible. --refresh is the deliberate
  // force-rescrape lever (Edit B); change-detection is intentionally NOT built here.
  const stamps = usable.map((r) => r.searched_at).filter((s): s is string => typeof s === "string");
  const oldest = stamps.length ? stamps.reduce((a, b) => (a < b ? a : b)) : null;
  const ageNote = oldest ? `, pool fetched ${oldest.slice(0, 10)}` : "";
  const corroborators: Corroborator[] = rows
    .filter((r) => r.search_query === "canonical:discovered-ref" && typeof r.result_url === "string")
    .map((r) => ({ name: typeof r.result_title === "string" ? r.result_title : "discovered reference", url: r.result_url as string, why: "" }));
  const r = await synthesiseAndWriteBrief(sb, it, fetched, corroborators);
  if (!r.ok) return r;
  return { ok: true, detail: `${r.detail} (FROM STORED pool — 0 fetches, ${corroborators.length} stored refs${ageNote})` };
}

/** REFRESH-PRIMARY-INTO-POOL — re-fetch ONLY the full enacted text (the #155 direct-HTTP transport, FREE
 *  for legal hosts), replace the truncated primary row in the pool, REUSE the existing pool corroborators
 *  (NO web_search — corroborators were never the gap), then re-synthesise. This is the cheap correct fix
 *  for the STALE-TRUNCATED-POOL class: items fetched before the #155 truncation fix (2026-06-23) carry a
 *  primary truncated at ~30k, so the back of the law (penalties, annexes, per-year trajectory) is NOT in
 *  the pool — and `generateBriefFromStored` can only re-ground what the pool holds, so required-slot facts
 *  ground to commentary. This refreshes the primary to full text WITHOUT re-running discoverCorroborators
 *  (the web_search demoted across this work). = generateBrief minus discovery. */
export async function generateBriefRefreshPrimary(itemId: string, caller: string | null = null): Promise<StepResult> {
  return withTelemetry(() => generateBriefRefreshPrimaryImpl(itemId, caller));
}
async function generateBriefRefreshPrimaryImpl(itemId: string, caller: string | null = null): Promise<StepResult> {
  const sb = svc();
  const { data: it, error: itErr } = await sb.from("intelligence_items").select("id, title, item_type, source_id, source_url, instrument_identifier, canonical_instrument_key, instrument_type, jurisdiction_iso").eq("id", itemId).single();
  if (itErr || !it) return { ok: false, detail: `item not found${itErr ? `: ${itErr.message}` : ""}` };
  // I1 (attribution): rich ticket for the refresh-primary re-synthesis calls (see generate for rationale).
  setSpendTicket({ purpose: "canonical:refresh-primary", itemId, sourceId: it.source_id ?? null });
  // 1. full primary via the #155 direct-first transport (free for eligible legal hosts; no truncation).
  const pf = await fetchPrimaryDeep({ title: it.title, primaryUrl: it.source_url, itemType: it.item_type, identifier: it.instrument_identifier, canonicalKey: it.canonical_instrument_key, instrumentType: it.instrument_type, jurisdiction: it.jurisdiction_iso }, caller);
  await recordSourceFetchStatus(sb, it.source_id, pf); // item 5b: source-level unreadable flag (guarded, behind mig 147)
  await persistPrimaryExhaustion(sb, itemId, pf); // earth-exhaustion: durable N×M record when discovery exhausted (RD-15)
  const primaryUrl = pf.url, primary = pf.text;
  if (primary.length < 200) return { ok: false, detail: `refresh-primary: primary too thin (${primary.length}ch${pf.fellBack ? ` via fallback after ${pf.primaryReason}` : ""})` };
  const truncEvents: TruncEvent[] = [];
  if (pf.truncated) truncEvents.push({ url: primaryUrl, collected: primary.length, fullLength: pf.fullLength ?? primary.length, cap: pf.cap ?? PRIMARY_MAX_CHARS, transport: "primary" });
  // 2. REUSE existing pool corroborators (NO web_search) — content rows >200ch (excluding the primary).
  const { data: priorPool, error: priorPoolErr } = await sb.from("agent_run_searches").select("result_url, result_title, result_content_excerpt").eq("intelligence_item_id", itemId);
  if (priorPoolErr) console.warn(`[canonical] refresh-primary prior-pool read failed for ${itemId}: ${priorPoolErr.message}`);
  const priorCorr = (priorPool ?? []).filter((r) => typeof r.result_url === "string" && r.result_url !== primaryUrl && (r.result_content_excerpt ?? "").length > 200);
  const fetchedCorr = priorCorr.map((r) => ({ url: r.result_url as string, text: r.result_content_excerpt as string }));
  // WRITE-SIDE ERROR-BODY GATE (RD-14): drop any error-body capture (a junk re-fetch primary OR a stale junk
  // corroborator inherited from the prior pool) so it is never re-stored; a junk-only set HOLDS NO_REACHABLE_SOURCE.
  const cap = captureForStorage([{ url: primaryUrl, text: primary }, ...fetchedCorr]);
  const fetched = cap.store as Array<{ url: string; text: string }>;
  if (cap.excluded.length) await surfaceCaptureExclusions(sb, itemId, cap.excluded);
  if (!fetched.length) return { ok: false, detail: `NO_REACHABLE_SOURCE: refresh-primary produced only failed-fetch captures (${cap.excluded.length}) — held for re-fetch at hold-lift` };
  const corroborators: Corroborator[] = (priorPool ?? [])
    .filter((r) => typeof r.result_url === "string" && r.result_url !== primaryUrl)
    .map((r) => ({ name: (typeof r.result_title === "string" ? r.result_title : "discovered reference"), url: r.result_url as string, why: "" }));
  // 3. re-persist the pool (full primary + reused corroborators) — mirror generateBrief GUARD 1 (delete +
  //    one batched insert; replaces the prior truncated pool). Discovered-ref stubs preserved for URL grounding.
  const ts = new Date().toISOString();
  const fetchedUrlSet = new Set(fetched.map((b) => b.url));
  const poolRows = fetched.map((b, i) => ({
    intelligence_item_id: itemId, search_query: "canonical:generate-pool", result_url: b.url,
    result_title: "generate pool source", result_index: i, result_content_excerpt: cleanCtl(b.text), searched_at: ts,
  }));
  const refRows = corroborators
    .filter((c) => c.url && !fetchedUrlSet.has(c.url))
    .map((c) => ({
      intelligence_item_id: itemId, search_query: "canonical:discovered-ref", result_url: c.url,
      result_title: c.name || "discovered reference", result_index: 80,
      result_content_excerpt: (c.name || "discovered reference").slice(0, 180), searched_at: ts,
    }));
  await sb.from("agent_run_searches").delete().eq("intelligence_item_id", itemId);
  const { error: poolErr } = await sb.from("agent_run_searches").insert([...poolRows, ...refRows]);
  if (poolErr) return { ok: false, detail: `refresh-primary pool persist failed: ${poolErr.message}` };
  await recordTruncation(sb, itemId, truncEvents);
  // 4. synthesise across the refreshed pool (full primary anchors; corroborators carry context). NO web_search.
  const r = await synthesiseAndWriteBrief(sb, it, fetched, corroborators);
  if (!r.ok) return r;
  return { ok: true, detail: `${r.detail} (REFRESH-PRIMARY: full re-fetch ${primary.length}ch${pf.truncated ? " [still truncated!]" : ""}, ${fetchedCorr.length} pool corroborators reused, 0 web_search)` };
}

/** STEP section: format-selected extractor (via the registry) -> upsert intelligence_item_sections.
 *  Dispatches by item_type through specForItemType — ONE path for every surface (regulation, research,
 *  market, technology, operations). Surfaces that render structured components re-parse content_md at
 *  render time; the rows stored here are format-generic. */
export async function sectionBrief(itemId: string): Promise<StepResult> {
  const sb = svc();
  const { data: it, error: itErr } = await sb.from("intelligence_items").select("item_type, full_brief, provenance_status").eq("id", itemId).single();
  if (itErr || !it?.full_brief) return { ok: false, detail: `no full_brief${itErr ? `: ${itErr.message}` : ""}` };
  // F2 SKIP-IF-VERIFIED GUARD (mirrors groundBrief): section_claim_provenance.section_row_id FKs into
  // intelligence_item_sections ON DELETE CASCADE, so the blanket section delete below would
  // CASCADE-destroy a verified item's entire claim ledger — and since the set_provenance_status trigger
  // is AFTER INSERT/UPDATE (not DELETE), the item would stay labeled 'verified' with no claims
  // (stale-verified = fabricated certification). A verified item is already sectioned + grounded; never
  // re-section it. Re-sectioning is for fresh/quarantined items only (which carry no certification to lose).
  if (it.provenance_status === "verified") return { ok: true, detail: "already verified — skip re-section (ledger-preserving)" };
  const spec = specForItemType(it.item_type);
  if (!spec) return { ok: false, detail: `no format spec for item_type ${it.item_type}` };
  const rows = spec.extract(it.full_brief);
  if (!rows.length) return { ok: false, detail: `no sections extracted (${spec.formatType})` };
  // LEDGER-PRESERVING SECTION RECONCILE (re-grounds-never-destroy, operator ruling 2026-07-14). The old blanket
  // `delete intelligence_item_sections` CASCADE-wiped section_claim_provenance (section_row_id FK ON DELETE
  // CASCADE) BEFORE groundBrief could snapshot the prior ledger — which zeroed the dominance guard's prior count
  // and let a WEAKER re-ground silently destroy a rich ledger (Brazil Lei 12.305: 55 FACT -> 2 GAP). Reconcile
  // by section_key instead: UPDATE surviving keys IN PLACE (stable section_row_id -> the claim ledger survives
  // into groundBrief's snapshot/restore), INSERT genuinely-new keys, DELETE only keys that vanished (their
  // claims cascade — the section is really gone). URL-normalization (ruling 2026-07-04): strip markdown emphasis
  // markers (*https://…*) at the write site so criterion-2's exact-string compare + the customer's link are clean.
  const clean = (md: string) => stripUrlMarkers(md) ?? md;
  const newKeys = new Set(rows.map((s) => s.section_key));
  const uniqueKeys = newKeys.size === rows.length; // duplicate section_keys would mis-map an in-place update
  if (!uniqueKeys) {
    // Rare: a format emitted duplicate section_keys — fall back to the delete+insert path (accepts the cascade;
    // no worse than the prior behavior, and the dominance guard still fails-loud on a weaker rebuild).
    await sb.from("intelligence_item_sections").delete().eq("item_id", itemId);
    for (const s of rows) {
      await sb.from("intelligence_item_sections").insert(
        { item_id: itemId, section_key: s.section_key, section_order: s.section_order, content_md: clean(s.content_md), is_conditional: s.is_conditional }
      );
    }
  } else {
    const { data: existing } = await sb.from("intelligence_item_sections").select("id, section_key").eq("item_id", itemId);
    const idByKey = new Map((existing ?? []).map((r) => [r.section_key, r.id]));
    for (const r of existing ?? []) if (!newKeys.has(r.section_key)) await sb.from("intelligence_item_sections").delete().eq("id", r.id);
    for (const s of rows) {
      const priorId = idByKey.get(s.section_key);
      const payload = { section_order: s.section_order, content_md: clean(s.content_md), is_conditional: s.is_conditional };
      if (priorId) await sb.from("intelligence_item_sections").update(payload).eq("id", priorId);
      else await sb.from("intelligence_item_sections").insert({ item_id: itemId, section_key: s.section_key, ...payload });
    }
  }
  // §14 TIMELINE HARVEST (Phase-3b, DD-01): item_timelines had NO production writer — the model
  // assembled "Confirmed Regulatory Timeline" in the brief prose and the structured store stayed
  // empty (85% of verified reg briefs), while the few seeded rows drifted wrong (the PPWR Aug-12→
  // Aug-1 precision defect). Harvest §14 here so EVERY future generation persists its timeline:
  // parse (the existing display parser) → precision-honest normalize (timeline-harvest.mjs) →
  // replace this item's rows. Non-fatal: a harvest failure logs and never fails the section step.
  let timelineDetail = "";
  if (spec.formatType === "regulatory_fact_document") {
    try {
      const t = extractRegulationSections(it.full_brief)["14"];
      const entries = t && t.kind === "timeline" ? t.entries : [];
      const { rows: tlRows, skipped } = buildTimelineRows(entries, new Date().toISOString().slice(0, 10));
      if (tlRows.length) {
        const { error: delErr } = await sb.from("item_timelines").delete().eq("item_id", itemId);
        if (delErr) throw new Error(`timeline delete failed: ${delErr.message}`);
        const { error: insErr } = await sb.from("item_timelines").insert(tlRows.map((r) => ({ ...r, item_id: itemId })));
        if (insErr) throw new Error(`timeline insert failed: ${insErr.message}`);
        timelineDetail = `; timeline ${tlRows.length} milestones${skipped.length ? ` (${skipped.length} unparseable date tokens skipped)` : ""}`;
      } else if (skipped.length) {
        // Dates existed but none parsed — surface, don't silently leave the timeline empty.
        console.warn(`[canonical] §14 harvest for ${itemId}: 0 rows, ${skipped.length} unparseable tokens (${skipped.slice(0, 3).map((s) => s.date).join(" | ")})`);
        timelineDetail = `; timeline 0 rows (${skipped.length} unparseable)`;
      }
    } catch (e) {
      console.warn(`[canonical] §14 timeline harvest failed for ${itemId}: ${(e as Error).message}`);
      timelineDetail = "; timeline harvest failed (see warn)";
    }
  }
  return { ok: true, detail: `${rows.length} sections${timelineDetail}` };
}

// SLOT-FORCING JUDGE (5c). "Does this candidate span support a binding FACT for the slot?" MOAT ASYMMETRY
// (binding 3): default NOT CONFIRMED on any uncertainty / parse failure / off-topic / analysis-not-enacted —
// a false "true" is fabricated provenance (unacceptable); a false "false" is a recoverable honest GAP.
// Routes through the spend client (Haiku, cheap; ticket + seeded ceiling enforced). Only an explicit true confirms.
async function judgeSlotSpan(slotKey: string, description: string, nom: { span: string; url: string }): Promise<{ supports: boolean; why?: string }> {
  const system = `You are a strict grounding judge for a regulatory brief. Decide whether a CANDIDATE SPAN from a source SUPPORTS a binding FACT for a required SLOT. Output ONLY JSON: {"supports": true|false, "why": "<=100 chars"}. DEFAULT to supports=false whenever uncertain, when the span concerns a DIFFERENT matter than the slot, or when it reads as analysis/commentary rather than the enacted requirement. A false "true" is unacceptable (fabricated provenance); a false "false" is a recoverable honest GAP.`;
  const user = `SLOT: ${slotKey} — ${description}\nCANDIDATE SPAN (from ${nom.url}):\n"""${nom.span.slice(0, 1200)}"""\nDoes the span support a binding FACT for this slot?`;
  try {
    const { text } = await spendStream({ system, user, model: "claude-haiku-4-5-20251001", maxTokens: 200 });
    const m = text.match(/\{[\s\S]*?\}/);
    if (!m) return { supports: false, why: "no JSON in judge output" };
    const j = JSON.parse(m[0]) as { supports?: unknown; why?: unknown };
    return { supports: j.supports === true, why: typeof j.why === "string" ? j.why.slice(0, 100) : undefined };
  } catch (e) {
    return { supports: false, why: `judge error: ${(e as Error).message.slice(0, 60)}` };
  }
}

/** STEP ground: claim-ledger + verbatim span-check + validate_item_provenance; keep claims only if
 *  valid (else delete them — manual rollback). The set_provenance_status trigger flips on the writes. */
export async function groundBrief(itemId: string, caller: string | null = null, opts?: { model?: string; injectedLedger?: any[] }): Promise<StepResult> {
  return withTelemetry(() => groundBriefImpl(itemId, caller, opts));
}
async function groundBriefImpl(itemId: string, caller: string | null = null, opts?: { model?: string; injectedLedger?: any[] }): Promise<StepResult> {
  // MODEL-TIER: the grounding model is opts.model (the Segment-0 A/B override) ?? the GROUND_MODEL knob.
  const groundModel = opts?.model ?? GROUND_MODEL;
  const sb = svc();
  // MASTER ACQUIRE GATE (operator ruling 2026-07-14): the acquire lock is the single clean master gate on the
  // paid ground path — asserted HERE, at the spend site, so grounding is administratively FROZEN unless the
  // operator has armed GROUNDING_ACQUIRE_ENABLED for a sanctioned run (throws AcquireLockError before any model
  // call). Composes with verify-item's earlier gate on the workflow path and the SCRAPE_HOLD transport gate. A
  // direct groundBrief call (proof scripts, reresearch) is gated here too — no paid grounding without the arm.
  // CC-GROUNDING-EXECUTOR SEAM (operator ruling 2026-07-16): when the caller INJECTS an extracted ledger
  // (opts.injectedLedger), the model-extraction step is done FREE by the Claude Code executor (subscription),
  // so there is NO paid model call and NO fetch — the acquire lock does not apply (it gates spend, and there is
  // none). Everything downstream (verbatim kept-filter, resolver tier-stamp, floor pool, slot-forcing, ALL mint
  // gates, non-destructive applyLedgerDiff, validate) runs UNCHANGED, so the system still JUDGES the injected
  // ledger exactly as it judges a Sonnet one. The metered path is untouched for callers that do not inject.
  const injected = opts?.injectedLedger ?? null;
  if (!injected) assertAcquireAllowed(`ground: ${itemId}`, process.env);
  const { data: it, error: itErr } = await sb.from("intelligence_items").select("id, item_type, source_id, source_url, full_brief, title, instrument_type, instrument_identifier, canonical_instrument_key, jurisdiction_iso").eq("id", itemId).single();
  if (itErr || !it?.source_id) return { ok: false, detail: `no source_id${itErr ? `: ${itErr.message}` : ""}` };
  // I1 (attribution): rich ticket for the grounding ledger-extraction Sonnet call — the paid call the $65
  // hole was blind to. Every spend row from groundBrief now carries itemId + sourceId.
  setSpendTicket({ purpose: "canonical:ground", itemId, sourceId: it.source_id ?? null });
  // Idempotency scoped to VERIFIED (not "any claims exist"). A quarantined/ungrounded item is
  // re-groundable — the prior guard ("any claims -> already grounded") silently blocked re-grounding a
  // quarantined item against a new/expanded section set (e.g. after a section backfill) if a partial run
  // had left claims. Skip only verified; for everything else clear stray claims so the re-ground starts
  // clean (no duplicate rows), then proceed.
  const { data: prov, error: provErr } = await sb.from("intelligence_items").select("provenance_status").eq("id", itemId).single();
  if (provErr) console.warn(`[canonical] ground provenance-status read failed for ${itemId}: ${provErr.message}`);
  if (prov?.provenance_status === "verified") return { ok: true, detail: "already verified" };
  // DOMINANCE GUARD SNAPSHOT (re-grounds-never-destroy): snapshot the prior grounding BEFORE the delete so a
  // re-extract that produces a WEAKER ledger (batch-1 782878c0 24->1; Brazil 55 FACT -> 2 GAP) is caught and the
  // prior grounding RESTORED, rather than silently replacing rich grounding with thin grounding. The columns
  // mirror the insert below (incl. claim_kind + source_tier_at_grounding so summarizeLedger can compute the
  // FACT + floor-qualifying axes). This snapshot is non-empty for a non-verified item because sectionBrief now
  // reconciles sections by key (surviving section_row_ids keep their claims) instead of delete-cascading them —
  // the sequencing blind that defeated the old count-only guard. FAIL-CLOSED (C4, 2026-07-11): a READ ERROR here
  // would make prior read as "nothing to protect" AND leave the prior grounding unrecoverable, so on a snapshot
  // read error we ABORT before the destructive delete (ok:false is retryable), never grounding under a blind guard.
  // NON-DESTRUCTIVE GROUNDING (operator doctrine 2026-07-16). The prior ledger is NO LONGER deleted here. It is
  // READ (id + mint_hold_reason added so the apply can update/archive by id and re-evaluate holds), the new
  // grounding is COLLECTED in memory (`incoming` below), diffed against it, and applied non-destructively:
  // add-new / version-changed (old preserved in claim_versions) / leave-unchanged / leave-not-reproduced. A
  // claim is NEVER erased by a re-ground (erasure is the separate erase-only-on-proven-inaccuracy path). An
  // interrupted ground therefore leaves the prior ledger fully intact by construction — this subsumes H2
  // (atomic ground writes): there is no zeroing window because there is no zeroing.
  const { data: priorClaims, error: priorClaimsErr } = await sb.from("section_claim_provenance")
    .select("id, section_row_id, intelligence_item_id, claim_text, claim_kind, source_span, source_id, search_result_id, source_tier_at_grounding, mint_hold_reason")
    .eq("intelligence_item_id", itemId);
  if (priorClaimsErr) return { ok: false, detail: `grounding aborted: prior-ledger read failed (${priorClaimsErr.message}); refusing to re-ground under a blind comparison (fail-closed, non-destructive doctrine)` };
  const { data: secs, error: secsErr } = await sb.from("intelligence_item_sections").select("id, section_key, content_md").eq("item_id", itemId).order("section_order");
  if (secsErr || !secs?.length) return { ok: false, detail: `no sections${secsErr ? `: ${secsErr.message}` : ""}` };
  // CITED-HOST GATE (P3c / S1-07). Stubbing a cited URL into agent_run_searches is what makes
  // criterion-2 accept it (exact-URL match), so unconditional stubbing made criterion-2 CIRCULAR —
  // the model's own citations licensed themselves (probe 2026-07-07: 38/309 stubs across 23 items
  // sat on hosts unknown to both the item's fetched pool and the registry). Rule: a stub may only
  // be written for a host the system already KNOWS — the item's real fetched pool (>200ch content;
  // stubs excluded), the source registry, or the item's own source_url — matched at exact-host OR
  // institution level (hostInstitution, the tier resolver's key, so a vetted institution's
  // subdomain doesn't false-flag). A novel-host citation is NOT stubbed: it is flagged below
  // (integrity_flags, never silent) and criterion-2 fails it honestly — quarantine +
  // research-or-erase (register the host, re-ground) instead of self-grounding. Stubs remain
  // <200ch/empty-excerpt so the FACT-span corpus excludes them: a cited URL still never grounds a
  // FACT; this gate closes the criterion-2 half. The safety4sea fix (2026-06-21) is preserved for
  // known hosts: an unlisted cited URL on a pool/registry host still stubs and passes.
  const knownHosts = new Set<string>();
  const knownInstitutions = new Set<string>();
  const addKnown = (u: string | null | undefined) => {
    const h = hostOf(u ?? "");
    if (!h) return;
    knownHosts.add(h);
    const inst = hostInstitution(h);
    if (inst) knownInstitutions.add(inst);
  };
  addKnown(it.source_url);
  try {
    const { data: realPool, error: rpErr } = await sb.from("agent_run_searches").select("result_url, result_content_excerpt").eq("intelligence_item_id", itemId);
    if (rpErr) console.warn(`[cited-host-gate] pool read failed for ${itemId} (gate fails closed): ${rpErr.message}`);
    for (const p of realPool ?? []) if (((p.result_content_excerpt as string | null)?.length ?? 0) > 200) addKnown(p.result_url as string);
    for (let from = 0; ; from += 1000) {
      const { data: regs, error: rgErr } = await sb.from("sources").select("url").order("id").range(from, from + 999);
      if (rgErr) { console.warn(`[cited-host-gate] registry read failed (gate fails closed): ${rgErr.message}`); break; }
      if (!regs?.length) break;
      for (const s of regs) addKnown(s.url as string);
      if (regs.length < 1000) break;
    }
  } catch (e) { console.warn(`[cited-host-gate] known-host build failed for ${itemId} (gate fails closed): ${(e as Error).message}`); }
  const asCited = (u: string) => { const h = hostOf(u); return { url: u, host: h, institution: hostInstitution(h) }; };
  const novelCited = new Map<string, string>(); // url -> where it was cited
  try {
    const newSources = parseNewSourcesFromBrief(it.full_brief || "").map((cs) => ({ ...asCited(stripUrlMarkers(cs.url) as string), name: cs.name }));
    const { allowed, novel } = partitionCitedByHost(newSources, knownHosts, knownInstitutions);
    for (const n of novel) if (!novelCited.has(n.url)) novelCited.set(n.url, "new-sources table");
    for (const cs of allowed) {
      const { data: ex, error: exErr } = await sb.from("agent_run_searches").select("id").eq("intelligence_item_id", itemId).eq("result_url", cs.url).limit(1);
      if (exErr) console.warn(`[cited-host-gate] stub dedup read failed for ${cs.url}: ${exErr.message}`);
      if (!ex?.length) await sb.from("agent_run_searches").insert({ intelligence_item_id: itemId, search_query: "canonical:cited-source", result_url: cs.url, result_title: cs.name, result_index: 90, result_content_excerpt: (cs.name as string).slice(0, 280), searched_at: new Date().toISOString() });
    }
  } catch { /* non-fatal */ }
  // CITED-URL completeness (criterion 2), now host-gated: the model cites real sources INLINE in
  // prose without always listing them in the New Sources table — an unlisted cited URL on a KNOWN
  // host failed criterion 2 and ERASED the whole brief over a single trade-press citation (the
  // EU-ETS-maritime safety4sea.com case, 2026-06-21). Stub every section-cited URL whose host the
  // system knows; novel hosts flag + fail honestly per the gate above.
  try {
    const citedUrls = new Set<string>();
    for (const s of secs) for (const m of (s.content_md || "").matchAll(/https?:\/\/[^\s)\]}"'<>]+/g)) citedUrls.add(m[0].replace(/[.,;:]+$/, ""));
    const { allowed, novel } = partitionCitedByHost([...citedUrls].map(asCited), knownHosts, knownInstitutions);
    for (const n of novel) if (!novelCited.has(n.url)) novelCited.set(n.url, "section prose");
    for (const c of allowed) {
      const { data: ex, error: exErr } = await sb.from("agent_run_searches").select("id").eq("intelligence_item_id", itemId).eq("result_url", c.url).limit(1);
      if (exErr) console.warn(`[cited-host-gate] stub dedup read failed for ${c.url}: ${exErr.message}`);
      if (!ex?.length) await sb.from("agent_run_searches").insert({ intelligence_item_id: itemId, search_query: "canonical:cited-url", result_url: c.url, result_title: "cited in brief", result_index: 91, result_content_excerpt: "", searched_at: new Date().toISOString() });
    }
  } catch { /* non-fatal */ }
  // Surface the refused citations durably (no silent drop — same shape as the error-body gate).
  if (novelCited.size) {
    const novelList = [...novelCited.entries()];
    for (const [u, ctx] of novelList) console.warn(`[cited-host-gate] item ${itemId}: novel-host citation NOT stubbed (${ctx}) — ${u}`);
    try {
      await sb.from("integrity_flags").insert({
        category: "source_issue", subject_type: "item", subject_ref: itemId, status: "open", created_by: "cited-host-gate",
        description: `${novelCited.size} cited URL(s) on hosts unknown to the item's fetched pool and the source registry — NOT stubbed for criterion-2 (self-grounding gate): ${novelList.map(([u]) => u).slice(0, 6).join("; ")}`.slice(0, 480),
        recommended_actions: novelList.slice(0, 8).map(([u, ctx]) => ({ action: "register_source", rationale: `${u} (cited in ${ctx}): verify the source is real, register the host (or reject the citation), then re-ground` })),
      });
    } catch { /* best-effort; the criterion-2 failure is the hard floor */ }
  }
  const { data: slots } = await sb.from("item_type_required_slots").select("slot_key, description").eq("item_type", it.item_type);
  const sectionMap = Object.fromEntries(secs.map((s) => [String(s.section_key), s.id]));
  // Grounding corpus = the pool generate already fetched + stored (the SAME content the brief was
  // synthesised from), so a source that is unfetchable on re-check (PDF/Cloudflare) does not break
  // grounding. Fall back to fetching the section/source URLs only when no stored pool exists.
  const { data: pool, error: poolErr } = await sb.from("agent_run_searches").select("id, result_url, result_content_excerpt, result_index").eq("intelligence_item_id", itemId).order("result_index");
  if (poolErr) console.warn(`[canonical] ground pool read failed for ${itemId}; falling back to section/source URL fetch: ${poolErr.message}`);
  let fetched: Array<{ url: string; text: string }>;
  let searchRows: Array<{ id: string; result_url: string }>;
  const searchIds: string[] = [];
  let ownSearches = false;
  if (pool && pool.length) {
    // ERROR-BODY GROUNDABILITY GATE (item 1, 2026-07-06): a failed-fetch capture (bot wall / 403 / 404 /
    // Request-Access block / nav shell) stored as source content NEVER enters grounding input, the floor pool,
    // or slot-forcing nomination — all three derive from `fetched`, so gating it here gates all three. Grounding
    // a FACT to a 404 body is the fabricate-via-error-page moat breach. Excluded captures are SURFACED, never
    // silently dropped. isErrorBody computes at read time (render-derive; no DDL).
    const pooled = pool.map((r) => ({ url: r.result_url as string, text: (r.result_content_excerpt as string) || "" })).filter((b) => b.text.length > 200);
    const { usable, errorBodies } = partitionErrorBodies(pooled);
    fetched = usable as Array<{ url: string; text: string }>;
    if (errorBodies.length) {
      for (const e of errorBodies) console.warn(`[error-body-gate] item ${itemId}: excluded failed-fetch capture from grounding — ${e.url}`);
      try {
        await sb.from("integrity_flags").insert({
          category: "source_issue", subject_type: "item", subject_ref: itemId, status: "open", created_by: "error-body-gate",
          description: `${errorBodies.length} stored capture(s) excluded from grounding as failed fetches (bot wall / 403 / 404 / nav shell): ${errorBodies.map((e) => e.url).filter(Boolean).slice(0, 6).join("; ")}`.slice(0, 480),
          recommended_actions: errorBodies.slice(0, 8).map((e) => ({ action: "refetch_source", rationale: `${e.url}: stored capture is a failed fetch (isErrorBody) — re-fetch the real source at hold-lift, re-ground` })),
        });
      } catch { /* best-effort; the warn above is the floor */ }
    }
    searchRows = pool.map((r) => ({ id: r.id as string, result_url: r.result_url as string }));
  } else {
    const groundUrls = [...new Set([it.source_url, ...secs.flatMap((s) => urlsIn(s.content_md || ""))].filter(Boolean))] as string[];
    const groundFetchedRaw = (await mapLimit(groundUrls, FETCH_CONCURRENCY, async (u) => ({ url: u, text: await fetchText(u, CORROBORATOR_MAX_CHARS, caller) }))).filter((b) => b.text.length > 200);
    // WRITE-SIDE ERROR-BODY GATE (RD-14): the fallback path FETCHES fresh URLs and stores them — gate before
    // the INSERT so a failed-fetch capture never enters agent_run_searches here either (mirrors the read gate above).
    const gcap = captureForStorage(groundFetchedRaw);
    fetched = gcap.store as Array<{ url: string; text: string }>;
    if (gcap.excluded.length) await surfaceCaptureExclusions(sb, itemId, gcap.excluded);
    searchRows = [];
    ownSearches = true;
    for (let i = 0; i < fetched.length; i++) {
      const { data: r, error: rErr } = await sb.from("agent_run_searches").insert({ intelligence_item_id: itemId, search_query: "canonical ground", result_url: fetched[i].url, result_title: "source", result_index: i, result_content_excerpt: fetched[i].text, searched_at: new Date().toISOString() }).select("id, result_url").single();
      if (rErr) console.warn(`[canonical] ground fallback search insert failed for ${itemId} (${fetched[i].url}): ${rErr.message}`);
      if (r) { searchIds.push(r.id); searchRows.push({ id: r.id, result_url: r.result_url }); }
    }
  }
  if (!fetched.length) return { ok: false, detail: "no grounding content (no generate pool; nothing fetchable)" };
  // TARGET-MATCH VERIFY (drain-loop finding, RD-48). BEFORE extraction, confirm the fetched pool actually
  // contains THIS item's instrument. officialnessOf confirms a capture is AN official instrument, not the
  // CORRECT one (eu_clean_trucking captured the CSRD directive for the HDV CO2 regulation and scored
  // "official"). EXECUTOR-AGNOSTIC: runs on the SHARED `fetched` pool, so BOTH the injected (CC) driver and the
  // metered driver are gated identically (the doctrine-binds-to-pipeline-not-executor invariant, RD-47). HARD-
  // hold ONLY on a definitive MISMATCH — the pool bears a DIFFERENT instrument id and NOT this one, no matching
  // block (never over-holds when the right instrument is also present). An UNVERIFIED pool (no decisive id
  // signal) is a SOFT flag: grounding proceeds under the downstream verbatim/floor gates.
  const targetMatch = verifyPoolTargetMatch(
    { title: it.title, item_type: it.item_type, instrument_type: it.instrument_type, identifier: it.instrument_identifier, canonical_instrument_key: it.canonical_instrument_key, jurisdiction: it.jurisdiction_iso },
    fetched,
  );
  if (targetMatch.verdict === "mismatch") {
    try {
      await sb.from("integrity_flags").insert({
        category: "data_integrity", subject_type: "item", subject_ref: itemId, status: "open", created_by: "target_mismatch_gate",
        description: `Target-instrument MISMATCH — fetched primary is a DIFFERENT instrument than the item. ${targetMatch.best?.reason || ""}`.slice(0, 480),
        recommended_actions: [
          { action: "re-acquire the correct instrument", rationale: `capture bears ${(targetMatch.best?.conflicting || []).join(", ")}; the item's own identifier (${(targetMatch.best?.expected || []).join(", ")}) is absent — re-point the source to the enacted instrument for "${it.title}" and re-ground` },
        ],
      });
    } catch { /* best-effort; the hold below is the floor */ }
    return { ok: false, detail: `target-instrument MISMATCH: ${targetMatch.best?.reason || "fetched primary is a different instrument"} — held, not ground` };
  }
  if (targetMatch.verdict === "unverified") {
    try {
      await sb.from("integrity_flags").insert({
        category: "coverage_gap", subject_type: "item", subject_ref: itemId, status: "open", created_by: "target_unverified_gate",
        description: `Target-match UNVERIFIED (soft) — no instrument-id signal and subject overlap ${targetMatch.best?.score ?? 0} below threshold; grounding proceeds under verbatim/floor gates but the capture is not confirmed to be this instrument. ${targetMatch.best?.reason || ""}`.slice(0, 480),
      });
    } catch { /* best-effort */ }
  }
  const excByUrl = Object.fromEntries(fetched.map((b) => [b.url, b.text]));
  const allText = fetched.map((b) => b.text).join(" ").toLowerCase();
  const system = `You extract a Claim Provenance Ledger for a brief. Output ONLY the ledger.
- Emit one block: a line "<<<CLAIM_PROVENANCE_LEDGER", a JSON array, a line "CLAIM_PROVENANCE_LEDGER>>>".
- Record: {"section","claim_text","claim_kind","source_span","source_id","source_url","slot_key"}.
- FACT: source_span MUST be VERBATIM copied char-for-char from a SOURCE block. (source_id is resolved automatically from the SOURCE block that contains the span — do not hardcode it.)
- FACT SOURCE PREFERENCE: when the SAME binding requirement appears in MORE THAN ONE SOURCE block, copy the span from the block that is the PRIMARY ENACTED TEXT / highest-authority source (the official law or regulator), NOT from a commentary/analysis/news block that merely echoes it. Grounding the fact at the primary is the goal; a corroborator echo is a fallback only.
- WRONG-LANGUAGE PRIMARY (4d): if the brief states a binding FACT in English but the ONLY primary/enacted SOURCE block carrying it is in another language (e.g. a national law in its original language), copy source_span VERBATIM in the ORIGINAL LANGUAGE from that primary block and set source_url to it. The original-language span is the checkable provenance; the surface labels it "translated from [language] original". Do NOT invent an English span that is not present in any source, and do NOT downgrade the fact to a lower-tier English commentary source when the primary carries it in its own language.
- ANALYSIS: a statement the brief text EXPLICITLY labels with ${Object.values(ANALYSIS_LABELS_BY_KEY).map((l) => `"${l}"`).join(", ")}. Set claim_text to that labeled sentence (so it appears verbatim in the section). TWO kinds: (a) GROUNDED ANALYSIS — a credible-but-NOT-binding or forthcoming claim that cites a non-primary source (an intergovernmental / research / analysis body or factual news, NOT the binding legal text): set source_span to its VERBATIM supporting span and source_url to that source, EXACTLY like a FACT, so it carries that source's provenance and tier; (b) PURE INFERENCE — the workspace's own reasoning across the brief's facts, citing no single source: leave source_span and source_url null. A sourced-but-NON-BINDING claim is GROUNDED ANALYSIS, NOT FACT — do not force sourced content to FACT. A present-tense BINDING regulatory requirement (the enacted law "requires/must/mandates/prohibits/applies to") is FACT (primary span) or a LEGAL callout, NEVER ANALYSIS.
- Cover EACH required slot with >=1 FACT or GAP claim (set slot_key):\n${(slots ?? []).map((s) => `- ${s.slot_key}: ${s.description}`).join("\n")}
- For EVERY section (${secs.map((s) => s.section_key).join(", ")}) with must/requires/shall/applies/mandates/prohibits/obligates, emit >=1 FACT claim with "section" set + a verbatim span.
- No verbatim span for a slot -> claim_kind "GAP", source_span null. Never invent spans. CLOSE with CLAIM_PROVENANCE_LEDGER>>>.`;
  // CANONICAL RESOLVER (built ONCE, PAGINATED, FAIL-CLOSED — the registry exceeds the 1000-row PostgREST
  // cap). Shared by: the truncation window (groundWithTier tiers), the floor-first re-attribution, and the
  // FACT stamp — so all three agree on every source's tier. A page-read error ABORTS grounding (ok:false is
  // retryable) rather than building an INCOMPLETE resolver that mis-stamps hosts in the dropped page.
  // A1 MOAT (2026-06-28): effective_tier is NOT selected — the stamp is base_tier/tier_override ONLY
  // (institution.ts tierOfSource); not fetching effective_tier keeps reputation out of arm's reach of the
  // stamp (a reintroduced `?? effective_tier` fallback stays inert; guarded by fitness F12 / invariant SC-9).
  const allSources = await readAllSourcesForResolver(sb);
  if (allSources == null) return { ok: false, detail: "grounding aborted: sources registry page read failed; resolver would be incomplete -> spurious NULL-stamps" };
  const resolver = buildResolver(allSources);
  const itemFloor = authorityFloorFor(it.item_type);
  // MINT-GATE REPORT-ONLY (hardening A1 seams 2+4): the four mint gates run over every minted FACT and LOG
  // would-have-held; they persist nothing differently and hold nothing (report-only until the operator flips
  // them live on the representative calibration). suspendedSourceIds is redundant with seam-1's resolver
  // filter (a suspended source is already unselectable so a FACT's source_id is active-or-null), kept for the
  // gate's own robustness. gateFacts accumulates the minted FACTs for the per-item identity-congruence check.
  const suspendedSourceIds = new Set((allSources || []).filter((s) => s.status === "suspended").map((s) => s.id));
  const gateFacts: Array<{ id: string; claim_kind: string; claim_text: string | null; source_span: string | null; source_id: string | null; source_tier_at_grounding: number | null }> = [];
  // Part C / R2: show the grounding extractor the FULL source window (SAME budget builder as synthesis, so a
  // span written from the primary in synthesis is present here too — the atomic span-grounding coupling), and
  // raise the per-section cap so spans match from the back of a long section. Trims announced (no silent cap).
  const groundWithTier = await attachTiers(sb, fetched, resolver);
  // Floor-first re-attribution pool: the fetched floor-qualifying sources, best-tier-first (span-attribution
  // unit, ruling 2026-07-03). A FACT whose extractor-chosen span host is sub-floor but whose verbatim clause
  // ALSO sits in one of these grounds AT the floor instead of walling. Empty for floor-exempt item types.
  //
  // 4d OFFICIALNESS GATE (officialness.mjs, distinct from floor-attribution.mjs's SYSTEM-PROMPT "4d" — the
  // wrong-language original-span rule; two collided numberings, kept apart). The order at this site is:
  // detectRoadblock (usable content at all — above/in the fetch) -> 4d (is this the OFFICIAL instrument PAST
  // the nav?) -> 4b floor re-home -> 4c relabel. 4d does two things to the floor pool:
  //   (1) DROPS path-b sources (portal / explainer / chrome body) so a non-primary page can NEVER be a
  //       primary FACT re-home target (the moat: never PROMOTE a non-official page for topical fit).
  //   (2) Replaces each surviving (path-a) source's matched text with its CLEAN, past-the-nav body, so 4b's
  //       reattributeToFloor `.includes(needle)` can NEVER fire on nav chrome (the false-stamp defect) — the
  //       url + tier are preserved, only the CHROME is removed (never DOWNGRADE a real instrument for chrome).
  // Host authority-origin tier is INJECTED (s.tier, already the resolver-canonical tier — floorSources has
  // already filtered to tier <= floor, so hostQualifies holds; 4d adds the instrument-body gate). The pool
  // here carries stripText output (stored excerpts), not raw html, so 4d's structural strip is a graceful
  // no-op and the marker+host+length path gate is the operative defense; the full chrome-strip engages when
  // raw html is present and is exercised red-green by officialness.test.mjs.
  const floorPool = floorSources(groundWithTier, itemFloor)
    .map((s) => {
      const off = officialnessOf(s.text, hostOf(s.url), { hostTier: s.tier, floorTier: itemFloor });
      return { ...s, text: off.cleanBody || s.text, officialnessPath: off.path };
    })
    .filter((s) => s.officialnessPath === "a");
  const groundSrc = buildSourceBlocks(groundWithTier, SYNTH_INPUT_BUDGET_CHARS, {
    floorTier: itemFloor,
    hardCeiling: SYNTH_PRIMARY_HARD_CEILING_CHARS,
  });
  await recordTruncation(sb, itemId, [...groundSrc.trims, ...groundSrc.ceilingWalls]);
  // CATEGORY-2 FIX (size-cap doctrine, 2026-07-06): the section reaches the grounder COMPLETE (the old
  // GROUND_SECTION_MAX_CHARS=12000 SILENTLY hid the back of every long section — a binding fact past 12KB was
  // invisible). A pathological section OVER the hard ceiling is SURFACED (coverage_gap flag), never silent.
  const preparedSecs = secs.map((s) => ({ s, p: prepareSectionForGrounding(s.content_md) }));
  await recordTruncation(sb, itemId, preparedSecs.filter((x) => x.p.truncated).map((x) => ({ url: `section:${x.s.section_key}`, collected: x.p.cap, fullLength: x.p.fullLength, cap: x.p.cap, transport: "section-ceiling" })));
  // PROMPT-CACHE (Phase-3a): the source pool rides the cached first system block (callSonnet's third
  // arg), not this user message — retries / re-grounds over the same pool read the prefix at 0.1×.
  const user = `BRIEF SECTIONS:\n${preparedSecs.map(({ s, p }) => `### SECTION ${s.section_key}\n${p.text}`).join("\n\n")}\n\nCopy spans VERBATIM from the SOURCE CONTENT reference corpus in your system context.`;
  let claims;
  // Lenient extraction: a single malformed claim is skipped, not fatal — one bad FACT must not reject
  // the whole ledger (the 0-FACT quarantine on rich synthesised briefs). The kept-filter + the gate
  // below still enforce verbatim-span/label discipline, so nothing ungrounded slips through.
  // A FATAL anthropic error (out-of-credits / auth / bad-request) is NOT a per-item content failure — it
  // re-throws so the batch runner HALTS with the actionable cause, instead of mislabeling every remaining
  // item as "still-quarantined". Only a transient/parse failure degrades to a per-item ok:false (full
  // message, never truncated — the diagnostic must survive).
  // CC-GROUNDING-EXECUTOR SEAM: use the FREE injected ledger (executor extraction) when provided; else the
  // metered Sonnet extraction. The injected ledger is the SAME parsed shape extractClaimLedgerLenient returns,
  // so the kept-filter (verbatim), resolver, gates, and non-destructive apply below judge it identically.
  try { claims = injected ?? extractClaimLedgerLenient(await callSonnet(system, user, groundSrc.blocks, groundModel)); }
  catch (e) { if (isFatalAnthropic(e)) throw e; return { ok: false, detail: `ledger call failed: ${(e as Error).message}` }; }
  for (const cl of claims) { if (cl.source_url) cl.source_url = stripUrlMarkers(cl.source_url) as string; }
  // Mirror validate_item_provenance criteria so every INSERTED claim already passes the gate:
  //  - FACT: source_span must be a verbatim substring of fetched content (criterion 3).
  //  - ANALYSIS: claim_text must appear verbatim in a section that ALSO carries an analysis label
  //    (criterion 4) — drop a paraphrased/unlabeled ANALYSIS claim rather than fail the whole item.
  //    Label vocabulary imported from analysis-labels.mjs (C2 single home — never hand-list it here).
  const sectionTextsLc = secs.map((s) => (s.content_md || "").toLowerCase());
  const analysisGrounded = (claimText: string | null | undefined) => {
    const ct = String(claimText || "").toLowerCase().trim();
    return ct.length > 0 && sectionTextsLc.some((t) => ANALYSIS_LABELS.some((l) => t.includes(l)) && t.includes(ct));
  };
  const kept = claims.filter((cl) => {
    if (cl.claim_kind === "FACT") return cl.source_span ? (excByUrl[cl.source_url ?? ""] || allText).toLowerCase().includes(String(cl.source_span).toLowerCase().trim()) : false;
    if (cl.claim_kind === "ANALYSIS") return analysisGrounded(cl.claim_text);
    return true; // GAP / other kinds carry no span/label obligation
  });

  // SLOT-FORCING (5c, ruling 2026-07-04). Required slots the extractor left untagged get a JUDGE-CONFIRMED
  // FACT or an honest GAP — NEVER a fabricated FACT (SC-12). ONE CLAIM PATH (binding 2): the forced claims are
  // appended to `kept` and flow through crossLinkClaimSources + the SAME writer + resolver + floor policing
  // below (identical provenance fields, identical floor stamp). NO content_md writes here (binding 4): a
  // judge-fail RELABEL is RECORDED for the package's 4c-candidate list, executed separately under its own
  // ruling. NO-OP when every required slot is already tagged (binding 5): zero judge calls, forward-cost clean.
  let slotForcing: SlotForcingResult = { audit: [], relabelCandidates: [], judgeCalls: 0, factsForced: 0, gapsForced: 0 };
  if (slots?.length) {
    const taggedSlots = new Set(kept.filter((c) => ["FACT", "GAP"].includes(c.claim_kind) && !!c.slot_key).map((c) => c.slot_key));
    const secSentences = secs.map((s) => ({ key: s.section_key, sentences: String(s.content_md || "").split(/(?<=[.!?])\s+/).map((x) => x.trim()) }));
    // proseCovers + sectionKey come from the brief prose (GAP-vs-RELABEL + which section the forced claim
    // belongs to). NOMINATION no longer comes from prose (the 5c fix): a judge-confirmed FACT is nominated as a
    // VERBATIM span out of the FLOOR pool below, so it grounds at the floor by construction.
    const uncovered = slots.filter((s) => !taggedSlots.has(s.slot_key)).map((s) => {
      const want = new Set(String(s.description || s.slot_key).toLowerCase().match(/[a-z]{4,}/g) || []);
      let proseCovers = false; let sectionKey = secs[0]?.section_key ?? "";
      for (const sec of secSentences) for (const sent of sec.sentences) {
        if (sent && [...want].some((w) => sent.toLowerCase().includes(w))) { proseCovers = true; sectionKey = sec.key; }
      }
      return { slotKey: s.slot_key, description: s.description ?? s.slot_key, proseCovers, sectionKey };
    });
    if (uncovered.length) {
      const judge = (slotKey: string, nom: { span: string; url: string }) =>
        judgeSlotSpan(slotKey, uncovered.find((x) => x.slotKey === slotKey)?.description ?? slotKey, nom);
      // FLOOR-FIRST pool: a FACT for a floor-applicable item is nominated ONLY from floor-qualifying sources
      // (floorPool, best-tier-first) so a confirmed span grounds AT the floor; a floor-EXEMPT item nominates
      // from the full tiered pool (any tier grounds). Empty floorPool (no floor source fetched) → no FACT.
      const slotNomPool = itemFloor == null ? groundWithTier : floorPool;
      const sc = await forceSlotCoverage(uncovered, slotNomPool.map((f) => ({ url: f.url, text: f.text, tier: f.tier })), judge, MAX_JUDGED_NOMINATIONS);
      const sectionOf = (slotKey: string) => uncovered.find((x) => x.slotKey === slotKey)?.sectionKey ?? (secs[0]?.section_key ?? "");
      for (const f of sc.facts) kept.push({ claim_kind: "FACT", claim_text: f.source_span, source_span: f.source_span, source_url: f.source_url, slot_key: f.slot_key, section: sectionOf(f.slot_key), search_result_id: null } as never);
      for (const g of sc.gaps) kept.push({ claim_kind: "GAP", claim_text: `[${g.slot_key}] not available from primary sources as of grounding`, source_span: null, source_url: null, slot_key: g.slot_key, section: sectionOf(g.slot_key), search_result_id: null } as never);
      slotForcing = { audit: sc.audit, relabelCandidates: sc.relabels.map((r) => ({ slot_key: r.slot_key, section: sectionOf(r.slot_key), reason: r.reason })), judgeCalls: sc.judgeCalls, factsForced: sc.facts.length, gapsForced: sc.gaps.length };
    }
  }

  const linked = crossLinkClaimSources(kept, searchRows);
  // CANONICAL TIER STAMP + HONEST ATTRIBUTION (F1 fix, Phase 0'/Phase 1). No constants, no primary
  // hardcode. A FACT claim is attributed to the source that CONTAINS ITS SPAN: resolve the span's pool
  // row (search_result_id -> result_url) to its institution's canonical registered source + tier via the
  // SINGLE `resolver` (built above, paginated + fail-closed) — same code the claims-tier audit certifies.
  // source_id = the resolved registered source (NULL when the span host is unregistered); the tier stamp
  // = the resolved canonical institutional tier (NULL when unregistered). Register-before-ground means
  // corroborator hosts are registered by now, so a corroborator-grounded claim resolves instead of
  // NULL-stamping spuriously.
  const urlBySearchId = new Map(searchRows.map((r) => [r.id, r.result_url]));
  // Reverse map for floor-first re-attribution: a floor source's fetched URL -> its pool-row id, so a
  // re-homed FACT re-points search_result_id to the floor source's row (first row wins on dup URLs).
  const searchIdByUrl = new Map<string, string>();
  for (const r of searchRows) if (r.result_url && !searchIdByUrl.has(r.result_url)) searchIdByUrl.set(r.result_url, r.id);
  // NON-DESTRUCTIVE: the new grounding is COLLECTED here (not inserted), then diffed + applied against the
  // preserved prior ledger below. Each entry is a claim-row payload identical to the historical insert shape.
  const incoming: Array<{ section_row_id: string; intelligence_item_id: string; claim_text: string; claim_kind: string; source_span: string | null; source_id: string | null; search_result_id: string | null; source_tier_at_grounding: number | null }> = [];
  // Dominance counters (re-grounds-never-destroy): the NEW grounding's FACT + floor-qualifying-FACT counts,
  // compared against the prior snapshot below so a WEAKER re-ground applies NOTHING (never replaces a stronger prior).
  let newFacts = 0, newFloorQualifying = 0;
  const citedSourceIds = new Set<string>(); // B#2: the sources this brief grounds against (item->source edges)
  // Ruling-5 self-surfacing: FACT spans that resolve to an UNREGISTERED host (null tier) aggregated per host,
  // upserted as ONE integrity_flag/host after the loop (the next lovdata.no is found mechanically, not by hand).
  const nullTierHosts = new Map<string, { factCount: number; samples: string[] }>();
  for (const c2 of linked) {
    const sectionRowId = sectionMap[String(c2.section)] || secs[0].id;
    const storedText = cleanCtl((["FACT", "GAP"].includes(c2.claim_kind) && c2.slot_key) ? `[${c2.slot_key}] ${c2.claim_text}` : c2.claim_text ?? "");
    const isFact = c2.claim_kind === "FACT";
    const spanUrl = c2.search_result_id ? urlBySearchId.get(c2.search_result_id) : undefined;
    // R1 (two-kinds-of-ANALYSIS): resolve + stamp the canonical institutional tier whenever the claim
    // carries a RESOLVABLE SPAN — a FACT (per-span attribution) OR a GROUNDED ANALYSIS (analysis OF a
    // credible non-binding source, e.g. WRI/ICAP/IEA at T3; span + tier so the surface renders the
    // "Credible analysis — [source]" register). PURE-INFERENCE ANALYSIS (the workspace's own reasoning
    // across in-brief facts, no single source) carries no span -> NULL tier -> renders as workspace
    // analysis with no source-tier label. Tier drives the LABEL only; the SECTION is the orthogonal
    // temporal axis (forthcoming -> forward section), enforced by the contract, NOT here (R2).
    let res = spanUrl ? resolver.resolveSpan(spanUrl) : { tier: null, sourceId: null };
    let effectiveSpanUrl = spanUrl;
    let effectiveSearchResultId: string | null = c2.search_result_id || null;
    // 4b FLOOR-FIRST RE-ATTRIBUTION (span-attribution unit, ruling 2026-07-03). A FACT whose
    // extractor-chosen source is sub-floor (or unregistered) but whose VERBATIM span ALSO sits in a
    // floor-qualifying source grounds AT the floor instead of walling on fact_below_authority_floor. The
    // span is re-homed to that floor source (source_id, tier stamp, and search_result_id all re-point).
    // NEVER FORCED (4c): reattributeToFloor fires ONLY on genuine verbatim presence — a span absent from
    // every floor source keeps its honest attribution (walls / relabels), never a fabricated floor stamp.
    // No-op for floor-exempt item types (floorPool empty) and for spans already at/above the floor.
    if (isFact) {
      const home = reattributeToFloor(c2.source_span, res.tier, floorPool, itemFloor);
      if (home) {
        effectiveSpanUrl = home.url;
        res = resolver.resolveSpan(home.url);
        const reSid = searchIdByUrl.get(home.url);
        if (reSid) effectiveSearchResultId = reSid;
      }
    }
    // FACT path (res.sourceId, NULL when unregistered/no-span). Grounded ANALYSIS attributes per-span like
    // FACT; pure-inference / GAP keep the ledger source_id (or item primary).
    const sourceId = isFact ? res.sourceId : (spanUrl ? (res.sourceId ?? c2.source_id ?? it.source_id) : (c2.source_id || it.source_id));
    // Ruling-5: a FACT that STILL resolves to a null tier (host not in the registry even after floor-first
    // re-attribution) is exactly the "unregistered authoritative host" signal — aggregate it per host.
    if (isFact && res.tier == null && effectiveSpanUrl) {
      const host = hostOf(effectiveSpanUrl);
      if (host) {
        const agg = nullTierHosts.get(host) ?? { factCount: 0, samples: [] };
        agg.factCount += 1;
        if (agg.samples.length < 3 && c2.source_span) agg.samples.push(String(c2.source_span).slice(0, 160));
        nullTierHosts.set(host, agg);
      }
    }
    // Phase 4.1 (SC-7 + the "label = render-derived, no stored field" principle): ONLY a FACT carries a
    // stored grounding-tier stamp (= the render-derived resolver.resolveSpan tier the claims-tier audit
    // compares stored-against). A non-FACT (grounded ANALYSIS / GAP) stores NULL — its tier LABEL is
    // render-derived at display from source_id, never a stored field. edit-1 wrongly stamped res.tier on
    // non-FACT here (the 41-row claims-tier drift, all ANALYSIS); `isFact ? res.tier : null` cures it.
    // NON-DESTRUCTIVE: collect the computed claim row (no insert). The dominance verdict + diff/apply below
    // decide add-new / version-changed / leave-unchanged against the preserved prior ledger.
    incoming.push({ section_row_id: sectionRowId, intelligence_item_id: itemId, claim_text: storedText ?? "", claim_kind: c2.claim_kind, source_span: cleanCtl(c2.source_span ?? null) ?? null, source_id: sourceId, search_result_id: effectiveSearchResultId, source_tier_at_grounding: isFact ? res.tier : null });
    if (isFact) {
      newFacts += 1;
      if (itemFloor != null && res.tier != null && res.tier <= itemFloor) newFloorQualifying += 1;
    }
    if (sourceId) citedSourceIds.add(sourceId);
  }
  // LEDGER DOMINANCE VERDICT — PRE-APPLY (re-grounds-never-destroy, RD-36, now a comparison verdict per the
  // non-destructive doctrine 2026-07-16). The new grounding (`incoming`, still in memory) is compared to the
  // preserved prior ledger BEFORE anything is written. A re-ground that is WEAKER on any dominance axis (FACT
  // count / floor-qualifying count / verified-eligibility — e.g. Brazil Lei 12.305 55 FACT -> 2 GAP, a non-EN
  // extraction failure) APPLIES NOTHING: the prior ledger was never deleted, so it is already intact — there is
  // no delete-then-restore. Record the regression as a finding and return LOUD ok:false, item state unchanged.
  const priorSummary = summarizeLedger(priorClaims ?? [], itemFloor);
  const nextSummary = { total: incoming.length, facts: newFacts, floorQualifying: newFloorQualifying, wouldVerify: false };
  // A verified item never reaches here (skip-if-verified guards upstream); pass the honest prior status.
  const priorWouldVerify = prov?.provenance_status === "verified";
  const reg = ledgerRegression({ ...priorSummary, wouldVerify: priorWouldVerify }, nextSummary);
  // CC-GROUNDING-EXECUTOR: the dominance guard protects against ACCIDENTAL thinning from a bad (e.g. non-EN)
  // Sonnet re-extract. A DELIBERATE executor re-source (injected) of a NON-VERIFIED item is different: the item
  // is quarantined precisely because its prior ledger is synthesized/sub-floor junk, so replacing it with the
  // verbatim-verified executor ledger is always an upgrade even when the raw FACT count drops (junk dropped).
  // The old ledger is preserved in claim_versions by applyLedgerDiff (non-destructive), and validate_item_
  // provenance is the real gate, so skipping the count-collapse rejection here is safe. Verified items never
  // reach ground (skip-if-verified upstream), so this can only ever version over a quarantined junk ledger.
  if (reg.regression && !injected) {
    const regDetail = `facts ${priorSummary.facts}->${nextSummary.facts}, floor-qual ${priorSummary.floorQualifying}->${nextSummary.floorQualifying}, total ${priorSummary.total}->${nextSummary.total}`;
    try {
      await sb.from("integrity_flags").insert({
        category: "data_integrity", subject_type: "item", subject_ref: itemId, status: "open",
        created_by: "reground_regression_guard",
        description: `Re-ground REGRESSION — new grounding NOT applied (non-destructive: prior ledger retained by construction) [${reg.axes.join(",")}]: ${regDetail}. A weaker re-extract did not replace the stronger prior — investigate the pool/extraction (non-EN extraction is the known cause).`.slice(0, 480),
        recommended_actions: [
          { action: "investigate extraction", rationale: `re-ground produced a weaker ledger on axes [${reg.axes.join(",")}]; ${regDetail}` },
          { action: "re-ground under the corrected mechanism", rationale: "the prior ledger is retained; a stronger re-extract will apply as adds/changes" },
        ],
      });
    } catch (e) { console.warn(`[canonical] dominance-guard finding write failed for ${itemId}: ${(e as Error).message}`); }
    return { ok: false, detail: `re-ground REGRESSION [${reg.axes.join(",")}]: ${regDetail}; prior ledger retained, new grounding not applied (non-destructive).`, slotForcing };
  }
  // NON-DESTRUCTIVE APPLY. Not a regression: diff the new grounding against the preserved prior ledger and apply
  // it — add genuinely-new claims, version changed claims (old state preserved in claim_versions), leave
  // unchanged + not-reproduced claims untouched. NEVER deletes a current claim. currentIds = the full current
  // ledger after apply; touchedFacts = the FACTs this ground added/changed (the mint-gate input below).
  const applyRes = await applyLedgerDiff(sb, itemId, diffLedger(priorClaims ?? [], incoming), { nowIso: new Date().toISOString() });
  const currentIds = applyRes.currentIds;
  gateFacts.push(...applyRes.touchedFacts);
  if (applyRes.applied.added === 0 && applyRes.applied.changed === 0) {
    console.log(`[canonical] non-destructive ground ${itemId}: NO GAIN (${applyRes.applied.unchanged} unchanged, ${applyRes.applied.notReproduced} kept-not-reproduced); prior ledger untouched`);
  } else {
    console.log(`[canonical] non-destructive ground ${itemId}: +${applyRes.applied.added} added, ${applyRes.applied.changed} versioned-changed, ${applyRes.applied.unchanged} unchanged, ${applyRes.applied.notReproduced} kept (${applyRes.applied.versioned} archived to claim_versions)`);
  }
  // MINT-GATE LIVE HOLD (hardening A1 flip). The four gates run over the FACTs this ground ADDED or CHANGED
  // (touchedFacts; unchanged/not-reproduced FACTs were already gated on their prior ground). S-CONFLATE = HARD
  // hold: mark the conflated FACTs with mint_hold_reason so validate_item_provenance (criterion 3,
  // fact_mint_hold) holds the item until a re-ground clears it. S-NUMERIC = SOFT hold: write a per-item
  // integrity_flag routed to live verification (real-but-mis-cited); the item STAYS verified-eligible.
  // authority-floor + generic-source are already enforced by the gate so they are logged, not re-held.
  {
    const conflateHeldIds = [...identityCongruenceHolds(gateFacts)].filter((x): x is string => typeof x === "string");
    if (conflateHeldIds.length) {
      const { error: hErr } = await sb.from("section_claim_provenance").update({ mint_hold_reason: "S-CONFLATE" }).in("id", conflateHeldIds);
      if (hErr) console.warn(`[mint-gates] S-CONFLATE hold update failed for ${itemId}: ${hErr.message}`);
    }
    const numericFacts = gateFacts.filter((f) => perFactGates(f, { itemFloor, suspendedSourceIds })?.spanNumeric);
    if (numericFacts.length) {
      const { error: fErr } = await sb.from("integrity_flags").insert({
        category: "data_quality", subject_type: "item", subject_ref: itemId, status: "open", created_by: "mint_gate_s_numeric",
        description: `S-NUMERIC soft hold: ${numericFacts.length} FACT claim(s) carry a figure absent from their stored span (real-but-mis-cited class — route to live verification, not content correction). Sample: ${numericFacts.slice(0, 2).map((f) => String(f.claim_text).slice(0, 80)).join(" | ")}`.slice(0, 480),
      });
      if (fErr) console.warn(`[mint-gates] S-NUMERIC flag insert failed for ${itemId}: ${fErr.message}`);
    }
    let floorN = 0, genericN = 0;
    for (const f of gateFacts) { const r = perFactGates(f, { itemFloor, suspendedSourceIds }); if (r?.authorityFloor) floorN += 1; if (r?.genericSource) genericN += 1; }
    if (conflateHeldIds.length || numericFacts.length || floorN || genericN) {
      console.log(`[mint-gates:live] ${itemId}: ${gateFacts.length} FACTs — HARD-held(conflate)=${conflateHeldIds.length} SOFT-flag(numeric)=${numericFacts.length} already-gated(floor=${floorN} generic=${genericN})`);
    }
  }
  // B#2 (Phase 1): write the item->source citation edges this brief grounds against into
  // intelligence_item_citations (origin='agent_extraction') — the table get_source_citation_stats (mig 098)
  // READS but generation never WROTE, so per-source citation counts were frozen at the mig-089 backfill.
  // Idempotent (UNIQUE(item,source,origin) -> ignore duplicates on re-ground). Best-effort: an edge-write
  // failure must NOT fail grounding (claims + validate are the integrity path; this is a credibility signal).
  if (citedSourceIds.size) {
    const iicTs = new Date().toISOString();
    const edges = [...citedSourceIds].map((sid) => ({ intelligence_item_id: itemId, source_id: sid, detected_at: iicTs, origin: "agent_extraction" as const }));
    const { error: iicErr } = await sb.from("intelligence_item_citations").upsert(edges, { onConflict: "intelligence_item_id,source_id,origin", ignoreDuplicates: true });
    if (iicErr) console.warn(`[canonical] intelligence_item_citations write failed for ${itemId} (${edges.length} edges): ${iicErr.message}`);
  }
  if (nullTierHosts.size) await surfaceNullTierHosts(sb, itemId, nullTierHosts);
  const { data: vrData, error: vrErr } = await sb.rpc("validate_item_provenance", { p_item_id: itemId } as never);
  const vr = (Array.isArray(vrData) ? vrData[0] : vrData) as { valid: boolean; recommended_status: string; failures: unknown } | undefined;
  if (vr?.valid) return { ok: true, detail: `grounded kept=${kept.length} -> ${vr.recommended_status}${slotForcing.judgeCalls ? ` (slot-forcing: +${slotForcing.factsForced}F/+${slotForcing.gapsForced}G, ${slotForcing.relabelCandidates.length} 4c-cand, ${slotForcing.judgeCalls} judge calls)` : ""}`, slotForcing };
  // B2 RETAIN-ON-FAILURE: the applied claims persist on a validation failure — they ARE the current ledger
  // (the per-insert set_provenance_status trigger already quarantined the item), a diagnosable artifact of WHY
  // grounding failed. Under the non-destructive doctrine the NEXT re-ground does NOT delete them; it DIFFS
  // against them (reproduced claims match as unchanged, so retention never duplicates; a better re-attribution
  // versions them; a claim the next ground drops is KEPT). currentIds retained intentionally.
  void currentIds;
  // Still clean up ONLY the fallback searches THIS step created (no stored pool) so the agent_run_searches
  // corpus does not accumulate across failed attempts; the generate-stored pool is left intact for re-ground.
  if (ownSearches && searchIds.length) await sb.from("agent_run_searches").delete().in("id", searchIds);
  // Lead with the DISTINCT failure reasons (not the URL/claim payload), so the workflow's reason-aware
  // retry can reliably detect a deterministic content class even after truncation (the earlier 140-char
  // slice put "url" before "reason" and cut "ungrounded_url" off — the reground-skip never fired).
  const fails = Array.isArray(vr?.failures) ? (vr!.failures as Array<{ reason?: string }>) : [];
  const reasons = [...new Set(fails.map((f) => f?.reason).filter(Boolean))];
  const why = vrErr ? `rpc error: ${vrErr.message}` : `validation failed [${reasons.join(",")}]: ${JSON.stringify(vr?.failures ?? "no result").slice(0, 120)}`;
  return { ok: false, detail: why.slice(0, 220), slotForcing };
}

/** STEP register (canonical order: generate -> REGISTER -> section -> ground -> credit). Registers the
 *  brief's "New Sources Identified" corroborators into the sources registry BEFORE grounding, so a
 *  corroborator-grounded FACT claim's host is registered at stamp time and resolves to a real
 *  institutional tier instead of NULL-stamping spuriously (the F1 register-before-ground ordering).
 *  BEST-EFFORT + IDEMPOTENT (registerCitedSources host-dedups; a failure must NOT abort generation) and
 *  NO crediting here — recordCitations + compoundSourceCredibility stay in growSources (no double-credit). */
export async function registerBriefSources(itemId: string): Promise<StepResult> {
  const sb = svc();
  const parts: string[] = [];
  // (1) ALWAYS register the GROUNDING-POOL corroborator hosts so a FACT span stamped against a pool
  //     corroborator resolves to a real tier the floor can EVALUATE — not NULL (which escapes the floor
  //     entirely, the sub-floor-masking defect). Independent of the brief's New-Sources table, which is
  //     why it runs even when that table is empty. Best-effort: a failure must NOT abort generation.
  try {
    const ph = await registerPoolHostsForGrounding(sb, itemId);
    parts.push(`pool-hosts +${ph.registered}/${ph.institutions} new`);
  } catch (e) { parts.push(`pool-hosts skipped: ${(e as Error).message.slice(0, 50)}`); }
  // (2) Register the brief-CITED corroborators (New-Sources table) for citation/credibility growth.
  try {
    const { data: it, error: itErr } = await sb.from("intelligence_items").select("full_brief").eq("id", itemId).single();
    if (itErr) console.warn(`[canonical] registerBriefSources full_brief read failed for ${itemId}: ${itErr.message}`);
    const cited = it?.full_brief ? parseNewSourcesFromBrief(it.full_brief) : [];
    if (cited.length) {
      const reg = await registerCitedSources(sb, cited);
      parts.push(`cited ${reg.filter((r) => r.source_id).length}/${cited.length}`);
    } else parts.push("cited 0");
  } catch (e) { parts.push(`cited skipped: ${(e as Error).message.slice(0, 50)}`); }
  return { ok: true, detail: parts.join("; ") };
}

/** STEP grow: register the brief's surfaced sources, record citations, compound credibility
 *  (the proven growSourcesFromBrief). */
export async function growSources(itemId: string): Promise<StepResult> {
  const sb = svc();
  const { data: it, error: itErr } = await sb.from("intelligence_items").select("source_id, full_brief").eq("id", itemId).single();
  if (itErr || !it?.source_id || !it.full_brief) return { ok: false, detail: `no source_id/full_brief${itErr ? `: ${itErr.message}` : ""}` };
  const res = await growSourcesFromBrief(sb, it.source_id, it.full_brief);
  const rep = res.reputation ? `${res.reputation.before}->${res.reputation.after}${res.reputation.changed ? "*" : ""}` : "n/a";
  return { ok: true, detail: `registered=${res.registered.length} citations+${res.citationsRecorded} trust_citation=${res.compound.after.trust_score_citation.toFixed(2)} reputation=${rep}` };
}
