"use client";

/**
 * OperationsDetailSurface — client subcomponent for /operations/[slug].
 *
 * Detail view for a single Operations Profile (item_type='regional_data').
 * Cloned from ResearchFindingDetailSurface with Operations-specific section
 * headings and the matrix eligibility gate for S3/S4.
 *
 * Layout mirrors ResearchFindingDetailSurface for platform coherence:
 *   - Hero card (deck, source attribution, severity pill, region pill, date)
 *   - Stat strip (Published + optional citations)
 *   - Main panel: OperationsSections (when sections present) OR legacy fallback
 *   - Sources panel + source-tier legend
 *   - Related items panel
 *
 * Section-aware mode:
 *   When `sections` are supplied (intelligence_item_sections rows from the
 *   canonical pipeline), the main content panel renders the 8 Operations
 *   sections via <OperationsSections>. S3/S4 render only when the matrix
 *   gate confirms eligibility (matrixEligibility prop). When ineligible,
 *   an honest omit-note is shown instead — never a silent gap.
 *
 * Grounding per analysis-construction-spec §5:
 *   S1/S2 — always render (single-region span facts).
 *   S3 — MATRIX gate: >=2 sourced regions per dimension AND item-jurisdiction
 *         membership. Omit-with-note when ineligible.
 *   S4 — same gate as S3 (S4 is transitive over S3).
 *   S5–S7 — render when sections present (conditional, may be absent).
 *   S8 — always render (Sources).
 *
 * Section headings match system-prompt.ts lines 189-196 exactly.
 */

import { useMemo, useState } from "react";
import { formatDate } from "@/lib/format";
import Link from "next/link";
import type { Resource, ItemConnection, Supersession } from "@/types/resource";
import type { IntelligenceItemSectionRow } from "@/lib/supabase-server";
import type { MatrixEligibility } from "@/lib/agent/formats/operations-matrix";
import type { ItemRelevance } from "@/lib/workspace/profile";
import { GfmSection } from "@/components/shared/GfmSection";
import { TIER_LABELS } from "@/lib/tier-labels";
import { WatchButton } from "@/components/ui/WatchButton";
import { ItemConnectionsCard } from "@/components/shell/ItemConnectionsCard";
import { RelevanceBadgeClient } from "@/components/shell/RelevanceBadgeClient";

// ── Related item shape ──────────────────────────────────────────────────────

interface RelatedItem {
  id: string;
  title: string;
  summary: string | null;
  sourceName: string | null;
  addedDate: string | null;
}

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  resource: Resource;
  related: RelatedItem[];
  relatedReason: "jurisdiction" | "source" | "none";
  /**
   * Parsed Operations sections from intelligence_item_sections.
   * When non-empty, renders the 8 structured section cards (section-aware mode).
   * Empty array falls back to the raw full_brief markdown toggle (legacy).
   */
  sections?: IntelligenceItemSectionRow[];
  /**
   * Matrix eligibility gate result (from checkMatrixEligibility server-side).
   * Controls whether S3/S4 render or show the honest omit-note.
   * When undefined (e.g. during loading or error), S3/S4 are treated as
   * ineligible — fail-closed is the correct posture.
   */
  matrixEligibility?: MatrixEligibility;
  /**
   * item 5b — the source's last transport fetch outcome (sources.fetch_status). When it is a block
   * value (cdn_block / soft_404 / blocked / error) the source link is suppressed + labelled rather than
   * shown as a live link the pipeline could not read. null/undefined (incl. pre-migration-147) → render
   * exactly as today.
   */
  sourceFetchStatus?: string | null;
  /** Flywheel U9 (D1) — item_cross_references connections + any supersessions involving this item, the
   *  viewer's relevance-to-your-operation lens, and the gated title lookup for both. */
  supersessions?: Supersession[];
  connections?: ItemConnection[];
  relevance?: ItemRelevance | null;
  resourceLookup?: Record<string, { id: string; title: string; priority: string }>;
  /**
   * PERF-4 (2026-09-03, docs/audits/perf-load-times-2026-09-03.md dispatch item (2)): the viewer's
   * server-resolved watch state for THIS item (src/lib/watchlist/membership.ts's
   * fetchWatchMembership, read in parallel with loadDetail by the page). Threaded straight to
   * <WatchButton> below — passing `initialWatched` means it renders its real state on first paint
   * and fires zero client fetch on mount.
   */
  initialWatched?: boolean;
  initialTeamWatched?: boolean;
  initialTeamAvailable?: boolean;
}

// ── Operations section headings ─────────────────────────────────────────────
//
// Match system-prompt.ts lines 189-196 exactly:
//   1. Operational Cost Baseline for the Region
//   2. Feasibility of Specific Operational Choices
//   3. Cost Comparison Against Alternatives
//   4. Cross-Regional Strategic Implications
//   5. Competitive Positioning in the Region
//   6. Client Conversation Talking Points
//   7. Pending Changes That Shift the Calculus
//   8. Sources
//
// operations.ts keys: "1"–"8". We map those here.

const OPERATIONS_SECTION_HEADINGS: Record<string, string> = {
  "1": "Operational Cost Baseline for the Region",
  "2": "Feasibility of Specific Operational Choices",
  "3": "Cost Comparison Against Alternatives",
  "4": "Cross-Regional Strategic Implications",
  "5": "Competitive Positioning in the Region",
  "6": "Client Conversation Talking Points",
  "7": "Pending Changes That Shift the Calculus",
  "8": "Sources",
};

// S3 and S4 are MATRIX-gated (conditional on coverage + item-jurisdiction).
const MATRIX_GATED_KEYS = new Set(["3", "4"]);

const KNOWN_OPERATIONS_KEYS = new Set(["1", "2", "3", "4", "5", "6", "7", "8"]);

// ── OperationsSections renderer ───────────────────────────────────────────

function OperationsSections({
  rows,
  matrixEligibility,
}: {
  rows: IntelligenceItemSectionRow[];
  matrixEligibility: MatrixEligibility | undefined;
}) {
  const known = rows.filter(
    (r) => KNOWN_OPERATIONS_KEYS.has(r.section_key)
  );
  if (known.length === 0) return null;

  return (
    <div>
      {known.map((row) => {
        const heading =
          OPERATIONS_SECTION_HEADINGS[row.section_key] ||
          `Section ${row.section_key}`;

        // S3/S4: check matrix eligibility before rendering.
        if (MATRIX_GATED_KEYS.has(row.section_key)) {
          const eligible =
            row.section_key === "3"
              ? matrixEligibility?.s3Eligible === true
              : matrixEligibility?.s4Eligible === true;

          if (!eligible) {
            // Show honest omit-note instead of the section content.
            // The note aggregates the most informative dimension message.
            const omitNote = deriveOmitNote(row.section_key, matrixEligibility);
            return (
              <MatrixOmitNote
                key={row.section_key}
                sectionKey={row.section_key}
                heading={heading}
                omitNote={omitNote}
              />
            );
          }
        }

        // Skip entirely absent/empty conditional sections (S5/S6) without
        // showing any placeholder — these are truly optional.
        if (!row.content_md || !row.content_md.trim()) {
          if (row.is_conditional) return null;
          // Non-conditional empty section: show honest empty state.
          return (
            <OperationsSectionCard
              key={row.section_key}
              sectionKey={row.section_key}
              heading={heading}
              isEmpty
            />
          );
        }

        return (
          <OperationsSectionCard
            key={row.section_key}
            sectionKey={row.section_key}
            heading={heading}
            contentMd={row.content_md}
          />
        );
      })}
    </div>
  );
}

// ── Matrix omit note ──────────────────────────────────────────────────────

function deriveOmitNote(
  sectionKey: string,
  matrixEligibility: MatrixEligibility | undefined
): string {
  if (!matrixEligibility) {
    return sectionKey === "3"
      ? "Cost comparison requires data for this region across at least 2 sourced regions. Coverage is still building."
      : "Cross-regional implications require cost and feasibility data across at least 2 sourced regions. Coverage is still building.";
  }

  // Find the most informative omit note from the eligible dimensions.
  const ineligibleDims = matrixEligibility.dimensions.filter((d) => !d.eligible);
  if (ineligibleDims.length === 0) {
    return "Section not yet generated.";
  }
  // If no dimensions are sourced at all — simple summary.
  const allUnsourced = ineligibleDims.every((d) => d.sourcedRegionCount === 0);
  if (allUnsourced) {
    return sectionKey === "3"
      ? "Cost comparison not yet available — no dimensions have been sourced across multiple regions."
      : "Cross-regional comparison not yet available — no dimensions have been sourced across multiple regions.";
  }

  // If item jurisdiction is the missing piece — state that specifically.
  const jurisdictionMissing = ineligibleDims.some(
    (d) => d.sourcedRegionCount >= 2 && !d.itemJurisdictionPresent
  );
  const regions = matrixEligibility.resolvedRegionCodes.join(", ") || "this item's jurisdiction";
  if (jurisdictionMissing) {
    return sectionKey === "3"
      ? `Cost comparison requires ${regions} to have sourced coverage. Coverage for this region is still pending.`
      : `Cross-regional comparison requires ${regions} to have sourced coverage. Coverage for this region is still pending.`;
  }

  // Generic: coverage building.
  return sectionKey === "3"
    ? "Cost comparison requires at least 2 sourced regions per dimension — coverage is still building."
    : "Cross-regional implications require at least 2 sourced regions per dimension — coverage is still building.";
}

function MatrixOmitNote({
  sectionKey,
  heading,
  omitNote,
}: {
  sectionKey: string;
  heading: string;
  omitNote: string;
}) {
  return (
    <section
      id={`operations-section-${sectionKey}`}
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md, 6px)",
        marginBottom: 14,
        boxShadow: "var(--shadow-card)",
        overflow: "hidden",
        opacity: 0.75,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 22px",
          background: "var(--color-bg-raised)",
          borderBottom: "1px solid var(--color-border-subtle, var(--color-border))",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 13,
            fontWeight: 400,
            letterSpacing: "0.08em",
            color: "var(--color-text-muted)",
            background: "var(--color-bg-raised)",
            border: "1px solid var(--color-border)",
            padding: "4px 10px",
            borderRadius: 3,
            minWidth: 36,
            textAlign: "center",
            lineHeight: 1.1,
          }}
        >
          S{sectionKey}
        </span>
        <span
          data-guard-title
          style={{
            fontSize: 13.5,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--color-text-muted)",
            overflowWrap: "anywhere",
            minWidth: 0,
          }}
        >
          {heading}
        </span>
      </div>
      <div
        style={{
          padding: "14px 22px 18px",
          fontSize: 13,
          lineHeight: 1.55,
          color: "var(--color-text-muted)",
          fontStyle: "italic",
          borderLeft: "3px solid var(--color-border)",
        }}
      >
        {omitNote}
      </div>
    </section>
  );
}

// ── Operations section card ───────────────────────────────────────────────

function OperationsSectionCard({
  sectionKey,
  heading,
  contentMd,
  isEmpty,
}: {
  sectionKey: string;
  heading: string;
  contentMd?: string;
  isEmpty?: boolean;
}) {
  return (
    <section
      id={`operations-section-${sectionKey}`}
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md, 6px)",
        marginBottom: 14,
        boxShadow: "var(--shadow-card)",
        overflow: "hidden",
      }}
    >
      {/* Section header — numbered badge + heading */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 22px",
          background: "var(--color-bg-raised)",
          borderBottom: "1px solid var(--color-border-subtle, var(--color-border))",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 13,
            fontWeight: 400,
            letterSpacing: "0.08em",
            color: "#fff",
            background: "var(--color-primary)",
            padding: "4px 10px",
            borderRadius: 3,
            minWidth: 36,
            textAlign: "center",
            lineHeight: 1.1,
          }}
        >
          S{sectionKey}
        </span>
        <span
          data-guard-title
          style={{
            fontSize: 13.5,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--color-text-primary)",
            overflowWrap: "anywhere",
            minWidth: 0,
          }}
        >
          {heading}
        </span>
      </div>
      {/* Section body */}
      <div style={{ padding: "18px 22px 22px" }}>
        {isEmpty || !contentMd ? (
          <p
            style={{
              fontSize: 13,
              color: "var(--color-text-muted)",
              margin: 0,
              fontStyle: "italic",
            }}
          >
            Content pending for this section.
          </p>
        ) : (
          /* Reuse the platform's shared prose renderer — not re-implemented. */
          <GfmSection markdown={contentMd} />
        )}
      </div>
    </section>
  );
}

// ── Severity vocabulary ───────────────────────────────────────────────────

type Severity = "action" | "cost" | "monitor" | "background";

const SEVERITY_LABEL: Record<Severity, string> = {
  action: "Action required",
  cost: "Cost alert",
  monitor: "Monitor",
  background: "Background",
};

const SEVERITY_TONE: Record<Severity, { fg: string; bg: string; bd: string }> = {
  action: {
    fg: "var(--color-critical)",
    bg: "var(--color-critical-bg)",
    bd: "var(--color-critical-border)",
  },
  cost: {
    fg: "var(--color-high)",
    bg: "var(--color-high-bg)",
    bd: "var(--color-high-border)",
  },
  monitor: {
    fg: "var(--color-moderate)",
    bg: "var(--color-moderate-bg)",
    bd: "var(--color-moderate-border)",
  },
  background: {
    fg: "var(--color-text-muted)",
    bg: "var(--color-surface)",
    bd: "var(--color-border)",
  },
};

function deriveSeverity(r: Resource): Severity {
  const sev = r.severity?.toLowerCase();
  if (sev === "action" || sev === "cost" || sev === "monitor" || sev === "background") {
    return sev as Severity;
  }
  const text = `${r.title} ${r.note || ""}`.toLowerCase();
  if (/\b(action required|immediate|deadline|must file|cease)\b/.test(text)) return "action";
  if (/\b(cost|surcharge|pass[- ]?through|price|margin)\b/.test(text)) return "cost";
  if (r.added) {
    const age = Date.now() - new Date(r.added).getTime();
    if (age >= 0 && age < 14 * 24 * 60 * 60 * 1000) return "monitor";
  }
  return "background";
}

// ── Date formatting ───────────────────────────────────────────────────────


// ── Source-tier vocabulary (local copy matching RegulationDetailSurface) ──

// Q-1 fix (2026-07-11): labels come from the ONE tier vocabulary (src/lib/tier-labels.ts);
// only the color ramp stays local. The prior private copy carried a fourth vocabulary.
const TIER_DEFINITIONS: Array<{ tier: number; label: string; color: string }> = [
  { tier: 1, label: TIER_LABELS[1], color: "var(--color-critical)" },
  { tier: 2, label: TIER_LABELS[2], color: "var(--color-high)" },
  { tier: 3, label: TIER_LABELS[3], color: "var(--color-accent, var(--color-primary))" },
  { tier: 4, label: TIER_LABELS[4], color: "var(--color-text-primary)" },
  { tier: 5, label: TIER_LABELS[5], color: "var(--color-text-secondary)" },
];

function SourceTierBadge({ tier }: { tier: number }) {
  const def = TIER_DEFINITIONS.find((t) => t.tier === tier);
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 10,
        fontWeight: 800,
        padding: "2px 7px",
        borderRadius: 3,
        letterSpacing: "0.08em",
        color: def?.color || "var(--color-text-secondary)",
        border: `1px solid ${def?.color || "var(--color-border)"}`,
      }}
      title={def ? `Tier ${tier}, ${def.label}` : `Tier ${tier}`}
    >
      T{tier}
    </span>
  );
}

function SourceTierLegend() {
  return (
    <div
      style={{
        marginTop: 18,
        padding: "12px 14px",
        background: "var(--color-bg-raised, var(--color-bg))",
        border: "1px solid var(--color-border-subtle, var(--color-border))",
        borderRadius: "var(--radius-md, 6px)",
        fontSize: 11.5,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--color-text-muted)",
          marginBottom: 8,
        }}
      >
        Source tier
      </div>
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
        {TIER_DEFINITIONS.map((t) => (
          <li key={t.tier} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <SourceTierBadge tier={t.tier} />
            <span style={{ color: "var(--color-text-primary)" }}>{t.label}</span>
          </li>
        ))}
        <li style={{ color: "var(--color-text-muted)", fontStyle: "italic", marginTop: 4 }}>
          T6 (commercial intelligence) and T7 (news & commentary) are admin-reviewed and rarely surface here.
        </li>
      </ul>
    </div>
  );
}

// ── Sub-primitives (Stat / KV / SideCard / BriefSection) ─────────────────

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border-subtle, var(--color-border))",
        borderRadius: "var(--radius-md)",
        padding: "14px 16px",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 800,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--color-text-muted)",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 28,
          lineHeight: 1,
          color: "var(--color-text-primary)",
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 6, lineHeight: 1.4 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function BriefSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="cl-card"
      style={{ padding: "22px 26px", marginBottom: 14 }}
    >
      <h3
        data-guard-title
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 22,
          fontWeight: 400,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          margin: "0 0 14px",
          paddingBottom: 12,
          borderBottom: "1px solid var(--color-border-subtle, var(--color-border))",
          color: "var(--color-text-primary)",
          overflowWrap: "anywhere",
        }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

function SideCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="cl-card" style={{ padding: "14px 16px" }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--color-text-muted)",
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "78px 1fr",
          gap: "6px 10px",
          fontSize: 12.5,
          lineHeight: 1.55,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function KV({ k, v }: { k: string; v?: string | null }) {
  if (!v) return null;
  return (
    <>
      <div style={{ color: "var(--color-text-muted)", fontWeight: 600 }}>{k}</div>
      <div style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>{v}</div>
    </>
  );
}

function SeverityPill({ severity }: { severity: Severity }) {
  const tone = SEVERITY_TONE[severity];
  return (
    <span
      style={{
        alignSelf: "flex-start",
        fontSize: 10,
        fontWeight: 800,
        padding: "3px 9px",
        borderRadius: 3,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: tone.fg,
        background: tone.bg,
        border: `1px solid ${tone.bd}`,
      }}
    >
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

function RegionPill({ jurisdiction }: { jurisdiction: string }) {
  return (
    <span
      style={{
        alignSelf: "flex-start",
        fontSize: 10,
        fontWeight: 800,
        padding: "3px 9px",
        borderRadius: 3,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "var(--color-primary)",
        background: "var(--color-surface)",
        border: "1px solid var(--color-primary)",
      }}
    >
      {jurisdiction}
    </span>
  );
}

// ── Main surface ──────────────────────────────────────────────────────────

export function OperationsDetailSurface({
  resource: r,
  related,
  relatedReason,
  sections = [],
  matrixEligibility,
  sourceFetchStatus,
  supersessions = [],
  connections = [],
  relevance = null,
  resourceLookup = {},
  initialWatched,
  initialTeamWatched,
  initialTeamAvailable,
}: Props) {
  const severity = useMemo(() => deriveSeverity(r), [r]);
  const [briefMode, setBriefMode] = useState<"short" | "full">("short");

  const hasSections = sections.length > 0;

  // shortText feeds the top summary card (rendered regardless of sections) AND the no-sections fallback
  // body. ORDER CHANGED 2026-08-12 (operator directive: the description leads every item on every
  // surface, as it already did on Regulations). what_is_it first. The chain still falls through to
  // summary and why_matters, so no item can lose its card: measured on the live corpus that day, 16 of
  // 42 Operations items show different leading text, 26 unchanged, 0 lose the card.
  const shortText = r.whatIsIt || r.note || r.whyMatters || "";
  const fullText = r.fullBrief || shortText;
  const hasFull = !!r.fullBrief && r.fullBrief.length > shortText.length;

  const tier = r.sourceTier;
  const sourceName = r.sourceName || null;
  const sourceUrl = r.url || r.sourceUrl || null;
  // item 5b: never render a live link to a source the pipeline flagged unreadable (Cloudflare/CDN block,
  // soft-404, etc.). null status (incl. pre-migration-147) → sourceUnreadable=false → renders as today.
  const sourceUnreadable =
    sourceFetchStatus != null &&
    ["cdn_block", "soft_404", "blocked", "error"].includes(sourceFetchStatus);
  const jurisdiction = r.jurisdiction || null;

  return (
    // Lane MOBILE-2, 2026-09-03 sweep: `px-9` (36px, Tailwind) had no responsive step-down, unlike
    // the cl-page-pad convention (16px at <=767px) — the same shape item 1's detail-header padding
    // fix addresses on Regulations. `px-[var(--cl-detail-pad-x)]` (globals.css) shares that one
    // breakpoint via Tailwind's arbitrary-value syntax instead of a second hardcoded media query.
    <div className="px-[var(--cl-detail-pad-x)] pt-8 pb-16 max-w-[1280px] mx-auto" data-guard-container="operations-detail">
      {/* Hero card */}
      <div
        className="cl-card"
        style={{
          borderLeft: "5px solid var(--color-primary)",
          padding: "22px 26px 20px",
          marginBottom: 16,
        }}
      >
        {/* Pill strip */}
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 12,
            alignItems: "center",
          }}
        >
          <SeverityPill severity={severity} />
          {jurisdiction && <RegionPill jurisdiction={jurisdiction} />}
          {r.type && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                padding: "3px 9px",
                borderRadius: 3,
                background: "var(--color-bg-raised)",
                color: "var(--color-text-primary)",
                border: "1px solid var(--color-border)",
              }}
            >
              {r.type.replace(/_/g, " ")}
            </span>
          )}
          {r.added && (
            <span
              style={{
                marginLeft: "auto",
                fontSize: 11,
                color: "var(--color-text-muted)",
                fontWeight: 600,
              }}
            >
              Published {formatDate(r.added)}
            </span>
          )}
          {/* Landing B (2026-08-01): watchlist reaches the Operations surface
              (migration 233 expanded the item_type CHECK). */}
          <span style={r.added ? undefined : { marginLeft: "auto" }}>
            <WatchButton
              itemType="operations"
              itemId={String(r.id)}
              initialWatched={initialWatched}
              initialTeamWatched={initialTeamWatched}
              initialTeamAvailable={initialTeamAvailable}
            />
          </span>
        </div>

        {/* Deck */}
        {shortText && (
          <p
            style={{
              fontSize: 14.5,
              lineHeight: 1.6,
              color: "var(--color-text-secondary)",
              margin: 0,
              marginBottom: 14,
              maxWidth: "78ch",
            }}
          >
            {shortText}
          </p>
        )}

        {/* Source attribution */}
        {(sourceName || sourceUrl) && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              alignItems: "center",
              fontSize: 12.5,
              color: "var(--color-text-secondary)",
              paddingTop: 12,
              borderTop: "1px solid var(--color-border-subtle, var(--color-border))",
            }}
          >
            <span style={{ fontWeight: 700, color: "var(--color-text-primary)" }}>
              Source
            </span>
            {sourceUrl && !sourceUnreadable ? (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                // Law-2 floor: a plain text link with no padding — surfaced for the first time by
                // this lane's own detail-surfaces-smoke.mjs. minHeight + inline-flex/center reaches
                // the 24px+8px-clearance alternative without changing the visible link.
                style={{ color: "var(--color-primary)", fontWeight: 600, display: "inline-flex", alignItems: "center", minHeight: 24 }}
              >
                {sourceName || sourceUrl}
              </a>
            ) : (
              <span style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>
                {sourceName || sourceUrl}
                {sourceUnreadable && (
                  <span
                    style={{
                      marginLeft: 6,
                      fontWeight: 500,
                      fontStyle: "italic",
                      color: "var(--color-text-muted, var(--muted))",
                    }}
                  >
                    (source currently unreachable)
                  </span>
                )}
              </span>
            )}
            {typeof tier === "number" && <SourceTierBadge tier={tier} />}
          </div>
        )}
      </div>

      {/* Stat strip */}
      {r.added && (
        <div
          className="cl-detail-stat-strip"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 10,
            marginBottom: 18,
          }}
        >
          <style>{`
            @media (max-width: 720px) { .cl-detail-stat-strip { grid-template-columns: 1fr !important; } }
          `}</style>
          <Stat
            label="Published"
            value={formatDate(r.added)}
            sub={sourceName || undefined}
          />
          {jurisdiction && (
            <Stat label="Region" value={jurisdiction} sub="Operations scope" />
          )}
        </div>
      )}

      {/* Layout: main + right rail */}
      <div
        className="cl-detail-layout"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 320px",
          gap: 24,
          alignItems: "start",
        }}
      >
        <style>{`
          @media (max-width: 1100px) { .cl-detail-layout { grid-template-columns: 1fr !important; } }
        `}</style>

        <div>
          {/* Section-aware content: 8 Operations sections from the
              canonical pipeline. Renders when sections are available.
              S3/S4 gated by matrixEligibility — honest omit-note when
              the matrix threshold is not met. */}
          {hasSections ? (
            <OperationsSections
              rows={sections}
              matrixEligibility={matrixEligibility}
            />
          ) : (
            <>
              {/* Legacy fallback: short/full brief toggle. Renders only
                  when no sections are available yet. */}
              {shortText ? (
                <BriefSection title="Summary">
                  {hasFull && (
                    <div
                      style={{
                        display: "flex",
                        gap: 0,
                        marginBottom: 14,
                        borderBottom: "1px solid var(--color-border-subtle, var(--color-border))",
                      }}
                    >
                      {(["short", "full"] as const).map((m) => {
                        const active = briefMode === m;
                        return (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setBriefMode(m)}
                            style={{
                              padding: "8px 14px",
                              fontSize: 12,
                              fontWeight: 700,
                              textTransform: "uppercase",
                              letterSpacing: "0.08em",
                              color: active
                                ? "var(--color-primary)"
                                : "var(--color-text-secondary)",
                              borderBottom: `2px solid ${
                                active ? "var(--color-primary)" : "transparent"
                              }`,
                              cursor: "pointer",
                              background: "transparent",
                              border: 0,
                              borderBottomWidth: 2,
                              borderBottomStyle: "solid",
                              borderBottomColor: active
                                ? "var(--color-primary)"
                                : "transparent",
                              fontFamily: "inherit",
                            }}
                          >
                            {m === "short" ? "Short" : "Full"}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div
                    style={{
                      fontSize: 14,
                      lineHeight: 1.7,
                      color: "var(--color-text-primary)",
                      whiteSpace: briefMode === "full" ? "pre-wrap" : "normal",
                    }}
                  >
                    {briefMode === "full" ? fullText : shortText}
                  </div>
                </BriefSection>
              ) : (
                /* Honest empty: sections not yet generated. */
                <div
                  style={{
                    marginBottom: 14,
                    padding: "12px 16px",
                    background: "var(--color-surface-raised, var(--color-bg-raised))",
                    border: "1px solid var(--color-border-subtle, var(--color-border))",
                    borderLeft: "3px solid var(--color-text-muted)",
                    borderRadius: "var(--radius-sm, 4px)",
                    fontSize: 13,
                    lineHeight: 1.55,
                    color: "var(--color-text-muted)",
                  }}
                >
                  Detailed sections pending for this Operations item; brief generation
                  in progress.
                </div>
              )}
            </>
          )}

          {/* Sources */}
          <BriefSection title="Sources">
            {sourceUrl || sourceName ? (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.75 }}>
                <li>
                  {sourceUrl ? (
                    <a
                      href={sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      // Law-2 floor: same fix as the hero source-attribution link above — surfaced
                      // for the first time by this lane's own detail-surfaces-smoke.mjs.
                      style={{ color: "var(--color-primary)", display: "inline-flex", alignItems: "center", minHeight: 24 }}
                    >
                      {sourceName || sourceUrl}
                    </a>
                  ) : (
                    <span style={{ color: "var(--color-text-primary)" }}>{sourceName}</span>
                  )}
                  {typeof tier === "number" && (
                    <span style={{ marginLeft: 8 }}>
                      <SourceTierBadge tier={tier} />
                    </span>
                  )}
                </li>
              </ul>
            ) : (
              <p style={{ fontSize: 14, color: "var(--color-text-muted)", margin: 0 }}>
                Primary source not yet linked.
              </p>
            )}
            <SourceTierLegend />
          </BriefSection>

          {/* Related items */}
          <BriefSection title="Related items">
            {related.length === 0 ? (
              <p
                style={{
                  fontSize: 14,
                  color: "var(--color-text-muted)",
                  margin: 0,
                  lineHeight: 1.6,
                }}
              >
                No related items yet. As regional coverage grows, items from the
                same jurisdiction or source will surface here.
              </p>
            ) : (
              <>
                <p
                  style={{
                    fontSize: 11.5,
                    color: "var(--color-text-muted)",
                    margin: "0 0 12px",
                    fontStyle: "italic",
                  }}
                >
                  {relatedReason === "jurisdiction"
                    ? `Other Operations items covering the same region${jurisdiction ? ` (${jurisdiction})` : ""}.`
                    : "Other items from the same source."}
                </p>
                <ul
                  style={{
                    listStyle: "none",
                    margin: 0,
                    padding: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                  }}
                >
                  {related.map((it) => (
                    <li
                      key={it.id}
                      style={{
                        paddingBottom: 12,
                        borderBottom:
                          "1px solid var(--color-border-subtle, var(--color-border))",
                      }}
                    >
                      <Link
                        href={`/operations/${encodeURIComponent(it.id)}`}
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: "var(--color-text-primary)",
                          textDecoration: "none",
                        }}
                      >
                        {it.title}
                      </Link>
                      {it.summary && (
                        <p
                          style={{
                            fontSize: 13,
                            lineHeight: 1.5,
                            color: "var(--color-text-secondary)",
                            margin: "4px 0 0",
                          }}
                        >
                          {it.summary.length > 220
                            ? `${it.summary.slice(0, 217)}…`
                            : it.summary}
                        </p>
                      )}
                      <div
                        style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 4 }}
                      >
                        {it.sourceName ? (
                          <b style={{ fontWeight: 600 }}>{it.sourceName}</b>
                        ) : null}
                        {it.sourceName && it.addedDate ? " · " : null}
                        {it.addedDate ? formatDate(it.addedDate) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </BriefSection>
        </div>

        {/* Right rail */}
        <aside style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <RelevanceBadgeClient itemId={r.id} />
          <SideCard label="Identification">
            <KV k="ID" v={r.id} />
            <KV k="Type" v={r.type} />
            <KV k="Severity" v={SEVERITY_LABEL[severity]} />
            {r.added && <KV k="Published" v={formatDate(r.added)} />}
          </SideCard>
          <SideCard label="Coverage">
            {jurisdiction && <KV k="Region" v={jurisdiction} />}
            {r.modes && r.modes.length > 0 && (
              <KV k="Modes" v={r.modes.map((m) => m.toUpperCase()).join(", ")} />
            )}
            {r.topic && <KV k="Topic" v={r.topic} />}
          </SideCard>
          {/* Matrix coverage status in right rail */}
          {matrixEligibility && (
            <div
              className="cl-card"
              style={{ padding: "14px 16px" }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--color-text-muted)",
                  marginBottom: 8,
                }}
              >
                Comparison coverage
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.55, color: "var(--color-text-secondary)" }}>
                {matrixEligibility.s3Eligible ? (
                  <span style={{ color: "var(--color-primary)", fontWeight: 700 }}>
                    Comparison sections available
                  </span>
                ) : (
                  <span style={{ color: "var(--color-text-muted)", fontStyle: "italic" }}>
                    Comparison building
                    {matrixEligibility.resolvedRegionCodes.length > 0
                      ? ` (${matrixEligibility.resolvedRegionCodes.join(", ")})`
                      : ""}
                  </span>
                )}
              </div>
            </div>
          )}
          {(sourceName || sourceUrl) && (
            <SideCard label="Source">
              {sourceName && <KV k="Name" v={sourceName} />}
              {typeof tier === "number" && <KV k="Tier" v={`T${tier}`} />}
            </SideCard>
          )}
          <ItemConnectionsCard
            connections={connections}
            supersessions={supersessions}
            selfId={r.id}
            resourceLookup={resourceLookup}
          />
        </aside>
      </div>
    </div>
  );
}
