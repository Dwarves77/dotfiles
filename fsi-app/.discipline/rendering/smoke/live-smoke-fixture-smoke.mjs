// live-smoke-fixture-smoke.mjs (lane GATES-2, 2026-10-05): the Live smoke gate proven END TO END against a
// FIXTURE server on loopback, in the rendering guard's own chromium. No real site is touched and no real
// credential exists: the fixture accepts one made-up account and serves hand-written pages.
//
//   CLEAN      a healthy fixture site                -> zero failures
//   DEFECTIVE  one fixture site carrying every defect class the operator saw on production
//              (raw ledger JSON, a strip that makes <main> scroll at 375, raw slugs and a decimal score in
//              the theme card, a tier above the ceiling, a legend ending below it, an empty list, a
//              placeholder chip, a 500, a console error)           -> every invariant fires, by name
//   BAD LOGIN  the wrong password                    -> exactly one failure, session-invalid
//
// A gate that cannot fail is not a gate (CLAUDE.md rule 15): the DEFECTIVE leg is the attack.

import { createServer } from "node:http";
import { runLiveSmoke } from "../live/live-smoke.mjs";
import { INVARIANTS } from "../live/live-assertions.mjs";
import { CONTENT_INVARIANT_IDS } from "../live/live-content.mjs";

const FIXTURE_EMAIL = "smoke@fixture.test";
const FIXTURE_PASSWORD = "fixture-only-password";

const page = (title, body, { script = "" } = {}) =>
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>
html,body{margin:0}*{box-sizing:border-box}body{font:14px sans-serif}</style></head><body><main><h1 data-guard-title>${title}</h1>${body}</main>${script ? `<script>${script}</script>` : ""}</body></html>`;

const LEGEND_OK = "<p>Source tier, T1 binding law through T7 news / commentary.</p>";
const LEGEND_BAD = "<p>Source tier, T1 binding law through T6 commercial intelligence.</p>";

// The dashboard "Across the platform" rail card with its "Connected across pages" list (four surface stat links plus a theme).
const RAIL = '<aside data-audit="across-platform-card"><p>Across the platform</p>'
  + '<a href="/regulations">Regulations</a><a href="/market">Market Intel</a><a href="/research">Research</a><a href="/operations">Operations</a>'
  + '<p>Connected across pages</p><a href="/market/item-1">Ocean carrier surcharge across Regulations and Market</a></aside>';

function sitePages(defective) {
  // Lane SMOKE-2: a clean list row carries the elements the design places on it (a tier square, a Catalogue record
  // chip, the source's bias chips); the defective site's rows carry none, so the content invariants fire there.
  const rowExtras = '<span data-part="chip-tier">T2</span><span data-part="chip-grade">Catalogue record</span>'
    + '<span data-part="bias-chips" role="group"><span data-bias-tag="corporate"><span data-part="chip-tag">Corporate</span></span></span>';
  const row = (surface) => `<div data-part="list-row"><a href="/${surface}/item-1">Item one</a>${defective ? "" : rowExtras}</div>`;
  const list = (surface, rows) => page(surface, `${rows}${defective ? LEGEND_BAD : LEGEND_OK}`);
  const strip = defective
    ? `<section><h2>Themes across the corpus</h2><div style="overflow-x:auto;width:100%"><div data-nostrip style="width:1108px;height:30px"><a href="/market/item-1">Theme one</a></div></div></section>`
    : `<section><h2>Themes across the corpus</h2><div data-guard-strip style="overflow-x:auto;width:100%;display:flex;gap:8px"><div style="flex:0 0 260px"><a href="/market/item-1">Theme one</a></div><div style="flex:0 0 260px">two</div><div style="flex:0 0 260px">three</div></div></section>`;
  const detail = (surface) =>
    page(
      `${surface} item`,
      `<section id="across-pages"><h2>Connected intelligence</h2>${
        // The defective site keeps the section but hollows it: no cross-page container, so the content invariant
        // fires on a present-but-empty section as well as the slug and marker invariants.
        defective
          ? '<p>Shared: carrier-ocean. &lt;&lt;&lt;CLAIM_PROVENANCE_LEDGER [{"claim_kind":"FACT","source_span":"verbatim text of the span"}]</p>'
          : '<div data-guard-container="cross-page"><p>Shares an ocean carrier scenario with two items on the Market page, and the theme analysis that links them.</p></div>'
      }</section>
      ${defective ? "" : '<section id="inferences"><h2>Inferences</h2><div data-guard-container="inferences"><div data-figure-kind="inference"><p>Machine-written inference: the carrier surcharge is likely to track the fuel index.</p></div></div></section>'}
      ${defective ? "" : '<span data-part="bias-chips" role="group"><span data-bias-tag="corporate"><span data-part="chip-tag">Corporate</span></span></span>'}
      <div data-section-card=""><span>Cluster synthesis</span><div>${defective ? "85 items · density 0.180" : "85 items"}</div></div>
      <span data-part="chip-tier">${defective ? "T9" : "T2"}</span><span data-part="chip-tag">${defective ? "undefined" : "Ocean"}</span>
      ${LEGEND_OK}`,
      { script: defective ? 'console.error("fixture boom"); fetch("/api/boom");' : "" },
    );
  const out = {
    "/": page("Dashboard", `<p>Home.</p>${defective ? '<a href="/admin">Admin</a>' : RAIL}${LEGEND_OK}`),
    "/regulations": list("regulations", row("regulations")),
    "/market": page("market", `${strip}${row("market")}${defective ? LEGEND_BAD : LEGEND_OK}`),
    "/research": list("research", defective ? "" : row("research")),
    "/operations": list("operations", row("operations")),
    "/regulations/item-1": detail("regulations"),
    "/market/item-1": detail("market"),
    "/research/item-1": detail("research"),
    "/operations/item-1": detail("operations"),
  };
  return out;
}

function startServer(defective) {
  const pages = sitePages(defective);
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/login" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const f = new URLSearchParams(body);
        if (f.get("email") === FIXTURE_EMAIL && f.get("password") === FIXTURE_PASSWORD) {
          // Session cookies in the shapes the real app uses: a plain flag and the @supabase/ssr token cookie
          // (base64url JSON). Both readable by the page, as @supabase/ssr's browser cookies are.
          const token = "base64-" + Buffer.from(JSON.stringify({ access_token: "fixture-token" })).toString("base64url");
          res.writeHead(302, { "set-cookie": ["sid=fixture; Path=/", `sb-fixture-auth-token=${token}; Path=/`], location: "/" });
        } else {
          res.writeHead(302, { location: "/login?error=1" });
        }
        res.end();
      });
      return;
    }
    if (url.pathname === "/login") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(
        `<!doctype html><html><body><h1>Sign in</h1><form method="post" action="/login"><input type="email" name="email" required><input type="password" name="password" required><button type="submit">Sign in</button></form></body></html>`,
      );
      return;
    }
    if (!/sid=fixture/.test(req.headers.cookie || "")) {
      res.writeHead(302, { location: "/login" });
      res.end();
      return;
    }
    // The admin gate: a platform admin gets the dashboard, anyone else is refused. The defective site leaks it to the smoke
    // user: a 200 that STAYS on /admin with the dashboard markers. The clean site reproduces production's shape: the root
    // loading.tsx streams a 200 shell first and the redirect fires after (a client-side replace), so the status and URL at
    // domcontentloaded say 200 and /admin and only the settled page tells the truth.
    if (url.pathname === "/admin") {
      if (defective) { res.writeHead(200, { "content-type": "text/html" }); res.end(page("Admin", '<div data-admin-dashboard="">Admin content</div>')); return; }
      res.writeHead(200, { "content-type": "text/html" });
      res.end(page("Loading", "<p>Loading shell</p>", { script: 'setTimeout(function(){location.replace("/")},400)' }));
      return;
    }
    if (url.pathname === "/api/admin/coverage" || url.pathname === "/api/admin/integrity-flags") {
      const bearer = /^Bearer fixture-token$/.test(req.headers.authorization || "");
      if (defective && bearer) { res.writeHead(200, { "content-type": "application/json" }); res.end("{\"rows\":[]}"); return; }
      res.writeHead(bearer ? 403 : 401, { "content-type": "application/json" });
      res.end("{\"error\":\"forbidden\"}");
      return;
    }
    if (url.pathname === "/api/boom") {
      res.writeHead(500, { "content-type": "text/plain" });
      res.end("boom");
      return;
    }
    const html = pages[url.pathname];
    if (!html) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
      return;
    }
    res.writeHead(200, { "content-type": "text/html" });
    res.end(html);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, baseUrl: `http://127.0.0.1:${server.address().port}` })));
}

const EXPECTED_DEFECTS = [
  INVARIANTS.INTERNAL_MARKER,
  INVARIANTS.PLACEHOLDER_LITERAL,
  INVARIANTS.RAW_TAG_SLUG,
  INVARIANTS.BARE_SCORE,
  INVARIANTS.SCROLL_CONTAINER,
  INVARIANTS.CONSOLE_ERROR,
  INVARIANTS.OWN_ORIGIN_5XX,
  INVARIANTS.TIER_ABOVE_CEILING,
  INVARIANTS.LEGEND_BELOW_CEILING,
  INVARIANTS.LIST_EMPTY,
  INVARIANTS.ADMIN_GATE,
  // Lane SMOKE-2: the six content invariants, each fired by an element the defective site omits or hollows out.
  ...Object.values(CONTENT_INVARIANT_IDS),
];

export async function runFixtureLeg(browser, defective, password) {
  const { server, baseUrl } = await startServer(defective);
  try {
    return await runLiveSmoke({ browser, baseUrl, email: FIXTURE_EMAIL, password, signInTimeoutMs: 5000, contentChecks: true });
  } finally {
    server.close();
  }
}

/** @param {import('playwright').Browser} browser @returns {Promise<{checks:number, failures:string[]}>} */
export async function runSmoke(browser) {
  const failures = [];
  let checks = 0;

  const clean = await runFixtureLeg(browser, false, FIXTURE_PASSWORD);
  checks += 1;
  const cleanFails = clean.findings.filter((f) => f.severity === "fail");
  if (cleanFails.length > 0) {
    failures.push(`live-smoke-fixture:clean: expected zero failures, got ${cleanFails.length}: ${cleanFails.slice(0, 5).map((f) => `${f.invariant}@${f.viewport} ${f.url} ${f.text}`).join(" | ")}`);
  }
  if (clean.report.pagesVisited.length !== 18) {
    failures.push(`live-smoke-fixture:clean: expected 18 page visits (home, 4 lists, 4 items, at 2 viewports), got ${clean.report.pagesVisited.length}`);
  }

  const bad = await runFixtureLeg(browser, true, FIXTURE_PASSWORD);
  checks += 1;
  const fired = new Set(bad.findings.filter((f) => f.severity === "fail").map((f) => f.invariant));
  for (const inv of EXPECTED_DEFECTS) {
    if (!fired.has(inv)) failures.push(`live-smoke-fixture:defective: invariant ${inv} did NOT fire on the defective fixture (gate cannot fail)`);
  }
  if (bad.report.failureCount === 0) failures.push("live-smoke-fixture:defective: zero failures on the defective fixture");

  const wrong = await runFixtureLeg(browser, false, "not-the-password");
  checks += 1;
  const wrongFails = wrong.findings.filter((f) => f.severity === "fail");
  if (wrongFails.length !== 1 || wrongFails[0].invariant !== INVARIANTS.SESSION_INVALID) {
    failures.push(`live-smoke-fixture:bad-login: expected exactly one session-invalid failure, got ${JSON.stringify(wrongFails.map((f) => f.invariant))}`);
  }
  return { checks, failures };
}
