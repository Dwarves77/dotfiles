/**
 * IndexationPanel — spec 09 §1.3, dynamic carbon contract indexation. Lane SPEC09-B, 2026-09-05 (the
 * reader this table lacked — see docs/plans/complete-system-build-plan-2026-09-04.md W5.1 and
 * scripts/spec09/SOURCES.md's own forward reference to this file).
 *
 * SELF-CONTAINED SERVER COMPONENT, same pattern as OemRoadmapPanel.tsx (fetch/soft-fail/view-split,
 * request-scoped service client via supabase-server.ts, small LIMIT, no polling, no client fetch).
 *
 * ORG SCOPE (migration 311): this component reads with the service-role client (bypasses RLS), so it is
 * its own job to filter to the viewer's org via resolveOrgIdFromCookies(). Rows come only from an
 * operator-dispatched external-source rows file (ADR-042); there is no customer entry path.
 *
 * EMPTY STATE: today's live table has 0 rows for every org (0 rows confirmed live, read-only SELECT,
 * 2026-09-05). Renders ONE short line naming that, not an empty card.
 *
 * VIEW/FETCH SPLIT: this file is data-only. The render code lives in the separate file
 * `IndexationPanelView.tsx`, see OemRoadmapPanelView.tsx's header for why the split is a separate
 * module (the @opentelemetry/api resolution failure proven live while building the UX smoke spec).
 */

import { isSupabaseConfigured, getServiceSupabase } from "@/lib/supabase-server";
import { resolveOrgIdFromCookies } from "@/lib/api/org";
import { IndexationPanelView, type IndexationClauseRow } from "./IndexationPanelView";

const ROW_LIMIT = 25;

async function fetchRows(orgId: string | null): Promise<IndexationClauseRow[]> {
  if (!isSupabaseConfigured() || !orgId) return [];
  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("indexation_clauses")
      .select("clause_id, contract_ref, corridor_id, index_id, base_value, base_date, passthrough_pct, cap_pct, floor_pct, review_cadence, rounding_rule")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(ROW_LIMIT);
    if (error) {
      console.warn("IndexationPanel fetch error:", error.message);
      return [];
    }
    return (data ?? []) as IndexationClauseRow[];
  } catch (e) {
    console.warn("IndexationPanel fetch exception:", e instanceof Error ? e.message : String(e));
    return [];
  }
}

export async function IndexationPanel() {
  const orgId = await resolveOrgIdFromCookies();
  const rows = await fetchRows(orgId);
  return <IndexationPanelView rows={rows} />;
}
