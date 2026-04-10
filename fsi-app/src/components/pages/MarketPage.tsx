"use client";

import { Dashboard } from "@/components/Dashboard";

export function MarketPage() {
  return (
    <Dashboard
      initialResources={[]}
      initialArchived={[]}
      changelog={{}}
      disputes={{}}
      xrefPairs={[]}
      supersessions={[]}
      auditDate=""
      page="technology"
    />
  );
}
