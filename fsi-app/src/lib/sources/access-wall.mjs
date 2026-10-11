// @ts-check

import { REQUEST_ACCESS_RE, JS_SHELL_RE } from "./transport-escalation.mjs";
import { CHALLENGE_RE, SOFT_404_RE, CDN_BLOCK_RE, CHALLENGE_MAX_CHARS } from "./primary-fallback.mjs";

export const ACCESS_WALL_KIND = Object.freeze({
  REQUEST_ACCESS: "request_access", // Federal Register / eCFR "Request Access" CAPTCHA wall
  BOT_CHALLENGE: "bot_challenge", // Cloudflare/Akamai "just a moment" / CAPTCHA interstitial
  CDN_BLOCK: "cdn_block", // CloudFront/Akamai/Varnish 200-wrapped WAF refusal
  JS_SHELL: "js_shell", // client-render placeholder (real content is behind JS execution)
  SOFT_404: "soft_404", // 200 OK whose head announces "page not found"
  COOKIE_CONSENT_ONLY: "cookie_consent_only", // the entire captured window is a cookie-consent banner
  LOGIN_WALL: "login_wall", // sign-in / subscription / members-only wall
  BROWSER_NOT_SUPPORTED: "browser_not_supported", // "your browser is not supported" upgrade shell
  EURLEX_INTERFACE_SHELL: "eurlex_interface_shell", // EUR-Lex portal chrome only, no instrument body
});

// A wall page is SHORT relative to a real article (the same discipline CHALLENGE_MAX_CHARS already
// applies in primary-fallback.mjs) — reused here rather than a second, independently-tuned threshold, so
// a long real article that happens to mention "cookies" or "sign in" in passing does not trip either new
// pattern below.
const SHORT_WALL_MAX_CHARS = CHALLENGE_MAX_CHARS;

// Cookie-consent-only shell: the ENTIRE captured window is a consent banner (a real article's footer
// cookie notice is a few words inside a much longer body — length-gated above, same as CHALLENGE_RE).
// Scoped to a wide head (900ch) because a consent banner often carries a paragraph of legal boilerplate
// before the accept/manage buttons.
const COOKIE_CONSENT_RE =
  /(?:this (?:site|website) uses cookies|we use cookies to|by (?:using|continuing to (?:use|browse)) this (?:site|website)|cookie (?:consent|settings|preferences|policy))[\s\S]{0,400}(?:accept(?: all)?(?: cookies)?|allow all|manage (?:cookie )?preferences|i agree|got it)/i;

// Login / subscription / members-only wall: the captured window IS the sign-in gate, not an article that
// merely mentions logging in. Scoped short (same SHORT_WALL_MAX_CHARS gate) for the same reason.
const LOGIN_WALL_RE =
  /(?:please )?(?:sign in|log ?in) to (?:continue|view|access|read)|you must (?:be logged in|sign in) to|this content is (?:only )?available to (?:subscribers|members|registered users)|subscription required|create a (?:free )?account to continue|members?-only content|register (?:for free )?to (?:continue|view|read)/i;

// Generic "browser not supported" upgrade shell (EUR-Lex's own banner text — "Your browser is no longer
// fully supported" — confirmed live this session; also the common cross-vendor phrasing). NOT length-gated
// like the two above: measured this session, this exact phrase never co-occurs with real EUR-Lex
// legislative body text in the same capture window (0 of 76 legal-content rows), so scoping to the head
// (800ch) is enough — a real article discussing browser-compatibility history in its BODY, past the head,
// does not trip.
const BROWSER_NOT_SUPPORTED_RE =
  /your browser is (?:no longer|not) (?:fully )?supported|please (?:upgrade|update) your browser|this (?:site|browser|page) requires? an? (?:modern|newer|updated) browser|browser (?:is )?out of date/i;

// ── EUR-Lex interface shell (structural, not a regex match) ────────────────────────────────────────────
// EUR-Lex portal chrome markers that appear on EVERY /legal-content/ document page regardless of whether
// the instrument body made it into the capture window.
const EURLEX_CHROME_MARKERS_RE =
  /my eur-lex|eur-lex\s+access to european union law|select your language|browse by eu institutions|official eu languages/i;
// Legislative-body markers: the actual enacted-text prose EUR-Lex serves after its chrome. Absence of
// EVERY one of these inside a chrome-carrying capture is the "nothing to classify" signal. `(?!\d)` after
// "Article 1" is load-bearing: a document's own TITLE routinely cites another article, e.g. "implementing
// Article 15(1) of Regulation (EU) No 747/2014" (measured live, this export) — without the negative
// lookahead that substring matches "Article 1" and falsely reports a body the capture never reached.
const LEGISLATIVE_BODY_MARKERS_RE =
  /\barticle\s+1\b(?!\d)|has adopted this (?:regulation|directive|decision)|has decided as follows|^\s*whereas:|the european (?:parliament|commission|council)(?: and of the council)? (?:has|have) adopted/im;

/** Is `text` an EUR-Lex `/legal-content/` document page whose captured window is entirely portal chrome
 *  (nav, language selector, document metadata table) with NO legislative body text? PURE. Scoped to
 *  eur-lex.europa.eu `/legal-content/` document URLs ONLY via `opts.host`/`opts.path` — a genuine EUR-Lex
 *  portal/homepage/collection page legitimately carries no instrument body and must NOT be flagged (it is
 *  correctly a "portal" entity_verdict from classify, not an access wall).
 *  @param {string} text @param {{host?:string|null, path?:string|null}} [opts] @returns {boolean} */
export function looksLikeEurlexInterfaceShell(text, opts = {}) {
  const host = (opts.host || "").toLowerCase().replace(/^www\./, "");
  if (host && !/(^|\.)eur-lex\.europa\.eu$/.test(host)) return false;
  const path = opts.path || "";
  if (path && !/\/legal-content\//i.test(path)) return false;
  const s = String(text || "");
  if (!EURLEX_CHROME_MARKERS_RE.test(s)) return false;
  return !LEGISLATIVE_BODY_MARKERS_RE.test(s);
}

/** @param {string} kind @param {string} evidence @returns {{kind:string, evidence:string}} */
function wall(kind, evidence) {
  return { kind, evidence: String(evidence || "").slice(0, 200) };
}

/**
 * PURE content-based access-wall detector. Given the ALREADY-EXTRACTED text of a fetch (never raw
 * HTML — this runs on the same stripped text `htmlToText` produces), returns `{kind, evidence}` naming
 * the wall family, or `null` when the text looks like real content. Order matters only for which
 * `evidence` snippet a multi-pattern match reports first — a caller needs at most one kind per text, never
 * a ranked list.
 *
 * @param {string} text
 * @param {{host?:string|null, path?:string|null}} [opts] host/path are OPTIONAL — only the EUR-Lex
 *   structural check uses them; every regex check below is host-agnostic (a "Request Access" shell reads
 *   identically wherever it is found — the pattern IS the evidence, not the host).
 * @returns {{kind:string, evidence:string}|null}
 */
export function detectAccessWall(text, opts = {}) {
  const s = String(text || "");
  const trimmedLen = s.trim().length;
  if (trimmedLen === 0) return null;
  const head600 = s.slice(0, 600);
  const head800 = s.slice(0, 800);
  const head300 = s.slice(0, 300);

  // Federal Register / eCFR CAPTCHA / "Request Access" wall — reused verbatim from transport-escalation.mjs.
  if (REQUEST_ACCESS_RE.test(head600)) return wall(ACCESS_WALL_KIND.REQUEST_ACCESS, head600);

  // Cloudflare/Akamai bot challenge — short body only (a long real article that merely mentions
  // "cloudflare"/"captcha" deep in the body must not trip; mirrors primary-fallback.mjs's own gate).
  if (trimmedLen < SHORT_WALL_MAX_CHARS && CHALLENGE_RE.test(head600)) {
    return wall(ACCESS_WALL_KIND.BOT_CHALLENGE, head600);
  }

  // CDN/WAF 200-wrapped block page — reused verbatim from primary-fallback.mjs.
  if (CDN_BLOCK_RE.test(head300)) return wall(ACCESS_WALL_KIND.CDN_BLOCK, head300);

  // JS client-render shell — reused verbatim from transport-escalation.mjs.
  if (JS_SHELL_RE.test(head600)) return wall(ACCESS_WALL_KIND.JS_SHELL, head600);

  // Soft-404 — reused verbatim from primary-fallback.mjs.
  if (SOFT_404_RE.test(head300)) return wall(ACCESS_WALL_KIND.SOFT_404, head300);

  // Cookie-consent-only shell — short body only (see COOKIE_CONSENT_RE's own comment).
  if (trimmedLen < SHORT_WALL_MAX_CHARS && COOKIE_CONSENT_RE.test(head800)) {
    return wall(ACCESS_WALL_KIND.COOKIE_CONSENT_ONLY, head800);
  }

  // Login / subscription / members-only wall — short body only (see LOGIN_WALL_RE's own comment).
  if (trimmedLen < SHORT_WALL_MAX_CHARS && LOGIN_WALL_RE.test(head800)) {
    return wall(ACCESS_WALL_KIND.LOGIN_WALL, head800);
  }

  // "Browser not supported" upgrade shell — head-scoped, not length-gated (see BROWSER_NOT_SUPPORTED_RE's
  // own comment on why: measured never to co-occur with real body text in this session's sample).
  if (BROWSER_NOT_SUPPORTED_RE.test(head800)) return wall(ACCESS_WALL_KIND.BROWSER_NOT_SUPPORTED, head800);

  // EUR-Lex interface shell — structural, host+path-scoped (see looksLikeEurlexInterfaceShell's own doc).
  if (looksLikeEurlexInterfaceShell(s, opts)) return wall(ACCESS_WALL_KIND.EURLEX_INTERFACE_SHELL, head300);

  return null;
}
