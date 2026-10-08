/**
 * Workspace tags — server-side helpers shared by the two API routes under
 * src/app/api/workspace/tags/ (lane uitags, 2026-09-07, migration 313).
 * Split out of route.ts so the pure/testable pieces can be unit tested with
 * a stubbed Supabase client (same sibling-logic-module pattern
 * src/app/api/watchlist/logic.ts and src/app/api/admin/sources/bulk-import/
 * logic.ts already use — route.ts files export only route handlers).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildApplications,
  memberDisplayName,
  type ProfileNameRow,
  type TagApplication,
  type TagLinkRow,
} from "./attribution";

/** Display names for a set of member ids in one profiles lookup (full name, else display name; never
 *  an email). Bounded by the number of distinct tag authors in one workspace. A read error leaves the
 *  names out, so a chip renders "a workspace member" rather than failing the response. */
export async function loadAuthorNames(
  supabase: SupabaseClient,
  authorIds: string[]
): Promise<Map<string, string | null>> {
  const nameById = new Map<string, string | null>();
  const ids = Array.from(new Set(authorIds.filter(Boolean)));
  if (ids.length === 0) return nameById;
  const { data: profiles, error: profErr } = await supabase
    .from("profiles")
    .select("id, full_name, display_name")
    // fitness-allow: F39 (scoped to the authors of a workspace's tag applications, not corpus-scale)
    .in("id", ids);
  if (profErr) {
    console.warn(`[api/workspace/tags] author name read failed (chips render without names): ${profErr.message}`);
  }
  for (const p of (profiles ?? []) as ProfileNameRow[]) {
    nameById.set(p.id, memberDisplayName(p));
  }
  return nameById;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Minimal shape this module needs from a Supabase client — narrow enough to
 *  stub in tests without constructing a real client. */
export interface TagsSupabaseClient {
  from(table: string): {
    select: (cols: string) => {
      eq: (col: string, val: unknown) => {
        maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
        eq: (col2: string, val2: unknown) => {
          maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
        };
      };
    };
  };
}

/** Resolve a UI-side identifier (legacy_id like "o3" OR a UUID) to
 *  mirror of /api/workspace/overrides's resolveItemUuid: kept, F34 (route files export only handlers) means overrides/route.ts cannot export this helper for import.
 *  intelligence_items.id. Returns null if not found. Mirrors
 *  /api/workspace/overrides's resolveItemUuid exactly (same shape,
 *  intentionally not deduplicated across the two route files further —
 *  copying a 6-line lookup is the existing codebase convention here, see
 *  overrides/route.ts's own copy of this same function). */
export async function resolveItemUuid(
  supabase: SupabaseClient,
  itemId: string
): Promise<string | null> {
  if (UUID_RE.test(itemId)) return itemId;
  const { data } = await supabase
    .from("intelligence_items")
    .select("id")
    .eq("legacy_id", itemId)
    .maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

/** Trim + collapse-whitespace a raw tag name; the DB's generated
 *  name_key column does lower(trim(name)) for uniqueness, this only
 *  normalizes what gets STORED (display casing is preserved). Empty or
 *  over-length (>60, matching the migration's CHECK) inputs return null so
 *  the route can 400 without a round trip. */
export function normalizeTagName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (trimmed.length === 0 || trimmed.length > 60) return null;
  return trimmed;
}

export function tagNameKey(name: string): string {
  return name.trim().toLowerCase();
}

/** Shape returned by the tags-with-counts read: one row per
 *  (workspace_tags row, its live item count). Builds the { [tagId]: count }
 *  map the GET route and the rail facet group both need, from the raw
 *  item_workspace_tags rows a bounded `.select("tag_id")` read returns —
 *  counting client-side (not a `count(*) GROUP BY` RPC) keeps this route on
 *  plain PostgREST calls, matching every sibling workspace route's style. */
export function buildTagCountsMap(rows: { tag_id: string }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.tag_id, (counts.get(row.tag_id) ?? 0) + 1);
  }
  return counts;
}

/** Who applied which tag to one item, and when (migration 313 created_by/created_at, lane s8b-tag-attribution). Reads the
 *  item's join rows (bounded: one item carries few tags) and resolves the applying members' names
 *  from profiles in a single lookup. The author is whatever the write route stamped from the
 *  session; nothing here reads a client-supplied value. Read errors degrade to an empty list so the
 *  chip simply carries no attribution, never a failed tags response. */
export async function loadItemApplications(
  supabase: SupabaseClient,
  orgId: string,
  itemUuid: string
): Promise<TagApplication[]> {
  const { data: linkData, error: linkErr } = await supabase
    .from("item_workspace_tags")
    .select("tag_id, created_by, created_at")
    .eq("org_id", orgId)
    .eq("intelligence_item_id", itemUuid)
    .limit(500); // fitness-allow: F38 (tags applied to one item, bounded-by-design)
  if (linkErr) {
    console.warn(`[api/workspace/tags] attribution read failed (chips render without it): ${linkErr.message}`);
    return [];
  }
  const rows = (linkData ?? []) as TagLinkRow[];

  const nameById = await loadAuthorNames(
    supabase,
    rows.map((r) => r.created_by).filter((id): id is string => Boolean(id))
  );
  return buildApplications(rows, nameById);
}
