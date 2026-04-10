"use client";

import { create } from "zustand";
import { ALL_SECTORS, type SectorDefinition } from "@/lib/constants";

interface WorkspaceState {
  // Current organization
  orgId: string | null;
  orgName: string;

  // Sector profile — which sectors this workspace operates in
  sectorProfile: string[];

  // Jurisdiction weights — override platform defaults
  jurisdictionWeights: Record<string, number> | null;

  // Sector weights — per-sector urgency multipliers
  sectorWeights: Record<string, number> | null;

  // Actions
  setWorkspace: (orgId: string, orgName: string) => void;
  setSectorProfile: (sectors: string[]) => void;
  setJurisdictionWeights: (weights: Record<string, number> | null) => void;
  setSectorWeights: (weights: Record<string, number> | null) => void;
}

// Default dev workspace
const DEV_ORG_ID = "a0000000-0000-0000-0000-000000000001";
const DEV_ORG_NAME = "Dietl / Rockit";
const DEV_SECTORS = ["fine-art", "live-events", "luxury-goods", "film-tv", "automotive", "humanitarian"];

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  orgId: DEV_ORG_ID,
  orgName: DEV_ORG_NAME,
  sectorProfile: DEV_SECTORS,
  jurisdictionWeights: null,
  sectorWeights: null,

  setWorkspace: (orgId, orgName) => set({ orgId, orgName }),
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
