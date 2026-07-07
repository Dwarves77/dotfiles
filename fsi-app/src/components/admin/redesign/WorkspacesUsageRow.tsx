"use client";

/**
 * WorkspacesUsageRow — redesign TEMPLATE 08 (HANDOFF §6.8) "who's using the
 * platform" overview row: Companies / Individuals / Newest join /
 * Active-this-month.
 *
 * Every figure is COMPUTED from the orgs + members rows the server hydrated
 * (never the mock's snapshot literals). The fourth tile, "Active this month",
 * is HONEST-PENDING (§4): a dashed frame + brass eyebrow + em-dash figure that
 * "populates when per-org activity events ship" — per-org activity events are
 * KNOWN NEW BACKEND (HANDOFF §7). A missing figure renders as "—", never 0.
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
};

export interface WorkspacesUsageRowProps {
  orgs: OrgRow[];
  members: MemberRow[];
}

const CARD: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  padding: "13px 16px",
};

const EYEBROW: React.CSSProperties = {
  fontSize: 9.5,
  fontWeight: 800,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--text-2)",
  margin: "0 0 4px",
};

const FIGURE: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: 30,
  lineHeight: 1,
  color: "var(--text)",
  margin: 0,
  fontVariantNumeric: "tabular-nums",
};

const SUB: React.CSSProperties = {
  fontSize: 11,
  color: "var(--text-2)",
  margin: "5px 0 0",
};

export function WorkspacesUsageRow({ orgs, members }: WorkspacesUsageRowProps) {
  const derived = useMemo(() => {
    const companies = orgs.length;

    // Distinct human accounts across all memberships.
    const distinctUsers = new Set(
      members.map((m) => m.user_id).filter((u): u is string => !!u)
    );
    const individuals = distinctUsers.size;

    // Newest join — latest membership created_at (ISO strings sort like Dates).
    let newest: MemberRow | null = null;
    for (const m of members) {
      if (!m.created_at) continue;
      if (!newest || (newest.created_at ?? "") < m.created_at) newest = m;
    }

    const ownerCount = members.filter(
      (m) => (m.role || "").toLowerCase() === "owner"
    ).length;
    const nonOwnerCount = members.length - ownerCount;

    return { companies, individuals, newest, ownerCount, nonOwnerCount };
  }, [orgs, members]);

  const topOrg = orgs[0];
  const companiesSub =
    orgs.length === 1 && topOrg
      ? `${topOrg.name || "(unnamed)"}${topOrg.plan ? ` · ${cap(topOrg.plan)}` : ""}`
      : orgs.length === 0
        ? "no organizations visible"
        : `${orgs.length} organizations`;

  const individualsSub =
    members.length === 0
      ? "no memberships yet"
      : `${derived.ownerCount} owner${derived.ownerCount === 1 ? "" : "s"} · ${derived.nonOwnerCount} member${derived.nonOwnerCount === 1 ? "" : "s"}`;

  const newestLabel = derived.newest?.created_at
    ? new Date(derived.newest.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : null;
  const newestSub = derived.newest
    ? `${(derived.newest.user_id || "").slice(0, 8)}${derived.newest.user_id ? "…" : ""}${derived.newest.role ? ` · ${derived.newest.role}` : ""}`.trim() ||
      "membership"
    : "no joins yet";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 12,
        margin: "0 0 14px",
      }}
    >
      {/* Companies */}
      <div style={CARD}>
        <p style={EYEBROW}>Companies</p>
        <p style={FIGURE}>{derived.companies}</p>
        <p style={SUB}>{companiesSub}</p>
      </div>

      {/* Individuals */}
      <div style={CARD}>
        <p style={EYEBROW}>Individuals</p>
        <p style={FIGURE}>{derived.individuals}</p>
        <p style={SUB}>{individualsSub}</p>
      </div>

      {/* Newest join */}
      <div style={CARD}>
        <p style={EYEBROW}>Newest join</p>
        {newestLabel ? (
          <p style={{ ...FIGURE, color: "var(--sev-low)" }}>{newestLabel}</p>
        ) : (
          <p style={{ ...FIGURE, color: "var(--text-2)" }}>—</p>
        )}
        <p style={SUB}>{newestSub}</p>
      </div>

      {/* Active this month — HONEST-PENDING (§4): per-org activity events are
          known new backend (§7). Dashed frame, brass eyebrow, em-dash. */}
      <div
        style={{
          ...CARD,
          border: "1px dashed var(--color-border-strong)",
          background: "var(--color-background)",
        }}
      >
        <p style={{ ...EYEBROW, color: "var(--brass)" }}>Active this month</p>
        <p style={{ ...FIGURE, color: "var(--text-2)" }}>—</p>
        <p style={SUB}>populates when per-org activity events ship</p>
      </div>
    </div>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
