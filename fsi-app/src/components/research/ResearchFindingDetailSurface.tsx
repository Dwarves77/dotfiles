"use client";

/**
 * ResearchFindingDetailSurface — client subcomponent for /research/[slug].
 *
 * Detail view for a single Research finding. Layout mirrors
 * RegulationDetailSurface for design coherence across the platform
 * (`EditorialMasthead`-style typography, `cl-card` surfaces, identical
 * Stat / KV / SideCard primitives), but the section content reflects
 * the Research domain rather than the regulation domain.
 *
 * Sprint 4 / author-dispatch: now SECTION-AWARE. When `sections` are
 * supplied (intelligence_item_sections rows from the canonical pipeline),
 * the main content panel renders the 6 Research Summary sections via
 * <ResearchSections> (analogous to <RegulationSections> on the
 * regulations detail page), replacing the raw full_brief markdown view.
 *
 * The prior raw-markdown fallback (short ↔ full toggle) is preserved and
 * renders ONLY when sections is empty — honest empty state over silent gap.
 *
 * Layout:
 *   - Hero card (deck, source attribution, severity pill, theme pill, date)
 *   - Stat strip (Published + Citations)
 *   - Main panel: ResearchSections (when present) OR short-summary + full-
 *     brief toggle (legacy fallback)
 *   - Sources panel (primary source + tier legend)
 *   - Related findings panel (same theme, else same source)
 *   - Right rail: theme-brief card (WO-25, flywheel U6 surfacing) — a
 *     read-only render of an already-synthesized `theme_briefs` row for
 *     the graph-derived `connection_themes` cluster this item belongs to,
 *     when one exists. This is CLUSTER-level synthesis across many items
 *     (up to 68 on the live corpus), not analysis of this finding alone —
 *     kept visually distinct from the main-column content for exactly that
 *     reason (see the card's own "Cluster synthesis" label). A mismatch
 *     between the brief's stored member_hash and the theme's live
 *     member_ids renders a STALE badge; staleness is never silent
 *     (migration 266). No LLM call, no generation, ever, from this
 *     component — it renders rows a prior operator-directed pass produced.
 *
 * Severity + theme vocabularies match ResearchView.tsx exactly.
 */

import { useMemo, useState } from "react";
import { formatDate } from "@/lib/format";
import Link from "next/link";
import type { Resource, ItemConnection, Supersession } from "@/types/resource";
import type { IntelligenceItemSectionRow } from "@/lib/supabase-server";
import type { ItemRelevance } from "@/lib/workspace/profile";
import { GfmSection } from "@/components/shared/GfmSection";
import { TIER_LABELS } from "@/lib/tier-labels";
import { WatchButton } from "@/components/ui/WatchButton";
import { ItemConnectionsCard } from "@/components/shell/ItemConnectionsCard";
import { RelevanceBadgeClient } from "@/components/shell/RelevanceBadgeClient";
import { RecordGradeBadge } from "@/components/shell/RecordGradeBadge";
import {
  parseRecordSections,
  splitKeyDateFacts,
  type RecordFactRow,
  type ClaimTierMap,
} from "@/lib/agent/parse-record-sections";
import type { selectThemeBriefForItem } from "@/lib/research/theme-brief.mjs";
import {
  THEME_KEYS,
  THEME_LABELS,
  SEVERITY_KEYS,
  SEVERITY_LABELS,
  assignTheme as classifyTheme,
  deriveSeverity as classifySeverity,
} from "@/lib/research/taxonomy.mjs";

interface RelatedFinding {
  id: string;
  title: string;
  summary: string | null;
  sourceName: string | null;
  addedDate: string | null;
}

/** WO-25 — the theme-brief view-model, as returned by selectThemeBriefForItem. null = honest
 *  omission (item is in no live cluster, or its cluster has no brief yet). */
type ThemeBriefView = ReturnType<typeof selectThemeBriefForItem>;

interface Props {
  resource: Resource;
  // Related findings supplied by the page; selection logic (same theme,
  // else same source) lives in the server component so this surface
  // stays a plain renderer.
  related: RelatedFinding[];
  relatedReason: "theme" | "source" | "none";
  /**
   * Sprint 4: parsed Research Summary sections from intelligence_item_sections.
   * When non-empty, renders the 6 structured section cards (section-aware mode).
   * Empty array falls back to the raw full_brief markdown toggle (legacy).
   */
  sections?: IntelligenceItemSectionRow[];
  /** TIER-CHIP lane (2026-09-04): a record-grade item's FACT claims' ratings, keyed by exact claim line
   *  — see parse-record-sections.ts's TIER-CHIP header for the match rule. Read server-side, one query
   *  (the page's loadItemScoped); consumed only by ResearchRecordFacts (record-grade findings). */
  claimTiers?: ClaimTierMap;
  /** Flywheel U9 (D1) — item_cross_references connections + any supersessions involving this item, the
   *  viewer's relevance-to-your-operation lens, and the gated title lookup for both. */
  supersessions?: Supersession[];
  connections?: ItemConnection[];
  relevance?: ItemRelevance | null;
  resourceLookup?: Record<string, { id: string; title: string; priority: string }>;
  /** WO-25 — the graph-derived cluster brief covering this item, if any. null renders no card
   *  (item is in no live `connection_themes` cluster, or that cluster has no `theme_briefs` row
   *  yet) — honest omission, matching this surface's other "no X on file" empty states. Never
   *  fetched or generated client-side; always supplied by the server component. */
  themeBrief?: ThemeBriefView;
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

// ── Research section-aware renderer (analogous to RegulationSections) ──
//
// Renders the 6 Research Summary sections from intelligence_item_sections rows.
// Section keys "1"–"6" map to the canonical Research Summary headings per
// analysis-construction-spec SKILL.md §7 and system-prompt.ts lines 213-220.
// Each section is a SectionCard with a prose body (GfmSection-style inline
// markdown). The Sources section (key "6") is rendered as a plain source list.
//
// Integrity-preserving: rows with empty content_md produce no card. The block
// returns null when no known-key rows exist, so the parent can fall through to
// the legacy brief toggle.

const RESEARCH_SECTION_HEADINGS: Record<string, string> = {
  "1": "What the Research Found",
  "2": "Why This Finding Matters Operationally and Commercially",
  "3": "What the Finding Changes for Strategy, Claims, or Decisions",
  "4": "Client Conversation Talking Points and Public Position",
  "5": "What the Finding Does Not Resolve",
  "6": "Sources",
};

const KNOWN_RESEARCH_KEYS = new Set(["1", "2", "3", "4", "5", "6"]);

function ResearchSections({ rows }: { rows: IntelligenceItemSectionRow[] }) {
  const known = rows.filter(
    (r) => KNOWN_RESEARCH_KEYS.has(r.section_key) && (r.content_md || "").trim()
  );
  if (known.length === 0) return null;

  return (
    <div>
      {known.map((row) => {
        const heading = RESEARCH_SECTION_HEADINGS[row.section_key] || `Section ${row.section_key}`;
        return (
          <ResearchSectionCard
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

// ── RECORD-GRADE facts (RECORD-SURFACE lane, 2026-09-04) ────────────────
// Same parser + rendering shape as RegulationDetailSurface.tsx's RecordGradeSummary / the Market
// surface's RecordFactsCard (see RegulationDetailSurface.tsx's own header for the full rationale).
// Connected items are already rendered unconditionally below (this file's own <ItemConnectionsCard>
// call) so this block does not duplicate them — only the facts/dates/tags a record-grade research
// finding's `sections` actually carry, which ResearchSections' numbered-key parser cannot reach.
// TIER-CHIP lane (2026-09-04): fact.tier is this FACT claim's own rating (see parse-record-sections.ts's
// TIER-CHIP header) rendered with the SAME <SourceTierBadge> the Sources panel below already uses (same
// component, same TIER_LABELS vocabulary — never a second one) plus, when the map resolved one, a linked
// source name. `fact.tier === null` shows an honest dashed "—" — never omitted silently, never guessed.
function ResearchRecordFactLine({ fact }: { fact: RecordFactRow }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>
          {fact.label}
        </span>
        {fact.kind === "FACT" &&
          (typeof fact.tier === "number" ? (
            <SourceTierBadge tier={fact.tier} />
          ) : (
            <span
              aria-hidden
              title="No source rating on file for this claim"
              style={{ fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 3, border: "1px dashed var(--color-border)", color: "var(--color-text-muted)" }}
            >
              —
            </span>
          ))}
      </div>
      {fact.span ? (
        <p style={{ fontSize: 14, lineHeight: 1.65, margin: 0, color: "var(--color-text-primary)", borderLeft: "2px solid var(--color-border)", paddingLeft: 10, overflowWrap: "anywhere" }}>
          “{fact.span}”
        </p>
      ) : (
        <p style={{ fontSize: 14, lineHeight: 1.65, margin: 0, color: "var(--color-text-secondary)", overflowWrap: "anywhere" }}>{fact.text}</p>
      )}
      {fact.kind === "FACT" && fact.sourceName && (
        <p style={{ fontSize: 11, margin: "4px 0 0", color: "var(--color-text-muted)" }}>
          {fact.sourceUrl ? (
            // Law-2 floor (24px + 8px-clearance alternative): minHeight + inline-flex/center reaches the
            // floor without changing the visible link's font size or padding.
            <a
              href={fact.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--color-primary)", fontWeight: 700, textDecoration: "none", display: "inline-flex", alignItems: "center", minHeight: 24 }}
            >
              {fact.sourceName}
            </a>
          ) : (
            fact.sourceName
          )}
        </p>
      )}
    </div>
  );
}

function ResearchRecordFacts({ sections, tags, claimTiers }: { sections: IntelligenceItemSectionRow[]; tags: string[]; claimTiers?: ClaimTierMap }) {
  const parsed = useMemo(() => parseRecordSections(sections, claimTiers), [sections, claimTiers]);
  const { dateFacts, otherFacts } = useMemo(
    () => (parsed ? splitKeyDateFacts(parsed.facts) : { dateFacts: [] as RecordFactRow[], otherFacts: [] as RecordFactRow[] }),
    [parsed]
  );

  return (
    <>
      <div
        className="cl-card"
        style={{ borderLeft: "3px solid var(--color-text-muted)", padding: "16px 20px", marginBottom: 14 }}
      >
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.13em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>
          Catalogue record
        </span>
        <p style={{ fontSize: 13.5, lineHeight: 1.7, margin: "8px 0 0", maxWidth: "78ch", color: "var(--color-text-secondary)" }}>
          This finding was captured directly from its source document rather than synthesized into a
          research summary. Every fact below is quoted verbatim from that source — a full summary is a
          separate, later upgrade for this item.
        </p>
      </div>

      {dateFacts.length > 0 && (
        <BriefSection title="Key dates">
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {dateFacts.map((f) => <ResearchRecordFactLine key={f.slotKey} fact={f} />)}
          </div>
        </BriefSection>
      )}

      <BriefSection title="Verbatim facts">
        {parsed && parsed.slotFieldCount > 0 && (
          <p style={{ fontSize: 11.5, fontWeight: 700, color: "var(--color-text-muted)", margin: "-6px 0 14px" }}>
            {parsed.gaps.length} of {parsed.slotFieldCount} record fields not stated by the source
          </p>
        )}
        {otherFacts.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {otherFacts.map((f) => <ResearchRecordFactLine key={f.slotKey} fact={f} />)}
          </div>
        ) : (
          <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--color-text-muted)", margin: 0, fontStyle: "italic" }}>
            {parsed
              ? "The captured source did not state any of this finding's required record fields in a form this extractor could quote verbatim."
              : "No extracted-facts sections are on file for this catalogue record yet."}
          </p>
        )}
      </BriefSection>

      <BriefSection title="Tags">
        {tags && tags.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {tags.map((t) => (
              <span
                key={t}
                style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999, background: "var(--color-bg-raised)", border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}
              >
                {t}
              </span>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--color-text-muted)", margin: 0, fontStyle: "italic" }}>
            No tags on file for this item yet.
          </p>
        )}
      </BriefSection>
    </>
  );
}

function ResearchSectionCard({
  sectionKey,
  heading,
  contentMd,
}: {
  sectionKey: string;
  heading: string;
  contentMd: string;
}) {
  return (
    <section
      id={`research-section-${sectionKey}`}
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md, 6px)",
        marginBottom: 14,
        boxShadow: "var(--shadow-card)",
        overflow: "hidden",
      }}
    >
      {/* Section header — numbered badge + heading label */}
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
      {/* Section body — shared generic prose renderer (reused, not re-implemented). */}
      <div style={{ padding: "18px 22px 22px" }}>
        <GfmSection markdown={contentMd} />
      </div>
    </section>
  );
}

// ── Severity vocabulary. Classification rules (keywords, DB-column short-circuit, the label
//    text itself) live in ONE home: src/lib/research/taxonomy.mjs, shared with ResearchLedger.tsx
//    (extracted from what was previously two independently-drifted copies — see that module's
//    header for the full comparison). SEVERITY_TONE (color-only) has no equivalent there and
//    stays local: it is this surface's own presentation, not a classification rule. ──

type Severity = (typeof SEVERITY_KEYS)[number];

const SEVERITY_LABEL: Record<Severity, string> = SEVERITY_LABELS;

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

// ── Theme vocabulary. Classification rules (keywords, theme-column mapping, label text) live in
//    ONE home: src/lib/research/taxonomy.mjs, shared with ResearchLedger.tsx. This surface's own
//    header comment used to say "mirrors ResearchView.tsx" — a filename that no longer exists in
//    this repo; that comment was itself the evidence, during extraction, that this copy had gone
//    stale relative to ResearchLedger.tsx. See taxonomy.mjs's header for the full drift
//    comparison and the (disclosed, evidence-based) resolution. ──

type ThemeKey = (typeof THEME_KEYS)[number];

const THEME_LABEL: Record<ThemeKey, string> = THEME_LABELS;

function assignTheme(r: Resource): ThemeKey | null {
  const text = `${r.title} ${r.note || ""} ${r.whyMatters || ""}`;
  return classifyTheme(text, r.theme) as ThemeKey | null;
}

function deriveSeverity(r: Resource): Severity {
  const text = `${r.title} ${r.note || ""}`;
  return classifySeverity(text, r.added, r.severity) as Severity;
}

// ── Date formatting ──


// ── Source-tier vocabulary (local copy of RegulationDetailSurface's
//    private TIER_DEFINITIONS / SourceTierBadge / SourceTierLegend, per
//    dispatch rule "create a local one matching the design" — the
//    regulations file does not export them) ──

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
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
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

// ── Subcomponents (Stat / KV / SideCard / BriefSection) — local copies
//    matching RegulationDetailSurface's private primitives so the surface
//    can be a leaf module without reaching into another component's
//    internals ──

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
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
        <div
          style={{
            fontSize: 11,
            color: "var(--color-text-secondary)",
            marginTop: 6,
            lineHeight: 1.4,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

function BriefSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="cl-card"
      style={{
        padding: "22px 26px",
        marginBottom: 14,
      }}
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

function SideCard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="cl-card"
      style={{
        padding: "14px 16px",
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

function ThemePill({ themeKey }: { themeKey: ThemeKey }) {
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
      {THEME_LABEL[themeKey]}
    </span>
  );
}

// ── Theme-brief card (WO-25, flywheel U6 surfacing) ──
//
// Right-rail card, matching ItemConnectionsCard's visual weight (spec §2.7 open ruling 1,
// recommended placement) rather than a main-column block — brief_md is synthesis ACROSS a
// cluster (up to 68 members on the live corpus), not analysis of this item alone, and giving it
// main-column weight risks a reader mistaking cluster-level prose for item-specific content, the
// same confusion the numbered ResearchSectionCards exist to avoid for item-level text. Renders
// nothing when `brief` is null/undefined — the parent decides that (honest omission), this
// component only draws what it is handed. Never fetches, never calls an LLM: brief_md is a
// pre-generated string, prop-drilled from the server component.
function ThemeBriefCard({ brief }: { brief: ThemeBriefView }) {
  if (!brief) return null;
  return (
    <div className="cl-card" style={{ padding: "14px 16px" }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--color-text-muted)",
          marginBottom: 4,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span>Cluster synthesis</span>
        {brief.stale && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: "0.08em",
              padding: "2px 6px",
              borderRadius: 3,
              color: "var(--color-high, var(--color-text-primary))",
              background: "var(--color-high-bg, var(--color-surface))",
              border: "1px solid var(--color-high-border, var(--color-border))",
            }}
            title="This theme's membership has changed since the brief below was generated — content may no longer reflect the live cluster."
          >
            STALE
          </span>
        )}
      </div>
      <div
        style={{
          fontSize: 10.5,
          color: "var(--color-text-muted)",
          fontStyle: "italic",
          marginBottom: 10,
          lineHeight: 1.4,
        }}
      >
        Synthesis across {brief.memberCount} items in this finding&apos;s connection-graph
        cluster — not analysis of this finding alone.
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: "var(--color-text-primary)",
          marginBottom: 8,
        }}
      >
        {brief.title}
      </div>
      {brief.stale && (
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--color-high, var(--color-text-primary))",
            background: "var(--color-high-bg, var(--color-surface))",
            border: "1px solid var(--color-high-border, var(--color-border))",
            borderRadius: 3,
            padding: "6px 8px",
            marginBottom: 10,
          }}
        >
          STALE — the cluster&apos;s membership changed since this brief was generated.
        </div>
      )}
      <div
        style={{
          fontSize: 12.5,
          lineHeight: 1.55,
          maxHeight: 260,
          overflowY: "auto",
        }}
      >
        <GfmSection markdown={brief.briefMd} />
      </div>
    </div>
  );
}

// ── Main surface ──

export function ResearchFindingDetailSurface({
  resource: r,
  related,
  relatedReason,
  sections = [],
  claimTiers,
  supersessions = [],
  connections = [],
  relevance = null,
  resourceLookup = {},
  themeBrief = null,
  initialWatched,
  initialTeamWatched,
  initialTeamAvailable,
}: Props) {
  const severity = useMemo(() => deriveSeverity(r), [r]);
  const themeKey = useMemo(() => assignTheme(r), [r]);
  const [briefMode, setBriefMode] = useState<"short" | "full">("short");

  // Section-aware mode: sections from intelligence_item_sections take
  // precedence over raw full_brief when non-empty. The section rows are
  // already ordered by section_order from the server fetch.
  const hasSections = sections.length > 0;

  // shortText feeds TWO places: the top summary card (rendered regardless of sections) and the
  // no-sections fallback body below. The previous comment said "used when hasSections is false", which
  // was true of fullText and never of shortText, and it is corrected here because it misread as dead code.
  //
  // ORDER CHANGED 2026-08-12 (operator directive: the description leads every item on every surface, as
  // it already did on Regulations). what_is_it now comes FIRST. This can only change WHICH text shows
  // when more than one field is populated; it can never remove a card, because the chain still falls
  // through to summary and why_matters. Measured on the live corpus the day of the change: 18 of 49
  // Research items display different leading text, 31 are unchanged, 0 lose their card.
  const shortText = r.whatIsIt || r.note || r.whyMatters || "";
  const fullText = r.fullBrief || shortText;
  const hasFull = !!r.fullBrief && r.fullBrief.length > shortText.length;

  const tier = r.sourceTier;
  const sourceName = r.sourceName || null;
  const sourceUrl = r.url || r.sourceUrl || null;

  return (
    // Lane MOBILE-2, 2026-09-03 sweep: `px-9` (36px, Tailwind) had no responsive step-down, unlike
    // the cl-page-pad convention (16px at <=767px) — the same shape item 1's detail-header padding
    // fix addresses on Regulations. `px-[var(--cl-detail-pad-x)]` (globals.css) shares that one
    // breakpoint via Tailwind's arbitrary-value syntax instead of a second hardcoded media query.
    <div className="px-[var(--cl-detail-pad-x)] pt-8 pb-16 max-w-[1280px] mx-auto" data-guard-container="research-detail">
      {/* Hero card */}
      <div
        className="cl-card"
        style={{
          borderLeft: `5px solid var(--color-primary)`,
          padding: "22px 26px 20px",
          marginBottom: 16,
        }}
      >
        {/* Pill strip — severity + theme + type */}
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
          {themeKey && <ThemePill themeKey={themeKey} />}
          <RecordGradeBadge itemGrade={r.itemGrade} />
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
          {/* Landing B (2026-08-01): watchlist reaches the Research surface
              (migration 233 expanded the item_type CHECK). */}
          <span style={r.added ? undefined : { marginLeft: "auto" }}>
            <WatchButton
              itemType="research"
              itemId={String(r.id)}
              initialWatched={initialWatched}
              initialTeamWatched={initialTeamWatched}
              initialTeamAvailable={initialTeamAvailable}
            />
          </span>
        </div>

        {/* Deck (the short summary) */}
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
            {sourceUrl ? (
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
                {sourceName}
              </span>
            )}
            {typeof tier === "number" && <SourceTierBadge tier={tier} />}
            {r.citationCount != null && r.citationCount > 0 && (
              <span style={{ color: "var(--color-text-muted)" }}>
                cited {r.citationCount}&times;
              </span>
            )}
          </div>
        )}
      </div>

      {/* Stat strip — Published + (optional) Citations */}
      {(r.added || (r.citationCount && r.citationCount > 0)) && (
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
          {r.added && (
            <Stat label="Published" value={formatDate(r.added)} sub={sourceName || undefined} />
          )}
          {r.citationCount != null && r.citationCount > 0 && (
            <Stat
              label="Citations"
              value={String(r.citationCount)}
              sub={r.lastCitedAt ? `Last cited ${formatDate(r.lastCitedAt)}` : undefined}
            />
          )}
        </div>
      )}

      {/* Layout: main + right rail (matches /regulations grid) */}
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
          {/* Section-aware content: 6 Research Summary sections from the
              canonical pipeline. Renders when sections are available (Sprint 4).
              Each section is a numbered card (S1–S6) matching the Research
              Summary format per analysis-construction-spec SKILL.md §7. */}
          {r.itemGrade === "record" ? (
            // RECORD-GRADE (RECORD-SURFACE lane, 2026-09-04): a record-grade research_finding's
            // `sections` carry section_key "identity"/"record_facts"/"sources_and_citations"
            // (record-facts.mjs), never the numbered "1".."6" keys ResearchSections' own
            // KNOWN_RESEARCH_KEYS recognises. Because `hasSections` (sections.length > 0) was already
            // true for these rows, this branch used to render <ResearchSections rows={sections} />,
            // which returns null (no known key matches) — the finding's own extracted facts were
            // unreachable, and the legacy shortText/fullText fallback right below never ran either,
            // since it lives in the OTHER half of this same `hasSections` conditional. See
            // parse-record-sections.ts's own header for the mechanism. No live research_finding item
            // routes here today (all 1,273 live record-grade rows carry domain=1 -> /regulations,
            // RECORD-SURFACE lane report) — this is forward cover for when one does.
            <ResearchRecordFacts sections={sections} tags={r.tags} claimTiers={claimTiers} />
          ) : hasSections ? (
            <>
              <ResearchSections rows={sections} />
              {/* Honest empty-state affordance when sections are present but
                  a specific key is missing — the ResearchSections component
                  silently omits absent/empty rows (integrity-preserving). The
                  block-level empty state below fires only when ALL rows are
                  empty, which ResearchSections already handles by returning null. */}
            </>
          ) : (
            <>
              {/* Legacy fallback: short ↔ full brief toggle. Renders only
                  when no sections are available yet (pre-generation items or
                  items that have not been re-processed through the canonical
                  pipeline). Honest empty state when both shortText and fullText
                  are absent. */}
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
                /* Honest empty: sections not yet generated for this item. */
                <div
                  style={{
                    marginBottom: 14,
                    padding: "12px 16px",
                    background:
                      "var(--color-surface-raised, var(--color-bg-raised))",
                    border: "1px solid var(--color-border-subtle, var(--color-border))",
                    borderLeft: "3px solid var(--color-text-muted)",
                    borderRadius: "var(--radius-sm, 4px)",
                    fontSize: 13,
                    lineHeight: 1.55,
                    color: "var(--color-text-muted)",
                  }}
                >
                  Detailed sections pending for this finding; brief generation
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

          {/* Related findings */}
          <BriefSection title="Related findings">
            {related.length === 0 ? (
              <p
                style={{
                  fontSize: 14,
                  color: "var(--color-text-muted)",
                  margin: 0,
                  lineHeight: 1.6,
                }}
              >
                No related findings yet. As the theme + source coverage grows, items sharing this
                finding&apos;s theme or source will surface here.
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
                  {relatedReason === "theme"
                    ? `Other findings in the same theme${themeKey ? ` (${THEME_LABEL[themeKey]})` : ""}.`
                    : "Other findings from the same source."}
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
                        borderBottom: "1px solid var(--color-border-subtle, var(--color-border))",
                      }}
                    >
                      <Link
                        href={`/research/${encodeURIComponent(it.id)}`}
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
                          {it.summary.length > 220 ? `${it.summary.slice(0, 217)}…` : it.summary}
                        </p>
                      )}
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--color-text-muted)",
                          marginTop: 4,
                        }}
                      >
                        {it.sourceName ? <b style={{ fontWeight: 600 }}>{it.sourceName}</b> : null}
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
            {themeKey && <KV k="Theme" v={THEME_LABEL[themeKey]} />}
            <KV k="Severity" v={SEVERITY_LABEL[severity]} />
            {r.added && <KV k="Published" v={formatDate(r.added)} />}
          </SideCard>
          <SideCard label="Coverage">
            {r.jurisdiction && <KV k="Jurisdiction" v={r.jurisdiction} />}
            {r.modes && r.modes.length > 0 && (
              <KV k="Modes" v={r.modes.map((m) => m.toUpperCase()).join(", ")} />
            )}
            {r.topic && <KV k="Topic" v={r.topic} />}
          </SideCard>
          {(sourceName || sourceUrl) && (
            <SideCard label="Source">
              {sourceName && <KV k="Name" v={sourceName} />}
              {typeof tier === "number" && <KV k="Tier" v={`T${tier}`} />}
              {r.citationCount != null && r.citationCount > 0 && (
                <KV k="Cited" v={`${r.citationCount}×`} />
              )}
              {r.lastCitedAt && <KV k="Last cited" v={formatDate(r.lastCitedAt)} />}
            </SideCard>
          )}
          <ItemConnectionsCard
            connections={connections}
            supersessions={supersessions}
            selfId={r.id}
            resourceLookup={resourceLookup}
          />
          {themeBrief && <ThemeBriefCard brief={themeBrief} />}
        </aside>
      </div>
    </div>
  );
}
