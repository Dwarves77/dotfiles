// Shared field loaders for /api/workspace/bootstrap, split out of route.ts (BUILDGATE, 2026-09-02,
// F34's named residual: a route.ts may export only route handlers/config — see list-order/logic.ts's
// identical precedent). PERF-9 (2026-09-04, item 5, ADR-026 §4): pulled out specifically so each field
// is a plain, mockable function testable with a fake Supabase client — no NextRequest/NextResponse
// involved — mirroring health/spend/logic.ts's buildSpendResponseBody pattern.

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveOrgIdFromUserId } from "@/lib/api/org";
import { isPlatformAdmin } from "@/lib/auth/admin";
import { LIST_KEYS, type ListKey } from "@/app/api/user/list-order/logic";
import { fetchAttentionCounts, EMPTY_COUNTS, type AttentionCounts } from "@/app/api/admin/attention/logic";
import {
  fetchWorkspaceOverrideRowsRaw,
  mapOverrideRows,
  type WorkspaceOverrideRow,
} from "@/lib/supabase-server";

export interface PersonalStateItem {
  itemId: string;
  legacyId: string | null;
  title: string | null;
  isArchived: boolean;
  archiveNote: string | null;
  archivedAt: string | null;
}

export interface ListOrderEntry {
  itemId: string;
  position: string;
}

export interface MemberRow {
  user_id: string;
  role: string;
  display_name: string;
  avatar_url: string | null;
}

export type ListOrderByKey = Record<ListKey, ListOrderEntry[]>;

export function emptyListOrderByKey(): ListOrderByKey {
  const out = {} as ListOrderByKey;
  for (const key of LIST_KEYS) out[key] = [];
  return out;
}

type PersonalStateRow = {
  item_id: string;
  is_archived: boolean;
  archive_note: string | null;
  archived_at: string | null;
  intelligence_items?:
    | { legacy_id: string | null; title: string | null }
    | { legacy_id: string | null; title: string | null }[]
    | null;
};

export async function loadPersonalState(
  supabase: SupabaseClient,
  userId: string
): Promise<PersonalStateItem[]> {
  try {
    const { data, error } = await supabase
      .from("user_item_state")
      .select(
        "item_id, is_archived, archive_note, archived_at, intelligence_items(legacy_id, title)"
      )
      .eq("user_id", userId)
      .eq("is_archived", true)
      .order("archived_at", { ascending: false });

    if (error) return [];

    return ((data ?? []) as unknown as PersonalStateRow[]).map((r) => {
      const embedded = Array.isArray(r.intelligence_items)
        ? r.intelligence_items[0]
        : r.intelligence_items;
      return {
        itemId: r.item_id,
        legacyId: embedded?.legacy_id ?? null,
        title: embedded?.title ?? null,
        isArchived: r.is_archived,
        archiveNote: r.archive_note,
        archivedAt: r.archived_at,
      };
    });
  } catch {
    return [];
  }
}

export async function loadListOrders(
  supabase: SupabaseClient,
  userId: string
): Promise<ListOrderByKey> {
  const out = emptyListOrderByKey();
  try {
    const { data, error } = await supabase
      .from("user_list_order")
      .select("list_key, item_id, position")
      .eq("user_id", userId)
      .in("list_key", LIST_KEYS)
      .order("position", { ascending: true });

    if (error || !data) return out;

    for (const row of data as Array<{ list_key: string; item_id: string; position: unknown }>) {
      const key = row.list_key as ListKey;
      if (!(key in out)) continue;
      out[key].push({ itemId: row.item_id, position: String(row.position) });
    }
    return out;
  } catch {
    return out;
  }
}

export async function loadMembers(
  supabase: SupabaseClient,
  userId: string
): Promise<MemberRow[] | null> {
  try {
    const orgId = await resolveOrgIdFromUserId(supabase, userId);
    if (!orgId) return null;

    const { data, error } = await supabase
      .from("org_memberships")
      .select(
        "user_id, role, created_at, user:profiles!user_id(full_name, display_name, email, avatar_url)"
      )
      .eq("org_id", orgId)
      .order("created_at", { ascending: true });

    if (error || !data) return null;

    const rows = data as Array<{
      user_id: string;
      role: string;
      user: {
        full_name?: string | null;
        display_name?: string | null;
        email?: string | null;
        avatar_url?: string | null;
      } | null;
    }>;

    return rows.map((r) => ({
      user_id: r.user_id,
      role: r.role,
      display_name:
        r.user?.full_name ??
        r.user?.display_name ??
        r.user?.email ??
        `${String(r.user_id).slice(0, 8)}...`,
      avatar_url: r.user?.avatar_url ?? null,
    }));
  } catch {
    return null;
  }
}

// PERF-12 (2026-09-04, ADR-027 §5/item 4): a fifth field alongside the existing four, same
// independent-degrade contract (null on any failure, never throws). `loadMembers` above already
// calls `resolveOrgIdFromUserId` internally but does not expose the id itself to the response body —
// this loader is the same resolver, exposed as its own top-level field, so a CLIENT listing route
// (see /api/listings/cursor/route.ts's own header) can send it back as `X-Org-Id` for the server to
// VERIFY against the session-derived value on the next request — never as the thing that actually
// scopes a query (that stays resolveOrgIdFromCookies()/resolveOrgIdFromUserId(), read fresh from the
// session on every request, exactly as before this lane).
export async function loadOrgId(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  try {
    return await resolveOrgIdFromUserId(supabase, userId);
  } catch {
    return null;
  }
}

export async function loadAdminAttention(
  supabase: SupabaseClient,
  userId: string
): Promise<AttentionCounts | null> {
  try {
    const admin = await isPlatformAdmin(userId, supabase);
    if (!admin) return null;
    const { row, rpcError } = await fetchAttentionCounts(userId);
    if (rpcError) return EMPTY_COUNTS;
    return row;
  } catch {
    return null;
  }
}

// PERF-10 (2026-09-04, ADR-026 Follow-up / migration 306): the caller's org-scoped override rows
// (priority, archive state, owner, notes) — the exact per-org merge layer the four index pages'
// server render used to bake into their RPC call (get_workspace_intelligence_slim/listings(p_org_id))
// and the four detail pages' loadViewerScoped used to read directly (regulations' owner,
// market's note). Both moved off the server render path this lane (see the four index page.tsx
// files and load-detail.ts) so the four listing/detail routes' render trees carry no cookies() read
// of their own — resourceStore.setOverrides(bootstrap.overrides) (a new client hook,
// useWorkspaceOverridesHydration) is now the ONE place that hydrates the SAME WorkspaceOverride
// shape every consumer (mergeWithOverrides, OwnerTeamCard, NotesField) already reads.
//
// Reuses fetchWorkspaceOverrideRowsRaw + mapOverrideRows (supabase-server.ts) UNCHANGED — this is a
// new TRANSPORT (client-fetched bootstrap field instead of a page.tsx server prop) for the exact
// same read + mapping fetchResourcesOnly/fetchListingsOnly/fetchDashboardData already run, not a
// reimplementation. mapOverrideRows needs a uuid→UI-id translation map, which those three callers
// already have (from fetchWorkspaceResources's own RPC payload); this call site does not fetch the
// item list at all (the public listing RPCs already skip that entirely — see migration 306), so it
// resolves the SMALL set of legacy_ids it actually needs — bounded by this org's own override count,
// never the whole corpus — with one extra `.in()` query.
export async function loadOverrides(
  supabase: SupabaseClient,
  userId: string
): Promise<WorkspaceOverrideRow[]> {
  try {
    const orgId = await resolveOrgIdFromUserId(supabase, userId);
    if (!orgId) return [];

    const raw = await fetchWorkspaceOverrideRowsRaw(orgId);
    if (raw.rows.length === 0) return [];

    const itemIds = [...new Set(raw.rows.map((r) => r.item_id))];
    const { data: itemRows, error: itemErr } = await supabase
      .from("intelligence_items")
      .select("id, legacy_id")
      .in("id", itemIds);
    if (itemErr) {
      console.warn("[bootstrap/loadOverrides] legacy_id lookup failed (itemId falls back to uuid):", itemErr.message);
    }
    const uuidToUiId = new Map<string, string>();
    for (const row of (itemRows ?? []) as Array<{ id: string; legacy_id: string | null }>) {
      uuidToUiId.set(row.id, row.legacy_id || row.id);
    }

    return mapOverrideRows(raw, uuidToUiId);
  } catch (e) {
    console.warn("[bootstrap/loadOverrides] failed (fail-soft, empty overrides):", e instanceof Error ? e.message : String(e));
    return [];
  }
}
