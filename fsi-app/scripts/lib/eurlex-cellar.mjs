// eurlex-cellar.mjs -- the ONE home for reading EUR-Lex acts without a browser (lane L28b, 2026-09-17).
//
// eur-lex.europa.eu answers every plain GET of its legal-content pages with HTTP 202 and a "verify that
// you're not a robot" interstitial (its bot gate; the same URL renders in a browser). The act text is ALSO
// published, with no gate, by the Publications Office's Cellar repository, the system EUR-Lex is a front
// end for: GET https://publications.europa.eu/resource/celex/<CELEX> with the combined Accept below and
// Accept-Language: en answers the act as XHTML (acts since about 2004) or HTML (older acts), one request,
// content negotiated (probed 2026-09-17: 32016R0103 200 application/xhtml+xml 52,653 bytes; 31992L0106
// 200 text/html 16,603 bytes; 32000Y0229%28 01%29 200 text/html 9,202 bytes). A CELEX carrying an OJ sequence
// suffix "(NN)" resolves only with the parentheses percent-encoded (confirmed live 2026-09-03 and again
// 2026-09-17: the literal form 404s).
//
// HISTORY, the reason this file exists: scripts/mint/export-census-rows.mjs learned all of this on
// 2026-09-02 (population run #4, held evidence run 33643532589) and carried these two helpers; the D25
// capture step (scripts/maintenance/capture-static-primaries.mjs, 2026-09-13) did not reuse them and shipped
// on the direct transport alone, so its first live apply roadblocked 130 of 131 EUR-Lex items; lane L28
// then re-derived a second Cellar route with http and an XHTML-first walk. Two homes for one fact is the
// drift class remediation-discipline exists to kill: both steps now import THIS module and nothing else
// builds a Cellar URL or judges the EUR-Lex gate.

export const CELLAR_CELEX_PREFIX = "https://publications.europa.eu/resource/celex/";

/** The Accept header Cellar content-negotiates against: XHTML where it exists, HTML for older acts. */
export const CELLAR_ACCEPT = "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8";

/** Cellar's CELEX resolver URL for one key. Pure. `encodeURIComponent` leaves `(` and `)` LITERAL (they
 *  are in its own unreserved set); Cellar's resolver 404s a literal-paren OJ-sequence-suffixed key, so they
 *  are percent-encoded explicitly afterwards. */
export function cellarEndpointForCelex(canonicalKey) {
  const encoded = encodeURIComponent(String(canonicalKey)).replace(/\(/g, "%28").replace(/\)/g, "%29");
  return `${CELLAR_CELEX_PREFIX}${encoded}`;
}

/** True for a URL this module built (or its plain-http twin): the caller sends CELLAR_ACCEPT for it. Pure. */
export function isCellarUrl(url) {
  return /^https?:\/\/publications\.europa\.eu\/resource\/celex\//.test(String(url ?? ""));
}

/** EUR-Lex's own JS bot-gate interstitial: HTTP 202 with the "verify that you're not a robot" marker text.
 *  Detected by status + marker text, never by byte count alone. Pure. */
const EURLEX_ROBOT_GATE_RE = /verify that you.?re not a robot/i;
export function isEurlexRobotGate(status, head) {
  return Number(status) === 202 && EURLEX_ROBOT_GATE_RE.test(String(head ?? ""));
}
