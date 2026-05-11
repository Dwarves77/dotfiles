import { createClient } from "@supabase/supabase-js";
import type { Resource, ChangeLogEntry, Dispute, Supersession } from "@/types/resource";
import type { Source, ProvisionalSource, SourceConflict, TrustMetrics, TrustScore } from "@/types/source";
import { computeBaselineTrustScore, createDefaultTrustMetrics } from "@/lib/trust";

// Static seed data fallback
import {
  resources as seedResources,
  archived as seedArchived,
  changelog as seedChangelog,
  disputes as seedDisputes,
  xrefPairs as seedXrefPairs,
  supersessions as seedSupersessions,
  AUDIT_DATE as seedAuditDate,
} from "@/data";

// ── Helpers ──────────────────────────────────────────────────

function isSupabaseConfigured(): boolean {
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
function getServiceSupabase() {
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false },
  });
}

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
  const { data: rows } = await supabase
    .from("item_supersessions")
    .select("supersession_date, severity, note, old:intelligence_items!old_item_id(id, legacy_id), new:intelligence_items!new_item_id(id, legacy_id)")
    .order("supersession_date", { ascending: false })
    .limit(500);

  const out: Supersession[] = [];
  for (const row of rows || []) {
    const oldId = uiId(row.old);
    const newId = uiId(row.new);
    if (!oldId || !newId) continue;
    out.push({
      old: oldId,
      new: newId,
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
    tier: row.tier,
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
  "tier",
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
    .order("tier", { ascending: true });
  if (!includeAdminOnly) {
    // Workspace-facing default — hide admin_only sources from regular users.
    // The admin dashboard fetches the unfiltered list via /api/admin/sources/all.
    query = query.eq("admin_only", false);
  }
  const { data: rows } = await query;
  return (rows || []).map(mapSourceRow);
}

async function fetchProvisionalSources(): Promise<ProvisionalSource[]> {
  const supabase = getSupabase();
  const { data: rows } = await supabase
    .from("provisional_sources")
    .select("*")
    .in("status", ["pending_review", "needs_more_data"])
    .order("independent_citers", { ascending: false });

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

async function fetchOpenConflicts(): Promise<SourceConflict[]> {
  const supabase = getSupabase();
  const { data: rows } = await supabase
    .from("source_conflicts")
    .select("*")
    .eq("status", "open")
    .order("opened_at", { ascending: false });

  return (rows || []).map((row: any) => ({
    id: row.id,
    item_id: row.item_id,
    source_a_id: row.source_a_id,
    source_b_id: row.source_b_id,
    source_a_tier: row.source_a_tier,
    source_b_tier: row.source_b_tier,
    source_a_claim: row.source_a_claim,
    source_b_claim: row.source_b_claim,
    field_in_dispute: row.field_in_dispute,
    status: row.status,
    resolution: row.resolution || undefined,
    resolution_note: row.resolution_note || undefined,
    resolved_by_source_id: row.resolved_by_source_id || undefined,
    resolved_by_human: row.resolved_by_human || undefined,
    opened_at: row.opened_at,
    resolved_at: row.resolved_at || undefined,
  }));
}

export interface SourceData {
  sources: Source[];
  provisionalSources: ProvisionalSource[];
  openConflicts: SourceConflict[];
}

export async function fetchSourceData(includeAdminOnly = false): Promise<SourceData> {
  const emptySourceData: SourceData = { sources: [], provisionalSources: [], openConflicts: [] };

  if (!isSupabaseConfigured()) {
    return emptySourceData;
  }

  try {
    const [sources, provisionalSources, openConflicts] = await withTimeout(
      Promise.all([fetchSources(includeAdminOnly), fetchProvisionalSources(), fetchOpenConflicts()]),
      8000,
      [[], [], []] as [Source[], ProvisionalSource[], SourceConflict[]]
    );
    return { sources, provisionalSources, openConflicts };
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
  const { data: items, error } = await supabase.rpc(rpcName, { p_org_id: orgId });

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
  const { data: timelineRows } = await supabase
    .from("item_timelines")
    .select("item_id, milestone_date, label, is_completed, sort_order")
    .in("item_id", itemUuids)
    .order("sort_order");

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
      type: row.item_type || "regulation",
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
    const supabase = getSupabase();
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
    const supabase = getSupabase();
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
  addedDate: string | null;
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
      .eq("is_archived", false);
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
        "id, legacy_id, title, summary, pipeline_stage, transport_modes, jurisdictions, added_date, source:sources(name, url)"
      )
      .eq("is_archived", false)
      .order("added_date", { ascending: false })
      .limit(cap);

    if (error || !data) {
      if (error) console.error("[research] fetchResearchPipelineRows error:", error);
      return { rows: [], total, cap };
    }

    const rows: ResearchPipelineRow[] = data.map((row: any) => {
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
        addedDate: row.added_date ?? null,
      };
    });

    return { rows, total, cap };
  } catch (e) {
    console.error("fetchResearchPipelineRows failed, returning empty:", e);
    return { rows: [], total: 0, cap };
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
}

export interface DashboardData {
  resources: Resource[];
  archived: Resource[];
  changelog: Record<string, ChangeLogEntry[]>;
  disputes: Record<string, Dispute>;
  xrefPairs: [string, string][];
  supersessions: Supersession[];
  auditDate: string;
  synopses: SectorSynopsis[];
  intelligenceChanges: IntelligenceChange[];
  sectorDisplayNames: SectorDisplayName[];
  overrides: WorkspaceOverrideRow[];
}

// Timeout wrapper — prevents Supabase from hanging indefinitely on Vercel
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export async function fetchDashboardData(orgId: string | null): Promise<DashboardData> {
  const seedFallback: DashboardData = {
    resources: seedResources,
    archived: seedArchived,
    changelog: seedChangelog,
    disputes: seedDisputes,
    xrefPairs: seedXrefPairs,
    supersessions: seedSupersessions,
    auditDate: seedAuditDate,
    synopses: [],
    intelligenceChanges: [],
    sectorDisplayNames: [],
    overrides: [],
  };

  if (!isSupabaseConfigured()) {
    return seedFallback;
  }

  // Anonymous request — no org resolved from auth context. Return the
  // public/seed view (no workspace overrides). Once auth is enforced
  // (Phase A.4), this branch is only reachable for misconfiguration.
  if (!orgId) {
    return seedFallback;
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
      [
        { active: seedResources, archived: seedArchived, uuidToUiId: new Map<string, string>() },
        seedChangelog,
        seedDisputes,
        seedXrefPairs,
        seedSupersessions,
      ] as [
        { active: typeof seedResources; archived: typeof seedArchived; uuidToUiId: Map<string, string> },
        typeof seedChangelog,
        typeof seedDisputes,
        typeof seedXrefPairs,
        typeof seedSupersessions,
      ]
    );

    // If Supabase returned empty, use seed data
    if (!resources.length) {
      return seedFallback;
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

    const [changesResult, sectorsResult, overridesResult] = await Promise.all([
      supabase
        .from("intelligence_changes")
        .select("item_id, change_type, change_severity, change_summary")
        .order("detected_at", { ascending: false })
        .limit(100),
      supabase
        .from("sector_contexts")
        .select("sector, display_name"),
      supabase
        .from("workspace_item_overrides")
        .select("item_id, priority_override, is_archived, archive_reason, archive_note, notes")
        .eq("org_id", orgId),
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

    // Map workspace_item_overrides UUID item_id → UI-side id (legacy_id || uuid)
    const overrides: WorkspaceOverrideRow[] = (overridesResult.data || []).map((o: any) => ({
      itemId: uuidToUiId.get(o.item_id) || o.item_id,
      priorityOverride: o.priority_override ?? null,
      isArchived: !!o.is_archived,
      archiveReason: o.archive_reason ?? null,
      archiveNote: o.archive_note ?? null,
      notes: o.notes ?? "",
    }));

    return {
      resources,
      archived,
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
    console.error("fetchDashboardData failed, using seed fallback:", e);
    return seedFallback;
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
}> {
  const seedFallback = {
    resources: seedResources,
    archived: seedArchived,
    overrides: [] as WorkspaceOverrideRow[],
  };

  if (!isSupabaseConfigured() || !orgId) return seedFallback;

  try {
    // Slim RPC — drops full_brief/operational_impact/open_questions/reasoning
    // from the wire. None are rendered by /regulations, /operations, /market.
    const { active, archived, uuidToUiId } = await fetchWorkspaceResources(orgId, { slim: true });
    if (!active.length) return seedFallback;

    const supabase = getSupabase();
    const { data: overridesData } = await supabase
      .from("workspace_item_overrides")
      .select("item_id, priority_override, is_archived, archive_reason, archive_note, notes")
      .eq("org_id", orgId);

    const overrides: WorkspaceOverrideRow[] = (overridesData || []).map((o: any) => ({
      itemId: uuidToUiId.get(o.item_id) || o.item_id,
      priorityOverride: o.priority_override ?? null,
      isArchived: !!o.is_archived,
      archiveReason: o.archive_reason ?? null,
      archiveNote: o.archive_note ?? null,
      notes: o.notes ?? "",
    }));

    return { resources: active, archived, overrides };
  } catch (e) {
    console.error("fetchResourcesOnly failed, using seed fallback:", e);
    return seedFallback;
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
}> {
  const seedFallback = {
    resources: seedResources,
    archived: seedArchived,
    changelog: seedChangelog,
    disputes: seedDisputes,
    xrefPairs: seedXrefPairs,
    supersessions: seedSupersessions,
  };

  if (!isSupabaseConfigured() || !orgId) return seedFallback;

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
        { active: seedResources, archived: seedArchived, uuidToUiId: new Map<string, string>() },
        seedChangelog,
        seedDisputes,
        seedXrefPairs,
        seedSupersessions,
      ] as [
        { active: typeof seedResources; archived: typeof seedArchived; uuidToUiId: Map<string, string> },
        typeof seedChangelog,
        typeof seedDisputes,
        typeof seedXrefPairs,
        typeof seedSupersessions,
      ]
    );

    if (!active.length) return seedFallback;

    return {
      resources: active,
      archived,
      changelog,
      disputes,
      xrefPairs,
      supersessions,
    };
  } catch (e) {
    console.error("fetchMapData failed, using seed fallback:", e);
    return seedFallback;
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
}> {
  const seedFallback = {
    resources: seedResources,
    archived: seedArchived,
    overrides: [] as WorkspaceOverrideRow[],
  };

  if (!isSupabaseConfigured() || !orgId) return seedFallback;

  try {
    const { active, archived, uuidToUiId } = await fetchWorkspaceResources(orgId, { listings: true });
    if (!active.length) return seedFallback;

    const supabase = getSupabase();
    const { data: overridesData } = await supabase
      .from("workspace_item_overrides")
      .select("item_id, priority_override, is_archived, archive_reason, archive_note, notes")
      .eq("org_id", orgId);

    const overrides: WorkspaceOverrideRow[] = (overridesData || []).map((o: any) => ({
      itemId: uuidToUiId.get(o.item_id) || o.item_id,
      priorityOverride: o.priority_override ?? null,
      isArchived: !!o.is_archived,
      archiveReason: o.archive_reason ?? null,
      archiveNote: o.archive_note ?? null,
      notes: o.notes ?? "",
    }));

    return { resources: active, archived, overrides };
  } catch (e) {
    console.error("fetchListingsOnly failed, using seed fallback:", e);
    return seedFallback;
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
}> {
  const seedFallback = {
    resources: seedResources,
    archived: seedArchived,
    changelog: seedChangelog,
    disputes: seedDisputes,
    xrefPairs: seedXrefPairs,
    supersessions: seedSupersessions,
  };

  if (!isSupabaseConfigured() || !orgId) return seedFallback;

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
        { active: seedResources, archived: seedArchived, uuidToUiId: new Map<string, string>() },
        seedChangelog,
        seedDisputes,
        seedXrefPairs,
        seedSupersessions,
      ] as [
        { active: typeof seedResources; archived: typeof seedArchived; uuidToUiId: Map<string, string> },
        typeof seedChangelog,
        typeof seedDisputes,
        typeof seedXrefPairs,
        typeof seedSupersessions,
      ]
    );

    if (!active.length) return seedFallback;

    return {
      resources: active,
      archived,
      changelog,
      disputes,
      xrefPairs,
      supersessions,
    };
  } catch (e) {
    console.error("fetchListingsMapData failed, using seed fallback:", e);
    return seedFallback;
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
}> {
  const seedFallback = {
    resources: seedResources,
    archived: seedArchived,
    supersessions: seedSupersessions,
  };

  if (!isSupabaseConfigured() || !orgId) return seedFallback;

  try {
    const [{ active, archived }, supersessions] = await withTimeout(
      Promise.all([
        // Slim RPC — settings reads names/priorities/dates, not full_brief.
        fetchWorkspaceResources(orgId, { slim: true }),
        fetchSupersessions(),
      ]),
      8000,
      [
        { active: seedResources, archived: seedArchived, uuidToUiId: new Map<string, string>() },
        seedSupersessions,
      ] as [
        { active: typeof seedResources; archived: typeof seedArchived; uuidToUiId: Map<string, string> },
        typeof seedSupersessions,
      ]
    );

    if (!active.length) return seedFallback;

    return { resources: active, archived, supersessions };
  } catch (e) {
    console.error("fetchSettingsData failed, using seed fallback:", e);
    return seedFallback;
  }
}

// ── Single Item Fetch (for /regulations/[id] detail page) ────────
/**
 * Fetch a single intelligence_item by its UI-side id (legacy_id || uuid).
 * Returns a Resource shaped object plus changelog/disputes/timeline for that
 * item — everything needed to render the regulation-detail page server-side.
 *
 * Falls back to seed data if Supabase is not configured or the id is not
 * found in Supabase. Returns null when nothing matches in either source.
 */
export async function fetchIntelligenceItem(
  itemUiId: string
): Promise<{
  resource: Resource;
  changelog: ChangeLogEntry[];
  dispute: Dispute | null;
  supersessions: Supersession[];
  xrefIds: string[];
  refByIds: string[];
} | null> {
  // Seed-only path
  function fromSeed() {
    const r = [...seedResources, ...seedArchived].find((x) => x.id === itemUiId);
    if (!r) return null;
    const refs = seedXrefPairs.filter(([a]) => a === itemUiId).map(([, b]) => b);
    const refBy = seedXrefPairs.filter(([, b]) => b === itemUiId).map(([a]) => a);
    const sups = seedSupersessions.filter(
      (s) => s.old === itemUiId || s.new === itemUiId
    );
    return {
      resource: r,
      changelog: seedChangelog[itemUiId] || [],
      dispute: seedDisputes[itemUiId] || null,
      supersessions: sups,
      xrefIds: refs,
      refByIds: refBy,
    };
  }

  if (!isSupabaseConfigured()) return fromSeed();

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
      .select("*")
      .or(orExpr)
      .maybeSingle();

    if (error || !row) return fromSeed();

    const resourceId: string = row.legacy_id || row.id;

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
        .select(
          "source_item_id, target_item_id, source:intelligence_items!source_item_id(id, legacy_id), target:intelligence_items!target_item_id(id, legacy_id)"
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
      type: row.item_type || "regulation",
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
      penaltyRange: row.penalty_range || undefined,
      complianceDeadline: row.compliance_deadline || undefined,
      enforcementBody: row.enforcement_body || undefined,
      legalInstrument: row.legal_instrument || undefined,
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
    // union in one round-trip.
    const xrefIds: string[] = [];
    const refByIds: string[] = [];
    for (const r of (xrefRows || []) as Array<{
      source_item_id: string;
      target_item_id: string;
      source: EmbeddedItem | EmbeddedItem[] | null;
      target: EmbeddedItem | EmbeddedItem[] | null;
    }>) {
      if (r.source_item_id === row.id) {
        const t = uiId(r.target);
        if (t) xrefIds.push(t);
      } else if (r.target_item_id === row.id) {
        const s = uiId(r.source);
        if (s) refByIds.push(s);
      }
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

    return { resource, changelog, dispute, supersessions, xrefIds, refByIds };
  } catch (e) {
    console.error("fetchIntelligenceItem failed, using seed fallback:", e);
    return fromSeed();
  }
}

// ── Phase 3 dashboard sidebar fetchers (Wave 1 / Track 5) ────────
//
// Each fetcher is wrapped in try/catch and returns an empty array on any
// failure. This includes the "table does not exist yet" case — migrations
// 060 (user_watchlist) and 061 (coverage_gaps) ship in this PR but the
// production database may apply them after master deploys to Vercel.
// Empty arrays trigger the widget empty-state copy, keeping the dashboard
// safe to render before migrations have applied.

export interface WatchlistItem {
  id: string;
  type: "source" | "reg" | "signal";
  title: string;
  source: string;
  jurisdiction?: string;
  lastChangedAt: string;
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

/**
 * Fetch the current user's watchlist, joined to the underlying entity for
 * a friendly title + source label.
 *
 * Returns [] when the user is unauthenticated, when no rows match, or when
 * the user_watchlist table does not yet exist (migration 060 not applied).
 * Hard-capped at 14 rows so the rail renders predictably.
 */
export async function fetchWatchlist(
  userId: string | null
): Promise<WatchlistItem[]> {
  if (!isSupabaseConfigured() || !userId) return [];
  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("user_watchlist")
      .select("id, item_type, item_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(14);
    if (error || !data) return [];

    type WatchRow = {
      id: string;
      item_type: "source" | "reg" | "signal";
      item_id: string;
      created_at: string;
    };
    const rows = data as WatchRow[];
    if (rows.length === 0) return [];

    // Resolve titles for the regulation rows from intelligence_items by
    // legacy_id || uuid. Sources / signals get a best-effort label from
    // their ids — when the source registry / market signal feeds come
    // online they can be joined here. Single round-trip, in-memory join.
    const regIds = rows.filter((r) => r.item_type === "reg").map((r) => r.item_id);
    const regTitles = new Map<string, { title: string; jurisdiction: string | null }>();
    if (regIds.length > 0) {
      const { data: items } = await supabase
        .from("intelligence_items")
        .select("id, legacy_id, title, jurisdictions")
        .or(regIds.map((id) => `legacy_id.eq.${id},id.eq.${id}`).join(","));
      for (const it of (items || []) as Array<{
        id: string;
        legacy_id: string | null;
        title: string;
        jurisdictions: string[] | null;
      }>) {
        const key = it.legacy_id || it.id;
        regTitles.set(key, {
          title: it.title,
          jurisdiction: it.jurisdictions?.[0] || null,
        });
      }
    }

    const sourceIds = rows.filter((r) => r.item_type === "source").map((r) => r.item_id);
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

    const result: WatchlistItem[] = rows.map((r) => {
      if (r.item_type === "reg") {
        const meta = regTitles.get(r.item_id);
        return {
          id: r.item_id,
          type: "reg" as const,
          title: meta?.title || r.item_id,
          source: meta?.jurisdiction || "REG",
          jurisdiction: meta?.jurisdiction || undefined,
          lastChangedAt: r.created_at,
        };
      }
      if (r.item_type === "source") {
        const meta = sourceLabels.get(r.item_id);
        return {
          id: r.item_id,
          type: "source" as const,
          title: meta?.name || r.item_id,
          source: meta?.name || "SOURCE",
          jurisdiction: meta?.jurisdiction || undefined,
          lastChangedAt: r.created_at,
        };
      }
      return {
        id: r.item_id,
        type: "signal" as const,
        title: r.item_id,
        source: "SIGNAL",
        lastChangedAt: r.created_at,
      };
    });

    return result;
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
async function isPlatformAdminInline(
  userId: string,
  supabase: ReturnType<typeof getServiceSupabase>
): Promise<boolean> {
  if (!userId) return false;
  const { data, error } = await supabase
    .from("org_memberships")
    .select("role")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) return false;
  return data.role === "owner" || data.role === "admin";
}
