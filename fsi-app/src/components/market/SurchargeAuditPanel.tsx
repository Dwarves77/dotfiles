/**
 * SurchargeAuditPanel — spec 09 §1.2, built FIRST per spec §4 ("the only [Market Intel component] with
 * an immediate cash payback to the user"). Lane SPEC-09, wave 3, 2026-09-03.
 *
 * SELF-CONTAINED SERVER COMPONENT (the ObligationRegister.tsx precedent, this lane's own naming): reads
 * `surcharge_audits` (migration 296) with the service-role client via the existing supabase-server.ts
 * pattern (isSupabaseConfigured / getServiceSupabase, the SAME helpers fetchMarketSeriesBoard uses — see
 * that fetcher's own header). Soft-fails to the honest empty state on any read error, never breaks the
 * page. Small payload (LIMIT below), no polling, no client fetch.
 *
 * THE ISOLATION DISCIPLINE THIS COMPONENT ENFORCES ON THE SCREEN: this panel NEVER selects, receives, or
 * renders `pool_adjusted_eur` — src/lib/spec09/surcharge-audit.mjs's poolAdjustedGuard() refuses to
 * surface it (spec 09 §5 open decision 1's conservative default), and this component does not even query
 * the column, so there is no code path here that could accidentally leak it. Every row renders ONLY the
 * defensible sentence (formatDefensibleStatement: billed vs statutory, both observed/statutory_formula),
 * never the disallowed "your carrier is overcharging you" accusation.
 *
 * EMPTY STATE: today's live table has 0 rows for every org (scripts/spec09/SOURCES.md — populated only
 * once a workspace member uploads their own invoice via POST /api/workspace/spec09-upload). Renders ONE
 * short line naming that, not an empty card.
 *
 * ORG SCOPE (migration 311, lane SPEC09-B, 2026-09-05): surcharge_audits carries billed/statutory EUR
 * figures a customer uploaded for their OWN organization — this component reads with the service-role
 * client (bypasses RLS), so it is THIS COMPONENT's own job, not the database's, to filter to the viewer's
 * org. resolveOrgIdFromCookies() (the same server-scoped, cache()-memoized resolver every workspace-scoped
 * server component in this codebase uses) supplies the org id; a viewer signed in with no org membership
 * sees the honest empty state, never another org's rows.
 *
 * VIEW/FETCH SPLIT: this file is data-only (fetch, soft-fail, hand rows to the view). The render code
 * lives in the SEPARATE file `SurchargeAuditPanelView.tsx` — see that file's own header for why the split
 * is a separate module rather than a second export here (an `@opentelemetry/api` resolution failure,
 * proven live while building the UX smoke spec).
 */

import { isSupabaseConfigured, getServiceSupabase } from "@/lib/supabase-server";
import { resolveOrgIdFromCookies } from "@/lib/api/org";
import { SurchargeAuditPanelView, type SurchargeAuditRow } from "./SurchargeAuditPanelView";

const ROW_LIMIT = 25;

async function fetchRows(orgId: string | null): Promise<SurchargeAuditRow[]> {
  if (!isSupabaseConfigured() || !orgId) return [];
  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("surcharge_audits")
      .select("audit_id, invoice_line, billed_eur, statutory_eur, statutory_basis, variance_eur, corridor_id, carrier_id")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(ROW_LIMIT);
    if (error) {
      console.warn("SurchargeAuditPanel fetch error:", error.message);
      return [];
    }
    return (data ?? []) as SurchargeAuditRow[];
  } catch (e) {
    console.warn("SurchargeAuditPanel fetch exception:", e instanceof Error ? e.message : String(e));
    return [];
  }
}

export async function SurchargeAuditPanel() {
  const orgId = await resolveOrgIdFromCookies();
  const rows = await fetchRows(orgId);
  return <SurchargeAuditPanelView rows={rows} />;
}
