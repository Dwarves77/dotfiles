/**
 * DqiPanel — spec 09 §1.4, DQI / primary-data share per transport chain element (ISO 14083 / GLEC v3).
 * Lane SPEC-09, wave 3, 2026-09-03.
 *
 * SELF-CONTAINED SERVER COMPONENT, same pattern as market/SurchargeAuditPanel.tsx.
 *
 * WHAT THE VIEW DOES NOT DO: src/lib/spec09/dqi.mjs's rollupDqi() rolls many elements up to a SHIPMENT
 * share weighted by tonne-km — but `tce_data_quality` (migration 297) carries no tonne-km or shipment-
 * grouping column (its v1 shape is per-element only, matching spec text's own DDL), so a shipment-level
 * rollup cannot be computed from this table as it stands. The view renders each element on its own axis
 * values, using dqi.mjs's isPrimaryLeg() for the same >=0.5 threshold rollupDqi() itself uses, so a
 * future shipment-grouped view (once a grouping key exists) applies the identical cutoff.
 *
 * ORG SCOPE (migration 308, lane SPEC09-B, 2026-09-05): see market/SurchargeAuditPanel.tsx's header — the
 * same reasoning and the same resolveOrgIdFromCookies() resolver apply here.
 *
 * VIEW/FETCH SPLIT: this file is data-only. The render code lives in the separate file `DqiPanelView.tsx`
 * — see market/SurchargeAuditPanelView.tsx's header for why the split is a separate module.
 */

import { isSupabaseConfigured, getServiceSupabase } from "@/lib/supabase-server";
import { resolveOrgIdFromCookies } from "@/lib/api/org";
import { DqiPanelView, type DqiRow } from "./DqiPanelView";

const ROW_LIMIT = 25;

async function fetchRows(orgId: string | null): Promise<DqiRow[]> {
  if (!isSupabaseConfigured() || !orgId) return [];
  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("tce_data_quality")
      .select("dqi_id, tce_id, reliability, completeness, temporal_correlation, geographical_correlation, technological_correlation, primary_data_share")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(ROW_LIMIT);
    if (error) {
      console.warn("DqiPanel fetch error:", error.message);
      return [];
    }
    return (data ?? []) as DqiRow[];
  } catch (e) {
    console.warn("DqiPanel fetch exception:", e instanceof Error ? e.message : String(e));
    return [];
  }
}

export async function DqiPanel() {
  const orgId = await resolveOrgIdFromCookies();
  const rows = await fetchRows(orgId);
  return <DqiPanelView rows={rows} />;
}
