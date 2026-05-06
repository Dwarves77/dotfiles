import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { CommunityShell } from "@/components/community/CommunityShell";

export const dynamic = "force-dynamic";

/**
 * Community route shell — Phase C foundation.
 *
 * Slack-style sidebar swap (the global Sidebar is hidden on /community
 * routes via a body[data-side="community"] CSS rule applied by
 * CommunityShell's mount effect).
 *
 * Data fetched server-side:
 *   - User's group memberships (joined to community_groups, includes
 *     starred/muted/role).
 *   - User's pending invitations (community_group_invitations).
 *   - User's topics (community_topics with their group counts).
 *   - Per-region group counts for the masthead region tabs (across all
 *     groups visible to this user via RLS — public groups + private
 *     where caller is a member).
 *
 * Posts, group browsing, and search are deferred to C4 / Phase D.
 */
export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<{ region?: string }>;
}) {
  const t0 = Date.now();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/community");

  // ── Parallel data fetch ─────────────────────────────────────────
  // All six reads below are independent (each scoped only by user.id
  // or unconditional via RPC). Running them sequentially cost ~5-6
  // round-trips; batching into a single Promise.all collapses that to
  // one wall-clock window. Six queries is at Supabase's pool ceiling
  // for a single connection — safe here because each query touches a
  // different table and is short-lived.
  //
  // Reads:
  //   1) memberships  — caller's group_members rows + embedded groups
  //   2) invitations  — pending invitations addressed to caller
  //   3) topics       — caller's topics + topic_groups counts
  //   4) regionRows   — RPC: per-region group counts visible to caller
  //   5) profile      — sidebar footer (name, headshot, admin flag)
  //   6) orgRow       — sidebar footer (employer/org name)
  const t0Fetch = Date.now();
  const [
    { data: membershipsRaw },
    { data: invitationsRaw },
    { data: topicsRaw },
    { data: regionRows },
    { data: profile },
    { data: orgRow },
  ] = await Promise.all([
    supabase
      .from("community_group_members")
      .select(
        `
          group_id,
          role,
          starred,
          muted,
          joined_at,
          community_groups (
            id,
            name,
            slug,
            region,
            privacy,
            member_count,
            weekly_post_count,
            last_active_at
          )
        `
      )
      .eq("user_id", user.id),
    supabase
      .from("community_group_invitations")
      .select(
        `
          id,
          group_id,
          inviter_user_id,
          status,
          created_at,
          community_groups (
            id,
            name,
            slug,
            region,
            privacy
          )
        `
      )
      .eq("invitee_user_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    supabase
      .from("community_topics")
      .select(
        `
          id,
          label,
          created_at,
          community_topic_groups ( group_id )
        `
      )
      .eq("owner_user_id", user.id)
      .order("created_at", { ascending: true }),
    supabase.rpc("community_region_counts"),
    supabase
      .from("user_profiles")
      .select("name, headshot_url, is_platform_admin")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("org_memberships")
      .select("organizations(name)")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle(),
  ]);
  console.log(
    `[perf] /community parallel-fetch ${Date.now() - t0Fetch}ms`
  );

  // ── Reshape memberships ─────────────────────────────────────────
  const memberships = (membershipsRaw || []).flatMap((m: any) => {
    if (!m.community_groups) return [];
    return [
      {
        group_id: m.group_id,
        role: m.role as "admin" | "moderator" | "member",
        starred: !!m.starred,
        muted: !!m.muted,
        joined_at: m.joined_at,
        group: {
          id: m.community_groups.id,
          name: m.community_groups.name,
          slug: m.community_groups.slug,
          region: m.community_groups.region,
          privacy: m.community_groups.privacy as "public" | "private",
          member_count: m.community_groups.member_count ?? 0,
          weekly_post_count: m.community_groups.weekly_post_count ?? 0,
          last_active_at: m.community_groups.last_active_at,
        },
      },
    ];
  });

  // ── Reshape invitations ─────────────────────────────────────────
  const invitations = (invitationsRaw || []).flatMap((inv: any) => {
    if (!inv.community_groups) return [];
    return [
      {
        id: inv.id,
        group_id: inv.group_id,
        inviter_user_id: inv.inviter_user_id,
        created_at: inv.created_at,
        group: {
          id: inv.community_groups.id,
          name: inv.community_groups.name,
          slug: inv.community_groups.slug,
          region: inv.community_groups.region,
          privacy: inv.community_groups.privacy as "public" | "private",
        },
      },
    ];
  });

  // ── Reshape topics ──────────────────────────────────────────────
  // RLS restricts community_topics to the owner. We pull the topic
  // rows + a count of joined groups via the junction; rendering is
  // sidebar-only for this PR.
  const topics = (topicsRaw || []).map((t: any) => ({
    id: t.id,
    label: t.label,
    group_count: Array.isArray(t.community_topic_groups)
      ? t.community_topic_groups.length
      : 0,
  }));

  // ── Region counts (reshape) ─────────────────────────────────────
  // Counts of groups VISIBLE TO THIS USER per region — RLS already
  // limits the result to public groups + private groups where caller
  // is a member, so a plain head-count is enough.
  const REGIONS: { code: string; label: string }[] = [
    { code: "EU", label: "EU / Europe" },
    { code: "UK", label: "United Kingdom" },
    { code: "US", label: "United States" },
    { code: "LATAM", label: "Latin America" },
    { code: "APAC", label: "Asia Pacific" },
    { code: "HK", label: "Hong Kong" },
    { code: "MEA", label: "Middle East & Africa" },
    { code: "GLOBAL", label: "Global / Cross-jurisdictional" },
  ];

  const regionCounts: Record<string, number> = {};
  for (const r of REGIONS) regionCounts[r.code] = 0;
  for (const row of (regionRows ?? []) as { region: string; count: number }[]) {
    regionCounts[row.region] = Number(row.count) || 0;
  }

  // Workspace label (employer/org) — best-effort; the sidebar footer
  // shows the user's primary org name.
  const employer =
    (orgRow?.organizations as { name?: string } | null)?.name ?? "";

  const params = await searchParams;
  const initialRegion = params?.region?.toUpperCase() || "EU";

  console.log(`[perf] /community data ${Date.now() - t0}ms`);

  return (
    <CommunityShell
      currentUser={{
        id: user.id,
        email: user.email ?? "",
        name: profile?.name ?? user.email?.split("@")[0] ?? "",
        headshotUrl: profile?.headshot_url ?? null,
        employer,
        isPlatformAdmin: !!profile?.is_platform_admin,
      }}
      memberships={memberships}
      invitations={invitations}
      topics={topics}
      regions={REGIONS}
      regionCounts={regionCounts}
      initialRegion={initialRegion}
    />
  );
}
