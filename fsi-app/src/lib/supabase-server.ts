import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { INTEL_ITEMS_TAG, itemTag } from "./cache/revalidate-item";
import type { Resource, ChangeLogEntry, Dispute, Supersession, ItemConnection } from "@/types/resource";
import type { Source, ProvisionalSource, TrustMetrics, TrustScore } from "@/types/source";
import { computeBaselineTrustScore, createDefaultTrustMetrics } from "@/lib/trust";
import type { SeedFallbackTrigger } from "@/lib/notifications/seed-fallback-flag";
import { WATCHLIST_LIST_KEY, watchlistOrderKey } from "@/lib/watchlist-order";
import { compareRanks } from "@/lib/list-order";
import { surfaceOf } from "@/lib/surface-of.mjs";
import type { RelevanceInput } from "@/lib/workspace/viewer-relevance";

// Wave-α A2 (2026-07-11): the static seed-data import is GONE. Every
// fallback path in this module now returns empty + `_error` sentinel
// (SF-2 pattern) — seed content carried no source attribution and must
// never render as live intelligence (integrity rule).

// ── Helpers ──────────────────────────────────────────────────

export function isSupabaseConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// Service-role client. Bypasses RLS — server-only, never expose to the
// client. Used for reads where the org-scoped RPC isn't a fit (e.g. the
// regulation detail page resolves a single item by UUID OR legacy_id, and
// the anon client can't see base-table rows directly).
//
// SF-1 (2026-05-27): the prior implementation silently fell back to the
// anon key when SUPABASE_SERVICE_ROLE_KEY was missing. That masked
// service-role misconfiguration in production as RLS-blocked reads,
// which surfaced as empty payloads downstream. Now fails fast at the
// resolver. All three current callers (dashboard/surface-coverage,
// dashboard/critical-items, dashboard/credibility) already wrap the
// returned client in try/catch with empty-state fallback, so a throw
// here degrades the affected widget instead of crashing the page.
// Canonical home moved to ./supabase-service (C1 consolidation, 2026-07-12). Import for this module's own
// internal callers AND re-export so existing `import { getServiceSupabase } from "@/lib/supabase-server"`
// callers are unchanged. Fail-closed lives there (throws on missing key; never downgrades to anon).
import { getServiceSupabase } from "./supabase-service";
export { getServiceSupabase };

// ── Fetch Functions ──────────────────────────────────────────
// All reads are against the new item_* schema (Phase A.5.b). UUID
// item ids are translated to UI-side ids (legacy_id || uuid) inline
// via PostgREST embedded selects, so the wire shape consumed by
// existing components is preserved.

// PostgREST embedded selects sometimes return the joined row as a single
// object and sometimes (when the relationship is inferred as many-to-one
// through an aliased FK) as a single-element array. We accept both
// shapes and pick the legacy_id || uuid as the UI-side id.
type EmbeddedItem = { id: string; legacy_id: string | null };
function uiId(ii: EmbeddedItem | EmbeddedItem[] | null | undefined): string | null {
  if (!ii) return null;
  const obj = Array.isArray(ii) ? ii[0] : ii;
  if (!obj) return null;
  return obj.legacy_id || obj.id;
}

// item_cross_references' embedded source/target additionally carry item_type/domain (flywheel U9, D1) so
// a connection's link can route to the OTHER item's own surface via surfaceOf, rather than assuming it
// shares the viewer's current surface (a regulation can legitimately connect to a market_signal).
type EmbeddedItemWithSurface = EmbeddedItem & { item_type: string | null; domain: number | null };
function embeddedSurface(ii: EmbeddedItemWithSurface | EmbeddedItemWithSurface[] | null | undefined): string {
  const obj = Array.isArray(ii) ? ii[0] : ii;
  if (!obj) return "uncategorized";
  return surfaceOf(obj.item_type ?? undefined, obj.domain ?? undefined);
}

async function fetchChangelog(): Promise<Record<string, ChangeLogEntry[]>> {
  const supabase = getSupabase();
  // Bound: only the most recent ~100 entries; WhatChanged renders only the
  // newest diffs and the table grows monotonically.
  const { data: rows } = await supabase
    .from("item_changelog")
    .select("change_date, change_type, field, previous_value, new_value, impact, intelligence_items!inner(id, legacy_id)")
    .order("change_date", { ascending: false })
    .limit(100);

  const result: Record<string, ChangeLogEntry[]> = {};
  (rows || []).forEach((row: any) => {
    const id = uiId(row.intelligence_items);
    if (!id) return;
    const entry: ChangeLogEntry = {
      id,
      date: row.change_date,
      type: row.change_type,
      fields: row.field ? [row.field] : undefined,
      prev: row.previous_value || undefined,
      now: row.new_value || undefined,
      impact: row.impact || undefined,
    };
    if (!result[id]) result[id] = [];
    result[id].push(entry);
  });

  return result;
}

async function fetchDisputes(): Promise<Record<string, Dispute>> {
  const supabase = getSupabase();
  // Bound: only active disputes; the surface only renders these, so
  // limit at 100 to keep the read predictable as the table grows.
  const { data: rows } = await supabase
    .from("item_disputes")
    .select("note, disputing_sources, intelligence_items!inner(id, legacy_id)")
    .eq("is_active", true)
    .limit(100);

  const result: Record<string, Dispute> = {};
  (rows || []).forEach((row: any) => {
    const id = uiId(row.intelligence_items);
    if (!id) return;
    const sources = Array.isArray(row.disputing_sources)
      ? row.disputing_sources
      : typeof row.disputing_sources === "string"
        ? JSON.parse(row.disputing_sources)
        : [];

    result[id] = {
      resource: id,
      note: row.note,
      sources: sources.map((s: any) =>
        typeof s === "string" ? { name: s, url: "" } : s
      ),
    };
  });

  return result;
}

async function fetchXrefPairs(): Promise<[string, string][]> {
  const supabase = getSupabase();
  // .limit(500) defensively. Currently ~50 pairs; bounds the read as the
  // table grows so a runaway link-detection job can't blow up the dashboard
  // data path.
  const { data: rows } = await supabase
    .from("item_cross_references")
    .select("source:intelligence_items!source_item_id(id, legacy_id), target:intelligence_items!target_item_id(id, legacy_id)")
    .limit(500);

  const pairs: [string, string][] = [];
  for (const row of rows || []) {
    const s = uiId(row.source);
    const t = uiId(row.target);
    if (s && t) pairs.push([s, t]);
  }
  return pairs;
}

async function fetchSupersessions(): Promise<Supersession[]> {
  const supabase = getSupabase();
  // .limit(500) defensively, ordered most-recent-first so the first 500
  // are the supersessions the UI cares about.
  //
  // Pull `title` on both joined sides so the customer-facing Replaced
  // rail on Dashboard renders the human title (e.g. "EU PPWR 2025/40")
  // rather than falling back to the technical row identifier. Without
  // title, the rail renders the legacy_id (e.g. "ss1", "g2") which is
  // a customer-visible leak.
  const { data: rows } = await supabase
    .from("item_supersessions")
    .select("supersession_date, severity, note, old:intelligence_items!old_item_id(id, legacy_id, title), new:intelligence_items!new_item_id(id, legacy_id, title)")
    .order("supersession_date", { ascending: false })
    .limit(500);

  const pickTitle = (
    ii: { title?: string | null } | Array<{ title?: string | null }> | null | undefined,
  ): string | undefined => {
    if (!ii) return undefined;
    const obj = Array.isArray(ii) ? ii[0] : ii;
    return obj?.title || undefined;
  };

  const out: Supersession[] = [];
  for (const row of rows || []) {
    const oldId = uiId(row.old);
    const newId = uiId(row.new);
    if (!oldId || !newId) continue;
    const oldTitle = pickTitle(row.old);
    const newTitle = pickTitle(row.new);
    out.push({
      old: oldId,
      new: newId,
      oldTitle,
      newTitle,
      date: row.supersession_date,
      severity: row.severity as "major" | "minor" | "replacement",
      note: row.note || "",
    });
  }
  return out;
}

// ── Source Fetch Functions ───────────────────────────────────

function mapSourceRow(row: any): Source {
  const metrics: TrustMetrics = {
    confirmation_count: row.confirmation_count || 0,
    conflict_count: row.conflict_count || 0,
    conflict_total: row.conflict_total || 0,
    accuracy_rate: parseFloat(row.accuracy_rate) || 0.5,
    avg_lead_time_days: parseFloat(row.avg_lead_time_days) || 0,
    lead_time_samples: row.lead_time_samples || 0,
    consecutive_accessible: row.consecutive_accessible || 0,
    total_checks: row.total_checks || 0,
    successful_checks: row.successful_checks || 0,
    accessibility_rate: parseFloat(row.accessibility_rate) || 1.0,
    last_accessible: row.last_accessible || null,
    last_inaccessible: row.last_inaccessible || null,
    independent_citers: row.independent_citers || 0,
    total_citations: row.total_citations || 0,
    highest_citing_tier: row.highest_citing_tier || null,
    self_citation_count: row.self_citation_count || 0,
  };

  const score: TrustScore = {
    overall: row.trust_score_overall || 50,
    accuracy_component: parseFloat(row.trust_score_accuracy) || 20,
    timeliness_component: parseFloat(row.trust_score_timeliness) || 10,
    reliability_component: parseFloat(row.trust_score_reliability) || 10,
    citation_component: parseFloat(row.trust_score_citation) || 10,
    computed_at: row.trust_score_computed_at || new Date().toISOString(),
  };

  return {
    id: row.id,
    name: row.name,
    url: row.url,
    description: row.description || "",
    // Phase 1.5: Q2 base_tier + effective_tier (replaces single tier).
    base_tier: row.base_tier,
    effective_tier: row.effective_tier ?? null,
    tier_at_creation: row.tier_at_creation,
    intelligence_types: row.intelligence_types || [],
    domains: row.domains || [],
    jurisdictions: row.jurisdictions || [],
    transport_modes: row.transport_modes || [],
    update_frequency: row.update_frequency || "weekly",
    last_checked: row.last_checked || null,
    last_substantive_change: row.last_substantive_change || null,
    next_scheduled_check: row.next_scheduled_check || null,
    status: row.status || "active",
    paywalled: row.paywalled || false,
    access_method: row.access_method || "manual",
    api_endpoint: row.api_endpoint || undefined,
    rss_feed_url: row.rss_feed_url || undefined,
    trust_metrics: metrics,
    trust_score: score,
    tier_history: row.tier_history || [],
    cited_by: row.cited_by || null,
    notes: row.notes || "",
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// Slim column projection — mapSourceRow reads ~30 of these. Avoids the
// implicit `*` payload (~50 columns × ~500 rows on the admin path).
const SOURCE_COLUMNS = [
  "id",
  "name",
  "url",
  "description",
  // Phase 1.5: Q2 split. base_tier (provenance) + effective_tier (dynamic)
  // replace the legacy tier column. Both projected; consumers choose
  // per the default rule.
  "base_tier",
  "effective_tier",
  // Phase 7 admin chrome surfaces tier_override on the source row so the
  // SourceTierOverrideControl renders the correct badge state without an
  // extra fetch per row on collapsed admin view. Override audit history
  // still loads lazily on expand via /api/admin/sources/[id]/tier-override.
  "tier_override",
  "tier_at_creation",
  "intelligence_types",
  "domains",
  "jurisdictions",
  "transport_modes",
  "update_frequency",
  "last_checked",
  "last_substantive_change",
  "next_scheduled_check",
  "status",
  "paywalled",
  "access_method",
  "api_endpoint",
  "rss_feed_url",
  "confirmation_count",
  "conflict_count",
  "conflict_total",
  "accuracy_rate",
  "avg_lead_time_days",
  "lead_time_samples",
  "consecutive_accessible",
  "total_checks",
  "successful_checks",
  "accessibility_rate",
  "last_accessible",
  "last_inaccessible",
  "independent_citers",
  "total_citations",
  "highest_citing_tier",
  "self_citation_count",
  "trust_score_overall",
  "trust_score_accuracy",
  "trust_score_timeliness",
  "trust_score_reliability",
  "trust_score_citation",
  "trust_score_computed_at",
  "tier_history",
  "cited_by",
  "notes",
  "created_at",
  "updated_at",
].join(", ");

async function fetchSources(includeAdminOnly = false): Promise<Source[]> {
  const supabase = getSupabase();
  let query = supabase
    .from("sources")
    .select(SOURCE_COLUMNS)
    // Phase 1.5: order by base_tier per default rule (stable structural
    // ordering through dynamic recompute; preserves UI list determinism).
    .order("base_tier", { ascending: true });
  if (!includeAdminOnly) {
    // Workspace-facing default — hide admin_only sources from regular users.
    // The admin dashboard hydrates the unfiltered list server-side via
    // getSourceData() at /app/admin/page.tsx (passing includeAdminOnly=true).
    query = query.eq("admin_only", false);
  }
  const { data: rows } = await query;
  return (rows || []).map(mapSourceRow);
}

async function fetchProvisionalSources(): Promise<ProvisionalSource[]> {
  // Wave-a Track B3: provisional_sources is an admin-only working set. Migration 157 dropped its
  // permissive read policy, leaving NO SELECT policy — so the prior anon-client read returned 0 rows
  // (deny-by-default) AND dropped `error`, silently rendering the review queue empty since 2026-07-07.
  // Read with the service client (the correct credential for an admin working set; bypasses RLS) and
  // ALWAYS capture `error` (kills the silent-swallow class — see the agent/run error-swallow post-mortem).
  const supabase = getServiceSupabase();
  const { data: rows, error } = await supabase
    .from("provisional_sources")
    .select("*")
    .in("status", ["pending_review", "needs_more_data"])
    .order("independent_citers", { ascending: false });

  if (error) {
    // Do NOT swallow: log so a genuine failure is visible instead of masquerading as an empty queue.
    console.error(
      "[fetchProvisionalSources] provisional_sources read failed:",
      error.message
    );
    return [];
  }

  return (rows || []).map((row: any) => ({
    id: row.id,
    name: row.name,
    url: row.url,
    domain: row.domain,
    description: row.description || "",
    discovered_via: row.discovered_via,
    cited_by_source_id: row.cited_by_source_id,
    cited_by_source_tier: row.cited_by_source_tier,
    citation_count: row.citation_count || 0,
    independent_citers: row.independent_citers || 0,
    citing_source_ids: row.citing_source_ids || [],
    highest_citing_tier: row.highest_citing_tier,
    provisional_tier: row.provisional_tier || 7,
    recommended_tier: row.recommended_tier,
    accessibility_verified: row.accessibility_verified || false,
    publishes_structured_content: row.publishes_structured_content || false,
    entity_identified: row.entity_identified || false,
    status: row.status,
    reviewer_notes: row.reviewer_notes || "",
    created_at: row.created_at,
    reviewed_at: row.reviewed_at,
  }));
}

export interface SourceData {
  sources: Source[];
  provisionalSources: ProvisionalSource[];
}

export async function fetchSourceData(includeAdminOnly = false): Promise<SourceData> {
  const emptySourceData: SourceData = { sources: [], provisionalSources: [] };

  if (!isSupabaseConfigured()) {
    return emptySourceData;
  }

  try {
    const [sources, provisionalSources] = await withTimeout(
      Promise.all([fetchSources(includeAdminOnly), fetchProvisionalSources()]),
      8000,
      [[], []] as [Source[], ProvisionalSource[]]
    );
    return { sources, provisionalSources };
  } catch (e) {
    console.error("fetchSourceData failed:", e);
    return emptySourceData;
  }
}

// ── Workspace Intelligence Fetch ────────────────────────────
// Four RPC variants for the workspace intelligence read, picked per caller
// surface based on which long-text fields are actually rendered:
//
//   get_workspace_intelligence            (007) full payload, used only by
//                                         /regulations/[slug] detail today.
//   get_workspace_intelligence_slim       (047) drops full_brief,
//                                         operational_impact, open_questions,
//                                         reasoning. Used by /operations,
//                                         /market, /settings (cards render
//                                         summary; can't drop further).
//   get_workspace_intelligence_dashboard  (064) on top of slim, drops
//                                         what_is_it, why_matters, key_data
//                                         (summary RETAINED for WeeklyBriefing
//                                         + WhatChanged subtitles). Caps
//                                         LIMIT 50. Used exclusively by /
//                                         via fetchDashboardData.
//   get_workspace_intelligence_listings   (066) on top of slim, additionally
//                                         drops summary. NO LIMIT. Used by
//                                         /regulations and /map (loaders that
//                                         never render summary on cards). Per
//                                         the 2026-05-10 four-route audit,
//                                         /market and /operations card bodies
//                                         render Resource.note (mapped from
//                                         summary) and stay on slim until
//                                         either the cards drop the inline
//                                         note or a per-route variant retains
//                                         summary.
//
// Saves ~3.19 MB / 184 rows on the wire from full_brief alone via slim, plus
// another ~300-500 KB across the additional five columns the dashboard
// variant drops on /, plus another ~209 KB / 454 rows per route from
// summary on /regulations and /map via listings.

async function fetchWorkspaceResources(
  orgId: string,
  options: { slim?: boolean; dashboard?: boolean; listings?: boolean } = {}
): Promise<{
  active: Resource[];
  archived: Resource[];
  uuidToUiId: Map<string, string>;
}> {
  const supabase = getSupabase();

  // Workspace items via the RPC that LEFT JOINs workspace_item_overrides.
  // No legacy `resources` fallback after A.5.b — if the RPC returns empty,
  // fetchDashboardData's seed fallback covers the misconfiguration case.
  // Precedence (defensive, call sites only pass one at a time): dashboard
  // > listings > slim > full.
  const rpcName = options.dashboard
    ? "get_workspace_intelligence_dashboard"
    : options.listings
    ? "get_workspace_intelligence_listings"
    : options.slim
    ? "get_workspace_intelligence_slim"
    : "get_workspace_intelligence";
  // Migration 077 added auth.uid() membership checks to these RPCs. SSR
  // calls have no Authorization header, so auth.uid() resolves to NULL
  // and the check would fail. Use the service-role client which bypasses
  // the check (orgId was already authenticated upstream via
  // resolveOrgIdFromCookies). Direct anon-key calls from the browser
  // still hit the membership check via their JWT cookie.
  const serviceClient = getServiceSupabase();
  const { data: items, error } = await serviceClient.rpc(rpcName, { p_org_id: orgId });

  if (error || !items?.length) {
    return { active: [], archived: [], uuidToUiId: new Map() };
  }

  // Build UUID → UI-id translation map from the RPC payload (each row has
  // both id and legacy_id). The UI keys resources by UI id (legacy_id || uuid).
  const uuidToUiId = new Map<string, string>();
  for (const i of items) uuidToUiId.set(i.id, i.legacy_id || i.id);

  // Timelines from the new schema. Key is item.id (UUID), translated to UI id
  // for the lookup map the resource builder consumes.
  const itemUuids = items.map((i: any) => i.id);
  const { data: timelineRows, error: timelineErr } = await supabase
    .from("item_timelines")
    .select("item_id, milestone_date, label, is_completed, sort_order")
    .in("item_id", itemUuids)
    .order("sort_order");
  if (timelineErr) console.warn(`[supabase-server] item_timelines read failed (org timelines render empty): ${timelineErr.message}`);

  const timelineMap = new Map<string, any[]>();
  (timelineRows || []).forEach((t: any) => {
    const uiId = uuidToUiId.get(t.item_id) || t.item_id;
    const arr = timelineMap.get(uiId) || [];
    arr.push(t);
    timelineMap.set(uiId, arr);
  });

  const active: Resource[] = [];
  const archived: Resource[] = [];

  for (const row of items) {
    const resourceId = row.legacy_id || row.id;
    const timelines = timelineMap.get(resourceId);
    const resource: Resource = {
      id: resourceId,
      cat: (row.transport_modes?.[0]) || "global",
      sub: row.category || "",
      title: row.title,
      url: row.source_url || "",
      note: row.summary || "",
      type: row.item_type || "uncertain", // honest-inconclusive: an absent item_type is NOT a regulation (line-191 read layer)
      priority: (row.effective_priority || row.priority) as Resource["priority"],
      added: row.added_date,
      reasoning: row.reasoning || "",
      tags: row.tags || [],
      whatIsIt: row.what_is_it || "",
      whyMatters: row.why_matters || "",
      keyData: row.key_data || [],
      // full_brief is only present on the full RPC. The slim RPC drops the
      // column; row.full_brief is undefined and Resource.fullBrief stays
      // undefined — list surfaces never read it.
      fullBrief: row.full_brief || undefined,
      domain: row.domain || 1,
      timeline: (timelines || []).map((t: any) => ({
        date: t.milestone_date,
        label: t.label,
        // is_completed BOOLEAN ↔ legacy status TEXT. The 010 migration set
        // is_completed=true for legacy "past"|"completed" rows, so map back
        // to "past" (the only completion-state value the TimelineEntry
        // type accepts). Non-completed milestones leave status undefined.
        status: t.is_completed ? ("past" as const) : undefined,
      })),
      modes: row.transport_modes || [],
      topic: row.category || undefined,
      jurisdiction: row.jurisdictions?.[0] || undefined,
      sourceId: row.source_id || undefined,
      isArchived: row.effective_archived || false,
    };

    if (resource.isArchived) {
      archived.push(resource);
    } else {
      active.push(resource);
    }
  }

  return { active, archived, uuidToUiId };
}

// ── Workspace aggregates (migration 068) ─────────────────────
//
// Scalar totals over the same active row set as the dashboard / listings
// RPCs. Separate from row payloads so render-time stats no longer derive
// from the LIMIT-50 dashboard payload (the source of the
// WeeklyBriefing / DashboardHero / masthead-meta count bug fixed by
// migration 068). Empty defaults match the seed fallback path so callers
// can render zeros instead of NaN when Supabase is unconfigured or the
// RPC fails.

export interface WorkspaceAggregates {
  totalItems: number;
  byPriority: { CRITICAL: number; HIGH: number; MODERATE: number; LOW: number };
  byStatus: Record<string, number>;
  byJurisdiction: Record<string, number>;
  totalJurisdictions: number;
  lastUpdatedAt: string | null;
  // Migration 148: per-surface severity + signal-band label distributions,
  // keyed by the canonical DB vocab (severity: action_required/cost_alert/
  // window_closing/competitive_edge/monitoring; signal_band: price/corporate/
  // corridor). Present ONLY from get_surface_counts (fetchSurfaceCounts); the
  // workspace/scoped aggregate RPCs leave them undefined, so a consumer that
  // reads them fails soft when the surface-counts RPC is absent (pre-apply).
  bySeverity?: Record<string, number>;
  byBand?: Record<string, number>;
}

const EMPTY_AGGREGATES: WorkspaceAggregates = {
  totalItems: 0,
  byPriority: { CRITICAL: 0, HIGH: 0, MODERATE: 0, LOW: 0 },
  byStatus: {},
  byJurisdiction: {},
  totalJurisdictions: 0,
  lastUpdatedAt: null,
};

export async function fetchWorkspaceAggregates(
  orgId: string | null
): Promise<WorkspaceAggregates> {
  if (!isSupabaseConfigured() || !orgId) return EMPTY_AGGREGATES;
  try {
    // Migration 077: SSR uses service-role client to bypass auth.uid()
    // membership check (orgId already authenticated upstream).
    const supabase = getServiceSupabase();
    const { data, error } = await supabase.rpc(
      "get_workspace_intelligence_aggregates",
      { p_org_id: orgId }
    );
    if (error || !data) return EMPTY_AGGREGATES;

    // The RPC returns a single jsonb scalar; PostgREST surfaces it as the
    // raw object. Defensive coercion: missing keys default to 0 / {} so
    // the typed shape is always populated even if the SQL is later trimmed.
    type Raw = {
      total_items?: number;
      by_priority?: Record<string, number>;
      by_status?: Record<string, number>;
      by_jurisdiction?: Record<string, number>;
      total_jurisdictions?: number;
      last_updated_at?: string | null;
    };
    const raw = data as Raw;
    const bp = raw.by_priority || {};
    return {
      totalItems: Number(raw.total_items ?? 0),
      byPriority: {
        CRITICAL: Number(bp.CRITICAL ?? 0),
        HIGH: Number(bp.HIGH ?? 0),
        MODERATE: Number(bp.MODERATE ?? 0),
        LOW: Number(bp.LOW ?? 0),
      },
      byStatus: raw.by_status || {},
      byJurisdiction: raw.by_jurisdiction || {},
      totalJurisdictions: Number(raw.total_jurisdictions ?? 0),
      lastUpdatedAt: raw.last_updated_at ?? null,
    };
  } catch (e) {
    console.error("fetchWorkspaceAggregates failed, returning empty:", e);
    return EMPTY_AGGREGATES;
  }
}

// ── Scoped aggregates (migration 069) ────────────────────────
//
// Same shape as fetchWorkspaceAggregates, scoped to an item_type/domain
// filter so /market /research /operations can render true totals for
// the slice the page renders rather than workspace-wide totals.

/**
 * Scope filter for the scoped aggregates RPC. An item matches if its
 * item_type ∈ item_types OR its domain ∈ domains (OR semantics, mirroring
 * the page-level client filters in MarketPage.tsx and OperationsPage.tsx).
 * Both keys are optional. NULL or empty filter degrades to workspace-wide.
 */
export interface ScopeFilter {
  item_types?: string[];
  domains?: number[];
}

export async function fetchWorkspaceAggregatesScoped(
  orgId: string | null,
  scope: ScopeFilter | null
): Promise<WorkspaceAggregates> {
  if (!isSupabaseConfigured() || !orgId) return EMPTY_AGGREGATES;
  try {
    // Migration 077: SSR uses service-role client to bypass auth.uid()
    // membership check (orgId already authenticated upstream).
    const supabase = getServiceSupabase();
    // Pass null when no usable filter so the RPC takes its DEFAULT NULL
    // branch and degrades to workspace-wide. An empty object would also
    // degrade through the SQL "neither key present" guard, but explicit
    // null is clearer.
    const filterPayload =
      scope && (scope.item_types?.length || scope.domains?.length)
        ? {
            ...(scope.item_types?.length ? { item_types: scope.item_types } : {}),
            ...(scope.domains?.length ? { domains: scope.domains } : {}),
          }
        : null;
    const { data, error } = await supabase.rpc(
      "get_workspace_intelligence_aggregates_scoped",
      { p_org_id: orgId, p_scope_filter: filterPayload }
    );
    if (error || !data) {
      if (error) console.error("fetchWorkspaceAggregatesScoped RPC error:", error);
      return EMPTY_AGGREGATES;
    }

    type Raw = {
      total_items?: number;
      by_priority?: Record<string, number>;
      by_status?: Record<string, number>;
      by_jurisdiction?: Record<string, number>;
      total_jurisdictions?: number;
      last_updated_at?: string | null;
    };
    const raw = data as Raw;
    const bp = raw.by_priority || {};
    return {
      totalItems: Number(raw.total_items ?? 0),
      byPriority: {
        CRITICAL: Number(bp.CRITICAL ?? 0),
        HIGH: Number(bp.HIGH ?? 0),
        MODERATE: Number(bp.MODERATE ?? 0),
        LOW: Number(bp.LOW ?? 0),
      },
      byStatus: raw.by_status || {},
      byJurisdiction: raw.by_jurisdiction || {},
      totalJurisdictions: Number(raw.total_jurisdictions ?? 0),
      lastUpdatedAt: raw.last_updated_at ?? null,
    };
  } catch (e) {
    console.error("fetchWorkspaceAggregatesScoped failed, returning empty:", e);
    return EMPTY_AGGREGATES;
  }
}

// ── Per-surface counts (migration 148) ────────────────────────
//
// get_surface_counts(org, surface) is the single-SoT successor to the scoped aggregates RPC:
// classification runs server-side via surface_of() (one vocab home) and the population gates
// provenance_status='verified' (ruling 1) — closing the rail-vs-aggregates verified-filter leak and
// the /research empty-scope degrade. Returns the same WorkspaceAggregates shape (the RPC is a superset;
// by_severity/by_band are additionally present but not consumed here). Returns NULL when the RPC is
// absent (pre-apply) or errors, so callers fail soft to fetchWorkspaceAggregatesScoped.
export async function fetchSurfaceCounts(
  orgId: string | null,
  surface: string
): Promise<WorkspaceAggregates | null> {
  if (!isSupabaseConfigured() || !orgId) return null;
  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase.rpc("get_surface_counts", {
      p_org_id: orgId,
      p_surface: surface,
    });
    if (error || !data) {
      if (error) {
        console.warn("fetchSurfaceCounts RPC unavailable, caller will fall back:", error.message);
      }
      return null;
    }
    type Raw = {
      total_items?: number;
      by_priority?: Record<string, number>;
      by_severity?: Record<string, number>;
      by_band?: Record<string, number>;
      by_status?: Record<string, number>;
      by_jurisdiction?: Record<string, number>;
      total_jurisdictions?: number;
      last_updated_at?: string | null;
    };
    const raw = data as Raw;
    const bp = raw.by_priority || {};
    return {
      totalItems: Number(raw.total_items ?? 0),
      byPriority: {
        CRITICAL: Number(bp.CRITICAL ?? 0),
        HIGH: Number(bp.HIGH ?? 0),
        MODERATE: Number(bp.MODERATE ?? 0),
        LOW: Number(bp.LOW ?? 0),
      },
      // Migration 148 superset fields — the label-instance distributions the
      // Market Intel tiles (by_severity) and band strip (by_band) bind to
      // directly. Passed through verbatim (numeric-coerced) so consumers read
      // the RPC, never a re-derivation from the visible rows.
      bySeverity: raw.by_severity
        ? Object.fromEntries(
            Object.entries(raw.by_severity).map(([k, v]) => [k, Number(v ?? 0)])
          )
        : {},
      byBand: raw.by_band
        ? Object.fromEntries(
            Object.entries(raw.by_band).map(([k, v]) => [k, Number(v ?? 0)])
          )
        : {},
      byStatus: raw.by_status || {},
      byJurisdiction: raw.by_jurisdiction || {},
      totalJurisdictions: Number(raw.total_jurisdictions ?? 0),
      lastUpdatedAt: raw.last_updated_at ?? null,
    };
  } catch (e) {
    console.error("fetchSurfaceCounts failed, returning null (caller fails soft):", e);
    return null;
  }
}

// ── Research pipeline rows (replaces inline anon-key in /research) ──
//
// Direct intelligence_items query for the /research surface. Goes through
// the workspace service-role client (same path as fetchResourcesOnly),
// NOT the cookie-aware client — cookies() inside unstable_cache is
// forbidden, and the upstream caller resolves orgId before the cache
// boundary. Returns rows + true total + cap so the page can render an
// honest "Showing N of M" indicator.

export interface ResearchPipelineRow {
  id: string;
  title: string;
  summary: string;
  pipelineStage: string | null;
  transportModes: string[];
  jurisdictions: string[];
  sourceName: string | null;
  sourceUrl: string | null;
  sourceId: string | null;        // Build 8.1: for per-source citation lookups
  addedDate: string | null;
  citationCount: number | null;   // Build 8.1: from get_source_citation_stats RPC
  lastCitedAt: string | null;     // Build 8.1: from get_source_citation_stats RPC
  baseTier: number | null;        // Build 8.2: source.base_tier (provenance)
  effectiveTier: number | null;   // Build 8.2: source.effective_tier (dynamic; falls back to base_tier in render)
  biasTags: Array<{ dimension: "funding" | "methodology" | "stakeholder"; tag: string; confidence: number | null }>;  // Build 8.3: from source_bias_tags table (mig 092)
  // Sprint 3 R-A (2026-05-27): callout fields from migration 110.
  whatItChanges: string | null;
  doesNotResolve: string | null;
}

export async function fetchResearchPipelineRows(
  orgId: string,
  cap: number
): Promise<{ rows: ResearchPipelineRow[]; total: number; cap: number }> {
  if (!isSupabaseConfigured()) return { rows: [], total: 0, cap };
  try {
    const supabase = getSupabase();

    // Total count first — exact head, no rows on the wire. Drives the
    // "Showing N of M" disclosure.
    const countQuery = await supabase
      .from("intelligence_items")
      .select("id", { count: "exact", head: true })
      .eq("is_archived", false)
      .eq("provenance_status", "verified") // Sprint 4 task 1.10: customer read gate
      .eq("item_type", "research_finding"); // routing contract (migration 125 get_research_items): Research surface is research_finding ONLY
    const total = typeof countQuery.count === "number" ? countQuery.count : 0;

    // First page of rows. Same shape as the prior /research fetcher so
    // ResearchView's adapter logic stays identical. We do NOT join
    // workspace_item_overrides here (the prior fetcher didn't either, and
    // research-pipeline visibility is workspace-agnostic for now). When
    // owner / partner-flag / per-workspace pinning lands, that join goes
    // here — orgId is already wired through.
    void orgId; // reserved for the override join when pipeline_overrides land
    const { data, error } = await supabase
      .from("intelligence_items")
      .select(
        "id, legacy_id, title, summary, pipeline_stage, transport_modes, jurisdictions, added_date, what_it_changes, does_not_resolve, source:sources(id, name, url, base_tier, effective_tier)"
      )
      .eq("is_archived", false)
      .eq("provenance_status", "verified") // Sprint 4 task 1.10: customer read gate
      .eq("item_type", "research_finding") // routing contract: regulations/guidance do NOT belong on /research (was wrong-surface-leaking ~102 non-research items)
      .order("added_date", { ascending: false })
      .limit(cap);

    if (error || !data) {
      if (error) console.error("[research] fetchResearchPipelineRows error:", error);
      return { rows: [], total, cap };
    }

    // Shape rows first (without citation stats); next step fans out a
    // single RPC call for all unique source_ids in this page.
    const baseRows: ResearchPipelineRow[] = data.map((row: any) => {
      const src = Array.isArray(row.source) ? row.source[0] : row.source;
      return {
        id: row.legacy_id || row.id,
        title: row.title || "(untitled)",
        summary: row.summary || "",
        pipelineStage: row.pipeline_stage ?? null,
        transportModes: row.transport_modes || [],
        jurisdictions: row.jurisdictions || [],
        sourceName: src?.name ?? null,
        sourceUrl: src?.url ?? null,
        sourceId: src?.id ?? null,
        addedDate: row.added_date ?? null,
        citationCount: null,
        lastCitedAt: null,
        baseTier: typeof src?.base_tier === "number" ? src.base_tier : null,
        effectiveTier: typeof src?.effective_tier === "number" ? src.effective_tier : null,
        biasTags: [],
        whatItChanges: row.what_it_changes ?? null,
        doesNotResolve: row.does_not_resolve ?? null,
      };
    });

    // Build 8.1: per-source citation stats via the migration 098 edge-table
    // RPC. One RPC call for the page's distinct source_ids, then a join
    // back to baseRows by sourceId. Failure is non-fatal: rows still
    // render with citationCount=null and the UI degrades gracefully.
    const distinctSourceIds = Array.from(
      new Set(baseRows.map((r) => r.sourceId).filter((id): id is string => !!id))
    );
    const statsBySourceId = new Map<string, { count: number; recency: string | null }>();
    if (distinctSourceIds.length > 0) {
      const { data: statsRows, error: statsErr } = await supabase
        .rpc("get_source_citation_stats", { source_ids: distinctSourceIds });
      if (statsErr) {
        console.error("[research] get_source_citation_stats error:", statsErr.message);
      } else if (Array.isArray(statsRows)) {
        for (const s of statsRows) {
          if (s && typeof s.source_id === "string") {
            statsBySourceId.set(s.source_id, {
              count: typeof s.citation_count === "number" ? s.citation_count : 0,
              recency: s.recency ?? null,
            });
          }
        }
      }
    }
    // Build 8.3: per-source bias tags from source_bias_tags (mig 092). One
    // query for all distinct source_ids in the page; group client-side by
    // source_id. Empty array if a source has no bias tags (ADR-007 +
    // BiasBadge contract: render nothing for empty tags). Failure is
    // non-fatal: rows render with biasTags=[] and the UI degrades.
    const biasBySourceId = new Map<string, ResearchPipelineRow["biasTags"]>();
    if (distinctSourceIds.length > 0) {
      const { data: biasRows, error: biasErr } = await supabase
        .from("source_bias_tags")
        .select("source_id, dimension, tag, confidence")
        .in("source_id", distinctSourceIds);
      if (biasErr) {
        console.error("[research] source_bias_tags fetch error:", biasErr.message);
      } else if (Array.isArray(biasRows)) {
        for (const b of biasRows) {
          if (!b || typeof b.source_id !== "string") continue;
          const dim = b.dimension as "funding" | "methodology" | "stakeholder";
          if (dim !== "funding" && dim !== "methodology" && dim !== "stakeholder") continue;
          const existing = biasBySourceId.get(b.source_id) ?? [];
          existing.push({
            dimension: dim,
            tag: String(b.tag),
            confidence: typeof b.confidence === "number" ? b.confidence : null,
          });
          biasBySourceId.set(b.source_id, existing);
        }
      }
    }

    const rows: ResearchPipelineRow[] = baseRows.map((r) => {
      const s = r.sourceId ? statsBySourceId.get(r.sourceId) : undefined;
      const bias = r.sourceId ? biasBySourceId.get(r.sourceId) ?? [] : [];
      return {
        ...r,
        citationCount: s ? s.count : null,
        lastCitedAt: s ? s.recency : null,
        biasTags: bias,
      };
    });

    return { rows, total, cap };
  } catch (e) {
    console.error("fetchResearchPipelineRows failed, returning empty:", e);
    return { rows: [], total: 0, cap };
  }
}

// ── Research source coverage matrix (Build 8.5) ──────────────────────
//
// Pivots Research-bound sources (sources.category='research',
// status='active') across (transport_mode x jurisdiction_iso). Calls the
// migration 100 RPC get_research_source_coverage() and returns a plain
// nested record shape RSC-serializable to the ResearchView coverage tab.
//
// Why a server-side fetcher (vs direct RPC from the client): keeps the
// anon-key + service-role pattern aligned with the rest of /research's
// data layer, lets the coverage data be passed as a plain RSC prop
// (Map / Set are not RSC-serializable), and matches the page.tsx
// Promise.all pattern.

export interface ResearchSourceCoverageCell {
  transportMode: string;       // lowercase, as stored in sources.transport_modes
  jurisdictionIso: string;     // ISO 3166-1, ISO 3166-2, or free-text (EU, GLOBAL)
  sourceCount: number;
}

export async function fetchResearchSourceCoverage(): Promise<ResearchSourceCoverageCell[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc("get_research_source_coverage");
    if (error) {
      console.error("[research] get_research_source_coverage error:", error.message);
      return [];
    }
    if (!Array.isArray(data)) return [];
    const out: ResearchSourceCoverageCell[] = [];
    for (const row of data) {
      if (!row || typeof row.transport_mode !== "string" || typeof row.jurisdiction_iso !== "string") continue;
      out.push({
        transportMode: row.transport_mode,
        jurisdictionIso: row.jurisdiction_iso,
        sourceCount: typeof row.source_count === "number" ? row.source_count : 0,
      });
    }
    return out;
  } catch (e) {
    console.error("fetchResearchSourceCoverage failed, returning empty:", e);
    return [];
  }
}

// ── Category-Aware Routing Fetchers (Sprint 2 Build 4) ───────
//
// Wires the orphan RPCs get_market_intel_items / get_research_items /
// get_operations_items (migration 070, refreshed in 071) into application
// code, with src-side refinement of source_role → category mapping per
// the canonical taxonomy in environmental-policy-and-innovation
// SKILL.md Section 3 ("The Five Customer-Facing Surfaces").
//
// Refinement context. The orphan RPCs filter by source_role alone, which
// misroutes specific sources whose skill-aligned destination differs from
// their source_role bucket. The exceptions encoded below are:
//
//   1. IMO + ICAO. source_role = 'intergovernmental_body' (which the
//      research RPC includes by default) but the skill places them in
//      Regulations. They are binding regulatory authorities, not horizon
//      research. They are excluded from Research here (Regulations is
//      handled by /regulations using the full slim payload; no skill
//      change required there because Regulations does not filter on
//      source_role).
//
//   2. Trade press with analytical / horizon-scanning depth. source_role
//      = 'trade_press' (which the market intel RPC includes) but the
//      skill routes these to Research because their content is
//      analytical, not signal-aggregation. Affected outlets: FreightWaves
//      Sustainability, Loadstar, GreenBiz, Environmental Finance,
//      Splash247 Green, Supply Chain Digital, Edie, Reuters Sustainable
//      Business (the analytical reporting branch, distinct from the
//      Sustainable Switch newsletter which stays in Market Intel).
//
//   3. Quantified climate research carrying source_role =
//      'statistical_data_agency' (which the operations RPC includes) but
//      the skill places them in Research: Carbon Trust, Project Drawdown.
//
// Match strategy: case-insensitive substring on sources.name, applied
// after the orphan RPC returns. This is forgiving against minor naming
// drift in the source registry (e.g. "FreightWaves" vs "Freight Waves
// Sustainability"). When the canonical-category schema column lands
// post-Sprint-2, this src-side filter retires in favour of the column.

// D6 resolution (migration 084, commit pending): the source-to-category
// mapping that used to live as name-pattern exception lists here has been
// ported into the canonical sources.category column. The three RPCs
// (get_market_intel_items, get_research_items, get_operations_items) now
// query sources.category directly. The src-side fetchers below just call
// the RPCs and trust their output.
//
// The status-conditional logic for standards_body and primary_legal_authority
// items (which can route to Research based on item-level status even when
// their source's default category is regulatory) is preserved inside
// get_research_items per migration 084.
//
// Adding new sources or new source categories is now a DATA entry on the
// sources record, not a code change here. Build 7 (Market Intel signal
// aggregation) and future source additions benefit from this.

// Translate one RPC row (slim+ shape returned by get_*_items RPCs) into a
// Resource. Mirrors fetchWorkspaceResources's mapper, minus the timeline join
// (the category-routed surfaces render row-level metadata, not timelines).
function rpcRowToResource(row: any): Resource {
  return {
    id: row.legacy_id || row.id,
    cat: row.transport_modes?.[0] || "global",
    sub: row.category || "",
    title: row.title,
    url: row.source_url || "",
    note: row.summary || "",
    type: row.item_type || "uncertain", // honest-inconclusive: an absent item_type is NOT a regulation (line-191 read layer)
    priority: (row.effective_priority || row.priority) as Resource["priority"],
    added: row.added_date,
    reasoning: row.reasoning || "",
    tags: row.tags || [],
    whatIsIt: row.what_is_it || "",
    whyMatters: row.why_matters || "",
    keyData: row.key_data || [],
    fullBrief: row.full_brief || undefined,
    domain: row.domain || 1,
    timeline: [],
    modes: row.transport_modes || [],
    topic: row.category || undefined,
    jurisdiction: row.jurisdictions?.[0] || undefined,
    sourceId: row.source_id || undefined,
    isArchived: row.effective_archived || false,
    // Phase 3C: pass through new schema columns when RPC includes them.
    // Undefined until RPC outputs are extended (separate migration).
    severity: row.severity || undefined,
    signalBand: row.signal_band || undefined,
    theme: row.theme || undefined,
    // Sprint 3 A4-2 (migration 108): trajectory_points surfaced on
    // get_market_intel_items. Belt 1 (migration 107 CHECK) guarantees
    // this is only present when signal_band = 'price'.
    trajectoryPoints: row.trajectory_points || undefined,
    // Sprint 3 R-A + M-A (migration 110): 4 callout fields. RPC payload
    // surfaces them on get_research_items + get_market_intel_items;
    // mapper passes through opportunistically (undefined when the RPC
    // doesn't include them, e.g. get_operations_items).
    whatItChanges: row.what_it_changes || undefined,
    doesNotResolve: row.does_not_resolve || undefined,
    conversionTrigger: row.conversion_trigger || undefined,
    crossReferences: row.cross_references || undefined,
  };
}

export interface CategoryRoutedResult {
  resources: Resource[];
  total: number;
}

// Internal helper. Calls the category-routing RPC; projects rows to
// Resource[]. The RPC body itself enforces routing via sources.category
// (migration 084); no src-side filtering needed.
async function runCategoryRpc(
  orgId: string | null,
  rpcName:
    | "get_market_intel_items"
    | "get_research_items"
    | "get_operations_items"
    | "get_technology_items",
  opts: { enrichCitations?: boolean } = {}
): Promise<CategoryRoutedResult> {
  if (!isSupabaseConfigured() || !orgId) {
    return { resources: [], total: 0 };
  }
  try {
    const serviceClient = getServiceSupabase();
    const { data: rows, error } = await serviceClient.rpc(rpcName, {
      p_org_id: orgId,
    });
    if (error || !rows) {
      console.error(`[category-routing] ${rpcName} error:`, error);
      return { resources: [], total: 0 };
    }
    const resources = (rows as any[]).map(rpcRowToResource);

    // P1-2 (DEEP-AUDIT S2): enrich the provenance chip (source name + tier). The
    // category RPCs return source_id but not the publisher name/tier, so the tier
    // chips + source lines rendered nothing across market/research/operations. One
    // lookup by the page's distinct source_ids, mapped back by sourceId. Customer
    // surfaces show effective_tier (dynamic), falling back to base_tier. Non-fatal.
    const chipSourceIds = Array.from(
      new Set(resources.map((r) => r.sourceId).filter((id): id is string => !!id))
    );
    if (chipSourceIds.length > 0) {
      const { data: srcRows, error: srcErr } = await serviceClient
        .from("sources")
        .select("id, name, base_tier, effective_tier")
        .in("id", chipSourceIds);
      if (srcErr) {
        console.error(`[category-routing] source chip enrichment for ${rpcName} error:`, srcErr.message);
      } else if (Array.isArray(srcRows)) {
        const byId = new Map<string, { name: string | null; base_tier: number | null; effective_tier: number | null }>();
        for (const s of srcRows as any[]) if (s?.id) byId.set(s.id, s);
        for (const r of resources) {
          const s = r.sourceId ? byId.get(r.sourceId) : undefined;
          if (s) {
            r.sourceName = s.name ?? undefined;
            r.sourceTier = (s.effective_tier ?? s.base_tier) ?? undefined;
          }
        }
      }
    }

    // Build 9: per-source citation stats for Operations cards. Mirrors the
    // Build 8.1 ResearchView enrichment in fetchResearchPipelineRows above.
    // One RPC call for the page's distinct source_ids, then a join back by
    // sourceId. Failure is non-fatal: rows render with citationCount=null
    // and the chips suppress themselves.
    if (opts.enrichCitations) {
      const distinctSourceIds = Array.from(
        new Set(
          resources
            .map((r) => r.sourceId)
            .filter((id): id is string => !!id)
        )
      );
      if (distinctSourceIds.length > 0) {
        const { data: statsRows, error: statsErr } = await serviceClient.rpc(
          "get_source_citation_stats",
          { source_ids: distinctSourceIds }
        );
        if (statsErr) {
          console.error(
            `[category-routing] get_source_citation_stats for ${rpcName} error:`,
            statsErr.message
          );
        } else if (Array.isArray(statsRows)) {
          const statsBySourceId = new Map<string, { count: number; recency: string | null }>();
          for (const s of statsRows as any[]) {
            if (s && typeof s.source_id === "string") {
              statsBySourceId.set(s.source_id, {
                count: typeof s.citation_count === "number" ? s.citation_count : 0,
                recency: s.recency ?? null,
              });
            }
          }
          for (const r of resources) {
            const s = r.sourceId ? statsBySourceId.get(r.sourceId) : undefined;
            r.citationCount = s ? s.count : null;
            r.lastCitedAt = s ? s.recency : null;
          }
        }
      }
    }

    return { resources, total: resources.length };
  } catch (e) {
    console.error(`[category-routing] ${rpcName} failed:`, e);
    return { resources: [], total: 0 };
  }
}

// /market fetcher. RPC filters on sources.category = 'market_news'.
export async function fetchMarketIntelItems(
  orgId: string | null
): Promise<CategoryRoutedResult> {
  return runCategoryRpc(orgId, "get_market_intel_items");
}

// /research fetcher. RPC filters on sources.category = 'research' OR the
// item-level status conditionals for standards_body and primary_legal_authority
// (preserved from the original 070/073 RPC; per migration 084).
export async function fetchResearchItems(
  orgId: string | null
): Promise<CategoryRoutedResult> {
  return runCategoryRpc(orgId, "get_research_items");
}

// /operations fetcher. RPC filters on sources.category = 'operational_data'.
// Build 9: enriches Operations rows with per-source citation stats so the
// Q9 Operations signal set (tier + jurisdiction + applicability, with
// citation count + recency as secondary signals per source-credibility-model
// SKILL Section 8) renders on cards.
export async function fetchOperationsItems(
  orgId: string | null
): Promise<CategoryRoutedResult> {
  return runCategoryRpc(orgId, "get_operations_items", { enrichCitations: true });
}

// /technology fetcher. RPC filters on item_type IN ('technology',
// 'innovation', 'tool') — item_type-gated via migration 134.
export async function fetchTechnologyItems(
  orgId: string | null
): Promise<CategoryRoutedResult> {
  return runCategoryRpc(orgId, "get_technology_items");
}

// ── Per-source citation stats (Build 7, Q9 chip mounts) ───────
//
// Build 8.1 added get_source_citation_stats reads inside
// fetchResearchPipelineRows (per-row pipeline fetcher). Market Intel
// consumes Resource[] from the category-routed fetcher above, so the
// citation stats lookup lives outside the routing call and is decorated
// onto the Resource list by the caller (the /market route).
//
// This helper accepts a list of source_ids (already deduplicated by the
// caller) and returns a Map<source_id, { count, recency }>. Failure is
// non-fatal: callers receive an empty Map and the UI degrades to no
// citation chips (consistent with Build 8.1 ResearchView behavior).
//
// The RPC body (migration 098) reads from the intelligence_item_citations
// edge table; same data plane as /research.
export interface SourceCitationStat {
  count: number;
  recency: string | null;
}

export async function fetchSourceCitationStatsByIds(
  sourceIds: string[]
): Promise<Map<string, SourceCitationStat>> {
  const out = new Map<string, SourceCitationStat>();
  if (!isSupabaseConfigured() || sourceIds.length === 0) return out;
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .rpc("get_source_citation_stats", { source_ids: sourceIds });
    if (error) {
      console.error("[market] get_source_citation_stats error:", error.message);
      return out;
    }
    if (Array.isArray(data)) {
      for (const row of data) {
        if (row && typeof row.source_id === "string") {
          out.set(row.source_id, {
            count: typeof row.citation_count === "number" ? row.citation_count : 0,
            recency: row.recency ?? null,
          });
        }
      }
    }
    return out;
  } catch (e) {
    console.error("[market] fetchSourceCitationStatsByIds failed:", e);
    return out;
  }
}

// ── Master Fetch ─────────────────────────────────────────────

export interface SectorSynopsis {
  itemId: string;
  sector: string;
  summary: string;
  urgencyScore: number | null;
}

export interface IntelligenceChange {
  itemId: string;
  changeType: string;
  changeSeverity: string;
  changeSummary: string;
}

export interface SectorDisplayName {
  sector: string;
  displayName: string;
}

export interface WorkspaceOverrideRow {
  itemId: string;
  priorityOverride: string | null;
  isArchived: boolean;
  archiveReason: string | null;
  archiveNote: string | null;
  notes: string;
  // Sprint 3 followup Part 2 (migration 111): ISO timestamp when the
  // workspace has dismissed the regulation from the active Kanban view.
  // null when not dismissed.
  dismissedAt?: string | null;
  // Phase 1 ownership (migration 234): org-scoped assignee. ownerName is
  // resolved server-side from the org roster so the client never needs a
  // second fetch to render "By owner" / the assignee row.
  ownerUserId?: string | null;
  ownerName?: string | null;
}

// Phase 1 ownership (migration 234): the shared org-overrides read. One SELECT
// (now carrying owner_user_id) + one batched roster lookup to resolve assignee
// display names server-side. Shared by fetchDashboardData, fetchResourcesOnly,
// and fetchListingsOnly — those three sites previously duplicated the select +
// mapping byte-for-byte, and the owner logic would have tripled.
//
// P1-1 (DEEP-AUDIT S1-8): SERVICE client. orgId is authenticated upstream; the
// anon client has no JWT so org-scoped RLS returned [] and dismissals/notes
// silently vanished on reload.
//
// Name resolution goes through org_memberships (scoped to THIS org), not raw
// profiles: an assignee who has left the org resolves to ownerName=null and the
// merge layer renders the item unassigned — never a stale name from outside the
// company group.
interface OverrideDbRow {
  item_id: string;
  priority_override: string | null;
  is_archived: boolean | null;
  archive_reason: string | null;
  archive_note: string | null;
  notes: string | null;
  dismissed_at: string | null;
  owner_user_id: string | null;
}

async function fetchWorkspaceOverrideRows(
  orgId: string,
  uuidToUiId: Map<string, string>
): Promise<WorkspaceOverrideRow[]> {
  const svc = getServiceSupabase();
  const { data, error } = await svc
    .from("workspace_item_overrides")
    .select(
      "item_id, priority_override, is_archived, archive_reason, archive_note, notes, dismissed_at, owner_user_id"
    )
    .eq("org_id", orgId);
  if (error) {
    console.warn("[overrides] service read failed:", error.message);
    return [];
  }
  const rows = (data || []) as OverrideDbRow[];

  const ownerIds = [
    ...new Set(rows.map((o) => o.owner_user_id).filter((v): v is string => !!v)),
  ];
  const ownerNames = new Map<string, string>();
  if (ownerIds.length) {
    const { data: memberRows, error: memberError } = await svc
      .from("org_memberships")
      .select("user_id, user:profiles!user_id(full_name, display_name, email)")
      .eq("org_id", orgId)
      .in("user_id", ownerIds);
    if (memberError) {
      // Warn-and-continue: an unresolved roster degrades to unassigned rows,
      // never a failed page render.
      console.warn("[overrides] owner roster read failed:", memberError.message);
    }
    for (const m of (memberRows || []) as Array<{
      user_id: string;
      user: { full_name?: string | null; display_name?: string | null; email?: string | null } | null;
    }>) {
      ownerNames.set(
        m.user_id,
        m.user?.full_name ?? m.user?.display_name ?? m.user?.email ?? `${String(m.user_id).slice(0, 8)}...`
      );
    }
  }

  return rows.map((o) => ({
    itemId: uuidToUiId.get(o.item_id) || o.item_id,
    priorityOverride: o.priority_override ?? null,
    isArchived: !!o.is_archived,
    archiveReason: o.archive_reason ?? null,
    archiveNote: o.archive_note ?? null,
    notes: o.notes ?? "",
    dismissedAt: o.dismissed_at ?? null,
    ownerUserId: o.owner_user_id ?? null,
    ownerName: o.owner_user_id ? ownerNames.get(o.owner_user_id) ?? null : null,
  }));
}

/** One row of the window-scoped What-changed feed (migration 232: get_workspace_recent_changes).
 *  Exists because the dashboard RPC is LIMIT 50 by priority — once the corpus outgrew the
 *  slice, items added this week fell outside it and the This-week section reported nothing
 *  (2026-08-01 defect: 216 in-window items rendered as zero). This feed is bounded by the
 *  date window, not a priority cap. */
export interface RecentChangeRow {
  id: string;
  title: string;
  priority: string;
  added: string;
  /** item_type / domain for canonical-surface routing (misroute contract):
   *  the What-changed rows link via surfaceOf, so the feed must carry the
   *  classification inputs. OPTIONAL on purpose — the migration-232 RPC
   *  returns neither column (they are enriched by a follow-up read in
   *  fetchDashboardData), and per the DASHBOARD_DATA_CACHE_KEY limit note
   *  additions reached through nested types must be optional so a stale
   *  cached payload stays type-valid (absent fields fall back to the
   *  pre-fix /regulations destination in itemDetailHref). */
  itemType?: string | null;
  domain?: number | null;
}

/** Raw payload shape of the get_workspace_recent_changes RPC (migration 232). */
interface RecentChangeRpcRow {
  id: string;
  legacy_id: string | null;
  title: string;
  priority: string | null;
  effective_priority: string | null;
  added_date: string;
}

// ── Cache key for the cached dashboard payload (consumed by lib/data.ts) ──
// CO-LOCATED with DashboardData on purpose, and STAMPED with a hash of the
// interface block below: discipline rule 021 recomputes that hash on every
// commit touching this file or lib/data.ts and FAILS the commit if this
// constant does not end in it — its failure message prints the new required
// key, and updating the constant to satisfy the rule IS the fix, because it
// rotates the cache namespace.
//
// WHY THIS EXISTS: unstable_cache entries persist ACROSS DEPLOYMENTS. PR #395
// added `recentChanges` to this shape without bumping the then-key
// "app-data-v2", so after each subsequent deploy the stale-while-revalidate
// window served the OLD-shape payload to NEW code and `recentChanges.filter`
// crashed SSR of `/` (digest 2552218741, observed 2026-08-01T23:29Z). A
// failing/slow background revalidation (the "getAppData timeout" error class)
// extends that window indefinitely, because serve-stale keeps resurrecting
// the old entry. Rotating the key on shape change removes the class.
//
// LIMIT (documented, not hidden): the hash covers THIS interface's own text.
// A shape change reached through a nested type (Resource, Supersession, …)
// does not rotate the key mechanically — additions through nested types MUST
// be optional fields, or rotate this key by hand in the same commit.
export const DASHBOARD_DATA_CACHE_KEY = "app-data-1ac1bd65";

export interface DashboardData {
  resources: Resource[];
  archived: Resource[];
  recentChanges: RecentChangeRow[];
  changelog: Record<string, ChangeLogEntry[]>;
  disputes: Record<string, Dispute>;
  xrefPairs: [string, string][];
  supersessions: Supersession[];
  auditDate: string;
  synopses: SectorSynopsis[];
  intelligenceChanges: IntelligenceChange[];
  sectorDisplayNames: SectorDisplayName[];
  overrides: WorkspaceOverrideRow[];
  /**
   * SF-2 Phase 1 (2026-05-27): set when the fetcher fell back to an
   * empty payload instead of live data. Customer-visible page renders
   * a `SystemErrorBanner` when present. The wrapper in `lib/data.ts`
   * also records a platform integrity_flag (dedupe per-route per-hour)
   * via `recordSeedFallbackFlag()` so admin sees the activation in the
   * red-flag-dot + platform-flags queue.
   */
  _error?: string;
  _fallbackTrigger?: SeedFallbackTrigger;
}

// SF-2 Phase 1 (2026-05-27): customer-facing copy when a data fetcher
// falls back. Surface-agnostic; banner component is the one rendering it.
export const SEED_FALLBACK_ERROR =
  "Data temporarily unavailable. Refresh to retry.";

// Timeout wrapper — prevents Supabase from hanging indefinitely on Vercel
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export async function fetchDashboardData(orgId: string | null): Promise<DashboardData> {
  // SF-2 Phase 1 (2026-05-27): empty payload + _error sentinel replaces
  // the prior seed-data fallback. The seed array pre-dated the source-
  // trust schema and carried no source attribution; rendering it
  // alongside the live UI violated the integrity rule. Now we return
  // empty + _error and let the page component show SystemErrorBanner.
  const emptyFallback: DashboardData = {
    resources: [],
    archived: [],
    recentChanges: [],
    changelog: {},
    disputes: {},
    xrefPairs: [],
    supersessions: [],
    // Honest empty: no detection pass backs this payload. WhatChanged
    // renders "no detection pass on record" for a falsy auditDate.
    auditDate: "",
    synopses: [],
    intelligenceChanges: [],
    sectorDisplayNames: [],
    overrides: [],
  };

  if (!isSupabaseConfigured()) {
    return { ...emptyFallback, _error: SEED_FALLBACK_ERROR, _fallbackTrigger: "supabase_not_configured" };
  }

  // Anonymous request — proxy.ts auth gate should intercept upstream
  // (Sprint 3 SF-2 verification 2026-05-27). This branch remains as
  // defense-in-depth for authenticated users without an org_membership.
  if (!orgId) {
    return { ...emptyFallback, _error: SEED_FALLBACK_ERROR, _fallbackTrigger: "null_orgId" };
  }

  try {
    // Workspace-scoped intelligence read. orgId is the caller's auth-resolved
    // membership; the RPC merges intelligence_items with this workspace's
    // overrides only.
    const [
      { active: resources, archived, uuidToUiId },
      changelog,
      disputes,
      xrefPairs,
      supersessions,
    ] = await withTimeout(
      Promise.all([
        // Dashboard projection (migration 064): drops full_brief,
        // operational_impact, open_questions, reasoning, summary,
        // what_is_it, why_matters, key_data on top of the slim sibling
        // and caps to LIMIT 50. The home subtree renders none of those
        // columns per docs/dashboard-payload-audit-2026-05-11.md.
        fetchWorkspaceResources(orgId, { dashboard: true }),
        fetchChangelog(),
        fetchDisputes(),
        fetchXrefPairs(),
        fetchSupersessions(),
      ]),
      8000, // 8 second timeout
      // Wave-α A2 (2026-07-11): the timeout fallback previously served the
      // STATIC SEED tuple — non-empty seedResources skipped the
      // `!resources.length` sentinel branch below and the dashboard rendered
      // March seed content as live (P1 finding 7, CODE-3 F-01). Now the
      // timeout lands in the same empty + `_error` path as every sibling
      // fetcher (fetchMapData, fetchListingsMapData, fetchSettingsData).
      [
        { active: [] as Resource[], archived: [] as Resource[], uuidToUiId: new Map<string, string>() },
        {} as Record<string, ChangeLogEntry[]>,
        {} as Record<string, Dispute>,
        [] as [string, string][],
        [] as Supersession[],
      ]
    );

    // If Supabase returned empty, treat as transient/data-layer issue
    // and surface the error sentinel rather than seed content.
    if (!resources.length) {
      return { ...emptyFallback, _error: SEED_FALLBACK_ERROR, _fallbackTrigger: "rpc_error" };
    }

    // Fetch changes + sector names + overrides (no synopses).
    // intelligence_summaries is shelved per CLAUDE.md sector-activation
    // note (the 2,325 rows are pre-Phase-B.2.5 contract output, kept but
    // unrendered). The dashboard data path used to do 1-3 paginated reads
    // of this table on every request and feed the result to a store
    // nothing renders — pure waste. Skipping it removes those round-trips
    // and ~500KB of wire on every dashboard render. SectorSynopsisView
    // renders against full_brief, not synopses, per the sector-activation
    // shelving decision; that path is unaffected.
    const supabase = getSupabase();
    const allSynopses: Array<{
      item_id: string;
      sector: string;
      summary: string;
      urgency_score: number | null;
    }> = [];

    const [changesResult, sectorsResult, overrides, recentResult] = await Promise.all([
      supabase
        .from("intelligence_changes")
        .select("item_id, change_type, change_severity, change_summary")
        .order("detected_at", { ascending: false })
        .limit(100),
      supabase
        .from("sector_contexts")
        .select("sector, display_name"),
      // Shared org-overrides read (owner-aware, migration 234) — see
      // fetchWorkspaceOverrideRows for the service-client rationale (P1-1).
      fetchWorkspaceOverrideRows(orgId, uuidToUiId),
      // Window-scoped What-changed feed (see RecentChangeRow). Service client:
      // orgId authenticated upstream, same idiom as the dashboard RPC call.
      getServiceSupabase().rpc("get_workspace_recent_changes", { p_org_id: orgId, p_days: 7 }),
    ]);

    // UUID→UI-id map already built by fetchWorkspaceResources from the
    // get_workspace_intelligence RPC payload — synopses + changes +
    // overrides use it to translate item_id (uuid) into the UI-side id
    // (legacy_id || uuid) the resource list is keyed by.

    // Map synopses using the UUID→UI_ID lookup
    const synopses: SectorSynopsis[] = allSynopses.map((r: any) => ({
      itemId: uuidToUiId.get(r.item_id) || r.item_id,
      sector: r.sector,
      summary: r.summary,
      urgencyScore: r.urgency_score,
    }));

    // Dedupe changes to most recent per item
    const changesSeen = new Set<string>();
    const intelligenceChanges: IntelligenceChange[] = [];
    for (const c of changesResult.data || []) {
      const key = uuidToUiId.get(c.item_id) || c.item_id;
      if (!changesSeen.has(key)) {
        changesSeen.add(key);
        intelligenceChanges.push({
          itemId: key,
          changeType: c.change_type,
          changeSeverity: c.change_severity,
          changeSummary: c.change_summary,
        });
      }
    }

    const sectorDisplayNames: SectorDisplayName[] = (sectorsResult.data || []).map((s: any) => ({
      sector: s.sector,
      displayName: s.display_name,
    }));

    // Audit date: most recent changelog entry or today
    let auditDate = new Date().toISOString().slice(0, 10);
    for (const entries of Object.values(changelog)) {
      for (const e of entries) {
        if (e.date > auditDate) auditDate = e.date;
      }
    }

    if (recentResult.error) {
      console.warn(`[supabase-server] get_workspace_recent_changes failed (This-week renders from the capped feed only): ${recentResult.error.message}`);
    }
    // Canonical-surface routing enrichment (misroute contract): the 232 RPC
    // predates surface routing and returns no item_type/domain, so one
    // follow-up read supplies the surfaceOf inputs for the What-changed
    // links. Fail-soft: on error the rows simply lack the fields and
    // itemDetailHref falls back to the pre-fix /regulations destination.
    const recentRows = (recentResult.data || []) as RecentChangeRpcRow[];
    const recentTypeById = new Map<string, { item_type: string | null; domain: number | null }>();
    if (recentRows.length > 0) {
      const { data: typeRows, error: typeErr } = await getServiceSupabase()
        .from("intelligence_items")
        .select("id, item_type, domain")
        .in("id", recentRows.map((r) => r.id));
      if (typeErr) {
        console.warn(`[supabase-server] recent-changes item_type enrichment failed (rows link to /regulations fallback): ${typeErr.message}`);
      }
      for (const t of (typeRows || []) as Array<{ id: string; item_type: string | null; domain: number | null }>) {
        recentTypeById.set(t.id, { item_type: t.item_type ?? null, domain: t.domain ?? null });
      }
    }
    const recentChanges: RecentChangeRow[] = recentRows.map((r) => ({
      id: r.legacy_id || r.id,
      title: r.title,
      priority: r.effective_priority || r.priority || "LOW",
      added: r.added_date,
      itemType: recentTypeById.get(r.id)?.item_type ?? null,
      domain: recentTypeById.get(r.id)?.domain ?? null,
    }));

    return {
      resources,
      archived,
      recentChanges,
      changelog,
      disputes,
      xrefPairs,
      supersessions,
      auditDate,
      synopses,
      intelligenceChanges,
      sectorDisplayNames,
      overrides,
    };
  } catch (e) {
    console.error("fetchDashboardData failed, using empty + error sentinel:", e);
    return { ...emptyFallback, _error: SEED_FALLBACK_ERROR, _fallbackTrigger: "exception" };
  }
}

// ── Slim Fetch Variants (perf wave 2) ────────────────────────
/**
 * Slim variant of fetchDashboardData: only resources + workspace overrides.
 * Skips changelog, disputes, xrefs, supersessions, synopses, changes,
 * sector display names. Used by pages that consume only `data.resources`
 * (and optionally `data.overrides`): /operations, /market, /regulations.
 *
 * Cost: 2 queries (workspace RPC + workspace_item_overrides) + 1 timeline
 * read inside fetchWorkspaceResources. Compared to ~15 for fetchDashboardData.
 */
export async function fetchResourcesOnly(orgId: string | null): Promise<{
  resources: Resource[];
  archived: Resource[];
  overrides: WorkspaceOverrideRow[];
  _error?: string;
  _fallbackTrigger?: SeedFallbackTrigger;
}> {
  // SF-2 Phase 1 (2026-05-27): empty payload + _error sentinel.
  const emptyFallback = {
    resources: [] as Resource[],
    archived: [] as Resource[],
    overrides: [] as WorkspaceOverrideRow[],
  };

  if (!isSupabaseConfigured()) {
    return { ...emptyFallback, _error: SEED_FALLBACK_ERROR, _fallbackTrigger: "supabase_not_configured" };
  }
  if (!orgId) {
    return { ...emptyFallback, _error: SEED_FALLBACK_ERROR, _fallbackTrigger: "null_orgId" };
  }

  try {
    // Slim RPC — drops full_brief/operational_impact/open_questions/reasoning
    // from the wire. None are rendered by /regulations, /operations, /market.
    const { active, archived, uuidToUiId } = await fetchWorkspaceResources(orgId, { slim: true });
    if (!active.length) {
      return { ...emptyFallback, _error: SEED_FALLBACK_ERROR, _fallbackTrigger: "rpc_error" };
    }

    // Shared org-overrides read (owner-aware, migration 234) — see
    // fetchWorkspaceOverrideRows for the service-client rationale (P1-1).
    const overrides = await fetchWorkspaceOverrideRows(orgId, uuidToUiId);

    return { resources: active, archived, overrides };
  } catch (e) {
    console.error("fetchResourcesOnly failed, using empty + error sentinel:", e);
    return { ...emptyFallback, _error: SEED_FALLBACK_ERROR, _fallbackTrigger: "exception" };
  }
}

/**
 * Slim variant for the /map surface: resources + relationship payload
 * the map view consumes (changelog, disputes, xrefPairs, supersessions).
 * Drops sources/provisional/conflicts/synopses/intelligenceChanges/
 * sectorDisplayNames/overrides.
 *
 * Cost: 5 queries (workspace RPC + 4 relationship reads). Compared to
 * ~15 for fetchDashboardData.
 */
export async function fetchMapData(orgId: string | null): Promise<{
  resources: Resource[];
  archived: Resource[];
  changelog: Record<string, ChangeLogEntry[]>;
  disputes: Record<string, Dispute>;
  xrefPairs: [string, string][];
  supersessions: Supersession[];
  _error?: string;
  _fallbackTrigger?: SeedFallbackTrigger;
}> {
  // SF-2 Phase 1 (2026-05-27): empty payload + _error sentinel.
  const emptyFallback = {
    resources: [] as Resource[],
    archived: [] as Resource[],
    changelog: {} as Record<string, ChangeLogEntry[]>,
    disputes: {} as Record<string, Dispute>,
    xrefPairs: [] as [string, string][],
    supersessions: [] as Supersession[],
  };

  if (!isSupabaseConfigured()) {
    return { ...emptyFallback, _error: SEED_FALLBACK_ERROR, _fallbackTrigger: "supabase_not_configured" };
  }
  if (!orgId) {
    return { ...emptyFallback, _error: SEED_FALLBACK_ERROR, _fallbackTrigger: "null_orgId" };
  }

  try {
    const [{ active, archived }, changelog, disputes, xrefPairs, supersessions] = await withTimeout(
      Promise.all([
        // Slim RPC — /map renders pins/lines, never full_brief.
        fetchWorkspaceResources(orgId, { slim: true }),
        fetchChangelog(),
        fetchDisputes(),
        fetchXrefPairs(),
        fetchSupersessions(),
      ]),
      8000,
      [
        { active: [] as Resource[], archived: [] as Resource[], uuidToUiId: new Map<string, string>() },
        {} as Record<string, ChangeLogEntry[]>,
        {} as Record<string, Dispute>,
        [] as [string, string][],
        [] as Supersession[],
      ] as [
        { active: Resource[]; archived: Resource[]; uuidToUiId: Map<string, string> },
        Record<string, ChangeLogEntry[]>,
        Record<string, Dispute>,
        [string, string][],
        Supersession[],
      ]
    );

    if (!active.length) {
      return { ...emptyFallback, _error: SEED_FALLBACK_ERROR, _fallbackTrigger: "rpc_error" };
    }

    return {
      resources: active,
      archived,
      changelog,
      disputes,
      xrefPairs,
      supersessions,
    };
  } catch (e) {
    console.error("fetchMapData failed, using empty + error sentinel:", e);
    return { ...emptyFallback, _error: SEED_FALLBACK_ERROR, _fallbackTrigger: "exception" };
  }
}

/**
 * Listings variant of fetchResourcesOnly. Same shape (resources + archived +
 * overrides) but issues the listings RPC (066) which additionally drops
 * `summary` on top of slim's four-column trim. Resource.note arrives empty
 * on every row.
 *
 * Safe ONLY for callers whose card body never renders Resource.note.
 * Verified safe per the 2026-05-10 four-route audit:
 *   /regulations  RegulationsSurface uses r.note only inside the search
 *                 hay-stack; no card body references it. PR removes the
 *                 r.note concat from the hay-stack at the same time.
 *   /map          no MapPageView / MapView references to r.note.
 *
 * /market and /operations stay on fetchResourcesOnly because their cards
 * visibly render note (MarketPage Key-items + PriceRow + why-matters
 * fallback; OperationsPage region heads + per-region item lists +
 * inferChipKey text scan).
 */
export async function fetchListingsOnly(orgId: string | null): Promise<{
  resources: Resource[];
  archived: Resource[];
  overrides: WorkspaceOverrideRow[];
  _error?: string;
  _fallbackTrigger?: SeedFallbackTrigger;
}> {
  // SF-2 Phase 1 (2026-05-27): empty payload + _error sentinel.
  const emptyFallback = {
    resources: [] as Resource[],
    archived: [] as Resource[],
    overrides: [] as WorkspaceOverrideRow[],
  };

  if (!isSupabaseConfigured()) {
    return { ...emptyFallback, _error: SEED_FALLBACK_ERROR, _fallbackTrigger: "supabase_not_configured" };
  }
  if (!orgId) {
    return { ...emptyFallback, _error: SEED_FALLBACK_ERROR, _fallbackTrigger: "null_orgId" };
  }

  try {
    const { active, archived, uuidToUiId } = await fetchWorkspaceResources(orgId, { listings: true });
    if (!active.length) {
      return { ...emptyFallback, _error: SEED_FALLBACK_ERROR, _fallbackTrigger: "rpc_error" };
    }

    // Shared org-overrides read (owner-aware, migration 234) — see
    // fetchWorkspaceOverrideRows for the service-client rationale (P1-1).
    const overrides = await fetchWorkspaceOverrideRows(orgId, uuidToUiId);

    return { resources: active, archived, overrides };
  } catch (e) {
    console.error("fetchListingsOnly failed, using empty + error sentinel:", e);
    return { ...emptyFallback, _error: SEED_FALLBACK_ERROR, _fallbackTrigger: "exception" };
  }
}

/**
 * Listings variant of fetchMapData. Same shape but issues the listings RPC
 * (066) which additionally drops `summary` on top of slim's four-column
 * trim. Resource.note arrives empty on every row. Safe for /map per the
 * 2026-05-10 audit (MapPageView / MapView render pins / lines / coverage,
 * never note).
 */
export async function fetchListingsMapData(orgId: string | null): Promise<{
  resources: Resource[];
  archived: Resource[];
  changelog: Record<string, ChangeLogEntry[]>;
  disputes: Record<string, Dispute>;
  xrefPairs: [string, string][];
  supersessions: Supersession[];
  _error?: string;
  _fallbackTrigger?: SeedFallbackTrigger;
}> {
  // SF-2 Phase 1 (2026-05-27): empty payload + _error sentinel.
  const emptyFallback = {
    resources: [] as Resource[],
    archived: [] as Resource[],
    changelog: {} as Record<string, ChangeLogEntry[]>,
    disputes: {} as Record<string, Dispute>,
    xrefPairs: [] as [string, string][],
    supersessions: [] as Supersession[],
  };

  if (!isSupabaseConfigured()) {
    return { ...emptyFallback, _error: SEED_FALLBACK_ERROR, _fallbackTrigger: "supabase_not_configured" };
  }
  if (!orgId) {
    return { ...emptyFallback, _error: SEED_FALLBACK_ERROR, _fallbackTrigger: "null_orgId" };
  }

  try {
    const [{ active, archived }, changelog, disputes, xrefPairs, supersessions] = await withTimeout(
      Promise.all([
        fetchWorkspaceResources(orgId, { listings: true }),
        fetchChangelog(),
        fetchDisputes(),
        fetchXrefPairs(),
        fetchSupersessions(),
      ]),
      8000,
      [
        { active: [] as Resource[], archived: [] as Resource[], uuidToUiId: new Map<string, string>() },
        {} as Record<string, ChangeLogEntry[]>,
        {} as Record<string, Dispute>,
        [] as [string, string][],
        [] as Supersession[],
      ] as [
        { active: Resource[]; archived: Resource[]; uuidToUiId: Map<string, string> },
        Record<string, ChangeLogEntry[]>,
        Record<string, Dispute>,
        [string, string][],
        Supersession[],
      ]
    );

    if (!active.length) {
      return { ...emptyFallback, _error: SEED_FALLBACK_ERROR, _fallbackTrigger: "rpc_error" };
    }

    return {
      resources: active,
      archived,
      changelog,
      disputes,
      xrefPairs,
      supersessions,
    };
  } catch (e) {
    console.error("fetchListingsMapData failed, using empty + error sentinel:", e);
    return { ...emptyFallback, _error: SEED_FALLBACK_ERROR, _fallbackTrigger: "exception" };
  }
}

/**
 * Slim variant for the /settings surface: resources + archived +
 * supersessions only. SettingsPage consumes only these (sector picker,
 * archive viewer, supersession history); everything else getAppData
 * returned was dead weight here.
 *
 * Cost: ~3 queries (workspace RPC + supersessions + timelines via the
 * RPC's internal JOIN). Compared to ~14 for fetchDashboardData.
 */
export async function fetchSettingsData(orgId: string | null): Promise<{
  resources: Resource[];
  archived: Resource[];
  supersessions: Supersession[];
  _error?: string;
  _fallbackTrigger?: SeedFallbackTrigger;
}> {
  // SF-2 Phase 1 (2026-05-27): empty payload + _error sentinel.
  const emptyFallback = {
    resources: [] as Resource[],
    archived: [] as Resource[],
    supersessions: [] as Supersession[],
  };

  if (!isSupabaseConfigured()) {
    return { ...emptyFallback, _error: SEED_FALLBACK_ERROR, _fallbackTrigger: "supabase_not_configured" };
  }
  if (!orgId) {
    return { ...emptyFallback, _error: SEED_FALLBACK_ERROR, _fallbackTrigger: "null_orgId" };
  }

  try {
    const [{ active, archived }, supersessions] = await withTimeout(
      Promise.all([
        // Slim RPC — settings reads names/priorities/dates, not full_brief.
        fetchWorkspaceResources(orgId, { slim: true }),
        fetchSupersessions(),
      ]),
      8000,
      [
        { active: [] as Resource[], archived: [] as Resource[], uuidToUiId: new Map<string, string>() },
        [] as Supersession[],
      ] as [
        { active: Resource[]; archived: Resource[]; uuidToUiId: Map<string, string> },
        Supersession[],
      ]
    );

    if (!active.length) {
      return { ...emptyFallback, _error: SEED_FALLBACK_ERROR, _fallbackTrigger: "rpc_error" };
    }

    return { resources: active, archived, supersessions };
  } catch (e) {
    console.error("fetchSettingsData failed, using empty + error sentinel:", e);
    return { ...emptyFallback, _error: SEED_FALLBACK_ERROR, _fallbackTrigger: "exception" };
  }
}

// ── Operations Coverage + Facts Fetch (A6.3) ─────────────────────
/**
 * Sprint 3 A6.3 (2026-05-27). Fetches the per-(region, dimension)
 * coverage state from `region_dimension_coverage` (migration 109) +
 * the actual facts from `regional_data_facts` (migration 106) +
 * region metadata, in a single server-side call.
 *
 * Used by /operations page to render:
 *   - Region accordions with per-dimension fact tables (D2-D6)
 *   - Side-rail "By dimension" badges with state colors
 *   - "Coverage gaps … Flag a coverage request" empty-dim callouts
 *
 * No fallback — empty arrays when nothing is configured.
 */
export interface OperationsRegion {
  id: string;
  code: string;
  label: string;
  severity: string | null;
  displayOrder: number;
}

export interface OperationsCoverageRow {
  region_code: string;
  dimension: string;
  state: "populated" | "partial" | "pending" | "missing";
  fact_count: number;
  notes: string | null;
}

export interface OperationsFact {
  region_code: string;
  dimension: string;
  fact_label: string;
  value: string;
  status: string | null;
  trend: "up" | "down" | "flat" | null;
  source_name: string | null;
  source_url: string | null;
  source_note: string | null;
}

export interface OperationsCoverageData {
  regions: OperationsRegion[];
  coverage: OperationsCoverageRow[];
  facts: OperationsFact[];
}

export async function fetchOperationsCoverage(): Promise<OperationsCoverageData> {
  if (!isSupabaseConfigured()) return { regions: [], coverage: [], facts: [] };
  try {
    const supabase = getServiceSupabase();

    const [regionsRes, coverageRes, factsRes] = await Promise.all([
      supabase
        .from("regions")
        .select("id, code, label, severity, display_order")
        .order("display_order", { ascending: true }),
      supabase
        .from("region_dimension_coverage")
        .select("region_id, dimension, state, fact_count, notes"),
      supabase
        .from("regional_data_facts")
        .select("region_id, dimension, fact_label, value, status, trend, source_note, source:sources(name, url)")
        .order("last_updated", { ascending: false }),
    ]);

    if (regionsRes.error) {
      console.warn("fetchOperationsCoverage regions error:", regionsRes.error.message);
      return { regions: [], coverage: [], facts: [] };
    }

    const regions: OperationsRegion[] = (regionsRes.data || []).map((r: { id: string; code: string; label: string; severity: string | null; display_order: number }) => ({
      id: r.id,
      code: r.code,
      label: r.label,
      severity: r.severity,
      displayOrder: r.display_order,
    }));
    const regionCodeById = new Map(regions.map((r) => [r.id, r.code]));

    const coverage: OperationsCoverageRow[] = (coverageRes.data || []).map((c: { region_id: string; dimension: string; state: string; fact_count: number; notes: string | null }) => ({
      region_code: regionCodeById.get(c.region_id) || "?",
      dimension: c.dimension,
      state: c.state as OperationsCoverageRow["state"],
      fact_count: c.fact_count,
      notes: c.notes,
    }));

    const facts: OperationsFact[] = (factsRes.data || []).map((f: { region_id: string; dimension: string; fact_label: string; value: string; status: string | null; trend: string | null; source_note: string | null; source: { name: string; url: string } | { name: string; url: string }[] | null }) => {
      const src = Array.isArray(f.source) ? f.source[0] : f.source;
      return {
        region_code: regionCodeById.get(f.region_id) || "?",
        dimension: f.dimension,
        fact_label: f.fact_label,
        value: f.value,
        status: f.status,
        trend: ["up", "down", "flat"].includes(f.trend || "") ? (f.trend as OperationsFact["trend"]) : null,
        source_name: src?.name ?? null,
        source_url: src?.url ?? null,
        source_note: f.source_note,
      };
    });

    return { regions, coverage, facts };
  } catch (e) {
    console.warn("fetchOperationsCoverage exception:", e instanceof Error ? e.message : String(e));
    return { regions: [], coverage: [], facts: [] };
  }
}

/** A sourced sub-national cost fact for the Operations By-state sub-list. */
export interface StateCostFactRow {
  stateCode: string;
  factLabel: string;
  value: string;
  unit: string | null;
  trend: string | null;
  statuteCitation: string | null;
  sourceName: string | null;
  effectiveDate: string | null;
}

/**
 * Fetch sourced per-state cost facts (state_cost_facts, migration 152) for the
 * Operations By-state sub-list. Each row carries its own statute citation +
 * registered source — never a national average. Fails soft to [] so the
 * surface renders honest dashes when the table is empty or unreachable.
 */
export async function fetchStateCostFacts(): Promise<StateCostFactRow[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("state_cost_facts")
      .select("state_code, fact_label, value, unit, trend, statute_citation, effective_date, source:sources(name)")
      .order("state_code", { ascending: true });
    if (error) {
      console.warn("fetchStateCostFacts error:", error.message);
      return [];
    }
    return (data || []).map((f: {
      state_code: string;
      fact_label: string;
      value: string;
      unit: string | null;
      trend: string | null;
      statute_citation: string | null;
      effective_date: string | null;
      source: { name: string } | { name: string }[] | null;
    }) => {
      const src = Array.isArray(f.source) ? f.source[0] : f.source;
      return {
        stateCode: f.state_code,
        factLabel: f.fact_label,
        value: f.value,
        unit: f.unit,
        trend: ["up", "down", "flat"].includes(f.trend || "") ? f.trend : null,
        statuteCitation: f.statute_citation,
        sourceName: src?.name ?? null,
        effectiveDate: f.effective_date,
      };
    });
  } catch (e) {
    console.warn("fetchStateCostFacts exception:", e instanceof Error ? e.message : String(e));
    return [];
  }
}

// ── Regulation Sections Fetch (A5.3) ─────────────────────────────
/**
 * Sprint 3 A5.3 (2026-05-27). Fetches the parsed regulation sections
 * for a given intelligence_item from `intelligence_item_sections`
 * (migration 103). Backfilled by A5.2; live writes will follow in
 * a per-regeneration agent persist step (out of A5 scope).
 *
 * Returns rows sorted by `section_order`. Each row carries the raw
 * markdown body in `content_md`; the caller (server component) is
 * responsible for invoking `parseRegulationSection` to derive the
 * structured payload.
 *
 * No fallback. Returns empty array when no rows match (e.g. one of
 * the 2 items in the corpus that didn't parse during A5.2, or items
 * outside the D1 domain that were never backfilled).
 */
export interface IntelligenceItemSectionRow {
  section_key: string;
  section_order: number;
  content_md: string;
  is_conditional: boolean;
  source_ids: string[];
}

// ISR detail-cache (perf/isr-detail-cache): the per-item detail read is wrapped
// in unstable_cache below (fetchIntelligenceItemSections) so burst/repeat
// requests to /regulations/[slug] hit the cache instead of each saturating
// Supabase — the ceiling that produced the detail-route 503. The uncached body
// keeps its original name-suffixed form. Safe to cache: this path uses the
// service-role client (getServiceSupabase, env-driven — no cookies()) and
// returns plain serializable rows.
async function fetchIntelligenceItemSectionsUncached(
  uiId: string
): Promise<IntelligenceItemSectionRow[]> {
  if (!isSupabaseConfigured() || !uiId) return [];
  try {
    const supabase = getServiceSupabase();
    // intelligence_item_sections.item_id is the UUID. Resolve the
    // legacy_id-or-uuid input to a UUID before querying.
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let uuid: string | null = uuidRe.test(uiId) ? uiId : null;
    if (!uuid) {
      const { data: byLegacy } = await supabase
        .from("intelligence_items")
        .select("id")
        .eq("legacy_id", uiId)
        .eq("provenance_status", "verified") // Sprint 4 task 1.10: customer read gate
        .maybeSingle();
      uuid = (byLegacy as { id: string } | null)?.id ?? null;
    }
    if (!uuid) return [];

    const { data, error } = await supabase
      .from("intelligence_item_sections")
      .select("section_key, section_order, content_md, is_conditional, source_ids")
      .eq("item_id", uuid)
      .order("section_order", { ascending: true });
    if (error) {
      console.warn("fetchIntelligenceItemSections error:", error.message);
      return [];
    }
    return (data || []) as IntelligenceItemSectionRow[];
  } catch (e) {
    console.warn(
      "fetchIntelligenceItemSections exception:",
      e instanceof Error ? e.message : String(e)
    );
    return [];
  }
}

/**
 * Cacheable per-item section read. Keyed by the UI-side id so each item gets
 * its own cache entry; tagged `item:{id}` (precise) + `intel-items` (coarse)
 * for tag invalidation, with a 300s revalidate window as a time backstop.
 * Signature + return shape are identical to the prior direct fetcher, so the
 * detail page's call site is unchanged.
 */
export async function fetchIntelligenceItemSections(
  uiId: string
): Promise<IntelligenceItemSectionRow[]> {
  return unstable_cache(
    () => fetchIntelligenceItemSectionsUncached(uiId),
    ["intel-item-sections", uiId],
    { revalidate: 300, tags: [itemTag(uiId), INTEL_ITEMS_TAG] }
  )();
}

// ── Single Item Fetch (for /regulations/[id] detail page) ────────
/**
 * Fetch a single intelligence_item by its UI-side id (legacy_id || uuid).
 * Returns a Resource shaped object plus changelog/disputes/timeline for that
 * item — everything needed to render the regulation-detail page server-side.
 *
 * Returns null (→ 404) when Supabase is not configured or nothing matches.
 * Wave-α A2 (2026-07-11): the seed-data fallback is GONE — unattributed
 * seed content must never render as a live detail page (integrity rule).
 *
 * ISR detail-cache (perf/isr-detail-cache): the uncached body below is wrapped
 * in unstable_cache (see the exported fetchIntelligenceItem) so burst/repeat
 * detail-route requests hit the cache instead of each saturating Supabase — the
 * ceiling behind the /regulations/[slug] 503. Safe to cache: service-role
 * client (env-driven, no cookies()) + plain serializable return (incl. null).
 * The fail-closed service-role read, UUID→slug redirect (in page.tsx), and
 * notFound() behavior are all preserved — only cacheability is added.
 */
async function fetchIntelligenceItemUncached(
  itemUiId: string
): Promise<{
  resource: Resource;
  changelog: ChangeLogEntry[];
  dispute: Dispute | null;
  supersessions: Supersession[];
  connections: ItemConnection[];
  relevanceInput: RelevanceInput;
} | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    // Single-item detail page reads by id OR legacy_id. RLS doesn't grant
    // anon access to direct base-table SELECTs on intelligence_items
    // (only the org-scoped get_workspace_intelligence RPC bypasses RLS),
    // so this path uses the service-role client. Server-only.
    const supabase = getServiceSupabase();
    // intelligence_items.id is uuid — only include the id.eq filter when
    // the input parses as a valid uuid; otherwise PostgREST rejects the OR
    // expression.
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        itemUiId
      );
    const orExpr = isUuid
      ? `legacy_id.eq.${itemUiId},id.eq.${itemUiId}`
      : `legacy_id.eq.${itemUiId}`;
    const { data: row, error } = await supabase
      .from("intelligence_items")
      .select("*, source:sources(name, base_tier, effective_tier)")
      .or(orExpr)
      .eq("provenance_status", "verified") // Sprint 4 task 1.10: customer read gate
      .maybeSingle();

    // Sprint 4 task 1.10 gate: a gated-out (unverified) or missing item is
    // not-found. Fail CLOSED — no fallback content of any kind.
    if (error || !row) return null;

    const resourceId: string = row.legacy_id || row.id;
    const detailSrc = Array.isArray(row.source) ? row.source[0] : row.source;

    // Parallelize the 5 detail-row queries (perf v2 — 2026-05-08).
    // Previously these ran sequentially: timelines → changelog → disputes →
    // xrefs → supersessions. Each query only depends on `row.id` (already
    // resolved above), so they fan out via Promise.all and the wall-clock
    // cost collapses from sum(query_times) to max(query_times). The
    // perf v2 baseline measured /regulations/[slug] server-render at
    // 1750 ms; the dominant cost was these five sequential round-trips
    // plus the missing item_supersessions index (added in migration 049).
    const [
      timelinesResult,
      changesResult,
      disputeResult,
      xrefResult,
      supResult,
    ] = await Promise.all([
      supabase
        .from("item_timelines")
        .select("milestone_date, label, is_completed, sort_order")
        .eq("item_id", row.id)
        .order("sort_order"),
      supabase
        .from("item_changelog")
        .select("change_date, change_type, field, previous_value, new_value, impact")
        .eq("item_id", row.id)
        .order("change_date", { ascending: false }),
      supabase
        .from("item_disputes")
        .select("note, disputing_sources")
        .eq("item_id", row.id)
        .eq("is_active", true)
        .maybeSingle(),
      supabase
        .from("item_cross_references")
        // Widened for flywheel U9 (D1): relationship/origin/basis/score (mig 004/252) + item_type/domain
        // on each embed (so surfaceOf can route a connection's link to ITS OWN surface, not assumed to
        // be the viewer's current one) — same query, no new data path. Previously only selected
        // source_item_id/target_item_id/{source,target}(id, legacy_id) and collapsed to bare id arrays.
        .select(
          "source_item_id, target_item_id, relationship, origin, basis, score, source:intelligence_items!source_item_id(id, legacy_id, item_type, domain), target:intelligence_items!target_item_id(id, legacy_id, item_type, domain)"
        )
        .or(`source_item_id.eq.${row.id},target_item_id.eq.${row.id}`),
      supabase
        .from("item_supersessions")
        .select(
          "supersession_date, severity, note, old:intelligence_items!old_item_id(id, legacy_id), new:intelligence_items!new_item_id(id, legacy_id)"
        )
        .or(`old_item_id.eq.${row.id},new_item_id.eq.${row.id}`),
    ]);

    const timelineRows = timelinesResult.data;
    const changeRows = changesResult.data;
    const disputeRow = disputeResult.data;
    const xrefRows = xrefResult.data;
    const supRows = supResult.data;

    const resource: Resource = {
      id: resourceId,
      cat: row.transport_modes?.[0] || "global",
      sub: row.category || "",
      title: row.title,
      url: row.source_url || "",
      note: row.summary || "",
      type: row.item_type || "uncertain", // honest-inconclusive: an absent item_type is NOT a regulation (line-191 read layer)
      priority: (row.priority || "MODERATE") as Resource["priority"],
      added: row.added_date,
      reasoning: row.reasoning || "",
      tags: row.tags || [],
      whatIsIt: row.what_is_it || "",
      whyMatters: row.why_matters || "",
      keyData: row.key_data || [],
      fullBrief: row.full_brief || undefined,
      domain: row.domain || 1,
      timeline: (timelineRows || []).map((t: any) => ({
        date: t.milestone_date,
        label: t.label,
        status: t.is_completed ? ("past" as const) : undefined,
      })),
      modes: row.transport_modes || [],
      topic: row.category || undefined,
      jurisdiction: row.jurisdictions?.[0] || undefined,
      jurisdictionIso: Array.isArray(row.jurisdiction_iso)
        ? row.jurisdiction_iso
        : undefined,
      sourceId: row.source_id || undefined,
      isArchived: row.is_archived || false,
      // P1-2 (DEEP-AUDIT S2): populate the provenance chip (source name + tier)
      // via the sources FK embed above. Customer surfaces show effective_tier
      // (the dynamic signal), falling back to base_tier.
      sourceName: detailSrc?.name ?? undefined,
      sourceTier: (detailSrc?.effective_tier ?? detailSrc?.base_tier) ?? undefined,
      // P1-3 (DEEP-AUDIT §4): map the classified columns the DB actually has so
      // the detail page stops regex-guessing and disagreeing with the index.
      // select("*") already returns all of these.
      severity: row.severity || undefined,
      signalBand: row.signal_band || undefined,
      theme: row.theme || undefined,
      trajectoryPoints: row.trajectory_points || undefined,
      conversionTrigger: row.conversion_trigger || undefined,
      whatItChanges: row.what_it_changes || undefined,
      doesNotResolve: row.does_not_resolve || undefined,
      complianceDeadline: row.compliance_deadline || undefined,
      // P1-4 (DEEP-AUDIT §2): penalty_range / enforcement_body / legal_instrument
      // are NOT in the schema (no migration ever added them) — those reads were
      // always undefined. Removed; re-add via migration if the fields are wanted.
      // Agent integrity self-flag (migration 035). Only surfaced when the
      // flag is true AND unresolved — the banner check uses both fields.
      agentIntegrityFlag:
        row.agent_integrity_flag === true && !row.agent_integrity_resolved_at,
      agentIntegrityPhrase: row.agent_integrity_phrase || null,
      agentIntegrityFlaggedAt: row.agent_integrity_flagged_at || null,
    };

    // Changelog for this item (data fetched in the Promise.all above)
    const changelog: ChangeLogEntry[] = (changeRows || []).map((c: any) => ({
      id: resourceId,
      date: c.change_date,
      type: c.change_type,
      fields: c.field ? [c.field] : undefined,
      prev: c.previous_value || undefined,
      now: c.new_value || undefined,
      impact: c.impact || undefined,
    }));

    // Active dispute for this item (fetched in the Promise.all above)
    let dispute: Dispute | null = null;
    if (disputeRow) {
      const sources = Array.isArray(disputeRow.disputing_sources)
        ? disputeRow.disputing_sources
        : typeof disputeRow.disputing_sources === "string"
          ? JSON.parse(disputeRow.disputing_sources)
          : [];
      dispute = {
        resource: resourceId,
        note: disputeRow.note,
        sources: sources.map((s: any) =>
          typeof s === "string" ? { name: s, url: "" } : s
        ),
      };
    }

    // Cross-references (fetched in the Promise.all above) — single query
    // covering both directions via OR. PostgREST's .or() handles the
    // union in one round-trip. Flywheel U9 (D1): carries relationship/origin/basis/score/surface through
    // as structured ItemConnection rows (previously collapsed to bare id arrays) — see
    // connection-view-model.mjs (buildAllConnectionRows) for how the connections card consumes these.
    const connections: ItemConnection[] = [];
    for (const r of (xrefRows || []) as Array<{
      source_item_id: string;
      target_item_id: string;
      relationship: string | null;
      origin: string | null;
      basis: Array<{ signal: string; detail: string; weight: number }> | null;
      score: number | null;
      source: EmbeddedItemWithSurface | EmbeddedItemWithSurface[] | null;
      target: EmbeddedItemWithSurface | EmbeddedItemWithSurface[] | null;
    }>) {
      const isOutgoing = r.source_item_id === row.id;
      const other = isOutgoing ? r.target : r.source;
      const otherId = uiId(other);
      if (!otherId) continue;
      connections.push({
        id: otherId,
        direction: isOutgoing ? "outgoing" : "incoming",
        relationship: r.relationship || "related",
        origin: r.origin || "manual",
        basis: r.basis ?? null,
        score: typeof r.score === "number" ? r.score : null,
        surface: embeddedSurface(other),
      });
    }

    // Supersessions involving this item (fetched in the Promise.all above).
    // Note: prior to perf v2 (migration 049, 2026-05-08) this query did a
    // sequential scan on item_supersessions because no index existed on
    // old_item_id or new_item_id. Migration 049 adds those indexes; the
    // .or() here resolves index-driven once 049 is applied.
    const supersessions: Supersession[] = (supRows || [])
      .map((r: any) => {
        const oldId = uiId(r.old);
        const newId = uiId(r.new);
        if (!oldId || !newId) return null;
        return {
          old: oldId,
          new: newId,
          date: r.supersession_date,
          severity: r.severity as "major" | "minor" | "replacement",
          note: r.note || "",
        };
      })
      .filter(Boolean) as Supersession[];

    // relevanceInput (flywheel U9, D1): the raw tag columns relevanceForItem reads, straight off `row`
    // (item-level facts, safe to cache alongside everything else here). Deliberately NOT the computed
    // relevance itself — that's viewer-specific (per-org) and must be computed per-request, outside this
    // cached fetcher (see viewer-relevance.ts's header for why baking it in here would leak across orgs).
    const relevanceInput: RelevanceInput = {
      title: row.title ?? null,
      transport_modes: row.transport_modes ?? null,
      jurisdictions: row.jurisdictions ?? null,
      jurisdiction_iso: row.jurisdiction_iso ?? null,
      topic_tags: row.topic_tags ?? null,
      operational_scenario_tags: row.operational_scenario_tags ?? null,
      compliance_object_tags: row.compliance_object_tags ?? null,
    };

    return { resource, changelog, dispute, supersessions, connections, relevanceInput };
  } catch (e) {
    // Sprint 4 task 1.10 gate: on DB error, fail CLOSED rather than serve
    // ungated legacy SEED content for what may be an unverified item.
    console.error("fetchIntelligenceItem failed (failing closed, not serving seed):", e);
    return null;
  }
}

/**
 * Cacheable single-item detail read. Keyed by the UI-side id so each item gets
 * its own cache entry; tagged `item:{id}` (precise) + `intel-items` (coarse)
 * for tag invalidation, with a 300s revalidate window as a time backstop.
 * Signature + return shape are identical to the prior direct fetcher, so the
 * detail page's call site is unchanged. A null (not-found) result is cached
 * too; the generation pipeline flushes `intel-items` when an item is (re)built,
 * so a freshly-verified item's cached null is dropped promptly.
 */
export async function fetchIntelligenceItem(
  itemUiId: string
): Promise<{
  resource: Resource;
  changelog: ChangeLogEntry[];
  dispute: Dispute | null;
  supersessions: Supersession[];
  connections: ItemConnection[];
  relevanceInput: RelevanceInput;
} | null> {
  return unstable_cache(
    () => fetchIntelligenceItemUncached(itemUiId),
    ["intel-item-detail", itemUiId],
    { revalidate: 300, tags: [itemTag(itemUiId), INTEL_ITEMS_TAG] }
  )();
}

// ── Phase 3 dashboard sidebar fetchers (Wave 1 / Track 5) ────────
//
// Each fetcher is wrapped in try/catch and returns an empty array on any
// failure. This includes the "table does not exist yet" case — migrations
// 060 (user_watchlist) and 061 (coverage_gaps) ship in this PR but the
// production database may apply them after master deploys to Vercel.
// Empty arrays trigger the widget empty-state copy, keeping the dashboard
// safe to render before migrations have applied.

/**
 * The five kinds of item that can be watched.
 *
 * Mirrors the item_type CHECK on BOTH watchlist tables: user_watchlist
 * (migration 060, widened by 233) and org_watchlist (077, constrained to the
 * same five by 236). Exported as one union so the writer, the reader and the
 * button cannot drift apart again — Landing B widened the DB CHECK and
 * WatchButton to five values but left this type at three, which silently
 * labelled every watched research finding a "Signal" and linked it to
 * /market#id. Both tables were empty, so no user ever saw it.
 */
export type WatchlistItemType =
  | "source"
  | "reg"
  | "signal"
  | "research"
  | "operations";

/**
 * Which list a watch lives on. Personal watches (user_watchlist) are visible
 * only to their owner; team watches (org_watchlist) are visible to every
 * member of the org. Per migration 077's shipped ruling, any member may add or
 * remove a team watch — unlike team archive, watching is additive, so there is
 * no role gate.
 */
export type WatchlistScope = "personal" | "team";

export interface WatchlistItem {
  id: string;
  type: WatchlistItemType;
  title: string;
  source: string;
  jurisdiction?: string;
  lastChangedAt: string;
  /** Which list this row came from. Both scopes merge into one rail. */
  scope: WatchlistScope;
  /** Team scope only: the rationale the adder left for the rest of the org. */
  note?: string;
  /** Team scope only: display name of the member who added it, when resolvable. */
  addedBy?: string;
}

export interface CoverageGap {
  id: string;
  title: string;
  jurisdiction: string | null;
  sectorAffinity: string[];
  severity: "high" | "medium" | "low";
  description: string;
  suggestedAction: { label: string; href: string };
}

export interface ReviewItem {
  id: string;
  type: "provisional" | "integrity" | "spotcheck";
  title: string;
  daysWaiting: number;
  href: string;
}

/** Hard cap per scope so the rail renders predictably. This is the RAIL's
 *  bound, not the corpus bound: the dashboard ships the whole array to the
 *  browser and slices three, so raising it here would grow every dashboard
 *  payload for rows nobody renders. The dedicated /watchlist page passes
 *  WATCHLIST_PAGE_LIMIT instead. */
const WATCHLIST_LIMIT = 14;

/** Cap for the full /watchlist surface, per scope. High enough that a real
 *  user never hits it, low enough that a pathological row count cannot turn
 *  one page render into an unbounded read. A user who exceeds it is told so
 *  by the surface rather than silently shown a truncated list. */
export const WATCHLIST_PAGE_LIMIT = 250;

/**
 * item_types that resolve their title against intelligence_items by
 * legacy_id || uuid. reg / research / operations are three SURFACES over one
 * table, so they share a single title lookup and differ only in the label and
 * href the rail renders.
 */
const ITEM_BACKED_TYPES: ReadonlySet<string> = new Set([
  "reg",
  "research",
  "operations",
]);

const WATCHLIST_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface WatchRow {
  item_type: WatchlistItemType;
  item_id: string;
  created_at: string;
  scope: WatchlistScope;
  note: string | null;
  addedByUserId: string | null;
}

type WatchlistSupabase = ReturnType<typeof getServiceSupabase>;

async function readPersonalWatchRows(
  supabase: WatchlistSupabase,
  userId: string,
  limit: number
): Promise<WatchRow[]> {
  const { data, error } = await supabase
    .from("user_watchlist")
    .select("item_type, item_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as Array<{
    item_type: WatchlistItemType;
    item_id: string;
    created_at: string;
  }>).map((r) => ({
    item_type: r.item_type,
    item_id: r.item_id,
    created_at: r.created_at,
    scope: "personal" as const,
    note: null,
    addedByUserId: null,
  }));
}

/**
 * The caller's stored drag order for the watchlist rail, as a rank map.
 *
 * RANKS, NOT POSITIONS. `position` is numeric and postgrest-js hands it back
 * as a string to preserve exactness; parsing it into a JS number in order to
 * sort would round a deeply split midpoint through an IEEE-754 double, which
 * is precisely the defect migration 238 moved the arithmetic into the database
 * to avoid. Postgres has already ordered the rows, so the array index IS the
 * order and no arithmetic happens on this side at all.
 */
async function readListOrderRanks(
  supabase: WatchlistSupabase,
  userId: string
): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from("user_list_order")
    .select("item_id")
    .eq("user_id", userId)
    .eq("list_key", WATCHLIST_LIST_KEY)
    .order("position", { ascending: true });
  // Degrade to the natural order rather than losing the rail. A personal
  // ordering that fails to load costs the user their arrangement; a thrown
  // read would cost them the whole watchlist. The error is logged rather than
  // dropped (see the agent/run error-swallow post-mortem in CLAUDE.md).
  if (error) {
    console.warn("readListOrderRanks failed, using natural order:", error.message);
    return new Map();
  }
  const ranks = new Map<string, number>();
  (data as Array<{ item_id: string }> | null)?.forEach((r, i) => {
    ranks.set(r.item_id, i);
  });
  return ranks;
}

async function readTeamWatchRows(
  supabase: WatchlistSupabase,
  orgId: string,
  limit: number
): Promise<WatchRow[]> {
  const { data, error } = await supabase
    .from("org_watchlist")
    .select("item_type, item_id, created_at, note, added_by_user_id")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as Array<{
    item_type: WatchlistItemType;
    item_id: string;
    created_at: string;
    note: string | null;
    added_by_user_id: string | null;
  }>).map((r) => ({
    item_type: r.item_type,
    item_id: r.item_id,
    created_at: r.created_at,
    scope: "team" as const,
    note: r.note,
    addedByUserId: r.added_by_user_id,
  }));
}

/**
 * Fetch the watchlist rail for one user: their personal watches merged with
 * their org's team watches.
 *
 * Returns [] when the user is unauthenticated, when no rows match, or when a
 * watchlist table does not exist yet. Passing a null orgId (no membership)
 * simply yields the personal scope alone. Hard-capped per scope.
 *
 * `limit` is per scope and defaults to the rail's bound. The full /watchlist
 * surface passes WATCHLIST_PAGE_LIMIT. It is a PARAMETER rather than a raised
 * constant because the two callers have opposite pressures: the dashboard
 * serialises the whole array into the client payload to render three rows, so
 * every row past the rail's need is pure weight on the page most users load
 * first; the page renders all of them and a low cap would silently hide
 * watches.
 */
export async function fetchWatchlist(
  userId: string | null,
  orgId: string | null = null,
  limit: number = WATCHLIST_LIMIT
): Promise<WatchlistItem[]> {
  if (!isSupabaseConfigured() || !userId) return [];
  try {
    const supabase = getServiceSupabase();

    const [personalRows, teamRows, orderRanks] = await Promise.all([
      readPersonalWatchRows(supabase, userId, limit),
      orgId
        ? readTeamWatchRows(supabase, orgId, limit)
        : Promise.resolve([] as WatchRow[]),
      // Third read, not a follow-up: the order is independent of the rows, so
      // serialising it would add a round trip to every dashboard render.
      readListOrderRanks(supabase, userId),
    ]);

    // One rail, both scopes, newest first. An item watched personally AND by
    // the team appears once: the personal row wins, because that row is this
    // user's own act and removing it is the action the button offers them.
    const seen = new Set<string>();
    const rows = [...personalRows, ...teamRows]
      .filter((r) => {
        const key = watchlistOrderKey(r.item_type, r.item_id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));

    // The caller's own arrangement outranks recency for every row they have
    // actually placed. The unplaced-first rule and the reason for it live in
    // compareRanks, shared with the browser hook so the SSR order and an
    // optimistic client order can never disagree.
    if (orderRanks.size > 0) {
      rows.sort((a, b) =>
        compareRanks(
          orderRanks.get(watchlistOrderKey(a.item_type, a.item_id)),
          orderRanks.get(watchlistOrderKey(b.item_type, b.item_id))
        )
      );
    }

    if (rows.length === 0) return [];

    // Titles for the intelligence_items-backed rows (reg / research /
    // operations), resolved by legacy_id || uuid in a single pass.
    const itemIds = Array.from(
      new Set(
        rows.filter((r) => ITEM_BACKED_TYPES.has(r.item_type)).map((r) => r.item_id)
      )
    );
    const itemMeta = new Map<string, { title: string; jurisdiction: string | null }>();
    if (itemIds.length > 0) {
      // Two encoded .in() lookups rather than one interpolated .or(). The
      // previous form spliced caller-supplied item_id text straight into a
      // PostgREST filter expression, so an id carrying a comma or a paren
      // could rewrite the filter. .in() encodes its values, and splitting by
      // id shape also keeps non-uuid text away from the uuid column, which
      // would otherwise raise 22P02.
      const uuidIds = itemIds.filter((id) => WATCHLIST_UUID_RE.test(id));
      const legacyIds = itemIds.filter((id) => !WATCHLIST_UUID_RE.test(id));
      const columns = "id, legacy_id, title, jurisdictions";
      // PostgrestFilterBuilder is thenable but not a Promise, so PromiseLike.
      const lookups: Array<PromiseLike<{ data: unknown }>> = [];
      if (legacyIds.length > 0) {
        lookups.push(
          supabase
            .from("intelligence_items")
            .select(columns)
            .eq("provenance_status", "verified") // Sprint 4 task 1.10: customer read gate
            .in("legacy_id", legacyIds)
        );
      }
      if (uuidIds.length > 0) {
        lookups.push(
          supabase
            .from("intelligence_items")
            .select(columns)
            .eq("provenance_status", "verified")
            .in("id", uuidIds)
        );
      }
      const responses = await Promise.all(lookups);
      for (const resp of responses) {
        for (const it of ((resp.data || []) as Array<{
          id: string;
          legacy_id: string | null;
          title: string;
          jurisdictions: string[] | null;
        }>)) {
          const meta = {
            title: it.title,
            jurisdiction: it.jurisdictions?.[0] || null,
          };
          // Register under BOTH keys: a row may have been watched by either id.
          if (it.legacy_id) itemMeta.set(it.legacy_id, meta);
          itemMeta.set(it.id, meta);
        }
      }
    }

    const sourceIds = rows
      .filter((r) => r.item_type === "source")
      .map((r) => r.item_id);
    const sourceLabels = new Map<string, { name: string; jurisdiction: string | null }>();
    if (sourceIds.length > 0) {
      const { data: srcs } = await supabase
        .from("sources")
        .select("id, name, jurisdictions")
        .in("id", sourceIds);
      for (const s of (srcs || []) as Array<{
        id: string;
        name: string;
        jurisdictions: string[] | null;
      }>) {
        sourceLabels.set(s.id, {
          name: s.name,
          jurisdiction: s.jurisdictions?.[0] || null,
        });
      }
    }

    // Attribution for team rows. A departed member (added_by_user_id nulled by
    // ON DELETE SET NULL) simply renders without a name rather than blocking.
    const adderIds = Array.from(
      new Set(
        rows
          .map((r) => r.addedByUserId)
          .filter((id): id is string => typeof id === "string" && id.length > 0)
      )
    );
    const adderNames = new Map<string, string>();
    if (adderIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", adderIds);
      for (const p of (profiles || []) as Array<{ id: string; full_name: string | null }>) {
        if (p.full_name) adderNames.set(p.id, p.full_name);
      }
    }

    const SOURCE_FALLBACK: Record<WatchlistItemType, string> = {
      reg: "REG",
      research: "RESEARCH",
      operations: "OPERATIONS",
      source: "SOURCE",
      signal: "SIGNAL",
    };

    return rows.map((r): WatchlistItem => {
      const common = {
        id: r.item_id,
        lastChangedAt: r.created_at,
        scope: r.scope,
        ...(r.note ? { note: r.note } : {}),
        ...(r.addedByUserId && adderNames.has(r.addedByUserId)
          ? { addedBy: adderNames.get(r.addedByUserId) as string }
          : {}),
      };

      if (ITEM_BACKED_TYPES.has(r.item_type)) {
        const meta = itemMeta.get(r.item_id);
        return {
          ...common,
          type: r.item_type,
          title: meta?.title || r.item_id,
          source: meta?.jurisdiction || SOURCE_FALLBACK[r.item_type],
          ...(meta?.jurisdiction ? { jurisdiction: meta.jurisdiction } : {}),
        };
      }

      if (r.item_type === "source") {
        const meta = sourceLabels.get(r.item_id);
        return {
          ...common,
          type: "source",
          title: meta?.name || r.item_id,
          source: meta?.name || SOURCE_FALLBACK.source,
          ...(meta?.jurisdiction ? { jurisdiction: meta.jurisdiction } : {}),
        };
      }

      return {
        ...common,
        type: "signal",
        title: r.item_id,
        source: SOURCE_FALLBACK.signal,
      };
    });
  } catch (e) {
    console.error("fetchWatchlist failed, returning empty:", e);
    return [];
  }
}

/**
 * Fetch coverage gaps relevant to the workspace's active sectors.
 *
 * v1 reads the hand-curated coverage_gaps table (migration 061). When the
 * table does not yet exist (migration not applied) the catch path returns
 * []. Filter by overlap of `sector_affinity` and the workspace's active
 * sectors when sectors are known; otherwise return all gaps. Sorted high
 * then medium then low; capped at 2 to match the spec.
 */
export async function fetchCoverageGaps(
  activeSectors: string[]
): Promise<CoverageGap[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = getServiceSupabase();
    let query = supabase
      .from("coverage_gaps")
      .select(
        "id, title, jurisdiction, sector_affinity, severity, description, suggested_action_label, suggested_action_href"
      );
    if (activeSectors.length > 0) {
      query = query.overlaps("sector_affinity", activeSectors);
    }
    const { data, error } = await query;
    if (error || !data) return [];

    const order = { high: 0, medium: 1, low: 2 } as const;
    type Row = {
      id: string;
      title: string;
      jurisdiction: string | null;
      sector_affinity: string[] | null;
      severity: "high" | "medium" | "low";
      description: string;
      suggested_action_label: string;
      suggested_action_href: string;
    };
    const rows = (data as Row[]).slice().sort(
      (a, b) => order[a.severity] - order[b.severity]
    );

    return rows.slice(0, 2).map((r) => ({
      id: r.id,
      title: r.title,
      jurisdiction: r.jurisdiction,
      sectorAffinity: r.sector_affinity || [],
      severity: r.severity,
      description: r.description,
      suggestedAction: {
        label: r.suggested_action_label,
        href: r.suggested_action_href,
      },
    }));
  } catch (e) {
    console.error("fetchCoverageGaps failed, returning empty:", e);
    return [];
  }
}

/**
 * Fetch the top oldest items waiting for admin review across three
 * heterogeneous sources: provisional sources pending review, unresolved
 * integrity flags, and staged updates that have been auto-approved
 * pending spot-check.
 *
 * Returns [] for non-admin callers (the widget hides itself in that case).
 * Capped at 3 entries, sorted oldest-first by daysWaiting.
 *
 * Wrapped in try/catch so a missing column / table on any of the three
 * subqueries degrades to an empty list rather than crashing the dashboard.
 */
export async function fetchAwaitingReview(
  userId: string | null
): Promise<ReviewItem[]> {
  if (!isSupabaseConfigured() || !userId) return [];
  try {
    const supabase = getServiceSupabase();
    const admin = await isPlatformAdminInline(userId, supabase);
    if (!admin) return [];

    const now = Date.now();
    const daysSince = (iso: string): number => {
      const d = new Date(iso).getTime();
      if (Number.isNaN(d)) return 0;
      return Math.max(0, Math.round((now - d) / 86400000));
    };

    const [provResult, integrityResult, stagedResult] = await Promise.all([
      supabase
        .from("provisional_sources")
        .select("id, name, created_at")
        .eq("status", "pending_review")
        .order("created_at", { ascending: true })
        .limit(10),
      supabase
        .from("integrity_flags")
        .select("id, description, created_at")
        .in("status", ["open", "in_review"])
        .order("created_at", { ascending: true })
        .limit(10),
      supabase
        .from("staged_updates")
        .select("id, reason, created_at, update_type")
        .eq("status", "approved")
        .order("created_at", { ascending: true })
        .limit(10),
    ]);

    type ProvRow = { id: string; name: string; created_at: string };
    type IntegRow = { id: string; description: string; created_at: string };
    type StagedRow = {
      id: string;
      reason: string;
      created_at: string;
      update_type: string;
    };

    const items: ReviewItem[] = [];

    for (const p of (provResult.data || []) as ProvRow[]) {
      items.push({
        id: p.id,
        type: "provisional",
        title: p.name || "Provisional source",
        daysWaiting: daysSince(p.created_at),
        href: `/admin?tab=provisional&id=${p.id}`,
      });
    }
    for (const f of (integrityResult.data || []) as IntegRow[]) {
      items.push({
        id: f.id,
        type: "integrity",
        title: f.description?.slice(0, 120) || "Integrity flag",
        daysWaiting: daysSince(f.created_at),
        href: `/admin?tab=integrity&id=${f.id}`,
      });
    }
    for (const s of (stagedResult.data || []) as StagedRow[]) {
      items.push({
        id: s.id,
        type: "spotcheck",
        title: s.reason?.slice(0, 120) || `Spot-check ${s.update_type}`,
        daysWaiting: daysSince(s.created_at),
        href: `/admin?tab=staged&id=${s.id}`,
      });
    }

    items.sort((a, b) => b.daysWaiting - a.daysWaiting);
    return items.slice(0, 3);
  } catch (e) {
    console.error("fetchAwaitingReview failed, returning empty:", e);
    return [];
  }
}

// Inline platform-admin check (avoids importing from src/lib/auth/admin.ts
// to keep this module self-contained; mirrors that helper exactly).
// Updated 2026-05-18 (Sprint 2 Build 6 / OBS-17) to read
// profiles.is_platform_admin instead of org_memberships.role; was conflating
// workspace-membership role with the platform-layer staff flag.
async function isPlatformAdminInline(
  userId: string,
  supabase: ReturnType<typeof getServiceSupabase>
): Promise<boolean> {
  if (!userId) return false;
  const { data, error } = await supabase
    .from("profiles")
    .select("is_platform_admin")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return false;
  return data.is_platform_admin === true;
}
