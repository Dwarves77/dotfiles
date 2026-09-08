"use client";

/**
 * useWorkspaceTagsFacet — the one hook behind the "Workspace tags" facet
 * group on all five list surfaces (lane uitags, 2026-09-07, README
 * "Workspace tags" / ruling R6). Fetches the workspace's tags (with live
 * counts) plus a full item -> tag-ids map in one request, and exposes a
 * `selectedTagId` a caller wires into its own filter reducer plus
 * `tagsForItem(id)` for ListRow's `tags` prop — so the same shared hook
 * covers both "filter the list by tag" and "show this row's tags", the two
 * things every one of the five list ledgers needs.
 *
 * AUTH (lane TAGS-401, 2026-09-08): via `authedFetch`, for the same reason
 * client.ts's header gives: this read sent `credentials: "include"` only
 * and 401'd for every signed-in user, so the facet group and every row's
 * tag list were empty in production from the day they landed.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { authedFetch } from "@/lib/api/authed-fetch";
import type { WorkspaceTag } from "./types";

export interface WorkspaceTagsFacet {
  tags: WorkspaceTag[];
  selectedTagId: string | null;
  setSelectedTagId: (id: string | null) => void;
  /** True when the given item (by its intelligence_items uuid) carries the
   *  currently-selected tag; always true when nothing is selected. */
  matchesSelectedTag: (itemId: string) => boolean;
  /** The applied tags for one item, as ListRow's `tags` prop expects. */
  tagsForItem: (itemId: string) => { id: string; name: string }[];
}

export function useWorkspaceTagsFacet(): WorkspaceTagsFacet {
  const [tags, setTags] = useState<WorkspaceTag[]>([]);
  const [itemTags, setItemTags] = useState<Record<string, string[]>>({});
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authedFetch("/api/workspace/tags?withItemTags=1");
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as { tags?: WorkspaceTag[]; itemTags?: Record<string, string[]> };
        if (cancelled) return;
        setTags(body.tags ?? []);
        setItemTags(body.itemTags ?? {});
      } catch {
        // Fail soft: the facet group and row tags simply render nothing
        // extra — never a crash, matching the StateNote-not-crash
        // convention for a failed fetch.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const tagsById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);

  const matchesSelectedTag = useCallback(
    (itemId: string) => {
      if (!selectedTagId) return true;
      return (itemTags[itemId] ?? []).includes(selectedTagId);
    },
    [selectedTagId, itemTags]
  );

  const tagsForItem = useCallback(
    (itemId: string) => {
      const ids = itemTags[itemId] ?? [];
      return ids
        .map((id) => tagsById.get(id))
        .filter((t): t is WorkspaceTag => Boolean(t))
        .map((t) => ({ id: t.id, name: t.name }));
    },
    [itemTags, tagsById]
  );

  return { tags, selectedTagId, setSelectedTagId, matchesSelectedTag, tagsForItem };
}
