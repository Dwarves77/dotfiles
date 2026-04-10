import { ResearchPage } from "@/components/pages/ResearchPage";
import { getAppData } from "@/lib/data";

export const revalidate = 60;

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
