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
//              source (canonical pattern matching on name/url).
//   partial  — jurisdictions with sources, but missing one of
//              { env body, legislature } per the canonical matchers.
//   gap      — jurisdictions with zero active source rows.
//   total    — count of priority jurisdictions in the region.
//
// Schema reality (from migration 004 + 017):
//   sources.jurisdictions     TEXT[]   (not `jurisdiction_iso` —
//                                       the dispatch doc named the
//                                       wrong column; this matches
//                                       SOURCE_COLUMNS in supabase-server.ts)
//   sources.status            TEXT     — gate on 'active'
//   sources.admin_only        BOOLEAN  — gate on FALSE
//
// Cache: wraps APP_DATA_TAG with a 60s TTL, mirroring `lib/data.ts`'s
// existing caching pattern. Mutations to `sources` do not currently
// revalidate APP_DATA_TAG, so cold reads cap at 60s lag — acceptable for
// a coverage snapshot. If real-time accuracy becomes a requirement, the
// admin sources mutation routes can call revalidateTag(APP_DATA_TAG).
// ══════════════════════════════════════════════════════════════

import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { APP_DATA_TAG } from "@/lib/data";
import {
  TIER1_PRIORITY_REGIONS,
  type Region,
} from "@/lib/tier1-priority-jurisdictions";

export interface RegionCoverage {
  region: Region;
  covered: number;
  partial: number;
  gap: number;
  total: number;
}

// ── Canonical URL / name matchers ──────────────────────────────
// Treat a jurisdiction as having an env body if any of its sources'
// (name OR url) match an environmental-body pattern; same for
// legislature. Pattern set is intentionally broad to handle the variety
// of regulator brands (EPA, ECCC, Defra, EEA, EU DG ENVI, etc.) and
// non-English regulator naming across EU/Asia/Latam.
//
// STOPGAP — the durable fix is a `source_type` taxonomy column on the
// sources table per Track E proposal. Once that lands, this file becomes
// a thin lookup against `source_type IN ('environmental_body',
// 'legislature', ...)` and these regex matchers retire. Until then, this
// matcher set is the best-effort heuristic surface for the Map · Coverage
// gaps card and Admin coverage views.

const ENV_BODY_PATTERNS: ReadonlyArray<RegExp> = [
  /\bepa\b/i,
  /environment(al)?/i,
  /ecology/i,
  /ecolog\w*/i,
  /climate/i,
  /eccc\b/i,
  /\bdefra\b/i,
  /\beea\b/i,        // European Environment Agency
  // Common state-level environmental conservation departments (e.g.
  // NY DEC, MI DEQ, CT DEEP). Matched only when the URL host begins
  // with one of these tokens so we don't false-positive on common
  // "dec" substrings ("december", "decoder", etc.).
  /\bdec\.[a-z.-]+\.gov\b/i,
  /\bdeep\.[a-z.-]+\.gov\b/i,
  /\bdeq\.[a-z.-]+\.gov\b/i,
  /natural[- ]?resources?/i,
  /conservation/i,
  // Non-English / non-Anglo environmental body names.
  /\bumweltbundesamt\b/i,    // DE/AT federal env agency
  /\bumwelt\b/i,             // DE "environment" stem
  /\bnaturv[åa]rdsverket\b/i, // SE env protection agency
  /\bymp[äa]rist[öo]\b/i,    // FI "environment"
  /\bmilj[øo]\b/i,           // DK/NO/SE "environment"
  /\bmilieu\b/i,             // NL "environment"
  /\bmedio[- ]ambiente\b/i,  // ES/Latam "environment"
  /\bambiente\b/i,           // IT/PT/ES "environment"
  /\bministerio[- ]?(?:del|de la|de)?\s*(?:medio[- ]ambiente|ambiente|ecolog[íi]a)/i,
  /\bminist[èe]re[- ]?(?:de l['’])?\s*(?:environnement|[ée]cologie|transition[- ]?[ée]cologique)/i,
  // Domain-based env-body matchers — government environment ministries
  // tend to use these tokens in URL paths.
  /\bmoe\.[a-z.-]+/i,        // Ministry of Environment (KR/JP/IL etc.)
  /\bmee\.[a-z.-]+/i,        // CN Ministry of Ecology and Environment
  /\benv\.[a-z.-]+/i,
];

const LEGISLATURE_PATTERNS: ReadonlyArray<RegExp> = [
  /legis/i,
  /parliament/i,
  /assembly/i,
  /senate/i,
  /congress/i,
  // English-named legislatures across federations.
  /house of (?:commons|representatives|lords)/i,
  // Non-English legislature names (DE/AT/CH, SE, DK, NO, FR, ES, NL, IE,
  // FI, IT, JP, AT, EE, LV, LT — single-word matchers chosen so the
  // regulator/source name OR URL hostname can match).
  /\bbundestag\b/i,           // DE
  /\bbundesrat\b/i,           // DE/CH/AT
  /\bnationalrat\b/i,         // AT/CH
  /\bduma\b/i,                // RU
  /\bdiet\b/i,                // JP / IE-historical
  /\briksdag\b/i,             // SE
  /\bfolketing\b/i,           // DK
  /\bstorting\b/i,            // NO
  /\beduskunta\b/i,           // FI
  /\bseimas\b/i,              // LT
  /\bsaeima\b/i,              // LV
  /\briigikogu\b/i,           // EE
  /\bcortes\b/i,              // ES
  /\bd[áa]il\b/i,             // IE
  /\boireachtas\b/i,          // IE
  /\btweede[- ]?kamer\b/i,    // NL
  /\beerste[- ]?kamer\b/i,    // NL
  /\bstaten[- ]?generaal\b/i, // NL
  /\bstortinget\b/i,          // NO
  /\bassembl[ée]e[- ]?nationale\b/i, // FR
  /\bs[ée]nat\b/i,            // FR/BE/etc
  /\bcamera[- ]?dei[- ]?deputati\b/i, // IT
  /\bassemblea\b/i,           // IT
  /\bc[áa]mara\b/i,           // ES/Latam
  /\bsejm\b/i,                // PL
  /\bduma\b/i,                // RU
  /\b國會\b/u,                 // ZH/JP "national diet"
  /\b国会\b/u,                 // simplified
  /\b국회\b/u,                 // KR national assembly
  // URL-based matchers — most national legislatures host on these stems.
  /\bparliament\.[a-z.-]+/i,
  /\bgov\.[a-z.-]+\b\/(?:parliament|legis|house)/i,
  /\blegifrance\.gouv\.fr\b/i, // FR primary law portal
  /\blex\.[a-z]{2}\b/i,        // generic per-country lex.* portals
];

function matchesAny(value: string, patterns: ReadonlyArray<RegExp>): boolean {
  if (!value) return false;
  for (const re of patterns) {
    if (re.test(value)) return true;
  }
  return false;
}

interface SourceRow {
  name: string | null;
  url: string | null;
  jurisdictions: string[] | null;
}

// ── Inner fetch: Supabase service-role client to avoid cookie reads ──
// We don't need org scoping for coverage gaps — `sources` rows are
// platform-wide and not tenant-partitioned. Using a stateless service
// client keeps the cache key free of orgId.

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function fetchActiveSourceRows(): Promise<SourceRow[]> {
  const supabase = getServiceClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("sources")
    .select("name, url, jurisdictions")
    .eq("status", "active")
    .eq("admin_only", false);

  if (error) {
    console.error("[coverage-gaps] fetchActiveSourceRows failed:", error.message);
    return [];
  }
  return (data || []) as SourceRow[];
}

// ── Region rollup ──────────────────────────────────────────────

function rollupRegions(rows: SourceRow[]): RegionCoverage[] {
  // Build per-iso aggregation: list of (name+url) text blobs to scan
  // for env-body / legislature patterns.
  const isoToHits = new Map<string, { hasEnv: boolean; hasLeg: boolean; count: number }>();
  for (const row of rows) {
    const text = `${row.name || ""} ${row.url || ""}`;
    const isEnv = matchesAny(text, ENV_BODY_PATTERNS);
    const isLeg = matchesAny(text, LEGISLATURE_PATTERNS);
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
  for (const region of TIER1_PRIORITY_REGIONS) {
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
