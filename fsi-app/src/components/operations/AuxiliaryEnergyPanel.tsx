/**
 * AuxiliaryEnergyPanel — spec 09 §1.5, stationary auxiliary load (never a per-tonne-km factor). Lane
 * SPEC-09, wave 3, 2026-09-03.
 *
 * SELF-CONTAINED SERVER COMPONENT, same pattern as market/SurchargeAuditPanel.tsx (see that file's header
 * for the fetch/soft-fail contract this one shares: request-scoped service client via supabase-server.ts,
 * small LIMIT, no polling, no client fetch).
 *
 * WHAT THE VIEW COMPUTES: src/lib/spec09/auxiliary-energy.mjs's computeEnergyConsumedKwh() per row
 * (kw_draw * duty_cycle * hours_typical — the one figure this table's own columns fully supply).
 * convertKwhToGco2e() needs a live grid_intensity gCO2e/kWh number this table only NAMES a source for
 * (grid_intensity_source, migration 297's own comment) and does not itself carry a value for, so the
 * gCO2e conversion is not attempted — the view states plainly that the kWh figure is the load, not its
 * footprint, rather than silently treating an unconverted kWh number as a carbon figure.
 *
 * ORG SCOPE (migration 308, lane SPEC09-B, 2026-09-05): see SurchargeAuditPanel.tsx's header — the same
 * reasoning and the same resolveOrgIdFromCookies() resolver apply here.
 *
 * VIEW/FETCH SPLIT: this file is data-only. The render code lives in the separate file
 * `AuxiliaryEnergyPanelView.tsx` — see market/SurchargeAuditPanelView.tsx's header for why.
 */

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
