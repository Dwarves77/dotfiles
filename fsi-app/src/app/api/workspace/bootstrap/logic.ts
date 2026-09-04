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
