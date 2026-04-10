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

// ── Row → TypeScript Mapping ─────────────────────────────────

function mapResource(row: any, timelines?: any[]): Resource {
  return {
    id: row.id,
    cat: row.category,
    sub: row.subcategory || "",
    title: row.title,
    url: row.url || "",
    note: row.note || "",
    type: row.type || "",
    priority: row.priority,
    added: row.added_date,
    reasoning: row.reasoning || "",
    tags: row.tags || [],
    whatIsIt: row.what_is_it || "",
    whyMatters: row.why_matters || "",
    keyData: row.key_data || [],
    fullBrief: row.full_brief || undefined,
    timeline: (timelines || []).map((t) => ({
      date: t.date,
      label: t.label,
      status: t.status || undefined,
    })),
    modes: row.modes || [],
    topic: row.topic || undefined,
    jurisdiction: row.jurisdiction || undefined,
    isArchived: row.is_archived,
    archiveReason: row.archive_reason || undefined,
    archiveNote: row.archive_note || undefined,
    archivedDate: row.archived_date || undefined,
    replacedBy: row.archive_replacement || undefined,
  };
}

// ── Fetch Functions ──────────────────────────────────────────

async function fetchResources(): Promise<Resource[]> {
  const supabase = getSupabase();

  const [{ data: rows }, { data: timelineRows }] = await Promise.all([
    supabase.from("resources").select("*").eq("is_archived", false),
    supabase.from("timelines").select("*").order("sort_order"),
  ]);

  const timelineMap = new Map<string, any[]>();
  (timelineRows || []).forEach((t: any) => {
    const arr = timelineMap.get(t.resource_id) || [];
    arr.push(t);
    timelineMap.set(t.resource_id, arr);
  });

  return (rows || []).map((row: any) =>
    mapResource(row, timelineMap.get(row.id))
  );
}

async function fetchArchived(): Promise<Resource[]> {
  const supabase = getSupabase();
  const { data: rows } = await supabase
    .from("resources")
    .select("*")
    .eq("is_archived", true);

  return (rows || []).map((row: any) => mapResource(row));
}

async function fetchChangelog(): Promise<Record<string, ChangeLogEntry[]>> {
  const supabase = getSupabase();
  const { data: rows } = await supabase
    .from("changelog")
    .select("*")
    .order("date", { ascending: false });

  const result: Record<string, ChangeLogEntry[]> = {};
  (rows || []).forEach((row: any) => {
    const entry: ChangeLogEntry = {
      id: row.resource_id,
      date: row.date,
      type: row.type,
      fields: row.fields || undefined,
      prev: row.prev_value || undefined,
      now: row.now_value || undefined,
      impact: row.impact || undefined,
    };
    if (!result[row.resource_id]) result[row.resource_id] = [];
    result[row.resource_id].push(entry);
  });

  return result;
}

async function fetchDisputes(): Promise<Record<string, Dispute>> {
  const supabase = getSupabase();
  const { data: rows } = await supabase
    .from("disputes")
    .select("*")
    .eq("active", true);

  const result: Record<string, Dispute> = {};
  (rows || []).forEach((row: any) => {
    const sources = Array.isArray(row.sources)
      ? row.sources
      : typeof row.sources === "string"
        ? JSON.parse(row.sources)
        : [];

    result[row.resource_id] = {
      resource: row.resource_id,
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
  const { data: rows } = await supabase.from("cross_references").select("*");

  return (rows || []).map((row: any) => [row.source_id, row.target_id]);
}

async function fetchSupersessions(): Promise<Supersession[]> {
  const supabase = getSupabase();
  const { data: rows } = await supabase
    .from("supersessions")
    .select("*")
    .order("date", { ascending: false });

  return (rows || []).map((row: any) => ({
    old: row.old_id,
    new: row.new_id,
    date: row.date,
    severity: row.severity as "major" | "minor" | "replacement",
    note: row.note || "",
  }));
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
  if (!isSupabaseConfigured()) {
    // Return empty source data when no Supabase — sources only live in the database
    return {
      sources: [],
      provisionalSources: [],
      openConflicts: [],
    };
  }

  const [sources, provisionalSources, openConflicts] = await Promise.all([
    fetchSources(),
    fetchProvisionalSources(),
    fetchOpenConflicts(),
  ]);

  return { sources, provisionalSources, openConflicts };
}

// ── Workspace Intelligence Fetch ────────────────────────────
// Uses get_workspace_intelligence() to get items with workspace overrides

async function fetchWorkspaceResources(orgId: string): Promise<{ active: Resource[]; archived: Resource[] }> {
  const supabase = getSupabase();

  // Fetch via workspace function
  const { data: items, error } = await supabase.rpc("get_workspace_intelligence", { p_org_id: orgId });

  if (error || !items?.length) {
    // Fallback to legacy resources if workspace function fails
    const legacy = await fetchResources();
    const legacyArchived = await fetchArchived();
    return { active: legacy, archived: legacyArchived };
  }

  // Fetch timelines for these items
  const itemIds = items.map((i: any) => i.legacy_id).filter(Boolean);
  const { data: timelineRows } = await supabase
    .from("timelines")
    .select("*")
    .in("resource_id", itemIds)
    .order("sort_order");

  const timelineMap = new Map<string, any[]>();
  (timelineRows || []).forEach((t: any) => {
    const arr = timelineMap.get(t.resource_id) || [];
    arr.push(t);
    timelineMap.set(t.resource_id, arr);
  });

  const active: Resource[] = [];
  const archived: Resource[] = [];

  for (const row of items) {
    const timelines = row.legacy_id ? timelineMap.get(row.legacy_id) : undefined;
    const resource: Resource = {
      id: row.legacy_id || row.id,
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
      timeline: (timelines || []).map((t: any) => ({
        date: t.date,
        label: t.label,
        status: t.status || undefined,
      })),
      modes: row.transport_modes || [],
      topic: row.category || undefined,
      jurisdiction: row.jurisdictions?.[0] || undefined,
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

export interface DashboardData {
  resources: Resource[];
  archived: Resource[];
  changelog: Record<string, ChangeLogEntry[]>;
  disputes: Record<string, Dispute>;
  xrefPairs: [string, string][];
  supersessions: Supersession[];
  auditDate: string;
}

// Timeout wrapper — prevents Supabase from hanging indefinitely on Vercel
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export async function fetchDashboardData(): Promise<DashboardData> {
  const seedFallback: DashboardData = {
    resources: seedResources,
    archived: seedArchived,
    changelog: seedChangelog,
    disputes: seedDisputes,
    xrefPairs: seedXrefPairs,
    supersessions: seedSupersessions,
    auditDate: seedAuditDate,
  };

  if (!isSupabaseConfigured()) {
    return seedFallback;
  }

  try {
    // Use workspace intelligence function for resources (includes overrides)
    const orgId = "a0000000-0000-0000-0000-000000000001"; // Default dev workspace
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

    // Audit date: most recent changelog entry or today
    let auditDate = new Date().toISOString().slice(0, 10);
    for (const entries of Object.values(changelog)) {
      for (const e of entries) {
        if (e.date > auditDate) auditDate = e.date;
      }
    }

    return {
      resources,
      archived,
      changelog,
      disputes,
      xrefPairs,
      supersessions,
      auditDate,
    };
  } catch (e) {
    console.error("fetchDashboardData failed, using seed fallback:", e);
    return seedFallback;
  }
}
