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

/** (moved here from scripts/mint/heal-provenance.mjs by lane L31: F46 gives this host one home) The Publications Office's own OJ-issue resource URL for one `{series,year,issue}` + edition letter ,
 *  the exact shape the dispatch names (`.../resource/oj/JOL_2025_040_R`). Pure. NOT independently
 *  confirmed live this session (this lane's egress is denied to publications.europa.eu, see this file's
 *  FIFTH PASS header); [HYPOTHESIS], sourced from the dispatch's own text. */
export function cellarEndpointForOj({ series, year, issue }, edition) {
  const prefix = series === "L" ? "JOL" : "JOC";
  return `https://publications.europa.eu/resource/oj/${prefix}_${year}_${issue}_${edition}`;
}
