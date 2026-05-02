/**
 * Dashboard home (`/`) — server component.
 *
 * Renders the editorial masthead + 4-up DashboardHero strip on the server,
 * then mounts <HomeSurface> for the client-state sections (Weekly Briefing,
 * What Changed, Supersessions). Replaces the previous Dashboard.tsx
 * delegation (case "home").
 *
 * Layout per design_handoff_2026-04/preview/dashboard-v3.html:
 *   - <EditorialMasthead> with title="Dashboard — Your Brief"
 *   - DashboardHero rendered inside the masthead's belowSlot for the 4-up
 *     critical/high/moderate/low tiles
 *   - AiPromptBar with chip suggestions
 *   - "This Week" section: WeeklyBriefing (1.3fr) | WhatChanged (1fr)
 *   - "Replaced" section: 5-up horizontal Supersessions strip
 */

import { getAppData } from "@/lib/data";
import { EditorialMasthead } from "@/components/ui/EditorialMasthead";
import { DashboardHero } from "@/components/home/DashboardHero";
import { HomeSurface } from "@/components/home/HomeSurface";

export const revalidate = 60;

export default async function Home() {
  const data = await getAppData();

  const dateStr = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const jurisdictionsCount = new Set(
    data.resources.map((r) => r.jurisdiction || "global")
  ).size;
  const meta = `${dateStr} · ${data.resources.length} regulations tracked · ${jurisdictionsCount} jurisdictions`;

  return (
    <>
      <EditorialMasthead
        title="Dashboard — Your Brief"
        meta={meta}
        belowSlot={<DashboardHero resources={data.resources} />}
      />
      <HomeSurface
        initialResources={data.resources}
        initialArchived={data.archived}
        changelog={data.changelog}
        disputes={data.disputes}
        supersessions={data.supersessions}
        auditDate={data.auditDate}
        initialOverrides={data.overrides}
      />
    </>
  );
}
