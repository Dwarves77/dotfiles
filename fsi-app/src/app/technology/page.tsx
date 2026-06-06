import { TechnologyView } from "@/components/technology/TechnologyView";
import type { ResearchPipelineItem } from "@/components/research/ResearchView";
import {
  getTechnologyItems,
  getScopedWorkspaceAggregates,
} from "@/lib/data";

// Force-dynamic: reads auth cookies for orgId resolution (same rationale
// as /research — resolveOrgIdFromCookies is called inside the cache
// wrapper; static generation bakes in orgId=null and returns empty).
export const dynamic = "force-dynamic";

// Technology scope: item_type IN ('technology','innovation','tool') and
// domain 2 (Energy & Technology Innovation). The scoped aggregates RPC
// degrades to item_type-only when domain filter is additive.
const TECHNOLOGY_SCOPE = {
  item_types: ["technology", "innovation", "tool"] as string[],
  domains: [2] as number[],
};

export default async function Technology() {
  const t0 = Date.now();

  const [technology, aggregates] = await Promise.all([
    getTechnologyItems(),
    getScopedWorkspaceAggregates(TECHNOLOGY_SCOPE),
  ]);

  console.log(
    `[perf] /technology data ${Date.now() - t0}ms (technology=${technology.total})`
  );

  // Adapter: Resource → ResearchPipelineItem. rpcRowToResource (supabase-
  // server.ts) maps the RPC row shape to Resource; ResearchPipelineItem is
  // structurally equivalent so this is a field projection. owner /
  // partnerFlagged are placeholders preserved from the research page pattern.
  // baseTier / effectiveTier / biasTags are not surfaced on Resource from the
  // category-routed RPC; they default to null / [] (fail-closed: the card
  // suppresses those chips when null, which is correct).
  const items: ResearchPipelineItem[] = technology.resources.map((r) => ({
    id: r.id,
    title: r.title,
    summary: r.note,
    pipelineStage: null,
    transportModes: r.modes || [],
    jurisdictions: r.jurisdiction ? [r.jurisdiction] : [],
    sourceName: r.sourceName ?? null,
    sourceUrl: r.sourceUrl ?? r.url ?? null,
    addedDate: r.added ?? null,
    citationCount: r.citationCount ?? null,
    lastCitedAt: r.lastCitedAt ?? null,
    baseTier: null,
    effectiveTier: null,
    biasTags: [],
    owner: null,
    partnerFlagged: false,
    whatItChanges: r.whatItChanges ?? null,
    doesNotResolve: r.doesNotResolve ?? null,
  }));

  return (
    <TechnologyView
      items={items}
      aggregates={aggregates}
      total={technology.total}
    />
  );
}
