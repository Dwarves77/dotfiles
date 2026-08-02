"use client";

// usePersonalStateHydration — loads the caller's user_item_state rows into the
// resource store (dual-scope archive, migration 235).
//
// The workspace override layer arrives with the SSR payload (`initialOverrides`,
// resolved server-side in fetchWorkspaceOverrideRows). The personal layer cannot
// ride along: user_item_state is per-USER and the workspace RPCs are org-scoped,
// so it is fetched client-side from /api/workspace/personal-state alongside the
// override hydration on the same surfaces.
//
// ID CONVENTION. The UI keys every resource by its UI id — `legacy_id || uuid`
// (see uuidToUiId in supabase-server). The route returns the raw item UUID as
// `itemId` plus the `legacyId`, so the mapping below reproduces that same
// `legacyId || itemId` fallback. Without it the store map would be keyed by UUID
// while `mergeWithOverrides` looks up by UI id, and every personal archive would
// silently miss.
//
// Fail-soft by design: signed out, offline, or a non-200 all leave the store's
// empty default in place, so a user with no personal state sees exactly the
// pre-dual-scope behaviour.

import { useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useResourceStore, type PersonalItemState } from "@/stores/resourceStore";

// GET /api/workspace/personal-state → { items: [...] }. The route only returns
// rows with is_archived = true.
interface PersonalStateApiRow {
  itemId: string;
  legacyId: string | null;
  title: string | null;
  isArchived: boolean;
  archiveNote: string | null;
  archivedAt: string | null;
}

export function usePersonalStateHydration() {
  const setPersonalState = useResourceStore((s) => s.setPersonalState);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        // Signed out — nothing personal to load. Leave the empty default.
        if (!token || cancelled) return;

        const res = await fetch("/api/workspace/personal-state", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled || !res.ok) {
          if (!res.ok) {
            console.warn(
              `[personal-state] hydration returned ${res.status}; personal archives will not be applied this session.`
            );
          }
          return;
        }

        const body = (await res.json()) as { items?: PersonalStateApiRow[] };
        if (cancelled) return;

        const rows: PersonalItemState[] = (body.items ?? []).map((r) => ({
          itemId: r.legacyId || r.itemId,
          isArchived: r.isArchived,
          archiveNote: r.archiveNote,
          archivedAt: r.archivedAt,
        }));

        // Mirrors the `initialOverrides.length > 0` guard on the override
        // hydration: an empty response is the store's default anyway, and
        // skipping the write means a slow response can never clobber an
        // optimistic archive the user made while it was in flight.
        if (rows.length > 0) setPersonalState(rows);
      } catch (e: unknown) {
        console.warn(
          "[personal-state] hydration failed:",
          e instanceof Error ? e.message : e
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [setPersonalState]);
}
