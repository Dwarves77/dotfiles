/**
 * Map a Supabase resource row (+ optional timelines) to the API response shape.
 * Keeps the same field names as the database schema for API consumers.
 */
export function mapResourceRow(row: Record<string, unknown>, timelines?: Record<string, unknown>[]) {
  return {
    id: row.id,
    category: row.category,
    subcategory: row.subcategory || "",
    title: row.title,
    url: row.url || "",
    note: row.note || "",
    type: row.type || "",
    priority: row.priority,
    reasoning: row.reasoning || "",
    tags: row.tags || [],
    what_is_it: row.what_is_it || "",
    why_matters: row.why_matters || "",
    key_data: row.key_data || [],
    modes: row.modes || [],
    topic: row.topic || null,
    jurisdiction: row.jurisdiction || null,
    added_date: row.added_date,
    modified_date: row.modified_date || null,
    is_archived: row.is_archived,
    archived_date: row.archived_date || null,
    archive_reason: row.archive_reason || null,
    archive_note: row.archive_note || null,
    archive_replacement: row.archive_replacement || null,
    lifecycle_stage: row.lifecycle_stage || null,
    provenance_level: row.provenance_level || null,
    last_verified: row.last_verified || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    timelines: (timelines || []).map((t) => ({
      date: t.date,
      label: t.label,
      status: t.status || null,
    })),
  };
}
