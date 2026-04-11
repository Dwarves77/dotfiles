"use client";

import { Dashboard } from "@/components/Dashboard";
import type { Resource, ChangeLogEntry, Dispute, Supersession } from "@/types/resource";

interface Props {
  initialResources: Resource[];
  initialArchived: Resource[];
  changelog: Record<string, ChangeLogEntry[]>;
  disputes: Record<string, Dispute>;
  xrefPairs: [string, string][];
  supersessions: Supersession[];
  auditDate: string;
  initialSynopses?: { itemId: string; sector: string; summary: string; urgencyScore: number | null }[];
  initialIntelligenceChanges?: { itemId: string; changeType: string; changeSeverity: string; changeSummary: string }[];
  initialSectorDisplayNames?: { sector: string; displayName: string }[];
}

export function RegulationsPage(props: Props) {
  return <Dashboard {...props} page="regulations" />;
}
