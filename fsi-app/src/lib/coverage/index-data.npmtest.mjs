// index-data.npmtest.mjs: lane COV-1 (2026-10-08, write-set expansion granted by the coordinator). The Coverage
// Index loader (index-data.ts) now reads two more things per catalogued instrument so the generated Coverage page's
// mode axis and data as-of become data: the transport modes of the instrument's SOURCE (sources.transport_modes)
// and the date its identity was last checked (identity_checked_at). Driven through the REAL loader with a fake
// Supabase client (the repo's convention: no network, no database); the fake records the select string it was given.
// Runs in CI's "App unit tests requiring npm deps" step (the *.npmtest.mjs glob).
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const dir = mkdtempSync(resolve(tmpdir(), "index-data-"));
const stub = resolve(dir, "svc.mjs");
writeFileSync(stub, "export function getServiceSupabase() { return globalThis.__indexDataClient; }\n");

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  moduleCache: false,
  alias: { "@/lib/supabase-service": stub, "@": resolve(ROOT, "src") },
});
const { getCoverageIndex, getCoverageEntries } = await jiti.import("./index-data.ts");

function row(over = {}) {
  return {
    id: "r1",
    document_url: "https://eur-lex.example/x",
    instrument_identifier: "32023R1805",
    title: "FuelEU Maritime",
    title_source: "cellar",
    source_id: "s1",
    shape_class: null,
    surface_tags: ["regulations"],
    notes: "unit3-v2: relevant=true type=regulation conf=0.9 :: FuelEU",
    identity_checked_at: "2026-10-02T08:00:00Z",
    identity_http_status: 200,
    identity_resolves: true,
    identity_scheme: "celex",
    identity_shape_valid: true,
    identity_host_registered: true,
    sources: { jurisdiction_iso: ["EU"], transport_modes: ["ocean"] },
    ...over,
  };
}

function fakeClient(rows) {
  const seen = { selects: [] };
  const census = {
    select(cols) { seen.selects.push(cols); return census; },
    eq() { return census; },
    contains() { return census; },
    order() { return census; },
    range() { return Promise.resolve({ data: rows, error: null }); },
  };
  const items = { select() { return items; }, eq() { return items; }, not() { return Promise.resolve({ count: 7, error: null }); } };
  return { seen, client: { from: (t) => (t === "census_worklist" ? census : items) } };
}

test("the loader selects sources.transport_modes with the jurisdiction, so the mode axis can be read", async () => {
  const { client, seen } = fakeClient([row()]);
  globalThis.__indexDataClient = client;
  await getCoverageEntries();
  assert.match(seen.selects[0], /sources\(jurisdiction_iso,transport_modes\)/);
  assert.match(seen.selects[0], /identity_checked_at/);
});

test("each entry carries the source's transport modes and the identity check date, untouched", async () => {
  globalThis.__indexDataClient = fakeClient([
    row({ sources: { jurisdiction_iso: ["EU"], transport_modes: ["air", "road"] } }),
  ]).client;
  const [e] = await getCoverageEntries();
  assert.deepEqual(e.modes, ["air", "road"]);
  assert.equal(e.checkedAt, "2026-10-02T08:00:00Z");
  assert.equal(e.jurisdiction, "EU");
});

test("a source with no modes, a null embed or blank tags yields an empty list, never a guess; a never-checked row has no date", async () => {
  globalThis.__indexDataClient = fakeClient([
    row({ id: "a", sources: { jurisdiction_iso: ["EU"], transport_modes: [] } }),
    row({ id: "b", sources: { jurisdiction_iso: ["GB"], transport_modes: null } }),
    row({ id: "c", sources: null }),
    row({ id: "d", sources: [{ jurisdiction_iso: ["US"], transport_modes: ["rail", "", "  "] }], identity_checked_at: null }),
  ]).client;
  const entries = await getCoverageEntries();
  const by = Object.fromEntries(entries.map((x) => [x.id, x]));
  assert.deepEqual(by.a.modes, []);
  assert.deepEqual(by.b.modes, []);
  assert.deepEqual(by.c.modes, []);
  assert.deepEqual(by.d.modes, ["rail"]);
  assert.equal(by.d.checkedAt, null);
});

test("getCoverageIndex still returns exact counts and the capped entry list with the new fields on each entry", async () => {
  globalThis.__indexDataClient = fakeClient([row(), row({ id: "r2", identity_checked_at: null, identity_resolves: null })]).client;
  const res = await getCoverageIndex("regulations");
  assert.equal(res.counts.total, 2);
  assert.equal(res.counts.verifiedBriefs, 7);
  assert.equal(res.entries.length, 2);
  assert.ok(res.entries.every((x) => Array.isArray(x.modes) && "checkedAt" in x));
});

test("the generated matrix turns those two fields into the mode axis and the as-of", async () => {
  const { buildCoverageMatrix } = await jiti.import("./coverage-matrix.mjs");
  globalThis.__indexDataClient = fakeClient([
    row({ id: "a", sources: { jurisdiction_iso: ["EU"], transport_modes: ["ocean", "road"] } }),
    row({ id: "b", identity_checked_at: "2026-10-05T00:00:00Z", sources: { jurisdiction_iso: ["EU"], transport_modes: [] } }),
  ]).client;
  const matrix = buildCoverageMatrix(await getCoverageEntries(), { generatedAt: "2026-10-08T09:00:00.000Z" });
  assert.deepEqual(matrix.modes.map((m) => m.code), ["road", "ocean", "untagged"]);
  assert.deepEqual(matrix.modeTagging, { tagged: 1, total: 2 });
  assert.equal(matrix.dataAsOf, "2026-10-05T00:00:00Z");
});
