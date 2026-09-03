/**
 * ReroutingPanel — spec 09 §1.7, geopolitical rerouting multipliers, "the compounding case that forced
 * the corridor fix" (spec text). Lane SPEC-09, wave 3, 2026-09-03.
 *
 * SELF-CONTAINED SERVER COMPONENT, same pattern as SurchargeAuditPanel.tsx.
 *
 * Renders each reroute_events row plus applyFuelBurnMultiplier()'s scaled figure against a nominal
 * baseline (100, a unitless index — this table carries no per-corridor baseline fuel-burn figure of its
 * own, that lives on the corridor/emission-factor side, out of this table's columns), and the five-surface
 * compoundingChain() as a standing notice — NOT computed further here (spec text: "a single scalar
 * multiplier applied at the end would get this wrong").
 *
 * VIEW/FETCH SPLIT: this file is data-only. The render code lives in the separate file
 * `ReroutingPanelView.tsx` — see SurchargeAuditPanelView.tsx's header for why the split is a separate
 * module rather than a second export here.
 */

import { isSupabaseConfigured, getServiceSupabase } from "@/lib/supabase-server";
import { ReroutingPanelView, type RerouteRow } from "./ReroutingPanelView";

const ROW_LIMIT = 25;

async function fetchRows(): Promise<RerouteRow[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("reroute_events")
      .select("reroute_id, baseline_corridor_id, reroute_corridor_id, cause, fuel_burn_multiplier, effective_from, effective_to")
      .order("effective_from", { ascending: false })
      .limit(ROW_LIMIT);
    if (error) {
      console.warn("ReroutingPanel fetch error:", error.message);
      return [];
    }
    return (data ?? []) as RerouteRow[];
  } catch (e) {
    console.warn("ReroutingPanel fetch exception:", e instanceof Error ? e.message : String(e));
    return [];
  }
}

export async function ReroutingPanel() {
  const rows = await fetchRows();
  return <ReroutingPanelView rows={rows} />;
}
