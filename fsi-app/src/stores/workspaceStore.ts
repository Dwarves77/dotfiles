"use client";

import { create } from "zustand";
import { ALL_SECTORS, type SectorDefinition } from "@/lib/constants";

interface WorkspaceState {
  // Current organization
  orgId: string | null;
  orgName: string;

  // User role in current org
  userRole: "owner" | "admin" | "editor" | "viewer" | null;

  // Sector profile — which sectors this workspace operates in
  sectorProfile: string[];

  // Jurisdiction weights — override platform defaults
  jurisdictionWeights: Record<string, number> | null;

  // Sector weights — per-sector urgency multipliers
  sectorWeights: Record<string, number> | null;

  // Actions
  setWorkspace: (orgId: string, orgName: string) => void;
  setUserRole: (role: WorkspaceState["userRole"]) => void;
  setSectorProfile: (sectors: string[]) => void;
  setJurisdictionWeights: (weights: Record<string, number> | null) => void;
  setSectorWeights: (weights: Record<string, number> | null) => void;
}

// No hardcoded workspace defaults. AuthProvider populates orgId/orgName/
// userRole/sectorProfile on session load via setWorkspace + setUserRole +
// setSectorProfile. Anonymous users (and authenticated users with no org
// membership) see the public/platform view: empty sector profile means no
// sector-aware filtering on Regulations and a generic answer from /api/ask.

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  orgId: null,
  orgName: "",
  userRole: null,
  sectorProfile: [],
  jurisdictionWeights: null,
  sectorWeights: null,

  setWorkspace: (orgId, orgName) => set({ orgId, orgName }),
  setUserRole: (userRole) => set({ userRole }),
  setSectorProfile: (sectorProfile) => set({ sectorProfile }),
  setJurisdictionWeights: (jurisdictionWeights) => set({ jurisdictionWeights }),
  setSectorWeights: (sectorWeights) => set({ sectorWeights }),
}));

/**
 * Get the active sector definitions for the current workspace.
 * Returns only sectors that match the workspace's sector_profile.
 * If no profile is set, returns the full master list (sector-agnostic view).
 */
export function getActiveSectors(sectorProfile: string[]): SectorDefinition[] {
  if (sectorProfile.length === 0) return ALL_SECTORS;
  return ALL_SECTORS.filter((s) => sectorProfile.includes(s.id));
}
