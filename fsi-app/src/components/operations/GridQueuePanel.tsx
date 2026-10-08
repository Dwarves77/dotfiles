/**
 * GridQueuePanel — spec 09 §1.6, the electrification feasibility GATE ("a region with cheap power and a
 * 36-month queue is BLOCKED for a 2027 electrification decision regardless of €/kWh"). Lane SPEC-09,
 * wave 3, 2026-09-03.
 *
 * SELF-CONTAINED SERVER COMPONENT, same pattern as market/OemRoadmapPanel.tsx.
 *
 * VIEW/FETCH SPLIT: this file is data-only. The render code (and the decision-horizon note) lives in the
 * separate file `GridQueuePanelView.tsx`, see market/OemRoadmapPanelView.tsx's header for why.
 */

import { isSupabaseConfigured, getServiceSupabase } from "@/lib/supabase-server";
import { GridQueuePanelView, type GridQueueRow } from "./GridQueuePanelView";

const ROW_LIMIT = 25;

async function fetchRows(): Promise<GridQueueRow[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("grid_connection_queues")
      .select("queue_id, dso_name, capacity_band_mw, queue_months_p50, queue_months_p90, as_of, substation_name, demand_firm_mw, demand_available_mw, demand_constraint, demand_constraint_limiting_factor")
      // Band-level rows (NULL headroom) first, then the most constrained substations: with 25 rows shown, the
      // rows that carry queue months are never pushed out by the per-substation evidence rows.
      .order("demand_available_mw", { ascending: true, nullsFirst: true })
      .order("as_of", { ascending: false })
      .limit(ROW_LIMIT);
    if (error) {
      console.warn("GridQueuePanel fetch error:", error.message);
      return [];
    }
    return (data ?? []) as GridQueueRow[];
  } catch (e) {
    console.warn("GridQueuePanel fetch exception:", e instanceof Error ? e.message : String(e));
    return [];
  }
}

export async function GridQueuePanel() {
  const rows = await fetchRows();
  return <GridQueuePanelView rows={rows} />;
}
