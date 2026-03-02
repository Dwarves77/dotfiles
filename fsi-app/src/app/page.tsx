import { Dashboard } from "@/components/Dashboard";
import { fetchDashboardData } from "@/lib/supabase-server";

export default async function Home() {
  const {
    resources,
    archived,
    changelog,
    disputes,
    xrefPairs,
    supersessions,
    auditDate,
  } = await fetchDashboardData();

  return (
    <Dashboard
      initialResources={resources}
      initialArchived={archived}
      changelog={changelog}
      disputes={disputes}
      xrefPairs={xrefPairs}
      supersessions={supersessions}
      auditDate={auditDate}
    />
  );
}
