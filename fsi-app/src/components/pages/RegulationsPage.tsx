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
}

export function RegulationsPage(props: Props) {
  return <Dashboard {...props} page="regulations" />;
}
