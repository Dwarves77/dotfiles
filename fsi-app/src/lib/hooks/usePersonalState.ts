"use client";

// usePersonalStateHydration — loads the caller's user_item_state rows into the
// resource store (dual-scope archive, migration 235).
//
// The workspace override layer arrives with the SSR payload (`initialOverrides`,
// resolved server-side in fetchWorkspaceOverrideRows). The personal layer cannot
// ride along: user_item_state is per-USER and the workspace RPCs are org-scoped,
// so it is fetched client-side alongside the override hydration on the same
// surfaces.
//
// PERF-9 (2026-09-04, item 5, ADR-026 §4): reads from the shared
// useWorkspaceBootstrap() singleton (GET /api/workspace/bootstrap) instead of
// its own independent fetch of /api/workspace/personal-state. This is one of
// three hooks/components (alongside useListOrder and OwnerTeamCard) that used
// to each fire their own per-user round trip on the same navigation; they now
// share ONE.
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

import { useEffect, useRef } from "react";
import { useResourceStore, type PersonalItemState } from "@/stores/resourceStore";
import { useWorkspaceBootstrap } from "@/lib/hooks/useWorkspaceBootstrap";

export function usePersonalStateHydration() {
  const setPersonalState = useResourceStore((s) => s.setPersonalState);
  const { data } = useWorkspaceBootstrap();
  // Applied at most once per successfully-fetched bootstrap payload: the
  // bootstrap singleton is fetched once per session, but every mounted
  // consumer re-renders on each publish() — without this guard a second
  // mount (or a re-render on an unrelated snapshot change) would re-apply
  // the same rows and could clobber a personal archive made after hydration.
  const appliedRef = useRef(false);

  useEffect(() => {
    if (appliedRef.current) return;
    if (!data) return;
    appliedRef.current = true;

    const rows: PersonalItemState[] = data.personalState.map((r) => ({
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
  }, [data, setPersonalState]);
}
