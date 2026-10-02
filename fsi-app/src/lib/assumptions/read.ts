// src/lib/assumptions/read.ts, the reader for one workspace's planning assumptions
// (planning_assumption_register, migration 345), for lane W2-R's planning-assumption-shift renderer
// (docs/specs/03-research.md section 5/7#7) to bind a research card's so-what to a named, quantified
// assumption. File-boundary contract with W2-R (coordinator dispatch): this lane owns
// src/lib/assumptions/**; W2-R owns src/lib/research/**. W2-R renders its absence state until this
// file exists; it now does.
//
// Bounded read (F38/F39 convention: a workspace-scoped register, not corpus-scale), capped at 200,
// matching workspace_tags' own 500-cap precedent at a tighter bound because this table has no
// pagination UI yet and 200 distinct standing assumptions already exceeds what one forwarder's
// planning realistically carries.
import type { SupabaseClient } from "@supabase/supabase-js";
// row.mjs is plain JS (shared with the write-side logic.ts, both outside the .ts type-check include
// list), the camelCase shape it maps to is declared here as the TS source of truth for this module's
// consumers (lane W2-R), not re-derived from the .mjs file's JSDoc.
import { mapAssumptionRow } from "@/lib/assumptions/row.mjs";

export const ASSUMPTIONS_READ_LIMIT = 200;

export interface AssumptionRow {
  id: string;
  orgId: string;
  name: string;
  valueNumeric: number | null;
  unit: string | null;
  boundTo: string;
  loadBearing: boolean;
  vulnerable: boolean;
  reviewDate: string;
  sourceNote: string | null;
  status: "active" | "superseded" | "retired";
  createdAt: string;
  updatedAt: string;
}

/**
 * All of an org's planning assumptions, newest first. Fail-soft to [] on any read error (same
 * convention as bootstrap/logic.ts's loaders), a reader that throws would take down the research
 * surface over a settings-table hiccup; an empty register renders W2-R's absence state instead,
 * which is the honest answer when the read itself is the problem too.
 */
export async function readWorkspaceAssumptions(
  supabase: SupabaseClient,
  orgId: string
): Promise<AssumptionRow[]> {
  try {
    const { data, error } = await supabase
      .from("planning_assumption_register")
      .select(
        "id, org_id, name, value_numeric, unit, bound_to, load_bearing, vulnerable, review_date, source_note, status, created_at, updated_at"
      )
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(ASSUMPTIONS_READ_LIMIT); // fitness-allow: F38 (workspace-scoped planning register, bounded-by-design)

    if (error) {
      console.warn("[assumptions/read] readWorkspaceAssumptions failed (fail-soft, empty register):", error.message);
      return [];
    }
    return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => mapAssumptionRow(row) as AssumptionRow);
  } catch (e) {
    console.warn("[assumptions/read] readWorkspaceAssumptions threw (fail-soft, empty register):", e instanceof Error ? e.message : String(e));
    return [];
  }
}

/** Active, load-bearing AND vulnerable assumptions only, the set eligible to anchor a so-what
 *  (spec 03 section 7 #7). Convenience filter over readWorkspaceAssumptions for callers (W2-R) that
 *  only want the at-risk subset, so the "which assumptions can bind" rule lives in one place. */
export async function readAtRiskAssumptions(
  supabase: SupabaseClient,
  orgId: string
): Promise<AssumptionRow[]> {
  const all = await readWorkspaceAssumptions(supabase, orgId);
  return all.filter((a) => a.status === "active" && a.loadBearing && a.vulnerable);
}
