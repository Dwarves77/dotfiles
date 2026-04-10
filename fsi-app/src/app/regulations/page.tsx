import { getAppData } from "@/lib/data";
import { RegulationsPage } from "@/components/pages/RegulationsPage";

export const revalidate = 300;

export default async function Regulations() {
  const data = await getAppData();

  return (
    <RegulationsPage
      initialResources={data.resources}
      initialArchived={data.archived}
      changelog={data.changelog}
      disputes={data.disputes}
      xrefPairs={data.xrefPairs}
      supersessions={data.supersessions}
      auditDate={data.auditDate}
    />
  );
}
