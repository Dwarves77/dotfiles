// src/lib/community/shell-context.ts (lane L33, 2026-09-17)
//
// ONE home for the context every /community/* page assembles for CommunityShell: the caller's
// memberships, pending invitations, owned topics, the region list with live counts, and the current
// user block (profile name, headshot, employer, platform-admin flag). Seven page shells carried this
// block by hand (benchmarks, profile, directory, discover, moderation, browse, [slug]), the largest
// clone family in the system health audit (docs/audits/system-health-audit-2026-09-17.md section 2:
// 96, 89, 89, 86 shared windows between pairs). A page now does:
//
//   const supabase = await createSupabaseServerClient();
//   const { data: { user } } = await supabase.auth.getUser();
//   if (!user) redirect("/login?redirect=/community/x");
//   const shell = await loadCommunityShellContext(supabase, user);
//   return <CommunityShell {...shell} initialRegion="EU">...</CommunityShell>;
//
// The reads are the same four parallel reads plus the two profile reads the pages ran; the mapping to
// the typed arrays is the same. Server-only (a cookie-bound server client is the RLS boundary).
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { CommunityMembership, CommunityInvitation, CommunityTopicSummary } from "@/components/community/types";

export const COMMUNITY_REGIONS = [
  { code: "EU", label: "EU / Europe" },
  { code: "UK", label: "United Kingdom" },
  { code: "US", label: "United States" },
  { code: "LATAM", label: "Latin America" },
  { code: "APAC", label: "Asia Pacific" },
  { code: "HK", label: "Hong Kong" },
  { code: "MEA", label: "Middle East & Africa" },
  { code: "GLOBAL", label: "Global / Cross-jurisdictional" },
];

export interface CommunityCurrentUser {
  id: string;
  email: string;
  name: string;
  headshotUrl: string | null;
  employer: string;
  isPlatformAdmin: boolean;
}

export interface CommunityShellContext {
  currentUser: CommunityCurrentUser;
  memberships: CommunityMembership[];
  invitations: CommunityInvitation[];
  topics: CommunityTopicSummary[];
  regions: typeof COMMUNITY_REGIONS;
  regionCounts: Record<string, number>;
}

/** The context CommunityShell renders from, for one signed-in user. */
export async function loadCommunityShellContext(
  supabase: SupabaseClient,
  user: Pick<User, "id" | "email">,
  opts: { regionCountsArgs?: Record<string, unknown> } = {}
): Promise<CommunityShellContext> {
  const [{ data: membershipsRaw }, { data: invitationsRaw }, { data: topicsRaw }, { data: regionRows }] =
    await Promise.all([
      supabase
        .from("community_group_members")
        .select(
          `group_id, role, starred, muted, joined_at,
           community_groups ( id, name, slug, region, privacy, member_count, weekly_post_count, last_active_at )`
        )
        .eq("user_id", user.id),
      supabase
        .from("community_group_invitations")
        .select(
          `id, group_id, inviter_user_id, status, created_at,
           community_groups ( id, name, slug, region, privacy )`
        )
        .eq("invitee_user_id", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
      supabase
        .from("community_topics")
        .select("id, label, community_topic_groups ( group_id )")
        .eq("owner_user_id", user.id),
      // browse passes { p_privacy: "public" } (public-only counts); every other page counts all groups
      opts.regionCountsArgs ? supabase.rpc("community_region_counts", opts.regionCountsArgs) : supabase.rpc("community_region_counts"),
    ]);

  const memberships: CommunityMembership[] = (membershipsRaw || []).flatMap((m: any) => {
    if (!m.community_groups) return [];
    return [
      {
        group_id: m.group_id,
        role: m.role,
        starred: !!m.starred,
        muted: !!m.muted,
        joined_at: m.joined_at,
        group: {
          id: m.community_groups.id,
          name: m.community_groups.name,
          slug: m.community_groups.slug,
          region: m.community_groups.region,
          privacy: m.community_groups.privacy,
          member_count: m.community_groups.member_count ?? 0,
          weekly_post_count: m.community_groups.weekly_post_count ?? 0,
          last_active_at: m.community_groups.last_active_at,
        },
      },
    ];
  });

  const invitations: CommunityInvitation[] = (invitationsRaw || []).flatMap((inv: any) => {
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
          privacy: inv.community_groups.privacy,
        },
      },
    ];
  });

  const topics: CommunityTopicSummary[] = (topicsRaw || []).map((t: any) => ({
    id: t.id,
    label: t.label,
    group_count: Array.isArray(t.community_topic_groups) ? t.community_topic_groups.length : 0,
  }));

  const regionCounts: Record<string, number> = {};
  for (const r of COMMUNITY_REGIONS) regionCounts[r.code] = 0;
  for (const row of (regionRows ?? []) as { region: string; count: number }[]) {
    regionCounts[row.region] = Number(row.count) || 0;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("name:full_name, headshot_url:avatar_url, is_platform_admin")
    .eq("id", user.id)
    .maybeSingle();
  const { data: orgRow } = await supabase
    .from("org_memberships")
    .select("organizations(name)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  const employer = (orgRow?.organizations as { name?: string } | null)?.name ?? "";

  return {
    currentUser: {
      id: user.id,
      email: user.email ?? "",
      name: profile?.name ?? user.email?.split("@")[0] ?? "",
      headshotUrl: profile?.headshot_url ?? null,
      employer,
      isPlatformAdmin: !!profile?.is_platform_admin,
    },
    memberships,
    invitations,
    topics,
    regions: COMMUNITY_REGIONS,
    regionCounts,
  };
}
