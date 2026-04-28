// Pause-state checks shared by gated routes (worker scan, agent run,
// trust recompute). Manual admin actions bypass these — they're called
// only from automated paths.
//
// Graceful degradation: if migration 016 hasn't been applied yet,
// these helpers treat the system as unpaused (the safer default —
// pausing only when the data layer explicitly says so).

import type { SupabaseClient } from "@supabase/supabase-js";

export async function isGloballyPaused(supabase: SupabaseClient): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("system_state")
      .select("global_processing_paused")
      .eq("id", true)
      .maybeSingle();
    if (error) return false; // table missing or RLS-blocked → assume not paused
    return !!data?.global_processing_paused;
  } catch {
    return false;
  }
}

export async function isSourcePaused(
  supabase: SupabaseClient,
  sourceId: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("sources")
      .select("processing_paused")
      .eq("id", sourceId)
      .maybeSingle();
    if (error) return false;
    return !!data?.processing_paused;
  } catch {
    return false;
  }
}

/**
 * Convenience: returns null if neither flag is set, or a string reason if paused.
 */
export async function pauseReason(
  supabase: SupabaseClient,
  sourceId?: string
): Promise<string | null> {
  if (await isGloballyPaused(supabase)) {
    return "All source processing is globally paused.";
  }
  if (sourceId && (await isSourcePaused(supabase, sourceId))) {
    return "This source is paused.";
  }
  return null;
}
