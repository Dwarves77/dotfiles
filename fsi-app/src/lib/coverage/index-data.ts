// Coverage Index data path (B1). The Coverage Index is the DISCOVERY layer made visible: the census's
// would_mint set — instruments identified as relevant to freight sustainability and DUAL-VERIFIED on two
// axes (relevance: firm-core vs soft-tail; identity: does the pointer resolve to a real primary source on
// a registered host). It renders as the CoverageIndexPanel mounted INSIDE the existing five surfaces
// (primarily Regulations; each surface gets its own category slice via getCoverageIndex(surface)) — NOT a
// sixth top-level surface (PI-1). On each surface it sits as a layer BELOW the verified-brief ledger,
// deliberately distinct from it: the ledger gates on provenance_status='verified'; this is the catalogued-
// pointer layer. A catalogued instrument is a POINTER, not a grounded brief; the panel's scope statement
// makes that boundary explicit so the index never fabricates coverage.
//
// Counts are computed over the FULL would_mint set for the surface (paginated, exact); the returned entry
// list is capped for paint with an honest "showing N of M". Platform-global (not org-scoped) — the
// discovered universe is the same for every workspace; per-workspace relevance is a surface concern.

import { getServiceSupabase } from "@/lib/supabase-service";

export type IdentityState = "verified" | "unresolved" | "dead" | "pending";
export type RelevanceBand = "firm" | "soft";

export interface CoverageEntry {
  id: string;
  url: string;
  identifier: string | null;
  scheme: string | null; // celex | eli | uk-legislation | generic | none
  shapeValid: boolean;
  surfaces: string[];
  shapeClass: string | null;
  relevance: RelevanceBand;
  softPass: 0 | 1 | 2; // count of [low-relevance] tags (0 firm, 1 single-pass soft, 2 double-pass soft)
  identity: IdentityState;
  hostRegistered: boolean;
}

export interface CoverageCounts {
  total: number;
  firmCore: number;
  softTail: number;
  identityVerified: number;
  identityUnresolved: number;
  identityDead: number;
  identityPending: number;
  dualVerified: number; // firm-core AND identity-verified → the prominent set
  distinctSources: number;
  distinctInstruments: number;
  bySurface: Record<string, number>;
  verifiedBriefs: number; // provenance_status='verified' corpus items — the SEPARATE, honest brief count
}

export interface CoverageIndexResult {
  entries: CoverageEntry[];
  cap: number;
  counts: CoverageCounts;
  _error?: string;
}

const CAP = 600;
const EMPTY: CoverageIndexResult = {
  entries: [],
  cap: CAP,
  counts: {
    total: 0, firmCore: 0, softTail: 0,
    identityVerified: 0, identityUnresolved: 0, identityDead: 0, identityPending: 0,
    dualVerified: 0, distinctSources: 0, distinctInstruments: 0,
    bySurface: { regulations: 0, operations: 0, market_intel: 0, research: 0 },
    verifiedBriefs: 0,
  },
};

// [low-relevance] tag count in notes → relevance band. Double-tag = the second-pass re-score also
// judged it low (soft-tail confirmed); single = one pass; zero = firm-core.
function softPassOf(notes: string | null): 0 | 1 | 2 {
  const n = (notes || "").split("[low-relevance]").length - 1;
  return n >= 2 ? 2 : n === 1 ? 1 : 0;
}

// Identity state from the mig-228 columns. verified requires a confirmed resolve AND a registered host;
// dead = confirmed 4xx/5xx; unresolved = could-not-confirm (resolves NULL after a check); pending = never
// checked (identity_checked_at NULL). The distinction is honest: pending ≠ dead.
function identityOf(row: {
  identity_checked_at: string | null;
  identity_resolves: boolean | null;
  identity_host_registered: boolean | null;
}): IdentityState {
  if (!row.identity_checked_at) return "pending";
  if (row.identity_resolves === true) return row.identity_host_registered ? "verified" : "unresolved";
  if (row.identity_resolves === false) return "dead";
  return "unresolved"; // checked but could-not-confirm (resolves NULL)
}

interface Row {
  id: string;
  document_url: string;
  instrument_identifier: string | null;
  source_id: string;
  shape_class: string | null;
  surface_tags: string[] | null;
  notes: string | null;
  identity_checked_at: string | null;
  identity_http_status: number | null;
  identity_resolves: boolean | null;
  identity_scheme: string | null;
  identity_shape_valid: boolean | null;
  identity_host_registered: boolean | null;
}

// Surface tags the index publishes into (the four machine-addressable surfaces; Community is
// human-operated and excluded from surface_tags upstream). A surface arg scopes the whole index to
// entries tagged for that surface — this is how the dual-verified index mounts INSIDE the existing
// five surfaces (primarily Regulations) rather than as a sixth top-level surface (PI-1).
export const COVERAGE_SURFACES = ["regulations", "operations", "market_intel", "research"] as const;
export type CoverageSurface = (typeof COVERAGE_SURFACES)[number];

export async function getCoverageIndex(surface?: CoverageSurface): Promise<CoverageIndexResult> {
  let sb;
  try {
    sb = getServiceSupabase();
  } catch (e) {
    console.warn("getCoverageIndex: service client unavailable:", e);
    return { ...EMPTY, _error: "Coverage index temporarily unavailable." };
  }

  try {
    // Paginate the would_mint set (order by unique id; PostgREST caps pages at 1000). When a surface is
    // given, scope to entries tagged for it (surface_tags is a text[]; `contains` = the tag is present).
    const all: Row[] = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      let q = sb
        .from("census_worklist")
        .select(
          "id,document_url,instrument_identifier,source_id,shape_class,surface_tags,notes," +
            "identity_checked_at,identity_http_status,identity_resolves,identity_scheme,identity_shape_valid,identity_host_registered"
        )
        .eq("dryrun_disposition", "would_mint");
      if (surface) q = q.contains("surface_tags", [surface]);
      const { data, error } = await q.order("id").range(from, from + PAGE - 1);
      if (error) {
        console.warn("getCoverageIndex: census read error:", error.message);
        return { ...EMPTY, _error: "Coverage index temporarily unavailable." };
      }
      // Cast via unknown: the generated DB types predate the mig-228 identity_* columns, so PostgREST
      // infers the long select as an error shape. The runtime shape matches Row.
      const page = (data || []) as unknown as Row[];
      all.push(...page);
      if (page.length < PAGE) break;
    }

    // Verified-brief count (the separate, honest provenance figure the scope statement cites).
    const { count: verifiedBriefs } = await sb
      .from("intelligence_items")
      .select("id", { count: "exact", head: true })
      .eq("provenance_status", "verified")
      .not("full_brief", "is", null);

    const entries: CoverageEntry[] = all.map((r) => {
      const softPass = softPassOf(r.notes);
      return {
        id: r.id,
        url: r.document_url,
        identifier: r.instrument_identifier,
        scheme: r.identity_scheme,
        shapeValid: r.identity_shape_valid === true,
        surfaces: r.surface_tags || [],
        shapeClass: r.shape_class,
        relevance: softPass === 0 ? "firm" : "soft",
        softPass,
        identity: identityOf(r),
        hostRegistered: r.identity_host_registered === true,
      };
    });

    // Counts over the full set.
    const counts: CoverageCounts = {
      total: entries.length,
      firmCore: entries.filter((e) => e.relevance === "firm").length,
      softTail: entries.filter((e) => e.relevance === "soft").length,
      identityVerified: entries.filter((e) => e.identity === "verified").length,
      identityUnresolved: entries.filter((e) => e.identity === "unresolved").length,
      identityDead: entries.filter((e) => e.identity === "dead").length,
      identityPending: entries.filter((e) => e.identity === "pending").length,
      dualVerified: entries.filter((e) => e.relevance === "firm" && e.identity === "verified").length,
      distinctSources: new Set(all.map((r) => r.source_id)).size,
      distinctInstruments: new Set(all.map((r) => r.instrument_identifier || r.document_url)).size,
      bySurface: { regulations: 0, operations: 0, market_intel: 0, research: 0 },
      verifiedBriefs: verifiedBriefs || 0,
    };
    for (const e of entries) for (const s of e.surfaces) if (s in counts.bySurface) counts.bySurface[s]++;

    // Sort: dual-verified firm-core first (prominent), then remaining firm-core, then soft-tail; identity
    // state as the secondary key (verified → pending → unresolved → dead). Cap for initial paint.
    const idRank: Record<IdentityState, number> = { verified: 0, pending: 1, unresolved: 2, dead: 3 };
    entries.sort((a, b) => {
      if (a.relevance !== b.relevance) return a.relevance === "firm" ? -1 : 1;
      if (a.identity !== b.identity) return idRank[a.identity] - idRank[b.identity];
      return a.softPass - b.softPass;
    });

    return { entries: entries.slice(0, CAP), cap: CAP, counts };
  } catch (e) {
    console.warn("getCoverageIndex: exception:", e);
    return { ...EMPTY, _error: "Coverage index temporarily unavailable." };
  }
}
