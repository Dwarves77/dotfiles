import { ResearchPage } from "@/components/pages/ResearchPage";
import { getAppData } from "@/lib/data";

export const dynamic = 'force-dynamic';

export default async function Research() {
  const data = await getAppData();

  return (
    <ResearchPage
      initialSources={data.sources}
      initialProvisionalSources={data.provisionalSources}
      initialOpenConflicts={data.openConflicts}
    />
  );
}
