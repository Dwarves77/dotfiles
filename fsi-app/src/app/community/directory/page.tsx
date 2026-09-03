import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { CommunityShell } from "@/components/community/CommunityShell";
import {
  PeerOrgDirectoryTable,
  type OrgTypeRegionRow,
  type SectorRow,
} from "@/components/community/PeerOrgDirectoryTable";
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

const UNSPECIFIED = "Unspecified";

interface ProfileAggRow {
  affiliation_type: string | null;
  region: string | null;
  sector_overrides: string[] | null;
  verifier_status: string | null;
}

/**
 * /community/directory — the peer-org directory (spec 05 §5 component 3: "peer-org directory,
 * aggregate, pseudonymous"). See PeerOrgDirectoryTable.tsx's header for the exact fields this reads
 * and why (no `organizations.type` column exists in the legacy schema, so `profiles.affiliation_type`
 * / `.region` / `.sector_overrides` / `.verifier_status` stand in — counts only, never a name).
 */
export default async function CommunityDirectoryPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/community/directory");

  // ── Shell context (mirrors the other /community/* pages) ────────────────
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

  // ── Aggregate peer-org data ───────────────────────────────────────────
  // Counts only, computed server-side from columns that are themselves never a name or company
  // (affiliation_type/region/sector_overrides/verifier_status). Capped at 5000 rows defensively —
  // this platform's member count is well under that; a future scale-up would need a DB-side
  // aggregate (RPC) rather than this in-memory group-by.
  const { data: profileRows, error: aggErr } = await supabase
    .from("profiles")
    .select("affiliation_type, region, sector_overrides, verifier_status")
    .limit(5000);
  if (aggErr) console.warn("community/directory: profile aggregate read failed", aggErr.message);

  const rows = (profileRows ?? []) as ProfileAggRow[];

  const byOrgTypeAndRegionMap = new Map<string, OrgTypeRegionRow>();
  const bySectorMap = new Map<string, number>();
  for (const row of rows) {
    const orgType = (row.affiliation_type ?? "").trim() || UNSPECIFIED;
    const region = (row.region ?? "").trim() || UNSPECIFIED;
    const key = `${orgType}::${region}`;
    const entry = byOrgTypeAndRegionMap.get(key) ?? { orgType, region, members: 0, verified: 0 };
    entry.members += 1;
    if (row.verifier_status === "active") entry.verified += 1;
    byOrgTypeAndRegionMap.set(key, entry);

    for (const s of row.sector_overrides ?? []) {
      const sector = (s ?? "").trim();
      if (!sector) continue;
      bySectorMap.set(sector, (bySectorMap.get(sector) ?? 0) + 1);
    }
  }

  const byOrgTypeAndRegion = Array.from(byOrgTypeAndRegionMap.values()).sort(
    (a, b) => b.members - a.members
  );
  const bySector: SectorRow[] = Array.from(bySectorMap.entries())
    .map(([sector, members]) => ({ sector, members }))
    .sort((a, b) => b.members - a.members);

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
            Peer-org directory
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
            Aggregate counts only — org type, region, and sector. Never a name, never a company
            (spec 05 §2). {rows.length} member{rows.length === 1 ? "" : "s"} counted.
          </p>
        </header>

        <PeerOrgDirectoryTable
          byOrgTypeAndRegion={byOrgTypeAndRegion}
          bySector={bySector}
          totalMembers={rows.length}
        />
      </div>
    </CommunityShell>
  );
}
