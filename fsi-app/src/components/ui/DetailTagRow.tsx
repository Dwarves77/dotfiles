"use client";

/**
 * DetailTagRow — the detail-header tag row (lane uitags, 2026-09-07,
 * README "Workspace tags", operator render of /regulations/[slug]): the
 * item's applied WorkspaceTagPills, then the + Tag trigger, then a muted
 * "workspace tags" label. Passed into DetailHeader's `tagRow` prop by all
 * four detail surfaces (regulation, market, research, operations), one
 * component, not a fork per surface.
 *
 * `open`/`onOpenChange` (lane uiactions integration, 2026-09-07, forwarded
 * straight to TagPopover): lets the surface lift the popover's open state
 * above both this row and ActionRow, so ActionRow's own "+ Tag" trigger
 * opens the SAME popover this row's trigger opens, one popover, one state.
 * Omitted, this row keeps its own uncontrolled popover exactly as before.
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
