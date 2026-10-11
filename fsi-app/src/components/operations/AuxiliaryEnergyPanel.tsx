import { isSupabaseConfigured, getServiceSupabase } from "@/lib/supabase-server";
import { resolveOrgIdFromCookies } from "@/lib/api/org";
import { AuxiliaryEnergyPanelView, type AuxiliaryEnergyRow } from "./AuxiliaryEnergyPanelView";

const ROW_LIMIT = 25;

async function fetchRows(orgId: string | null): Promise<AuxiliaryEnergyRow[]> {
  if (!isSupabaseConfigured() || !orgId) return [];
  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("auxiliary_energy_profiles")
      .select("profile_id, load_type, kw_draw, duty_cycle, hours_typical, setpoint_c, setpoint_rh_pct, grid_intensity_source")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(ROW_LIMIT);
    if (error) {
      console.warn("AuxiliaryEnergyPanel fetch error:", error.message);
      return [];
    }
    return (data ?? []) as AuxiliaryEnergyRow[];
  } catch (e) {
    console.warn("AuxiliaryEnergyPanel fetch exception:", e instanceof Error ? e.message : String(e));
    return [];
  }
}

export async function AuxiliaryEnergyPanel() {
  const orgId = await resolveOrgIdFromCookies();
  const rows = await fetchRows(orgId);
  return <AuxiliaryEnergyPanelView rows={rows} />;
}
