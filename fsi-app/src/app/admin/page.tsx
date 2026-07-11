import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { fetchSourceData } from "@/lib/supabase-server";
import { requirePlatformAdmin } from "@/lib/auth/admin";

export default async function AdminPage() {
  const t0 = Date.now();

  // Platform-admin gate (OBS-17, Sprint 2 Build 6). /admin is a
  // platform-layer surface per the three-layer tenant model in
  // caros-ledge-platform-intent Section 4. Gating on workspace-membership
  // role was a cross-tenant exposure risk; helper now reads
  // profiles.is_platform_admin (migration 075).
  const { userId, email } = await requirePlatformAdmin("/admin");

  const supabase = await createSupabaseServerClient();

  // Hydrate the source store with the unfiltered admin view (includeAdminOnly=true)
  // so SourceHealthDashboard sees every source, including ones flagged admin_only.
  // The workspace path at / uses the default (false) and never sees admin_only=true rows.
  // Also hydrate organizations / org_memberships / staged_updates server-side
  // so AdminDashboard can render those tabs without a second-paint client fetch.
  // Wave 1a MTD spend aggregation. Wrapped in a soft-fail helper so the
  // admin page still renders zeros when migration 057 (agent_runs) has
  // not yet been applied. The tile reads zeros as "no spend yet".
  const fetchMtdSpend = async (): Promise<{ usd: number; runs: number; errors: number }> => {
    try {
      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from("agent_runs")
        .select("cost_usd_estimated, status")
        .gte("created_at", monthStart.toISOString());
      if (error || !data) return { usd: 0, runs: 0, errors: 0 };
      let usd = 0;
      let errors = 0;
      for (const row of data) {
        usd += Number((row as { cost_usd_estimated: number | null }).cost_usd_estimated ?? 0);
        if ((row as { status: string }).status === "error") errors++;
      }
      return { usd, runs: data.length, errors };
    } catch {
      return { usd: 0, runs: 0, errors: 0 };
    }
  };

  const [
    sourceData,
    orgsRes,
    membersRes,
    stagedRes,
    mtdSpend,
  ] = await Promise.all([
    fetchSourceData(true),
    supabase
      .from("organizations")
      .select("id, name, slug, plan, created_at"),
    // Same embed pattern as AdminDashboard.loadData — pulls
    // profiles.full_name via the user_id FK so the member list
    // renders names instead of raw uuids on first paint.
    // Migrated 2026-05-15 (migration 075): user_profiles -> profiles.
    // The `!user_id` hint disambiguates the FK org_memberships.user_id ->
    // profiles.id added in migration 075.
    supabase
      .from("org_memberships")
      .select(
        // D-1 fix: also carry display_name + email so the panel's display chain
        // (full_name ?? display_name ?? email ?? uuid-slice) never falls to UUIDs on first paint.
        "id, org_id, user_id, role, created_at, user:profiles!user_id(full_name, display_name, email, avatar_url)"
      ),
    // Slim staged_updates select — drop full_brief (~17KB/row) and the
    // proposed_changes JSONB envelope columns the admin panel doesn't
    // render. Was `select("*")` shipping every column on every admin page
    // load. AdminDashboard renders id, update_type, created_at, reason,
    // and proposed_changes (JSONB — kept; the panel drills into it).
    supabase
      .from("staged_updates")
      .select("id, update_type, created_at, reason, proposed_changes, status")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(100),
    fetchMtdSpend(),
  ]);

  console.log(`[perf] /admin data ${Date.now() - t0}ms`);

  return (
    <AdminDashboard
      userId={userId}
      userEmail={email}
      initialSources={sourceData.sources}
      initialProvisionalSources={sourceData.provisionalSources}
      initialOpenConflicts={sourceData.openConflicts}
      initialOrgs={orgsRes.data || []}
      initialMembers={membersRes.data || []}
      initialStagedUpdates={stagedRes.data || []}
      initialMtdSpendUsd={mtdSpend.usd}
      initialMtdRuns={mtdSpend.runs}
      initialMtdErrors={mtdSpend.errors}
    />
  );
}
