import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { CommunityShell } from "@/components/community/CommunityShell";
import {
  BrowseGroupsGrid,
  type BrowseRow,
} from "@/components/community/BrowseGroupsGrid";
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
 * /community/browse — public group directory.
 *
 * Phase C scope decision: BROWSE shows PUBLIC GROUPS ONLY. Private
 * groups appear in the sidebar (from C3) for users who are already
 * members. The sole entry to a private group is via invitation, so
 * surfacing them in browse would be misleading (the join CTA would
 * always be disabled).
 *
 * Data fetched server-side:
 *   - Public groups in the requested region (community_groups RLS
 *     reads public groups for any authenticated user — service role
 *     not needed).
 *   - Caller's group_id memberships (one query, scoped to user_id).
 *   - Caller's pending invitation group_ids (one query).
 *   - Sidebar/masthead context (memberships+groups, invitations,
 *     topics, region counts) — same shape as /community.
 *
 * Membership-state derivation: TWO bulk queries (memberships +
 * pending invitations), then an in-memory join. NOT N+1.
 */
export default async function CommunityBrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ region?: string; privacy?: string }>;
}) {
  const t0 = Date.now();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/community/browse");

  const params = await searchParams;
  const requestedRegion = (params?.region || "EU").toUpperCase();
  // privacy filter is informational; browse is public-only by design.
  const privacyFilter = (params?.privacy || "public").toLowerCase();

  // ── Phase 1: parallel fetch (5 queries) ─────────────────────────
  // The public-groups query and all four "shell context" reads that
  // depend only on user.id are independent of each other. Sequential
  // execution previously cost ~5 round-trips; one Promise.all collapses
  // it into a single wall-clock window. Five queries stays under the
  // Supabase per-connection pool ceiling.
  //
  // Reads:
  //   1) groupsRaw       — public groups in the requested region
  //   2) membershipsRaw  — caller's group_members rows + groups
  //   3) invitationsRaw  — caller's pending invitations + groups
  //   4) topicsRaw       — caller's topics + topic_groups
  //   5) regionRows      — RPC: per-region group counts (public only)
  const t0Phase1 = Date.now();
  const [
    { data: groupsRaw },
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
          member_count, weekly_post_count, last_active_at
        `
      )
      .eq("privacy", "public")
      .eq("region", requestedRegion)
      .order("member_count", { ascending: false }),
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
            id, name, slug, region, privacy
          )
        `
      )
      .eq("invitee_user_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    supabase
      .from("community_topics")
      .select("id, label, community_topic_groups ( group_id )")
      .eq("owner_user_id", user.id),
    supabase.rpc("community_region_counts", { p_privacy: "public" }),
  ]);
  console.log(
    `[perf] /community/browse phase1 ${Date.now() - t0Phase1}ms`
  );

  // ── Reshape public groups ───────────────────────────────────────
  const publicGroups: (CommunityGroupSummary & { description?: string | null })[] =
    (groupsRaw || []).map((g: any) => ({
      id: g.id,
      name: g.name,
      slug: g.slug,
      region: g.region,
      privacy: g.privacy as "public" | "private",
      member_count: g.member_count ?? 0,
      weekly_post_count: g.weekly_post_count ?? 0,
      last_active_at: g.last_active_at,
      description: g.description ?? null,
    }));

  // ── Phase 2: parallel fetch (up to 4 queries) ───────────────────
  // The two membership-state lookups depend on publicGroups.id[] from
  // Phase 1, so they sit in a second batch. Profile + orgRow are
  // independent of Phase 1 too — but we keep them here so each batch
  // stays small and predictable. All four queries are user.id-scoped
  // and well under the pool ceiling.
  //
  // Reads:
  //   1) memRows  — caller's memberships filtered to publicGroups.id[]
  //   2) invRows  — caller's pending invites filtered to publicGroups.id[]
  //   3) profile  — sidebar footer
  //   4) orgRow   — sidebar footer (employer)
  const groupIds = publicGroups.map((g) => g.id);
  const t0Phase2 = Date.now();

  // When there are no public groups in this region we skip the two
  // groupIds-scoped lookups (an .in("group_id", []) would be wasteful).
  // profile + orgRow still run so the sidebar footer renders.
  const memQ =
    groupIds.length > 0
      ? supabase
          .from("community_group_members")
          .select("group_id")
          .eq("user_id", user.id)
          .in("group_id", groupIds)
      : null;
  const invQ =
    groupIds.length > 0
      ? supabase
          .from("community_group_invitations")
          .select("group_id")
          .eq("invitee_user_id", user.id)
          .eq("status", "pending")
          .in("group_id", groupIds)
      : null;

  const [memRes, invRes, profileRes, orgRes] = await Promise.all([
    memQ,
    invQ,
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
    `[perf] /community/browse phase2 ${Date.now() - t0Phase2}ms`
  );

  const memRows = memRes?.data ?? [];
  const invRows = invRes?.data ?? [];
  const profile = profileRes.data;
  const orgRow = orgRes.data;

  const memberGroupIds = new Set<string>();
  const pendingInviteGroupIds = new Set<string>();
  for (const r of memRows as { group_id: string }[]) {
    memberGroupIds.add(r.group_id);
  }
  for (const r of invRows as { group_id: string }[]) {
    pendingInviteGroupIds.add(r.group_id);
  }

  const browseRows: BrowseRow[] = publicGroups.map((g) => ({
    group: g,
    membershipState: memberGroupIds.has(g.id)
      ? "member"
      : pendingInviteGroupIds.has(g.id)
      ? "pending-invite"
      : "none",
  }));

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

  // Region counts — single RPC aggregation (migration 042). The browse
  // surface is public-only, so we passed p_privacy='public' above to
  // scope the counts to the same groups the directory renders.
  const regionCounts: Record<string, number> = {};
  for (const r of REGIONS) regionCounts[r.code] = 0;
  for (const row of (regionRows ?? []) as { region: string; count: number }[]) {
    regionCounts[row.region] = Number(row.count) || 0;
  }

  const employer =
    (orgRow?.organizations as { name?: string } | null)?.name ?? "";

  const activeRegionLabel =
    REGIONS.find((r) => r.code === requestedRegion)?.label ?? requestedRegion;

  console.log(`[perf] /community/browse data ${Date.now() - t0}ms`);

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
      initialRegion={requestedRegion}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <header
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
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
              Browse public groups · {activeRegionLabel}
            </h2>
            <p
              style={{
                fontSize: 12,
                color: "var(--color-text-muted)",
                margin: "4px 0 0",
              }}
            >
              {browseRows.length} public group
              {browseRows.length === 1 ? "" : "s"} visible. Private groups are
              invitation-only and appear in your sidebar once you&apos;re a
              member.
            </p>
          </div>
          {privacyFilter !== "public" && (
            <span
              style={{
                fontSize: 11,
                color: "var(--color-text-muted)",
                fontStyle: "italic",
              }}
            >
              Filter: showing public only (private groups require invitation).
            </span>
          )}
        </header>

        <BrowseGroupsGrid
          rows={browseRows}
          emptyState={{
            title: `No public groups in ${activeRegionLabel}`,
            body:
              "Try another region or check back as the directory expands.",
          }}
        />
      </div>
    </CommunityShell>
  );
}
