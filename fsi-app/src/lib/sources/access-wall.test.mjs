// access-wall.test.mjs — Lane LEDGER-WALLS, 2026-09-04. The two REAL-TEXT fixtures below are pasted
// VERBATIM from the ledger-consume export the coordinator handed this lane
// (/root/work/ledger/export-002.json, run 33908401816, 2026-09-04 19:20 — a candidate row's own already-
// extracted `text` field, never paraphrased): one www.federalregister.gov document URL's captured text
// (the full 1,180-character CAPTCHA shell) and one eur-lex.europa.eu `/legal-content/` document URL's
// captured text (the first ~1,400 characters of its 6,000-character shell — the full capture never
// reaches legislative body text either, see access-wall.mjs's own header for the measured 76/76 finding;
// a truncated head is enough to prove the structural check since it never length-gates that kind).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectAccessWall,
  looksLikeEurlexInterfaceShell,
  ACCESS_WALL_KIND,
} from "./access-wall.mjs";

// ── REAL fixtures (verbatim from the export; see file header) ───────────────────────────────────────────

const FR_CAPTCHA_SHELL_TEXT =
  'Federal Register :: Request Access Request Access Due to aggressive automated scraping of ' +
  'FederalRegister.gov and eCFR.gov, programmatic access to these sites is limited to access to our ' +
  'extensive developer APIs. Please visit FederalRegister.gov API documentation or eCFR.gov API ' +
  'documentation to learn more about how to access the API. Your request has been flagged as ' +
  'potentially automated. If you are human user receiving this message, please complete the CAPTCHA ' +
  '(bot test) below and click "Request Access". You may occassionally be asked to complete the CAPTCHA ' +
  'again, this is normal and part of our security measures. unblock#handleSubmit"> Request Access An ' +
  'official website of the United States government. If you experiencing issues with the CAPTCHA or ' +
  'want to request a wider IP range, you can use the "Site Help" button found in the lower, right of ' +
  'this page to make a request. × IP Access Help This contact form is only for IP Access help. ' +
  'Please do not provide confidential information or personal data. * Your Name * Email * How can we ' +
  'help you? Upload Attachment * I am requesting technical help. site-feedback#openModal" aria-' +
  'label="Open site help form"> Site Help';

// The real row's URL was https://www.federalregister.gov/documents/2026/07/15/2026-14204/lake-ontario-
// national-marine-sanctuary-delay-of-effective-date — candidate_id 2c4fbe3c-4066-4b46-aae0-edf583a806c7,
// fetch_ok:true, fetched_chars:1180, transport:"direct-fetch" (the fetch itself succeeded; the CAPTCHA
// shell is what came back, over the 200-char usability floor, hence sent to classify before this lane).

const EURLEX_SHELL_HEAD_TEXT =
  'Implementing regulation - EU - 2026/1727 - EN - EUR-Lex &times; Skip to main content Log in My ' +
  'EUR-Lex My EUR-Lex Sign in Register My recent searches (0) English English Select your language ' +
  'Official EU languages: bg български es Español cs ' +
  'Čeština da Dansk de Deutsch et Eesti keel el Ελληνικά ' +
  'en English fr Français ga Gaeilge hr Hrvatski it Italiano lv Latviešu valoda lt ' +
  'Lietuvių kalba hu Magyar mt Malti nl Nederlands pl Polski pt Português ro Română ' +
  'sk Slovenčina sl Slovenščina fi Suomi sv Svenska EUR-Lex Access to European Union law ' +
  '&lt;a href=&quot;https://eur-lex.europa.eu/content/help/eurlex-content/experimental-features.html' +
  '&quot; target=&quot;_blank&quot;&gt;More about the experimental features corner&lt;/a&gt; ' +
  'Experimental features × Choose the experimental features you want to try Do you want to help ' +
  'improving EUR-Lex ? This is a list of experimental features that you can enable. These features are ' +
  'still under development; they are not fully tested, and might reduce EUR-Lex stability. Don&#39;t ' +
  'forget to give your feedback! &nbsp; Warning! Experimental feature conflicts detected. Replacement ' +
  'of CELEX identifiers by short titles - experimental feature. It replaces clickable CELEX identifiers ' +
  'of treaties and case-law by short titles. Visualisation of document relationships. It displays a ' +
  'dynamic graph with relations between the act and rela';

// The real row's URL was https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=OJ:L_202601727 — the FULL
// 6,000-character capture (not shown in full here) never reaches "Article 1"/"HAS ADOPTED..." anywhere;
// only the head is pasted (see file header for why a truncated head still proves the structural check).

const EURLEX_HOMEPAGE_BANNER_TEXT =
  'EU law - EUR-Lex &times; Your browser is no longer fully supported. Some elements of the ' +
  'website may not function or display correctly.&nbsp; Dismiss Skip to main content Log in My EUR-Lex ' +
  'My EUR-Lex Sign in Register My recent searches (0) English English Select your language Official EU ' +
  'languages: bg български es Español EUR-Lex Access ' +
  'to European Union law';
// The real row's URL was https://eur-lex.europa.eu/homepage.html?locale=en — a portal page (not
// /legal-content/), so the EUR-Lex structural check must NOT fire on it (see test below) — it is caught
// instead by the generic browser_not_supported pattern, which is host-agnostic by design.

// ── real-text tests ──────────────────────────────────────────────────────────────────────────────────────

test("detectAccessWall: the REAL Federal Register CAPTCHA shell -> request_access", () => {
  const r = detectAccessWall(FR_CAPTCHA_SHELL_TEXT, { host: "www.federalregister.gov" });
  assert.ok(r, "expected a wall to be detected");
  assert.equal(r.kind, ACCESS_WALL_KIND.REQUEST_ACCESS);
});

test("detectAccessWall: the REAL Federal Register CAPTCHA shell is detected host-agnostically too (the pattern IS the evidence)", () => {
  const r = detectAccessWall(FR_CAPTCHA_SHELL_TEXT);
  assert.equal(r?.kind, ACCESS_WALL_KIND.REQUEST_ACCESS);
});

test("detectAccessWall: the REAL EUR-Lex /legal-content/ interface-shell head -> eurlex_interface_shell", () => {
  const r = detectAccessWall(EURLEX_SHELL_HEAD_TEXT, {
    host: "eur-lex.europa.eu",
    path: "/legal-content/EN/TXT/",
  });
  assert.ok(r, "expected a wall to be detected");
  assert.equal(r.kind, ACCESS_WALL_KIND.EURLEX_INTERFACE_SHELL);
});

test("detectAccessWall: the SAME EUR-Lex shell text WITHOUT a /legal-content/ path hint is NOT flagged as the interface shell (scoped to document pages only)", () => {
  const r = detectAccessWall(EURLEX_SHELL_HEAD_TEXT, { host: "eur-lex.europa.eu", path: "/homepage.html" });
  assert.notEqual(r?.kind, ACCESS_WALL_KIND.EURLEX_INTERFACE_SHELL);
});

test("detectAccessWall: the REAL EUR-Lex homepage 'browser not supported' banner -> browser_not_supported (host-agnostic, not path-scoped)", () => {
  const r = detectAccessWall(EURLEX_HOMEPAGE_BANNER_TEXT, { host: "eur-lex.europa.eu", path: "/homepage.html" });
  assert.equal(r?.kind, ACCESS_WALL_KIND.BROWSER_NOT_SUPPORTED);
});

// ── looksLikeEurlexInterfaceShell — structural check, unit-level ───────────────────────────────────────

test("looksLikeEurlexInterfaceShell: chrome markers + no legislative body -> true", () => {
  assert.equal(
    looksLikeEurlexInterfaceShell(EURLEX_SHELL_HEAD_TEXT, { host: "eur-lex.europa.eu", path: "/legal-content/EN/TXT/" }),
    true
  );
});

test("looksLikeEurlexInterfaceShell: a document's OWN TITLE citing another article ('Article 15(1)') must not false-positive as body text", () => {
  const text =
    EURLEX_SHELL_HEAD_TEXT +
    " Council Implementing Regulation (EU) 2026/1393 of 22 June 2026 implementing Article 15(1) of " +
    "Regulation (EU) No 747/2014 concerning restrictive measures";
  assert.equal(
    looksLikeEurlexInterfaceShell(text, { host: "eur-lex.europa.eu", path: "/legal-content/EN/TXT/" }),
    true,
    "Article 15(1) is a citation inside the title, not the body's own Article 1 — must still read as chrome-only"
  );
});

test("looksLikeEurlexInterfaceShell: chrome markers + a real 'Article 1' body marker -> false", () => {
  const text = EURLEX_SHELL_HEAD_TEXT + " Article 1 Subject matter and scope This Regulation lays down rules...";
  assert.equal(
    looksLikeEurlexInterfaceShell(text, { host: "eur-lex.europa.eu", path: "/legal-content/EN/TXT/" }),
    false
  );
});

test("looksLikeEurlexInterfaceShell: 'HAS ADOPTED THIS REGULATION' also counts as a body marker", () => {
  const text = EURLEX_SHELL_HEAD_TEXT + " HAS ADOPTED THIS REGULATION: Article 1 ...";
  assert.equal(
    looksLikeEurlexInterfaceShell(text, { host: "eur-lex.europa.eu", path: "/legal-content/EN/TXT/" }),
    false
  );
});

test("looksLikeEurlexInterfaceShell: wrong host -> false even with chrome markers (host-scoped, not a bare text match)", () => {
  assert.equal(looksLikeEurlexInterfaceShell(EURLEX_SHELL_HEAD_TEXT, { host: "example.com", path: "/legal-content/EN/TXT/" }), false);
});

test("looksLikeEurlexInterfaceShell: no chrome markers at all -> false (a real article that happens to be short is not a shell)", () => {
  assert.equal(looksLikeEurlexInterfaceShell("Some unrelated short page.", { host: "eur-lex.europa.eu", path: "/legal-content/EN/TXT/" }), false);
});

test("looksLikeEurlexInterfaceShell: a genuine EUR-Lex portal page (not /legal-content/) is never flagged, chrome or not", () => {
  assert.equal(looksLikeEurlexInterfaceShell(EURLEX_SHELL_HEAD_TEXT, { host: "eur-lex.europa.eu", path: "/collection/eu-law/treaties/treaties-force.html" }), false);
});

test("looksLikeEurlexInterfaceShell: no host/path opts at all -> applies the check host-agnostically (opts optional)", () => {
  assert.equal(looksLikeEurlexInterfaceShell(EURLEX_SHELL_HEAD_TEXT), true);
});

// ── the reused patterns (REQUEST_ACCESS_RE/JS_SHELL_RE from transport-escalation.mjs, CHALLENGE_RE/
//    SOFT_404_RE/CDN_BLOCK_RE from primary-fallback.mjs) — light smoke coverage; exhaustive coverage of
//    each pattern already lives in transport-escalation.test.mjs / primary-fallback.test.mjs, the "one
//    body" homes these are imported from, never re-duplicated here. ─────────────────────────────────────

test("detectAccessWall: a Cloudflare 'just a moment' challenge (short body) -> bot_challenge", () => {
  const r = detectAccessWall("Just a moment... Please wait while we check your browser. Enable JavaScript and cookies to continue.");
  assert.equal(r?.kind, ACCESS_WALL_KIND.BOT_CHALLENGE);
});

test("detectAccessWall: a long real article that merely mentions 'cloudflare' deep in the body -> not flagged (length-gated)", () => {
  const longArticle = "A real regulatory analysis. ".repeat(80) + "Our CDN is served via Cloudflare for performance.";
  const r = detectAccessWall(longArticle);
  assert.equal(r, null);
});

test("detectAccessWall: a CloudFront WAF block page -> cdn_block", () => {
  const r = detectAccessWall("ERROR: The request could not be satisfied. Request blocked. Generated by cloudfront (CloudFront)");
  assert.equal(r?.kind, ACCESS_WALL_KIND.CDN_BLOCK);
});

test("detectAccessWall: a JS-required client-render shell -> js_shell", () => {
  // Deliberately avoids "enable javascript" (CHALLENGE_RE's own marker, checked first) so this text is
  // unambiguously JS_SHELL_RE's own signal, not a collision between the two reused patterns.
  const r = detectAccessWall("This app requires JavaScript to run. <noscript>JavaScript is required to view this page.</noscript>");
  assert.equal(r?.kind, ACCESS_WALL_KIND.JS_SHELL);
});

test("detectAccessWall: a soft-404 head -> soft_404", () => {
  const r = detectAccessWall("Page Not Found - the requested document could not be located on this server. " + "x".repeat(300));
  assert.equal(r?.kind, ACCESS_WALL_KIND.SOFT_404);
});

// ── new patterns this lane adds (nothing to reuse — genuinely new coverage) ────────────────────────────

test("detectAccessWall: a cookie-consent-only shell (short body) -> cookie_consent_only", () => {
  const r = detectAccessWall(
    "This website uses cookies to ensure you get the best experience on our website. " +
      "Accept all cookies or manage preferences."
  );
  assert.equal(r?.kind, ACCESS_WALL_KIND.COOKIE_CONSENT_ONLY);
});

test("detectAccessWall: a long real article with a footer cookie notice is NOT flagged (length-gated, same discipline as bot_challenge)", () => {
  const longArticle =
    "This regulation establishes binding emission thresholds for heavy-duty vehicles. ".repeat(40) +
    "This website uses cookies. Accept all cookies.";
  assert.equal(detectAccessWall(longArticle), null);
});

test("detectAccessWall: a sign-in wall -> login_wall", () => {
  const r = detectAccessWall("Please sign in to continue reading. Subscription required to view this article.");
  assert.equal(r?.kind, ACCESS_WALL_KIND.LOGIN_WALL);
});

test("detectAccessWall: a members-only content wall -> login_wall", () => {
  const r = detectAccessWall("This content is only available to subscribers. Create a free account to continue.");
  assert.equal(r?.kind, ACCESS_WALL_KIND.LOGIN_WALL);
});

test("detectAccessWall: a generic 'browser not supported' upgrade shell (non-EUR-Lex host) -> browser_not_supported", () => {
  const r = detectAccessWall("Your browser is not fully supported. Please upgrade your browser to continue.", { host: "example.gov" });
  assert.equal(r?.kind, ACCESS_WALL_KIND.BROWSER_NOT_SUPPORTED);
});

// ── negative controls: real, ordinary content must never be flagged ────────────────────────────────────

test("detectAccessWall: ordinary long-form regulatory prose -> null (no wall)", () => {
  const realText =
    "Article 1. Subject matter and scope. This Regulation lays down requirements for the placing on " +
    "the market of packaging and packaging waste to reduce their adverse environmental impact and " +
    "improve the functioning of the internal market. " +
    "Article 2. Definitions. For the purposes of this Regulation, the following definitions apply: " +
    "(1) 'packaging' means an article, made of any materials, of a nature to be used for the containment, " +
    "protection, handling, delivery, presentation or storage of goods. ".repeat(6);
  assert.equal(detectAccessWall(realText, { host: "eur-lex.europa.eu", path: "/legal-content/EN/TXT/" }), null);
});

test("detectAccessWall: empty text -> null (an empty capture is a different, pre-existing failure mode, not a wall)", () => {
  assert.equal(detectAccessWall(""), null);
  assert.equal(detectAccessWall(null), null);
  assert.equal(detectAccessWall(undefined), null);
});

test("detectAccessWall: whitespace-only text -> null", () => {
  assert.equal(detectAccessWall("   \n\t  "), null);
});

// ── ACCESS_WALL_KIND is a frozen, closed vocabulary ─────────────────────────────────────────────────────

test("ACCESS_WALL_KIND: every value is a distinct lower_snake_case string, object is frozen", () => {
  assert.ok(Object.isFrozen(ACCESS_WALL_KIND));
  const values = Object.values(ACCESS_WALL_KIND);
  assert.equal(new Set(values).size, values.length, "no duplicate kind strings");
  for (const v of values) assert.match(v, /^[a-z][a-z0-9_]*$/);
});
