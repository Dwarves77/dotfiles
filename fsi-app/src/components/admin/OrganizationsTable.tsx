"use client";

/**
 * OrganizationsTable, the ORGANIZATIONS card's body on artboard 13
 * (dc.html p13, the card stacked directly under "SOURCES · PROVISIONAL
 * REVIEW").
 *
 * Built from the shared `RowTable`, the one admin-table anatomy, rather than
 * a page-local grid. Lane admin60 (2026-09-08) rebuilt it for two defects the
 * train-59 fold recorded against this artboard:
 *
 *  1. The LAST ACTIVITY value was CLIPPED at the card's right edge. The header
 *     grid and the row grid were two DIFFERENT track lists, the header used
 *     `minmax(0,…)` floors, the rows used `minmax(160px,…)`/`minmax(180px,…)`
 *    , so the rows had a ~858px hard minimum inside a ~780px content column
 *     and the last column ran under the card's `overflow:hidden` edge. There
 *     is now ONE track list, dc.html p13's own
 *     (`1fr 120px 110px 100px 120px 44px`, 592px of fixed track plus the
 *     flexible name column), shared by header and rows because `RowTable`
 *     derives both from the same `columns` array, and every cell is contained
 *     the way ListRow's cells are (`min-width:0`, ellipsis, no overflow past
 *     the column).
 *  2. A ROLES column the artboard does not draw. The artboard's MEMBERS cell
 *     reads "2 · owners", the count AND its role summary in one cell, so
 *     the roles data is not dropped, it renders where the artboard puts it,
 *     and the sixth column is gone.
 *
 * Data flow is unchanged: the parent (AdminDashboard) passes orgs and members
 * in from the server-side fetch; this component derives per-org member counts,
 * role rosters and the last-activity proxy from the member list it receives.
 *
 * Last-activity proxy: there is no per-org activity column today, so the most
 * recent org_memberships.created_at stands in. Stated in the card foot rather
 * than presented as a real activity timestamp.
 */

import { useMemo } from "react";
import { formatLocaleDate } from "@/lib/format";
import { RowTable } from "@/components/ui/RowTable";
import { Absence } from "@/components/ui/Absence";

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

const ROLE_KEYS: Array<keyof RoleSummary> = ["owner", "admin", "viewer", "member"];

/** dc.html p13's ORGANIZATIONS track list, verbatim. */
const COLUMNS = [
  { label: "Name", width: "1fr" },
  { label: "Slug", width: "120px" },
  { label: "Plan", width: "110px" },
  { label: "Members", width: "100px" },
  { label: "Last activity", width: "120px" },
  { label: "", width: "44px" },
];

export interface OrganizationsTableProps {
  orgs: OrgRow[];
  members: MemberRow[];
}

/** "2 · owners", the artboard's MEMBERS cell: the count then its role summary. */
export function membersCellLabel(count: number, roles: RoleSummary | undefined): string {
  if (!roles || count === 0) return String(count);
  const present = ROLE_KEYS.filter((k) => roles[k] > 0).map((k) => `${k}s`);
  if (roles.other > 0) present.push("other");
  if (present.length === 0) return String(count);
  return `${count} · ${present.join(", ")}`;
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
          roles: { owner: 0, admin: 0, viewer: 0, member: 0, other: 0 },
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
      <div style={{ padding: "18px 16px" }}>
        <Absence reason="connect data" />
      </div>
    );
  }

  return (
    <div data-audit="orgs-table">
      <RowTable
        columns={COLUMNS}
        rows={orgs.map((org) => {
          const idx = indexByOrg.get(org.id);
          const memberCount = idx?.count ?? 0;
          const lastActivity = idx?.lastActivity ?? org.created_at ?? null;
          return {
            key: org.id,
            cells: [
              <span
                key="name"
                style={{
                  display: "block",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {org.name || "(unnamed)"}
              </span>,
              <span
                key="slug"
                style={{
                  display: "block",
                  fontFamily: "ui-monospace, monospace",
                  fontSize: "var(--fs-115)",
                  color: "var(--ink-2)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={org.slug || undefined}
              >
                {org.slug || "—"}
              </span>,
              <span
                key="plan"
                style={{
                  display: "inline-block",
                  maxWidth: "100%",
                  padding: "4px 9px",
                  borderRadius: 4,
                  background: "var(--tag)",
                  fontWeight: 600,
                  fontSize: "var(--fs-105)",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {org.plan || "—"}
              </span>,
              <span key="members" style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {membersCellLabel(memberCount, idx?.roles)}
              </span>,
              <span
                key="activity"
                style={{ display: "block", color: "var(--ink-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                title={lastActivity || undefined}
              >
                {lastActivity ? formatDate(lastActivity) : "—"}
              </span>,
              // dc.html p13 draws a trailing ⋯ glyph on this row. There is no
              // per-org row action anywhere in the app (per-org settings live on
              // that org owner's own Account, which the rail card already says),
              // so the column is held open at the artboard's 44px and left EMPTY
              // rather than drawn as a control that does nothing (ruling 1.1;
              // logged in DEVIATION-LOG.md, lane admin60 2026-09-08).
              <span key="more" aria-hidden="true" />,
            ],
          };
        })}
      />

      <div
        style={{
          padding: "10px 16px",
          borderTop: "1px solid var(--line-2)",
          background: "var(--page)",
          fontSize: "var(--fs-12)",
          color: "var(--ink-3)",
        }}
      >
        Last activity is the most recent membership join (proxy until per-org activity events ship).
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return formatLocaleDate(d, { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}
