// coverage-routes.npmtest.mjs: lane COV-1 (2026-10-08). The two customer-side coverage routes, driven through
// their logic modules with injected guard and data dependencies (no network, no env):
//   GET  /api/dashboard/coverage/matrix   the generated matrix as JSON, a summary, or the CSV export
//   POST /api/dashboard/coverage/request  "request coverage": one coverage_gap integrity_flags row via the service client stub
// Runs in CI's "App unit tests requiring npm deps" step (the *.npmtest.mjs glob).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { NextRequest, NextResponse } = await jiti.import("next/server");
const { handleMatrixRequest } = await jiti.import("./matrix/logic.ts");
const { handleCoverageRequest } = await jiti.import("./request/logic.ts");
const { buildCoverageMatrix } = await jiti.import("@/lib/coverage/coverage-matrix.mjs");

const NOW = "2026-10-08T09:00:00.000Z";
const entries = [
  { id: "a", jurisdiction: "EU", surfaces: ["regulations"], relevance: "firm", identity: "verified" },
  { id: "b", jurisdiction: "EU", surfaces: ["regulations"], relevance: "firm", identity: "pending" },
];
const matrix = buildCoverageMatrix(entries, { generatedAt: NOW, verifiedBriefs: 5 });
const loaded = { loadMatrix: async () => ({ matrix, error: null }) };
const allow = { authenticate: async () => ({ userId: "u1" }), rateLimit: () => null };
const deny = { authenticate: async () => NextResponse.json({ error: "Authentication required" }, { status: 401 }), rateLimit: () => null };
const get = (qs = "") => new NextRequest(`https://example.com/api/dashboard/coverage/matrix${qs}`);
const post = (body) =>
  new NextRequest("https://example.com/api/dashboard/coverage/request", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

// ── matrix ───────────────────────────────────────────────────────────────

test("matrix: an unauthenticated call is refused before any data is read", async () => {
  let read = 0;
  const res = await handleMatrixRequest(get(), { ...deny, loadMatrix: async () => { read++; return { matrix, error: null }; } });
  assert.equal(res.status, 401);
  assert.equal(read, 0);
});

test("matrix: JSON carries the whole generated matrix, versioned and dated", async () => {
  const res = await handleMatrixRequest(get(), { ...allow, ...loaded });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.matrix.version, matrix.version);
  assert.equal(body.matrix.generatedAt, NOW);
  assert.deepEqual(body.matrix.totals, { numerator: 1, denominator: 2 });
  // Aggregates only: no entry field leaks into the payload.
  assert.doesNotMatch(JSON.stringify(body), /"id":"a"|document_url|instrument_identifier/);
});

test("matrix: summary=1 is the small shape the portfolio-add line reads", async () => {
  const body = await (await handleMatrixRequest(get("?summary=1"), { ...allow, ...loaded })).json();
  assert.deepEqual(Object.keys(body).sort(), ["dataAsOf", "dataClasses", "generatedAt", "totals", "verifiedBriefs", "version"]);
  assert.equal(body.dataClasses.find((c) => c.code === "regulations").denominator, 2);
});

test("matrix: format=csv is a CSV download with provenance as columns and a dated filename", async () => {
  const res = await handleMatrixRequest(get("?format=csv&data_class=regulations&geography=eu"), { ...allow, ...loaded });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /^text\/csv/);
  assert.equal(res.headers.get("content-disposition"), 'attachment; filename="coverage-regulations-eu-2026-10-08.csv"');
  const lines = (await res.text()).split("\r\n");
  assert.equal(lines[0], "version,generated_at,data_as_of,mode,data_class,geography_code,geography,numerator,denominator");
  assert.equal(lines[1], `${matrix.version},${NOW},not recorded,All modes,Regulations,EU,EU,1,2`);
});

test("matrix: a failed read is a 503 the client can retry, never an empty matrix", async () => {
  const res = await handleMatrixRequest(get(), { ...allow, loadMatrix: async () => ({ matrix, error: "Coverage could not be read just now." }) });
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: "Coverage could not be read just now." });
});

// ── request ──────────────────────────────────────────────────────────────

function stubService({ existing = [], writeError = null } = {}) {
  const inserted = [];
  const builder = {
    select: () => builder, eq: () => builder, in: () => builder,
    limit: () => Promise.resolve({ data: existing, error: null }),
    insert: (row) => { inserted.push(row); return Promise.resolve({ error: writeError }); },
  };
  return { inserted, client: () => ({ from: () => builder }) };
}

test("request: an unauthenticated call writes nothing", async () => {
  const svc = stubService();
  const res = await handleCoverageRequest(post({ subjectRef: "/dashboard/coverage", label: "x" }), { ...deny, serviceClient: svc.client });
  assert.equal(res.status, 401);
  assert.equal(svc.inserted.length, 0);
});

test("request: a valid request writes one coverage_gap flag through the service client and answers 201", async () => {
  const svc = stubService();
  const res = await handleCoverageRequest(post({ subjectRef: "/dashboard/coverage?data_class=research&geography=EU", label: "Research in the EU" }), { ...allow, serviceClient: svc.client });
  assert.equal(res.status, 201);
  assert.deepEqual(await res.json(), { ok: true, already: false });
  assert.equal(svc.inserted.length, 1);
  assert.equal(svc.inserted[0].category, "coverage_gap");
  assert.equal(svc.inserted[0].created_by, "coverage-request-route");
});

test("request: a repeat for an open subject answers 200 already:true and writes nothing", async () => {
  const svc = stubService({ existing: [{ id: "f1" }] });
  const res = await handleCoverageRequest(post({ subjectRef: "/market#oem-roadmap", label: "OEM roadmap" }), { ...allow, serviceClient: svc.client });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, already: true });
  assert.equal(svc.inserted.length, 0);
});

test("request: bad JSON and an invalid body are 400 with a plain message, and write nothing", async () => {
  const svc = stubService();
  const badJson = await handleCoverageRequest(post("{not json"), { ...allow, serviceClient: svc.client });
  assert.equal(badJson.status, 400);
  const badRef = await handleCoverageRequest(post({ subjectRef: "https://evil.example", label: "x" }), { ...allow, serviceClient: svc.client });
  assert.equal(badRef.status, 400);
  assert.match((await badRef.json()).error, /subjectRef/);
  assert.equal(svc.inserted.length, 0);
});

test("request: a failed write is a 503, not a success", async () => {
  const svc = stubService({ writeError: { message: "rls" } });
  const res = await handleCoverageRequest(post({ subjectRef: "/dashboard/coverage", label: "x" }), { ...allow, serviceClient: svc.client });
  assert.equal(res.status, 503);
});

// ── wiring ───────────────────────────────────────────────────────────────

test("both route files are thin handlers that go through the shared guard via their logic modules", () => {
  for (const [dir, handler, method] of [["matrix", "handleMatrixRequest", "GET"], ["request", "handleCoverageRequest", "POST"]]) {
    const route = readFileSync(resolve(HERE, dir, "route.ts"), "utf8");
    const logic = readFileSync(resolve(HERE, dir, "logic.ts"), "utf8");
    assert.match(route, new RegExp(`export const ${method} = withErrorCapture\\(`));
    assert.match(route, new RegExp(handler));
    assert.match(logic, /requireUserRoute\(request, deps\)/);
    assert.doesNotMatch(route, /export (async )?function|export const (dynamic|runtime)/, "a route file exports only handlers (F34)");
  }
});
