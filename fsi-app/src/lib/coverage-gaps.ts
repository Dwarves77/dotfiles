// ══════════════════════════════════════════════════════════════
// Coverage gaps — single-source-of-truth getCoverageGaps()
// (Wave 4 AGENT 4)
// ══════════════════════════════════════════════════════════════
//
// Composable query for the Tier 1 priority coverage snapshot, used by:
//   - Map · Coverage gaps card (current consumer)
//   - Research · coverage section (future)
//   - Admin · coverage tab (future)
//
// Per-region rollup of:
//   covered  — priority jurisdictions with ≥1 active source row
//              that ALSO has at least one env body AND one legislature
//              source (sources.source_type, migration 288).
//   partial  — jurisdictions with sources, but missing one of
//              { env body, legislature }.
//   gap      — jurisdictions with zero active source rows.
//   total    — count of priority jurisdictions in the region.
//
// Schema reality (from migration 004 + 017 + 288):
//   sources.jurisdictions     TEXT[]   (not `jurisdiction_iso` —
//                                       the dispatch doc named the
//                                       wrong column; this matches
//                                       SOURCE_COLUMNS in supabase-server.ts)
//   sources.status            TEXT     — gate on 'active'
//   sources.admin_only        BOOLEAN  — gate on FALSE
//   sources.source_type       TEXT[]   — nullable; the env-body/legislature
//                                       classification. This file used to
//                                       carry a STOPGAP here — two regex
//                                       pattern sets matched against each
//                                       source's name+url text blob, at
//                                       read time, on every cache miss.
//                                       That is retired: this file is now a
//                                       thin I/O wrapper that reads the
//                                       column and hands rows to
//                                       coverage-gaps-rollup.ts's pure
//                                       rollupRegions() (which still falls
//                                       back to the same STOPGAP patterns,
//                                       ported into
//                                       src/lib/sources/source-type-taxonomy.mjs,
//                                       for any row migration 288's backfill
//                                       — scripts/sources/backfill-source-type.mjs
//                                       — has not yet reached). The split
//                                       into a separate pure module is what
//                                       makes rollupRegions unit-testable
//                                       with plain `node --test` (this file
//                                       imports next/cache + supabase-js,
//                                       which a bundler-less test run
//                                       cannot resolve — see
//                                       coverage-gaps-rollup.ts's header).
//
// Cache: wraps APP_DATA_TAG with a 60s TTL, mirroring `lib/data.ts`'s
// existing caching pattern. Mutations to `sources` do not currently
// revalidate APP_DATA_TAG, so cold reads cap at 60s lag — acceptable for
// a coverage snapshot. If real-time accuracy becomes a requirement, the
// admin sources mutation routes can call revalidateTag(APP_DATA_TAG).
// ══════════════════════════════════════════════════════════════

import { unstable_cache } from "next/cache";
import { fetchAllRows } from "@/lib/db/paginate.mjs";
import { getServiceSupabase } from "./supabase-service";
import { APP_DATA_TAG } from "@/lib/data";
import { TIER1_PRIORITY_REGIONS } from "@/lib/tier1-priority-jurisdictions";
import { rollupRegions, type RegionCoverage, type SourceRow } from "./coverage-gaps-rollup.ts";

export type { RegionCoverage } from "./coverage-gaps-rollup.ts";

// ── Inner fetch: Supabase service-role client to avoid cookie reads ──
// We don't need org scoping for coverage gaps — `sources` rows are
// platform-wide and not tenant-partitioned. Using a stateless service
// client keeps the cache key free of orgId.

async function fetchActiveSourceRows(): Promise<SourceRow[]> {
  // C1 fail-closed (2026-07-12): route through the canonical service client. On missing SERVICE_ROLE it THROWS
  // (never the old silent anon-key downgrade, which would compute coverage gaps from RLS-limited reads); we
  // catch → empty, so a misconfigured service key yields NO coverage data, never WRONG coverage data.
  let supabase;
  try { supabase = getServiceSupabase(); } catch { return []; }

  // PAGINATED (case-file 9): the full active source registry can exceed 1000 rows; a truncated read would
  // silently bias the per-region {covered, partial, gap} coverage verdict below.
  try {
    return (await fetchAllRows((from, to) =>
      supabase
        .from("sources")
        .select("name, url, jurisdictions, source_type")
        .eq("status", "active")
        .eq("admin_only", false)
        .order("id", { ascending: true }) // UNIQUE order key (PK) — url is not guaranteed unique
        .range(from, to)
    )) as SourceRow[];
  } catch (e: any) {
    console.error("[coverage-gaps] fetchActiveSourceRows failed:", e?.message ?? e);
    return [];
  }
}

// ── Cached entry point ─────────────────────────────────────────
// 60s TTL · APP_DATA_TAG so admin/staged-update revalidations also
// invalidate this snapshot. Mirrors `cachedAppData` in lib/data.ts and
// `cachedPlatformTotal` in app/regulations/page.tsx.

const cachedCoverageGaps = unstable_cache(
  async (): Promise<RegionCoverage[]> => {
    const t0 = Date.now();
    const rows = await fetchActiveSourceRows();
    const result = rollupRegions(rows);
    console.log(
      `[perf] getCoverageGaps ${Date.now() - t0}ms (rows=${rows.length})`
    );
    return result;
  },
  ["coverage-gaps-v1"],
  { revalidate: 60, tags: [APP_DATA_TAG] }
);

/**
 * Single-source-of-truth coverage rollup. Returns one row per Tier 1
 * priority region, with per-region {covered, partial, gap, total}
 * counts. Order matches `TIER1_PRIORITY_REGIONS`. Consumers should sort
 * by their own criterion (e.g., gap-severity for the Map card).
 *
 * Falls back to a "all-gap" projection if Supabase is unconfigured or
 * the query fails — the card stays renderable on cold dev environments.
 */
export async function getCoverageGaps(): Promise<RegionCoverage[]> {
  try {
    return await cachedCoverageGaps();
  } catch (e) {
    console.error("getCoverageGaps failed, returning all-gap fallback:", e);
    return TIER1_PRIORITY_REGIONS.map((region) => ({
      region,
      covered: 0,
      partial: 0,
      gap: region.jurisdictions.length,
      total: region.jurisdictions.length,
    }));
  }
}
