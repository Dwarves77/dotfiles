"use client";

/**
 * TechnologyDetailSurface — client subcomponent for /technology/[slug].
 *
 * Detail view for a single Technology Profile item (item_type: technology,
 * innovation, or tool). Layout mirrors ResearchFindingDetailSurface for
 * design coherence: EditorialMasthead-style typography, cl-card surfaces,
 * identical Stat / KV / SideCard primitives.
 *
 * Section-aware: when `sections` are supplied (intelligence_item_sections
 * rows from the canonical pipeline), the main panel renders the 8 Technology
 * Profile sections via <TechnologySections> (analogous to <ResearchSections>).
 * Empty sections falls back to the raw full_brief / summary toggle (legacy).
 *
 * 8 Technology Profile headings per analysis-construction-spec SKILL.md §8
 * and system-prompt.ts lines 176–183:
 *   S1 What's Being Tested or Deployed and By Whom
 *   S2 What This Tells Us About Industry Trajectory
 *   S3 Supplier Access and Procurement Reality
 *   S4 Operational Fit by Transport Mode and Cargo Vertical
 *   S5 Competitive Positioning Implications for the Workspace
 *   S6 Conversational and Strategic Talking Points
 *   S7 Time-to-Market, Procurement Window, and Action
 *   S8 Sources
 *
 * Integrity rule: rows with empty content_md produce no card. The block
 * returns null when no known-key rows exist, so the parent falls through
 * to the legacy brief toggle.
 *
 * Cloned from ResearchFindingDetailSurface. Reuses ProseSection,
 * IntelligenceItemSectionRow from supabase-server. No local copies of
 * those primitives.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Resource } from "@/types/resource";
import type { IntelligenceItemSectionRow } from "@/lib/supabase-server";
import { ProseSection } from "@/components/regulations/sections/ProseSection";

interface RelatedItem {
  id: string;
  title: string;
  summary: string | null;
  sourceName: string | null;
  addedDate: string | null;
}

interface Props {
  resource: Resource;
  related: RelatedItem[];
  relatedReason: "type" | "source" | "none";
  /**
   * Parsed Technology Profile sections from intelligence_item_sections.
   * When non-empty, renders the 8 structured section cards (section-aware mode).
   * Empty array falls back to the raw full_brief markdown toggle (legacy).
   */
  sections?: IntelligenceItemSectionRow[];
}

// ── Technology section-aware renderer ──
//
// 8 Technology Profile sections from intelligence_item_sections rows.
// Keys "1"–"8" map to the canonical headings per SKILL.md §8 and
// system-prompt.ts lines 176–183. Each section is rendered as a
// numbered card (S1–S8) via the shared ProseSection primitive.

const TECHNOLOGY_SECTION_HEADINGS: Record<string, string> = {
  "1": "What's Being Tested or Deployed and By Whom",
  "2": "What This Tells Us About Industry Trajectory",
  "3": "Supplier Access and Procurement Reality",
  "4": "Operational Fit by Transport Mode and Cargo Vertical",
  "5": "Competitive Positioning Implications for the Workspace",
  "6": "Conversational and Strategic Talking Points",
  "7": "Time-to-Market, Procurement Window, and Action",
  "8": "Sources",
};

const KNOWN_TECHNOLOGY_KEYS = new Set(["1", "2", "3", "4", "5", "6", "7", "8"]);

function TechnologySections({ rows }: { rows: IntelligenceItemSectionRow[] }) {
  const known = rows.filter(
    (r) => KNOWN_TECHNOLOGY_KEYS.has(r.section_key) && (r.content_md || "").trim()
  );
  if (known.length === 0) return null;

  return (
    <div>
      {known.map((row) => {
        const heading =
          TECHNOLOGY_SECTION_HEADINGS[row.section_key] || `Section ${row.section_key}`;
        return (
          <TechnologySectionCard
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

function TechnologySectionCard({
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
      id={`technology-section-${sectionKey}`}
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
          style={{
            fontSize: 13.5,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--color-text-primary)",
          }}
        >
          {heading}
        </span>
      </div>
      {/* Section body — shared generic prose renderer. */}
      <div style={{ padding: "18px 22px 22px" }}>
        <ProseSection markdown={contentMd} />
      </div>
    </section>
  );
}

// ── Severity vocabulary ──

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
  if (/\b(action required|immediate|deadline|must|critical)\b/.test(text)) return "action";
  if (/\b(cost|price|surcharge|margin|spend)\b/.test(text)) return "cost";
  if (r.added) {
    const age = Date.now() - new Date(r.added).getTime();
    if (age >= 0 && age < 14 * 24 * 60 * 60 * 1000) return "monitor";
  }
  return "background";
}

// ── Item type label ──

const ITEM_TYPE_LABEL: Record<string, string> = {
  technology: "Technology",
  innovation: "Innovation",
  tool: "Tool",
};

// ── Source-tier definitions ──

const TIER_DEFINITIONS: Array<{ tier: number; label: string; color: string }> = [
  { tier: 1, label: "Primary law", color: "var(--color-critical)" },
  { tier: 2, label: "Regulator guidance", color: "var(--color-high)" },
  { tier: 3, label: "Intergovernmental", color: "var(--color-accent, var(--color-primary))" },
  { tier: 4, label: "Industry body", color: "var(--color-text-primary)" },
  { tier: 5, label: "Trade press", color: "var(--color-text-secondary)" },
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
        <li
          style={{
            color: "var(--color-text-muted)",
            fontStyle: "italic",
            marginTop: 4,
          }}
        >
          T6 (aggregator) and T7 (unverified) are admin-reviewed and rarely surface here.
        </li>
      </ul>
    </div>
  );
}

// ── Shared primitives (local copies matching ResearchFindingDetailSurface) ──

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

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ── Main surface ──

export function TechnologyDetailSurface({
  resource: r,
  related,
  relatedReason,
  sections = [],
}: Props) {
  const severity = useMemo(() => deriveSeverity(r), [r]);
  const [briefMode, setBriefMode] = useState<"short" | "full">("short");

  const hasSections = sections.length > 0;

  const shortText = r.note || r.whyMatters || r.whatIsIt || "";
  const fullText = r.fullBrief || shortText;
  const hasFull = !!r.fullBrief && r.fullBrief.length > shortText.length;

  const tier = r.sourceTier;
  const sourceName = r.sourceName || null;
  const sourceUrl = r.url || r.sourceUrl || null;

  const typeLabel = r.type ? (ITEM_TYPE_LABEL[r.type] || r.type.replace(/_/g, " ")) : null;

  return (
    <div className="px-9 pt-8 pb-16 max-w-[1280px] mx-auto">
      {/* Hero card */}
      <div
        className="cl-card"
        style={{
          borderLeft: "5px solid var(--color-primary)",
          padding: "22px 26px 20px",
          marginBottom: 16,
        }}
      >
        {/* Pill strip — severity + type */}
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
          {typeLabel && (
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
              {typeLabel}
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
            <span style={{ fontWeight: 700, color: "var(--color-text-primary)" }}>Source</span>
            {sourceUrl ? (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--color-primary)", fontWeight: 600 }}
              >
                {sourceName || sourceUrl}
              </a>
            ) : (
              <span style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>
                {sourceName}
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
          <Stat label="Published" value={formatDate(r.added)} sub={sourceName || undefined} />
          {r.citationCount != null && r.citationCount > 0 && (
            <Stat
              label="Citations"
              value={String(r.citationCount)}
              sub={r.lastCitedAt ? `Last cited ${formatDate(r.lastCitedAt)}` : undefined}
            />
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
          {/* Section-aware content: 8 Technology Profile sections from the
              canonical pipeline. Renders when sections are available.
              Each section is a numbered card (S1–S8) matching the Technology
              Profile format per analysis-construction-spec SKILL.md §8. */}
          {hasSections ? (
            <TechnologySections rows={sections} />
          ) : (
            <>
              {/* Legacy fallback: short / full brief toggle when no sections. */}
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
                    background: "var(--color-surface-raised, var(--color-bg-raised))",
                    border: "1px solid var(--color-border-subtle, var(--color-border))",
                    borderLeft: "3px solid var(--color-text-muted)",
                    borderRadius: "var(--radius-sm, 4px)",
                    fontSize: 13,
                    lineHeight: 1.55,
                    color: "var(--color-text-muted)",
                  }}
                >
                  Detailed sections pending for this technology item; brief generation in
                  progress.
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
                      style={{ color: "var(--color-primary)" }}
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
          <BriefSection title="Related technology">
            {related.length === 0 ? (
              <p
                style={{
                  fontSize: 14,
                  color: "var(--color-text-muted)",
                  margin: 0,
                  lineHeight: 1.6,
                }}
              >
                No related technology items yet. As the corpus grows, items sharing this
                type or source will appear here.
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
                  {relatedReason === "type"
                    ? "Other items of the same technology type."
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
                        borderBottom: "1px solid var(--color-border-subtle, var(--color-border))",
                      }}
                    >
                      <Link
                        href={`/technology/${encodeURIComponent(it.id)}`}
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
                        style={{
                          fontSize: 11,
                          color: "var(--color-text-muted)",
                          marginTop: 4,
                        }}
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
          <SideCard label="Identification">
            <KV k="ID" v={r.id} />
            <KV k="Type" v={typeLabel} />
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
        </aside>
      </div>
    </div>
  );
}
