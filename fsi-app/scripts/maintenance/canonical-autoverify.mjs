#!/usr/bin/env node
// canonical-autoverify.mjs — MAINT step that auto-verifies `canonical_source_candidates` rows
// (decision='pending'). Lane CANONICAL-AUTOVERIFY, 2026-09-06, ruling-confirmed same day: verification of
// a replacement source location is AUTOMATIC, never a human process — there is no `needs_individual_review`
// outcome. Every row this step reads resolves to `approved` or `rejected`, plus `deferred` for a
// transient fetch error only (not a human outcome — the fetch itself never completed; retried next run).
//
// OPERATOR RULING THIS BUILDS (verbatim, 2026-09-06): "the problem with this is that its a human process,
// if the web crawl surfaced a secondary location for the source it should also confirm that source is
// accurate and not wait on human intervention. it has the tools to review and find sources to start, so
// its completely capable of doing that again for the secondary source or new source location." CONFIRMED
// the same day after this step's first version still left two classes waiting on a human: an ambiguous
// candidate host (no codified authority tier) now ACCEPTS at the deterministic sub-floor default tier,
// registered PROVISIONAL — never stuck; a current source that is merely WALL-BLOCKED (403/WAF), not dead,
// now REJECTS the candidate outright — a wall is not a dead link, so the current citation stands and no
// authority-downgrade question is even reached.
//
// WHAT THIS REPLACES. The group-ruling path (scripts/review/lib/canonical-candidates.mjs +
// scripts/review/apply-canonical-candidates.mjs, wired by review-apply-canonical-candidates.mjs) only
// ever auto-resolves a candidate whose URL ALREADY matches a registered source; every other row —
// including every genuinely NEW source location the web crawl found — used to be routed to
// "needs_individual_review" and wait for a human. That is the human-process gap the ruling names. This
// step performs the SAME verification a human reviewer would (fetch the page, check it is not a wall/
// wrong-page-type, confirm the page actually supports the item's claim, rate its authority) and rules the
// row itself, all the way to a terminal outcome. `review-apply-canonical-candidates.mjs` is UNCHANGED and
// still applies a group ruling an operator has already taken (its own, separate `needs_individual_review`
// fallback is for a DIFFERENT unresolvable case — a group ruled "accept" that names a candidate needing a
// brand-new source with no existing registry match at all — untouched by this ruling); this step is the
// mechanism for the individual rows that path could not auto-resolve.
//
// $0 — no LLM call anywhere in this module. Every check below is a deterministic string/regex/host-class
// test, reusing modules that already exist rather than re-implementing them (CLAUDE.md "one module every
// caller imports"):
//   - REACHABILITY: the SAME $0 polite-fetch + captureDocument path provenance-heal.mjs's buildHealDeps
//     wires for scripts/mint/heal-provenance.mjs (makePoliteFetch({fetchImpl:fetch}) at 1 req/s ->
//     followUpgradingRedirects -> captureDocument, both from scripts/mint/export-census-rows.mjs), via
//     deps.fetchCandidate (test/CI-injectable — see buildDeps and politeCaptureFetch below). LANE
//     CANONICAL-AUTOVERIFY-3 (2026-09-07): this step previously wired deps.fetchCandidate to
//     src/lib/sources/canonical-fetch.mjs's browserlessFetch, a PAID rendering service whose key
//     (BROWSERLESS_API_KEY) is deliberately absent from .github/workflows/maintenance.yml — CLAUDE.md's
//     $0 rule forbids any paid service in any runtime, and there is no key to configure even if wanted
//     (a "render with Browserless when a key is present" fallback is explicitly NOT wanted here: this
//     step must never reference Browserless at all). Maintenance run 34069709848 (mode=dry) confirmed
//     the defect live: all 16 pending rows came back `deferred: fetch failed: BrowserlessError:
//     BROWSERLESS_API_KEY not configured` — every row stuck, nothing verified. politeCaptureFetch below
//     is the adapter: it holds the exact { status, text, error, host, path } shape decideRow and this
//     file's 52 tests already depend on, backed by plain fetch instead of a rendering service. Dead
//     codes and fetch/network failures are treated as REACHABILITY rejects/defers exactly as before
//     (never as a page-class or content-proof failure) — only the transport underneath changed.
//   - ACCESS WALL: src/lib/sources/access-wall.mjs's detectAccessWall — the ONE content-based bot-wall/
//     login-wall/soft-404 detector, reused verbatim (never a second wall detector).
//   - PAGE CLASS: a small pure classifier below (classifyPageClass), each rule citing the pending-row
//     example that motivated it (see the header comment on each RULE_*).
//   - CONTENT PROOF: scripts/mint/heal-provenance.mjs's locateSpanInText (the SAME verbatim/normalized/
//     numeric-tolerant span locator Gate-A figure healing uses), plus a word-overlap fallback
//     (wordsOverlapLocated below) for the case this step's own live-data audit found EVERY one of the 16
//     live pending rows in: an intelligence_item with NO FACT claims at all (SQL query, 2026-09-06 —
//     `select count(*) from claim_versions where intelligence_item_id = <any of the 16>` returns 0 for
//     all 16), so there is no figure/slot-claim token to locate. Rule 3's own fallback for exactly this
//     case — "the institution name plus the item's subject phrase both located" — therefore applies to
//     every row this step has actually seen live, not as an edge case.
//   - AUTHORITY: src/lib/sources/host-authority.mjs's codifiedTierForHost / classTierForHost /
//     permanentlyUnregisteredClass / defaultTierForHost, PLUS a live-registry lookup (existingTierForHost,
//     institutionKey-keyed exactly like db.mjs's registerSource dedups) — a host already registered
//     inherits its real tier before falling back to the static class table, the same order
//     scripts/mint/heal-provenance.mjs's classifyCitedUrlForOrphan uses. An AMBIGUOUS host (no codified
//     tier, not already registered) is not a dead end (SC-13 still forbids GUESSING an active tier, but
//     does not forbid registering PROVISIONAL at the sub-floor default — the same status
//     source-growth.ts's registerCitedSources already mints an unclassified machine-discovered host at):
//     content proof already passed, so it accepts, provisional, and tier-opinions.mjs's next dispatch is
//     the deterministic second look that can raise or confirm the tier once the host is actually in the
//     registry to opine about. An authority DOWNGRADE (a different-host candidate whose tier is worse than
//     the item's actually-linked current source) never auto-accepts unless the current source is CONFIRMED
//     dead (404/410/5xx/DNS) — reachable-but-walled (403/WAF/bot-check) is explicitly NOT dead and rejects
//     the candidate outright instead ("a wall is not a dead link": the current citation stands).
//   - REGISTRATION / RE-POINT on accept: scripts/lib/db.mjs's registerSource (the ONE source-registration
//     function — also used by heal-provenance.mjs's STEP SOURCE, never a third copy) plus a
//     guardedUpdateByIds repoint of intelligence_items.source_id/source_url, the SAME two-write shape
//     bulk-approve/route.ts's approve path and apply-canonical-candidates.mjs's accept path both use.
//     registerSource's own `extra` pass-through (already part of its signature, never a new parameter) is
//     how a provisional accept is minted `status: 'provisional'` instead of the function's normal
//     `'active'` default.
//
// DECISION OUTCOMES (only two human-relevant ones, no third): 'approved' (auto-accepted — either at a
// codified/existing tier, or PROVISIONAL at the sub-floor default for an ambiguous host) and 'rejected'
// (auto-rejected, reviewer_notes names the exact stage and reason). 'deferred' exists ONLY for a transient
// fetch error (network timeout/DNS failure/connection reset that never completed the request) — the row
// is left 'pending' and retried the next dispatch; it is not a verdict on the candidate and never a human
// wait.
//
// IDEMPOTENT: only decision='pending' rows are ever read or matched on write (readAll's own match +
// guardedUpdateByIds's applyMatch), so a re-run only ever touches rows still pending (which, after a clean
// apply, is only ever the 'deferred' rows from a transient fetch failure).
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "./lib/cli.mjs";
import { detectAccessWall } from "../../src/lib/sources/access-wall.mjs";
import { locateSpanInText } from "../mint/heal-provenance.mjs";
import { hostOf, institutionKey } from "../lib/institution-key.mjs";
import { captureDocument, followUpgradingRedirects, makePoliteFetch } from "../mint/export-census-rows.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// $0 FETCH ADAPTER — lane CANONICAL-AUTOVERIFY-3, 2026-09-07. See the header's REACHABILITY section for
// why: the paid Browserless path this step was wired to has no key anywhere in this repo's CI (by
// design — CLAUDE.md's $0 rule) and every one of the 16 pending rows deferred on
// `BROWSERLESS_API_KEY not configured` (run 34069709848). This module builds the SAME shape
// deps.fetchCandidate has always returned — { status, text, error, host, path } — from the identical
// $0 path scripts/maintenance/provenance-heal.mjs's buildHealDeps already wires for heal-provenance.mjs:
// makePoliteFetch({fetchImpl: fetch}) (1 req/s, no burst) -> followUpgradingRedirects (redirects hand-
// followed, an http Location upgraded to https before the next hop) -> captureDocument (charset/HTML-to-
// text decoding, PDF capture, timeout — all already inside export-census-rows.mjs, imported here, never
// copied). Nothing below re-implements a fetch; it only reshapes captureDocument's own
// { ok, status, html, text, error } envelope into the shape this file's decideRow/classifyReachability/
// detectAccessWall already expect.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Build a `fetchCandidate`-shaped function (test/CI-injectable — buildDeps below is the only production
 * caller) backed by the polite fetch + captureDocument path, never a rendering service. One politeness
 * instance
 * is shared across every call this function makes (module-level `politeFetch` created once per call to
 * this builder), so every candidate/current-source fetch in one dispatch run pays the same 1 req/s gate —
 * matching buildHealDeps's own per-run politeFetch instance, never a per-call fresh one that would let
 * concurrent rows burst.
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number, gapMs?: number }} [opts] `gapMs` defaults to
 *   makePoliteFetch's own POPULATION_FETCH_GAP_MS-or-1000ms default; tests pass 0 so the fixture suite
 *   does not pay the real politeness gap.
 * @returns {(url: string) => Promise<{status:number|null,text:string,error?:any,host?:string,path?:string}>}
 */
export function makeCanonicalFetchCandidate({ fetchImpl = fetch, timeoutMs = 20000, gapMs } = {}) {
  const politeFetch = makePoliteFetch(gapMs == null ? { fetchImpl } : { fetchImpl, gapMs }); // 1 req/s, $0 — same politeness gap heal-provenance uses
  return async function fetchCandidate(url) {
    const host = hostOf(url);
    let path = "";
    try { path = new URL(url).pathname; } catch { path = ""; }
    let res;
    try {
      res = await captureDocument(url, { fetchImpl: followUpgradingRedirects(politeFetch), timeoutMs });
    } catch (e) {
      // captureDocument itself never throws (it catches internally and returns { error }), but a stub
      // fetchImpl in a test might; treated identically to a captureDocument-reported transient error.
      return { status: null, text: "", error: e, host, path };
    }
    if (res.error && res.status == null) {
      // captureDocument's own catch branch: the request itself never completed (network error, DNS
      // failure, timeout, abort) — status is null, never a page was read. Routes to classifyReachability's
      // transient branch ('deferred'), never a page-class/content/authority verdict on nothing fetched.
      return { status: null, text: "", error: res.error, host, path };
    }
    // A completed request, 2xx or not (captureDocument's `error` field on a non-ok status is just
    // `HTTP <code>` restating res.status — classifyReachability already derives dead/wall/unreachable
    // from `status`+`text` alone, so that redundant error string is dropped here rather than carried
    // through as if it were a transient fetch failure).
    return { status: res.status, text: res.text ?? "", host, path };
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// REACHABILITY
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

/** HTTP status codes that mean "this URL is dead" — never a page-class or content question. Pure. */
export function isDeadStatus(status) {
  return status === 404 || status === 410 || (typeof status === "number" && status >= 500);
}

/**
 * Classify one fetch result. `fetchResult` = { status, text, error } — `error` set when the fetch itself
 * threw (network error, DNS failure, timeout — the request never completed, so nothing was
 * actually learned about the page). Pure.
 * @returns {{ ok: boolean, reason?: string, wall?: {kind:string, evidence:string}, transient?: boolean }}
 */
export function classifyReachability(fetchResult) {
  if (fetchResult?.error) {
    // TRANSIENT, not a verdict on the page: the fetch itself never completed, so this is not proof the
    // candidate (or the current source) is dead — the caller routes this to 'deferred', never 'rejected'
    // (rule: no human outcome, but also no false-negative reject of a possibly-good candidate).
    return { ok: false, transient: true, reason: `fetch failed: ${String(fetchResult.error).slice(0, 200)}` };
  }
  const status = fetchResult?.status;
  if (isDeadStatus(status)) {
    return { ok: false, reason: `dead (HTTP ${status})` };
  }
  const wall = detectAccessWall(fetchResult?.text ?? "", { host: fetchResult?.host, path: fetchResult?.path });
  if (wall) {
    return { ok: false, reason: `access wall (${wall.kind})`, wall };
  }
  if (typeof status === "number" && status >= 400) {
    return { ok: false, reason: `unreachable (HTTP ${status})` };
  }
  return { ok: true };
}

// A wall on the CANDIDATE is not evidence the candidate is unfit — it means this network could not
// verify it (lane CANONICAL-AUTOVERIFY-4, 2026-09-07, ruling-confirmed the same day after Maintenance run
// 34078398318, dry on master c25922f8: two of 16 rows rejected 'access wall (bot_challenge)' on candidate
// pages that had already passed content proof from the container — bsr.org/SAFA and napa.fi/Blue Visby.
// Rejecting a wall discards a valid replacement PERMANENTLY, since idempotency only re-reads
// decision='pending' rows — a rejected row is never looked at again. The fix: a WALLED CANDIDATE defers
// (decision stays 'pending', reviewer_notes carries the attempt count) so the next dispatch — maybe from a
// different network, maybe the wall itself lifts — gets to try again, capped at 3 attempts before finally
// giving up. This is deliberately asymmetric with the CURRENT source's own wall handling
// (checkAuthority's `downgrade_walled`, unchanged): a wall on the CURRENT source means "still alive, keep
// it" (never a dead link); a wall on the CANDIDATE means "not yet verified", which is a wait, not a
// verdict.
//
// The attempt count has nowhere to live but the row's own free-text `reviewer_notes` (no new column —
// CLAUDE.md's migration-DDL discipline, and a defer/retry counter is not schema-worthy). Encoded and
// parsed back verbatim against the exact phrase this module writes; a `reviewer_notes` value from any
// other stage (page-class, content-proof, a prior accept/reject) simply does not match and reads as
// attempt 0, same as a row that has never been walled before.
const WALL_MAX_ATTEMPTS = 3;
const WALL_ATTEMPT_RE = /access wall from this network \(attempt (\d+)\)/i;

/** How many prior CANDIDATE-wall defers this row has already recorded, read back from its own
 *  `reviewer_notes` (0 when absent/unmatched — a fresh row, or one deferred/rejected for any other
 *  reason). Pure. */
export function previousWallAttempts(reviewerNotes) {
  const m = WALL_ATTEMPT_RE.exec(String(reviewerNotes ?? ""));
  return m ? parseInt(m[1], 10) : 0;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// PAGE CLASS — pages that cannot be a source regardless of authority or content match. Each rule cites
// the live pending row (2026-09-06 SQL read) that motivated it.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

// RULE: login/sign-in gateway. Cites row 6f26a2db-ef92-4d38-ba0b-5be93731ee15 (candidate_url
// lr.org/.../sign-in-client-portal/, candidate_title "LR Client Portal – Fleet Data & Analytics" — a
// gated login screen, not the fleet-analytics documentation the item needs). detectAccessWall's own
// LOGIN_WALL_RE (access-wall.mjs) already catches most of these at reachability time; this URL/title
// check catches the ones whose captured text is a full marketing page ABOUT the login gate rather than
// the gate's own short wall text (this exact row's captured page describes portal features at length —
// too long to trip access-wall.mjs's SHORT_WALL_MAX_CHARS gate).
const LOGIN_GATEWAY_URL_RE = /\/(sign-?in|log-?in|client-?portal)(\/|$|[-_])/i;
const LOGIN_GATEWAY_TITLE_RE = /\b(sign[- ]?in|log[- ]?in|client portal)\b/i;

// RULE: /about page. Cites 44fa2c94-9415-4b39-8e89-8d6b9347345d (wri.org/about, "About WRI | World
// Resources Institute" — institutional boilerplate, not the transport-decarbonisation research the item
// cites) and f41f4db7-1554-4536-9b2b-24bc72fe5a9f (smartport.nl/en/over-ons/, "About Us – SmartPort").
const ABOUT_PAGE_URL_RE = /\/(about(-us)?|over-ons|uber-uns|a-propos)\/?(\?|$)/i;
const ABOUT_PAGE_TITLE_RE = /^about\b|^about us\b/i;

// RULE: directory/index listing with no single document named. Cites 2cd4e255-dbfd-43dc-89f1-ac5adf821a52
// (tyndall.ac.uk/reports/, "Reports – Tyndall Centre for Climate Change Research" — an index of ~57
// reports, no specific report the item's claim can be checked against).
const DIRECTORY_INDEX_URL_RE = /\/(reports|publications|documents|resources)\/?$/i;
const DIRECTORY_INDEX_TITLE_RE = /^(reports|publications|documents|resources)\b/i;

// RULE: press release, when the issue is a missing_link on a substantive (non-press-release) item. Cites
// 69398a99-48eb-472d-bf08-03ce6eb36d94 (lr.org press release "LR to acquire C-MAP Commercial from Navico
// Group" for item "Lloyd's Register Fleet Analytics" — an M&A announcement, not documentation of the
// fleet-analytics capability the item is about).
const PRESS_RELEASE_URL_RE = /\/press-(release|room|listing)\//i;
const PRESS_RELEASE_TITLE_RE = /\b(acqui(re|sition)|announces?|partnership announcement)\b/i;

// RULE: aggregator/tracker/directory DATACARD when the item's own subject IS the institution the datacard
// merely lists. A curated host list (never a fuzzy .org rule — same SC-13 posture as host-authority.mjs's
// own ASSOCIATION_ALLOW/STANDARDS_BODY_ALLOW). Cites:
//   - 53630325-dc29-41f9-9a78-3f1c137848c9: lobbyfacts.eu/datacard/efuel-alliance — item IS "E-Fuel
//     Alliance"; the datacard is a secondary EU-transparency-register mirror of that same org, not its
//     own primary site.
//   - 9d54f8ae-b30e-41e7-bea3-3936cf35c3a4: climate-laws.org/document/singapore-green-plan-2030 — item IS
//     "Singapore Green Plan 2030"; climate-laws.org is a law-tracker database entry, not the Singapore
//     government's own primary greenplan.gov.sg site (already registered at tier 1, live SQL).
//   - b0cdc058-9a5e-456d-856b-7a57a9ac659d: observatory.clean-hydrogen.europa.eu/directory/yara-clean-
//     ammonia — item IS "Yara Clean Ammonia"; the observatory page is a directory/matchmaking entry
//     ("Legal address: ... Activity: ... Visit official site"), not Yara's own primary site.
const AGGREGATOR_HOSTS = new Set(["lobbyfacts.eu", "climate-laws.org", "observatory.clean-hydrogen.europa.eu"]);
const AGGREGATOR_PATH_RE = /\/(datacard|document|directory)\//i;

/**
 * Classify a candidate page by pattern. Returns null when no reject rule fires. Pure.
 * @param {{ url: string, title?: string|null, text?: string, host?: string }} candidate
 * @returns {{ kind: string, reason: string } | null}
 */
export function classifyPageClass(candidate) {
  const url = String(candidate?.url ?? "");
  const title = String(candidate?.title ?? "");
  let path = "";
  try { path = new URL(url).pathname; } catch { path = url; }
  const host = candidate?.host || hostOf(url);

  if (LOGIN_GATEWAY_URL_RE.test(path) || LOGIN_GATEWAY_TITLE_RE.test(title)) {
    return { kind: "login_gateway", reason: `login/sign-in gateway (url or title names a sign-in/client-portal gate): ${url}` };
  }
  if (ABOUT_PAGE_URL_RE.test(path) || ABOUT_PAGE_TITLE_RE.test(title)) {
    return { kind: "about_page", reason: `institutional "About" page, not documentation of the item's subject: ${url}` };
  }
  if (DIRECTORY_INDEX_URL_RE.test(path) || DIRECTORY_INDEX_TITLE_RE.test(title)) {
    return { kind: "directory_index", reason: `directory/index listing with no single document named: ${url}` };
  }
  if (PRESS_RELEASE_URL_RE.test(path) || PRESS_RELEASE_TITLE_RE.test(title)) {
    return { kind: "press_release", reason: `press release / announcement, not documentation of the item's subject: ${url}` };
  }
  if (AGGREGATOR_HOSTS.has(host) && AGGREGATOR_PATH_RE.test(path)) {
    return { kind: "aggregator_datacard", reason: `aggregator/tracker/directory datacard for the item's own subject, not that subject's primary site: ${url}` };
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// CONTENT PROOF
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "into", "this", "that", "its", "of", "in", "on", "to", "a", "an",
  "is", "are", "at", "by", "as", "or",
]);

/** Significant words of a phrase: lowercase, alnum-only tokens, length >= 2, stopwords removed. Pure.
 *  Length 2 (not 3) so short-but-meaningful tokens (H2, EU, AI) survive. */
export function significantWords(phrase) {
  return String(phrase ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));
}

/**
 * A word-overlap fallback for locateSpanInText: true when at least half (rounded down, minimum 1) of a
 * phrase's significant words appear as a substring somewhere in `text` (case-insensitive, no word-boundary
 * requirement — a title's own spacing/capitalization ("H2 Accelerate") legitimately differs from how the
 * SAME name appears in a page's own prose ("H2Accelerate"), which locateSpanInText's char-level verbatim/
 * normalized tiers do not bridge; this is deliberately weaker than locateSpanInText and used ONLY as its
 * fallback, never in place of it when the exact phrase does locate). Pure.
 * @param {string} phrase @param {string} text
 * @returns {{ located: boolean, words: string[], found: string[] }}
 */
export function wordsOverlapLocated(phrase, text) {
  const words = significantWords(phrase);
  const hay = String(text ?? "").toLowerCase();
  const found = words.filter((w) => hay.includes(w));
  const need = Math.max(1, Math.ceil(words.length / 2));
  return { located: words.length > 0 && found.length >= need, words, found };
}

/** locateSpanInText first (verbatim/normalized/numeric-tolerant), else the word-overlap fallback. Pure. */
export function phraseLocated(phrase, text) {
  const exact = locateSpanInText(phrase, text);
  if (exact) return { located: true, method: exact.method };
  const fallback = wordsOverlapLocated(phrase, text);
  return { located: fallback.located, method: fallback.located ? "word_overlap" : null, words: fallback.words, found: fallback.found };
}

/**
 * A `candidate_publisher` value is often "Core Name (trailing annotation)" — the annotation is sometimes
 * a genuine alternate name a page uses instead of the full name (row 44fa2c94: "World Resources Institute
 * (WRI)" — the page says "About WRI"), sometimes pure descriptive metadata a page never restates verbatim
 * (row 7aae8bba, live 2026-09-06: "GreenBlue (parent 501(c)(3) nonprofit of SPC)" — greenblue.org's own
 * page says "GreenBlue" and "SPC" throughout but never "nonprofit"/"501"/"parent", so word-overlap's
 * half-the-words threshold against the FULL descriptive string undercounts an institution the page
 * plainly is). Rather than guess which case a given publisher string is (SC-13's own posture — never
 * infer intent from a string), try BOTH the whole string and its two natural sub-parts (everything before
 * the first "(", and the content of that parenthetical with one trailing ")" stripped) as independent
 * name candidates — the institution check below passes if ANY of them locates. Pure.
 * @param {string} name @returns {string[]} at least one entry (the trimmed input), more if it parenthesizes.
 */
export function institutionNameCandidates(name) {
  const s = String(name ?? "").trim();
  if (!s) return [];
  const idx = s.indexOf("(");
  if (idx === -1) return [s];
  const before = s.slice(0, idx).trim();
  let inside = s.slice(idx + 1).trim();
  if (inside.endsWith(")")) inside = inside.slice(0, -1).trim();
  const out = [s];
  if (before && before !== s) out.push(before);
  if (inside && inside !== s) out.push(inside);
  return out;
}

/** institutionNameCandidates + phraseLocated, OR'd across every candidate name — located as soon as ONE
 *  of them locates (see institutionNameCandidates's own header for why more than one name is tried). Pure. */
export function institutionLocated(institutionName, text) {
  for (const candidate of institutionNameCandidates(institutionName)) {
    const r = phraseLocated(candidate, text);
    if (r.located) return r;
  }
  return { located: false, method: null };
}

/**
 * Content proof for one candidate. `factTokens` are the item's own verbatim FACT source_spans (Gate-A
 * figure tokens / slot claims), when it has any — tried FIRST, per rule 3. Every one of the 16 live
 * pending rows this step has been run against carries zero FACT claims (SQL, 2026-09-06), so
 * `factTokens` is `[]` for all of them and the institution+subject fallback is what actually decides
 * every row — documented here rather than left as an untested branch.
 * @param {{ text: string, institutionName: string, subjectTitle: string, factTokens?: string[] }} args
 * @returns {{ pass: boolean, method: string, located: object[], reason: string }}
 */
export function proveContent({ text, institutionName, subjectTitle, factTokens = [] }) {
  for (const token of factTokens) {
    const hit = locateSpanInText(token, text);
    if (hit) return { pass: true, method: "fact_token", located: [{ token, method: hit.method }], reason: `FACT token located verbatim (${hit.method}).` };
  }
  const inst = institutionLocated(institutionName, text);
  const subj = phraseLocated(subjectTitle, text);
  if (inst.located && subj.located) {
    return {
      pass: true,
      method: "institution_and_subject",
      located: [{ what: "institution", value: institutionName, method: inst.method }, { what: "subject", value: subjectTitle, method: subj.method }],
      reason: `institution ("${institutionName}") and subject ("${subjectTitle}") both located on the page.`,
    };
  }
  const missing = [!inst.located && "institution", !subj.located && "subject"].filter(Boolean).join(" and ");
  return { pass: false, method: "none", located: [], reason: `content not on page — ${missing} not located (no FACT tokens available to try instead).` };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// AUTHORITY
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

/** Best known tier for a host from the LIVE registry, keyed the SAME way registerSource dedups
 *  (institutionKey) — an already-registered host inherits its real tier before any static class-table
 *  fallback, mirroring scripts/mint/heal-provenance.mjs's classifyCitedUrlForOrphan. Pure given `sources`.
 *  @param {string} host @param {Array<{url:string,status:string,base_tier:number,tier_override?:number}>} sources
 *  @returns {{ sourceId: string, tier: number } | null} */
export function existingTierForHost(host, sources, sourcesById) {
  if (!host) return null;
  const key = institutionKey(`https://${host}/`);
  for (const s of sources ?? []) {
    if (s.status !== "active") continue;
    if (institutionKey(s.url) !== key) continue;
    const tier = s.tier_override ?? s.base_tier ?? null;
    if (tier == null) continue;
    return { sourceId: s.id, tier };
  }
  return null;
}

/**
 * The tier of the item's ACTUALLY-LINKED current source, or null when the item has none (`missing_link`
 * rows always carry `current_source_id: null` — there is no established authority to protect, so a
 * host-tier guess off `current_source_url`'s text is not a real "current" to downgrade from; only
 * `stale_url` rows carry a real `current_source_id`). Exact-id lookup, never a host-based re-derivation —
 * the row that is actually cited may sit at a different exact URL than any other row sharing its host.
 * Pure given `sources`.
 * @param {string|null} currentSourceId @param {Array<{id:string,base_tier:number,tier_override?:number}>} sources
 */
export function linkedCurrentTier(currentSourceId, sources) {
  if (!currentSourceId) return null;
  const s = (sources ?? []).find((row) => row.id === currentSourceId);
  if (!s) return null;
  return s.tier_override ?? s.base_tier ?? null;
}

/**
 * Authority check for a candidate. `codifiedTierForHost`/`classTierForHost`/`permanentlyUnregisteredClass`
 * are injected (from host-authority.mjs) so this module stays free of the .ts import (this file is plain
 * .mjs; the maintenance wrapper below imports the compiled host-authority helpers through a dynamic
 * import so the same TS module every route/heal-provenance uses is the one authority source, never a
 * second copy). Never returns a bare "needs a human" failure (operator ruling 2026-09-06): an AMBIGUOUS
 * candidate host (no codified tier, not already registered) is reported as `kind: "ambiguous"` — the
 * caller (decideRow) turns this into an ACCEPT at the deterministic sub-floor default
 * (`host-authority.ts`'s own `defaultTierForHost`), registered PROVISIONAL — the SAME status the registry
 * already mints an unclassified machine-discovered host at (`source-growth.ts`'s `registerCitedSources`,
 * `status: "provisional"` when a citation's host does not classify), never a guessed ACTIVE tier. A
 * genuine AUTHORITY DOWNGRADE (candidate tier worse than the item's actually-linked current source) still
 * never auto-accepts UNLESS that current source is CONFIRMED dead (`currentIsConfirmedDead`) — reachable-
 * but-walled (`currentIsWalled`, 403/WAF/bot-check) is explicitly NOT dead and reports `kind:
 * "downgrade_walled"` so the caller REJECTS the candidate outright (the current citation stands; only a
 * confirmed-dead current URL licenses a different-publisher replacement). Pure given its inputs.
 * @param {{ candidateHost: string, currentHost: string, currentSourceId: string|null, sources: any[],
 *   classTierForHost: Function, permanentlyUnregisteredClass: Function, currentIsConfirmedDead: boolean,
 *   currentIsWalled: boolean }} args
 */
export function checkAuthority({
  candidateHost, currentHost, currentSourceId, sources, classTierForHost, permanentlyUnregisteredClass,
  currentIsConfirmedDead, currentIsWalled,
}) {
  if (permanentlyUnregisteredClass(candidateHost) != null) {
    return { ok: false, kind: "permanent", tier: null, reason: `${candidateHost} is a permanently-unregistered host class (aggregator/hosting-platform) — never the publisher.` };
  }
  const candExisting = existingTierForHost(candidateHost, sources);
  const candTier = candExisting?.tier ?? classTierForHost(candidateHost);
  // SAME HOST checked BEFORE the ambiguous branch, deliberately: candidateHost === currentHost can never
  // be a downgrade (it is literally the org's own site the item already points at), so it is never worth
  // minting a NEW provisional registration for a host that may simply not be in `sources` under either
  // row's exact URL yet — e.g. row 643f8625 (Fraunhofer IML): `iml.fraunhofer.de` IS already registered
  // (active, tier 3) under a different exact path than either this row's current or candidate URL, and
  // existingTierForHost's institutionKey match finds it regardless of which of the two paths is asked.
  if (candidateHost === currentHost) {
    return { ok: true, tier: candTier, sourceId: candExisting?.sourceId ?? null, reason: `same host as current source, tier ${candTier ?? "unregistered — accepted on host identity alone"}.` };
  }
  if (candTier == null) {
    return {
      ok: false, kind: "ambiguous", tier: null, sourceId: candExisting?.sourceId ?? null,
      reason: `${candidateHost} has no codified authority tier — content proof passed, so it registers ` +
        `provisional at its deterministic default tier rather than waiting on a human; tier-opinions ` +
        `refines it on its next dispatch.`,
    };
  }
  // Only a REAL linked current source is something to protect (see linkedCurrentTier's own header). A
  // missing_link row (currentSourceId null) has no established authority to downgrade FROM — any
  // content-proven, tier-resolvable candidate is strictly an improvement over no source at all.
  const currTier = linkedCurrentTier(currentSourceId, sources);
  if (currTier == null || candTier <= currTier) {
    return { ok: true, tier: candTier, sourceId: candExisting?.sourceId ?? null, reason: `tier ${candTier} does not downgrade the current host's tier (${currTier ?? "unknown / no linked current source"}).` };
  }
  if (currentIsConfirmedDead) {
    return { ok: true, tier: candTier, sourceId: candExisting?.sourceId ?? null, reason: `current host tier ${currTier} but its URL is confirmed dead — downgrade to tier ${candTier} accepted.` };
  }
  if (currentIsWalled) {
    return {
      ok: false, kind: "downgrade_walled", tier: candTier, sourceId: candExisting?.sourceId ?? null,
      reason: "current source reachable behind an access wall; candidate is a different publisher.",
    };
  }
  return {
    ok: false, kind: "downgrade", tier: candTier, sourceId: candExisting?.sourceId ?? null,
    reason: `would downgrade authority (current tier ${currTier} -> candidate tier ${candTier}) with no proof the current source is dead.`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// PER-ROW DECISION
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Decide one candidate row. Pure given its inputs (the fetches already happened in the caller).
 * @param {object} row canonical_source_candidates row
 * @param {{ title: string }} item the item's { title } (subject phrase)
 * @param {object} fetchResult { status, text, error, host, path } — the CANDIDATE fetch
 * @param {object} deps { sources, classTierForHost, permanentlyUnregisteredClass, defaultTierForHost,
 *   currentIsConfirmedDead, currentIsWalled, factTokens }
 */
export function decideRow(row, item, fetchResult, deps) {
  const candidateHost = hostOf(row.candidate_url);
  const currentHost = hostOf(row.current_source_url || "");

  const reach = classifyReachability(fetchResult);
  if (!reach.ok) {
    if (reach.transient) {
      // Not a human outcome, not a verdict on the candidate — the fetch itself never completed (network
      // blip, DNS failure, timeout). Left 'pending' by the caller; retried next dispatch.
      return {
        id: row.id, decision: "deferred",
        reviewer_notes: `auto: deferred, ${reach.reason}, retry next run`,
        verified_status_code: fetchResult?.status ?? null,
        verified_content_excerpt: null,
        proof: { stage: "reachability", ...reach },
      };
    }
    if (reach.wall) {
      // A wall on the CANDIDATE is "could not verify from this network", never "the page is unfit" (see
      // this file's WALL_MAX_ATTEMPTS header). Capped retry, not an immediate reject: attempt 1-2 defers
      // (decision stays 'pending'), attempt 3 finally rejects — the ONLY case a candidate-side wall ever
      // produces a terminal 'rejected'.
      const attempt = previousWallAttempts(row.reviewer_notes) + 1;
      if (attempt >= WALL_MAX_ATTEMPTS) {
        return {
          id: row.id, decision: "rejected",
          reviewer_notes: `auto: reject, candidate unverifiable behind an access wall after ${WALL_MAX_ATTEMPTS} attempts`,
          verified_status_code: fetchResult?.status ?? null,
          verified_content_excerpt: null,
          proof: { stage: "reachability", ...reach, wallAttempt: attempt },
        };
      }
      return {
        id: row.id, decision: "deferred",
        reviewer_notes: `auto: deferred, candidate behind an access wall from this network (attempt ${attempt}), retry next run`,
        verified_status_code: fetchResult?.status ?? null,
        verified_content_excerpt: null,
        proof: { stage: "reachability", ...reach, wallAttempt: attempt },
      };
    }
    return {
      id: row.id, decision: "rejected",
      reviewer_notes: `auto: reject, ${reach.reason}`,
      verified_status_code: fetchResult?.status ?? null,
      verified_content_excerpt: null,
      proof: { stage: "reachability", ...reach },
    };
  }

  const pageClass = classifyPageClass({ url: row.candidate_url, title: row.candidate_title, host: candidateHost, text: fetchResult.text });
  if (pageClass) {
    return {
      id: row.id, decision: "rejected",
      reviewer_notes: `auto: reject, ${pageClass.reason}`,
      verified_status_code: fetchResult?.status ?? null,
      verified_content_excerpt: String(fetchResult.text ?? "").slice(0, 500),
      proof: { stage: "page_class", ...pageClass },
    };
  }

  const content = proveContent({
    text: fetchResult.text,
    institutionName: row.candidate_publisher || row.candidate_title || candidateHost,
    subjectTitle: item?.title || "",
    factTokens: deps.factTokens ?? [],
  });
  if (!content.pass) {
    return {
      id: row.id, decision: "rejected",
      reviewer_notes: `auto: reject, ${content.reason}`,
      verified_status_code: fetchResult?.status ?? null,
      verified_content_excerpt: String(fetchResult.text ?? "").slice(0, 500),
      proof: { stage: "content_proof", ...content },
    };
  }

  const authority = checkAuthority({
    candidateHost, currentHost,
    currentSourceId: row.current_source_id ?? null,
    sources: deps.sources ?? [],
    classTierForHost: deps.classTierForHost,
    permanentlyUnregisteredClass: deps.permanentlyUnregisteredClass,
    currentIsConfirmedDead: !!deps.currentIsConfirmedDead,
    currentIsWalled: !!deps.currentIsWalled,
  });

  if (!authority.ok && authority.kind === "ambiguous") {
    // ACCEPT (operator ruling 2026-09-06): content proof already passed — the same verification a human
    // reviewer would perform — so an ambiguous candidate host registers PROVISIONAL at the deterministic
    // sub-floor default (host-authority.ts's defaultTierForHost: the codified tier if one exists, else
    // PROVISIONAL_DEFAULT_TIER=5), the SAME status the registry already uses for a machine-discovered host
    // that does not classify (source-growth.ts's registerCitedSources). Never guessed ACTIVE, never stuck
    // waiting on a human: tier-opinions.mjs's next dispatch is the deterministic second look that can
    // raise or confirm the tier once the host is actually in the registry to opine about.
    const provisionalTier = deps.defaultTierForHost ? deps.defaultTierForHost(candidateHost) : null;
    return {
      id: row.id, decision: "approved",
      reviewer_notes: `auto: accepted; tier provisional (default ${provisionalTier}), tier-opinions refines`,
      verified_status_code: fetchResult?.status ?? null,
      verified_content_excerpt: String(fetchResult.text ?? "").slice(0, 500),
      proof: { stage: "accept_provisional", content, authority },
      candidateHost, authorityTier: provisionalTier, existingSourceId: null, provisional: true,
    };
  }

  if (!authority.ok) {
    // "permanent" (aggregator/hosting-platform) or "downgrade"/"downgrade_walled" — every remaining
    // authority failure is a REJECT, never a human wait. `downgrade_walled` uses authority.reason verbatim
    // (operator ruling 2026-09-06: "a wall is not a dead link" — the current citation stands).
    return {
      id: row.id, decision: "rejected",
      reviewer_notes: `auto: reject, ${authority.reason}`,
      verified_status_code: fetchResult?.status ?? null,
      verified_content_excerpt: String(fetchResult.text ?? "").slice(0, 500),
      proof: { stage: "authority", content, ...authority },
    };
  }

  if (authority.tier == null) {
    // Same host as current, but genuinely unregistered anywhere yet (no existing tier, no codified
    // class) — the identity match still licenses the accept (it is the org's own site the item already
    // names), but there is no known tier to inherit, so this is the SAME provisional-default posture as
    // the ambiguous branch above, never a guessed/defaulted-to-7 registerSource insert.
    const provisionalTier = deps.defaultTierForHost ? deps.defaultTierForHost(candidateHost) : null;
    return {
      id: row.id, decision: "approved",
      reviewer_notes: `auto: accepted (same host as current source, unregistered); tier provisional (default ${provisionalTier}), tier-opinions refines`,
      verified_status_code: fetchResult?.status ?? null,
      verified_content_excerpt: String(fetchResult.text ?? "").slice(0, 500),
      proof: { stage: "accept_provisional", content, authority },
      candidateHost, authorityTier: provisionalTier, existingSourceId: null, provisional: true,
    };
  }

  return {
    id: row.id, decision: "approved",
    reviewer_notes: `auto: ${content.reason} host tier ${authority.tier} (${authority.reason})`,
    verified_status_code: fetchResult?.status ?? null,
    verified_content_excerpt: String(fetchResult.text ?? "").slice(0, 500),
    proof: { stage: "accept", content, authority },
    candidateHost, authorityTier: authority.tier, existingSourceId: authority.sourceId ?? null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

const TABLE = "canonical_source_candidates";
const SELECT_COLUMNS =
  "id,intelligence_item_id,current_source_id,current_source_url,issue_classification,candidate_url," +
  "candidate_title,candidate_publisher,confidence,decision,reviewer_notes";

export const CITE = Object.freeze({
  skill: "canonical-autoverify",
  reason:
    "Auto-verify a canonical_source_candidates row (operator ruling 2026-09-06: 'it has the tools to " +
    "review and find sources to start, so its completely capable of doing that again for the secondary " +
    "source or new source location' — a web-crawl-surfaced replacement source is machine-verifiable, not " +
    "a human-wait item). Reachability + page-class + content-proof + authority, no LLM call.",
});

const matchQueue = (qb) => qb.eq("decision", "pending");

/**
 * @param {{ mode?: "dry"|"apply" }} opts
 * @param {{ readAll: Function, guardedUpdateByIds: Function, registerSource: Function,
 *   fetchCandidate: (url: string) => Promise<{status:number,text:string,host?:string,path?:string,error?:any}>,
 *   hostAuthority: { classTierForHost: Function, permanentlyUnregisteredClass: Function,
 *     defaultTierForHost: Function } }} deps
 */
export async function main({ mode = "dry" } = {}, deps) {
  const apply = mode === "apply";
  const summary = { step: "canonical-autoverify", mode, counts: {}, applied: 0, read_back: {}, exitCode: 0 };

  const rows = await deps.readAll(TABLE, SELECT_COLUMNS, { match: matchQueue });
  const itemIds = [...new Set(rows.map((r) => r.intelligence_item_id).filter(Boolean))];
  const items = itemIds.length ? await deps.readAllByIds("intelligence_items", "id,title", itemIds) : [];
  const itemById = new Map(items.map((it) => [it.id, it]));
  const sources = await deps.readAll("sources", "id,url,status,base_tier,tier_override");

  const verdicts = [];
  for (const row of rows) {
    const fetchResult = await deps.fetchCandidate(row.candidate_url).catch((e) => ({ error: e, status: null, text: "" }));

    // The CURRENT source's own reachability decides dead-vs-walled for the authority-downgrade rule
    // (checkAuthority's own header) — only fetched when there is a current URL at all (a missing_link
    // row's currentHost is never load-bearing for the downgrade check, but fetching costs nothing extra
    // to keep this simple and uniform rather than conditioning on issue_classification).
    let currentIsConfirmedDead = false, currentIsWalled = false;
    if (row.current_source_url) {
      const currentFetch = await deps.fetchCandidate(row.current_source_url).catch((e) => ({ error: e, status: null, text: "" }));
      const currentReach = classifyReachability(currentFetch);
      if (!currentReach.ok) {
        if (currentReach.wall) currentIsWalled = true;
        else if (!currentReach.transient) currentIsConfirmedDead = true;
        // a TRANSIENT current-fetch failure proves nothing either way — left both false, same as an
        // untested current source; the row's own candidate-side reachability still governs its verdict.
      }
    }

    const item = itemById.get(row.intelligence_item_id) ?? null;
    const verdict = decideRow(row, item, fetchResult, {
      sources,
      classTierForHost: deps.hostAuthority.classTierForHost,
      permanentlyUnregisteredClass: deps.hostAuthority.permanentlyUnregisteredClass,
      defaultTierForHost: deps.hostAuthority.defaultTierForHost,
      currentIsConfirmedDead,
      currentIsWalled,
      factTokens: [], // every live row this step has seen carries zero FACT claims — see proveContent's own header
    });
    verdicts.push(verdict);
  }

  summary.counts = {
    pending_read: rows.length,
    approved: verdicts.filter((v) => v.decision === "approved").length,
    rejected: verdicts.filter((v) => v.decision === "rejected").length,
    deferred: verdicts.filter((v) => v.decision === "deferred").length,
  };
  summary.verdicts = verdicts.map((v) => ({ id: v.id, decision: v.decision, reviewer_notes: v.reviewer_notes }));

  if (!apply) {
    summary.note = `dry: ${rows.length} pending row(s) fetched and classified — see verdicts. Writes nothing.`;
    return summary;
  }

  let approvedApplied = 0, rejectedApplied = 0;
  const deferred = [];
  for (const v of verdicts) {
    if (v.decision === "deferred") {
      deferred.push({ id: v.id, reason: v.reviewer_notes });
      if (v.proof?.wall) {
        // Candidate-wall defer: the attempt count has to survive to the NEXT dispatch, and this row's
        // decision stays 'pending' (never touched by matchQueue on any other row), so the ONLY place it
        // can live is this row's own reviewer_notes — write that one field, nothing else (previousWallAttempts
        // reads it back next run). A transient-fetch defer writes nothing, same as before this fix: there is
        // no attempt cap for a plain network blip, only for a confirmed wall.
        await deps.guardedUpdateByIds(TABLE, [v.id], {
          reviewer_notes: v.reviewer_notes,
        }, { cite: CITE, select: "id", applyMatch: matchQueue });
      }
      continue;
    }
    if (v.decision === "rejected") {
      await deps.guardedUpdateByIds(TABLE, [v.id], {
        decision: "rejected", reviewed: true, reviewer_notes: v.reviewer_notes,
        verified: false, verified_status_code: v.verified_status_code, verified_content_excerpt: v.verified_content_excerpt,
      }, { cite: CITE, select: "id", applyMatch: matchQueue });
      rejectedApplied += 1;
      continue;
    }
    // approved — either an existing/codified-tier source (v.existingSourceId or a codified candTier), or
    // an ambiguous-host provisional accept (v.provisional): registerSource dedups by institutionKey either
    // way, so a host already registered under either status is reused, never duplicated.
    let sourceId = v.existingSourceId;
    if (!sourceId) {
      const reg = await deps.registerSource({
        url: v.candidateHost ? `https://${v.candidateHost}/` : (rows.find((r) => r.id === v.id) || {}).candidate_url,
        name: v.candidateHost, base_tier: v.authorityTier,
        // The SAME provisional status the registry already mints an unclassified machine-discovered host
        // at (source-growth.ts's registerCitedSources) — never a guessed ACTIVE tier (SC-13).
        ...(v.provisional ? { extra: { status: "provisional" } } : {}),
      }, { cite: CITE });
      sourceId = reg.source_id;
    }
    const row = rows.find((r) => r.id === v.id);
    await deps.guardedUpdateByIds(TABLE, [v.id], {
      decision: "approved", reviewed: true, reviewer_notes: v.reviewer_notes, promoted_to_source_id: sourceId,
      verified: true, verified_status_code: v.verified_status_code, verified_content_excerpt: v.verified_content_excerpt,
    }, { cite: CITE, select: "id", applyMatch: matchQueue });
    await deps.guardedUpdateByIds("intelligence_items", [row.intelligence_item_id], {
      source_id: sourceId, source_url: row.candidate_url,
    }, { cite: CITE, select: "id" });
    approvedApplied += 1;
  }

  summary.applied = approvedApplied + rejectedApplied;
  summary.deferred = deferred;

  const readBack = await deps.readAllByIds(TABLE, "id,decision,promoted_to_source_id,intelligence_item_id", rows.map((r) => r.id));
  summary.read_back = {
    rows_named: rows.length,
    rows_now_live: readBack.length,
    approved_now: readBack.filter((r) => r.decision === "approved").length,
    rejected_now: readBack.filter((r) => r.decision === "rejected").length,
    still_pending: readBack.filter((r) => r.decision === "pending").length,
  };
  return summary;
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "canonical-autoverify",
    main,
    needsDb: true,
    buildDeps: async () => {
      const { readAll, readAllByIds, guardedUpdateByIds, registerSource } = await import("../lib/db.mjs");
      const hostAuthority = await import("../../src/lib/sources/host-authority.ts");
      // $0 — polite fetch + captureDocument (see this file's header REACHABILITY section and
      // makeCanonicalFetchCandidate's own header). Browserless is not referenced anywhere in this step.
      const fetchCandidate = makeCanonicalFetchCandidate();
      return { readAll, readAllByIds, guardedUpdateByIds, registerSource, fetchCandidate, hostAuthority };
    },
  });
}
