"use client";

/**
 * DashboardMasthead — the dashboard route's own composition of the shared
 * <Masthead/> (UI system handoff 2026-09-06, README screen 1): personalises
 * the title, and builds the dek line, from data the shared Masthead has no
 * business knowing about (signed-in profile, workspace, aggregates). Not a
 * fork of Masthead — it renders Masthead and nothing else, passing computed
 * props. Other pages compose Masthead directly with their own title/dek.
 *
 * Title: "<First name>'S BRIEF" from the bootstrap API's own-membership row
 * (src/app/api/workspace/bootstrap — org_memberships joined to profiles,
 * display_name already resolved full_name ?? display_name ?? email server-
 * side). Falls back to the workspace name, then the literal "YOUR BRIEF".
 *
 * Dek: "<items> items across <surfaces> surfaces · <jurisdictions>
 * jurisdictions · scoped to <workspace>" then "Verticals: <sector labels>".
 * Any clause whose accessor has nothing renders the Absence convention
 * (README §0.4) rather than a fabricated or zeroed figure — logged in
 * DEVIATION-LOG.md when the gap is structural, not a per-viewer transient.
 */

import { useMemo } from "react";
import { Masthead } from "@/components/ui/Masthead";
import { Absence } from "@/components/ui/Absence";
import { useAuth } from "@/components/auth/AuthProvider";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useWorkspaceBootstrap } from "@/lib/hooks/useWorkspaceBootstrap";
import { ALL_SECTORS } from "@/lib/constants";
import { formatNumber } from "@/lib/format";
import { deriveBriefTitle, firstTokenOf } from "@/components/dashboard/brief-title";

// The product has five surfaces (README overview: "1,434 items across five
// surfaces"): Regulations, Market, Research, Operations, Community. This is
// a structural fact about the product's shape, not sample/mock data, so it
// is a named constant rather than a value read off a row count.
const SURFACE_COUNT = 5;

export interface DashboardMastheadProps {
  dateLabel: string;
  itemCount: number;
  /** aggregates.totalItems > 0 gates whether totalJurisdictions is trusted
   *  (mirrors page.tsx's own itemsCount fail-soft: an all-zero aggregates
   *  read means "not loaded / RPC error", not "zero jurisdictions"). */
  aggregatesLoaded: boolean;
  totalJurisdictions: number;
  /** Server render instant (src/lib/render-now.ts) — passed straight through to <Masthead/>. */
  nowIso?: string;
}

export function DashboardMasthead({ dateLabel, itemCount, aggregatesLoaded, totalJurisdictions, nowIso }: DashboardMastheadProps) {
  const { user } = useAuth();
  const orgName = useWorkspaceStore((s) => s.orgName);
  const sectorProfile = useWorkspaceStore((s) => s.sectorProfile);
  const { data: bootstrap } = useWorkspaceBootstrap();

  const firstName = useMemo(() => {
    const self = bootstrap?.members?.find((m) => m.user_id === user?.id);
    return firstTokenOf(self?.display_name);
  }, [bootstrap, user]);

  const title = deriveBriefTitle(firstName, orgName);

  const verticals = sectorProfile
    .map((id) => ALL_SECTORS.find((s) => s.id === id)?.label)
    .filter((label): label is string => Boolean(label));

  const dek = (
    <>
      <div>
        {formatNumber(itemCount)} items across {SURFACE_COUNT} surfaces ·{" "}
        {aggregatesLoaded ? `${formatNumber(totalJurisdictions)} jurisdictions` : <Absence reason="pending" />} · scoped to{" "}
        {orgName ? orgName : <Absence reason="connect data" />}
      </div>
      <div style={{ marginTop: 2 }}>
        Verticals: {verticals.length > 0 ? verticals.join(", ") : <Absence reason="not in primary source" />}
      </div>
    </>
  );

  return (
    <Masthead
      title={title}
      dateLabel={dateLabel}
      nowIso={nowIso}
      dek={dek}
      commandBar={{ itemCount, scope: "dashboard" }}
    />
  );
}
