import { Dashboard } from "@/components/Dashboard";
import { getAppData } from "@/lib/data";

export const revalidate = 60;

export default async function Home() {
  let data;
  try {
    data = await getAppData();
  } catch {
    // If Supabase fails, use seed data so the page still renders
    const seed = await import("@/data");
    data = {
      resources: seed.resources,
      archived: seed.archived,
      changelog: seed.changelog,
      disputes: seed.disputes,
      xrefPairs: seed.xrefPairs,
      supersessions: seed.supersessions,
      auditDate: seed.AUDIT_DATE,
      sources: [],
      provisionalSources: [],
      openConflicts: [],
    };
  }

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
