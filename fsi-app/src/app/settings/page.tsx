import { redirect } from "next/navigation";
import { getAppData } from "@/lib/data";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { SettingsPage } from "@/components/pages/SettingsPage";

export const revalidate = 60;

export default async function Settings() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/settings");

  const data = await getAppData();

  return (
    <SettingsPage
      initialResources={data.resources}
      initialArchived={data.archived}
      supersessions={data.supersessions}
      userId={user.id}
    />
  );
}
