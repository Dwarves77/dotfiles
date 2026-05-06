import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { CommunityShell } from "@/components/community/CommunityShell";
import { ModerationQueue } from "@/components/community/ModerationQueue";
import type {
  CommunityMembership,
  CommunityInvitation,
  CommunityTopicSummary,
} from "@/components/community/types";

export const dynamic = "force-dynamic";

const REGIONS = [
  { code: "EU", label: "EU / Europe" },
  { code: "UK", label: "United Kingdom" },
  { code: "US", label: "United States" },
  { code: "LATAM", label: "Latin America" },
  { code: "APAC", label: "Asia Pacific" },
  { code: "HK", label: "Hong Kong" },
  { code: "MEA", label: "Middle East & Africa" },
  { code: "GLOBAL", label: "Global / Cross-jurisdictional" },
];

/**
 * /community/moderation — global moderation queue (Phase C, Block C8).
 *
 * Renders <ModerationQueue /> with no groupId prop. RLS on
 * moderation_reports narrows the visible set to:
 *   - reports the caller filed (reporter_user_id = auth.uid()), and
 *   - reports targeting posts in groups where the caller is admin/moderator,
 *   - all reports if the caller is platform admin.
 *
 * Auth is the shared cookie session via createSupabaseServerClient —
 * unauthenticated callers are redirected to /login like every other
 * /community/* page. Non-admin members will simply see an empty queue.
 *
 * The page is wrapped in CommunityShell so the community sidebar /
 * masthead remain consistent. searchParams.region is honoured for the
 * shell context only.
 */
export default async function CommunityModerationPage({
  searchParams,
}: {
  searchParams: Promise<{ region?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/community/moderation");

  // ── Shell context (mirrors /community page.tsx) ─────────────────
  const { data: membershipsRaw } = await supabase
    .from("community_group_members")
    .select(
      `
        group_id, role, starred, muted, joined_at,
        community_groups (
          id, name, slug, region, privacy,
          member_count, weekly_post_count, last_active_at
        )
      `
    )
    .eq("user_id", user.id);

  const memberships: CommunityMembership[] = (membershipsRaw || []).flatMap(
    (m: any) => {
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
    }
  );

  const { data: invitationsRaw } = await supabase
    .from("community_group_invitations")
    .select(
      `
        id, group_id, inviter_user_id, status, created_at,
        community_groups ( id, name, slug, region, privacy )
      `
    )
    .eq("invitee_user_id", user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  const invitations: CommunityInvitation[] = (invitationsRaw || []).flatMap(
    (inv: any) => {
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
    }
  );

  const { data: topicsRaw } = await supabase
    .from("community_topics")
    .select("id, label, community_topic_groups ( group_id )")
    .eq("owner_user_id", user.id);

  const topics: CommunityTopicSummary[] = (topicsRaw || []).map((t: any) => ({
    id: t.id,
    label: t.label,
    group_count: Array.isArray(t.community_topic_groups)
      ? t.community_topic_groups.length
      : 0,
  }));

  // Region counts via the migration-042 RPC.
  const regionCounts: Record<string, number> = {};
  for (const r of REGIONS) regionCounts[r.code] = 0;
  const { data: regionRows } = await supabase.rpc("community_region_counts");
  for (const row of (regionRows ?? []) as { region: string; count: number }[]) {
    regionCounts[row.region] = Number(row.count) || 0;
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("name, headshot_url, is_platform_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: orgRow } = await supabase
    .from("org_memberships")
    .select("organizations(name)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  const employer =
    (orgRow?.organizations as { name?: string } | null)?.name ?? "";

  const sp = await searchParams;
  const initialRegion = sp?.region?.toUpperCase() || "EU";

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
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <header>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 22,
              fontWeight: 400,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "var(--color-text-primary)",
              margin: 0,
            }}
          >
            Moderation queue
          </h2>
          <p
            style={{
              fontSize: 12,
              color: "var(--color-text-muted)",
              margin: "4px 0 0",
              maxWidth: 720,
              lineHeight: 1.55,
            }}
          >
            Reports you filed, reports on posts in groups you administer,
            and (for platform admins) every open report across the
            community. RLS narrows the visible set automatically.
          </p>
        </header>

        <ModerationQueue />
      </div>
    </CommunityShell>
  );
}
