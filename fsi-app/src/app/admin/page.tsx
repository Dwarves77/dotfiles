import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { fetchSourceData } from "@/lib/supabase-server";

export default async function AdminPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/admin");

  // Role gate: only owners and admins of an org can see /admin. Members
  // and viewers are redirected to the dashboard. RLS would protect the
  // underlying data anyway, but blocking at the page level avoids
  // rendering an empty admin shell for non-admin users.
  const { data: membership } = await supabase
    .from("org_memberships")
    .select("role")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const role = membership?.role;
  if (role !== "owner" && role !== "admin") {
    redirect("/");
  }

  // Hydrate the source store with the unfiltered admin view (includeAdminOnly=true)
  // so SourceHealthDashboard sees every source, including ones flagged admin_only.
  // The workspace path at / uses the default (false) and never sees admin_only=true rows.
  const { sources, provisionalSources, openConflicts } = await fetchSourceData(true);

  return (
    <AdminDashboard
      userId={user.id}
      userEmail={user.email || ""}
      initialSources={sources}
      initialProvisionalSources={provisionalSources}
      initialOpenConflicts={openConflicts}
    />
  );
}
