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
  // Human-readable identity (P1): the operator cannot evaluate bare identifiers. displayTitle is the
  // real instrument title where captured, else the notes descriptor, else the identifier — NEVER a bare
  // number once enrichment completes. jurisdiction + instrumentType come from the source join / notes.
  displayTitle: string;
  title: string | null; // durable captured title (null → fell back to descriptor/identifier)
  jurisdiction: string | null;
  instrumentType: string | null; // directive | regulation | decision | ... (parsed from notes classifier)
  scheme: string | null; // celex | eli | uk-legislation | generic | none
  shapeValid: boolean;
  surfaces: string[];
  shapeClass: string | null;
  relevance: RelevanceBand;
  softPass: 0 | 1 | 2; // count of [low-relevance] tags (0 firm, 1 single-pass soft, 2 double-pass soft)
  identity: IdentityState;
  hostRegistered: boolean;
  // NOTE: no promote/action field — the customer payload is READ-ONLY content (dispatch 3). All promotion
  // controls live in /admin behind the admin gate + server-side/RLS enforcement, never in this payload.
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

// Initial entry slice sent with the page (immediate render on expand). The FULL per-surface set is
// lazy-loaded via GET /api/coverage/entries on expand (getCoverageEntries) so a default-closed panel
// never inflates every surface's page payload — and the read stays authenticated + read-only.
const INITIAL_CAP = 60;
const EMPTY_COUNTS: CoverageCounts = {
  total: 0, firmCore: 0, softTail: 0,
  identityVerified: 0, identityUnresolved: 0, identityDead: 0, identityPending: 0,
  dualVerified: 0, distinctSources: 0, distinctInstruments: 0,
  bySurface: { regulations: 0, operations: 0, market_intel: 0, research: 0 },
  verifiedBriefs: 0,
};
const EMPTY: CoverageIndexResult = { entries: [], cap: INITIAL_CAP, counts: EMPTY_COUNTS };

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

// The census classifier stamps notes as "unit3-v2: relevant=true type=<t> conf=<c> :: <descriptor>".
// Parse the instrument type and the human descriptor (the descriptor is the title fallback — so a
// title-less row still renders human-readable, never a bare identifier).
function parseNotes(notes: string | null): { instrumentType: string | null; descriptor: string | null } {
  const s = notes || "";
  const t = s.match(/\btype=([a-z_]+)/i);
  const parts = s.split("::");
  const descriptor = parts.length > 1 ? parts.slice(1).join("::").trim() || null : null;
  return { instrumentType: t ? t[1].toLowerCase() : null, descriptor };
}

// Jurisdiction: prefer the source's registered jurisdiction_iso; else derive from the identifier scheme
// (CELEX/ELI → EU, UK legislation → GB). Null when neither is known (honest, not guessed).
const SCHEME_JURIS: Record<string, string> = { celex: "EU", eli: "EU", "uk-legislation": "GB" };
function jurisdictionOf(sourceIso: string | null, scheme: string | null): string | null {
  if (sourceIso) return sourceIso.toUpperCase();
  if (scheme && SCHEME_JURIS[scheme]) return SCHEME_JURIS[scheme];
  return null;
}

interface SourceEmbed { jurisdiction_iso: string[] | null } // sources.jurisdiction_iso is a text[] (e.g. ["EU"])
interface Row {
  id: string;
  document_url: string;
  instrument_identifier: string | null;
  title: string | null;
  title_source: string | null;
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
  sources: SourceEmbed | SourceEmbed[] | null;
}

// Surface tags the index publishes into (the four machine-addressable surfaces; Community is
// human-operated and excluded from surface_tags upstream). A surface arg scopes the whole index to
// entries tagged for that surface — this is how the dual-verified index mounts INSIDE the existing
// five surfaces (primarily Regulations) rather than as a sixth top-level surface (PI-1).
export const COVERAGE_SURFACES = ["regulations", "operations", "market_intel", "research"] as const;
export type CoverageSurface = (typeof COVERAGE_SURFACES)[number];

// Shared loader: paginate the surface's would_mint set, map to human-readable entries, compute exact
// counts, sort (dual-verified firm-core first). Returns the FULL sorted list + counts; callers slice.
async function loadCoverage(
  sb: ReturnType<typeof getServiceSupabase>,
  surface?: CoverageSurface
): Promise<{ entries: CoverageEntry[]; counts: CoverageCounts }> {
  const all: Row[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    let q = sb
      .from("census_worklist")
      .select(
        "id,document_url,instrument_identifier,title,title_source,source_id,shape_class,surface_tags,notes," +
          "identity_checked_at,identity_http_status,identity_resolves,identity_scheme,identity_shape_valid,identity_host_registered," +
          "sources(jurisdiction_iso)"
      )
      .eq("dryrun_disposition", "would_mint");
    if (surface) q = q.contains("surface_tags", [surface]);
    const { data, error } = await q.order("id").range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    // Cast via unknown: generated DB types predate the mig-228/title columns; runtime shape matches Row.
    const page = (data || []) as unknown as Row[];
    all.push(...page);
    if (page.length < PAGE) break;
  }

  const { count: verifiedBriefs } = await sb
    .from("intelligence_items")
    .select("id", { count: "exact", head: true })
    .eq("provenance_status", "verified")
    .not("full_brief", "is", null);

  const entries: CoverageEntry[] = all.map((r) => {
    const softPass = softPassOf(r.notes);
    const { instrumentType, descriptor } = parseNotes(r.notes);
    const src = Array.isArray(r.sources) ? r.sources[0] : r.sources;
    // jurisdiction_iso is a text[]; use the first code (most rows carry exactly one).
    const isoArr = src?.jurisdiction_iso;
    const sourceIso = Array.isArray(isoArr) && isoArr.length ? isoArr[0] : null;
    const jurisdiction = jurisdictionOf(sourceIso, r.identity_scheme);
    // displayTitle: real captured title → notes descriptor → identifier → url. Never a bare number once
    // enrichment completes; the descriptor fallback keeps title-less rows human-readable meanwhile.
    const displayTitle = r.title || descriptor || r.instrument_identifier || r.document_url;
    return {
      id: r.id,
      url: r.document_url,
      identifier: r.instrument_identifier,
      displayTitle,
      title: r.title,
      jurisdiction,
      instrumentType,
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

  const idRank: Record<IdentityState, number> = { verified: 0, pending: 1, unresolved: 2, dead: 3 };
  entries.sort((a, b) => {
    if (a.relevance !== b.relevance) return a.relevance === "firm" ? -1 : 1;
    if (a.identity !== b.identity) return idRank[a.identity] - idRank[b.identity];
    return a.softPass - b.softPass;
  });

  return { entries, counts };
}

// Page-side read: exact counts + the initial entry slice (immediate render on expand). Fail-soft.
export async function getCoverageIndex(surface?: CoverageSurface): Promise<CoverageIndexResult> {
  let sb;
  try {
    sb = getServiceSupabase();
  } catch (e) {
    console.warn("getCoverageIndex: service client unavailable:", e);
    return { ...EMPTY, _error: "Coverage index temporarily unavailable." };
  }
  try {
    const { entries, counts } = await loadCoverage(sb, surface);
    return { entries: entries.slice(0, INITIAL_CAP), cap: INITIAL_CAP, counts };
  } catch (e) {
    console.warn("getCoverageIndex: exception:", e);
    return { ...EMPTY, _error: "Coverage index temporarily unavailable." };
  }
}

// Full per-surface entry list for the authenticated API route (lazy sort/filter over all rows). Throws on
// error so the route returns a proper status; never exposes any promote/action field (read-only content).
export async function getCoverageEntries(surface?: CoverageSurface): Promise<CoverageEntry[]> {
  const sb = getServiceSupabase();
  const { entries } = await loadCoverage(sb, surface);
  return entries;
}
