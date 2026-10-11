import type { Supersession, ItemConnection } from "@/types/resource";
import type { ItemRelevance } from "@/lib/workspace/profile";
import type { CrossPageData } from "@/components/detail/CrossPageSection";

export interface DetailSurfaceSharedProps {
  supersessions?: Supersession[];
  connections?: ItemConnection[];
  /** The viewer's relevance-to-your-operation lens (flywheel U9). Null when no org or a soft-fail. */
  relevance?: ItemRelevance | null;
  /** Gated titles for the connections and intersections (the customer read gate already applied). */
  resourceLookup?: Record<string, { id: string; title: string; priority: string }>;
  /** Stated intersection summary and theme analysis for the shared "Connected intelligence" section. */
  crossPage?: CrossPageData | null;
  initialWatched?: boolean;
  initialTeamWatched?: boolean;
  initialTeamAvailable?: boolean;
}
