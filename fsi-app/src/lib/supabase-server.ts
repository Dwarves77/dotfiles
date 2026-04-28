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
  const { data: rows } = await supabase
    .from("item_changelog")
    .select("change_date, change_type, field, previous_value, new_value, impact, intelligence_items!inner(id, legacy_id)")
    .order("change_date", { ascending: false });

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
  const { data: rows } = await supabase
    .from("item_disputes")
    .select("note, disputing_sources, intelligence_items!inner(id, legacy_id)")
    .eq("is_active", true);

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
  const { data: rows } = await supabase
    .from("item_cross_references")
    .select("source:intelligence_items!source_item_id(id, legacy_id), target:intelligence_items!target_item_id(id, legacy_id)");

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
  const { data: rows } = await supabase
    .from("item_supersessions")
    .select("supersession_date, severity, note, old:intelligence_items!old_item_id(id, legacy_id), new:intelligence_items!new_item_id(id, legacy_id)")
    .order("supersession_date", { ascending: false });

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

async function fetchSources(): Promise<Source[]> {
  const supabase = getSupabase();
  const { data: rows } = await supabase
    .from("sources")
    .select("*")
    .order("tier", { ascending: true });

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

export async function fetchSourceData(): Promise<SourceData> {
  const emptySourceData: SourceData = { sources: [], provisionalSources: [], openConflicts: [] };

  if (!isSupabaseConfigured()) {
    return emptySourceData;
  }

  try {
    const [sources, provisionalSources, openConflicts] = await withTimeout(
      Promise.all([fetchSources(), fetchProvisionalSources(), fetchOpenConflicts()]),
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
// Uses get_workspace_intelligence() to get items with workspace overrides

async function fetchWorkspaceResources(orgId: string): Promise<{ active: Resource[]; archived: Resource[] }> {
  const supabase = getSupabase();

  // Workspace items via the RPC that LEFT JOINs workspace_item_overrides.
  // No legacy `resources` fallback after A.5.b — if the RPC returns empty,
  // fetchDashboardData's seed fallback covers the misconfiguration case.
  const { data: items, error } = await supabase.rpc("get_workspace_intelligence", { p_org_id: orgId });

  if (error || !items?.length) {
    return { active: [], archived: [] };
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

  return { active, archived };
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
    const [{ active: resources, archived }, changelog, disputes, xrefPairs, supersessions] =
      await withTimeout(
        Promise.all([
          fetchWorkspaceResources(orgId),
          fetchChangelog(),
          fetchDisputes(),
          fetchXrefPairs(),
          fetchSupersessions(),
        ]),
        8000, // 8 second timeout
        [
          { active: seedResources, archived: seedArchived },
          seedChangelog,
          seedDisputes,
          seedXrefPairs,
          seedSupersessions,
        ] as [{ active: typeof seedResources; archived: typeof seedArchived }, typeof seedChangelog, typeof seedDisputes, typeof seedXrefPairs, typeof seedSupersessions]
      );

    // If Supabase returned empty, use seed data
    if (!resources.length) {
      return seedFallback;
    }

    // Fetch synopses (paginated — PostgREST caps at 1000 per request), changes, and sector names
    const supabase = getSupabase();

    async function fetchAllSynopses() {
      const allSynopses: any[] = [];
      let from = 0;
      const batchSize = 1000;

      while (true) {
        const { data, error } = await supabase
          .from("intelligence_summaries")
          .select("item_id, sector, summary, urgency_score")
          .range(from, from + batchSize - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        allSynopses.push(...data);

        if (data.length < batchSize) break;
        from += batchSize;
      }

      return allSynopses;
    }

    const [allSynopses, changesResult, sectorsResult, overridesResult] = await Promise.all([
      fetchAllSynopses(),
      supabase
        .from("intelligence_changes")
        .select("item_id, change_type, change_severity, change_summary")
        .order("detected_at", { ascending: false }),
      supabase
        .from("sector_contexts")
        .select("sector, display_name"),
      supabase
        .from("workspace_item_overrides")
        .select("item_id, priority_override, is_archived, archive_reason, archive_note, notes")
        .eq("org_id", orgId),
    ]);

    // Build UUID→legacy_id lookup from resources already fetched
    // The UI uses r.id = legacy_id || uuid. Synopses use item_id = uuid.
    // We need to map synopsis item_ids to the IDs the UI uses.
    const uuidToUiId = new Map<string, string>();
    for (const r of resources) {
      // r.id is already legacy_id || uuid (set in fetchWorkspaceResources)
      // We need to find the UUID for each resource to map synopses
    }
    // Fetch the UUID→legacy_id mapping directly
    const { data: idMap } = await supabase
      .from("intelligence_items")
      .select("id, legacy_id")
      .eq("is_archived", false);
    for (const row of idMap || []) {
      uuidToUiId.set(row.id, row.legacy_id || row.id);
    }

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
