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
 * Sections per Phase 5 dispatch:
 *   - Hero card (deck, source attribution, severity pill, theme pill,
 *     published date)
 *   - Summary panel with short ↔ full toggle (short = item.note /
 *     row.summary; full = item.fullBrief markdown when present, else
 *     the same summary echoed for honesty)
 *   - Methodology panel (paragraphs from item.note / summary; documented
 *     fallback when the schema lacks a dedicated methodology column —
 *     see "Methodology section choice" comment below)
 *   - Sources panel with source attribution + local SourceTierLegend
 *   - Related findings panel: items sharing the same theme; falls back
 *     to items from the same source when theme is NULL on most rows
 *
 * Severity + theme vocabularies match ResearchView.tsx exactly so the
 * detail view shows the same pills the index card showed.
 *
 * Methodology section choice (documented per dispatch ambiguity clause):
 *   The intelligence_items schema has no dedicated "methodology" column.
 *   ResearchView's index uses `summary` (item.note in Resource shape)
 *   for the body text. For the detail view's Methodology block we render
 *   item.fullBrief when present (a 6-section Research Summary brief under
 *   the current SKILL contract), and fall back to item.whyMatters /
 *   item.whatIsIt / item.note in that order. When nothing useful exists
 *   the section is omitted (Integrity Rule).
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Resource } from "@/types/resource";

interface RelatedFinding {
  id: string;
  title: string;
  summary: string | null;
  sourceName: string | null;
  addedDate: string | null;
}

interface Props {
  resource: Resource;
  // Related findings supplied by the page; selection logic (same theme,
  // else same source) lives in the server component so this surface
  // stays a plain renderer.
  related: RelatedFinding[];
  relatedReason: "theme" | "source" | "none";
}

// ── Severity vocabulary (mirrors ResearchView.tsx, kept local so the
//    detail surface compiles without modifying ResearchView per the
//    dispatch's "no modifications outside new files" rule) ──

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

// ── Theme vocabulary (mirrors ResearchView.tsx) ──

type ThemeKey =
  | "emissions"
  | "fuels"
  | "packaging"
  | "carbon"
  | "cold-chain"
  | "last-mile"
  | "disclosure";

const THEME_LABEL: Record<ThemeKey, string> = {
  emissions: "Emissions accounting",
  fuels: "Fuels & SAF",
  packaging: "Packaging & circular",
  carbon: "Carbon markets",
  "cold-chain": "Cold-chain & art",
  "last-mile": "Last-mile electrification",
  disclosure: "Disclosure regimes",
};

const THEME_COLUMN_TO_KEY: Record<string, ThemeKey> = {
  emissions_accounting: "emissions",
  fuels_saf: "fuels",
  packaging_circular: "packaging",
  carbon_markets: "carbon",
  cold_chain_art: "cold-chain",
  last_mile_electrification: "last-mile",
  disclosure_regimes: "disclosure",
};

const THEME_KEYWORDS: Record<ThemeKey, RegExp[]> = {
  emissions: [/scope ?3/i, /ghg/i, /emission/i, /co2|carbon footprint|tco2e/i, /accounting/i, /lca/i, /lifecycle/i],
  fuels: [/\bsaf\b/i, /sustainable aviation fuel/i, /hydrogen/i, /\bhefa\b/i, /e-saf/i, /biofuel/i, /alternative fuel/i, /marine fuel/i],
  packaging: [/packaging/i, /\bppwr\b/i, /reuse/i, /crate/i, /pfas/i, /recyclable/i, /circular/i, /pet resin/i],
  carbon: [/\beu ets\b/i, /\bets\b/i, /carbon market/i, /carbon price/i, /\bcbam\b/i, /\beua\b/i, /allowance/i, /carbon pricing/i],
  "cold-chain": [/cold[- ]?chain/i, /climate[- ]?control/i, /refrigerant/i, /art handling/i, /fine art/i, /conservation/i],
  "last-mile": [/last[- ]?mile/i, /\bev\b.*(fleet|charging|cargo)/i, /urban delivery/i, /zero[- ]?emission/i, /\bzev\b/i],
  disclosure: [/\bcsrd\b/i, /\bissb\b/i, /\bsfdr\b/i, /\btcfd\b/i, /disclosure/i, /reporting standard/i, /\bs2\b/i],
};

function assignTheme(r: Resource): ThemeKey | null {
  const themeCol = r.theme;
  if (themeCol && THEME_COLUMN_TO_KEY[themeCol]) {
    return THEME_COLUMN_TO_KEY[themeCol];
  }
  const text = `${r.title} ${r.note || ""} ${r.whyMatters || ""}`;
  for (const key of Object.keys(THEME_KEYWORDS) as ThemeKey[]) {
    for (const re of THEME_KEYWORDS[key]) {
      if (re.test(text)) return key;
    }
  }
  return null;
}

function deriveSeverity(r: Resource): Severity {
  // Honor migration-102 severity column when present.
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

// ── Date formatting ──

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

// ── Source-tier vocabulary (local copy of RegulationDetailSurface's
//    private TIER_DEFINITIONS / SourceTierBadge / SourceTierLegend, per
//    dispatch rule "create a local one matching the design" — the
//    regulations file does not export them) ──

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
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        {TIER_DEFINITIONS.map((t) => (
          <li key={t.tier} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <SourceTierBadge tier={t.tier} />
            <span style={{ color: "var(--color-text-primary)" }}>{t.label}</span>
          </li>
        ))}
        <li style={{ color: "var(--color-text-muted)", fontStyle: "italic", marginTop: 4 }}>
          T6 (aggregator) and T7 (unverified) are admin-reviewed and rarely surface here.
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

// ── Main surface ──

export function ResearchFindingDetailSurface({
  resource: r,
  related,
  relatedReason,
}: Props) {
  const severity = useMemo(() => deriveSeverity(r), [r]);
  const themeKey = useMemo(() => assignTheme(r), [r]);
  const [briefMode, setBriefMode] = useState<"short" | "full">("short");

  // Summary text. Short = the index-card summary (item.note ← summary
  // column). Full = the markdown brief if one exists; otherwise the same
  // short text (the toggle still renders so the affordance is consistent
  // with /regulations, but the full body is honest rather than padded).
  const shortText = r.note || r.whyMatters || r.whatIsIt || "";
  const fullText = r.fullBrief || shortText;
  const hasFull = !!r.fullBrief && r.fullBrief.length > shortText.length;

  // Methodology body. See "Methodology section choice" comment at top of
  // file — we prefer fullBrief, then whyMatters, then whatIsIt, then
  // summary. Omitted entirely when none of those have content.
  const methodologyBody =
    (r.whyMatters && r.whyMatters.length > 0 ? r.whyMatters : null) ||
    (r.whatIsIt && r.whatIsIt.length > 0 ? r.whatIsIt : null) ||
    null;

  const tier = r.sourceTier;
  const sourceName = r.sourceName || null;
  const sourceUrl = r.url || r.sourceUrl || null;

  return (
    <div className="px-9 pt-8 pb-16 max-w-[1280px] mx-auto">
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
          {/* Summary */}
          {shortText && (
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
                          color: active ? "var(--color-primary)" : "var(--color-text-secondary)",
                          borderBottom: `2px solid ${active ? "var(--color-primary)" : "transparent"}`,
                          cursor: "pointer",
                          background: "transparent",
                          border: 0,
                          borderBottomWidth: 2,
                          borderBottomStyle: "solid",
                          borderBottomColor: active ? "var(--color-primary)" : "transparent",
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
          )}

          {/* Methodology — only when at least one usable narrative field
              has content. Documented choice: the schema lacks a dedicated
              methodology column; this renders the "Why it matters" body
              as the closest available substitute, falling back to
              "What it is", and omits the section when nothing is
              available (Integrity Rule). */}
          {methodologyBody && (
            <BriefSection title="Methodology">
              <p
                style={{
                  fontSize: 14,
                  lineHeight: 1.7,
                  color: "var(--color-text-primary)",
                  margin: 0,
                  whiteSpace: "pre-wrap",
                }}
              >
                {methodologyBody}
              </p>
            </BriefSection>
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
        </aside>
      </div>
    </div>
  );
}
