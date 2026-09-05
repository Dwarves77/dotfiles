// data-public-surface-slugs.test.mjs — CAP-1000 (2026-09-05, "two defects one cause" audit).
//
// PERF-13's own `getPublicSurfaceSlugs` (this file's own SoT is src/lib/data.ts) fed every `[slug]`
// route's `generateStaticParams` from a single `.limit(BUILD_TIME_SLUG_ENUM_LIMIT = 20000)` call —
// PostgREST's db-max-rows setting caps that response at 1000 rows regardless of the requested width, so
// with the live regulations corpus at 1,312+ verified rows only the FIRST 1,000 were ever enumerated
// (measured live: carosledge.com slug index 900 was a prerender HIT, 1000/1050/1200/1311 were all MISS).
//
// This file proves TWO separate things, split because `src/lib/data.ts` imports `next/cache`
// (`unstable_cache`), which only resolves inside Next's own module graph — the SAME constraint
// `supabase-server-rpc-scope.test.mjs` and `supabase-server-category-rpc-paging.test.mjs` (this
// directory) already document and work around, followed here rather than re-solved a third way:
//
//  1. MECHANISM (executable): `fetchAllRows` (src/lib/db/paginate.mjs — a plain, dependency-free
//     module, no next/cache, imported directly) really does walk a fake client returning EXACTLY 1,000
//     rows per page out to the live corpus counts this lane measured via Supabase MCP, 2026-09-05:
//     1,312 regulations, 55 market, 25 operations, 39 research (surface_of() group-by, provenance_status
//     ='verified', is_archived=false).
//  2. WIRING (source-text proof, tsc proves it compiles): `getPublicSurfaceSlugs`'s regulations case
//     calls the NEW `fetchAllPublicListingSlugs` (not the deleted `BUILD_TIME_SLUG_ENUM_LIMIT` constant),
//     which itself routes through `fetchAllRows` with a `(from, to) -> { limit: to-from+1, offset: from }`
//     page factory — the exact shape `fetchAllRows`'s own contract requires — instead of a single
//     `.limit()` call; the other three surfaces are UNCHANGED here because they inherit correctness from
//     `supabase-server.ts`'s own `runCategoryRpc`/`runCategoryRpcPublic` fix (proved separately in
//     `supabase-server-category-rpc-paging.test.mjs`).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { fetchAllRows } from "./db/paginate.mjs";

const SRC = dirname(fileURLToPath(import.meta.url));
const CODE = readFileSync(join(SRC, "data.ts"), "utf8");

// ── 1. MECHANISM: fetchAllRows walks a 1000-row-per-page fake client out to each live surface count ──

/** A fake `getPublicListingsOnly`-shaped page reader: returns exactly `pageSize` rows per call (never
 *  more — mirrors PostgREST's real db-max-rows cap), short-changing only the final page, out of a fixed
 *  `total`. Row ids are `"id-<n>"`, 0-indexed, so the test can assert both the COUNT and that every id in
 *  [0, total) was actually returned (no page skipped/duplicated at a boundary). */
function fakeSurfaceReader(total, pageSize = 1000) {
  let calls = 0;
  return {
    calls: () => calls,
    read: async (from, to) => {
      calls++;
      if (from >= total) return { data: [], error: null };
      const end = Math.min(to, total - 1);
      const data = [];
      for (let i = from; i <= end; i++) data.push({ id: `id-${i}` });
      return { data, error: null };
    },
  };
}

for (const [surface, liveCount] of [
  ["regulations", 1312],
  ["market", 55],
  ["operations", 25],
  ["research", 39],
]) {
  test(`fetchAllRows enumerates the FULL live ${surface} surface count (${liveCount}) from a fake client capped at exactly 1,000 rows/page`, async () => {
    const reader = fakeSurfaceReader(liveCount, 1000);
    const rows = await fetchAllRows((from, to) => reader.read(from, to), { pageSize: 1000, cap: 20000 });
    assert.equal(rows.length, liveCount, `must return all ${liveCount} rows, not truncated at the 1000-row PostgREST cap`);
    const ids = new Set(rows.map((r) => r.id));
    for (let i = 0; i < liveCount; i++) {
      assert.ok(ids.has(`id-${i}`), `row id-${i} must be present — no page skipped/duplicated at a range boundary`);
    }
  });
}

test("fetchAllRows makes MULTIPLE page calls once a surface count exceeds 1,000 (the regulations case) — never a single unranged/oversized call", async () => {
  const reader = fakeSurfaceReader(1312, 1000);
  await fetchAllRows((from, to) => reader.read(from, to), { pageSize: 1000, cap: 20000 });
  assert.ok(reader.calls() >= 2, `must page (>=2 calls for 1,312 rows at pageSize 1000), got ${reader.calls()} call(s)`);
});

test("fetchAllRows makes exactly ONE page call for a surface under 1,000 (market/operations/research) — a short first page ends the walk", async () => {
  for (const liveCount of [55, 25, 39]) {
    const reader = fakeSurfaceReader(liveCount, 1000);
    await fetchAllRows((from, to) => reader.read(from, to), { pageSize: 1000, cap: 20000 });
    assert.equal(reader.calls(), 1, `${liveCount}-row surface must resolve in a single page`);
  }
});

// ── 2. WIRING: the real data.ts source routes getPublicSurfaceSlugs("regulations") through fetchAllRows,
// not the deleted single-.limit() BUILD_TIME_SLUG_ENUM_LIMIT call ─────────────────────────────────────

test("BUILD_TIME_SLUG_ENUM_LIMIT (the deleted single-.limit() constant PERF-13 shipped) is no longer DECLARED — a mention in this fix's own doc comment (naming the historical bug) is fine, a live constant/call site is not", () => {
  assert.doesNotMatch(
    CODE,
    /const\s+BUILD_TIME_SLUG_ENUM_LIMIT\s*=/,
    "the old single-request cap constant must be fully removed, not merely unused"
  );
});

test("fetchAllRows is imported from the shared paginate.mjs helper — no second copy of the range-walk", () => {
  assert.match(
    CODE,
    /import\s*\{\s*fetchAllRows\s*\}\s*from\s*"@\/lib\/db\/paginate\.mjs";/,
    "data.ts must import fetchAllRows from @/lib/db/paginate.mjs"
  );
});

test("fetchAllPublicListingSlugs pages via fetchAllRows with a (from, to) -> {limit, offset} page factory, not a single .limit() call", () => {
  const m = CODE.match(/async function fetchAllPublicListingSlugs\(\)[\s\S]*?\n\}/);
  assert.ok(m, "fetchAllPublicListingSlugs not found");
  const body = m[0];
  assert.match(body, /fetchAllRows<\{\s*id:\s*string\s*\}>\(/, "must delegate to the shared fetchAllRows helper");
  assert.match(body, /limit:\s*to\s*-\s*from\s*\+\s*1/, "page factory must derive limit from the (from, to) range fetchAllRows hands it");
  assert.match(body, /offset:\s*from/, "page factory must derive offset from the (from, to) range fetchAllRows hands it");
  assert.match(body, /domain:\s*REGULATIONS_DOMAIN/, "must scope the paged read to the regulations domain, same as the pre-existing single-call version");
  assert.doesNotMatch(
    body,
    /getPublicListingsOnly\(\s*\{\s*limit:\s*20000/,
    "must not still hand a single oversized limit straight to getPublicListingsOnly"
  );
});

test("getPublicSurfaceSlugs('regulations') calls fetchAllPublicListingSlugs — the paged path, not a bare single-call fetch", () => {
  const m = CODE.match(/export async function getPublicSurfaceSlugs\([\s\S]*?\n\}/);
  assert.ok(m, "getPublicSurfaceSlugs not found");
  const body = m[0];
  assert.match(body, /case "regulations":\s*\{\s*return fetchAllPublicListingSlugs\(\);/, "the regulations case must call fetchAllPublicListingSlugs()");
  // market/operations/research are UNCHANGED here — they inherit correctness from supabase-server.ts's
  // own runCategoryRpc/runCategoryRpcPublic fix (see supabase-server-category-rpc-paging.test.mjs), not
  // from a second paging mechanism in this file.
  assert.match(body, /case "market":\s*\{\s*const \{ resources \} = await getPublicMarketIntelItems\(\);/);
  assert.match(body, /case "operations":\s*\{\s*const \{ resources \} = await getPublicOperationsItems\(\);/);
  assert.match(body, /case "research":\s*\{\s*const \{ resources \} = await getPublicResearchItems\(\);/);
});

test("fetchAllPublicListingSlugs keeps a cap (a genuine safety assertion, not a silent per-request override) at 20000", () => {
  const m = CODE.match(/async function fetchAllPublicListingSlugs\(\)[\s\S]*?\n\}/);
  assert.match(m[0], /cap:\s*20000/, "cap:20000 must still bound the walk (fetchAllRows throws past it) — same ceiling the deleted constant's own header described");
});
