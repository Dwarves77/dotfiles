import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { CommunityShell } from "@/components/community/CommunityShell";
import { loadCommunityShellContext } from "@/lib/community/shell-context";
import { GroupHeader } from "@/components/community/GroupHeader";
import { PostList } from "@/components/community/PostList";
import { HowPublishingWorks } from "@/components/community/HowPublishingWorks";
import { CouncilMembersRail } from "@/components/community/CouncilMembersRail";
import type { CommunityGroupSummary, CommunityEntityRef } from "@/components/community/types";

export const dynamic = "force-dynamic";


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
  searchParams: Promise<{ region?: string; entityQuery?: string }>;
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
  //   2) the shell context (memberships, invitations, topics, region counts, the sidebar footer): loadCommunityShellContext, lane L33
  const t0Phase1 = Date.now();
  const [{ data: groupRow }, shell] = await Promise.all([
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
    loadCommunityShellContext(supabase, user),
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
  //   (profile and org, the sidebar footer, ride loadCommunityShellContext in phase 1)
  const t0Phase2 = Date.now();
  const { data: myMembership } = await supabase
    .from("community_group_members")
    .select("role, starred, muted")
    .eq("group_id", group.id)
    .eq("user_id", user.id)
    .maybeSingle();
  console.log(
    `[perf] /community/${slug} phase2 ${Date.now() - t0Phase2}ms`
  );

  // For private groups, RLS already gated SELECT to members. The
  // assertion below is belt-and-braces in case a future RLS edit
  // softens the policy.
  if (group.privacy === "private" && !myMembership) {
    notFound();
  }


  const sp = await searchParams;
  const initialRegion = sp?.region?.toUpperCase() || group.region;

  // ── Entity-bound posting UI candidate list (wave3 2026-09-03, spec 05 §5 component 2) ──
  // No entity search/list API exists in this lane's contract (grep across src/app/api found none
  // under an "entities" path), so the composer's EntityPicker is fed a server-fetched candidate set
  // directly, the same way every other /community/* page already reads its own data server-side.
  // `entities` is world-readable (migration 282 RLS, same posture as `sources`/`regions`), so the
  // existing cookie-session client suffices — no service-role key needed here. `?entityQuery=`
  // narrows the set by canonical_name (ILIKE); EntityPicker's onSearchSubmit round-trips through it.
  const entityQuery = sp?.entityQuery?.trim();
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
  if (entityErr) console.warn("community: entity candidate read failed", entityErr.message);
  const candidateEntities: CommunityEntityRef[] = (entityRows ?? []) as CommunityEntityRef[];

  console.log(`[perf] /community/${slug} data ${Date.now() - t0}ms`);

  const membershipForHeader = myMembership
    ? {
        role: myMembership.role as "admin" | "moderator" | "member",
        starred: !!myMembership.starred,
      }
    : null;

  return (
    <CommunityShell
      {...shell}
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
            candidateEntities={candidateEntities}
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
        </div>
      </div>
    </CommunityShell>
  );
}
