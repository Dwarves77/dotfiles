import { classifySourceType } from "./sources/source-type-taxonomy.mjs";
import { TIER1_PRIORITY_REGIONS, type Region } from "./tier1-priority-jurisdictions.ts";

export interface RegionCoverage {
  region: Region;
  covered: number;
  partial: number;
  gap: number;
  total: number;
}

export interface SourceRow {
  name: string | null;
  url: string | null;
  jurisdictions: string[] | null;
  source_type: string[] | null;
}

// ── source_type lookup, with a classifier fallback ─────────────
// The STOPGAP this file's predecessor carried — two regex pattern sets matched against each source's
// `name + url` text blob, at read time, on every cache miss — is retired. `sources.source_type`
// (migration 288) is now the source of truth: `fsi-app/src/lib/sources/source-type-taxonomy.mjs`
// holds the vocabulary and the classifier (the STOPGAP's own patterns, ported verbatim, so nothing
// is lost), and `fsi-app/scripts/sources/backfill-source-type.mjs` is the one-shot pass that writes
// it onto the ~718 pre-288 rows. Until a given row is backfilled (source_type NULL or []), this
// falls back to calling the SAME classifier inline — so a not-yet-backfilled source still counts
// correctly, and the fallback disappears row-by-row as the backfill (or new-source registration) sets
// the column, with no code change required when the backfill finishes.
export function sourceTypesFor(row: SourceRow): string[] {
  if (Array.isArray(row.source_type) && row.source_type.length > 0) return row.source_type;
  return classifySourceType({ name: row.name, url: row.url });
}

// ── Region rollup ──────────────────────────────────────────────
// `regions` defaults to the real TIER1_PRIORITY_REGIONS; a caller (the test file) may pass a smaller
// fixture so assertions do not depend on the full, evolving priority-jurisdiction list.
export function rollupRegions(
  rows: SourceRow[],
  regions: ReadonlyArray<Region> = TIER1_PRIORITY_REGIONS,
): RegionCoverage[] {
  // Build per-iso aggregation: for each source, look up (or classify, as a fallback — see
  // sourceTypesFor above) whether it carries the environmental_body / legislature type.
  const isoToHits = new Map<string, { hasEnv: boolean; hasLeg: boolean; count: number }>();
  for (const row of rows) {
    const types = sourceTypesFor(row);
    const isEnv = types.includes("environmental_body");
    const isLeg = types.includes("legislature");
    const isos = Array.isArray(row.jurisdictions) ? row.jurisdictions : [];
    for (const iso of isos) {
      const existing = isoToHits.get(iso) || {
        hasEnv: false,
        hasLeg: false,
        count: 0,
      };
      existing.count += 1;
      if (isEnv) existing.hasEnv = true;
      if (isLeg) existing.hasLeg = true;
      isoToHits.set(iso, existing);
    }
  }

  const out: RegionCoverage[] = [];
  for (const region of regions) {
    let covered = 0;
    let partial = 0;
    let gap = 0;
    for (const j of region.jurisdictions) {
      const hits = isoToHits.get(j.iso);
      if (!hits || hits.count === 0) {
        gap += 1;
        continue;
      }
      if (hits.hasEnv && hits.hasLeg) {
        covered += 1;
      } else {
        partial += 1;
      }
    }
    out.push({
      region,
      covered,
      partial,
      gap,
      total: region.jurisdictions.length,
    });
  }
  return out;
}
