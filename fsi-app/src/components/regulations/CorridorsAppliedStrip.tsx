/**
 * CorridorsAppliedStrip — "Corridors this applies on" (regulation detail, lane SCOPE-READER 2026-09-06,
 * plan §W5: "nothing renders empty by design"). SELF-CONTAINED SERVER COMPONENT, the same idiom the
 * spec-09 panels already use (SurchargeAuditPanel.tsx's own header) — reads entity_scope (through
 * corridor-scope-cache.ts, ADR-026 cached) with no props from the caller's own fetches, no client fetch,
 * no polling.
 *
 * entity_scope's second real reader (the Market Intel carbon-cost overlay, src/app/market/page.tsx, is
 * the first — both call the same pure core, src/lib/entities/corridor-scope.ts). This is spec 08 §1.2's
 * "one corridor, five answers" run the OTHER direction: from a regulation's jurisdictions back to the
 * corridors touching them, rather than from a corridor out to its jurisdictions.
 *
 * VIEW/FETCH SPLIT: this file is data-only. The render code lives in the separate, sync
 * CorridorsAppliedStripView.tsx — see that file's own header for why (the same @opentelemetry/api
 * resolution failure the spec-09 lane's smoke spec documents).
 */

import { getCachedCorridorsTouchingJurisdictions } from "@/lib/entities/corridor-scope-cache";
import { CorridorsAppliedStripView, type CorridorAppliedRow } from "./CorridorsAppliedStripView";

interface CorridorsAppliedStripProps {
  /** The regulation's jurisdiction ISO codes (Resource.jurisdictionIso). */
  jurisdictionIso: string[] | null | undefined;
}

export async function CorridorsAppliedStrip({ jurisdictionIso }: CorridorsAppliedStripProps) {
  const codes = jurisdictionIso ?? [];
  if (codes.length === 0) return null;

  let rows: CorridorAppliedRow[] = [];
  try {
    const corridors = await getCachedCorridorsTouchingJurisdictions(codes);
    rows = corridors.map((c) => ({
      entityId: c.entityId,
      label: c.label,
      jurisdictions: c.jurisdictions.map((j) => ({ code: j.code, name: j.name })),
    }));
  } catch (e) {
    // Fail-soft, matching every other detail-page rail component's contract (AffectedLanesCard,
    // NoticesRail): a read error renders nothing rather than breaking the page.
    console.warn("CorridorsAppliedStrip fetch error:", e instanceof Error ? e.message : String(e));
    return null;
  }

  return <CorridorsAppliedStripView corridors={rows} />;
}
