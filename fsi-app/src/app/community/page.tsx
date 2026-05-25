import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import {
  CommunityView,
  type CommunityViewMembership,
  type CommunityViewThread,
  type CommunityViewPublicForum,
} from "@/components/community/CommunityView";

export const dynamic = "force-dynamic";

/**
 * Community route, H6 rebuild (2026-05-25).
 *
 * Layout binds to design_handoff_2026-05/community.html. Per the
 * design-reference-protocol pre-build checklist, the page fetches:
 *
 *   1. User's group memberships (existing)
 *   2. Region thread counts (existing RPC)
 *   3. Current user profile (existing)
 *   4. Top-level community_posts for user's groups (top ~12 by
 *      last_reply_at DESC) — drives the per-group thread rows
 *   5. Author profiles for thread authors (full_name + org_id +
 *      workspace_role + sector + region) — drives the author
 *      identity line. Migration 105 added these projection columns.
 *   6. Organizations for author org_ids (name) — drives the orange
 *      org chip in the who-line
 *   7. Public community_groups in user's regions, not in memberships
 *      (top ~6 by last_active_at) — drives the "Public forums in
 *      your network" section
 *
 * Per mockup audit (H6 pre-build): no top-level "+ New Post" CTA,
 * no AiPromptBar. Compose flow routes via group navigation; existing
 * PostComposer is mounted on /community/[slug].
 *
 * Per H5 anchor compatibility: every top-level thread row renders
 * id="post-{uuid}" so anchored links from /admin community pickups
 * queue resolve to a specific post.
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

  const groupIds = memberships.map((m) => m.group_id);
  const userRegions = Array.from(new Set(memberships.map((m) => m.group.region)));

  // Top-level posts across user's groups. 24 rows over 4-8 groups
  // gives ~3 per group after in-memory partitioning. Reply rows
  // excluded — only top-level threads render in the group panel.
  const [
    { data: postsRaw },
    { data: publicForumsRaw },
  ] = await Promise.all([
    groupIds.length > 0
      ? supabase
          .from("community_posts")
          .select(
            "id, group_id, title, body, reply_count, created_at, last_reply_at, author_user_id, referenced_intelligence_item_ids"
          )
          .in("group_id", groupIds)
          .is("parent_post_id", null)
          .order("last_reply_at", { ascending: false, nullsFirst: false })
          .limit(24)
      : Promise.resolve({ data: [] as any[] }),
    userRegions.length > 0
      ? supabase
          .from("community_groups")
          .select("id, name, slug, region, privacy, member_count, weekly_post_count, last_active_at")
          .eq("privacy", "public")
          .in("region", userRegions)
          .not("id", "in", groupIds.length > 0 ? `(${groupIds.map((id) => `"${id}"`).join(",")})` : `("00000000-0000-0000-0000-000000000000")`)
          .order("last_active_at", { ascending: false })
          .limit(6)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const posts = (postsRaw ?? []) as Array<{
    id: string;
    group_id: string;
    title: string | null;
    body: string;
    reply_count: number;
    created_at: string;
    last_reply_at: string | null;
    author_user_id: string | null;
    referenced_intelligence_item_ids: string[] | null;
  }>;

  // Author projections. Migration 105 added org_id, workspace_role,
  // sector TEXT[], region TEXT[] to profiles. Fetch in one round-trip
  // keyed by author IDs.
  const authorIds = Array.from(
    new Set(posts.map((p) => p.author_user_id).filter((id): id is string => Boolean(id)))
  );

  const authorProfileMap = new Map<
    string,
    { full_name: string | null; org_id: string | null; workspace_role: string | null; sector: string[] | null; region: string[] | null }
  >();
  const orgNameMap = new Map<string, string>();

  if (authorIds.length > 0) {
    const { data: authorRows } = await supabase
      .from("profiles")
      .select("id, full_name, org_id, workspace_role, sector, region")
      .in("id", authorIds);
    for (const row of (authorRows ?? []) as Array<{
      id: string;
      full_name: string | null;
      org_id: string | null;
      workspace_role: string | null;
      sector: string[] | null;
      region: string[] | null;
    }>) {
      authorProfileMap.set(row.id, {
        full_name: row.full_name,
        org_id: row.org_id,
        workspace_role: row.workspace_role,
        sector: row.sector,
        region: row.region,
      });
    }

    const orgIds = Array.from(
      new Set(
        Array.from(authorProfileMap.values())
          .map((p) => p.org_id)
          .filter((id): id is string => Boolean(id))
      )
    );
    if (orgIds.length > 0) {
      const { data: orgRows } = await supabase
        .from("organizations")
        .select("id, name")
        .in("id", orgIds);
      for (const row of (orgRows ?? []) as Array<{ id: string; name: string }>) {
        orgNameMap.set(row.id, row.name);
      }
    }
  }

  const threads: CommunityViewThread[] = posts.map((p) => {
    const profile = p.author_user_id ? authorProfileMap.get(p.author_user_id) ?? null : null;
    const orgName = profile?.org_id ? orgNameMap.get(profile.org_id) ?? null : null;
    return {
      id: p.id,
      group_id: p.group_id,
      title: p.title,
      body: p.body,
      reply_count: p.reply_count,
      created_at: p.created_at,
      last_reply_at: p.last_reply_at,
      referenced_intelligence_item_ids: p.referenced_intelligence_item_ids ?? [],
      author: {
        full_name: profile?.full_name ?? null,
        org_name: orgName,
        workspace_role: profile?.workspace_role ?? null,
        sector: profile?.sector ?? [],
        region: profile?.region ?? [],
      },
    };
  });

  const publicForums: CommunityViewPublicForum[] = ((publicForumsRaw ?? []) as Array<{
    id: string;
    name: string;
    slug: string;
    region: string;
    privacy: string;
    member_count: number | null;
    weekly_post_count: number | null;
    last_active_at: string | null;
  }>).map((g) => ({
    id: g.id,
    name: g.name,
    slug: g.slug,
    region: g.region,
    member_count: g.member_count ?? 0,
    weekly_post_count: g.weekly_post_count ?? 0,
    last_active_at: g.last_active_at,
  }));

  return (
    <CommunityView
      memberships={memberships}
      regionCounts={regionCounts}
      threads={threads}
      publicForums={publicForums}
      currentUserName={profile?.name ?? user.email?.split("@")[0] ?? ""}
    />
  );
}
