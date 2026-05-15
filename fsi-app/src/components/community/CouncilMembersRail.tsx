/**
 * CouncilMembersRail — side-card showing a small preview of group
 * members for the right rail of /community/[slug]. Server component.
 *
 * Data source (real, schema-backed):
 *   community_group_members (Migration 029) joined to profiles
 *   (Migration 001 + 075 consolidation) for display name + avatar.
 *   Admins/moderators are surfaced first, then up to 6 rows total. RLS
 *   already restricts visibility (members of a group can read other
 *   members' rows). Migrated 2026-05-15 (075 Phase 2): user_profiles -> profiles.
 *
 * Why a separate query, not lifted from page state:
 *   /community/[slug]/page.tsx fetches the caller's row via maybeSingle
 *   (just role/starred/muted). Threading a second member-list query
 *   into that file would change page-level data flow; the rail keeps
 *   its own scoped read instead, so this PR's diff to page.tsx stays
 *   to layout-only.
 *
 * Empty / failure modes:
 *   - groupId missing → render null (caller is not on a slug page).
 *   - RLS denies (caller not a member of a private group) → render the
 *     "Members visible to members" empty state.
 *   - DB error → swallow and render the same empty state. The rail is
 *     decorative; we never want it to crash a working group page.
 */

import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { Lock } from "lucide-react";

interface CouncilMembersRailProps {
  groupId: string;
  /** Total member count from community_groups.member_count, used to show
   * "+ N more" tail when the rail truncates. Optional. */
  totalMembers?: number;
}

interface MemberRow {
  user_id: string;
  role: "admin" | "moderator" | "member";
  name: string | null;
  headshot_url: string | null;
}

const PREVIEW_LIMIT = 6;

export async function CouncilMembersRail({
  groupId,
  totalMembers,
}: CouncilMembersRailProps) {
  if (!groupId) return null;

  const supabase = await createSupabaseServerClient();

  // Pull up to PREVIEW_LIMIT * 2 to give some headroom before the
  // role-priority sort + truncate. RLS handles visibility; no .or() needed.
  const { data: rows, error } = await supabase
    .from("community_group_members")
    .select("user_id, role")
    .eq("group_id", groupId)
    .limit(PREVIEW_LIMIT * 2);

  if (error || !rows || rows.length === 0) {
    return (
      <RailFrame>
        <EmptyState />
      </RailFrame>
    );
  }

  const userIds = rows.map((r) => r.user_id).filter(Boolean);

  const { data: profiles } = userIds.length
    ? await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", userIds)
    : { data: [] as { id: string; full_name: string | null; avatar_url: string | null }[] };

  const profileById = new Map(
    (profiles ?? []).map((p) => [p.id, p] as const)
  );

  const ROLE_ORDER: Record<string, number> = { admin: 0, moderator: 1, member: 2 };

  const merged: MemberRow[] = rows
    .map((r) => {
      const p = profileById.get(r.user_id);
      return {
        user_id: r.user_id,
        role: r.role as MemberRow["role"],
        name: p?.full_name ?? null,
        headshot_url: p?.avatar_url ?? null,
      };
    })
    .sort((a, b) => {
      const ra = ROLE_ORDER[a.role] ?? 9;
      const rb = ROLE_ORDER[b.role] ?? 9;
      if (ra !== rb) return ra - rb;
      const na = (a.name ?? "").toLocaleLowerCase();
      const nb = (b.name ?? "").toLocaleLowerCase();
      return na.localeCompare(nb);
    })
    .slice(0, PREVIEW_LIMIT);

  const remaining =
    typeof totalMembers === "number" && totalMembers > merged.length
      ? totalMembers - merged.length
      : 0;

  return (
    <RailFrame>
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {merged.map((m) => (
          <li
            key={m.user_id}
            style={{
              display: "grid",
              gridTemplateColumns: "26px 1fr auto",
              gap: 10,
              alignItems: "center",
            }}
          >
            <Avatar name={m.name} headshotUrl={m.headshot_url} />
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "var(--color-text-primary)",
                  lineHeight: 1.25,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {m.name ?? "Member"}
              </div>
            </div>
            {m.role !== "member" && (
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--color-text-muted)",
                  border: "1px solid var(--color-border)",
                  padding: "1px 5px",
                  borderRadius: 3,
                }}
              >
                {m.role === "admin" ? "Admin" : "Mod"}
              </span>
            )}
          </li>
        ))}
        {remaining > 0 && (
          <li
            style={{
              fontSize: 11,
              color: "var(--color-text-muted)",
              paddingTop: 4,
              borderTop: "1px solid var(--color-border)",
            }}
          >
            + {remaining} more member{remaining === 1 ? "" : "s"}
          </li>
        )}
      </ul>
    </RailFrame>
  );
}

function RailFrame({ children }: { children: React.ReactNode }) {
  return (
    <aside
      aria-label="Group members"
      style={{
        background: "var(--color-bg-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 6,
        padding: "16px 18px",
      }}
    >
      <h3
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 13,
          fontWeight: 400,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--color-text-muted)",
          margin: "0 0 12px",
        }}
      >
        Members
      </h3>
      {children}
    </aside>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "flex-start",
        fontSize: 11.5,
        color: "var(--color-text-muted)",
        lineHeight: 1.5,
      }}
    >
      <Lock size={12} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
      <span>Members visible to members of this group.</span>
    </div>
  );
}

function Avatar({
  name,
  headshotUrl,
}: {
  name: string | null;
  headshotUrl: string | null;
}) {
  const display = name ?? "Member";
  if (headshotUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={headshotUrl}
        alt={display}
        width={26}
        height={26}
        style={{
          width: 26,
          height: 26,
          borderRadius: "50%",
          objectFit: "cover",
          border: "1px solid var(--color-border)",
        }}
      />
    );
  }
  const initials = makeInitials(display);
  return (
    <span
      aria-hidden
      style={{
        width: 26,
        height: 26,
        borderRadius: "50%",
        background: "var(--color-bg-base)",
        border: "1px solid var(--color-border)",
        color: "var(--color-text-secondary)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 10,
        fontWeight: 700,
      }}
    >
      {initials}
    </span>
  );
}

function makeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
