"use client";

import { Dashboard } from "@/components/Dashboard";
import {
  resources,
  archived,
  changelog,
  disputes,
  xrefPairs,
  supersessions,
  AUDIT_DATE,
} from "@/data";

export default function Home() {
  return (
    <Dashboard
      initialResources={resources}
      initialArchived={archived}
      changelog={changelog}
      disputes={disputes}
      xrefPairs={xrefPairs}
      supersessions={supersessions}
      auditDate={AUDIT_DATE}
    />
  );
}
