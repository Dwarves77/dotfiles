/**
 * EudrCustodyPanel — spec 09 §1.8, EUDR geo-traceability + book-and-claim custody. "The operational
 * consequence is a border hold, not a later fine, and the product had been modelling fines." Lane
 * SPEC-09, wave 3, 2026-09-03.
 *
 * SELF-CONTAINED SERVER COMPONENT, same pattern as market/SurchargeAuditPanel.tsx.
 *
 * ORG SCOPE (migration 311, lane SPEC09-B, 2026-09-05): see market/SurchargeAuditPanel.tsx's header — the
 * same reasoning and the same resolveOrgIdFromCookies() resolver apply here, for BOTH tables.
 *
 * VIEW/FETCH SPLIT: this file is data-only (fetches both tables in parallel, hands both row arrays to the
 * view). The render code (and the two-tables/one-severity-classification note) lives in the separate file
 * `EudrCustodyPanelView.tsx` — see market/SurchargeAuditPanelView.tsx's header for why.
 */

import { isSupabaseConfigured, getServiceSupabase } from "@/lib/supabase-server";
import { resolveOrgIdFromCookies } from "@/lib/api/org";
import { EudrCustodyPanelView, type PlotClaimRow, type CustodyChainRow } from "./EudrCustodyPanelView";

const ROW_LIMIT = 25;

async function fetchPlotClaims(orgId: string | null): Promise<PlotClaimRow[]> {
  if (!isSupabaseConfigured() || !orgId) return [];
  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("eudr_plot_claims")
      .select("claim_id, consignment_ref, validation_state, hold_risk")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(ROW_LIMIT);
    if (error) {
      console.warn("EudrCustodyPanel plot-claims fetch error:", error.message);
      return [];
    }
    return (data ?? []) as PlotClaimRow[];
  } catch (e) {
    console.warn("EudrCustodyPanel plot-claims fetch exception:", e instanceof Error ? e.message : String(e));
    return [];
  }
}

async function fetchCustodyChains(orgId: string | null): Promise<CustodyChainRow[]> {
  if (!isSupabaseConfigured() || !orgId) return [];
  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("custody_chains")
      .select("custody_id, credit_type, scheme, double_count_check")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(ROW_LIMIT);
    if (error) {
      console.warn("EudrCustodyPanel custody-chains fetch error:", error.message);
      return [];
    }
    return (data ?? []) as CustodyChainRow[];
  } catch (e) {
    console.warn("EudrCustodyPanel custody-chains fetch exception:", e instanceof Error ? e.message : String(e));
    return [];
  }
}

export async function EudrCustodyPanel() {
  const orgId = await resolveOrgIdFromCookies();
  const [plotClaims, custodyChains] = await Promise.all([fetchPlotClaims(orgId), fetchCustodyChains(orgId)]);
  return <EudrCustodyPanelView plotClaims={plotClaims} custodyChains={custodyChains} />;
}
