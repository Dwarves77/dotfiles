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
