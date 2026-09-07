/**
 * Workspace tags — server-side helpers shared by the two API routes under
 * src/app/api/workspace/tags/ (lane uitags, 2026-09-07, migration 313).
 * Split out of route.ts so the pure/testable pieces can be unit tested with
 * a stubbed Supabase client (same sibling-logic-module pattern
 * src/app/api/watchlist/logic.ts and src/app/api/admin/sources/bulk-import/
 * logic.ts already use — route.ts files export only route handlers).
 */

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
 *  intelligence_items.id. Returns null if not found. Mirrors
 *  /api/workspace/overrides's resolveItemUuid exactly (same shape,
 *  intentionally not deduplicated across the two route files further —
 *  copying a 6-line lookup is the existing codebase convention here, see
 *  overrides/route.ts's own copy of this same function). */
export async function resolveItemUuid(
  supabase: { from: (table: string) => any },
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
