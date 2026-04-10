"use client";

import { Dashboard } from "@/components/Dashboard";
import type { Resource, ChangeLogEntry, Dispute, Supersession } from "@/types/resource";

interface Props {
  initialResources: Resource[];
  changelog: Record<string, ChangeLogEntry[]>;
  disputes: Record<string, Dispute>;
  xrefPairs: [string, string][];
  supersessions: Supersession[];
}

export function MapPage(props: Props) {
  return (
    <Dashboard
      initialResources={props.initialResources}
      initialArchived={[]}
      changelog={props.changelog}
      disputes={props.disputes}
      xrefPairs={props.xrefPairs}
      supersessions={props.supersessions}
      auditDate=""
      page="map"
    />
  );
}
