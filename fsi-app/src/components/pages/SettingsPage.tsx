"use client";

import { Dashboard } from "@/components/Dashboard";
import type { Resource, Supersession } from "@/types/resource";

interface Props {
  initialResources: Resource[];
  initialArchived: Resource[];
  supersessions: Supersession[];
}

export function SettingsPage(props: Props) {
  return (
    <Dashboard
      initialResources={props.initialResources}
      initialArchived={props.initialArchived}
      changelog={{}}
      disputes={{}}
      xrefPairs={[]}
      supersessions={props.supersessions}
      auditDate=""
      page="settings"
    />
  );
}
