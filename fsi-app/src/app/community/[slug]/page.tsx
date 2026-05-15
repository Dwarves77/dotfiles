import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { CommunityShell } from "@/components/community/CommunityShell";
import { GroupHeader } from "@/components/community/GroupHeader";
import { PostList } from "@/components/community/PostList";
import { HowPublishingWorks } from "@/components/community/HowPublishingWorks";
import { VendorMentionsRail } from "@/components/community/VendorMentionsRail";
import { CouncilMembersRail } from "@/components/community/CouncilMembersRail";
import type {
  CommunityGroupSummary,
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
 * /community/[slug] — single group view.
 *
 * Phase C scope:
 *   - GroupHeader (icon, name, privacy/region/role badges, star toggle,
 *     members + settings stubs).
 *   - Feed slot stubbed — posts arrive in C5.
 *
 * Privacy enforcement:
 *   community_groups RLS already filters out private groups the caller
 *   has no membership in, so a SELECT for a private group as a non-
 *   member returns no row. We surface that as notFound() — same as a
 *   bad slug — to avoid leaking the group's existence.
 */
export default async function GroupDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ region?: string }>;
}) {
  const t0 = Date.now();
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=/community/${slug}`);

  // ── Phase 1: parallel fetch (5 queries) ─────────────────────────
  // The group lookup (by slug) and four shell-context reads are all
  // independent — none of the shell items needs the resolved group.
  // Sequential execution previously cost ~5 round-trips; one
  // Promise.all collapses them into one wall-clock window. Five
  // queries stays under the Supabase per-connection pool ceiling.
  //
  // Reads:
  //   1) groupRow        — group lookup by slug (RLS-gated)
  //   2) membershipsRaw  — caller's group_members rows + groups
  //   3) invitationsRaw  — caller's pending invitations + groups
  //   4) topicsRaw       — caller's topics + topic_groups
  //   5) regionRows      — RPC: per-region group counts
  const t0Phase1 = Date.now();
  const [
    { data: groupRow },
    { data: membershipsRaw },
    { data: invitationsRaw },
    { data: topicsRaw },
    { data: regionRows },
  ] = await Promise.all([
    supabase
      .from("community_groups")
      .select(
        `
          id, name, slug, region, privacy, description,
          member_count, weekly_post_count, last_active_at, owner_user_id
        `
      )
      .eq("slug", slug)
      .maybeSingle(),
    supabase
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
      .eq("user_id", user.id),
    supabase
      .from("community_group_invitations")
      .select(
        `
          id, group_id, inviter_user_id, status, created_at,
          community_groups ( id, name, slug, region, privacy )
        `
      )
      .eq("invitee_user_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    supabase
      .from("community_topics")
      .select("id, label, community_topic_groups ( group_id )")
      .eq("owner_user_id", user.id),
    supabase.rpc("community_region_counts"),
  ]);
  console.log(
    `[perf] /community/${slug} phase1 ${Date.now() - t0Phase1}ms`
  );

  // RLS will not return a private group the caller cannot read, so a
  // null result here is indistinguishable (by design) from a bad slug.
  if (!groupRow) {
    notFound();
  }

  const group: CommunityGroupSummary & { description?: string | null } = {
    id: groupRow.id,
    name: groupRow.name,
    slug: groupRow.slug,
    region: groupRow.region,
    privacy: groupRow.privacy,
    member_count: groupRow.member_count ?? 0,
    weekly_post_count: groupRow.weekly_post_count ?? 0,
    last_active_at: groupRow.last_active_at,
    description: groupRow.description ?? null,
  };

  // ── Phase 2: parallel fetch (3 queries) ─────────────────────────
  // myMembership requires the resolved group.id from Phase 1, so it
  // sits in a second batch alongside the two sidebar-footer reads.
  //
  // Reads:
  //   1) myMembership — caller's row in this group (depends on group.id)
  //   2) profile      — sidebar footer (name, headshot, admin flag)
  //   3) orgRow       — sidebar footer (employer/org name)
  const t0Phase2 = Date.now();
  const [
    { data: myMembership },
    { data: profile },
    { data: orgRow },
  ] = await Promise.all([
    supabase
      .from("community_group_members")
      .select("role, starred, muted")
      .eq("group_id", group.id)
      .eq("user_id", user.id)
      .maybeSingle(),
    // Migrated 2026-05-15 (075 Phase 2): user_profiles -> profiles. Aliases keep call-site shape.
    supabase
      .from("profiles")
      .select("name:full_name, headshot_url:avatar_url, is_platform_admin")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("org_memberships")
      .select("organizations(name)")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle(),
  ]);
  console.log(
    `[perf] /community/${slug} phase2 ${Date.now() - t0Phase2}ms`
  );

  // For private groups, RLS already gated SELECT to members. The
  // assertion below is belt-and-braces in case a future RLS edit
  // softens the policy.
  if (group.privacy === "private" && !myMembership) {
    notFound();
  }

  // ── Reshape shell-context payloads ──────────────────────────────
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

  const topics: CommunityTopicSummary[] = (topicsRaw || []).map((t: any) => ({
    id: t.id,
    label: t.label,
    group_count: Array.isArray(t.community_topic_groups)
      ? t.community_topic_groups.length
      : 0,
  }));

  const regionCounts: Record<string, number> = {};
  for (const r of REGIONS) regionCounts[r.code] = 0;
  for (const row of (regionRows ?? []) as { region: string; count: number }[]) {
    regionCounts[row.region] = Number(row.count) || 0;
  }

  const employer =
    (orgRow?.organizations as { name?: string } | null)?.name ?? "";

  const sp = await searchParams;
  const initialRegion = sp?.region?.toUpperCase() || group.region;

  console.log(`[perf] /community/${slug} data ${Date.now() - t0}ms`);

  const membershipForHeader = myMembership
    ? {
        role: myMembership.role as "admin" | "moderator" | "member",
        starred: !!myMembership.starred,
      }
    : null;

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
      <GroupHeader group={group} membership={membershipForHeader} />

      {group.description && (
        <section
          style={{
            background: "var(--color-bg-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 6,
            padding: "16px 20px",
            marginBottom: 20,
          }}
        >
          <p
            style={{
              fontSize: 13,
              color: "var(--color-text-secondary)",
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            {group.description}
          </p>
        </section>
      )}

      {/* Two-column body: feed (flex 1) + side rails (260px fixed).
          The grid collapses to a single column under 880px so mobile
          shows the feed first and rails stack underneath. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 260px",
          gap: 20,
          alignItems: "start",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <PostList
            groupId={group.id}
            currentUserId={user.id}
            isGroupMember={!!myMembership}
            isGroupAdmin={
              myMembership?.role === "admin" ||
              myMembership?.role === "moderator"
            }
          />
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            position: "sticky",
            top: 16,
          }}
        >
          <HowPublishingWorks />
          <CouncilMembersRail
            groupId={group.id}
            totalMembers={group.member_count}
          />
          <VendorMentionsRail />
        </div>
      </div>
    </CommunityShell>
  );
}
