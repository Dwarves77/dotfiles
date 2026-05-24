import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { CommunityView, type CommunityViewMembership } from "@/components/community/CommunityView";

export const dynamic = "force-dynamic";

/**
 * Community route, Sequence C rebuild (2026-05-24).
 *
 * Replaces the prior CommunityShell Slack-style layout with the
 * standard global Sidebar pattern. Per design_handoff_2026-05/HANDOFF.md
 * Fix 5, Community sits in its own sidebar group between Map and
 * Admin. Per Fix 4, the AI prompt bar is now present (was absent on
 * production). Per Section 5 SKILL operator-stated corrections,
 * vendor directory entries are removed from scope.
 *
 * The legacy CommunityShell + sidebar swap remain in
 * src/components/community/ for reuse on /community/[slug] (group
 * detail view) which still uses the in-group sidebar. Index page
 * uses the global rail.
 */
export default async function CommunityPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/community");

  const [
    { data: membershipsRaw },
    { data: regionRows },
    { data: profile },
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
    supabase.rpc("community_region_counts"),
    supabase
      .from("profiles")
      .select("name:full_name")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const memberships: CommunityViewMembership[] = (membershipsRaw || []).flatMap((m: any) => {
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

  const regionCounts: Record<string, number> = {};
  for (const row of (regionRows ?? []) as { region: string; count: number }[]) {
    regionCounts[row.region] = Number(row.count) || 0;
  }

  return (
    <CommunityView
      memberships={memberships}
      regionCounts={regionCounts}
      currentUserName={profile?.name ?? user.email?.split("@")[0] ?? ""}
    />
  );
}
