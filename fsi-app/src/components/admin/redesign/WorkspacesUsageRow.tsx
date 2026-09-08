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

import { SectionCard } from "@/components/ui/SectionCard";
import { useMemo } from "react";
import { memberDisplayName } from "@/lib/admin/member-display-name";
import { formatLocaleDate } from "@/lib/format";

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
  /** COUNTS-61 (2026-09-08): the joined profile the /admin page already selects
   *  (`user:profiles!user_id(full_name, display_name, email, avatar_url)`). This component ignored
   *  it and printed a sliced `user_id` instead, which is how a raw UUID fragment reached the user. */
  user?: { full_name?: string | null; display_name?: string | null; email?: string | null } | null;
};

export interface WorkspacesUsageRowProps {
  orgs: OrgRow[];
  members: MemberRow[];
  /**
   * "row" (default) is the four-across strip of separate cards this component
   * has always rendered. "rail" is dc.html p13's own drawing of the SAME four
   * figures in the 300px rail: ONE card, a 2x2 grid inside it, 26px figures.
   * Additive variant, not a fork, same computation, same honest-pending fourth
   * tile, one implementation.
   */
  layout?: "row" | "rail";
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

export function WorkspacesUsageRow({ orgs, members, layout = "row" }: WorkspacesUsageRowProps) {
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
    ? formatLocaleDate(new Date(derived.newest.created_at), {
        month: "short",
        day: "numeric",
      })
    : null;
  // COUNTS-61: the shared display chain (src/lib/admin/member-display-name.ts), the same one
  // MembersPanel uses. A member with no name, display name or email renders the absence, never a
  // UUID fragment the reader cannot act on.
  const newestSub = derived.newest
    ? [memberDisplayName(derived.newest), derived.newest.role].filter(Boolean).join(" · ")
    : "no joins yet";

  // dc.html p13's rail card: one bordered card, 2x2 inside, 26px figures, no
  // per-tile border. The row layout keeps four separate bordered cards.
  const rail = layout === "rail";
  const cell: React.CSSProperties = rail ? { display: "grid", gap: 2 } : CARD;
  const figure: React.CSSProperties = rail ? { ...FIGURE, fontSize: 26 } : FIGURE;
  const eyebrow: React.CSSProperties = rail ? { ...EYEBROW, fontSize: 10, margin: 0 } : EYEBROW;
  const sub: React.CSSProperties = rail ? { ...SUB, fontSize: 10.5, margin: 0 } : SUB;

  // Operator item A1 (2026-09-08): the RAIL form of this block is a card, so it is the shared
  // `SectionCard`; it had no rule and no shadow. The non-rail form is a bare 4-column grid inside
  // another card, not a card of its own, and stays exactly as it is.
  const cells = (
    <>
      {/* Companies */}
      <div style={cell}>
        <p style={eyebrow}>Companies</p>
        <p style={figure}>{derived.companies}</p>
        <p style={sub}>{companiesSub}</p>
      </div>

      {/* Individuals */}
      <div style={cell}>
        <p style={eyebrow}>Individuals</p>
        <p style={figure}>{derived.individuals}</p>
        <p style={sub}>{individualsSub}</p>
      </div>

      {/* Newest join */}
      <div style={cell}>
        <p style={eyebrow}>Newest join</p>
        {/* dc.html p13 draws every figure in this card in ink, "May 28" included:
            a join date is not a severity, and the green it used to render in was
            the only coloured numeral on the artboard that the artboard does not
            colour (lane admin60, 2026-09-08). */}
        {newestLabel ? (
          <p style={figure}>{newestLabel}</p>
        ) : (
          <p style={{ ...figure, color: "var(--text-2)" }}>—</p>
        )}
        <p style={sub}>{newestSub}</p>
      </div>

      {/* Active this month — HONEST-PENDING (§4): per-org activity events are
          known new backend (§7). Dashed frame, brass eyebrow, em-dash. */}
      <div
        style={
          rail
            ? cell
            : {
                ...CARD,
                border: "1px dashed var(--color-border-strong)",
                background: "var(--color-background)",
              }
        }
      >
        {/* Same: the artboard's eyebrows are all --ink-3. The brass marked this
            as the honest-pending tile, which its own em-dash figure and its
            "populates when per-org activity events ship" sub already say. */}
        <p style={eyebrow}>Active this month</p>
        <p style={{ ...figure, color: "var(--text-2)" }}>—</p>
        <p style={sub}>populates when per-org activity events ship</p>
      </div>
    </>
  );

  return rail ? (
    <SectionCard padding="14px 16px" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      {cells}
    </SectionCard>
  ) : (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, margin: "0 0 14px" }}>{cells}</div>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
