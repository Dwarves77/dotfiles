"use client";

/**
 * DetailTagRow — the detail-header tag row (lane uitags, 2026-09-07,
 * README "Workspace tags", operator render of /regulations/[slug]): the
 * item's applied WorkspaceTagPills, then a muted "workspace tags" label.
 * Passed into DetailHeader's `tagRow` prop by all four detail surfaces
 * (regulation, market, research, operations), one component, not a fork
 * per surface.
 *
 * DEFECT-FIX (item 3.2, 2026-09-07): this row renders APPLIED TAGS ONLY —
 * it carries no trigger of its own. `open`/`onOpenChange` (lane uiactions
 * integration, 2026-09-07) are always supplied by every caller, so the
 * `TagPopover` mounted here renders in its controlled mode (no internal
 * "+ Tag" button — see TagPopover's own header) and stays purely an
 * anchor for the popover panel; ActionRow's own "+ Tag" button (the action
 * row, README "Detail action row") is the ONE trigger that opens it.
 */

import { useEffect, useState } from "react";
import { WorkspaceTagPill } from "@/components/ui/Chips";
import { TagPopover } from "@/components/ui/TagPopover";
import { fetchItemWorkspaceTags, removeWorkspaceTag } from "@/lib/tags/client";
import type { WorkspaceTag } from "@/lib/tags/types";

export function DetailTagRow({
  itemId,
  open,
  onOpenChange,
}: {
  itemId: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [applied, setApplied] = useState<WorkspaceTag[]>([]);
  const [loaded, setLoaded] = useState(false);

  async function reload() {
    const { tags, appliedTagIds } = await fetchItemWorkspaceTags(itemId);
    const appliedSet = new Set(appliedTagIds);
    setApplied(tags.filter((t) => appliedSet.has(t.id)));
    setLoaded(true);
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  if (!loaded) return null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      {applied.map((tag) => (
        <WorkspaceTagPill
          key={tag.id}
          name={tag.name}
          onRemove={async () => {
            const ok = await removeWorkspaceTag(tag.id, itemId);
            if (ok) setApplied((prev) => prev.filter((t) => t.id !== tag.id));
          }}
        />
      ))}
      <TagPopover itemId={itemId} onChange={reload} open={open} onOpenChange={onOpenChange} />
      <span style={{ fontSize: "var(--fs-95)", color: "var(--ink-3)", letterSpacing: "0.04em" }}>
        workspace tags
      </span>
    </div>
  );
}
