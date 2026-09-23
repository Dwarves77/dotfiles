import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { CommunityShell } from "@/components/community/CommunityShell";
import { loadCommunityShellContext, COMMUNITY_REGIONS } from "@/lib/community/shell-context";
import {
  BrowseGroupsGrid,
  type BrowseRow,
} from "@/components/community/BrowseGroupsGrid";
import type { CommunityGroupSummary } from "@/components/community/types";
import { SectionHeader } from "@/components/ui/SectionHeader";

export const dynamic = "force-dynamic";


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
  //   2) the shell context (memberships, invitations, topics, public-only region counts, the sidebar footer): loadCommunityShellContext, lane L33
  const t0Phase1 = Date.now();
  const [{ data: groupsRaw }, shell] = await Promise.all([
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
    loadCommunityShellContext(supabase, user, { regionCountsArgs: { p_privacy: "public" } }),
  ]);
  const { memberships, invitations, topics } = shell;
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
  //   (profile and org, the sidebar footer, ride loadCommunityShellContext in phase 1)
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
          // fitness-allow: F39 (scoped to one page/group render's own bounded row set, not corpus-scale)
          .in("group_id", groupIds)
      : null;
  const invQ =
    groupIds.length > 0
      ? supabase
          .from("community_group_invitations")
          .select("group_id")
          .eq("invitee_user_id", user.id)
          .eq("status", "pending")
          // fitness-allow: F39 (scoped to one page/group render's own bounded row set, not corpus-scale)
          .in("group_id", groupIds)
      : null;

  const [memRes, invRes] = await Promise.all([memQ, invQ]);
  console.log(
    `[perf] /community/browse phase2 ${Date.now() - t0Phase2}ms`
  );

  const memRows = memRes?.data ?? [];
  const invRows = invRes?.data ?? [];

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


  const activeRegionLabel =
    COMMUNITY_REGIONS.find((r) => r.code === requestedRegion)?.label ?? requestedRegion;

  console.log(`[perf] /community/browse data ${Date.now() - t0}ms`);

  return (
    <CommunityShell
      {...shell}
      initialRegion={requestedRegion}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <header>
          {/* W10-Masthead (2026-09-22): F49 allow-entry expired (ruling 2026-09-20); replaced with
              the SectionHeader part, same reasoning across all six /community/* sub-routes. The
              right-aligned filter note moves into SectionHeader's own `meta` slot rather than a
              second flex row, so this is one header block, not a page-local re-layout of it. */}
          <SectionHeader
            title={`Browse public groups · ${activeRegionLabel}`}
            meta={
              privacyFilter !== "public"
                ? "Filter: showing public only (private groups require invitation)."
                : undefined
            }
          />
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
