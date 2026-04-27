import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { WorkspaceProfile } from "@/components/admin/WorkspaceProfile";

export default async function ProfilePage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/profile");

  return <WorkspaceProfile userId={user.id} userEmail={user.email || ""} />;
}
