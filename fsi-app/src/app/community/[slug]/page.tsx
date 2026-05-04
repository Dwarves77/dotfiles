import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { CommunityShell } from "@/components/community/CommunityShell";
import { GroupHeader } from "@/components/community/GroupHeader";
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
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=/community/${slug}`);

  // ── Fetch the group ─────────────────────────────────────────────
  // RLS will not return a private group the caller cannot read, so a
  // null result here is indistinguishable (by design) from a bad slug.
  const { data: groupRow } = await supabase
    .from("community_groups")
    .select(
      `
        id, name, slug, region, privacy, description,
        member_count, weekly_post_count, last_active_at, owner_user_id
      `
    )
    .eq("slug", slug)
    .maybeSingle();

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

  // ── Caller membership ───────────────────────────────────────────
  const { data: myMembership } = await supabase
    .from("community_group_members")
    .select("role, starred, muted")
    .eq("group_id", group.id)
    .eq("user_id", user.id)
    .maybeSingle();

  // For private groups, RLS already gated SELECT to members. The
  // assertion below is belt-and-braces in case a future RLS edit
  // softens the policy.
  if (group.privacy === "private" && !myMembership) {
    notFound();
  }

  // ── Shell context ──────────────────────────────────────────────
  // Same fetches as /community page.tsx — kept in sync deliberately.
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

  const regionCounts: Record<string, number> = {};
  await Promise.all(
    REGIONS.map(async (r) => {
      const { count } = await supabase
        .from("community_groups")
        .select("id", { count: "exact", head: true })
        .eq("region", r.code);
      regionCounts[r.code] = count ?? 0;
    })
  );

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("name, headshot_url")
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
  const initialRegion = sp?.region?.toUpperCase() || group.region;

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

      {/* Feed slot — posts ship in C5 */}
      <section
        aria-label="Group posts"
        style={{
          background: "var(--color-bg-surface)",
          border: "1px dashed var(--color-border)",
          borderRadius: 6,
          padding: "48px 24px",
          textAlign: "center",
        }}
      >
        <h3
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 18,
            fontWeight: 400,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "var(--color-text-primary)",
            margin: "0 0 8px",
          }}
        >
          Group feed
        </h3>
        <p
          style={{
            fontSize: 13,
            color: "var(--color-text-secondary)",
            margin: 0,
            lineHeight: 1.55,
          }}
        >
          Posts arriving with C5 — check back soon.
        </p>
      </section>
    </CommunityShell>
  );
}
