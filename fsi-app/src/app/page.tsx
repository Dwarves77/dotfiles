import { Dashboard } from "@/components/Dashboard";
import { getAppData } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const data = await getAppData();

  return (
    <Dashboard
      initialResources={data.resources}
      initialArchived={data.archived}
      changelog={data.changelog}
      disputes={data.disputes}
      xrefPairs={data.xrefPairs}
      supersessions={data.supersessions}
      auditDate={data.auditDate}
      initialSources={data.sources}
      initialProvisionalSources={data.provisionalSources}
      initialOpenConflicts={data.openConflicts}
      page="home"
    />
  );
}
