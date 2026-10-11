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
