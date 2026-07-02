"use client";

/**
 * MarketSignalDetailSurface — client subcomponent for `/market/[slug]`.
 *
 * Adapted from RegulationDetailSurface for the Market Intel signal vocabulary
 * (5-label severity: action / cost / window / edge / monitor; 3 signal bands:
 * price / corporate / corridor). Matches the visual language of the
 * regulations detail (hero card, stat strip, 2-col grid with right rail,
 * `cl-card` primitives, Anton section headings, semantic tokens).
 *
 * Sprint 4 — SECTION-AWARE: when `sections` are supplied (rows from
 * intelligence_item_sections for this item), the main panel renders the 8
 * Market Signal Brief sections via <MarketSections>, using the shared
 * ProseSection primitive (imported from
 * @/components/regulations/sections/ProseSection). The prior Summary panel
 * (short/full toggle) renders ONLY when sections is empty — honest empty
 * state over silent gap.
 *
 * No-Vacuum (S3): when the item's `conversionTrigger` or `crossReferences`
 * callout is populated, a "Linked regulation / trigger" block is shown,
 * mirroring the S3 No-vacuum rule in analysis-construction-spec SKILL.md §6.
 *
 * Corroboration note: if the page passes `convergence` with non-zero
 * `independent_citers`, a small "Corroboration: N independent sources" note
 * is rendered in the hero card. When absent or zero, the note is omitted.
 * The count comes exclusively from sources.independent_citers (the real
 * source-growth convergence engine — aggregateConvergence). No proxy.
 *
 * Band + severity helpers are re-implemented here (MarketPage's helpers
 * are not exported and the dispatch forbids modifying MarketPage). When
 * migration 102 populates the signal_band + severity columns, both surfaces
 * route through the same column reads.
 */

import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { IntelligenceBrief } from "@/components/resource/IntelligenceBrief";
import { AiPromptBar } from "@/components/ui/AiPromptBar";
import { TrajectoryBars } from "@/components/market/TrajectoryBars";
import { ProseSection } from "@/components/regulations/sections/ProseSection";
import { JURISDICTIONS } from "@/lib/constants";
import { isoToDisplayLabel } from "@/lib/jurisdictions/iso";
import type { Resource } from "@/types/resource";
import type { IntelligenceItemSectionRow } from "@/lib/supabase-server";

interface Props {
  resource: Resource;
  /** Workspace-wide Market Intel resource pool used to surface related
   *  signals in the same band. The parent route fetches via
   *  getMarketIntelItems and passes the result here. */
  relatedPool: Resource[];
  /**
   * Sprint 4: parsed Market Signal Brief sections from intelligence_item_sections.
   * When non-empty, renders the 8 structured section cards (section-aware mode).
   * Empty array falls back to the legacy summary panel / brief toggle.
   */
  sections?: IntelligenceItemSectionRow[];
  /**
   * Real source-growth convergence from sources.independent_citers /
   * sources.confirmation_count (aggregateConvergence output, migration 054
   * columns). When provided with independent_citers > 0, a small corroboration
   * note is shown in the hero card. When absent or zero, the note is omitted.
   * NEVER derived from sources_used.length or any proxy.
   */
  convergence?: {
    independent_citers: number;
    confirmation_count: number;
  } | null;
}

// ── Severity vocabulary (5-label, mirrors MarketPage) ─────────────────

type Severity = "action" | "cost" | "window" | "edge" | "monitor";

const SEVERITY_LABEL: Record<Severity, string> = {
  action: "Action required",
  cost: "Cost alert",
  window: "Window closing",
  edge: "Competitive edge",
  monitor: "Monitoring",
};

const SEVERITY_PILL_TONE: Record<
  Severity,
  { fg: string; bg: string; bd: string }
> = {
  action: {
    fg: "var(--color-critical, var(--critical))",
    bg: "var(--color-critical-bg, var(--critical-bg))",
    bd: "var(--color-critical-border, var(--critical-bd))",
  },
  cost: {
    fg: "var(--color-high, var(--high))",
    bg: "var(--color-high-bg, var(--high-bg))",
    bd: "var(--color-high-border, var(--high-bd))",
  },
  window: {
    fg: "var(--color-moderate, var(--moderate))",
    bg: "var(--color-moderate-bg, var(--moderate-bg))",
    bd: "var(--color-moderate-border, var(--moderate-bd))",
  },
  edge: {
    fg: "var(--color-secondary, var(--accent))",
    bg: "rgba(37,99,235,0.08)",
    bd: "var(--color-secondary, var(--accent))",
  },
  monitor: {
    fg: "var(--color-text-muted, var(--muted))",
    bg: "var(--color-surface, var(--surface))",
    bd: "var(--color-border, var(--border))",
  },
};

const SEVERITY_KEYWORDS: Record<Severity, RegExp[]> = {
  action: [/\baction required\b/i, /\bimmediate\b/i, /\bdeadline\b/i, /\bmust file\b/i],
  cost: [/\b(cost|surcharge|pass[- ]?through|margin|price.*(rise|up|breach))\b/i, /\bcost alert\b/i],
  window: [/\b(window|deadline|by 20|q\d \d{4}|enforcement|consultation)\b/i],
  edge: [/\b(competitive|edge|advantage|lock(ed)?|offtake|partnership)\b/i],
  monitor: [/\b(monitor|tracking|watch|observe)\b/i],
};

const SEVERITY_COLUMN_TO_KEY: Record<string, Severity> = {
  action_required: "action",
  cost_alert: "cost",
  window_closing: "window",
  competitive_edge: "edge",
  monitoring: "monitor",
};

function deriveSeverity(r: Resource): Severity {
  if (r.severity && SEVERITY_COLUMN_TO_KEY[r.severity]) {
    return SEVERITY_COLUMN_TO_KEY[r.severity];
  }
  const text = `${r.title} ${r.note || ""}`;
  const order: Severity[] = ["action", "cost", "window", "edge", "monitor"];
  for (const sev of order) {
    for (const re of SEVERITY_KEYWORDS[sev]) {
      if (re.test(text)) return sev;
    }
  }
  if (r.priority === "CRITICAL") return "action";
  if (r.priority === "HIGH") return "cost";
  if (r.priority === "MODERATE") return "window";
  return "monitor";
}

// ── Signal-band vocabulary (mirrors MarketPage) ───────────────────────

type BandKey = "price" | "corporate" | "corridor";

const BAND_LABEL: Record<BandKey, string> = {
  price: "Price signals",
  corporate: "Corporate & capital",
  corridor: "Corridors & routes",
};

const BAND_NUM: Record<BandKey, number> = {
  price: 1,
  corporate: 2,
  corridor: 3,
};

const BAND_KEYWORDS: Record<BandKey, RegExp[]> = {
  price: [
    /\b(price|spot|futures|tariff|surcharge|fuel|saf|eua|carbon|crude|jet a-?1|diesel)\b/i,
    /eur ?\d|usd ?\d|gbp ?\d|aed ?\d/i,
    /\/t\b|\/kwh|\/teu|\/l\b/i,
  ],
  corporate: [/\b(announces|raises|acquires|merger|partner|deploy|capacity|fleet|order|supplier|offtake|m&a)\b/i],
  corridor: [
    /\b(corridor|route|chokepoint|port|hormuz|suez|canal|cape|drayage|lane)\b/i,
    /\b(eu ?[→\-→]? ?(us|asia)|us ?[→\-→]? ?(eu|asia))\b/i,
  ],
};

function assignBand(r: Resource): BandKey {
  if (
    r.signalBand === "price" ||
    r.signalBand === "corporate" ||
    r.signalBand === "corridor"
  ) {
    return r.signalBand;
  }
  const text = `${r.title} ${r.note || ""}`;
  const bandsInOrder: BandKey[] = ["price", "corporate", "corridor"];
  for (const band of bandsInOrder) {
    for (const re of BAND_KEYWORDS[band]) {
      if (re.test(text)) return band;
    }
  }
  return "corporate";
}

// ── Source tier vocab (mirrors RegulationDetailSurface SourceTierLegend) ─

const TIER_DEFINITIONS = [
  { tier: 1, label: "Primary law / official journal", color: "var(--critical)" },
  { tier: 2, label: "Regulator guidance", color: "var(--high)" },
  { tier: 3, label: "Intergovernmental", color: "var(--accent)" },
  { tier: 4, label: "Industry body", color: "var(--text)" },
  { tier: 5, label: "Trade press", color: "var(--text-2)" },
];

// ── Market Signal Brief section headings ─────────────────────────────
//
// Keys "1"–"8" map to the canonical Market Signal Brief headings per
// analysis-construction-spec SKILL.md §6 and system-prompt.ts lines 202–209.
// These MUST match the headings the system prompt emits so the extractor
// routes sections correctly.

const MARKET_SECTION_HEADINGS: Record<string, string> = {
  "1": "What's Moving and What Triggered It",
  "2": "Who's Driving It and What They Want",
  "3": "Expected Trajectory and Conversion Triggers",
  "4": "Operational and Cost Implications If It Materializes",
  "5": "Competitive Implications",
  "6": "Client Conversation Talking Points",
  "7": "What the Workspace Should Do Now",
  "8": "Sources",
};

const KNOWN_MARKET_KEYS = new Set(["1", "2", "3", "4", "5", "6", "7", "8"]);

// ── Section-aware renderer (analogous to ResearchSections) ────────────
//
// Renders the 8 Market Signal Brief sections from intelligence_item_sections
// rows. Each section is a numbered card with a prose body rendered via the
// shared ProseSection (reused, not re-implemented). Rows with empty
// content_md are silently omitted (integrity-preserving). Returns null when
// no known-key rows have content, so the parent falls back to the legacy
// summary panel.

function MarketSectionCard({
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
      id={`market-section-${sectionKey}`}
      style={{
        background: "var(--color-surface, var(--surface))",
        border: "1px solid var(--color-border, var(--border))",
        borderRadius: "var(--radius-md, 6px)",
        marginBottom: 14,
        boxShadow: "var(--shadow-card, var(--shadow))",
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
          background: "var(--color-bg-raised, var(--bg))",
          borderBottom: "1px solid var(--color-border-subtle, var(--border-sub))",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 13,
            fontWeight: 400,
            letterSpacing: "0.08em",
            color: "#fff",
            background: "var(--color-primary, var(--accent))",
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
          style={{
            fontSize: 13.5,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--color-text-primary, var(--text))",
          }}
        >
          {heading}
        </span>
      </div>
      {/* Section body — shared generic prose renderer (reused, not re-implemented). */}
      <div style={{ padding: "18px 22px 22px" }}>
        <ProseSection markdown={contentMd} />
      </div>
    </section>
  );
}

function MarketSections({ rows }: { rows: IntelligenceItemSectionRow[] }) {
  const known = rows.filter(
    (r) => KNOWN_MARKET_KEYS.has(r.section_key) && (r.content_md || "").trim()
  );
  if (known.length === 0) return null;

  return (
    <div>
      {known.map((row) => {
        const heading =
          MARKET_SECTION_HEADINGS[row.section_key] || `Section ${row.section_key}`;
        return (
          <MarketSectionCard
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

// ── Component ─────────────────────────────────────────────────────────

export function MarketSignalDetailSurface({
  resource: r,
  relatedPool,
  sections = [],
  convergence = null,
}: Props) {
  const severity = useMemo(() => deriveSeverity(r), [r]);
  const band = useMemo(() => assignBand(r), [r]);

  // Section-aware mode: sections from intelligence_item_sections take
  // precedence over the legacy summary toggle when non-empty. Rows are
  // already ordered by section_order from the server fetch.
  const hasSections = sections.length > 0;

  // Corroboration: render ONLY when convergence carries a real non-zero
  // independent_citers count from the source-growth engine. Never proxy.
  const independentCiters =
    convergence && convergence.independent_citers > 0
      ? convergence.independent_citers
      : null;

  // Related: same band, exclude self, cap at 5.
  const related = useMemo(() => {
    return relatedPool
      .filter((x) => x.id !== r.id)
      .map((x) => ({ item: x, band: assignBand(x), severity: deriveSeverity(x) }))
      .filter((x) => x.band === band)
      .slice(0, 5);
  }, [relatedPool, r.id, band]);

  const modes = r.modes || (r.cat ? [r.cat] : []);
  const tags = r.tags || [];

  const jurisdictionLabels =
    r.jurisdictionIso && r.jurisdictionIso.length > 0
      ? r.jurisdictionIso.map(isoToDisplayLabel)
      : r.jurisdiction
      ? [JURISDICTIONS.find((j) => j.id === r.jurisdiction)?.label || r.jurisdiction]
      : ["Global"];
  const jurisLabel = jurisdictionLabels.join(" · ");

  const sevTone = SEVERITY_PILL_TONE[severity];

  return (
    <div className="px-9 pt-8 pb-16 max-w-[1280px] mx-auto">
      {/* Hero card */}
      <div
        style={{
          background: "var(--color-surface, var(--surface))",
          border: "1px solid var(--color-border-subtle, var(--border-sub))",
          borderLeft: `5px solid ${sevTone.fg}`,
          borderRadius: "var(--radius-md, var(--r-lg))",
          padding: "22px 26px 20px",
          boxShadow: "var(--shadow-card, var(--shadow))",
          marginBottom: 16,
        }}
      >
        {/* Mode chips */}
        {modes.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            {modes.map((m) => (
              <span
                key={m}
                style={{
                  fontSize: 11,
                  padding: "4px 10px",
                  border: "1px solid var(--color-border, var(--border))",
                  borderRadius: 999,
                  background: "var(--color-surface, var(--surface))",
                  color: "var(--color-text-secondary, var(--text-2))",
                  display: "inline-flex",
                  gap: 5,
                  alignItems: "center",
                  fontWeight: 600,
                }}
              >
                {m.toUpperCase()}
              </span>
            ))}
          </div>
        )}

        {/* Title metadata strip — severity + band + type pills on the right
            (mirrors RegulationDetailSurface; the masthead is the single
            source of truth for the title itself). */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 10,
          }}
        >
          {r.type && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                padding: "4px 10px",
                borderRadius: 3,
                background: "var(--accent-bg)",
                color: "var(--accent)",
                border: "1px solid var(--accent-bd)",
              }}
            >
              {r.type.replace(/_/g, " ")}
            </span>
          )}
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              padding: "4px 10px",
              borderRadius: 3,
              background: "var(--color-bg-raised, var(--bg))",
              color: "var(--color-text-primary, var(--text))",
              border: "1px solid var(--color-border, var(--border))",
            }}
          >
            B{BAND_NUM[band]} {BAND_LABEL[band]}
          </span>
          <SeverityPill severity={severity} />
        </div>

        {/* Deck / note */}
        {(r.note || r.whatIsIt) && (
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.55,
              color: "var(--color-text-secondary, var(--text-2))",
              marginBottom: 14,
              maxWidth: "78ch",
            }}
          >
            {r.note || r.whatIsIt}
          </p>
        )}

        {/* Source attribution line */}
        {(r.sourceName || r.url) && (
          <p
            style={{
              fontSize: 12,
              color: "var(--color-text-muted, var(--muted))",
              margin: "0 0 10px",
            }}
          >
            Source:{" "}
            {r.url ? (
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--color-primary, var(--accent))" }}
              >
                {r.sourceName || r.url}
              </a>
            ) : (
              <span style={{ color: "var(--color-text-secondary, var(--text-2))" }}>
                {r.sourceName}
              </span>
            )}
            {r.sourceTier && (
              <span style={{ marginLeft: 8 }}>
                <SourceTierBadge tier={r.sourceTier} />
              </span>
            )}
          </p>
        )}

        {tags.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {tags.map((t) => (
              <span
                key={t}
                style={{
                  fontSize: 11,
                  padding: "3px 10px",
                  background: "var(--color-bg-raised, var(--bg))",
                  border: "1px solid var(--color-border-subtle, var(--border-sub))",
                  borderRadius: 999,
                  color: "var(--color-text-secondary, var(--text-2))",
                  fontWeight: 600,
                }}
              >
                {t}
              </span>
            ))}
          </div>
        )}

        {/* Corroboration note — rendered ONLY when sources.independent_citers
            is populated and non-zero (real source-growth convergence from
            aggregateConvergence / compoundSourceCredibility). Absent or zero
            → note omitted entirely. No proxy; no sources_used.length. */}
        {independentCiters !== null && (
          <div
            style={{
              marginTop: 12,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11.5,
              color: "var(--color-text-muted, var(--muted))",
              background: "var(--color-bg-raised, var(--bg))",
              border: "1px solid var(--color-border-subtle, var(--border-sub))",
              borderRadius: 4,
              padding: "4px 10px",
            }}
          >
            <span style={{ fontWeight: 700, color: "var(--color-primary, var(--accent))" }}>
              {independentCiters}
            </span>
            {" "}independent source{independentCiters === 1 ? "" : "s"} corroborate this signal
          </div>
        )}
      </div>

      {/* Stat strip — Severity + Signal band + Published */}
      <div
        className="cl-detail-stat-strip"
        style={{
          display: "grid",
          gridTemplateColumns: r.added ? "repeat(3, 1fr)" : "repeat(2, 1fr)",
          gap: 10,
          marginBottom: 18,
        }}
      >
        <style>{`
          @media (max-width: 720px) { .cl-detail-stat-strip { grid-template-columns: 1fr !important; } }
        `}</style>
        <Stat label="Severity" value={SEVERITY_LABEL[severity]} accentColor={sevTone.fg} />
        <Stat label="Signal band" value={`B${BAND_NUM[band]} · ${BAND_LABEL[band]}`} />
        {r.added && (
          <Stat label="Published" value={formatDate(r.added)} sub={r.lastVerifiedDate ? `Reviewed ${formatDate(r.lastVerifiedDate)}` : undefined} />
        )}
      </div>

      {/* AI prompt bar — signal-aware follow-ups */}
      <div style={{ marginBottom: 16 }}>
        <AiPromptBar
          placeholder={`Ask anything about ${r.title} — e.g. how does this hit my Q3 lane costs?`}
          chips={[
            "What does this mean for me?",
            "How does this affect my margins?",
            "Which lanes are most exposed?",
          ]}
        />
      </div>

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
          {/* Section-aware content: 8 Market Signal Brief sections from the
              canonical pipeline. Renders when sections are available (Sprint 4).
              Each section is a numbered card (S1–S8) matching the Market Signal
              Brief format per analysis-construction-spec SKILL.md §6. */}
          {hasSections ? (
            <>
              <MarketSections rows={sections} />
              {/* Honest block-level empty-state fires only when ALL rows are
                  absent/empty — MarketSections already handles that by returning null.
                  No duplicate empty-state needed; ResearchFindingDetailSurface uses
                  the same approach. */}
              {sections.length > 0 &&
                sections.every((s) => !(s.content_md || "").trim()) && (
                  <div
                    style={{
                      marginBottom: 14,
                      padding: "12px 16px",
                      background: "var(--color-surface-raised, var(--color-bg-raised, var(--surface)))",
                      border: "1px solid var(--color-border-subtle, var(--border-sub))",
                      borderLeft: "3px solid var(--color-text-muted, var(--muted))",
                      borderRadius: "var(--radius-sm, 4px)",
                      fontSize: 13,
                      lineHeight: 1.55,
                      color: "var(--color-text-muted, var(--muted))",
                    }}
                  >
                    Detailed sections pending for this signal; brief generation in
                    progress.
                  </div>
                )}
            </>
          ) : (
            <>
              {/* Legacy fallback: summary + brief toggle. Renders only when
                  no sections are available yet (pre-generation items). */}
              {(r.whatIsIt || r.note || r.fullBrief) && (
                <SummaryPanel
                  shortText={r.whatIsIt || r.note || ""}
                  fullBrief={r.fullBrief}
                />
              )}

              {/* What it changes — so-what narrative (legacy fallback only) */}
              {(r.whyMatters || r.reasoning) && (
                <BriefSection title="What it changes">
                  {r.reasoning && (
                    <div
                      style={{
                        borderLeft: "3px solid var(--color-primary, var(--accent))",
                        paddingLeft: 16,
                        fontSize: 14.5,
                        lineHeight: 1.7,
                        margin: "0 0 16px",
                        color: "var(--color-text-primary, var(--text))",
                      }}
                    >
                      {r.reasoning}
                    </div>
                  )}
                  {r.whyMatters && (
                    <p
                      style={{
                        fontSize: 14,
                        lineHeight: 1.7,
                        margin: 0,
                        color: "var(--color-text-primary, var(--text))",
                      }}
                    >
                      {r.whyMatters}
                    </p>
                  )}
                </BriefSection>
              )}
            </>
          )}

          {/* No-Vacuum (S3): linked-regulation / conversion-trigger block.
              Per analysis-construction-spec SKILL.md §6, S3 "Expected Trajectory
              and Conversion Triggers" frequently links a specific Regulation item.
              Render this block whenever conversionTrigger or crossReferences is
              present on the row — regardless of section-aware vs legacy mode.
              These are migration 110 callout columns on intelligence_items,
              projected to Resource.conversionTrigger / Resource.crossReferences. */}
          {(r.conversionTrigger || r.crossReferences) && (
            <div
              style={{
                marginBottom: 14,
                padding: "14px 18px",
                background: "var(--color-bg-raised, var(--bg))",
                border: "1px solid var(--color-border, var(--border))",
                borderLeft: "4px solid var(--color-primary, var(--accent))",
                borderRadius: "var(--radius-md, 6px)",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--color-primary, var(--accent))",
                  marginBottom: 6,
                }}
              >
                {r.crossReferences ? "Linked regulations" : "Conversion trigger"}
              </div>
              <p
                style={{
                  fontSize: 13.5,
                  lineHeight: 1.55,
                  color: "var(--color-text-primary, var(--text))",
                  margin: 0,
                }}
              >
                {r.conversionTrigger || r.crossReferences}
              </p>
            </div>
          )}

          {/* Trajectory — band === "price" ONLY. Per dispatch Phase 5:
              market signals don't carry explicit trajectory time-series
              data on the intelligence_items row today. The price snapshot
              in MarketPage is hard-coded as a 4-tile vertical slice; per-
              signal trajectory bars would need either:
                (a) a marketData.{currentPrice, previousPrice} pair on the
                    resource, projected into a 2-point trend, OR
                (b) a future item_price_history table (not in any migration).
              Until (a) or (b) lands, we render the section with an honest
              "Trajectory data not yet available" empty-state when the row
              lacks marketData. When marketData IS populated, we render a
              minimal 2-point indicator so the section earns its place. */}
          {band === "price" && <TrajectoryPanel resource={r} />}

          {/* Key data (carried through when present) */}
          {r.keyData && r.keyData.length > 0 && (
            <BriefSection title="Key data">
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.75 }}>
                {r.keyData.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </BriefSection>
          )}

          {/* Related signals — same band, max 5 */}
          {related.length > 0 && (
            <BriefSection title={`Related signals · ${BAND_LABEL[band]}`}>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                {related.map((rel) => (
                  <li
                    key={rel.item.id}
                    style={{
                      padding: "10px 0",
                      borderBottom: "1px solid var(--color-border-subtle, var(--border-sub))",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <SeverityPill severity={rel.severity} small />
                      <a
                        href={`/market/${encodeURIComponent(rel.item.id)}`}
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: "var(--color-text-primary, var(--text))",
                          textDecoration: "none",
                        }}
                      >
                        {rel.item.title}
                      </a>
                    </div>
                    {rel.item.note && (
                      <p
                        style={{
                          fontSize: 12.5,
                          lineHeight: 1.5,
                          color: "var(--color-text-secondary, var(--text-2))",
                          margin: 0,
                        }}
                      >
                        {rel.item.note}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </BriefSection>
          )}

          {/* Sources panel */}
          <BriefSection title="Sources">
            {r.url ? (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.75 }}>
                <li>
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "var(--color-primary, var(--accent))" }}
                  >
                    {r.sourceName || r.url}
                  </a>
                  {r.sourceTier && (
                    <span style={{ marginLeft: 8 }}>
                      <SourceTierBadge tier={r.sourceTier} />
                    </span>
                  )}
                </li>
              </ul>
            ) : (
              <p style={{ fontSize: 14, color: "var(--color-text-muted, var(--muted))", margin: 0 }}>
                Primary source not yet linked.
              </p>
            )}
            <SourceTierLegend />
          </BriefSection>
        </div>

        {/* Right rail */}
        <aside style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <SideCard label="Signal">
            <KV k="Band" v={`B${BAND_NUM[band]} · ${BAND_LABEL[band]}`} />
            <KV k="Severity" v={SEVERITY_LABEL[severity]} />
            {r.type && <KV k="Type" v={r.type.replace(/_/g, " ")} />}
          </SideCard>
          <SideCard label="Identification">
            <KV k="ID" v={r.id} />
            {r.added && <KV k="Published" v={formatDate(r.added)} />}
            {r.lastVerifiedDate && <KV k="Reviewed" v={formatDate(r.lastVerifiedDate)} />}
            {r.sourceName && <KV k="Source" v={r.sourceName} />}
          </SideCard>
          <SideCard label="Coverage">
            <KV k="Jurisdiction" v={jurisLabel || "Global"} />
            {modes.length > 0 && (
              <KV k="Modes" v={modes.map((m) => m.toUpperCase()).join(", ")} />
            )}
            {r.topic && <KV k="Topic" v={r.topic} />}
          </SideCard>
        </aside>
      </div>
    </div>
  );
}

// ── Subcomponents ───────────────────────────────────────────────────────

function Stat({
  label,
  value,
  sub,
  accentColor,
}: {
  label: string;
  value: string;
  sub?: string;
  accentColor?: string;
}) {
  return (
    <div
      style={{
        background: "var(--color-surface, var(--surface))",
        border: accentColor
          ? `1px solid ${accentColor}`
          : "1px solid var(--color-border-subtle, var(--border-sub))",
        borderLeft: accentColor ? `4px solid ${accentColor}` : undefined,
        borderRadius: "var(--radius-md, var(--r-md))",
        padding: "14px 16px",
        boxShadow: "var(--shadow-card, var(--shadow))",
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 800,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: accentColor || "var(--color-text-muted, var(--muted))",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 22,
          lineHeight: 1.15,
          color: accentColor || "var(--color-text-primary, var(--text))",
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          style={{
            fontSize: 11,
            color: "var(--color-text-secondary, var(--text-2))",
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
        background: "var(--color-surface, var(--surface))",
        border: "1px solid var(--color-border-subtle, var(--border-sub))",
        borderRadius: "var(--radius-md, var(--r-md))",
        padding: "22px 26px",
        marginBottom: 14,
        boxShadow: "var(--shadow-card, var(--shadow))",
      }}
    >
      <h3
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 22,
          fontWeight: 400,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          margin: "0 0 14px",
          paddingBottom: 12,
          borderBottom: "1px solid var(--color-border-subtle, var(--border-sub))",
          color: "var(--color-text-primary, var(--text))",
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
      style={{
        background: "var(--color-surface, var(--surface))",
        border: "1px solid var(--color-border-subtle, var(--border-sub))",
        borderRadius: "var(--radius-md, var(--r-md))",
        padding: "14px 16px",
        boxShadow: "var(--shadow-card, var(--shadow))",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--color-text-muted, var(--muted))",
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
      <div style={{ color: "var(--color-text-muted, var(--muted))", fontWeight: 600 }}>{k}</div>
      <div style={{ color: "var(--color-text-primary, var(--text))", fontWeight: 600 }}>{v}</div>
    </>
  );
}

function SummaryPanel({
  shortText,
  fullBrief,
}: {
  shortText: string;
  fullBrief?: string;
}) {
  const [mode, setMode] = useState<"short" | "full">("short");
  const hasFull = !!(fullBrief && fullBrief.trim().length > 0);

  return (
    <div style={{ marginBottom: 16 }}>
      {hasFull && (
        <div
          style={{
            display: "flex",
            gap: 6,
            background: "var(--color-surface, var(--surface))",
            border: "1px solid var(--color-border, var(--border))",
            borderRadius: "var(--radius-pill, var(--r-pill, 999px))",
            padding: 4,
            marginBottom: 14,
            width: "max-content",
          }}
        >
          <button
            onClick={() => setMode("short")}
            style={{
              background: mode === "short" ? "var(--color-primary, var(--accent))" : "transparent",
              color: mode === "short" ? "#fff" : "var(--color-text-secondary, var(--text-2))",
              border: 0,
              padding: "7px 16px",
              fontFamily: "inherit",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.04em",
              borderRadius: "var(--radius-pill, var(--r-pill, 999px))",
              cursor: "pointer",
            }}
          >
            Short summary
          </button>
          <button
            onClick={() => setMode("full")}
            style={{
              background: mode === "full" ? "var(--color-primary, var(--accent))" : "transparent",
              color: mode === "full" ? "#fff" : "var(--color-text-secondary, var(--text-2))",
              border: 0,
              padding: "7px 16px",
              fontFamily: "inherit",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.04em",
              borderRadius: "var(--radius-pill, var(--r-pill, 999px))",
              cursor: "pointer",
            }}
          >
            Full briefing
          </button>
        </div>
      )}

      {mode === "short" && shortText && (
        <div
          style={{
            background: "var(--accent-strip, var(--color-bg-raised, var(--surface)))",
            border: "1px solid var(--accent-strip-bd, var(--color-border-subtle, var(--border-sub)))",
            borderRadius: "var(--radius-md, var(--r-md))",
            padding: "16px 20px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--color-primary, var(--accent))",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Sparkles size={12} />
              Short summary
            </span>
            <span style={{ fontSize: 11, color: "var(--color-text-muted, var(--muted))" }}>
              30-second read
            </span>
          </div>
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.6,
              margin: 0,
              color: "var(--color-text-primary, var(--text))",
            }}
          >
            {shortText}
          </p>
        </div>
      )}

      {mode === "full" && fullBrief && (
        <div
          className="cl-card"
          style={{
            background: "var(--color-surface, var(--surface))",
            border: "1px solid var(--color-border-subtle, var(--border-sub))",
            borderRadius: "var(--radius-md, var(--r-md))",
            padding: "22px 26px",
            boxShadow: "var(--shadow-card, var(--shadow))",
          }}
        >
          <IntelligenceBrief markdown={fullBrief} />
        </div>
      )}
    </div>
  );
}

/** Trajectory panel — price-band-only.
 *
 * Sprint 3 A4-3 (2026-05-27): three-tier rendering hierarchy:
 *   1. If r.signalBand === 'price' AND r.trajectoryPoints has data →
 *      render the 12-week TrajectoryBars (migration 107 schema-backed).
 *      Belt 3 of three; outer band guard at line 465 already restricts
 *      entry, this signalBand check is defense-in-depth.
 *   2. Else if marketData.{currentPrice, previousPrice} pair present →
 *      legacy 2-tile fallback for the sparse-corpus case where the row
 *      has snapshot data but no time-series. Preserved from H1 Path B.
 *   3. Else honest empty-state copy.
 *
 * As ingestion populates trajectory_points across the B1 corpus (agent
 * extension + TIMESERIES-WORKER), tier 1 becomes the default and the
 * tier 2/3 fallbacks fade. */
function TrajectoryPanel({ resource: r }: { resource: Resource }) {
  const md = r.marketData;
  const hasPair = !!(md && md.currentPrice && md.previousPrice);
  const hasTrajectoryData =
    r.signalBand === "price" &&
    (r.trajectoryPoints?.points?.length ?? 0) > 0;

  return (
    <BriefSection title="Trajectory">
      {hasTrajectoryData && r.trajectoryPoints ? (
        <TrajectoryBars trajectoryPoints={r.trajectoryPoints} />
      ) : hasPair ? (
        <div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
              marginBottom: 12,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--color-text-muted, var(--muted))",
                  marginBottom: 4,
                }}
              >
                Previous
              </div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "var(--color-text-primary, var(--text))" }}>
                {md!.previousPrice}
              </div>
            </div>
            <div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--color-text-muted, var(--muted))",
                  marginBottom: 4,
                }}
              >
                Current
              </div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "var(--color-primary, var(--accent))" }}>
                {md!.currentPrice}
              </div>
            </div>
          </div>
          {md!.priceSource && (
            <p style={{ fontSize: 12, color: "var(--color-text-muted, var(--muted))", margin: 0 }}>
              {md!.priceSource}
              {md!.priceDate ? ` · ${md!.priceDate}` : ""}
            </p>
          )}
          {md!.freightCostImpact && (
            <p
              style={{
                fontSize: 13,
                color: "var(--color-text-primary, var(--text))",
                margin: "8px 0 0",
                fontWeight: 600,
              }}
            >
              Freight cost impact: {md!.freightCostImpact}
            </p>
          )}
        </div>
      ) : (
        <p
          style={{
            fontSize: 13,
            color: "var(--color-text-muted, var(--muted))",
            margin: 0,
            fontStyle: "italic",
          }}
        >
          Trajectory data not yet available for this signal. Historical
          price data will be added as it becomes available.
        </p>
      )}
    </BriefSection>
  );
}

function SeverityPill({
  severity,
  small,
}: {
  severity: Severity;
  small?: boolean;
}) {
  const tone = SEVERITY_PILL_TONE[severity];
  return (
    <span
      style={{
        alignSelf: "flex-start",
        fontSize: small ? 9 : 10,
        fontWeight: 800,
        padding: small ? "1px 6px" : "2px 8px",
        borderRadius: 3,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: tone.fg,
        background: tone.bg,
        border: `1px solid ${tone.bd}`,
        display: "inline-block",
      }}
    >
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

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
        color: def?.color || "var(--text-2)",
        border: `1px solid ${def?.color || "var(--border)"}`,
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
        background: "var(--raised, var(--bg))",
        border: "1px solid var(--border-sub, var(--border))",
        borderRadius: "var(--r-md, 6px)",
        fontSize: 11.5,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--text-2, var(--muted))",
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
            <span style={{ color: "var(--text)" }}>{t.label}</span>
          </li>
        ))}
        <li style={{ color: "var(--text-2, var(--muted))", fontStyle: "italic", marginTop: 4 }}>
          Sources are curated for reliability and verified before publication.
        </li>
      </ul>
    </div>
  );
}

function formatDate(d: string): string {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
