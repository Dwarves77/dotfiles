// viewer-relevance.ts — flywheel U9 (D1) server helper. Resolves the CURRENT viewer's org, fetches
// their workspace profile, and computes relevanceForItem — the one call each of the four intelligence
// surfaces' [slug]/page.tsx makes to light up the read-time lens (profile.ts, Option B mig 251).
//
// DELIBERATELY NOT part of fetchIntelligenceItem/fetchIntelligenceItemUncached (supabase-server.ts):
// that fetcher is wrapped in unstable_cache keyed ONLY by itemUiId — baking a viewer-specific relevance
// computation into it would leak one org's relevance band into every other org's cached read of the same
// item (a real cross-tenant correctness bug, not a style preference). relevanceInput (the raw tag columns
// relevanceForItem needs — item-level facts, safe to cache) IS returned by fetchIntelligenceItem; this
// helper is the per-request, uncached second half: resolve orgId → getWorkspaceProfile → relevanceForItem.
//
// Fail-soft throughout, matching getWorkspaceProfile's own posture: a viewer with no org, or any read
// error, gets `null` back (RelevanceBadge renders nothing) rather than failing the whole page render.

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
