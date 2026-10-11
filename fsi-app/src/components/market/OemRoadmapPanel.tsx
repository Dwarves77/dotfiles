import { isSupabaseConfigured, getServiceSupabase } from "@/lib/supabase-server";
import { OemRoadmapPanelView, type OemRoadmapRow } from "./OemRoadmapPanelView";

const ROW_LIMIT = 25;

async function fetchRows(): Promise<OemRoadmapRow[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("oem_tech_roadmaps")
      .select("roadmap_id, tech_category, commercial_stage, target_year, density_basis, confidence_admiralty, announced_at")
      .order("announced_at", { ascending: false })
      .limit(ROW_LIMIT);
    if (error) {
      console.warn("OemRoadmapPanel fetch error:", error.message);
      return [];
    }
    return (data ?? []) as OemRoadmapRow[];
  } catch (e) {
    console.warn("OemRoadmapPanel fetch exception:", e instanceof Error ? e.message : String(e));
    return [];
  }
}

export async function OemRoadmapPanel() {
  const rows = await fetchRows();
  return <OemRoadmapPanelView rows={rows} />;
}
