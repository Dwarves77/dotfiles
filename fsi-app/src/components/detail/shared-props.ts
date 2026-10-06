/**
 * DetailSurfaceSharedProps: the inputs every detail surface (Regulations, Market Intel, Research,
 * Operations) takes from its route page in the same shape, declared ONCE (lane S3-B). Each surface's Props
 * extends this instead of retyping the run, which F45 (duplicate-code) counted as a clone once the shared
 * "Across pages" input joined it. A surface that needs one of these required (Regulations does for the
 * connections and lookup) narrows it in its own Props, which TypeScript allows.
 */
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
  /** Stated intersection summary and theme analysis for the shared "Across pages" section. */
  crossPage?: CrossPageData | null;
  initialWatched?: boolean;
  initialTeamWatched?: boolean;
  initialTeamAvailable?: boolean;
}
