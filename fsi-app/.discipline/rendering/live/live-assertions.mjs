// live-assertions.mjs (lane GATES-2, 2026-10-05): the PURE assertion library behind the Live smoke gate.
// Every invariant is a named function over a page SNAPSHOT (plain data collected in a real browser by
// live-snapshot.mjs), so each one has a passing fixture and an attack fixture in live-assertions.test.mjs and
// the browser run cannot disagree with the unit proof. Node builtins plus four relative app modules, all
// already portable: the marker list (one constant, shared with the write path), the tag-label vocabularies,
// the tier vocabulary ceiling, and the phone-width overflow rule (one definition, shared with the guard).
//
// WHY THIS EXISTS. Four defects were visible on production that no check caught (2026-10-05): raw ledger JSON
// as text, a 1108px strip on a 375px screen, raw tag slugs and bare scores in an analysis card, two tiers on
// one source. The rendering guard mounts fixtures and never sees stored data; this gate looks at what a
// signed-in customer actually receives.

import { findInternalMarkers } from "../../../src/lib/agent/section-markers.mjs";
import { COMPLIANCE_OBJECT_LABELS, SCENARIO_LABELS } from "../../../src/lib/connections/tag-labels.mjs";
import { SOURCE_TIER_MAX } from "../../../src/lib/customer-source-tier.ts";
import { detectContainerOverflows, isNarrowViewport } from "../overflow-rule.mjs";
import { CONTENT_INVARIANT_IDS, checkContentSnapshot } from "./live-content.mjs";

/** Every named invariant. A failure carries one of these ids, so a log line says WHICH rule broke. */
export const INVARIANTS = Object.freeze({
  SESSION_INVALID: "session-invalid",
  INTERNAL_MARKER: "internal-marker",
  PLACEHOLDER_LITERAL: "placeholder-literal",
  RAW_TAG_SLUG: "raw-tag-slug",
  BARE_SCORE: "bare-score",
  SCROLL_CONTAINER: "scroll-container-overflow",
  CONSOLE_ERROR: "console-error",
  OWN_ORIGIN_5XX: "own-origin-5xx",
  OWN_ORIGIN_4XX: "own-origin-4xx",
  TIER_ABOVE_CEILING: "tier-above-ceiling",
  LEGEND_BELOW_CEILING: "legend-below-ceiling",
  LIST_EMPTY: "list-has-no-rows",
  DETAIL_NO_MASTHEAD: "detail-has-no-masthead",
  ADMIN_GATE: "admin-gate",
  // Lane SMOKE-2: one invariant per element the design places on a page (live-content.mjs owns the requirements).
  ...CONTENT_INVARIANT_IDS,
});

/** Invariants that are warnings, never failures. */
const WARNING_INVARIANTS = new Set([INVARIANTS.OWN_ORIGIN_4XX]);

/** Whole text nodes or chips that mean a value failed to render. */
export const PLACEHOLDER_TOKENS = Object.freeze(["undefined", "null", "NaN", "[object Object]"]);

/** Blocks the slug and score invariants apply to (analysis and theme content). */
export const ANALYSIS_BLOCK_KINDS = Object.freeze(["cross-page", "theme-card", "theme-strip"]);

/** The scoring words a bare decimal is read as a score after. */
export const SCORE_WORDS = Object.freeze(["density", "score", "centrality", "weight", "similarity", "confidence", "relevance", "rank", "strength"]);

/** Known multi-part tag slugs from the owning vocabularies (tag-labels.mjs), never a loose regex. */
export const KNOWN_TAG_SLUGS = Object.freeze(
  new Set([...Object.keys(COMPLIANCE_OBJECT_LABELS), ...Object.keys(SCENARIO_LABELS)].filter((k) => k.includes("-"))),
);

/** The pathname of a url, or the input when it does not parse. */
const pathOf = (u) => {
  try { return new URL(u).pathname; } catch { return String(u ?? ""); }
};

const trunc = (s, n = 120) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}...` : t;
};

// ---------------------------------------------------------------- pure finders (each tested)

/** Text nodes that carry an internal marker. @param {string[]} texts */
export function findMarkerTexts(texts) {
  const out = [];
  for (const t of texts ?? []) {
    const hits = findInternalMarkers(t);
    if (hits.length > 0) out.push({ text: t, ids: hits.map((h) => h.id) });
  }
  return out;
}

/** Whole text nodes or chips that are exactly a placeholder token. @param {string[]} texts */
export function findPlaceholderTexts(texts) {
  return (texts ?? []).filter((t) => PLACEHOLDER_TOKENS.includes(String(t).trim()));
}

/** Raw hyphen-joined tag slugs, matched against the known vocabularies. @param {string[]} texts */
export function findRawTagSlugs(texts, known = KNOWN_TAG_SLUGS) {
  const out = [];
  for (const t of texts ?? []) {
    for (const token of String(t).split(/[^A-Za-z0-9-]+/)) {
      const k = token.toLowerCase().replace(/^-+|-+$/g, "");
      if (k.includes("-") && known.has(k)) out.push({ text: t, slug: k });
    }
  }
  return out;
}

const SCORE_AFTER_WORD = new RegExp(`\\b(?:${SCORE_WORDS.join("|")})\\b[^.\\d]{0,12}\\d+\\.\\d+`, "i");
const WHOLE_DECIMAL = /^\s*\d+\.\d+\s*$/;

/** Bare decimal scores: a whole text node that is a decimal, or a decimal right after a scoring word. */
export function findBareScores(texts) {
  return (texts ?? []).filter((t) => WHOLE_DECIMAL.test(String(t)) || SCORE_AFTER_WORD.test(String(t)));
}

/** Tier chip texts (`T7`) above the vocabulary ceiling. @param {string[]} chipTexts */
export function findTiersAboveCeiling(chipTexts, ceiling = SOURCE_TIER_MAX) {
  return (chipTexts ?? []).filter((t) => {
    const m = /^T(\d+)$/.exec(String(t).trim());
    return m !== null && Number(m[1]) > ceiling;
  });
}

const SCALE_SPAN = /\bT1\b[^.\n]{0,60}?(?:\u2192|->|through|\bto\b|\u2013|\u2014|-)\s*T(\d+)\b/;

/** Legend texts whose scale ends below the vocabulary ceiling ("T1 ... T6" when the scale is T1 to T7). */
export function findLegendsBelowCeiling(texts, ceiling = SOURCE_TIER_MAX) {
  const out = [];
  for (const t of texts ?? []) {
    const m = SCALE_SPAN.exec(String(t));
    if (m && Number(m[1]) < ceiling) out.push(t);
  }
  return out;
}

// ---------------------------------------------------------------- snapshot -> findings

/**
 * Check one page snapshot. PURE.
 * @param {object} snap {
 *   url, kind: 'home'|'list'|'detail', viewport: {width,height}, redirectedToLogin: boolean,
 *   textNodes: string[], chips: string[], blocks: {kind: string, texts: string[]}[],
 *   tierChips: string[], scaleTexts: string[], rowCount: number, mastheadTitle: string|null,
 *   containerScan: {viewportWidth:number, containers:object[]}|null,
 *   content: Record<string, object[]>|null (live-content.mjs measurements, null when content checks are off) }
 * @returns {{invariant:string, url:string, viewport:number, text:string, severity:'fail'|'warn'}[]}
 */
export function checkSnapshot(snap) {
  const out = [];
  const add = (invariant, text) =>
    out.push({
      invariant,
      url: snap.url,
      viewport: snap.viewport?.width ?? 0,
      method: "GET",
      status: snap.status ?? null,
      path: pathOf(snap.url),
      text: trunc(text),
      severity: WARNING_INVARIANTS.has(invariant) ? "warn" : "fail",
    });

  // A logged-out redirect is a failure of the session, distinct from a page defect: nothing else is
  // meaningful on a login page, so it is reported alone.
  if (snap.redirectedToLogin) {
    add(INVARIANTS.SESSION_INVALID, snap.redirectNote || "redirected to /login, the signed-in session was not accepted");
    return out;
  }

  for (const h of findMarkerTexts(snap.textNodes)) add(INVARIANTS.INTERNAL_MARKER, `[${h.ids.join(",")}] ${h.text}`);
  for (const t of new Set(findPlaceholderTexts([...(snap.textNodes ?? []), ...(snap.chips ?? [])]))) add(INVARIANTS.PLACEHOLDER_LITERAL, t);

  for (const b of snap.blocks ?? []) {
    if (!ANALYSIS_BLOCK_KINDS.includes(b.kind)) continue;
    for (const s of findRawTagSlugs(b.texts)) add(INVARIANTS.RAW_TAG_SLUG, `${b.kind}: ${s.slug} in "${s.text}"`);
    for (const t of findBareScores(b.texts)) add(INVARIANTS.BARE_SCORE, `${b.kind}: ${t}`);
  }

  if (snap.containerScan && isNarrowViewport(snap.viewport?.width)) {
    for (const h of detectContainerOverflows(snap.containerScan.containers, { viewportWidth: snap.containerScan.viewportWidth })) {
      add(INVARIANTS.SCROLL_CONTAINER, `${h.name}: ${h.reason}`);
    }
  }

  for (const t of findTiersAboveCeiling(snap.tierChips)) add(INVARIANTS.TIER_ABOVE_CEILING, `${t} (ceiling T${SOURCE_TIER_MAX})`);
  for (const t of findLegendsBelowCeiling(snap.scaleTexts)) add(INVARIANTS.LEGEND_BELOW_CEILING, `${t} (scale must reach T${SOURCE_TIER_MAX})`);

  for (const h of findAdminLinks(snap.adminLinks)) add(INVARIANTS.ADMIN_GATE, `the smoke account may have become a platform admin: an admin navigation link renders (${h})`);

  // Lane SMOKE-2: the elements the design places on this page, present and non-empty (the `each` scope; the `any`
  // scope is judged over the whole run by checkContentRun, which live-smoke.mjs calls once every page is visited).
  out.push(...checkContentSnapshot(snap));

  if (snap.kind === "list" && !(snap.rowCount > 0)) add(INVARIANTS.LIST_EMPTY, "no list row rendered");
  if (snap.kind === "detail" && !String(snap.mastheadTitle ?? "").trim()) add(INVARIANTS.DETAIL_NO_MASTHEAD, "no masthead title (h1)");
  return out;
}

// ---------------------------------------------------------------- admin gate (rule 15: proven by attack)
// The smoke account is a workspace owner and must NEVER be a platform admin. Signed in as that user: no admin
// navigation link renders anywhere, GET /admin is refused (a redirect away from /admin, or 401/403/404), and two
// read-only admin API routes answer 401/403/404 to a request carrying the user's own bearer token. Any 200 with admin
// content, or a link, is a failure named admin-gate and says the account may have become an admin. GET only, never POST.

/** Two read-only GET routes under src/app/api/admin, both behind requireAdminRoute (platform-admin gate). */
export const ADMIN_GATE_API_PATHS = Object.freeze(["/api/admin/coverage", "/api/admin/integrity-flags"]);

/** Statuses that count as a refusal. */
export const REFUSAL_STATUSES = Object.freeze([401, 403, 404]);

/** Hrefs on the page that point into /admin. @param {string[]} hrefs pathnames of every same-origin link */
export function findAdminLinks(hrefs) {
  return (hrefs ?? []).filter((h) => h === "/admin" || String(h).startsWith("/admin/"));
}

/**
 * Selectors that exist only inside the platform-admin dashboard. `data-admin-dashboard` is the stable attribute on
 * AdminDashboard's root element; `data-audit="admin-usage-rail"` is an existing audit hook inside it. The loading
 * shell the root `loading.tsx` streams carries neither, so a page that is only the shell does not match.
 */
export const ADMIN_MARKER_SELECTORS = Object.freeze(["[data-admin-dashboard]", '[data-audit="admin-usage-rail"]']);

/**
 * Judge one admin probe. PURE.
 * A page probe is read AFTER navigation settles (the runner waits for the URL to leave /admin): `/admin` is gated
 * server-side, but the root loading.tsx streams a 200 shell before the redirect fires, so the status and URL at
 * domcontentloaded are not the verdict. The verdict is the settled state: admin-only markers in the page fail it
 * whatever the URL says, and a page still on /admin fails unless it answered a refusal status (401/403/404).
 * @param {{kind:'page'|'api', path:string, status:number|null, finalPath?:string|null, markers?:number, tokenMissing?:boolean}} probe
 * @returns {string|null} the failure text, or null when the route refused
 */
export function judgeAdminProbe(probe) {
  const lead = "the smoke account may have become a platform admin: ";
  if (probe.tokenMissing) return `could not read the session token, so ${probe.path} cannot be verified as refused`;
  if (probe.kind === "page") {
    if (Number(probe.markers) > 0) return `${lead}GET ${probe.path} rendered admin-only markers (final path ${probe.finalPath ?? probe.path})`;
    const stayed = String(probe.finalPath ?? "").startsWith("/admin");
    if (!stayed) return null; // redirected away from /admin
    if (REFUSAL_STATUSES.includes(Number(probe.status))) return null;
    return `${lead}GET ${probe.path} stayed on /admin with status ${probe.status}`;
  }
  if (REFUSAL_STATUSES.includes(Number(probe.status))) return null;
  return `${lead}GET ${probe.path} answered ${probe.status}, expected 401/403/404`;
}

/** Findings for a set of admin probes. @param {object[]} probes @param {string} baseUrl */
export function checkAdminProbes(probes, baseUrl) {
  const out = [];
  for (const p of probes ?? []) {
    const why = judgeAdminProbe(p);
    if (why) out.push({ invariant: INVARIANTS.ADMIN_GATE, url: `${baseUrl}${p.path}`, viewport: 0, method: "GET", status: p.status ?? null, path: p.path, text: trunc(why), severity: "fail" });
  }
  return out;
}

/**
 * The Supabase session access token from `document.cookie`. @supabase/ssr stores `sb-<ref>-auth-token`, split into
 * `.0`, `.1` chunks when large, either raw JSON or `base64-<base64url json>`. Returns null when none parses. The token is
 * used in memory only and never logged. PURE.
 */
export function extractAccessToken(cookieString) {
  const parts = new Map();
  for (const raw of String(cookieString ?? "").split(";")) {
    const i = raw.indexOf("=");
    if (i < 0) continue;
    const name = raw.slice(0, i).trim();
    const m = /^(sb-.+-auth-token)(?:\.(\d+))?$/.exec(name);
    if (!m) continue;
    const list = parts.get(m[1]) ?? [];
    list.push([Number(m[2] ?? 0), raw.slice(i + 1).trim()]);
    parts.set(m[1], list);
  }
  for (const list of parts.values()) {
    let joined = list.sort((a, b) => a[0] - b[0]).map((x) => x[1]).join("");
    try { joined = decodeURIComponent(joined); } catch { /* keep as is */ }
    try {
      const json = joined.startsWith("base64-") ? Buffer.from(joined.slice(7).replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8") : joined;
      const token = JSON.parse(json)?.access_token;
      if (typeof token === "string" && token) return token;
    } catch { /* try the next cookie */ }
  }
  return null;
}

// ---------------------------------------------------------------- network and console

/**
 * Own-origin request outcomes. 5xx fails; 4xx is a warning with the path.
 * @param {{url:string,status:number,method?:string}[]} responses @param {string} origin
 */
export function checkResponses(responses, origin, ctx = {}) {
  const out = [];
  for (const r of responses ?? []) {
    let u;
    try { u = new URL(r.url); } catch { continue; }
    if (u.origin !== origin) continue;
    const status = Number(r.status);
    const method = String(r.method || "GET").toUpperCase();
    const row = { url: ctx.url ?? r.url, viewport: ctx.viewport ?? 0, method, status, path: u.pathname, text: `${status} ${u.pathname}` };
    if (status >= 500) out.push({ invariant: INVARIANTS.OWN_ORIGIN_5XX, ...row, severity: "fail" });
    else if (status >= 400) out.push({ invariant: INVARIANTS.OWN_ORIGIN_4XX, ...row, severity: "warn" });
  }
  return out;
}

/** A resource-load error is also logged to the console by the browser; the response check above owns those. */
const RESOURCE_LOAD_NOISE = /Failed to load resource/i;

/** Console errors (type "error"), minus the browser's own resource-load echo. @param {{type:string,text:string}[]} messages */
export function checkConsole(messages, ctx = {}) {
  const out = [];
  for (const m of messages ?? []) {
    if (m.type !== "error" || RESOURCE_LOAD_NOISE.test(String(m.text))) continue;
    out.push({ invariant: INVARIANTS.CONSOLE_ERROR, url: ctx.url ?? "", viewport: ctx.viewport ?? 0, text: trunc(m.text), severity: "fail" });
  }
  return out;
}

// ---------------------------------------------------------------- reporting

/**
 * Plain log lines: one line per DISTINCT finding, failures first. Every line names the severity, the invariant, the
 * HTTP method, the status and the path, then the offending text when it adds anything, then how many pages carried
 * it. 24 identical 403s on one route are one line with "24 pages", not 24 lines. The last line keeps the raw counts.
 * @param {object[]} findings
 */
export function formatSummary(findings) {
  const fails = findings.filter((f) => f.severity === "fail");
  const warns = findings.filter((f) => f.severity === "warn");
  const lines = [];
  for (const [label, list] of [["FAIL", fails], ["WARN", warns]]) {
    const groups = new Map();
    for (const f of list) {
      const method = f.method ?? "GET";
      const status = f.status ?? "-";
      const path = f.path ?? pathOf(f.url);
      const key = [f.invariant, method, status, path, f.text].join("");
      const g = groups.get(key) ?? { f, method, status, path, pages: new Set() };
      g.pages.add(`${f.viewport}|${f.url}`);
      groups.set(key, g);
    }
    for (const g of groups.values()) {
      const echo = `${g.status} ${g.path}`;
      const text = g.f.text && g.f.text !== echo ? ` :: ${g.f.text}` : "";
      lines.push(`${label} ${g.f.invariant} ${g.method} ${g.status} ${g.path}${text} (${g.pages.size} page${g.pages.size === 1 ? "" : "s"})`);
    }
  }
  lines.push(`live smoke: ${fails.length} failure(s), ${warns.length} warning(s)`);
  return lines;
}

/** The JSON report artifact. @param {{baseUrl:string, pages:{url:string,viewport:number}[], findings:object[]}} r */
export function buildReport({ baseUrl, pages, findings }) {
  const byInvariant = {};
  for (const f of findings) byInvariant[f.invariant] = (byInvariant[f.invariant] ?? 0) + 1;
  return {
    baseUrl,
    pagesVisited: pages,
    failureCount: findings.filter((f) => f.severity === "fail").length,
    warningCount: findings.filter((f) => f.severity === "warn").length,
    byInvariant,
    findings,
  };
}
