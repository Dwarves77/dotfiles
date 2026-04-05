import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { redirect } from "next/navigation";
import { WorkspaceProfile } from "@/components/admin/WorkspaceProfile";

export default async function ProfilePage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return <WorkspaceProfile userId={user.id} userEmail={user.email || ""} />;
}
