"use client";

/**
 * commonActionCardProps (lane PARITY-PARTS, 2026-09-24, F45 duplicate-code): the ActionCard props
 * every one of the four detail surfaces built identically (tagPopover/onShare/onTag/exportDisabled/
 * watch), differing only in `itemType` and, previously, being retyped four times rather than
 * imported once. Regulations' `onExport`/`meta`/exposure fields are genuinely per-surface (real
 * different data) and stay at each call site; this covers only the byte-identical tail.
 */
import type { Dispatch, SetStateAction } from "react";
import { DetailTagRow } from "@/components/ui/DetailTagRow";
import { WatchButton } from "@/components/ui/WatchButton";
import { shareResource } from "@/components/ui/ActionRow";
import type { Resource } from "@/types/resource";
import type { WatchlistItemType } from "@/lib/supabase-server";

export function commonActionCardProps({
  r,
  tagOpen,
  setTagOpen,
  itemType,
  initialWatched,
  initialTeamWatched,
  initialTeamAvailable,
}: {
  r: Resource;
  tagOpen: boolean;
  setTagOpen: Dispatch<SetStateAction<boolean>>;
  itemType: WatchlistItemType;
  initialWatched?: boolean;
  initialTeamWatched?: boolean;
  initialTeamAvailable?: boolean;
}) {
  return {
    tagPopover: <DetailTagRow itemId={String(r.id)} open={tagOpen} onOpenChange={setTagOpen} />,
    onShare: () => shareResource(r),
    onTag: () => setTagOpen((v) => !v),
    exportDisabled: !(r.fullBrief || r.url),
    watch: (
      <WatchButton
        itemType={itemType}
        itemId={String(r.id)}
        variant="row"
        initialWatched={initialWatched}
        initialTeamWatched={initialTeamWatched}
        initialTeamAvailable={initialTeamAvailable}
      />
    ),
    // The two remaining ActionCard exposure cells every one of the four surfaces filled
    // identically: no surface has a distinct "who pays" source from `costMechanism`, and none has
    // shipment-lane data to connect yet (the honest Absence, "connect data", never a fabricated
    // value - CLAUDE.md rule 2). `where` and `timeline` stay per-surface (real, different data).
    whoPays: { value: r.costMechanism || null },
    yourLanes: { value: null, absenceReason: "connect data" as const },
    timeline: r.timeline,
  };
}
