import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { WorkspaceProfile } from "@/components/admin/WorkspaceProfile";

export default async function ProfilePage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  // TEMPORARILY DISABLED for public access. Restore: if (!user) redirect("/login");

  return <WorkspaceProfile userId={user?.id || ""} userEmail={user?.email || ""} />;
}
