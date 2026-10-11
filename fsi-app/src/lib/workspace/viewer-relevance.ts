import { createClient } from "@supabase/supabase-js";
import { resolveOrgIdFromCookies } from "@/lib/api/org";
import { getWorkspaceProfile, relevanceForItem, type ItemRelevance } from "@/lib/workspace/profile";

/** The subset of intelligence_items columns relevanceForItem reads (relevance.mjs's documented input
 *  shape) — returned alongside the mapped Resource by fetchIntelligenceItem as `relevanceInput`. */
export interface RelevanceInput {
  title?: string | null;
  transport_modes?: string[] | null;
  jurisdictions?: string[] | null;
  jurisdiction_iso?: string[] | null;
  topic_tags?: string[] | null;
  operational_scenario_tags?: string[] | null;
  compliance_object_tags?: string[] | null;
}

export async function getViewerRelevanceForItem(item: RelevanceInput | null | undefined): Promise<ItemRelevance | null> {
  if (!item) return null;
  try {
    const orgId = await resolveOrgIdFromCookies();
    if (!orgId || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );
    const profile = await getWorkspaceProfile(supabase, orgId);
    return relevanceForItem(item as Record<string, unknown>, profile);
  } catch {
    // Fail-soft — a relevance-lens failure must never fail the detail page render.
    return null;
  }
}
