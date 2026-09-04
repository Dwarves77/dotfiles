"use client";

// useWorkspaceOverridesHydration — PERF-10 (2026-09-04, ADR-026 Follow-up / migration 306).
//
// Mirrors usePersonalStateHydration.ts's pattern exactly (same file's header explains the
// shared rationale for reading off the useWorkspaceBootstrap() singleton instead of a
// dedicated fetch). This hook is the NEW half: before this lane, the workspace override
// layer (priority overrides, archive state, owner, notes) arrived as an SSR prop —
// `initialOverrides`, resolved server-side per page by fetchWorkspaceOverrideRows/fetchDashboardData
// /fetchResourcesOnly/fetchListingsOnly, all of which require an authenticated org id and
// therefore a cookies() read in the page's own server render. That per-page cookies() read is
// exactly what forced /regulations, /market, /operations, /research, /community and the four
// /[slug] detail routes to build `ƒ` (see the four index page.tsx files' PERF-10 headers and
// this lane's REPORT for the root-cause writeup).
//
// THE FIX: index/detail pages now render from the org-INDEPENDENT public RPCs (migration 306,
// fetchPublicResourcesOnly/fetchPublicListingsOnly, cached via unstable_cache with no orgId in
// the key — see src/lib/data.ts). The per-org override layer moves entirely off the server
// render path and into this ONE client hydration hook, mounted once near the app root
// (AppShell.tsx) so every surface that reads useResourceStore's `overrides` map — the SAME map
// mergeWithOverrides, OwnerTeamCard, and NotesField already consumed pre-this-lane — gets it
// without each page re-deriving it.
//
// UX-LAWS COMPLIANCE (docs/design/ux-laws.md, "never render empty or wrong while the per-viewer
// layer loads"): the public RPC's rows render on FIRST paint, already correct for an anonymous
// or logged-out viewer (platform priority/archive state, no owner, no override note — a true,
// not fabricated, view). A logged-in viewer's OWN overrides apply the moment this hook's
// effect fires (client fetch is off the ALREADY-SHARED bootstrap singleton — no extra round
// trip beyond what PERF-9 already pays for personal-state/list-order/members). Until then the
// surface shows the honest platform-only state, never a blank list and never a fabricated one —
// the same contract usePersonalStateHydration already keeps for the personal-archive layer.
//
// Fail-soft by design: signed out, offline, or a non-200 leave the store's empty overrides map
// in place — every consumer's existing "no override" fallback applies unchanged.

import { useEffect, useRef } from "react";
import { useResourceStore } from "@/stores/resourceStore";
import { useWorkspaceBootstrap } from "@/lib/hooks/useWorkspaceBootstrap";

export function useWorkspaceOverridesHydration() {
  const setOverrides = useResourceStore((s) => s.setOverrides);
  const { data } = useWorkspaceBootstrap();
  // Same once-per-payload guard as usePersonalStateHydration: the bootstrap singleton is
  // fetched once per session but every mounted consumer re-renders on each publish() — without
  // this guard a later re-render (or a second mount) would re-apply the same snapshot and could
  // clobber an optimistic override write (updatePriority/archiveResource) made after hydration.
  const appliedRef = useRef(false);

  useEffect(() => {
    if (appliedRef.current) return;
    if (!data) return;
    appliedRef.current = true;

    const rows = data.overrides ?? [];
    // Mirrors usePersonalStateHydration's `rows.length > 0` guard: an empty response is the
    // store's default anyway, and skipping the write means a slow response can never clobber
    // an optimistic override made by this user while it was in flight.
    if (rows.length > 0) {
      setOverrides(
        rows.map((r) => ({
          itemId: r.itemId,
          priorityOverride: r.priorityOverride,
          isArchived: r.isArchived,
          archiveReason: r.archiveReason,
          archiveNote: r.archiveNote,
          notes: r.notes,
          dismissedAt: r.dismissedAt,
          ownerUserId: r.ownerUserId,
          ownerName: r.ownerName,
        }))
      );
    }
  }, [data, setOverrides]);
}
