// TRANSPORT ESCALATION LADDER + WRITE-SIDE CAPTURE VERDICT (dispatch 2026-07-06, invariant RD-14).
//
// THE CLASS FIX (complements RD-11 hold gate + RD-13 read-side error-body gate): the capture layer used to
// STORE failed fetches (Cloudflare/Radware bot walls, 403/Access-Denied, federalregister/eCFR "Request Access"
// blocks, 404s, EUR-Lex nav shells, JS shells) as "source content"; grounding then copied error/nav text as
// verbatim FACTs (the fabricate-via-error-page moat breach). RD-13 gates READ-side consumption. THIS module is
// the WRITE-side complement + the per-failure-class escalation LADDER:
//
//   (a) canonical-URL cache first (fetch-hold.mjs owns the cache; injected via `cacheGet`).
//   (b) block / bot-wall on one transport → try the OTHER transport, in EITHER direction (fires on the 403
//       class, not only cdn_block).
//   (c) JS-shell / soft-404 (a 200 whose body is a client-render placeholder, isErrorBody-style) → the
//       Browserless render path (which executes JS), regardless of the host's default order.
//   (d) API-transport for API hosts — federalregister.gov + eCFR expose OFFICIAL JSON APIs; route to the API,
//       NEVER the HTML page (the HTML returns "Request Access" to scrapers). host → transport selection.
//   (e) a genuine 404/410 (or soft-404) after the ladder → emit a SEEK-MORE task (alternate-URL discovery),
//       NEVER a stored error body.
//   (f) ladder exhausted on blocks/walls → record the verdict + the item HOLDS with a named reason
//       NO_REACHABLE_SOURCE, event-bound (re-collect at hold-lift). NEVER a stored error body.
//
// THE DOCTRINE (skill remediation-discipline, category 13): transport failure is never terminal and never
// stored; quarantine is the honest state only for genuine ungroundability after mechanical exhaustion, named
// and event-bound, never a fetch-failure artifact.
//
// PURE + DEP-INJECTED: classifyTransportResult / selectTransportOrder / apiEndpointFor / captureForStorage are
// pure; escalateFetch takes the transports as injected deps (cacheGet, apiFetch, directFetch, browserlessRender,
// seekMore) so NO real fetch happens in tests. Reuses the single-home detectors: isErrorBody (entity-gate.mjs),
// detectRoadblock (primary-fallback.mjs), partitionErrorBodies (entity-gate.mjs). GOVERNING: remediation-
// discipline (category 13, RD-14) + source-credibility-model (the moat).

import { isErrorBody } from "./entity-gate.mjs";
import { detectRoadblock } from "./primary-fallback.mjs";

// ── FAILURE CLASSES ─────────────────────────────────────────────────────────────────────────────────────
export const CLASS = Object.freeze({
  OK: "ok",
  HTTP_404: "http_404",
  HTTP_410: "http_410",
  HTTP_403: "http_403",       // 403 / any other 4xx access-permission refusal
  HTTP_5XX: "http_5xx",
  TIMEOUT: "timeout",
  CDN_BLOCK: "cdn_block",     // CloudFront/Akamai 200-wrapped 403 (datacenter-IP WAF)
  BOT_WALL: "bot_wall",       // Cloudflare/Radware "just a moment" challenge
  JS_SHELL: "js_shell",       // 200 client-render placeholder — real content behind JS
  SOFT_404: "soft_404",       // 200 whose head announces "page not found"
  REQUEST_ACCESS: "request_access", // federalregister/eCFR HTML "Request Access" permission wall
  ERROR_BODY: "error_body",   // isErrorBody-flagged body detectRoadblock did not classify (the two-detector gap)
  EMPTY: "empty",
});

// "Request Access" / permission-wall bodies (federalregister.gov + eCFR return these to scrapers on the HTML
// path). Distinct from a bot challenge — the host is up, it is refusing programmatic HTML access.
const REQUEST_ACCESS_RE =
  /request access|you (?:do not|don'?t) have permission to access|access to this page (?:has been|is) denied|permission to access .* on this server|to continue,? (?:please )?(?:enable|verify|confirm)/i;
// JS-shell / client-render placeholder: a 200 whose body is a shell (the real content is behind JS execution).
const JS_SHELL_RE =
  /javascript is required|javascript required|requires javascript|(?:please )?enable javascript|you need to enable javascript|this (?:page|site|app) requires javascript|<noscript/i;

/** PURE failure classifier for a single transport RESULT. Reuses detectRoadblock + isErrorBody (single homes).
 * @param {{status?:number,text?:string,timedOut?:boolean}} [res]
 * @returns {string} a CLASS value */
export function classifyTransportResult(res = {}) {
  const { status = 200, text = "", timedOut = false } = res;
  if (timedOut) return CLASS.TIMEOUT;
  if (status === 404) return CLASS.HTTP_404;
  if (status === 410) return CLASS.HTTP_410;
  if (status === 403) return CLASS.HTTP_403;
  if (status >= 500) return CLASS.HTTP_5XX;
  if (status >= 400) return CLASS.HTTP_403; // any other 4xx = access/permission family
  const body = String(text || "");
  if (body.trim().length === 0) return CLASS.EMPTY;
  const head = body.slice(0, 2500);
  // Head-scoped intent markers first (a real article that merely mentions "javascript" deep in the body must
  // not trip): the request-access wall and the JS shell announce themselves at the top.
  if (REQUEST_ACCESS_RE.test(body.slice(0, 600))) return CLASS.REQUEST_ACCESS;
  if (JS_SHELL_RE.test(body.slice(0, 600))) return CLASS.JS_SHELL;
  // detectRoadblock owns cdn_block / bot-challenge / soft-404 / empty-shell (head-scoped, unit-tested).
  const rb = detectRoadblock(body, { httpStatus: status, timedOut: false });
  if (rb.roadblocked) {
    if (rb.reason === "cdn_block") return CLASS.CDN_BLOCK;
    if (rb.reason === "challenge_stub") return CLASS.BOT_WALL;
    if (rb.reason === "soft_404") return CLASS.SOFT_404;
    if (rb.reason === "empty_stub") return CLASS.JS_SHELL;
    // wrong_language_only / other roadblocks fall through to the isErrorBody catch-all below.
  }
  // The two-detector gap: an error/nav body whose markers sit past detectRoadblock's head window but inside
  // isErrorBody's 2500-char scan (>=2 distinct markers). This is exactly the 193-junk class the write gate kills.
  if (isErrorBody(head)) return CLASS.ERROR_BODY;
  return CLASS.OK;
}

// ── CLASS FAMILIES ──────────────────────────────────────────────────────────────────────────────────────
// NOT-FOUND: the URL is dead → SEEK a correct alternate URL (never store, never hold on the dead URL).
export const NOT_FOUND_CLASSES = new Set([CLASS.HTTP_404, CLASS.HTTP_410, CLASS.SOFT_404]);
// BLOCK: the host is up but refusing this transport → try the OTHER; if all exhausted → hold NO_REACHABLE_SOURCE.
export const BLOCK_CLASSES = new Set([
  CLASS.HTTP_403, CLASS.HTTP_5XX, CLASS.TIMEOUT, CLASS.CDN_BLOCK, CLASS.BOT_WALL,
  CLASS.REQUEST_ACCESS, CLASS.ERROR_BODY, CLASS.EMPTY,
]);
export const isOk = (c) => c === CLASS.OK;
export const isNotFound = (c) => NOT_FOUND_CLASSES.has(c);
export const isJsShell = (c) => c === CLASS.JS_SHELL;
export const isBlock = (c) => BLOCK_CLASSES.has(c);
/** Any non-OK class = a failed capture (the capture-time superset of the read-side isErrorBody: also catches
 *  the Request-Access permission wall + JS shell that isErrorBody's marker set misses). @param {string} c */
export const isCaptureFailure = (c) => c !== CLASS.OK;

// ── HOST → TRANSPORT SELECTION ──────────────────────────────────────────────────────────────────────────
// (d) API hosts: federalregister.gov + eCFR expose official JSON APIs; the HTML path returns "Request Access".
/** The official JSON API base for a host, or null if the host has no API transport. @param {string} url */
export function apiEndpointFor(url) {
  try {
    const h = new URL(url).hostname;
    if (/(^|\.)federalregister\.gov$/i.test(h)) return "https://www.federalregister.gov/api/v1";
    if (/(^|\.)ecfr\.gov$/i.test(h)) return "https://www.ecfr.gov/api";
    return null;
  } catch { return null; }
}
export const hasApiTransport = (url) => apiEndpointFor(url) !== null;

// Bot-walled / datacenter-IP-WAF hosts: Browserless (stealth) reaches them where a plain server fetch is
// blocked, so RENDER is tried first, plain-HTTP as the salvage (work-order group b).
const RENDER_FIRST_HOSTS =
  /(^|\.)(smartfreightcentre\.org|iea\.org|iata\.org|adb\.org|itf-oecd\.org|sciencedirect\.com|ilo\.org|iopscience\.iop\.org|un\.org|c40\.org|spglobal\.com|congress\.gov)$/i;

/** Ordered transport ladder for a URL. API hosts route to the API first; bot-walled hosts render-first;
 *  everything else tries plain direct-HTTP first (free, reaches datacenter-WAF'd sites) then the render
 *  escalation. @param {string} url @returns {string[]} */
export function selectTransportOrder(url) {
  if (hasApiTransport(url)) return ["api", "direct", "render"];
  let host = "";
  try { host = new URL(url).hostname; } catch { return ["direct", "render"]; }
  if (RENDER_FIRST_HOSTS.test(host)) return ["render", "direct"];
  return ["direct", "render"];
}

// ── VERDICT ─────────────────────────────────────────────────────────────────────────────────────────────
/** @param {'content'|'seek_more'|'no_reachable_source'} outcome @param {object} [extra] */
function verdict(outcome, extra = {}) {
  return {
    outcome,
    // storeRow: the WRITE-SIDE guarantee — ONLY real content is ever stored; an error body NEVER is.
    storeRow: outcome === "content",
    text: outcome === "content" ? (extra.text || "") : "",
    transport: extra.transport || "none",
    attempts: extra.attempts || [],
    seekMoreTask: extra.seekMoreTask || null,
    holdReason: extra.holdReason || null,
    url: extra.url,
  };
}

/**
 * The escalation ladder at the single primitive. PURE given its injected transports (no real fetch). Runs the
 * per-failure-class ladder (a)-(f) above and returns a verdict. An error body is NEVER returned as content and
 * NEVER stored (storeRow is true only for outcome 'content').
 * @param {string} url
 * @param {{
 *   cacheGet?: (url:string)=>Promise<{text?:string}|null>|{text?:string}|null,
 *   apiFetch?: (url:string)=>Promise<{status?:number,text?:string}|null>|{status?:number,text?:string}|null,
 *   directFetch?: (url:string)=>Promise<{status?:number,text?:string}>|{status?:number,text?:string},
 *   browserlessRender?: (url:string)=>Promise<{status?:number,text?:string}>|{status?:number,text?:string},
 *   seekMore?: (url:string)=>Promise<any>|any,
 * }} [deps]
 */
export async function escalateFetch(url, deps = {}) {
  const { cacheGet, apiFetch, directFetch, browserlessRender, seekMore } = deps;
  const attempts = [];
  const note = (transport, res) => {
    const r = res || {};
    const cls = classifyTransportResult(r);
    attempts.push({ transport, class: cls, status: r.status });
    return cls;
  };

  // (a) canonical-URL cache first.
  if (cacheGet) {
    const hit = await cacheGet(url);
    if (hit && hit.text && isOk(note("cache", hit))) {
      return verdict("content", { url, text: hit.text, transport: "cache", attempts });
    }
  }

  // (d) API-transport for API hosts — never the HTML page.
  if (apiEndpointFor(url) && apiFetch) {
    const res = await apiFetch(url);
    if (res && isOk(note("api", res))) {
      return verdict("content", { url, text: res.text, transport: "api", attempts });
    }
  }

  // (b)/(c) HTML ladder: try transports in host order; a block/JS-shell on one → try the other.
  const impl = { direct: directFetch, render: browserlessRender };
  const queue = selectTransportOrder(url).filter((t) => t !== "api");
  const tried = new Set();
  let notFoundSeen = false;
  while (queue.length) {
    const t = queue.shift();
    if (tried.has(t) || !impl[t]) continue;
    tried.add(t);
    const res = (await impl[t](url)) || {};
    const cls = note(t, res);
    if (isOk(cls)) return verdict("content", { url, text: res.text, transport: t, attempts });
    if (isNotFound(cls)) notFoundSeen = true;
    // (c) a JS-shell from a non-render transport → ensure the render path is tried next (escalation).
    if (isJsShell(cls) && impl.render && !tried.has("render") && !queue.includes("render")) queue.push("render");
  }

  // (e) a genuine not-found after the ladder → seek-more (alternate-URL discovery), NEVER a stored body.
  if (notFoundSeen) {
    const task = seekMore ? await seekMore(url) : { kind: "seek_more_alternate_url", url };
    return verdict("seek_more", { url, transport: "none", attempts, seekMoreTask: task });
  }
  // (f) ladder exhausted on blocks/walls → hold NO_REACHABLE_SOURCE, event-bound.
  return verdict("no_reachable_source", { url, transport: "none", attempts, holdReason: "NO_REACHABLE_SOURCE" });
}

/**
 * WRITE-SIDE CAPTURE VERDICT (the class kill, RD-14): decide what may be STORED as source content. An error
 * body (bot wall / 403 / 404 / Request-Access block / nav shell / JS shell) is NEVER stored into
 * agent_run_searches — the complement to RD-13's read-side gate. A capture is EXCLUDED when the single-home
 * isErrorBody flags it OR the transport classifier deems it a failure (the capture-time SUPERSET — it also
 * catches the Request-Access permission wall + JS shell that isErrorBody's marker set misses). When nothing
 * usable remains from a non-empty capture, the item HOLDS with NO_REACHABLE_SOURCE (never a fabricated brief
 * over junk). The excluded set is SURFACED by the caller, never silently dropped.
 * @param {Array<{url?:string,text:string}>} fetched
 * @returns {{ store: Array<{url?:string,text:string}>, excluded: Array<{url?:string,text:string}>, holdReason: string|null }}
 */
export function captureForStorage(fetched) {
  const store = [], excluded = [];
  for (const b of fetched || []) {
    const text = (b && b.text) || "";
    const bad = isErrorBody(text) || isCaptureFailure(classifyTransportResult({ text }));
    (bad ? excluded : store).push(b);
  }
  const hadInput = Array.isArray(fetched) && fetched.length > 0;
  return { store, excluded, holdReason: store.length === 0 && hadInput ? "NO_REACHABLE_SOURCE" : null };
}
