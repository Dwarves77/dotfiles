// regulation-obligations.ts — real wiring for regulation-obligations-core.ts (PERF-2 lane, 2026-09-03).
// See that module's header for the design; this file supplies the actual Supabase/Next bindings
// (createSupabaseServerClient reads next/headers' cookies(), so this file cannot be loaded outside
// Next's bundler — same constraint load-detail.ts states for itself — and carries no test of its own;
// regulation-obligations-core.test.mjs already exercises the control-flow shape with stub deps).
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { fetchObligationRegister } from "@/lib/obligations/read-register.mjs";
import { fetchUpcomingObligations } from "@/lib/forward-events/read-upcoming.mjs";
import type { ObligationRow } from "@/components/regulations/ObligationRegisterFilterBar";
import type { UpcomingEvent } from "@/components/regulations/UpcomingObligationsStripView";
import {
  loadRegulationObligations,
  type RegulationObligationsResult,
} from "./regulation-obligations-core";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Load one regulation's obligation-register rows and upcoming-events, for the DETAIL page only (mirrors
 * ObligationRegister's/UpcomingObligationsStrip's own `variant="detail"` defaults: register limit 500,
 * upcoming limit 20 — unchanged from what those two components already requested). Production call site:
 * regulations/[slug]/page.tsx, run via Promise.all alongside loadDetail() rather than after it.
 */
export async function loadRegulationDetailObligations(
  id: string
): Promise<RegulationObligationsResult<ObligationRow, UpcomingEvent>> {
  const supabase = await createSupabaseServerClient();

  return loadRegulationObligations<ObligationRow, UpcomingEvent>(id, {
    resolveItemId: async (rawId) => {
      if (UUID_RE.test(rawId)) return rawId;
      // legacy_id -> uuid, via the SAME request-scoped client (not service-role) — mirrors
      // ObligationRegister.tsx's / UpcomingObligationsStrip.tsx's own resolution exactly, including their
      // RLS reasoning (intelligence_items_read already scopes reads to provenance_status='verified' AND
      // is_archived IS NOT TRUE, so this lookup needs no elevated client).
      const { data } = await supabase.from("intelligence_items").select("id").eq("legacy_id", rawId).maybeSingle();
      return data?.id ?? null;
    },
    fetchRegisterRows: (itemUuid) =>
      fetchObligationRegister(supabase, { itemId: itemUuid, limit: 500 }) as Promise<ObligationRow[]>,
    fetchUpcomingEvents: (itemUuid) =>
      fetchUpcomingObligations(supabase, { itemId: itemUuid, limit: 20 }) as Promise<UpcomingEvent[]>,
  });
}
