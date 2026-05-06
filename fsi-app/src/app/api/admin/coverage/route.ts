// GET /api/admin/coverage
//
// Returns a coverage-matrix snapshot for the admin UI: every row is a
// (jurisdiction × item_type) cell with item count, source count, freshness,
// and a derived cell_state classification. The accompanying jurisdictions
// array rolls each jurisdiction up with its tier, country group, and an
// overall_state for stat-strip rendering.
//
// Query parameters:
//   tier=1|2|3   — filter to a single tier
//   country=US   — filter to all rows whose extracted country segment matches
//
// Auth: requireAuth + admin role gate (mirrors integrity-flags route).
// Rate-limited.
//
// Powered by the coverage_matrix() RPC introduced in migration 039.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { isoToDisplayLabel, extractCountryFromIso } from "@/lib/jurisdictions/iso";
import {
  TIER_1_JURISDICTIONS,
  TIER_2_JURISDICTIONS,
  jurisdictionTier,
  isSubnational,
  countryGroupForIso,
} from "@/lib/jurisdictions/tiers";

// Window inside which an item is considered "fresh" for cell-state
// purposes. Matches the 180-day freshness band documented in the spec.
const FRESHNESS_WINDOW_MS = 180 * 24 * 60 * 60 * 1000;

type CellState =
  | "covered-fresh"
  | "covered-stale"
  | "sparse"
  | "gap-with-source"
  | "gap-no-source";

type OverallState = "covered" | "partial" | "gap";

interface MatrixRow {
  jurisdiction_iso: string;
  label: string;
  country: string;
  item_type: string;
  item_count: number;
  source_count: number;
  most_recent_item_at: string | null;
  oldest_item_at: string | null;
  has_critical: boolean;
  cell_state: CellState;
}

interface JurisdictionSummary {
  jurisdiction_iso: string;
  label: string;
  country: string;
  tier: 1 | 2 | 3 | null;
  is_subnational: boolean;
  total_items: number;
  total_sources: number;
  overall_state: OverallState;
}

interface RpcRow {
  jurisdiction_iso: string;
  item_type: string;
  item_count: number;
  source_count: number;
  most_recent_item_at: string | null;
  oldest_item_at: string | null;
  has_critical: boolean;
}

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function requireAdminRole(
  supabase: ReturnType<typeof getServiceClient>,
  userId: string
): Promise<NextResponse | null> {
  const { data: membership } = await supabase
    .from("org_memberships")
    .select("role")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const role = membership?.role;
  if (role !== "owner" && role !== "admin") {
    return NextResponse.json(
      { error: "Admin role required" },
      { status: 403 }
    );
  }
  return null;
}

/**
 * Classify a single matrix cell using the documented heuristic:
 *   gap-no-source     — 0 items AND 0 active sources
 *   gap-with-source   — 0 items AND ≥1 active source
 *   sparse            — 1-2 items
 *   covered-stale     — ≥3 items, most recent older than 180 days
 *   covered-fresh     — ≥3 items, most recent within 180 days
 */
function deriveCellState(
  itemCount: number,
  sourceCount: number,
  mostRecentAt: string | null
): CellState {
  if (itemCount === 0) {
    return sourceCount === 0 ? "gap-no-source" : "gap-with-source";
  }
  if (itemCount < 3) return "sparse";
  if (!mostRecentAt) return "covered-stale";
  const ageMs = Date.now() - new Date(mostRecentAt).getTime();
  return ageMs <= FRESHNESS_WINDOW_MS ? "covered-fresh" : "covered-stale";
}

function deriveOverallState(
  totalItems: number,
  totalSources: number
): OverallState {
  if (totalItems === 0 && totalSources === 0) return "gap";
  if (totalItems === 0 || totalItems < 3) return "partial";
  return "covered";
}

/**
 * Parse the optional tier filter. Accepts "1", "2", "3" (and trims).
 * Anything else (including empty / missing) means "no filter".
 */
function parseTierFilter(raw: string | null): 1 | 2 | 3 | null {
  if (!raw) return null;
  const v = raw.trim();
  if (v === "1") return 1;
  if (v === "2") return 2;
  if (v === "3") return 3;
  return null;
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const supabase = getServiceClient();
  const denied = await requireAdminRole(supabase, auth.userId);
  if (denied) return denied;

  // ── Parse filters ────────────────────────────────────────────
  const url = new URL(request.url);
  const tierFilter = parseTierFilter(url.searchParams.get("tier"));
  const countryFilterRaw = url.searchParams.get("country");
  const countryFilter =
    countryFilterRaw && countryFilterRaw.trim().length > 0
      ? countryFilterRaw.trim().toUpperCase()
      : null;

  // ── Pull the matrix from the RPC ─────────────────────────────
  const { data: rpcRows, error: rpcError } = await supabase.rpc(
    "coverage_matrix"
  );

  if (rpcError) {
    return NextResponse.json(
      { error: `Failed to load coverage matrix: ${rpcError.message}` },
      { status: 500 }
    );
  }

  const rows: RpcRow[] = Array.isArray(rpcRows) ? (rpcRows as RpcRow[]) : [];

  // ── Build matrix rows + tally per-jurisdiction totals ────────
  // Per-jurisdiction tallies aggregate across item_types so the UI
  // header strip can render coverage / partial / gap without a second
  // pass over the matrix.
  const jurisdictionTotals = new Map<
    string,
    {
      label: string;
      country: string;
      totalItems: number;
      totalSources: number;
    }
  >();

  // Distinct, real item types (excludes the '__no_items__' sentinel
  // used by the RPC for jurisdictions that have sources but no items).
  const itemTypeSet = new Set<string>();

  const matrixUnfiltered: MatrixRow[] = rows.map((row) => {
    const iso = row.jurisdiction_iso;
    const label = isoToDisplayLabel(iso) || iso;
    const country = countryGroupForIso(iso);
    const itemCount = Number(row.item_count) || 0;
    const sourceCount = Number(row.source_count) || 0;
    const cellState = deriveCellState(
      itemCount,
      sourceCount,
      row.most_recent_item_at
    );

    if (row.item_type !== "__no_items__") {
      itemTypeSet.add(row.item_type);
    }

    // Roll up — each (jurisdiction × item_type) cell contributes its
    // item count and shares the source count with sibling cells, so
    // the source side is collapsed to "max seen for this jurisdiction"
    // (since the RPC repeats the same source count across cells).
    const existing = jurisdictionTotals.get(iso);
    if (existing) {
      existing.totalItems += itemCount;
      existing.totalSources = Math.max(existing.totalSources, sourceCount);
    } else {
      jurisdictionTotals.set(iso, {
        label,
        country,
        totalItems: itemCount,
        totalSources: sourceCount,
      });
    }

    return {
      jurisdiction_iso: iso,
      label,
      country,
      item_type: row.item_type,
      item_count: itemCount,
      source_count: sourceCount,
      most_recent_item_at: row.most_recent_item_at,
      oldest_item_at: row.oldest_item_at,
      has_critical: !!row.has_critical,
      cell_state: cellState,
    };
  });

  // Synthesize jurisdictions that exist in the tier lists but have no
  // RPC rows at all (zero items AND zero active sources). These are the
  // loudest gaps and must surface in the matrix even though the RPC
  // returns nothing for them.
  const tieredKnownIsos = Array.from(
    new Set([...TIER_1_JURISDICTIONS, ...TIER_2_JURISDICTIONS])
  );
  for (const iso of tieredKnownIsos) {
    if (!jurisdictionTotals.has(iso)) {
      const label = isoToDisplayLabel(iso) || iso;
      const country = countryGroupForIso(iso);
      jurisdictionTotals.set(iso, {
        label,
        country,
        totalItems: 0,
        totalSources: 0,
      });
      // Add a single sentinel matrix row so the UI can show this
      // jurisdiction. Its cell renders as gap-no-source.
      matrixUnfiltered.push({
        jurisdiction_iso: iso,
        label,
        country,
        item_type: "__no_items__",
        item_count: 0,
        source_count: 0,
        most_recent_item_at: null,
        oldest_item_at: null,
        has_critical: false,
        cell_state: "gap-no-source",
      });
    }
  }

  // ── Build per-jurisdiction summaries ─────────────────────────
  const jurisdictionsUnfiltered: JurisdictionSummary[] = Array.from(
    jurisdictionTotals.entries()
  )
    .map(([iso, agg]) => {
      const tier = jurisdictionTier(iso);
      return {
        jurisdiction_iso: iso,
        label: agg.label,
        country: agg.country,
        tier,
        is_subnational: isSubnational(iso),
        total_items: agg.totalItems,
        total_sources: agg.totalSources,
        overall_state: deriveOverallState(agg.totalItems, agg.totalSources),
      } as JurisdictionSummary;
    })
    .sort((a, b) => {
      // Stable sort: tier asc (nulls last) → country asc → label asc.
      const ta = a.tier ?? 99;
      const tb = b.tier ?? 99;
      if (ta !== tb) return ta - tb;
      if (a.country !== b.country) return a.country.localeCompare(b.country);
      return a.label.localeCompare(b.label);
    });

  // ── Apply filters to both matrix and jurisdictions ───────────
  const acceptedIsos = new Set(
    jurisdictionsUnfiltered
      .filter((j) => {
        if (tierFilter !== null && j.tier !== tierFilter) return false;
        if (countryFilter && j.country.toUpperCase() !== countryFilter) {
          // Country filter accepts any code starting with the country
          // segment — handles "US" matching "US-CA" via the country
          // field (which already extracts the country segment).
          // Fallback: also match raw prefix on jurisdiction_iso for
          // supranational codes the spec mentions ("country=US").
          if (
            !j.jurisdiction_iso.toUpperCase().startsWith(countryFilter)
          ) {
            return false;
          }
        }
        return true;
      })
      .map((j) => j.jurisdiction_iso)
  );

  const matrix = matrixUnfiltered.filter((row) =>
    acceptedIsos.has(row.jurisdiction_iso)
  );
  const jurisdictions = jurisdictionsUnfiltered.filter((j) =>
    acceptedIsos.has(j.jurisdiction_iso)
  );

  const itemTypes = Array.from(itemTypeSet).sort();

  return NextResponse.json(
    {
      generated_at: new Date().toISOString(),
      matrix,
      jurisdictions,
      item_types: itemTypes,
    },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
