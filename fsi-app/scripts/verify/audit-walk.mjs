#!/usr/bin/env node
// audit-walk.mjs (lane E1b, 2026-10-11): the signed-in site walk the complete audit needs and a lane cannot do, because the
// smoke account's credentials live only in CI. READ-ONLY: GET navigations and screenshots, no click, no form submit.
// It signs in ONCE with the live smoke's own helper (live-smoke.mjs signIn, never a second copy), then visits every page
// route the app exposes and records, per page and viewport: status, title, h1, section headings, empty-state texts, console
// errors, failed requests, bad responses, horizontal overflow, plus a screenshot and the body text.
//
//   node audit-walk.mjs --plan [--app <dir>]                       print the route plan derived from src/app, no browser
//   node audit-walk.mjs --out <dir> [--app <dir>] [--no-anon]      the walk (LIVE_SMOKE_URL / _EMAIL / _PASSWORD from env)
//
// Plan. The route list is DERIVED from the page.tsx files under src/app, not typed: static routes are visited as they are,
// dynamic routes ([slug], [id]) are resolved to one real instance by reading the links on their nearest static ancestor
// page. Signed in: the dashboard, the five surfaces and one instance of each dynamic kind at 1440 and 375; every other
// static route at 1440. Anonymous (unless --no-anon): every static route at 1440, which records the sign-in gate.
//
// Interactions (signed in, desktop, the dashboard and the five surfaces; detail also at 375): open the first list row and record the
// detail route and its headings; apply one filter and one sort from the surface's own controls (chosen by accessible name, row
// count before and after); expand every collapsed section on the detail and record empty-state texts; follow one cross-surface
// link (spec 08 section 7, the human test) and record where it lands or dead-ends; a screenshot per state. Read-only by
// construction: every non-GET request to the app origin is aborted (counted as blockedWrites), and no control whose name is on
// FORBIDDEN_NAME (save, submit, delete, archive, post, send, apply, promote, publish, and the other write verbs) is clicked.
//
// Output (the directory given by --out): results.json (meta, discovered instances, rows, interactions, summary), screens/<route>-<vw>-<tag>.png
// and .txt (body text, capped). Credentials are passed to the form fields only and never printed or written.
//
// Wired: the "Audit walk" steps of .github/workflows/live-smoke.yml (workflow_dispatch input `walk`), which upload the output
// directory as the `audit-walk` artifact. Proven by audit-walk.test.mjs (the pure parts) and by --plan.

import { createRequire } from "node:module";
import { readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_APP_DIR = join(HERE, "..", "..", "src", "app");

/** The dashboard and the five customer surfaces: visited signed in at both viewports. */
export const SURFACE_ROUTES = Object.freeze(["/", "/regulations", "/market", "/research", "/operations", "/community"]);
/** Dynamic routes under these prefixes are not resolved: the smoke account is never a platform admin, there is nothing to find. */
export const NO_DISCOVERY_PREFIXES = Object.freeze(["/admin"]);
export const VIEWPORT_WIDTHS = Object.freeze({ desktop: 1440, phone: 375 });
const BODY_TEXT_CAP = 20000;
const NAV_TIMEOUT_MS = 45000;

// ------------------------------------------------------------------------------------------------ pure: route plan

/** The URL path of one page file, relative to the app directory ("market/[slug]/page.tsx" -> "/market/[slug]"). Route groups "(x)" vanish. PURE. */
export function routeOfPageFile(rel) {
  const parts = String(rel).split(/[\\/]+/).filter(Boolean);
  if (parts.length === 0 || !/^page\.(tsx|ts|jsx|js|mjs)$/.test(parts[parts.length - 1])) return null;
  const segs = parts.slice(0, -1).filter((s) => !/^\(.+\)$/.test(s));
  return `/${segs.join("/")}`;
}

const isDynamic = (route) => /\[[^\]]+\]/.test(route);
const parentOf = (route) => route.slice(0, route.lastIndexOf("/")) || "/";

/**
 * The walk plan from the page files. PURE.
 * @param {string[]} pageFiles paths relative to the app directory
 * @returns {{static: string[], dynamic: {pattern:string, listPath:string|null, hrefRegex:string}[]}}
 *   `listPath` is the nearest static ancestor route whose page links to instances; null when none exists or discovery is off.
 *   `hrefRegex` matches an instance href: the pattern with each [param] one segment, never a static sibling route.
 */
export function derivePlan(pageFiles) {
  const routes = [...new Set((pageFiles ?? []).map(routeOfPageFile).filter(Boolean))].sort();
  const statics = routes.filter((r) => !isDynamic(r));
  const staticSet = new Set(statics);
  const dynamic = routes.filter(isDynamic).map((pattern) => {
    let listPath = null;
    if (!NO_DISCOVERY_PREFIXES.some((p) => pattern === p || pattern.startsWith(`${p}/`))) {
      for (let anc = parentOf(pattern); ; anc = parentOf(anc)) {
        if (staticSet.has(anc) && anc !== "/") { listPath = anc; break; }
        if (anc === "/") break;
      }
    }
    const siblings = statics.filter((s) => parentOf(s) === parentOf(pattern) && s !== "/");
    const body = pattern.split("/").map((seg) => (/^\[[^\]]+\]$/.test(seg) ? "[^/]+" : seg.replace(/[.*+?^${}()|\\]/g, "\\$&"))).join("/");
    const exclude = siblings.length ? `(?!(?:${siblings.map((s) => s.slice(s.lastIndexOf("/") + 1).replace(/[.*+?^${}()|\\]/g, "\\$&")).join("|")})$)` : "";
    // The exclusion sits before the LAST segment only: it names static siblings of the dynamic segment.
    const hrefRegex = exclude ? body.replace(/\/\[\^\/\]\+$/, `/${exclude}[^/]+`) : body;
    return { pattern, listPath, hrefRegex: `^${hrefRegex}$` };
  });
  return { static: statics, dynamic };
}

/** The first matching same-origin href per dynamic route. PURE. @param {Record<string,string[]>} hrefsByListPath */
export function resolveInstances(plan, hrefsByListPath) {
  const out = {};
  for (const d of plan.dynamic) {
    if (!d.listPath) continue;
    const re = new RegExp(d.hrefRegex);
    const hrefs = (hrefsByListPath?.[d.listPath] ?? []).map((h) => String(h).split("?")[0].split("#")[0]);
    const hit = [...new Set(hrefs)].find((h) => re.test(h));
    if (hit) out[d.pattern] = hit;
  }
  return out;
}

/**
 * The visits of one pass. PURE. Signed in: required = the dashboard and surfaces plus each resolved dynamic instance (both
 * viewports); extras = every other static route (desktop only). Anonymous: every static route at desktop.
 * @returns {{route:string, width:number, tag:string}[]}
 */
export function buildVisits(plan, instances, { anon = true } = {}) {
  const { desktop, phone } = VIEWPORT_WIDTHS;
  const required = [...SURFACE_ROUTES.filter((r) => plan.static.includes(r)), ...Object.values(instances ?? {})];
  const extras = plan.static.filter((r) => !required.includes(r));
  const visits = [];
  for (const width of [desktop, phone]) for (const route of required) visits.push({ route, width, tag: "auth" });
  for (const route of extras) visits.push({ route, width: desktop, tag: "auth" });
  if (anon) for (const route of [...plan.static, ...Object.values(instances ?? {})]) visits.push({ route, width: desktop, tag: "anon" });
  return visits;
}

// ------------------------------------------------------------------------------------------------ pure: row shaping

const SIGN_IN_PATH = /^\/(login|signup|auth)/;
const clip = (s, n) => { const t = String(s ?? "").replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n)}...` : t; };

/** A file-name stem for a route and pass ("/market/series", 1440, "auth" -> "market_series-1440-auth"). PURE. */
export function screenStem(route, width, tag) {
  const slug = String(route).replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "home";
  return `${slug}-${width}-${tag}`;
}

/**
 * One result row from a raw page measurement. PURE: lists are capped, text is clipped, the sign-in redirect is derived.
 * @param {{route:string,width:number,tag:string,status?:number|null,finalPath?:string,origin?:string,title?:string,h1?:string[],headings?:string[],empties?:string[],bodyChars?:number,links?:number,buttons?:number,overflowX?:boolean,scrollW?:number,console?:string[],failed?:string[],bad?:string[],error?:string,ms?:number,screenshot?:string}} raw
 * @param {string} baseOrigin
 */
export function shapeRow(raw, baseOrigin) {
  const finalPath = String(raw.finalPath ?? "");
  const toLogin = SIGN_IN_PATH.test(finalPath) && !SIGN_IN_PATH.test(raw.route);
  return {
    route: raw.route,
    viewport: raw.width,
    tag: raw.tag,
    status: raw.status ?? null,
    finalPath,
    toLogin,
    offOrigin: raw.origin != null && baseOrigin != null && raw.origin !== baseOrigin,
    title: clip(raw.title, 160),
    h1: (raw.h1 ?? []).slice(0, 5).map((t) => clip(t, 120)),
    headings: (raw.headings ?? []).slice(0, 80).map((t) => clip(t, 140)),
    headingCount: (raw.headings ?? []).length,
    empties: [...new Set((raw.empties ?? []).map((t) => clip(t, 200)))].slice(0, 25),
    bodyChars: raw.bodyChars ?? 0,
    links: raw.links ?? 0,
    buttons: raw.buttons ?? 0,
    overflowX: raw.overflowX === true,
    scrollW: raw.scrollW ?? null,
    consoleCount: (raw.console ?? []).length,
    console: (raw.console ?? []).slice(0, 15).map((t) => clip(t, 240)),
    failedRequests: (raw.failed ?? []).slice(0, 15).map((t) => clip(t, 200)),
    badResponses: (raw.bad ?? []).slice(0, 15).map((t) => clip(t, 200)),
    error: raw.error ? clip(raw.error, 200) : undefined,
    ms: raw.ms ?? null,
    screenshot: raw.screenshot ?? null,
  };
}

/** Totals over the rows. PURE. */
export function summarize(rows) {
  const auth = rows.filter((r) => r.tag === "auth");
  const anon = rows.filter((r) => r.tag === "anon");
  return {
    rows: rows.length,
    authRows: auth.length,
    anonRows: anon.length,
    authToLogin: auth.filter((r) => r.toLogin).length,
    anonToLogin: anon.filter((r) => r.toLogin).length,
    errors: rows.filter((r) => r.error).length,
    withConsoleErrors: rows.filter((r) => r.consoleCount > 0).length,
    withBadResponses: rows.filter((r) => r.badResponses.length > 0).length,
    withOverflow: rows.filter((r) => r.overflowX).length,
    emptyStateRows: rows.filter((r) => r.empties.length > 0).length,
  };
}

/** Parse the CLI. PURE. */
export function parseArgs(argv) {
  const a = { plan: false, out: null, app: null, anon: true };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === "--plan") a.plan = true;
    else if (v === "--no-anon") a.anon = false;
    else if (v === "--out") a.out = argv[++i] ?? null;
    else if (v === "--app") a.app = argv[++i] ?? null;
  }
  return a;
}

// ------------------------------------------------------------------------------------------------ pure: interactions
// The interaction pass (addendum, operator): per surface, read-only, open the first list row, apply one filter and one sort
// from the surface's own controls, expand every collapsed section on the detail, follow one cross-surface link (spec 08
// section 7, the human test: reach a related item without the URL bar). The picking and the shaping are pure and tested.

/** An accessible name that must never be clicked: the operator's list, plus every other write or leave-the-page verb. */
export const FORBIDDEN_NAME = /\b(save|submit|delete|archive|post|send|apply|promote|publish|remove|add|create|invite|reply|report|follow|unfollow|join|leave|export|download|upload|sign ?out|log ?out|subscribe|unsubscribe|approve|reject|resolve|dismiss|confirm|pin|mute|block|edit|rename)\b/i;
/** True when a control's accessible name is on the do-not-click list (an empty name is also refused: nothing to select by). PURE. */
export const isForbiddenName = (name) => !String(name ?? "").trim() || FORBIDDEN_NAME.test(String(name));

const NEUTRAL_NAME = /^(all|clear|reset|none|any|more|less|show more|show less|close|cancel|back|menu|search|filter|filters)\b/i;
const SORT_BUTTON = /^(newest|oldest|a-z|z-a|alphabetical|next date|priority|confidence|most recent|recent|urgency)$/i;

/**
 * Pick the control for ONE filter. PURE.
 * @param {{name:string, role:string, active:boolean, stateful:boolean}[]} controls controls inside the page's main region
 * @returns {number} index of the chosen control, or -1. A filter is a stateful toggle (aria-pressed/selected/checked, a
 *   checkbox, a tab) that is not already active, not a sort button, not neutral (all/clear/reset) and not on the do-not-click list.
 */
export function pickFilterControl(controls) {
  return (controls ?? []).findIndex((c) => c && c.stateful && !c.active && String(c.name ?? "").length <= 40
    && !isForbiddenName(c.name) && !NEUTRAL_NAME.test(String(c.name).trim()) && !SORT_BUTTON.test(String(c.name).trim()));
}

/**
 * Pick the control for ONE sort. PURE.
 * @param {{name:string, role:string, active:boolean, options?:{value:string,label:string,selected:boolean}[]}[]} controls
 * @returns {{index:number, kind:'select'|'button', option?:string}|null} a select whose name says sort/order (the first option that is
 *   not selected), else a button named like a sort key that is not already active.
 */
export function pickSortControl(controls) {
  const list = controls ?? [];
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (c.role === "combobox" && /sort|order/i.test(String(c.name)) && !isForbiddenName(c.name)) {
      const opt = (c.options ?? []).find((o) => !o.selected && !isForbiddenName(o.label));
      if (opt) return { index: i, kind: "select", option: opt.value };
    }
  }
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (c.role !== "combobox" && !c.active && SORT_BUTTON.test(String(c.name).trim()) && !isForbiddenName(c.name)) return { index: i, kind: "button" };
  }
  return null;
}

/** The detail-link pattern a surface's list rows point at (the dynamic route whose parent is the surface), or a union for the dashboard. PURE. */
export function detailRegexFor(plan, surfaceRoute) {
  const dyn = plan.dynamic.filter((d) => d.listPath && !NO_DISCOVERY_PREFIXES.some((p) => d.pattern.startsWith(`${p}/`)));
  const mine = surfaceRoute === "/" ? dyn : dyn.filter((d) => d.listPath === surfaceRoute);
  return mine.map((d) => d.hrefRegex);
}

/** Hrefs that lead to a DIFFERENT surface's detail page, first one preferred in the given order. PURE. */
export function crossSurfaceHrefs(hrefs, plan, surfaceRoute) {
  const top = (p) => `/${String(p).split("/").filter(Boolean)[0] ?? ""}`;
  const regexes = plan.dynamic.filter((d) => d.listPath && !NO_DISCOVERY_PREFIXES.some((p) => d.pattern.startsWith(`${p}/`))).map((d) => new RegExp(d.hrefRegex));
  const seen = new Set();
  const out = [];
  for (const h of hrefs ?? []) {
    const path = String(h).split("?")[0].split("#")[0];
    if (seen.has(path) || !regexes.some((r) => r.test(path))) continue;
    if (surfaceRoute !== "/" && top(path) === top(surfaceRoute)) continue;
    seen.add(path); out.push(path);
  }
  return out;
}

/** Did a followed link land on a page, or dead-end (4xx/5xx, a not-found page, back at sign-in, or off-origin)? PURE. */
export function classifyLanding({ status, finalPath, h1, title, offOrigin } = {}) {
  const text = `${(h1 ?? []).join(" ")} ${title ?? ""}`;
  if (offOrigin) return { landed: false, reason: "left the site" };
  if (Number(status) >= 400) return { landed: false, reason: `status ${status}` };
  if (SIGN_IN_PATH.test(String(finalPath ?? ""))) return { landed: false, reason: "sent to sign-in" };
  if (/\b404\b|not found|doesn.t exist|page could not be found/i.test(text)) return { landed: false, reason: "not-found page" };
  if (!String(h1?.[0] ?? title ?? "").trim()) return { landed: false, reason: "no heading rendered" };
  return { landed: true, reason: null };
}

/**
 * Shape one surface's interaction record into steps plus the short INTERACTIONS list the register row carries. PURE.
 * Each raw step: { step, did: boolean, note?, error?, rowsBefore?, rowsAfter?, firstBefore?, firstAfter?, detail?, headings?, empties?,
 *   expanded?, landing?, console?, bad?, failed? }. state: errored (threw or console/network errors), empty (did it but the
 *   outcome is empty: zero rows after, no headings, no expandables), skipped (the page offers no such control), worked.
 */
export function shapeInteraction(raw) {
  const steps = (raw.steps ?? []).map((s) => {
    const errs = (s.console ?? []).length + (s.bad ?? []).length + (s.failed ?? []).length;
    let state = "worked";
    if (s.error) state = "errored";
    else if (!s.did) state = "skipped";
    else if (s.rowsAfter === 0 || (s.step === "open-first-row" && !(s.headings ?? []).length) || (s.step === "expand-sections" && s.expanded === 0)) state = "empty";
    else if (s.landing && s.landing.landed === false) state = "errored";
    else if (errs > 0) state = "errored";
    return {
      step: s.step, state, note: s.note ? String(s.note).slice(0, 200) : undefined, error: s.error ? String(s.error).slice(0, 200) : undefined,
      rowsBefore: s.rowsBefore ?? null, rowsAfter: s.rowsAfter ?? null, firstBefore: s.firstBefore ?? null, firstAfter: s.firstAfter ?? null,
      detail: s.detail ?? null, headings: (s.headings ?? []).slice(0, 60), empties: [...new Set(s.empties ?? [])].slice(0, 20),
      expanded: s.expanded ?? null, landing: s.landing ?? null,
      console: (s.console ?? []).slice(0, 10).map((t) => String(t).slice(0, 200)), bad: (s.bad ?? []).slice(0, 10), failed: (s.failed ?? []).slice(0, 10),
      screenshot: s.screenshot ?? null,
    };
  });
  const line = (s) => {
    const bits = [`${s.step}: ${s.state}`];
    if (s.rowsBefore != null) bits.push(`rows ${s.rowsBefore} -> ${s.rowsAfter}`);
    if (s.firstBefore != null && s.firstAfter != null && s.firstBefore !== s.firstAfter) bits.push(`first row changed`);
    if (s.detail) bits.push(`detail ${s.detail}${s.headings.length ? ` (${s.headings.length} headings)` : ""}`);
    if (s.expanded != null) bits.push(`${s.expanded} expanded`);
    if (s.landing) bits.push(s.landing.landed ? `landed ${s.landing.to ?? ""}`.trim() : `dead end (${s.landing.reason})`);
    if (s.note) bits.push(s.note);
    if (s.error) bits.push(`error ${s.error}`);
    const n = s.console.length + s.bad.length + s.failed.length;
    if (n) bits.push(`${n} console/network error(s)`);
    return bits.join("; ");
  };
  return {
    surface: raw.surface,
    interactions: steps.map(line),
    counts: { worked: steps.filter((s) => s.state === "worked").length, empty: steps.filter((s) => s.state === "empty").length, errored: steps.filter((s) => s.state === "errored").length, skipped: steps.filter((s) => s.state === "skipped").length },
    blockedWrites: raw.blockedWrites ?? 0,
    steps,
  };
}

// ------------------------------------------------------------------------------------------------ io

/** Every page file under the app directory, relative paths. */
export function listPageFiles(appDir = DEFAULT_APP_DIR) {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/^page\.(tsx|ts|jsx|js|mjs)$/.test(e.name)) out.push(relative(appDir, p).split(sep).join("/"));
    }
  };
  walk(appDir);
  return out.sort();
}

/** Runs in the page: the structural facts the register needs. Self-contained (serialised into the browser). */
function measureInPage(emptySrc) {
  const EMPTY = new RegExp(emptySrc, "i");
  const txt = (e) => (e.innerText || "").replace(/\s+/g, " ").trim();
  const heads = [...document.querySelectorAll("h1,h2,h3,h4,[role=heading]")].map((h) => `${h.tagName.toLowerCase()}: ${txt(h).slice(0, 120)}`).filter((s) => s.length > 4);
  const empties = new Set();
  for (const e of document.querySelectorAll("[data-empty],[class*=empty],[class*=Empty],[data-state-note],[class*=state-note],[role=status]")) { const t = txt(e); if (t && t.length < 300) empties.add(t.slice(0, 200)); }
  for (const e of document.querySelectorAll("p,div,span,li,td")) { if (e.children.length > 3) continue; const t = txt(e); if (t && t.length < 160 && EMPTY.test(t)) empties.add(t); }
  const body = document.body ? document.body.innerText : "";
  return {
    title: document.title,
    finalPath: location.pathname + location.search,
    origin: location.origin,
    h1: [...document.querySelectorAll("h1")].map((h) => txt(h)),
    headings: heads,
    empties: [...empties],
    bodyChars: body.length,
    links: document.querySelectorAll("a[href]").length,
    buttons: document.querySelectorAll("button").length,
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
    scrollW: document.documentElement.scrollWidth,
    bodyText: body,
  };
}

const EMPTY_SRC = String.raw`\b(no (?:\w+ ){0,3}(?:found|yet|available|data|results|items|matches|records|entries|posts|threads)|nothing|none (?:yet|found|available)|not (?:yet|assessed|available)|coming soon|unavailable|no data|empty|0 results|haven.t|has not been)\b`;

async function visitOne(ctx, baseUrl, visit, screensDir) {
  const page = await ctx.newPage();
  const consoleMsgs = [], failed = [], bad = [];
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") consoleMsgs.push(`${m.type()}: ${m.text()}`); });
  page.on("pageerror", (e) => consoleMsgs.push(`pageerror: ${String(e?.message ?? e)}`));
  page.on("requestfailed", (r) => failed.push(`${r.method()} ${r.url().split("?")[0]} :: ${r.failure()?.errorText ?? ""}`));
  page.on("response", (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.request().method()} ${r.url().split("?")[0]}`); });
  const raw = { route: visit.route, width: visit.width, tag: visit.tag };
  const t0 = Date.now();
  try {
    const resp = await page.goto(`${baseUrl}${visit.route}`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    raw.status = resp ? resp.status() : null;
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(800);
    const m = await page.evaluate(measureInPage, EMPTY_SRC);
    const { bodyText, ...rest } = m;
    Object.assign(raw, rest);
    raw.ms = Date.now() - t0;
    const stem = screenStem(visit.route, visit.width, visit.tag);
    writeFileSync(join(screensDir, `${stem}.txt`), String(bodyText).slice(0, BODY_TEXT_CAP));
    try { await page.screenshot({ path: join(screensDir, `${stem}.png`), fullPage: true, timeout: 30000 }); raw.screenshot = `screens/${stem}.png`; }
    catch (e) { raw.screenshot = null; consoleMsgs.push(`screenshot failed: ${String(e?.message ?? e).split("\n")[0]}`); }
  } catch (e) {
    raw.error = String(e?.message ?? e).split("\n")[0];
  } finally {
    raw.console = consoleMsgs; raw.failed = failed; raw.bad = bad;
    await page.close();
  }
  return raw;
}

async function discover(ctx, baseUrl, plan) {
  const lists = [...new Set(plan.dynamic.map((d) => d.listPath).filter(Boolean))];
  const hrefsByListPath = {};
  for (const listPath of lists) {
    const page = await ctx.newPage();
    try {
      await page.goto(`${baseUrl}${listPath}`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      hrefsByListPath[listPath] = await page.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")));
    } catch { hrefsByListPath[listPath] = []; } finally { await page.close(); }
  }
  return hrefsByListPath;
}

// ---- the interaction pass (browser side). Every request other than a GET/HEAD/OPTIONS to the app's own origin is aborted, so
// nothing the page might send can write, whatever was clicked; the count of aborted requests is recorded as blockedWrites.

const settlePage = async (page) => { await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(500); };

/** Controls in the main region, described for the pure pickers. Runs in the page. */
function describeControls() {
  const root = document.querySelector("main") || document.body;
  const nameOf = (e) => (e.getAttribute("aria-label") || e.innerText || e.getAttribute("title") || e.getAttribute("value") || "").replace(/\s+/g, " ").trim();
  const out = [];
  for (const e of root.querySelectorAll("button,[role=tab],[role=checkbox],[role=radio],input[type=checkbox],input[type=radio],select")) {
    if (!(e.offsetWidth || e.offsetHeight)) continue;
    const tag = e.tagName.toLowerCase();
    const explicit = e.getAttribute("role");
    const role = tag === "select" ? "combobox" : explicit || (tag === "input" ? e.type : "button");
    const attr = e.getAttribute("aria-pressed") ?? e.getAttribute("aria-selected") ?? e.getAttribute("aria-checked");
    const isCheck = tag === "input";
    let name = nameOf(e);
    if (tag === "select" || (isCheck && !name)) { const lab = e.id ? document.querySelector(`label[for="${e.id}"]`) : null; name = (e.getAttribute("aria-label") || (lab && lab.innerText) || (e.closest("label") && e.closest("label").innerText) || name || "").replace(/\s+/g, " ").trim(); }
    out.push({
      name, role,
      active: attr != null ? attr === "true" : isCheck ? e.checked : false,
      stateful: attr != null || isCheck || explicit === "tab",
      options: tag === "select" ? [...e.options].map((o) => ({ value: o.value, label: o.text, selected: o.selected })) : undefined,
    });
  }
  return out;
}

/** Row evidence on a list page: unique detail links (by the surface's pattern) and the first one's text. Runs in the page. */
function rowEvidence(regexSources) {
  const res = regexSources.map((s) => new RegExp(s));
  const seen = new Map();
  for (const a of document.querySelectorAll("a[href]")) {
    const h = (a.getAttribute("href") || "").split("?")[0].split("#")[0];
    if (res.some((r) => r.test(h)) && !seen.has(h) && (a.offsetWidth || a.offsetHeight)) seen.set(h, (a.innerText || "").replace(/\s+/g, " ").trim().slice(0, 100));
  }
  const hrefs = [...seen.keys()];
  return { rows: hrefs.length, first: hrefs.length ? seen.get(hrefs[0]) || hrefs[0] : null, firstHref: hrefs[0] ?? null };
}

export async function interactSurface(browser, storageState, baseUrl, plan, surfaceRoute, screensDir) {
  const raw = { surface: surfaceRoute, steps: [], blockedWrites: 0 };
  const ctx = await browser.newContext({ storageState, viewport: { width: VIEWPORT_WIDTHS.desktop, height: 900 } });
  const origin = new URL(baseUrl).origin;
  await ctx.route("**/*", (route) => {
    const req = route.request();
    if (req.url().startsWith(origin) && !["GET", "HEAD", "OPTIONS"].includes(req.method())) { raw.blockedWrites += 1; return route.abort(); }
    return route.continue();
  });
  const page = await ctx.newPage();
  const log = { console: [], bad: [], failed: [] };
  let lastDocStatus = null;
  page.on("console", (m) => { if (m.type() === "error") log.console.push(m.text()); });
  page.on("pageerror", (e) => log.console.push(`pageerror: ${String(e?.message ?? e)}`));
  page.on("response", (r) => { if (r.request().resourceType() === "document") lastDocStatus = r.status(); if (r.status() >= 400) log.bad.push(`${r.status()} ${r.request().method()} ${r.url().split("?")[0]}`); });
  page.on("requestfailed", (r) => { if (!/net::ERR_ABORTED/.test(r.failure()?.errorText ?? "")) log.failed.push(`${r.method()} ${r.url().split("?")[0]} :: ${r.failure()?.errorText ?? ""}`); });
  const regexes = detailRegexFor(plan, surfaceRoute);
  const shot = async (name) => { const stem = `${screenStem(surfaceRoute, VIEWPORT_WIDTHS.desktop, "int")}-${name}`; try { await page.screenshot({ path: join(screensDir, `${stem}.png`), fullPage: true, timeout: 30000 }); return `screens/${stem}.png`; } catch { return null; } };
  const step = async (name, fn) => {
    const mark = { c: log.console.length, b: log.bad.length, f: log.failed.length };
    const s = { step: name, did: false };
    try { Object.assign(s, await fn()); } catch (e) { s.error = String(e?.message ?? e).split("\n")[0]; }
    s.console = log.console.slice(mark.c); s.bad = log.bad.slice(mark.b); s.failed = log.failed.slice(mark.f);
    raw.steps.push(s);
  };
  const open = async () => { await page.goto(`${baseUrl}${surfaceRoute}`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS }); await settlePage(page); };

  await step("load", async () => { await open(); const m = await page.evaluate(measureInPage, EMPTY_SRC); return { did: true, headings: m.headings, empties: m.empties, screenshot: await shot("0-list") }; });
  let before = await page.evaluate(rowEvidence, regexes).catch(() => ({ rows: 0, first: null, firstHref: null }));

  await step("filter", async () => {
    const controls = await page.evaluate(describeControls);
    const i = pickFilterControl(controls);
    if (i < 0) return { did: false, note: `no stateful filter control offered (${controls.length} controls seen)` };
    const c = controls[i];
    const loc = c.role === "button" ? page.getByRole("button", { name: c.name, exact: true }) : page.getByRole(c.role === "combobox" ? "combobox" : c.role, { name: c.name, exact: true });
    await loc.first().click({ timeout: 8000 });
    await settlePage(page);
    const after = await page.evaluate(rowEvidence, regexes);
    const shotPath = await shot("1-filter");
    return { did: true, note: `filter "${c.name}"`, rowsBefore: before.rows, rowsAfter: after.rows, firstBefore: before.first, firstAfter: after.first, screenshot: shotPath };
  });
  await open(); before = await page.evaluate(rowEvidence, regexes).catch(() => before);

  await step("sort", async () => {
    const controls = await page.evaluate(describeControls);
    const pick = pickSortControl(controls);
    if (!pick) return { did: false, note: "no sort control offered" };
    const c = controls[pick.index];
    if (pick.kind === "select") await page.getByRole("combobox", { name: c.name, exact: true }).first().selectOption(pick.option, { timeout: 8000 });
    else await page.getByRole("button", { name: c.name, exact: true }).first().click({ timeout: 8000 });
    await settlePage(page);
    const after = await page.evaluate(rowEvidence, regexes);
    return { did: true, note: `sort "${c.name}"`, rowsBefore: before.rows, rowsAfter: after.rows, firstBefore: before.first, firstAfter: after.first, screenshot: await shot("2-sort") };
  });
  await open();
  before = await page.evaluate(rowEvidence, regexes).catch(() => before);

  let detailPath = null;
  await step("open-first-row", async () => {
    if (!before.firstHref) return { did: false, note: "no list row with a detail link on this page" };
    await page.locator(`a[href="${before.firstHref}"]`).first().click({ timeout: 8000 });
    await page.waitForURL((u) => u.pathname !== surfaceRoute, { timeout: 20000 }).catch(() => {});
    await settlePage(page);
    const m = await page.evaluate(measureInPage, EMPTY_SRC);
    detailPath = m.finalPath.split("?")[0];
    return { did: true, detail: detailPath, headings: m.headings, empties: m.empties, rowsBefore: before.rows, screenshot: await shot("3-detail") };
  });

  await step("expand-sections", async () => {
    if (!detailPath) return { did: false, note: "no detail page open" };
    const names = [];
    for (let guard = 0; guard < 60; guard++) {
      const t = await page.evaluate(() => {
        const nameOf = (e) => (e.getAttribute("aria-label") || e.innerText || "").replace(/\s+/g, " ").trim().slice(0, 80);
        const b = [...document.querySelectorAll('button[aria-expanded="false"]')].find((e) => (e.offsetWidth || e.offsetHeight) && !e.dataset.auditSeen);
        if (b) { b.dataset.auditSeen = "1"; return { kind: "button", name: nameOf(b), idx: [...document.querySelectorAll('button[aria-expanded="false"]')].indexOf(b) }; }
        const s = [...document.querySelectorAll("details:not([open]) > summary")].find((e) => (e.offsetWidth || e.offsetHeight) && !e.dataset.auditSeen);
        if (s) { s.dataset.auditSeen = "1"; return { kind: "summary", name: nameOf(s), idx: [...document.querySelectorAll("details:not([open]) > summary")].indexOf(s) }; }
        return null;
      });
      if (!t) break;
      if (isForbiddenName(t.name) && t.name) { names.push(`skipped "${t.name}"`); continue; }
      const sel = t.kind === "button" ? 'button[aria-expanded="false"]' : "details:not([open]) > summary";
      await page.locator(sel).nth(t.idx).click({ timeout: 4000 }).then(() => names.push(t.name || "(unnamed)")).catch(() => names.push(`failed "${t.name}"`));
    }
    await page.waitForTimeout(500);
    const m = await page.evaluate(measureInPage, EMPTY_SRC);
    return { did: true, expanded: names.filter((n) => !n.startsWith("skipped") && !n.startsWith("failed")).length, note: names.slice(0, 12).join(" | "), headings: m.headings, empties: m.empties, screenshot: await shot("4-expanded") };
  });

  await step("cross-surface-link", async () => {
    if (!detailPath) return { did: false, note: "no detail page open" };
    const hrefs = await page.evaluate(() => {
      const within = [...document.querySelectorAll("#across-pages a[href]")].map((a) => a.getAttribute("href"));
      const rest = [...document.querySelectorAll("main a[href]")].map((a) => a.getAttribute("href"));
      return [...within, ...rest];
    });
    const cross = crossSurfaceHrefs(hrefs, plan, surfaceRoute === "/" ? "/__none__" : detailPath);
    if (cross.length === 0) return { did: false, note: "the detail offers no link to another surface's item" };
    lastDocStatus = null;
    await page.locator(`a[href="${cross[0]}"]`).first().click({ timeout: 8000 });
    await page.waitForURL((u) => u.pathname !== detailPath, { timeout: 20000 }).catch(() => {});
    await settlePage(page);
    const m = await page.evaluate(measureInPage, EMPTY_SRC);
    const landing = { ...classifyLanding({ status: lastDocStatus, finalPath: m.finalPath, h1: m.h1, title: m.title, offOrigin: m.origin !== origin }), from: detailPath, to: m.finalPath.split("?")[0], h1: (m.h1 ?? [])[0] ?? null };
    return { did: true, landing, headings: m.headings, empties: m.empties, screenshot: await shot("5-cross") };
  });
  await ctx.close();

  if (detailPath) {
    const pctx = await browser.newContext({ storageState, viewport: { width: VIEWPORT_WIDTHS.phone, height: 812 } });
    const p = await pctx.newPage();
    const s = { step: "detail-375", did: false, console: [], bad: [], failed: [] };
    p.on("console", (m) => { if (m.type() === "error") s.console.push(m.text()); });
    try {
      await p.goto(`${baseUrl}${detailPath}`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
      await settlePage(p);
      const m = await p.evaluate(measureInPage, EMPTY_SRC);
      const stem = `${screenStem(surfaceRoute, VIEWPORT_WIDTHS.phone, "int")}-3-detail`;
      await p.screenshot({ path: join(screensDir, `${stem}.png`), fullPage: true, timeout: 30000 }).catch(() => {});
      Object.assign(s, { did: true, detail: detailPath, headings: m.headings, empties: m.empties, note: m.overflowX ? `horizontal overflow (scrollWidth ${m.scrollW})` : "no horizontal overflow", screenshot: `screens/${stem}.png` });
    } catch (e) { s.error = String(e?.message ?? e).split("\n")[0]; }
    raw.steps.push(s);
    await pctx.close();
  }
  return raw;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const appDir = args.app || DEFAULT_APP_DIR;
  const plan = derivePlan(listPageFiles(appDir));
  if (args.plan) {
    const visits = buildVisits(plan, {}, { anon: args.anon });
    console.log(JSON.stringify({ static: plan.static, dynamic: plan.dynamic, visitsBeforeDiscovery: visits.length }, null, 2));
    return 0;
  }
  if (!args.out) { console.error("audit-walk: --out <dir> is required for a walk (or use --plan)"); return 2; }

  const env = process.env;
  // Reuse, never copy: the host allowlist and the sign-in helper are the live smoke's own.
  const { preflight } = await import("../../.discipline/rendering/live/live-preflight.mjs");
  const { signIn } = await import("../../.discipline/rendering/live/live-smoke.mjs");
  const pre = preflight({ url: env.LIVE_SMOKE_URL, email: env.LIVE_SMOKE_EMAIL, password: env.LIVE_SMOKE_PASSWORD });
  if (!pre.ok) { for (const e of pre.errors) console.error(`::error::${e}`); return 1; }
  const { chromium } = createRequire(import.meta.url)("playwright");

  const screensDir = join(args.out, "screens");
  mkdirSync(screensDir, { recursive: true });
  const browser = await chromium.launch();
  const result = { meta: { base: pre.origin, ranAt: new Date().toISOString(), signedIn: false, node: process.version }, plan, instances: {}, rows: [], interactions: [], summary: null };
  let code = 0;
  try {
    const storageState = await signIn(browser, pre.origin, { email: env.LIVE_SMOKE_EMAIL, password: env.LIVE_SMOKE_PASSWORD });
    result.meta.signedIn = storageState != null;
    if (!storageState) { console.error("::error::audit-walk: sign-in did not complete (check LIVE_SMOKE_EMAIL and LIVE_SMOKE_PASSWORD)"); code = 1; }
    const sizeOf = (w) => ({ width: w, height: w === VIEWPORT_WIDTHS.desktop ? 900 : 812 });
    if (storageState) {
      const dctx = await browser.newContext({ storageState, viewport: sizeOf(VIEWPORT_WIDTHS.desktop) });
      result.instances = resolveInstances(plan, await discover(dctx, pre.origin, plan));
      await dctx.close();
    }
    const visits = buildVisits(plan, result.instances, { anon: args.anon }).filter((v) => v.tag === "anon" || storageState);
    for (const tag of ["auth", "anon"]) {
      for (const width of [VIEWPORT_WIDTHS.desktop, VIEWPORT_WIDTHS.phone]) {
        const batch = visits.filter((v) => v.tag === tag && v.width === width);
        if (batch.length === 0) continue;
        const ctx = await browser.newContext({ ...(tag === "auth" ? { storageState } : {}), viewport: sizeOf(width) });
        for (const v of batch) {
          const row = shapeRow(await visitOne(ctx, pre.origin, v, screensDir), pre.origin);
          result.rows.push(row);
          console.log(`${tag} ${width} ${v.route} ${row.status ?? "-"} ${row.toLogin ? "->login" : row.finalPath}${row.error ? ` ERROR ${row.error}` : ""}`);
        }
        await ctx.close();
      }
    }
    if (storageState) {
      for (const surface of SURFACE_ROUTES.filter((r) => plan.static.includes(r))) {
        let shaped;
        try { shaped = shapeInteraction(await interactSurface(browser, storageState, pre.origin, plan, surface, screensDir)); }
        catch (e) { shaped = shapeInteraction({ surface, steps: [{ step: "interact", did: false, error: String(e?.message ?? e).split("\n")[0] }] }); }
        result.interactions.push(shaped);
        console.log(`interact ${surface}: ${JSON.stringify(shaped.counts)}; blocked writes ${shaped.blockedWrites}`);
      }
    }
  } finally {
    await browser.close();
    result.summary = { ...summarize(result.rows), interactionSurfaces: result.interactions.length, interactionSteps: result.interactions.reduce((n, i) => n + i.steps.length, 0), interactionsErrored: result.interactions.reduce((n, i) => n + i.counts.errored, 0) };
    writeFileSync(join(args.out, "results.json"), `${JSON.stringify(result, null, 2)}\n`);
  }
  console.log(`audit-walk: ${JSON.stringify(result.summary)}`);
  return code;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then((c) => process.exit(c), (e) => { console.error("audit-walk ERROR:", String(e?.message ?? e).split("\n")[0]); process.exit(2); });
}
