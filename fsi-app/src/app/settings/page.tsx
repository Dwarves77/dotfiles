import { getAppData } from "@/lib/data";
import { SettingsPage } from "@/components/pages/SettingsPage";

export const revalidate = 300;

export default async function Settings() {
  const data = await getAppData();

  return (
    <SettingsPage
      initialResources={data.resources}
      initialArchived={data.archived}
      supersessions={data.supersessions}
    />
  );
}
