"use client";

import { Dashboard } from "@/components/Dashboard";

export function OperationsPage() {
  return (
    <Dashboard
      initialResources={[]}
      initialArchived={[]}
      changelog={{}}
      disputes={{}}
      xrefPairs={[]}
      supersessions={[]}
      auditDate=""
      page="regional"
    />
  );
}
