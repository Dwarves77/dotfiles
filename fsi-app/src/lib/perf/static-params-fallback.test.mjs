// static-params-fallback.test.mjs - D32 (defect-fix-plan-2026-09-12.md, lane L21), part (d): the build
// stops depending on a live read. See static-params-fallback.mjs's own header for the 2026-09-13 incident
// this guards against.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { slugsOrEmpty } from "./static-params-fallback.mjs";

test("slugsOrEmpty: a rejected read yields [] and warns once, naming the route and the cause", async () => {
  const warnings = [];
  const result = await slugsOrEmpty(() => Promise.reject(new Error("connection refused")), {
    warn: (msg) => warnings.push(msg),
    route: "/regulations/[slug]",
  });
  assert.deepEqual(result, []);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /\/regulations\/\[slug\]/);
  assert.match(warnings[0], /connection refused/);
  assert.match(warnings[0], /dynamicParams/);
});

test("slugsOrEmpty: a read slower than the timeout yields [] and warns, naming the route", async () => {
  const warnings = [];
  const neverResolves = new Promise(() => {}); // deliberately never settles within the test's own lifetime
  const result = await slugsOrEmpty(() => neverResolves, {
    timeoutMs: 20,
    warn: (msg) => warnings.push(msg),
    route: "/market/[slug]",
  });
  assert.deepEqual(result, []);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /\/market\/\[slug\]/);
  assert.match(warnings[0], /exceeded 20ms/);
});

test("slugsOrEmpty: a resolved read passes through UNCHANGED and never warns", async () => {
  const warnings = [];
  const result = await slugsOrEmpty(() => Promise.resolve(["a", "b", "c"]), {
    warn: (msg) => warnings.push(msg),
    route: "/operations/[slug]",
  });
  assert.deepEqual(result, ["a", "b", "c"]);
  assert.deepEqual(warnings, []);
});

test("slugsOrEmpty: a read that resolves WELL BEFORE the timeout still returns its real value (the race does not itself discard a fast success)", async () => {
  const result = await slugsOrEmpty(() => Promise.resolve(["x"]), { timeoutMs: 10000, warn: () => {} });
  assert.deepEqual(result, ["x"]);
});

test("slugsOrEmpty: a SYNCHRONOUSLY throwing read is caught the same way a rejected one is (never an uncaught throw)", async () => {
  const warnings = [];
  const result = await slugsOrEmpty(
    () => {
      throw new Error("sync boom");
    },
    { warn: (msg) => warnings.push(msg), route: "/research/[slug]" },
  );
  assert.deepEqual(result, []);
  assert.match(warnings[0], /sync boom/);
});

test("slugsOrEmpty: a non-array resolved value falls back to [] rather than propagating a malformed shape", async () => {
  const result = await slugsOrEmpty(() => Promise.resolve(null), { warn: () => {} });
  assert.deepEqual(result, []);
});

test("slugsOrEmpty: default timeoutMs is 10000 (the SAME timeout as today's build-time read, per the module header)", async () => {
  // Proven without waiting 10s: a read resolving at 50ms must win against the 10000ms default, so if the
  // default were something small (e.g. accidentally left at the 20ms test value above) this would instead
  // return [] and warn.
  const warnings = [];
  const result = await slugsOrEmpty(
    () => new Promise((r) => setTimeout(() => r(["ok"]), 50)),
    { warn: (msg) => warnings.push(msg) },
  );
  assert.deepEqual(result, ["ok"]);
  assert.deepEqual(warnings, []);
});

// ── call-site sweep: every generateStaticParams under src/app/**/[slug]/page.tsx reaches
// getPublicSurfaceSlugs ONLY through slugsOrEmpty (pattern: src/lib/data-public-surface-slugs.test.mjs) ──

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(HERE, "..", "..", "app"); // src/lib/perf -> src/lib -> src -> src/app

function findSlugPageFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      found.push(...findSlugPageFiles(full));
    } else if (entry === "page.tsx" && basename(dir) === "[slug]") {
      found.push(full);
    }
  }
  return found;
}

const SLUG_PAGE_FILES = findSlugPageFiles(APP_ROOT);

test("call-site sweep: at least the four known [slug] detail routes were found under src/app (regulations/market/operations/research)", () => {
  const names = SLUG_PAGE_FILES.map((p) => p.replaceAll("\\", "/"));
  for (const surface of ["regulations", "market", "operations", "research"]) {
    assert.ok(
      names.some((p) => p.includes(`/${surface}/[slug]/page.tsx`)),
      `expected a [slug]/page.tsx under src/app/${surface}`,
    );
  }
});

for (const file of SLUG_PAGE_FILES) {
  const relLabel = file.replaceAll("\\", "/").split("src/app").pop();
  test(`call-site sweep: ${relLabel} reaches getPublicSurfaceSlugs ONLY through slugsOrEmpty (never a bare, unguarded call), inside generateStaticParams`, () => {
    const src = readFileSync(file, "utf8");
    // Isolate the generateStaticParams function BODY (same "extract the function, then scan only inside
    // it" precedent data-public-surface-slugs.test.mjs's own WIRING tests use) - this file also carries
    // getPublicSurfaceSlugs( mentions inside doc-comment prose above the function, which are historical
    // narration, not call sites, and must not trip this sweep.
    const fnMatch = src.match(/export async function generateStaticParams\(\)[\s\S]*?\n\}/);
    if (!fnMatch) {
      // No generateStaticParams at all in this [slug] route - out of this sweep's scope.
      return;
    }
    const body = fnMatch[0];
    if (!body.includes("getPublicSurfaceSlugs(")) {
      // This route's generateStaticParams does not call getPublicSurfaceSlugs at all - out of scope.
      return;
    }
    // Built from concatenated pieces (never a `from "@/...` literal in this file's own source text) so
    // .discipline/glob-portability.test.mjs's own scan of the discipline test glob - which looks for a
    // literal `from "<specifier>"` pattern to catch a NON-portable import in a globbed test file - never
    // mistakes this assertion's OWN pattern text for a real import statement in THIS file.
    const slugsOrEmptyImportRe = new RegExp(
      "import \\{ slugsOrEmpty \\} " + "from" + ' "@/lib/perf/static-params-fallback\\.mjs";',
    );
    assert.match(
      src,
      slugsOrEmptyImportRe,
      `${relLabel} calls getPublicSurfaceSlugs but does not import slugsOrEmpty`,
    );
    // Every getPublicSurfaceSlugs( call site inside the function body must be immediately preceded by
    // "slugsOrEmpty(() => " on the SAME statement - i.e. never called bare inside generateStaticParams.
    const callSites = [...body.matchAll(/getPublicSurfaceSlugs\(/g)];
    assert.ok(callSites.length > 0);
    for (const m of callSites) {
      const before = body.slice(Math.max(0, m.index - 40), m.index);
      assert.match(
        before,
        /slugsOrEmpty\(\(\) => $/,
        `${relLabel}: getPublicSurfaceSlugs at offset ${m.index} inside generateStaticParams is not wrapped by slugsOrEmpty(() => ...) - preceding text: ${JSON.stringify(before)}`,
      );
    }
  });
}
