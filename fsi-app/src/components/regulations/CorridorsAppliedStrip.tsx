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
