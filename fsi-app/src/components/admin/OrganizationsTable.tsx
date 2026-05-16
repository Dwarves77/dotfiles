"use client";

/**
 * OrganizationsTable — workspace-level organizations roster for the
 * Admin → Organizations tab. Replaces the Phase D "Coming soon"
 * placeholder with a real data view rendered against the orgs +
 * org_memberships rows already hydrated by app/admin/page.tsx.
 *
 * Data flow: parent (AdminDashboard) passes orgs and members in via
 * props (initialOrgs / initialMembers from server-side fetch). This
 * component does not query Supabase directly — it derives per-org
 * member counts, role rosters, and last-activity proxies from the
 * member list it receives.
 *
 * Last-activity proxy: there is no per-org activity column today, so
 * we use the most recent org_memberships.created_at as the "last
 * activity" timestamp. Surfaced as such in the column header so the
 * caller knows the proxy nature of the value.
 */

import { useMemo } from "react";

type OrgRow = {
  id: string;
  name: string | null;
  slug: string | null;
  plan: string | null;
  created_at: string | null;
};

type MemberRow = {
  id: string;
  org_id: string;
  user_id: string | null;
  role: string | null;
  created_at: string | null;
  user?: { name?: string | null; headshot_url?: string | null } | null;
};

type RoleSummary = {
  owner: number;
  admin: number;
  viewer: number;
  member: number;
  other: number;
};

const ROLE_KEYS: Array<keyof RoleSummary> = [
  "owner",
  "admin",
  "viewer",
  "member",
];

export interface OrganizationsTableProps {
  orgs: OrgRow[];
  members: MemberRow[];
}

export function OrganizationsTable({ orgs, members }: OrganizationsTableProps) {
  // Pre-compute the per-org index once so the table render below is a
  // straight map over orgs without re-walking the member list per row.
  const indexByOrg = useMemo(() => {
    const map = new Map<
      string,
      { count: number; roles: RoleSummary; lastActivity: string | null }
    >();

    for (const m of members) {
      if (!m.org_id) continue;
      const existing =
        map.get(m.org_id) ||
        ({
          count: 0,
          roles: {
            owner: 0,
            admin: 0,
            viewer: 0,
            member: 0,
            other: 0,
          },
          lastActivity: null,
        } as { count: number; roles: RoleSummary; lastActivity: string | null });

      existing.count += 1;
      const role = (m.role || "").toLowerCase();
      if (role === "owner") existing.roles.owner += 1;
      else if (role === "admin") existing.roles.admin += 1;
      else if (role === "viewer") existing.roles.viewer += 1;
      else if (role === "member") existing.roles.member += 1;
      else existing.roles.other += 1;

      // Last-activity proxy: latest member created_at on this org.
      // Compared lexicographically because Supabase returns ISO 8601
      // strings, which sort the same as their Date equivalents.
      if (m.created_at) {
        if (!existing.lastActivity || m.created_at > existing.lastActivity) {
          existing.lastActivity = m.created_at;
        }
      }

      map.set(m.org_id, existing);
    }

    return map;
  }, [members]);

  // Empty state — honest, not a placeholder. Renders when the server
  // hydrated zero rows; the orgs table is dependent on the caller's
  // RLS scope, so an empty list is a real "no orgs visible" signal,
  // not "data not ready."
  if (orgs.length === 0) {
    return (
      <div
        style={{
          padding: "24px 16px",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-md)",
          background: "var(--surface)",
          color: "var(--text-2)",
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        No organizations are visible to this admin scope. Provisioned orgs
        will appear here as soon as RLS grants access.
      </div>
    );
  }

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--r-md)",
        background: "var(--surface)",
        overflow: "hidden",
      }}
    >
      {/* Header row — keeps column intent visible without sorting UI;
          sorting/filtering can land in a follow-up if usage demands it. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "minmax(160px,1.6fr) minmax(120px,1fr) 90px 80px minmax(180px,1.4fr) 140px",
          gap: 12,
          padding: "10px 14px",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--text-2)",
          borderBottom: "1px solid var(--border)",
          background: "var(--raised)",
        }}
      >
        <div>Name</div>
        <div>Slug</div>
        <div>Plan</div>
        <div style={{ textAlign: "right" }}>Members</div>
        <div>Roles</div>
        <div title="Latest member created_at as activity proxy">
          Last activity
        </div>
      </div>

      <div>
        {orgs.map((org) => {
          const idx = indexByOrg.get(org.id);
          const memberCount = idx?.count ?? 0;
          const roles = idx?.roles;
          const lastActivity = idx?.lastActivity ?? org.created_at ?? null;

          return (
            <div
              key={org.id}
              style={{
                display: "grid",
                gridTemplateColumns:
                  "minmax(160px,1.6fr) minmax(120px,1fr) 90px 80px minmax(180px,1.4fr) 140px",
                gap: 12,
                padding: "12px 14px",
                fontSize: 13,
                color: "var(--text)",
                borderBottom: "1px solid var(--border)",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontWeight: 600, color: "var(--text)" }}>
                  {org.name || "(unnamed)"}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-2)",
                    fontFamily: "monospace",
                  }}
                  title={org.id}
                >
                  {org.id.slice(0, 8)}…
                </div>
              </div>

              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: 12,
                  color: "var(--text-2)",
                }}
              >
                {org.slug || "—"}
              </div>

              <div>
                <span
                  style={{
                    display: "inline-block",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    padding: "2px 8px",
                    borderRadius: 4,
                    border: "1px solid var(--border)",
                    color: "var(--accent)",
                    background: "var(--accent-bg)",
                  }}
                >
                  {org.plan || "—"}
                </span>
              </div>

              <div
                style={{
                  textAlign: "right",
                  fontVariantNumeric: "tabular-nums",
                  fontWeight: 600,
                }}
              >
                {memberCount}
              </div>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  fontSize: 11,
                  color: "var(--text-2)",
                }}
              >
                {roles && memberCount > 0 ? (
                  <>
                    {ROLE_KEYS.filter((k) => roles[k] > 0).map((k) => (
                      <RolePill key={k} label={k} count={roles[k]} />
                    ))}
                    {roles.other > 0 && (
                      <RolePill label="other" count={roles.other} />
                    )}
                  </>
                ) : (
                  <span style={{ color: "var(--text-2)" }}>—</span>
                )}
              </div>

              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-2)",
                }}
                title={lastActivity || ""}
              >
                {lastActivity ? formatDate(lastActivity) : "—"}
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          padding: "8px 14px",
          fontSize: 11,
          color: "var(--text-2)",
          borderTop: "1px solid var(--border)",
          background: "var(--raised)",
        }}
      >
        Showing {orgs.length} organization{orgs.length === 1 ? "" : "s"} ·{" "}
        {members.length} membership{members.length === 1 ? "" : "s"} total ·
        last activity is the most recent membership join (proxy until per-org
        activity events ship).
      </div>
    </div>
  );
}

function RolePill({ label, count }: { label: string; count: number }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "1px 7px",
        borderRadius: 4,
        border: "1px solid var(--border)",
        background: "var(--surface)",
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        color: "var(--text)",
      }}
    >
      {label}
      <span
        style={{
          fontVariantNumeric: "tabular-nums",
          color: "var(--text-2)",
          fontWeight: 700,
        }}
      >
        {count}
      </span>
    </span>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}
