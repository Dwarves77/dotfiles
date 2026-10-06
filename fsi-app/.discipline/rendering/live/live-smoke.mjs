// live-smoke.mjs (lane GATES-2, 2026-10-05): the Live smoke gate's runner. READ-ONLY: it signs in once through the
// login form with two repository secrets, then loads pages and measures what a customer receives. It never
// writes, clicks a mutating control or follows an external link, and it never prints a secret.
//
// Pages (at 1440x900 and 375x812): `/`, the four list pages, the first item on each list, and the item the
// first theme chip on each list links to. Every assertion is a named invariant in live-assertions.mjs; the
// phone-width scroll-container rule is the same module the rendering guard imports (overflow-rule.mjs).
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
import { writeFileSync } from "node:fs";
import { isMainModule } from "../../../scripts/lib/is-main.mjs";
import { preflight, runPreflightCli } from "./live-preflight.mjs";
import { collectSnapshot, collectLinks } from "./live-snapshot.mjs";
import { collectContainers, isNarrowViewport } from "../overflow-rule.mjs";
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

/** Visit one page in a fresh page of `ctx` and return findings plus the page record. */
async function visit(ctx, baseUrl, origin, path, kind, viewport) {
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
    };
    const ctxInfo = { url, viewport: viewport.width };
    const findings = [...checkSnapshot(base), ...checkResponses(responses, origin, ctxInfo), ...checkConsole(consoleMsgs, ctxInfo)];
    return { findings, record: { url, viewport: viewport.width, kind }, snap };
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
export async function runLiveSmoke({ browser, baseUrl, email, password, signInTimeoutMs }) {
  const origin = new URL(baseUrl).origin;
  const pages = [];
  const findings = [];

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

  const plan = [
    { path: "/", kind: "home" },
    ...LIST_SURFACES.map((s) => ({ path: `/${s}`, kind: "list" })),
    ...itemPaths.map((p) => ({ path: p, kind: "detail" })),
  ];

  for (const viewport of VIEWPORTS) {
    const ctx = await browser.newContext({ storageState, viewport: { width: viewport.width, height: viewport.height } });
    try {
      for (const step of plan) {
        const r = await visit(ctx, baseUrl, origin, step.path, step.kind, viewport);
        findings.push(...r.findings);
        pages.push(r.record);
      }
      if (viewport.width === VIEWPORTS[0].width) {
        findings.push(...checkAdminProbes(await probeAdminGate(ctx, baseUrl), baseUrl));
      }
    } finally {
      await ctx.close();
    }
  }

  const report = buildReport({ baseUrl, pages, findings });
  return { findings, report, lines: formatSummary(findings) };
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
    result = await runLiveSmoke({ browser, baseUrl: pre.origin, email: env.LIVE_SMOKE_EMAIL, password: env.LIVE_SMOKE_PASSWORD });
  } finally {
    await browser.close();
  }
  const reportPath = env.LIVE_SMOKE_REPORT || "live-smoke-report.json";
  writeFileSync(reportPath, `${JSON.stringify(result.report, null, 2)}\n`);
  console.log(`\n===== LIVE SMOKE ${pre.origin} =====`);
  console.log(`pages visited: ${result.report.pagesVisited.length}  report: ${reportPath}`);
  for (const l of result.lines) console.log(l);
  process.exit(result.report.failureCount > 0 ? 1 : 0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error("live smoke ERROR:", String(e?.message ?? e).split("\n")[0]);
    process.exit(2);
  });
}
