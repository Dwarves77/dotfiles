import { Dashboard } from "@/components/Dashboard";
import { fetchDashboardData, fetchSourceData } from "@/lib/supabase-server";

export const revalidate = 300;

export default async function Home() {
  const [dashboardData, sourceData] = await Promise.all([
    fetchDashboardData(),
    fetchSourceData(),
  ]);

  return (
    <Dashboard
      initialResources={dashboardData.resources}
      initialArchived={dashboardData.archived}
      changelog={dashboardData.changelog}
      disputes={dashboardData.disputes}
      xrefPairs={dashboardData.xrefPairs}
      supersessions={dashboardData.supersessions}
      auditDate={dashboardData.auditDate}
      initialSources={sourceData.sources}
      initialProvisionalSources={sourceData.provisionalSources}
      initialOpenConflicts={sourceData.openConflicts}
    />
  );
}
