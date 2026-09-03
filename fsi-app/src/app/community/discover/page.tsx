import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { CommunityShell } from "@/components/community/CommunityShell";
import { EntityDiscoveryPanel } from "@/components/community/EntityDiscoveryPanel";
import type {
  CommunityMembership,
  CommunityInvitation,
  CommunityTopicSummary,
  CommunityEntityRef,
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
 * /community/discover — cross-group topic discovery + topic follow/digest (spec 05 §5 components
 * 3 and 6). See EntityDiscoveryPanel.tsx's header for why entities stand in for "topics" here.
 * This page only assembles the candidate spine-entity list (same server-side read as
 * community/[slug]/page.tsx's composer — no entity search API exists, see EntityPicker.tsx) and
 * CommunityShell's context; the discovery/follow/digest behaviour lives in the client panel.
 */
export default async function CommunityDiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ entityQuery?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/community/discover");

  const sp = await searchParams;
  const entityQuery = sp?.entityQuery?.trim();

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
      supabase.rpc("community_region_counts"),
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
  for (const r of REGIONS) regionCounts[r.code] = 0;
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

  let entityQueryBuilder = supabase
    .from("entities")
    .select("entity_id, kind, canonical_name")
    .eq("status", "active")
    .order("canonical_name", { ascending: true })
    .limit(60);
  if (entityQuery) {
    entityQueryBuilder = entityQueryBuilder.ilike("canonical_name", `%${entityQuery}%`);
  }
  const { data: entityRows, error: entityErr } = await entityQueryBuilder;
  if (entityErr) console.warn("community/discover: entity candidate read failed", entityErr.message);
  const candidateEntities: CommunityEntityRef[] = (entityRows ?? []) as CommunityEntityRef[];

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
      initialRegion="EU"
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
            Discover by entity
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
            Every thread binds to a spine entity, so following one surfaces every thread that
            touches it — across every group, not just the room it was posted in.
          </p>
        </header>
        <EntityDiscoveryPanel candidateEntities={candidateEntities} />
      </div>
    </CommunityShell>
  );
}
