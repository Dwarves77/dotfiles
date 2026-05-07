import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { CommunityShell } from "@/components/community/CommunityShell";
import { HowPublishingWorks } from "@/components/community/HowPublishingWorks";
import { VendorMentionsRail } from "@/components/community/VendorMentionsRail";
import type {
  CommunityInvitation,
  CommunityMembership,
} from "@/components/community/types";

export const dynamic = "force-dynamic";

/**
 * Community route shell — Phase C foundation.
 *
 * Slack-style sidebar swap (the global Sidebar is hidden on /community
 * routes via a body[data-side="community"] CSS rule applied by
 * CommunityShell's mount effect).
 *
 * Data fetched server-side:
 *   - User's group memberships (joined to community_groups, includes
 *     starred/muted/role).
 *   - User's pending invitations (community_group_invitations).
 *   - User's topics (community_topics with their group counts).
 *   - Per-region group counts for the masthead region tabs (across all
 *     groups visible to this user via RLS — public groups + private
 *     where caller is a member).
 *
 * Posts, group browsing, and search are deferred to C4 / Phase D.
 */
export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<{ region?: string }>;
}) {
  const t0 = Date.now();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/community");

  // ── Parallel data fetch ─────────────────────────────────────────
  // All six reads below are independent (each scoped only by user.id
  // or unconditional via RPC). Running them sequentially cost ~5-6
  // round-trips; batching into a single Promise.all collapses that to
  // one wall-clock window. Six queries is at Supabase's pool ceiling
  // for a single connection — safe here because each query touches a
  // different table and is short-lived.
  //
  // Reads:
  //   1) memberships  — caller's group_members rows + embedded groups
  //   2) invitations  — pending invitations addressed to caller
  //   3) topics       — caller's topics + topic_groups counts
  //   4) regionRows   — RPC: per-region group counts visible to caller
  //   5) profile      — sidebar footer (name, headshot, admin flag)
  //   6) orgRow       — sidebar footer (employer/org name)
  const t0Fetch = Date.now();
  const [
    { data: membershipsRaw },
    { data: invitationsRaw },
    { data: topicsRaw },
    { data: regionRows },
    { data: profile },
    { data: orgRow },
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
            id,
            name,
            slug,
            region,
            privacy
          )
        `
      )
      .eq("invitee_user_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    supabase
      .from("community_topics")
      .select(
        `
          id,
          label,
          created_at,
          community_topic_groups ( group_id )
        `
      )
      .eq("owner_user_id", user.id)
      .order("created_at", { ascending: true }),
    supabase.rpc("community_region_counts"),
    supabase
      .from("user_profiles")
      .select("name, headshot_url, is_platform_admin")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("org_memberships")
      .select("organizations(name)")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle(),
  ]);
  console.log(
    `[perf] /community parallel-fetch ${Date.now() - t0Fetch}ms`
  );

  // ── Reshape memberships ─────────────────────────────────────────
  const memberships = (membershipsRaw || []).flatMap((m: any) => {
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

  // ── Reshape invitations ─────────────────────────────────────────
  const invitations = (invitationsRaw || []).flatMap((inv: any) => {
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
          privacy: inv.community_groups.privacy as "public" | "private",
        },
      },
    ];
  });

  // ── Reshape topics ──────────────────────────────────────────────
  // RLS restricts community_topics to the owner. We pull the topic
  // rows + a count of joined groups via the junction; rendering is
  // sidebar-only for this PR.
  const topics = (topicsRaw || []).map((t: any) => ({
    id: t.id,
    label: t.label,
    group_count: Array.isArray(t.community_topic_groups)
      ? t.community_topic_groups.length
      : 0,
  }));

  // ── Region counts (reshape) ─────────────────────────────────────
  // Counts of groups VISIBLE TO THIS USER per region — RLS already
  // limits the result to public groups + private groups where caller
  // is a member, so a plain head-count is enough.
  const REGIONS: { code: string; label: string }[] = [
    { code: "EU", label: "EU / Europe" },
    { code: "UK", label: "United Kingdom" },
    { code: "US", label: "United States" },
    { code: "LATAM", label: "Latin America" },
    { code: "APAC", label: "Asia Pacific" },
    { code: "HK", label: "Hong Kong" },
    { code: "MEA", label: "Middle East & Africa" },
    { code: "GLOBAL", label: "Global / Cross-jurisdictional" },
  ];

  const regionCounts: Record<string, number> = {};
  for (const r of REGIONS) regionCounts[r.code] = 0;
  for (const row of (regionRows ?? []) as { region: string; count: number }[]) {
    regionCounts[row.region] = Number(row.count) || 0;
  }

  // Workspace label (employer/org) — best-effort; the sidebar footer
  // shows the user's primary org name.
  const employer =
    (orgRow?.organizations as { name?: string } | null)?.name ?? "";

  const params = await searchParams;
  const initialRegion = params?.region?.toUpperCase() || "EU";

  console.log(`[perf] /community data ${Date.now() - t0}ms`);

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
      {/* Default-body — Phase D additive. CommunityShell renders its
          own default body when children is undefined; we override that
          here so we can drop in the HowPublishingWorks + VendorMentions
          rails alongside the existing invitations / empty-state /
          memberships preview. The left column duplicates the JSX of
          CommunityShell.CommunityDefaultBody so the body still works
          when the user has no groups OR has invitations OR has groups —
          all three states are preserved. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 260px",
          gap: 24,
          alignItems: "start",
          maxWidth: 1180,
        }}
      >
        <CommunityDefaultBodyInline
          memberships={memberships}
          invitations={invitations}
          currentUserName={profile?.name ?? user.email?.split("@")[0] ?? ""}
        />
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
          <VendorMentionsRail />
        </div>
      </div>
    </CommunityShell>
  );
}

/**
 * CommunityDefaultBodyInline — stripped duplicate of the default body
 * rendered inside CommunityShell.tsx (which is out of file scope for
 * this PR). Mirrors the same shapes (invitations panel, empty state,
 * memberships preview) so the page works for all three states.
 *
 * Why duplicated rather than imported: CommunityShell.tsx exports
 * neither these helpers nor a slot prop, and modifying that file is
 * out of scope. Once a follow-up extracts these helpers (or adds a
 * slot prop), this duplicate goes away.
 */
function CommunityDefaultBodyInline({
  memberships,
  invitations,
  currentUserName,
}: {
  memberships: CommunityMembership[];
  invitations: CommunityInvitation[];
  currentUserName: string;
}) {
  const hasGroups = memberships.length > 0;
  const sorted = [...memberships].sort((a, b) => {
    if (a.starred !== b.starred) return a.starred ? -1 : 1;
    return a.group.name.localeCompare(b.group.name);
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, minWidth: 0 }}>
      {invitations.length > 0 && (
        <section
          style={{
            background: "var(--color-bg-surface)",
            border: "1px solid var(--color-border)",
            borderLeft: "3px solid var(--color-primary)",
            borderRadius: 8,
            padding: "18px 22px",
          }}
        >
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 18,
              fontWeight: 400,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "var(--color-text-primary)",
              margin: "0 0 4px",
            }}
          >
            Pending invitations ({invitations.length})
          </h2>
          <p
            style={{
              fontSize: 12,
              color: "var(--color-text-muted)",
              margin: "0 0 8px",
            }}
          >
            Group admins have invited you to join. Open Community to accept or
            decline; this page surfaces a quick orientation rail.
          </p>
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {invitations.map((inv) => (
              <li
                key={inv.id}
                style={{
                  fontSize: 12,
                  color: "var(--color-text-secondary)",
                  padding: "6px 10px",
                  border: "1px solid var(--color-border)",
                  borderRadius: 6,
                  background: "var(--color-bg-base)",
                }}
              >
                <b>{inv.group.name}</b>
                {" · "}
                {inv.group.privacy === "private" ? "Private group" : "Public forum"}
                {" · "}
                {inv.group.region}
              </li>
            ))}
          </ul>
        </section>
      )}

      {!hasGroups && (
        <section
          style={{
            background: "var(--color-bg-surface)",
            border: "1px dashed var(--color-border)",
            borderRadius: 8,
            padding: "32px 24px",
            textAlign: "center",
          }}
        >
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 22,
              fontWeight: 400,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "var(--color-text-primary)",
              margin: "0 0 8px",
            }}
          >
            No groups yet
          </h2>
          <p
            style={{
              fontSize: 13,
              color: "var(--color-text-secondary)",
              margin: 0,
              lineHeight: 1.55,
            }}
          >
            {invitations.length > 0
              ? "Accept an invitation above, or browse the public forums to find peers."
              : "Browse public forums or accept an invitation to start collaborating with peers across the industry."}
          </p>
        </section>
      )}

      {hasGroups && (
        <section>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 22,
              fontWeight: 400,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "var(--color-text-primary)",
              margin: "0 0 8px",
            }}
          >
            Welcome back, {currentUserName || "operator"}
          </h2>
          <p
            style={{
              fontSize: 12,
              color: "var(--color-text-muted)",
              margin: "0 0 16px",
            }}
          >
            Pick a group from the sidebar to open its feed.
          </p>
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              gap: 10,
            }}
          >
            {sorted.map((m) => (
              <li
                key={m.group_id}
                style={{
                  padding: "12px 14px",
                  border: "1px solid var(--color-border)",
                  borderLeft:
                    m.group.privacy === "private"
                      ? "3px solid var(--color-high, var(--color-text-primary))"
                      : "3px solid var(--color-border)",
                  borderRadius: 6,
                  background: "var(--color-bg-surface)",
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "var(--color-text-primary)",
                    marginBottom: 2,
                  }}
                >
                  {m.group.name}
                </div>
                <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                  {m.group.privacy === "private" ? "Private" : "Public"}
                  {" · "}
                  {m.group.region}
                  {" · "}
                  {m.group.member_count} member
                  {m.group.member_count === 1 ? "" : "s"}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

