import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { fetchSourceData } from "@/lib/supabase-server";

export default async function AdminPage() {
  const t0 = Date.now();
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
  // Also hydrate organizations / org_memberships / staged_updates server-side
  // so AdminDashboard can render those tabs without a second-paint client fetch.
  const [
    sourceData,
    orgsRes,
    membersRes,
    stagedRes,
  ] = await Promise.all([
    fetchSourceData(true),
    supabase
      .from("organizations")
      .select("id, name, slug, plan, created_at"),
    // Same embed pattern as AdminDashboard.loadData — pulls
    // user_profiles.name via the user_id FK so the member list
    // renders names instead of raw uuids on first paint.
    supabase
      .from("org_memberships")
      .select(
        "id, org_id, user_id, role, created_at, user:user_profiles(name, headshot_url)"
      ),
    supabase
      .from("staged_updates")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  console.log(`[perf] /admin data ${Date.now() - t0}ms`);

  return (
    <AdminDashboard
      userId={user.id}
      userEmail={user.email || ""}
      initialSources={sourceData.sources}
      initialProvisionalSources={sourceData.provisionalSources}
      initialOpenConflicts={sourceData.openConflicts}
      initialOrgs={orgsRes.data || []}
      initialMembers={membersRes.data || []}
      initialStagedUpdates={stagedRes.data || []}
    />
  );
}
