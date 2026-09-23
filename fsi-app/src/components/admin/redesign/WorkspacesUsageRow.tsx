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
import { StatBlock } from "@/components/ui/StatBlock";
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
  // Admin spacing pass (task 7.5 item 4, 2026-09-12): 8pt-grid padding (was the off-grid "13px 16px").
  padding: "16px",
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

  // dc.html p13's rail card: one bordered card, 2x2 inside, 26px figures, no per-tile border. The
  // row layout keeps four separate bordered cards and "stays exactly as it is" (operator item A1,
  // 2026-09-08): untouched by lane W10-RailCard/StatBlock below.
  const rail = layout === "rail";

  if (rail) {
    // Lane W10-RailCard, 2026-09-22: the rail form's four cells (eyebrow / 26px Anton figure / note)
    // are exactly StatBlock's `layout="stack"` shape (label / Anton numeral / note). StatBlock's
    // stack numeral is 26px by construction, the same size this file used to hand-type only for the
    // rail branch. Reuse-before-construction: no new component, the existing shared part fits
    // without adaptation. The row (non-rail) form's 30px figure does NOT match StatBlock's fixed 26px
    // and is unrelated to "rail" in the RailCard/StatBlock sense, so it is untouched (see above).
    return (
      <SectionCard padding="16px" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <StatBlock label="Companies" value={derived.companies} note={companiesSub} />
        <StatBlock label="Individuals" value={derived.individuals} note={individualsSub} />
        {/* dc.html p13 draws every figure in this card in ink, "May 28" included: a join date is
            not a severity, and the green it used to render in was the only coloured numeral on
            the artboard that the artboard does not colour (lane admin60, 2026-09-08). Lane UI-75
            (RD-67/F42, layout-guard L7): a join date is a DATE STRING, not a count or numeral, and
            is not in the operator's Anton allowlist, so StatBlock's own Anton numeral treatment is
            wrong for this cell specifically: it stays the body face via a plain <p>, matching the
            other tiles' geometry (26px figure line) without StatBlock's fixed Anton font. */}
        <div style={{ display: "grid", gap: 2 }}>
          <p style={{ ...EYEBROW, fontSize: 10, margin: 0 }}>Newest join</p>
          {newestLabel ? (
            <p style={{ ...FIGURE, fontSize: 26, fontFamily: "var(--font-sans)" }}>{newestLabel}</p>
          ) : (
            <p style={{ ...FIGURE, fontSize: 26, fontFamily: "var(--font-sans)", color: "var(--text-2)" }}>—</p> // glyph:verbatim
          )}
          <p style={{ ...SUB, fontSize: 10.5, margin: 0 }}>{newestSub}</p>
        </div>
        {/* Active this month, HONEST-PENDING (section 4): per-org activity events are known new backend
            (section 7). The rail form carries no dashed frame of its own (only the non-rail form does),
            so StatBlock's plain stack fits unmodified; the em-dash and the "populates when..." note
            already say honest-pending, per the file's original comment. */}
        <StatBlock label="Active this month" value="—" note="populates when per-org activity events ship" /> {/* glyph:verbatim */}
      </SectionCard>
    );
  }

  const cells = (
    <>
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
          <p style={{ ...FIGURE, fontFamily: "var(--font-sans)" }}>{newestLabel}</p>
        ) : (
          <p style={{ ...FIGURE, fontFamily: "var(--font-sans)", color: "var(--text-2)" }}>—</p> // glyph:verbatim
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
        {/* Same: the artboard's eyebrows are all --ink-3. The brass marked this
            as the honest-pending tile, which its own em-dash figure and its
            "populates when per-org activity events ship" sub already say. */}
        <p style={EYEBROW}>Active this month</p>
        <p style={{ ...FIGURE, color: "var(--text-2)" }}>—</p> {/* glyph:verbatim */}
        <p style={SUB}>populates when per-org activity events ship</p>
      </div>
    </>
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, margin: "0 0 14px" }}>{cells}</div>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
