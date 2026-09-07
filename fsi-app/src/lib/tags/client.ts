"use client";

/**
 * Workspace tags — client fetchers + a tiny in-memory cache (lane uitags,
 * 2026-09-07, migration 313 / README "Workspace tags"). Used by TagPopover,
 * the detail tag row and the list rail's "Workspace tags" facet group so
 * all three read the same in-flight list and update together the moment a
 * tag is applied or removed — no separate polling, no stale count in one
 * place after an apply in another.
 *
 * The cache is a single module-level list of subscribers notified on every
 * mutation; each consumer calls `subscribeWorkspaceTags` in an effect and
 * re-renders off the notified snapshot. This is intentionally NOT React
 * context (the popover, the tag row and the rail mount in three unrelated
 * component subtrees on the four detail surfaces and five list surfaces —
 * threading one provider through all of them would mean editing every
 * page's own top-level layout, which the "assemble from shared parts"
 * constraint does not require here since none of the three consumers is
 * itself a shared UI part that needs prop-driven data).
 */

import type { WorkspaceTag } from "./types";

let cache: WorkspaceTag[] | null = null;
let inflight: Promise<WorkspaceTag[]> | null = null;
const subscribers = new Set<(tags: WorkspaceTag[]) => void>();

function notify() {
  const snapshot = cache ?? [];
  for (const cb of subscribers) cb(snapshot);
}

/** Subscribe to the tag list; the callback fires immediately with whatever
 *  is cached (possibly empty) and again on every future refresh. Returns an
 *  unsubscribe function. */
export function subscribeWorkspaceTags(cb: (tags: WorkspaceTag[]) => void): () => void {
  subscribers.add(cb);
  cb(cache ?? []);
  return () => subscribers.delete(cb);
}

/** Fetch (or return the cached copy of) the workspace's tags. Pass
 *  `force: true` to bypass the cache — TagPopover does this after a
 *  create/apply/remove so counts are always current. */
export async function fetchWorkspaceTags(opts: { force?: boolean } = {}): Promise<WorkspaceTag[]> {
  if (cache && !opts.force) return cache;
  if (inflight && !opts.force) return inflight;

  inflight = (async () => {
    const res = await fetch("/api/workspace/tags", { credentials: "include" });
    if (!res.ok) {
      // Fail soft: keep the previous cache (if any) rather than throwing —
      // callers render the rail/popover with whatever they last had, per
      // the StateNote-not-crash convention for a failed fetch.
      return cache ?? [];
    }
    const body = (await res.json()) as { tags?: WorkspaceTag[] };
    cache = body.tags ?? [];
    notify();
    return cache;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

/** Fetch the tags already applied to one item (by legacy_id or uuid), plus
 *  a fresh full workspace tag list. Used by TagPopover on open. Not cached
 *  (per-item, small, and needs to be current every time the popover opens). */
export async function fetchItemWorkspaceTags(
  itemId: string
): Promise<{ tags: WorkspaceTag[]; appliedTagIds: string[] }> {
  const res = await fetch(`/api/workspace/tags?itemId=${encodeURIComponent(itemId)}`, {
    credentials: "include",
  });
  if (!res.ok) return { tags: cache ?? [], appliedTagIds: [] };
  const body = (await res.json()) as { tags?: WorkspaceTag[]; appliedTagIds?: string[] };
  cache = body.tags ?? [];
  notify();
  return { tags: cache, appliedTagIds: body.appliedTagIds ?? [] };
}

export async function createWorkspaceTag(name: string): Promise<WorkspaceTag | null> {
  const res = await fetch("/api/workspace/tags", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { tag?: WorkspaceTag };
  await fetchWorkspaceTags({ force: true });
  return body.tag ?? null;
}

export async function deleteWorkspaceTag(tagId: string): Promise<boolean> {
  const res = await fetch("/api/workspace/tags", {
    method: "DELETE",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tagId }),
  });
  if (res.ok) await fetchWorkspaceTags({ force: true });
  return res.ok;
}

export async function applyWorkspaceTag(tagId: string, itemId: string): Promise<boolean> {
  const res = await fetch(`/api/workspace/tags/${encodeURIComponent(tagId)}/items`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemId }),
  });
  if (res.ok) await fetchWorkspaceTags({ force: true });
  return res.ok;
}

export async function removeWorkspaceTag(tagId: string, itemId: string): Promise<boolean> {
  const res = await fetch(`/api/workspace/tags/${encodeURIComponent(tagId)}/items`, {
    method: "DELETE",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemId }),
  });
  if (res.ok) await fetchWorkspaceTags({ force: true });
  return res.ok;
}
