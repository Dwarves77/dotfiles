import { redirect } from "next/navigation";
import { getSettingsData } from "@/lib/data";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { SettingsPage } from "@/components/pages/SettingsPage";

// Note: previous `export const revalidate = 60` was a no-op — Settings
// reads cookies via auth.getUser, opting the page into dynamic. Removed
// for honesty. The expensive data path is now cached internally inside
// getSettingsData / unstable_cache, scoped per workspace.

export default async function Settings() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/settings");

  // Slim fetcher — resources + archived + supersessions only. Settings
  // doesn't consume changelog / disputes / xrefs / synopses / changes /
  // sources / overrides. Drops ~11 queries from the data path.
  const data = await getSettingsData();

  return (
    <SettingsPage
      initialResources={data.resources}
      initialArchived={data.archived}
      supersessions={data.supersessions}
      userId={user.id}
    />
  );
}
