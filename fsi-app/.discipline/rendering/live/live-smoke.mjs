// live-smoke.mjs (lane GATES-2, 2026-10-05): the Live smoke gate's runner. READ-ONLY: it signs in once through the
// login form with two repository secrets, then loads pages and measures what a customer receives. It never
// writes, clicks a mutating control or follows an external link, and it never prints a secret.
//
// Pages (at 1440x900 and 375x812): `/`, the four list pages, the first item on each list, and the item the
// first theme chip on each list links to. Every assertion is a named invariant in live-assertions.mjs; the
// phone-width scroll-container rule is the same module the rendering guard imports (overflow-rule.mjs).
//
// Content (lane SMOKE-2): with `contentChecks` the runner also proves the elements the design places on each kind of
// page are present AND non-empty (grade chip, bias chips, tier square, Connected intelligence, Inferences, the
// dashboard Across pages rail), one named invariant per element (live-content.mjs). The CLI entry turns it on.
//
// Output: a JSON report (path from LIVE_SMOKE_REPORT, default ./live-smoke-report.json) and a plain summary,
// one line per failed invariant with the URL and the offending text (truncated). Exit 1 on any failure, 2 on a
// runner error, 0 when clean. Warnings (own-origin 4xx) never fail the run.
//
// Run by .github/workflows/live-smoke.yml. Proven locally ONLY against a fixture server
// (smoke/live-smoke-fixture-smoke.mjs, in the rendering guard): no real site is ever signed in to by a lane.
//
//   node live-smoke.mjs --preflight   # secrets + target check only, no browser, no npm
//   node live-smoke.mjs               # the full run (needs playwright)

import { createRequire } from "node:module";
import { writeFileSync, readFileSync } from "node:fs";
import { isMainModule } from "../../../scripts/lib/is-main.mjs";
import { preflight, runPreflightCli } from "./live-preflight.mjs";
import { collectSnapshot, collectLinks, collectContent } from "./live-snapshot.mjs";
import { requirementsForKind, judgeContentRun, LIST_CANDIDATE_CLASSES } from "./live-content.mjs";
import { candidateLines } from "./live-candidates.mjs";
import { collectContainers, isNarrowViewport } from "../overflow-rule.mjs";
import { isHydrationError, headersForRefetch, structuralDiff } from "./live-hydration.mjs";
import {
  INVARIANTS,
  checkSnapshot,
  checkResponses,
  checkConsole,
  checkAdminProbes,
  extractAccessToken,
  ADMIN_GATE_API_PATHS,
  ADMIN_MARKER_SELECTORS,
  formatSummary,
  buildReport,
} from "./live-assertions.mjs";

export const VIEWPORTS = Object.freeze([
  Object.freeze({ width: 1440, height: 900 }),
  Object.freeze({ width: 375, height: 812 }),
]);
export const LIST_SURFACES = Object.freeze(["regulations", "market", "research", "operations"]);

const NAV_TIMEOUT_MS = 45000;
const SIGN_IN_TIMEOUT_MS = 30000;
/** How long GET /admin may take to leave /admin (the server redirect streams after a 200 loading shell). */
const ADMIN_SETTLE_MS = 10000;

async function settle(page) {
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
}

/**
 * Sign in through the login form. Returns the storage state, or null when the session was not established.
 * Secrets are passed to the form fields only; nothing here logs them.
 */
export async function signIn(browser, baseUrl, { email, password }, timeoutMs = SIGN_IN_TIMEOUT_MS) {
  const ctx = await browser.newContext({ viewport: { width: VIEWPORTS[0].width, height: VIEWPORTS[0].height } });
  try {
    const page = await ctx.newPage();
    await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !/^\/(login|signup|auth)/.test(u.pathname), { timeout: timeoutMs });
    return await ctx.storageState();
  } catch {
    return null;
  } finally {
    await ctx.close();
  }
}

/**
 * The evidence for a hydration error (lane HYDRA-1): the HTML a second fetch of the same URL with the same headers
 * returns (the server's document), the post-hydration `document.documentElement.outerHTML`, and the first structural
 * difference between them. A failure to capture is recorded, never thrown: the diagnostic must not mask the finding.
 */
async function captureHydration(ctx, page, navResp, url, viewport, errors) {
  const out = { url, viewport: viewport.width, errors, serverHtml: null, clientHtml: null, diff: null, note: null };
  try {
    out.clientHtml = await page.evaluate(() => document.documentElement.outerHTML);
    const headers = navResp ? headersForRefetch(await navResp.request().allHeaders()) : {};
    const resp = await ctx.request.get(url, { headers, timeout: NAV_TIMEOUT_MS });
    out.serverHtml = await resp.text();
    out.diff = structuralDiff(out.serverHtml, out.clientHtml);
    out.note = out.diff ? null : "no element-structure difference between the second fetch and the hydrated document (the mismatch may be text or attribute level, or specific to the first render)";
  } catch (err) {
    out.note = `capture failed: ${String(err?.message ?? err).split("\n")[0].slice(0, 160)}`;
  }
  return out;
}

/** Visit one page in a fresh page of `ctx` and return findings plus the page record. */
async function visit(ctx, baseUrl, origin, path, kind, viewport, contentChecks = false, candidateList = false) {
  const page = await ctx.newPage();
  const responses = [];
  const consoleMsgs = [];
  page.on("response", (r) => responses.push({ url: r.url(), status: r.status(), method: r.request().method() }));
  page.on("console", (m) => consoleMsgs.push({ type: m.type(), text: m.text() }));
  page.on("pageerror", (e) => consoleMsgs.push({ type: "error", text: String(e?.message ?? e) }));
  const url = `${baseUrl}${path}`;
  try {
    const navResp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    await settle(page);
    const snap = await collectSnapshot(page);
    // Lane SMOKE-2: measure the elements the design places on this kind of page (judged in live-content.mjs).
    const content = contentChecks ? await collectContent(page, requirementsForKind(kind)) : null;
    const offOrigin = snap.origin !== origin;
    const toLogin = /^\/(login|signup|auth)/.test(snap.pathname);
    const containerScan = isNarrowViewport(viewport.width) ? await collectContainers(page) : null;
    const base = {
      url,
      kind,
      viewport,
      status: navResp ? navResp.status() : null,
      redirectedToLogin: toLogin || offOrigin,
      redirectNote: offOrigin
        ? `landed on ${snap.origin} instead of the target (deployment protection or an auth wall), the signed-in session was not accepted`
        : undefined,
      ...snap,
      containerScan,
      content,
      candidateList,
    };
    const ctxInfo = { url, viewport: viewport.width };
    const findings = [...checkSnapshot(base), ...checkResponses(responses, origin, ctxInfo), ...checkConsole(consoleMsgs, ctxInfo)];
    // Lane HYDRA-1: on a hydration error keep the two documents that name the diverging node.
    const hydrationErrors = consoleMsgs.filter((m) => m.type === "error" && isHydrationError(m.text)).map((m) => String(m.text));
    const hydration = hydrationErrors.length > 0 ? await captureHydration(ctx, page, navResp, url, viewport, hydrationErrors) : null;
    return { findings, record: { url, viewport: viewport.width, kind }, snap: base, hydrationErrors, hydration };
  } catch (err) {
    return {
      findings: [
        { invariant: INVARIANTS.SESSION_INVALID, url, viewport: viewport.width, text: `page did not load: ${String(err?.message ?? err).split("\n")[0].slice(0, 120)}`, severity: "fail" },
      ],
      record: { url, viewport: viewport.width, kind },
      snap: null,
    };
  } finally {
    await page.close();
  }
}

/**
 * The admin-gate attack (read-only GETs only, never POST). Signed in as the smoke user, GET /admin and two admin API
 * routes carrying the user's own bearer token must be refused. The token is read from the session cookie in the page,
 * held in memory and never logged.
 */
async function probeAdminGate(ctx, baseUrl) {
  const probes = [];
  const page = await ctx.newPage();
  try {
    let tokenMissing = false;
    let token = null;
    try {
      await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
      token = extractAccessToken(await page.evaluate(() => document.cookie));
    } catch { /* leaves the token null */ }
    tokenMissing = !token;
    try {
      const resp = await page.goto(`${baseUrl}/admin`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
      // /admin is gated server-side, but the root loading.tsx streams a 200 shell before the redirect fires, so
      // the status and URL at domcontentloaded are not the verdict. Wait for the URL to leave /admin (a refused
      // account always does), let the page settle, then read the settled URL and look for admin-only markers.
      await page.waitForURL((u) => !u.pathname.startsWith("/admin"), { timeout: ADMIN_SETTLE_MS }).catch(() => {});
      await settle(page);
      const countMarkers = () => page.evaluate((sels) => sels.filter((s) => document.querySelector(s)).length, [...ADMIN_MARKER_SELECTORS]);
      // A late client redirect can destroy the execution context mid-read; the retry reads the page it landed on.
      const markers = await countMarkers().catch(async () => { await settle(page); return countMarkers(); });
      probes.push({ kind: "page", path: "/admin", status: resp ? resp.status() : null, finalPath: new URL(page.url()).pathname, markers });
    } catch {
      probes.push({ kind: "page", path: "/admin", status: null, finalPath: "/admin", markers: 0, error: "navigation failed" });
    }
    for (const path of ADMIN_GATE_API_PATHS) {
      if (tokenMissing) { probes.push({ kind: "api", path, status: null, tokenMissing: true }); continue; }
      const status = await page.evaluate(async ([p, t]) => {
        try { return (await fetch(p, { method: "GET", headers: { Authorization: `Bearer ${t}` } })).status; } catch { return 0; }
      }, [path, token]);
      probes.push({ kind: "api", path, status });
    }
  } finally {
    await page.close();
  }
  return probes;
}

/**
 * The whole run against `baseUrl`. `browser` is injected so a fixture proof can drive it; credentials come from
 * the caller. Returns { findings, report, lines }.
 */
export async function runLiveSmoke({ browser, baseUrl, email, password, signInTimeoutMs, contentChecks = false, candidates = null, repeat = 1 }) {
  const origin = new URL(baseUrl).origin;
  const pages = [];
  const findings = [];
  const snapshots = [];
  const hydrationDiagnostics = [];
  /** Lane HYDRA-1: visits of the home page at the phone width, the plan's own visit included. */
  const homeRepeat = { visits: 0, hydrationFailures: 0 };

  const storageState = await signIn(browser, baseUrl, { email, password }, signInTimeoutMs);
  if (!storageState) {
    findings.push({
      invariant: INVARIANTS.SESSION_INVALID,
      url: `${baseUrl}/login`,
      viewport: VIEWPORTS[0].width,
      text: "sign-in did not complete: the login form did not accept the smoke account (check LIVE_SMOKE_EMAIL and LIVE_SMOKE_PASSWORD)",
      severity: "fail",
    });
    const report = buildReport({ baseUrl, pages, findings });
    return { findings, report, lines: formatSummary(findings) };
  }

  // Discover the item and theme-chip links once, from the lists at the desktop width.
  const discovery = await browser.newContext({ storageState, viewport: { width: VIEWPORTS[0].width, height: VIEWPORTS[0].height } });
  const itemPaths = [];
  try {
    for (const surface of LIST_SURFACES) {
      const page = await discovery.newPage();
      try {
        await page.goto(`${baseUrl}/${surface}`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
        await settle(page);
        const links = await collectLinks(page, surface);
        for (const p of [links.first, links.chip]) if (p && !itemPaths.includes(p)) itemPaths.push(p);
      } catch {
        // the list visit below reports the failure under its own invariant
      } finally {
        await page.close();
      }
    }
  } finally {
    await discovery.close();
  }

  // Lane SMOKE-3: the items the LIVE DATA says must carry a conditional element (an inference, a record grade, a source
  // with bias tags) are visited too, so such an element is judged on an item that must have it, not on whichever items
  // the lists happened to put first. Without resolved candidates nothing is added.
  const candidatePaths = [];
  if (contentChecks && candidates?.resolved === true) {
    for (const cls of Object.values(candidates.classes ?? {})) for (const p of cls?.visit ?? []) if (!candidatePaths.includes(p)) candidatePaths.push(p);
  }
  const detailPaths = [...itemPaths];
  for (const p of candidatePaths) if (!detailPaths.includes(p)) detailPaths.push(p);

  // Lane SMOKE-4: the same for the LIST side. A list requirement of a conditional class (record grade chip, bias chips on
  // rows) is judged on list pages filtered to a candidate's row (`listVisit`), not on whichever rows a list shows first.
  const candidateListPaths = [];
  if (contentChecks && candidates?.resolved === true) {
    for (const name of LIST_CANDIDATE_CLASSES) for (const p of candidates.classes?.[name]?.listVisit ?? []) if (!candidateListPaths.includes(p)) candidateListPaths.push(p);
  }

  const plan = [
    { path: "/", kind: "home" },
    ...LIST_SURFACES.map((s) => ({ path: `/${s}`, kind: "list" })),
    ...detailPaths.map((p) => ({ path: p, kind: "detail" })),
    ...candidateListPaths.map((p) => ({ path: p, kind: "list", candidateList: true })),
  ];

  for (const viewport of VIEWPORTS) {
    const ctx = await browser.newContext({ storageState, viewport: { width: viewport.width, height: viewport.height } });
    try {
      for (const step of plan) {
        const r = await visit(ctx, baseUrl, origin, step.path, step.kind, viewport, contentChecks, step.candidateList === true);
        findings.push(...r.findings);
        pages.push(r.record);
        if (r.snap) snapshots.push(r.snap);
        if (r.hydration) hydrationDiagnostics.push(r.hydration);
        if (step.kind === "home" && viewport.width === VIEWPORTS[1].width) {
          homeRepeat.visits += 1;
          if (r.hydrationErrors?.length) homeRepeat.hydrationFailures += 1;
        }
      }
      if (viewport.width === VIEWPORTS[0].width) {
        findings.push(...checkAdminProbes(await probeAdminGate(ctx, baseUrl), baseUrl));
      }
    } finally {
      await ctx.close();
    }
  }

  // Lane HYDRA-1: `repeat` visits of the home page at the phone width in all, each in a fresh context (cold cache, the
  // signed-in storage state), so the intermittent hydration failure is measured as a rate. The plan's own visit is the first.
  for (let i = homeRepeat.visits; i < repeat; i++) {
    const ctx = await browser.newContext({ storageState, viewport: { width: VIEWPORTS[1].width, height: VIEWPORTS[1].height } });
    try {
      const r = await visit(ctx, baseUrl, origin, "/", "home", VIEWPORTS[1], false);
      findings.push(...r.findings);
      if (r.hydration) hydrationDiagnostics.push(r.hydration);
      homeRepeat.visits += 1;
      if (r.hydrationErrors?.length) homeRepeat.hydrationFailures += 1;
    } finally {
      await ctx.close();
    }
  }

  // Lane SMOKE-2: the content requirements that hold over the whole run (an element absent from EVERY visited page of
  // its kind at a width), judged once every page is in.
  // Lane SMOKE-3: a conditional requirement with no candidate in the corpus is a named HOLD, not a failure.
  let holds = [];
  if (contentChecks) {
    const judged = judgeContentRun(snapshots, candidates);
    findings.push(...judged.findings);
    holds = judged.holds;
  }

  const report = buildReport({ baseUrl, pages, findings, holds, candidates });
  report.homeRepeat375 = homeRepeat;
  report.hydrationDiagnostics = hydrationDiagnostics;
  const lines = formatSummary(findings, holds);
  const totals = lines.pop(); // the totals line stays last
  lines.push(`home at 375: ${homeRepeat.visits} visit(s), ${homeRepeat.hydrationFailures} with a hydration error`);
  for (const d of hydrationDiagnostics) {
    lines.push(`HYDRATION ${d.viewport}px ${d.url}: ${d.diff ? `first structural difference ${d.diff.path} (server ${d.diff.server}, client ${d.diff.client})` : d.note}`);
  }
  lines.push(totals);
  return { findings, holds, report, lines };
}

/** The candidate file the workflow's resolver step wrote (live-candidates.mjs), or null when absent or unreadable. */
export function readCandidatesFile(path, readFn = readFileSync) {
  if (!path) return null;
  try {
    const parsed = JSON.parse(readFn(path, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

async function main() {
  const env = process.env;
  if (process.argv.includes("--preflight")) process.exit(runPreflightCli(env));

  const pre = preflight({ url: env.LIVE_SMOKE_URL, email: env.LIVE_SMOKE_EMAIL, password: env.LIVE_SMOKE_PASSWORD });
  if (!pre.ok) {
    for (const e of pre.errors) console.error(`::error::${e}`);
    process.exit(1);
  }
  const { chromium } = createRequire(import.meta.url)("playwright");
  const browser = await chromium.launch();
  let result;
  try {
    result = await runLiveSmoke({ browser, baseUrl: pre.origin, email: env.LIVE_SMOKE_EMAIL, password: env.LIVE_SMOKE_PASSWORD, contentChecks: true, candidates: readCandidatesFile(env.LIVE_SMOKE_CANDIDATES), repeat: Math.max(1, Math.min(50, Number(env.LIVE_SMOKE_REPEAT) || 1)) });
  } finally {
    await browser.close();
  }
  const reportPath = env.LIVE_SMOKE_REPORT || "live-smoke-report.json";
  writeFileSync(reportPath, `${JSON.stringify(result.report, null, 2)}\n`);
  console.log(`\n===== LIVE SMOKE ${pre.origin} =====`);
  console.log(`pages visited: ${result.report.pagesVisited.length}  report: ${reportPath}`);
  for (const l of candidateLines(readCandidatesFile(env.LIVE_SMOKE_CANDIDATES))) console.log(l);
  for (const l of result.lines) console.log(l);
  process.exit(result.report.failureCount > 0 ? 1 : 0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error("live smoke ERROR:", String(e?.message ?? e).split("\n")[0]);
    process.exit(2);
  });
}
