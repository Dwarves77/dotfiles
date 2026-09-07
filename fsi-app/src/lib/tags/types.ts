/**
 * Workspace tags — shared types (lane uitags, 2026-09-07, migration 313 /
 * README "Workspace tags"). Used by the API routes, the client fetchers in
 * src/lib/tags/client.ts, WorkspaceTagPill (Chips.tsx) and TagPopover.
 */

export interface WorkspaceTag {
  id: string;
  orgId: string;
  name: string;
  /** Number of intelligence_items rows this tag is applied to, workspace-wide. */
  itemCount: number;
  createdAt: string;
}

/** Shape POSTed to create a tag, or returned inline by the popover's "Create" row. */
export interface CreateWorkspaceTagInput {
  name: string;
}
