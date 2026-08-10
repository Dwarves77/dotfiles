// resource-lookup.ts — flywheel U9 (D1) shared helper. Extracted from the pattern originally inline in
// regulations/[slug]/page.tsx (customer read gate on related-item titles) so Market/Operations/Research
// don't each re-implement the same ~40 lines when wiring ItemConnectionsCard (one home, not four).
//
// Customer read gate: only verified items may surface titles in a connections list. A quarantined
// connection/supersession target falls back to its raw id (buildConnectionRows/buildSupersessionRows in
// connection-view-model.mjs tolerate a missing lookup entry) rather than leaking an unverified title.

import { createClient } from "@supabase/supabase-js";

export type ResourceLookup = Record<string, { id: string; title: string; priority: string }>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Fetch title + priority for a set of UI-side ids (legacy_id || uuid), verified items only.
 *  Fail-soft: any error or missing creds returns an empty lookup — callers already tolerate a miss. */
export async function buildResourceLookup(relatedIds: string[]): Promise<ResourceLookup> {
  const lookup: ResourceLookup = {};
  const ids = Array.from(new Set(relatedIds)).filter(Boolean);
  if (!ids.length || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return lookup;
  }
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );
    const uuidIds = ids.filter((id) => UUID_RE.test(id));
    const legacyIds = ids.filter((id) => !UUID_RE.test(id));

    const queries = [];
    if (legacyIds.length > 0) {
      queries.push(
        supabase.from("intelligence_items").select("id, legacy_id, title, priority")
          .eq("provenance_status", "verified").in("legacy_id", legacyIds)
      );
    }
    if (uuidIds.length > 0) {
      queries.push(
        supabase.from("intelligence_items").select("id, legacy_id, title, priority")
          .eq("provenance_status", "verified").in("id", uuidIds)
      );
    }
    const results = await Promise.all(queries);
    for (const result of results) {
      for (const row of (result.data ?? []) as Array<{ id: string; legacy_id: string | null; title: string; priority: string }>) {
        const uiId = row.legacy_id || row.id;
        lookup[uiId] = { id: uiId, title: row.title, priority: row.priority };
      }
    }
  } catch {
    // Fail-soft — connections/supersessions render with a raw-id fallback (or are dropped, per
    // buildConnectionRows) rather than the page failing.
  }
  return lookup;
}
