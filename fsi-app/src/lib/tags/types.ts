export interface WorkspaceTag {
  id: string;
  orgId: string;
  name: string;
  /** Number of intelligence_items rows this tag is applied to, workspace-wide. */
  itemCount: number;
  createdAt: string;
}
