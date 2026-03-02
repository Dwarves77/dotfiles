import { createClient } from "@supabase/supabase-js";
import type { Resource, ChangeLogEntry, Dispute, Supersession } from "@/types/resource";

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

export async function fetchDashboardData(): Promise<DashboardData> {
  if (!isSupabaseConfigured()) {
    return {
      resources: seedResources,
      archived: seedArchived,
      changelog: seedChangelog,
      disputes: seedDisputes,
      xrefPairs: seedXrefPairs,
      supersessions: seedSupersessions,
      auditDate: seedAuditDate,
    };
  }

  const [resources, archived, changelog, disputes, xrefPairs, supersessions] =
    await Promise.all([
      fetchResources(),
      fetchArchived(),
      fetchChangelog(),
      fetchDisputes(),
      fetchXrefPairs(),
      fetchSupersessions(),
    ]);

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
}
