"use client";

/**
 * HomeSurface — client wrapper that mounts the resource store, then renders
 * the dashboard sections that need client state (WeeklyBriefing toggle,
 * WhatChanged toggle, Supersessions toggle, scoring with sector context).
 *
 * The page-level <EditorialMasthead> + <DashboardHero> + <AiPromptBar> live
 * in the server component (app/page.tsx). This subcomponent only owns the
 * "This Week" two-column section + the "Replaced" supersessions strip.
 *
 * Wiring matches design_handoff_2026-04/preview/dashboard-v3.html:
 *   - Section "This Week": SectionHeader + 1.3fr/1fr grid (WeeklyBriefing left)
 *   - Section "Replaced": SectionHeader + horizontal 5-up Supersessions row
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import { Toast } from "@/components/ui/Toast";
import { SectionHeader } from "@/components/shell/SectionHeader";
import { WeeklyBriefing } from "@/components/home/WeeklyBriefing";
import { WhatChanged } from "@/components/home/WhatChanged";
import { Supersessions } from "@/components/home/Supersessions";
import { useResourceStore, mergeWithOverrides } from "@/stores/resourceStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { urgencyScore, scoreResource } from "@/lib/scoring";
import type {
  Resource,
  ChangeLogEntry,
  Dispute,
  Supersession,
} from "@/types/resource";

interface HomeSurfaceProps {
  initialResources: Resource[];
  initialArchived: Resource[];
  changelog: Record<string, ChangeLogEntry[]>;
  disputes: Record<string, Dispute>;
  supersessions: Supersession[];
  auditDate: string;
  initialOverrides?: {
    itemId: string;
    priorityOverride: string | null;
    isArchived: boolean;
    archiveReason: string | null;
    archiveNote: string | null;
    notes: string;
  }[];
}

export function HomeSurface({
  initialResources,
  initialArchived,
  changelog,
  disputes,
  supersessions,
  auditDate,
  initialOverrides = [],
}: HomeSurfaceProps) {
  const {
    resources: platformResources,
    archived: platformArchived,
    setResources,
    setArchived,
    overrides,
    setOverrides,
  } = useResourceStore();
  const sectorProfile = useWorkspaceStore((s) => s.sectorProfile);
  const sectorWeights = useWorkspaceStore((s) => s.sectorWeights);
  const jurisdictionWeights = useWorkspaceStore((s) => s.jurisdictionWeights);

  const [toast, setToast] = useState<{ message: string; visible: boolean }>({
    message: "",
    visible: false,
  });
  const showToast = useCallback((message: string) => {
    setToast({ message, visible: true });
  }, []);

  // Hydrate the resource store from server-fetched data.
  useEffect(() => {
    const sectorCtx = { activeSectors: sectorProfile, sectorWeights };
    const scored = initialResources.map((r) => ({
      ...r,
      urgencyScore: urgencyScore(r, jurisdictionWeights, sectorCtx),
      impactScores: scoreResource(r),
    }));
    setResources(scored);
    setArchived(initialArchived);
    if (initialOverrides.length > 0) setOverrides(initialOverrides);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialResources, initialArchived]);

  const effectiveResources =
    platformResources.length > 0 ? platformResources : initialResources;
  const effectiveArchived =
    platformArchived.length > 0 ? platformArchived : initialArchived;
  const { active: resources, archived: workspaceArchived } = useMemo(
    () => mergeWithOverrides(effectiveResources, overrides),
    [effectiveResources, overrides]
  );
  const archived = useMemo(
    () => [...effectiveArchived, ...workspaceArchived],
    [effectiveArchived, workspaceArchived]
  );

  const resourceMap = useMemo(() => {
    const map = new Map<string, Resource>();
    resources.forEach((r) => map.set(r.id, r));
    archived.forEach((r) => map.set(r.id, r));
    return map;
  }, [resources, archived]);

  const todayLabel = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  return (
    <div className="px-9 pt-8 pb-16 max-w-[1280px] mx-auto">
      {/* AI prompt bar removed from Dashboard per Phase D placement rule.
          The Weekly Briefing already curates "what should I know" in
          editorial format. AI inquiry surfaces live on the regulatory and
          operational pages: /regulations, /regulations/[slug], /market,
          /research, /operations, /map. */}

      {/* This Week — Weekly Briefing (1.3fr) + What Changed (1fr) */}
      <section style={{ marginBottom: 40 }}>
        <SectionHeader
          title="This Week"
          aside={
            <>
              Weekly briefing · <b>{todayLabel}</b>
            </>
          }
        />
        <div
          className="cl-this-week-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "1.3fr 1fr",
            gap: 18,
          }}
        >
          <style>{`
            @media (max-width: 900px) {
              .cl-this-week-grid { grid-template-columns: 1fr !important; gap: 14px !important; }
            }
          `}</style>
          <WeeklyBriefing
            resources={resources}
            changelog={changelog}
            disputes={disputes}
            auditDate={auditDate}
            onToast={showToast}
          />
          <WhatChanged
            resources={resources}
            changelog={changelog}
            auditDate={auditDate}
          />
        </div>
      </section>

      {/* Replaced — 5-up horizontal Supersessions strip */}
      {supersessions.length > 0 && (
        <section style={{ marginBottom: 40 }}>
          <SectionHeader
            title="Replaced"
            aside={
              <>
                <b>{supersessions.length}</b> regulations superseded by newer
                versions
              </>
            }
          />
          <Supersessions
            supersessions={supersessions}
            resourceMap={resourceMap}
          />
        </section>
      )}

      <Toast
        message={toast.message}
        visible={toast.visible}
        onDismiss={() => setToast({ message: "", visible: false })}
      />
    </div>
  );
}

