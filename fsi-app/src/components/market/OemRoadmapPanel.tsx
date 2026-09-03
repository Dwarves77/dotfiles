/**
 * OemRoadmapPanel — spec 09 §1.1, OEM equipment roadmap (TRL 7-9, the bridge between Research and Market
 * Intel spot rates). Lane SPEC-09, wave 3, 2026-09-03.
 *
 * SELF-CONTAINED SERVER COMPONENT, same pattern as SurchargeAuditPanel.tsx (see that file's header for
 * the fetch/soft-fail contract this one shares).
 *
 * WHAT THIS PANEL DOES NOT COMPUTE: `oem_tech_roadmaps` (migration 296) carries usable_kwh and
 * energy_density_wh_kg, but NOT a vehicle's diesel-powertrain-kg / e-powertrain-kg / legal-payload-kg
 * baseline — those are vehicle-CLASS facts this table's columns do not carry, so
 * src/lib/spec09/oem-payload.mjs's computePayloadPenalty() cannot be called from a bare roadmap row (it
 * would need a second, vehicle-class-keyed input this migration does not add). The view shows the
 * density basis and confidence as-is (never fabricating the missing vehicle-class inputs) and calls
 * tcoCrossoverBand() — which takes no per-row input by design (spec 09 §1.1: "not forecastable" this
 * build) — once, as a standing notice.
 *
 * CONFIDENCE FLOOR: spec 09 §5 open decision 4 is unset. The view states that plainly next to
 * confidence_admiralty rather than picking a threshold no operator ruling has made.
 *
 * VIEW/FETCH SPLIT: this file is data-only. The render code lives in the separate file
 * `OemRoadmapPanelView.tsx` — see SurchargeAuditPanelView.tsx's header for why the split is a separate
 * module rather than a second export here.
 */

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
