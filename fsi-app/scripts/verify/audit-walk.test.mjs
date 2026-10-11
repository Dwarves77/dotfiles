// audit-walk.test.mjs (lane E1b): the pure parts of audit-walk.mjs. No browser, no network, node builtins only.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  routeOfPageFile, derivePlan, resolveInstances, buildVisits, screenStem, shapeRow, summarize, parseArgs, listPageFiles,
  isForbiddenName, pickFilterControl, pickSortControl, detailRegexFor, crossSurfaceHrefs, classifyLanding, shapeInteraction,
  SURFACE_ROUTES,
} from "./audit-walk.mjs";

const FILES = [
  "page.tsx", "login/page.tsx", "regulations/page.tsx", "regulations/register/page.tsx", "regulations/[slug]/page.tsx",
  "market/page.tsx", "market/series/page.tsx", "market/[slug]/page.tsx", "research/page.tsx", "research/[slug]/page.tsx",
  "operations/page.tsx", "operations/[slug]/page.tsx", "community/page.tsx", "community/browse/page.tsx", "community/[slug]/page.tsx",
  "dashboard/portfolio/page.tsx", "dashboard/portfolio/[id]/page.tsx", "admin/page.tsx", "admin/items/[id]/page.tsx",
  "invitations/[token]/page.tsx", "(marketing)/privacy/page.tsx", "layout.tsx", "api/x/route.ts",
];

test("routeOfPageFile: root, nested, dynamic, route groups, non-pages", () => {
  assert.equal(routeOfPageFile("page.tsx"), "/");
  assert.equal(routeOfPageFile("market/[slug]/page.tsx"), "/market/[slug]");
  assert.equal(routeOfPageFile("market\\series\\page.tsx"), "/market/series");
  assert.equal(routeOfPageFile("(marketing)/privacy/page.tsx"), "/privacy");
  assert.equal(routeOfPageFile("layout.tsx"), null);
  assert.equal(routeOfPageFile("api/x/route.ts"), null);
});

test("derivePlan: static and dynamic split, nearest static ancestor, siblings excluded, admin not discovered", () => {
  const plan = derivePlan(FILES);
  assert.ok(plan.static.includes("/") && plan.static.includes("/privacy") && plan.static.includes("/market/series"));
  assert.ok(!plan.static.some((r) => r.includes("[")));
  const by = Object.fromEntries(plan.dynamic.map((d) => [d.pattern, d]));
  assert.equal(by["/market/[slug]"].listPath, "/market");
  assert.equal(by["/dashboard/portfolio/[id]"].listPath, "/dashboard/portfolio");
  assert.equal(by["/admin/items/[id]"].listPath, null, "admin instances are never resolved for the non-admin smoke account");
  assert.equal(by["/invitations/[token]"].listPath, null, "no static ancestor page, nothing to discover from");
  const re = new RegExp(by["/market/[slug]"].hrefRegex);
  assert.ok(re.test("/market/some-signal"));
  assert.ok(!re.test("/market/series"), "a static sibling is not an instance");
  assert.ok(!re.test("/market/a/b"));
  assert.ok(!new RegExp(by["/community/[slug]"].hrefRegex).test("/community/browse"));
  assert.deepEqual(derivePlan([]), { static: [], dynamic: [] });
});

test("listPageFiles + derivePlan: a page tree on disk yields the five surfaces", () => {
  const dir = mkdtempSync(join(tmpdir(), "aw-"));
  try {
    for (const f of FILES) { mkdirSync(join(dir, f, ".."), { recursive: true }); writeFileSync(join(dir, f), "x"); }
    const listed = listPageFiles(dir);
    assert.ok(listed.includes("market/[slug]/page.tsx") && !listed.includes("layout.tsx"));
    const plan = derivePlan(listed);
    for (const s of ["/regulations", "/market", "/research", "/operations", "/community"]) assert.ok(plan.static.includes(s), s);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("derivePlan on the real src/app: the five surfaces, each list resolves a dynamic detail route", () => {
  const plan = derivePlan(listPageFiles());
  for (const s of SURFACE_ROUTES) assert.ok(plan.static.includes(s), s);
  for (const list of ["/regulations", "/market", "/research", "/operations"]) assert.ok(plan.dynamic.some((d) => d.listPath === list), list);
  assert.ok(plan.dynamic.every((d) => d.listPath === null || plan.static.includes(d.listPath)));
});

test("resolveInstances: first matching href per dynamic route, query and hash stripped, siblings skipped", () => {
  const plan = derivePlan(FILES);
  const got = resolveInstances(plan, {
    "/market": ["/market/series?x=1", "/regulations/r9", "/market/sig-a#top", "/market/sig-b"],
    "/regulations": ["/regulations/register", "/regulations/g14"],
    "/community": [],
  });
  assert.equal(got["/market/[slug]"], "/market/sig-a");
  assert.equal(got["/regulations/[slug]"], "/regulations/g14");
  assert.equal(got["/community/[slug]"], undefined);
  assert.deepEqual(resolveInstances(plan, undefined), {});
});

test("buildVisits: surfaces and instances at both widths, extras at desktop, anonymous pass optional", () => {
  const plan = derivePlan(FILES);
  const inst = { "/market/[slug]": "/market/sig-a" };
  const v = buildVisits(plan, inst);
  const has = (route, width, tag) => v.some((x) => x.route === route && x.width === width && x.tag === tag);
  for (const s of SURFACE_ROUTES) { assert.ok(has(s, 1440, "auth"), s); assert.ok(has(s, 375, "auth"), s); }
  assert.ok(has("/market/sig-a", 375, "auth"));
  assert.ok(has("/market/series", 1440, "auth") && !has("/market/series", 375, "auth"));
  assert.ok(has("/privacy", 1440, "anon") && has("/market/sig-a", 1440, "anon"));
  assert.ok(!buildVisits(plan, inst, { anon: false }).some((x) => x.tag === "anon"));
  assert.equal(new Set(v.map((x) => `${x.route}|${x.width}|${x.tag}`)).size, v.length, "no duplicate visit");
});

test("screenStem: file-safe and unique per route, width and pass", () => {
  assert.equal(screenStem("/", 1440, "auth"), "home-1440-auth");
  assert.equal(screenStem("/market/series", 375, "anon"), "market_series-375-anon");
  assert.notEqual(screenStem("/a-b", 1440, "auth"), screenStem("/a/b", 1440, "auth") + "x");
});

test("shapeRow: sign-in redirect derived, caps applied, text clipped, origin compared", () => {
  const long = "x".repeat(500);
  const row = shapeRow({ route: "/market", width: 1440, tag: "auth", status: 200, finalPath: "/login?redirect=%2Fmarket", origin: "https://carosledge.com", title: long, h1: ["A", "B", "C", "D", "E", "F"], headings: Array.from({ length: 100 }, (_, i) => `h2: ${i}`), empties: ["No items yet", "No items yet", "Nothing"], console: Array(30).fill("error: boom"), failed: ["GET /a :: net"], bad: ["401 GET /b"], overflowX: true, scrollW: 500 }, "https://carosledge.com");
  assert.equal(row.toLogin, true);
  assert.equal(row.offOrigin, false);
  assert.ok(row.title.length <= 163);
  assert.equal(row.h1.length, 5);
  assert.equal(row.headings.length, 80);
  assert.equal(row.headingCount, 100);
  assert.deepEqual(row.empties, ["No items yet", "Nothing"]);
  assert.equal(row.console.length, 15);
  assert.equal(row.consoleCount, 30);
  assert.equal(row.overflowX, true);
  assert.equal(shapeRow({ route: "/login", width: 1440, tag: "anon", finalPath: "/login" }, "x").toLogin, false, "the sign-in page itself is not a redirect");
  assert.equal(shapeRow({ route: "/x", width: 375, tag: "auth", origin: "https://other.example" }, "https://carosledge.com").offOrigin, true);
  const err = shapeRow({ route: "/x", width: 375, tag: "auth", error: "Timeout 45000ms exceeded" }, "o");
  assert.equal(err.error, "Timeout 45000ms exceeded");
  assert.equal(err.status, null);
});

test("summarize: counts per pass", () => {
  const base = { route: "/a", width: 1440 };
  const rows = [
    shapeRow({ ...base, tag: "auth", finalPath: "/a", console: ["error: x"] }, "o"),
    shapeRow({ ...base, tag: "auth", finalPath: "/login?redirect=%2Fa" }, "o"),
    shapeRow({ ...base, tag: "anon", finalPath: "/login?redirect=%2Fa", bad: ["401 GET /n"], empties: ["No data"] }, "o"),
    shapeRow({ ...base, tag: "anon", error: "boom", overflowX: true }, "o"),
  ];
  assert.deepEqual(summarize(rows), { rows: 4, authRows: 2, anonRows: 2, authToLogin: 1, anonToLogin: 1, errors: 1, withConsoleErrors: 1, withBadResponses: 1, withOverflow: 1, emptyStateRows: 1 });
});

test("parseArgs", () => {
  assert.deepEqual(parseArgs([]), { plan: false, out: null, app: null, anon: true });
  assert.deepEqual(parseArgs(["--plan", "--no-anon", "--out", "o", "--app", "a"]), { plan: true, out: "o", app: "a", anon: false });
});

// ---------------------------------------------------------------- interactions

test("isForbiddenName: every operator word and the other write verbs are refused, whatever the case; reading controls are not", () => {
  for (const w of ["save", "submit", "delete", "archive", "post", "send", "apply", "promote", "publish"]) {
    assert.equal(isForbiddenName(w.toUpperCase()), true, w);
    assert.equal(isForbiddenName(`Please ${w} now`), true, w);
  }
  for (const n of ["Add to watchlist", "Remove", "Export to Excel", "Sign out", "Follow", "Reply", "Report this post", "Invite member", "Create group"]) assert.equal(isForbiddenName(n), true, n);
  for (const n of ["Air", "Ocean", "Next date", "Newest", "Immediate", "EU", "Reporting", "Applies to forwarders", "Postal", "Penalties"]) assert.equal(isForbiddenName(n), false, n);
  assert.equal(isForbiddenName(""), true, "an unnamed control cannot be selected by name, so it is not clicked");
  assert.equal(isForbiddenName(undefined), true);
});

test("pickFilterControl: first stateful, inactive, allowed, non-neutral toggle; never a save or sort or all/clear", () => {
  const c = (name, o = {}) => ({ name, role: "button", active: false, stateful: true, ...o });
  assert.equal(pickFilterControl([c("Save filter"), c("All"), c("Clear"), c("Newest"), c("Ocean", { active: true }), c("Air"), c("Road")]), 5);
  assert.equal(pickFilterControl([c("Menu", { stateful: false }), c("Delete", {}), c("A".repeat(60))]), -1);
  assert.equal(pickFilterControl([]), -1);
  assert.equal(pickFilterControl(undefined), -1);
  assert.equal(pickFilterControl([c("EU", { role: "checkbox" })]), 0);
});

test("pickSortControl: a sort select's first unselected option, else a sort-named inactive button, else null", () => {
  const sel = { name: "Sort by", role: "combobox", active: false, options: [{ value: "a", label: "Next date", selected: true }, { value: "b", label: "Newest", selected: false }] };
  assert.deepEqual(pickSortControl([{ name: "Air", role: "button", active: false }, sel]), { index: 1, kind: "select", option: "b" });
  assert.deepEqual(pickSortControl([{ name: "Next date", role: "button", active: true }, { name: "A-Z", role: "button", active: false }]), { index: 1, kind: "button" });
  assert.equal(pickSortControl([{ name: "Region", role: "combobox", active: false, options: [{ value: "x", label: "EU", selected: false }] }]), null, "a select that is not a sort is not used as one");
  assert.equal(pickSortControl([{ name: "Sort by", role: "combobox", active: false, options: [{ value: "x", label: "Delete all", selected: false }] }]), null, "a forbidden option label is never chosen");
  assert.equal(pickSortControl([]), null);
});

test("detailRegexFor and crossSurfaceHrefs: a surface's own rows, other surfaces' items only, no admin, de-duplicated in order", () => {
  const plan = derivePlan(FILES);
  assert.equal(detailRegexFor(plan, "/market").length, 1);
  assert.ok(new RegExp(detailRegexFor(plan, "/market")[0]).test("/market/sig-a"));
  assert.deepEqual(detailRegexFor(plan, "/privacy"), []);
  assert.ok(detailRegexFor(plan, "/").length >= 5, "the dashboard accepts any surface's item");
  assert.ok(!detailRegexFor(plan, "/").some((s) => s.includes("admin")));
  const hrefs = ["/market/series", "/regulations/g1", "/regulations/g1?x=1", "/research/r1", "/admin/items/9", "/regulations/register", "/market/m2"];
  assert.deepEqual(crossSurfaceHrefs(hrefs, plan, "/market/m1"), ["/regulations/g1", "/research/r1"]);
  assert.deepEqual(crossSurfaceHrefs(hrefs, plan, "/regulations/g0"), ["/research/r1", "/market/m2"]);
  assert.deepEqual(crossSurfaceHrefs([], plan, "/market/m1"), []);
});

test("classifyLanding: landed vs the four dead ends", () => {
  assert.deepEqual(classifyLanding({ status: 200, finalPath: "/regulations/g1", h1: ["Rule"], title: "t" }), { landed: true, reason: null });
  assert.equal(classifyLanding({ status: 404, finalPath: "/x", h1: ["x"] }).landed, false);
  assert.equal(classifyLanding({ status: 200, finalPath: "/login?redirect=%2Fx", h1: ["SIGN IN"] }).reason, "sent to sign-in");
  assert.equal(classifyLanding({ status: 200, finalPath: "/x", h1: ["404"], title: "Not found" }).reason, "not-found page");
  assert.equal(classifyLanding({ status: 200, finalPath: "/x", h1: [], title: "" }).reason, "no heading rendered");
  assert.equal(classifyLanding({ status: 200, finalPath: "/x", h1: ["a"], offOrigin: true }).reason, "left the site");
});

test("shapeInteraction: states, short INTERACTIONS lines, counts, caps", () => {
  const out = shapeInteraction({
    surface: "/market",
    blockedWrites: 2,
    steps: [
      { step: "load", did: true, headings: ["h1: Market"], console: [], bad: [], failed: [] },
      { step: "filter", did: true, note: 'filter "Air"', rowsBefore: 12, rowsAfter: 0 },
      { step: "sort", did: false, note: "no sort control offered" },
      { step: "open-first-row", did: true, detail: "/market/m1", headings: ["h1: M", "h2: S"], empties: ["No data yet", "No data yet"] },
      { step: "expand-sections", did: true, expanded: 0 },
      { step: "cross-surface-link", did: true, landing: { landed: false, reason: "status 404", to: "/regulations/zz" } },
      { step: "detail-375", did: true, detail: "/market/m1", headings: ["h1: M"], console: ["error: x"], bad: ["500 GET /api/q"] },
      { step: "boom", did: false, error: "Timeout" },
    ],
  });
  const state = Object.fromEntries(out.steps.map((s) => [s.step, s.state]));
  assert.deepEqual(state, { load: "worked", filter: "empty", sort: "skipped", "open-first-row": "worked", "expand-sections": "empty", "cross-surface-link": "errored", "detail-375": "errored", boom: "errored" });
  assert.deepEqual(out.counts, { worked: 2, empty: 2, skipped: 1, errored: 3 });
  assert.equal(out.blockedWrites, 2);
  assert.equal(out.interactions.length, 8);
  assert.match(out.interactions[1], /^filter: empty; rows 12 -> 0; filter "Air"$/);
  assert.match(out.interactions[5], /dead end \(status 404\)/);
  assert.match(out.interactions[6], /2 console\/network error\(s\)/);
  assert.deepEqual(out.steps[3].empties, ["No data yet"]);
  assert.equal(shapeInteraction({ surface: "/x" }).steps.length, 0);
});
