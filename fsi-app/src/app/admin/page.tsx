import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { AdminDashboard } from "@/components/admin/AdminDashboard";

export default async function AdminPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  // TEMPORARILY DISABLED for public access. Restore: if (!user) redirect("/login");

  // TODO: verify user is admin via org_memberships role check
  // For now, any authenticated user can access admin (dev phase)

  return <AdminDashboard userId={user?.id || ""} userEmail={user?.email || ""} />;
}
