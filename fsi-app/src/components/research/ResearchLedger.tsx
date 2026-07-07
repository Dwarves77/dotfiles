"use client";

/**
 * ResearchLedger — the redesigned /research index (Redesign TEMPLATE 06).
 *
 * Branches OFF the Template-02 banded-ledger archetype: it reuses the same
 * shell, §2 tokens, EditorialMasthead, inline Ask bar (open-ask-assistant
 * event), the tiles → filters → theme-band index pattern, the honest-state
 * frames and the "Clear filters" recovery. It restyles those pieces to the
 * "Pages - 06 Research" mock rather than rebuilding them.
 *
 * Shape (HANDOFF §6.6): severity tiles (0/1/0/38 pattern — Anton count,
 * colored bottom rule, clickable filters) → theme cards AS FILTERS (flexible
 * wrap, no dead cells, "N new" in Anton) → Ask bar → vertical chips +
 * 7d/30d/90d/All window → theme bands. Findings expand to "What it changes" /
 * "What it does not resolve" (labeled-analysis grammar, §3). Sources are
 * summarised in the right-rail coverage matrix, never a raw dump.
 *
 * COUNTS (binding): the masthead total + the ledger heading total read the
 * RPC bundle (getSurfaceCounts('research') → aggregates.totalItems, migration
 * 148/#173), verified-gated and fail-soft to the loaded-row count when the RPC
 * is absent. The severity tiles + theme "N new" counts are DERIVED from the
 * real loaded corpus (research severity + theme are client-classified fields,
 * not DB columns — no RPC classifies them, so deriving from real rows is the
 * only honest source; mock snapshot numbers are never hard-coded).
 *
 * EPISTEMIC / HONEST STATE: research_finding items reach this surface only when
 * provenance_status='verified' (server gate), so findings render as verified
 * facts — the tier chip binds the real source tier, clamped 1–7, and suppresses
 * itself when absent (never a chip without a backing field). The promoted key
 * figure has no structured backing column yet, so it renders as an honest
 * em-dash with a muted reason (§4) — never a fabricated number. Filters that can
 * yield zero always render a "Clear filters" recovery.
 */

import Link from "next/link";
import {
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { EditorialMasthead } from "@/components/ui/EditorialMasthead";
import type { WorkspaceAggregates } from "@/lib/data";

// ── Types (exported; consumed by research/page.tsx adapter) ──

export interface ResearchPipelineItem {
  id: string;
  title: string;
  summary: string;
  pipelineStage: string | null;
  transportModes: string[];
  jurisdictions: string[];
  sourceName: string | null;
  sourceUrl: string | null;
  addedDate: string | null;
  citationCount: number | null;
  lastCitedAt: string | null;
  baseTier: number | null;
  effectiveTier: number | null;
  biasTags: Array<{ dimension: "funding" | "methodology" | "stakeholder"; tag: string; confidence: number | null }>;
  owner: string | null;
  partnerFlagged: boolean;
  whatItChanges?: string | null;
  doesNotResolve?: string | null;
}

export interface ResearchSourceCoverageCellProp {
  transportMode: string;
  jurisdictionIso: string;
  sourceCount: number;
}

interface ResearchLedgerProps {
  items: ResearchPipelineItem[];
  aggregates?: WorkspaceAggregates;
  /** Verified workspace-wide total (row-count fallback when the RPC is absent). */
  total?: number;
  sourceCoverage?: ResearchSourceCoverageCellProp[];
}

// ── Severity vocabulary (research-relevance labels; client-classified) ──

type Severity = "action" | "cost" | "monitor" | "background";

const SEVERITY_ORDER: Severity[] = ["action", "cost", "monitor", "background"];

interface SevMeta {
  label: string;
  sub: string;
  /** Eyebrow + numeral hue (tile) and finding-edge/chip hue. */
  hue: string;
  /** Translucent chip border. */
  chipBd: string;
  /** 5px tile bottom-rule gradient. */
  gradient: string;
}

const SEV: Record<Severity, SevMeta> = {
  action: {
    label: "Action required",
    sub: "In your verticals, this week",
    hue: "var(--res-sev-action)",
    chipBd: "var(--res-sev-action-bd)",
    gradient: "var(--reg-band-immediate-strip)",
  },
  cost: {
    label: "Cost alert",
    sub: "Affecting margins",
    hue: "var(--res-sev-cost)",
    chipBd: "var(--res-sev-cost-bd)",
    gradient: "var(--reg-band-action-strip)",
  },
  monitor: {
    label: "Monitor",
    sub: "Trending themes",
    hue: "var(--res-sev-monitor)",
    chipBd: "var(--res-sev-monitor-bd)",
    gradient: "var(--reg-band-monitor-strip)",
  },
  background: {
    label: "Background",
    sub: "Awareness coverage",
    hue: "var(--res-sev-background)",
    chipBd: "var(--res-sev-background-bd)",
    gradient: "var(--reg-band-awareness-strip)",
  },
};

// ── Theme vocabulary (client-classified; column-first when it lands) ──

type ThemeKey =
  | "emissions"
  | "fuels"
  | "packaging"
  | "carbon"
  | "cold-chain"
  | "last-mile"
  | "disclosure";

interface Theme {
  key: ThemeKey;
  label: string;
  summary: string;
  /** Compact under-title descriptor shown on the band head row. */
  bandSub: string;
}

const THEMES: Theme[] = [
  {
    key: "emissions",
    label: "Emissions accounting",
    summary:
      "Methodology shifts and quantified frameworks that change how the workspace reports Scope 3.",
    bandSub: "methodology shifts · Scope 3 reporting",
  },
  {
    key: "fuels",
    label: "Fuels & SAF",
    summary:
      "Production capacity, feedstock constraints, price trajectory, pathway cost crossover.",
    bandSub: "fuel-mix planning · forward-buy decisions",
  },
  {
    key: "packaging",
    label: "Packaging & circular",
    summary:
      "PPWR reuse targets, recyclability standards, crate verification methods, and PFAS restrictions.",
    bandSub: "reuse targets · crate inventories",
  },
  {
    key: "carbon",
    label: "Carbon markets",
    summary:
      "EU ETS price trajectory, CBAM design, voluntary carbon market quality.",
    bandSub: "pass-through math · surcharge cost lines",
  },
  {
    key: "cold-chain",
    label: "Cold-chain & art",
    summary:
      "Climate-controlled crate materials, insulation lifecycle, refrigerant transitions, conservation-grade packaging.",
    bandSub: "crate materials · conservation packaging",
  },
  {
    key: "last-mile",
    label: "Last-mile electrification",
    summary:
      "EV cargo capacity, charging rollout, zero-emission cargo bay restrictions.",
    bandSub: "EV capacity · urban zones",
  },
  {
    key: "disclosure",
    label: "Disclosure regimes",
    summary:
      "CSRD omnibus revisions, ISSB S2 interpretations, and emerging disclosure frameworks.",
    bandSub: "tender language · verifier conversations",
  },
];

const THEME_KEYWORDS: Record<ThemeKey, RegExp[]> = {
  emissions: [/scope ?3/i, /ghg/i, /emission/i, /co2|carbon footprint|tco2e|mtco2e/i, /accounting/i, /lca/i, /lifecycle/i],
  fuels: [/\bsaf\b/i, /sustainable aviation fuel/i, /hydrogen/i, /ammonia/i, /\bhefa\b/i, /e-saf/i, /biofuel/i, /alternative fuel/i, /marine fuel/i, /\blng\b/i],
  packaging: [/packaging/i, /\bppwr\b/i, /reuse/i, /crate/i, /pfas/i, /recyclable/i, /circular/i, /pet resin/i],
  carbon: [/\beu ets\b/i, /\bets\b/i, /carbon market/i, /carbon price/i, /\bcbam\b/i, /\beua\b/i, /allowance/i, /carbon pricing/i],
  "cold-chain": [/cold[- ]?chain/i, /climate[- ]?control/i, /refrigerant/i, /art handling/i, /fine art/i, /conservation/i, /vip|vacuum insulated/i],
  "last-mile": [/last[- ]?mile/i, /\bev\b/i, /ehgv/i, /electric truck/i, /urban delivery/i, /zero[- ]?emission/i, /\bzev\b/i, /battery/i],
  disclosure: [/\bcsrd\b/i, /\bissb\b/i, /\bsfdr\b/i, /\btcfd\b/i, /disclosure/i, /reporting standard/i, /\bs2\b/i, /verifier/i],
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

function assignTheme(item: ResearchPipelineItem): ThemeKey | null {
  const themeCol = (item as unknown as { theme?: string }).theme;
  if (themeCol && THEME_COLUMN_TO_KEY[themeCol]) return THEME_COLUMN_TO_KEY[themeCol];
  const text = `${item.title} ${item.summary}`;
  for (const theme of THEMES) {
    for (const re of THEME_KEYWORDS[theme.key]) {
      if (re.test(text)) return theme.key;
    }
  }
  return null;
}

function deriveSeverity(item: ResearchPipelineItem): Severity {
  const text = `${item.title} ${item.summary}`.toLowerCase();
  if (/\b(action required|immediate|deadline|must file|cease)\b/.test(text)) return "action";
  if (/\b(cost|surcharge|pass[- ]?through|price|margin|\/kwh|tco)\b/.test(text)) return "cost";
  if (item.addedDate) {
    const age = Date.now() - new Date(item.addedDate).getTime();
    if (age >= 0 && age < 14 * 24 * 60 * 60 * 1000) return "monitor";
  }
  return "background";
}

// ── Vertical relevance (workspace verticals: live events + fine art) ──

const VERTICAL_KEYWORDS = [
  /fine art/i,
  /art handling/i,
  /live event/i,
  /live music/i,
  /art freight/i,
  /tour logistics/i,
  /conservation/i,
  /climate[- ]?control/i,
  /\bcrate\b/i,
];

function isVerticalRelevant(item: ResearchPipelineItem): boolean {
  const text = `${item.title} ${item.summary}`;
  return VERTICAL_KEYWORDS.some((re) => re.test(text));
}

// ── Fetch-error guard (never surface 403 / blocked fetch strings) ──

const FETCH_ERROR_PATTERNS = [
  /content unavailable/i,
  /\b403 forbidden\b/i,
  /access blocked/i,
  /could not be accessed/i,
  /source returned (\d{3}|error)/i,
];

function isFetchErrorItem(item: ResearchPipelineItem): boolean {
  const text = `${item.title} ${item.summary}`;
  return FETCH_ERROR_PATTERNS.some((re) => re.test(text));
}

// ── Window filter ──

type WindowKey = "7d" | "30d" | "90d" | "all";

function withinWindow(addedDate: string | null, w: WindowKey): boolean {
  if (w === "all") return true;
  if (!addedDate) return false;
  const d = new Date(addedDate);
  if (isNaN(d.getTime())) return false;
  const ageMs = Date.now() - d.getTime();
  const limits = { "7d": 7, "30d": 30, "90d": 90 };
  return ageMs >= 0 && ageMs <= limits[w] * 24 * 60 * 60 * 1000;
}

// ── Source coverage class buckets (right-rail matrix) ──

const COVERAGE_CLASSES = [
  { key: "peer-reviewed", label: "Peer-reviewed", domains: [/journal/i, /\bscience\b/i, /university/i, /\bmit\b/i] },
  { key: "think-tank", label: "Think tank", domains: [/\biea\b/i, /\birena\b/i, /\bipcc\b/i, /\bicct\b/i, /think tank/i, /carbon trust/i, /centre for/i] },
  { key: "quantified", label: "Quantified research", domains: [/drawdown/i, /quantified/i, /climate machine/i] },
  { key: "analytical", label: "Analytical press", domains: [/loadstar/i, /freightwaves/i, /\bedie\b/i, /greenbiz/i, /environmental finance/i, /splash247/i, /reuters sustainable/i] },
];

function classifySource(name: string | null): string {
  if (!name) return "analytical";
  for (const cls of COVERAGE_CLASSES) {
    for (const re of cls.domains) {
      if (re.test(name)) return cls.key;
    }
  }
  return "analytical";
}

// ── Date formatting ──

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatShortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`;
}

/** Tier badge clamp 1–7 (DO-NOT-REVERT: no raw tier values render). */
function clampTier(tier: number): number {
  return Math.max(1, Math.min(7, Math.round(tier)));
}

const VERTICALS: { key: string; label: string; broad?: boolean }[] = [
  { key: "live-events", label: "Live events" },
  { key: "fine-art", label: "Fine art" },
  { key: "luxury", label: "+ Luxury", broad: true },
  { key: "automotive", label: "+ Automotive", broad: true },
  { key: "humanitarian", label: "+ Humanitarian", broad: true },
];

const ASK_CHIPS = [
  "Charter Scope 3 factor",
  "SAF cost curve",
  "PPWR verifiable reuse",
  "EU ETS Phase 4 outlook",
];

const ROWS_COLLAPSED = 4;

export function ResearchLedger({ items, aggregates, total, sourceCoverage }: ResearchLedgerProps) {
  void sourceCoverage; // reserved: matrix currently derived from loaded rows

  // Enrich once. Fetch-error items rejected so they never surface.
  const enriched = useMemo(
    () =>
      items
        .filter((it) => !isFetchErrorItem(it))
        .map((it) => ({
          item: it,
          theme: assignTheme(it),
          severity: deriveSeverity(it),
          vertical: isVerticalRelevant(it),
        })),
    [items]
  );

  const [activeSeverity, setActiveSeverity] = useState<Severity | null>(null);
  const [activeTheme, setActiveTheme] = useState<ThemeKey | null>(null);
  const [verticalsOn, setVerticalsOn] = useState<Set<string>>(new Set());
  const [windowKey, setWindowKey] = useState<WindowKey>("all");
  const [openRows, setOpenRows] = useState<Record<string, boolean>>({});
  const [expandedThemes, setExpandedThemes] = useState<Record<string, boolean>>({});
  const [askValue, setAskValue] = useState("");
  const askRef = useRef<HTMLFormElement>(null);

  // Verticals gate (additive; default empty = show all). Mirrors the shipped
  // Sprint-3 semantics so thin vertical metadata never produces a false empty.
  const verticalPass = (vertical: boolean): boolean => {
    const narrowOn = verticalsOn.has("live-events") || verticalsOn.has("fine-art");
    if (!narrowOn) return true;
    if (vertical) return true;
    return VERTICALS.some((v) => v.broad && verticalsOn.has(v.key));
  };

  // Base population: window + verticals (NOT severity/theme) — keeps tiles and
  // theme "N new" counts stable filter targets.
  const base = useMemo(
    () => enriched.filter((e) => withinWindow(e.item.addedDate, windowKey) && verticalPass(e.vertical)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enriched, windowKey, verticalsOn]
  );

  const severityCounts = useMemo(() => {
    const c: Record<Severity, number> = { action: 0, cost: 0, monitor: 0, background: 0 };
    for (const e of base) c[e.severity]++;
    return c;
  }, [base]);

  const themeCounts = useMemo(() => {
    const c: Record<ThemeKey, number> = {} as Record<ThemeKey, number>;
    for (const t of THEMES) c[t.key] = 0;
    for (const e of base) if (e.theme) c[e.theme]++;
    return c;
  }, [base]);

  // Displayed = base narrowed by active severity + theme.
  const displayed = useMemo(
    () =>
      base.filter(
        (e) => (!activeSeverity || e.severity === activeSeverity) && (!activeTheme || e.theme === activeTheme)
      ),
    [base, activeSeverity, activeTheme]
  );

  const coverageCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const cls of COVERAGE_CLASSES) c[cls.key] = 0;
    for (const e of displayed) {
      const key = classifySource(e.item.sourceName);
      c[key] = (c[key] || 0) + 1;
    }
    return c;
  }, [displayed]);

  // Theme groups over displayed, recency-sorted.
  const groups = useMemo(() => {
    return THEMES.map((t) => {
      const rows = displayed
        .filter((e) => e.theme === t.key)
        .sort((a, b) => (new Date(b.item.addedDate || 0).getTime()) - (new Date(a.item.addedDate || 0).getTime()));
      return { theme: t, rows };
    }).filter((g) => g.rows.length > 0);
  }, [displayed]);

  const themesActive = useMemo(() => THEMES.filter((t) => themeCounts[t.key] > 0).length, [themeCounts]);

  const rpcTotal = aggregates?.totalItems ?? 0;
  const totalDisplay = rpcTotal > 0 ? rpcTotal : total ?? enriched.length;

  const filterActive = !!(activeSeverity || activeTheme);
  const parts: string[] = [];
  if (activeSeverity) parts.push(SEV[activeSeverity].label);
  if (activeTheme) parts.push(THEMES.find((t) => t.key === activeTheme)!.label);

  const ledgerTitle = filterActive
    ? `${displayed.length} of ${totalDisplay} findings · ${parts.join(" · ")}`
    : `${totalDisplay} findings · ${themesActive} ${themesActive === 1 ? "theme" : "themes"}`;

  const clearFilters = () => {
    setActiveSeverity(null);
    setActiveTheme(null);
  };

  const toggleVertical = (key: string) =>
    setVerticalsOn((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const submitAsk = (question: string) => {
    const q = question.trim();
    if (!q) return;
    const rect = askRef.current?.getBoundingClientRect();
    const anchor = rect ? { top: rect.bottom, left: rect.left, width: rect.width } : null;
    window.dispatchEvent(new CustomEvent("open-ask-assistant", { detail: { question: q, anchor } }));
  };

  // ── Shared inline styles ──
  const cardBorder = "1px solid var(--color-border)";
  const eyebrow: CSSProperties = {
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "var(--color-text-muted)",
  };

  const boldInk = { fontWeight: 800, color: "var(--color-text-primary)" } as const;
  const mastheadMeta = (
    <span>
      Horizon-scan content from peer-reviewed journals, think tanks, quantified-climate research, and
      named analytical press · <span style={boldInk}>{totalDisplay}</span> active findings this week ·{" "}
      <span style={boldInk}>{themesActive}</span> {themesActive === 1 ? "theme" : "themes"} active
    </span>
  );

  return (
    <>
      <EditorialMasthead title="Research" meta={mastheadMeta} />

      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 36px 80px" }}>
        {/* ── Severity tiles — clickable filters ── */}
        <div
          role="group"
          aria-label="Filter by research relevance"
          className="cl-res-tiles"
          style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, margin: "0 0 18px" }}
        >
          {SEVERITY_ORDER.map((key) => {
            const m = SEV[key];
            const count = severityCounts[key];
            const pressed = activeSeverity === key;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={pressed}
                aria-label={`${m.label} — ${count} findings; filter this relevance band`}
                onClick={() => setActiveSeverity(pressed ? null : key)}
                style={{
                  textAlign: "left",
                  background: "var(--color-bg-surface)",
                  border: `${pressed ? "2px" : "1px"} solid ${pressed ? m.hue : "var(--color-border)"}`,
                  borderRadius: 8,
                  overflow: "hidden",
                  display: "block",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  padding: 0,
                }}
              >
                <div style={{ padding: "14px 16px 10px" }}>
                  <p style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: m.hue, margin: "0 0 4px" }}>
                    {m.label}
                  </p>
                  <p
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 38,
                      lineHeight: 1,
                      color: m.hue,
                      margin: 0,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {count}
                  </p>
                  <p style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)", margin: "5px 0 0" }}>{m.sub}</p>
                </div>
                <div style={{ height: 5, background: m.gradient }} />
              </button>
            );
          })}
        </div>

        {/* ── Theme cards AS FILTERS — flexible wrap, no dead cells ── */}
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", margin: "0 0 18px" }}>
          {THEMES.filter((t) => themeCounts[t.key] > 0).map((t) => {
            const pressed = activeTheme === t.key;
            return (
              <button
                key={t.key}
                type="button"
                aria-pressed={pressed}
                aria-label={`${t.label} — ${themeCounts[t.key]} new findings; filter this theme`}
                onClick={() => setActiveTheme(pressed ? null : t.key)}
                style={{
                  fontFamily: "inherit",
                  textAlign: "left",
                  cursor: "pointer",
                  background: pressed ? "var(--color-bg-ai-strip)" : "var(--color-bg-surface)",
                  borderRadius: 8,
                  padding: "13px 16px",
                  flex: "1 1 260px",
                  border: `${pressed ? "2px" : "1px"} solid ${pressed ? "var(--color-primary)" : "var(--color-border)"}`,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.11em", textTransform: "uppercase", color: "var(--brass)" }}>
                    {t.label}
                  </span>
                  <span style={{ fontFamily: "var(--font-display)", fontSize: 20, color: "var(--color-primary)", whiteSpace: "nowrap" }}>
                    {themeCounts[t.key]} new
                  </span>
                </div>
                <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: "4px 0 0", textAlign: "left", maxWidth: "34ch" }}>
                  {t.summary}
                </p>
              </button>
            );
          })}
        </div>

        {/* ── Ask bar (identical block; open-ask-assistant event) ── */}
        <div style={{ background: "var(--color-bg-surface)", border: cardBorder, borderRadius: 8, padding: "14px 16px", margin: "0 0 18px" }}>
          <form
            ref={askRef}
            onSubmit={(e) => {
              e.preventDefault();
              submitAsk(askValue);
              setAskValue("");
            }}
            style={{ display: "flex", gap: 10, alignItems: "center" }}
          >
            <input
              value={askValue}
              onChange={(e) => setAskValue(e.target.value)}
              aria-label="Ask anything about research"
              placeholder="Ask anything about research, e.g. What findings affect my FY26 Scope 3 baseline?"
              style={{
                flex: 1,
                minWidth: 0,
                fontFamily: "inherit",
                fontSize: 13.5,
                padding: "11px 14px",
                border: "1px solid var(--color-border-medium)",
                borderRadius: 6,
                outline: "none",
                background: "var(--color-bg-base)",
                color: "var(--color-text-primary)",
              }}
            />
            <button
              type="submit"
              style={{
                fontFamily: "inherit",
                fontSize: 12.5,
                fontWeight: 800,
                padding: "11px 20px",
                borderRadius: 6,
                border: "1px solid var(--color-primary)",
                background: "var(--color-primary)",
                color: "var(--color-text-inverse, #fff)",
                cursor: "pointer",
              }}
            >
              Ask
            </button>
          </form>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0 0" }}>
            {ASK_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => setAskValue(chip)}
                style={{
                  fontFamily: "inherit",
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: "var(--color-text-secondary)",
                  background: "var(--color-bg-base)",
                  border: "1px solid var(--color-border-medium)",
                  borderRadius: 999,
                  padding: "6px 13px",
                  cursor: "pointer",
                }}
              >
                {chip}
              </button>
            ))}
          </div>
        </div>

        {/* ── Verticals + window controls ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap", margin: "0 0 22px" }}>
          <div role="group" aria-label="Filter by workspace vertical" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={eyebrow}>Verticals</span>
            {VERTICALS.map((v) => {
              const on = verticalsOn.has(v.key);
              return (
                <button
                  key={v.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleVertical(v.key)}
                  style={{
                    fontFamily: "inherit",
                    fontSize: 11.5,
                    fontWeight: on ? 800 : 600,
                    color: on ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                    background: on ? "var(--color-bg-raised)" : "var(--color-bg-surface)",
                    border: `1px solid ${on ? "var(--color-text-primary)" : "var(--color-border-medium)"}`,
                    borderRadius: 999,
                    padding: "6px 13px",
                    cursor: "pointer",
                  }}
                >
                  {v.label}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={eyebrow}>Window</span>
            <div role="group" aria-label="Time window" style={{ display: "flex", border: "1px solid var(--color-border-medium)", borderRadius: 6, overflow: "hidden" }}>
              {(["7d", "30d", "90d", "all"] as WindowKey[]).map((w) => {
                const on = windowKey === w;
                return (
                  <button
                    key={w}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setWindowKey(w)}
                    style={{
                      fontFamily: "inherit",
                      fontSize: 11.5,
                      fontWeight: on ? 800 : 600,
                      padding: "7px 14px",
                      border: "none",
                      background: on ? "var(--color-text-primary)" : "var(--color-bg-surface)",
                      color: on ? "var(--color-bg-surface)" : "var(--color-text-secondary)",
                      cursor: "pointer",
                    }}
                  >
                    {w === "all" ? "All" : w}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Ledger heading ── */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 16,
            borderBottom: "2px solid var(--color-text-primary)",
            padding: "0 0 8px",
            margin: "0 0 16px",
            flexWrap: "wrap",
          }}
        >
          <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 400, fontSize: 26, letterSpacing: "0.02em", textTransform: "uppercase", margin: 0 }}>
            {ledgerTitle}
          </h2>
          {filterActive ? (
            <button
              type="button"
              onClick={clearFilters}
              style={{ fontFamily: "inherit", fontSize: 11.5, fontWeight: 800, color: "var(--color-primary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              Clear filters ✕
            </button>
          ) : (
            <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>
              Click a tile or theme to filter
            </span>
          )}
        </div>

        {/* ── Grid: theme bands + right rail ── */}
        <div className="cl-res-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 280px", gap: 24, alignItems: "start" }}>
          {/* Theme-banded findings */}
          <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 18 }}>
            {enriched.length === 0 ? (
              <PendingFrame
                headline="No findings to show yet"
                body="Verified research findings appear here once the workspace has classified, source-grounded horizon-scan coverage. Nothing is hidden — there is simply no verified finding on this surface right now."
              />
            ) : displayed.length === 0 ? (
              <PendingFrame
                headline="No findings match this filter"
                body="Widen the window or clear the severity and theme filters."
                action={{ label: "Clear filters", onClick: clearFilters }}
              />
            ) : (
              groups.map((g) => {
                const expanded = !!expandedThemes[g.theme.key];
                const shown = expanded ? g.rows : g.rows.slice(0, ROWS_COLLAPSED);
                const hasMore = g.rows.length > ROWS_COLLAPSED;
                return (
                  <div key={g.theme.key}>
                    {/* Band head */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "9px 16px",
                        background: "var(--color-bg-raised)",
                        border: cardBorder,
                        borderRadius: "8px 8px 0 0",
                        borderBottom: "none",
                      }}
                    >
                      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-text-primary)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        {g.theme.label}
                        <span style={{ fontWeight: 600, letterSpacing: "0.02em", textTransform: "none", color: "var(--color-text-muted)" }}>{g.theme.bandSub}</span>
                      </span>
                      <span style={{ fontFamily: "var(--font-display)", fontSize: 16, color: "var(--color-primary)" }}>{g.rows.length}</span>
                    </div>
                    {/* Band body */}
                    <div style={{ border: cardBorder, borderRadius: "0 0 8px 8px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
                      {shown.map((e) => (
                        <FindingRow
                          key={e.item.id}
                          item={e.item}
                          severity={e.severity}
                          open={!!openRows[e.item.id]}
                          onToggle={() => setOpenRows((prev) => ({ ...prev, [e.item.id]: !prev[e.item.id] }))}
                        />
                      ))}
                      <button
                        type="button"
                        aria-expanded={hasMore ? expanded : undefined}
                        onClick={() => hasMore && setExpandedThemes((prev) => ({ ...prev, [g.theme.key]: !prev[g.theme.key] }))}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "11px 18px",
                          background: "var(--color-bg-surface)",
                          border: "none",
                          borderTop: "1px solid var(--color-border-subtle)",
                          cursor: hasMore ? "pointer" : "default",
                          fontFamily: "inherit",
                          width: "100%",
                          textAlign: "left",
                        }}
                      >
                        <span style={{ fontSize: 12, fontWeight: 800, color: "var(--color-primary)" }}>
                          {hasMore ? (expanded ? "Show fewer" : `All ${g.rows.length} in this theme →`) : "All findings shown"}
                        </span>
                        <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>sorted by recency</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Right rail */}
          <div className="cl-res-rail" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <RailCard>
              <p style={{ ...eyebrow, letterSpacing: "0.13em", margin: "0 0 10px" }}>Source coverage matrix</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {COVERAGE_CLASSES.map((cls) => {
                  const n = coverageCounts[cls.key] || 0;
                  return (
                    <div key={cls.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{cls.label}</span>
                      <span style={{ fontFamily: "var(--font-display)", fontSize: 16, color: n > 0 ? "var(--reg-band-action)" : "var(--color-text-muted)" }}>{n}</span>
                    </div>
                  );
                })}
              </div>
              <p style={{ fontSize: 11, color: "var(--color-text-muted)", lineHeight: 1.55, margin: "10px 0 0" }}>
                Distribution across the source classes over the findings shown. Discriminator is analytical depth, not publication form.
              </p>
            </RailCard>
            <RailCard>
              <p style={{ ...eyebrow, letterSpacing: "0.13em", margin: "0 0 8px" }}>Methodology</p>
              <p style={{ fontSize: 11.5, lineHeight: 1.6, color: "var(--color-text-secondary)", margin: 0 }}>
                Findings render with editorial provenance, source tier, bias tags, citation count, and recency. Each research brief follows the 6-section format; open any finding to read the structured detail.
              </p>
            </RailCard>
          </div>
        </div>

        <style>{`
          .cl-res-row-hit:hover { opacity: 0.9; }
          @media (max-width: 1200px) {
            .cl-res-grid { grid-template-columns: minmax(0,1fr) !important; }
            .cl-res-rail { flex-direction: row !important; flex-wrap: wrap !important; }
            .cl-res-rail > div { flex: 1 1 260px; }
          }
          @media (max-width: 720px) {
            .cl-res-tiles { grid-template-columns: repeat(2, 1fr) !important; }
          }
          @media (max-width: 440px) {
            .cl-res-tiles { grid-template-columns: 1fr !important; }
          }
        `}</style>
      </div>
    </>
  );
}

// ── Finding row ──

function FindingRow({
  item,
  severity,
  open,
  onToggle,
}: {
  item: ResearchPipelineItem;
  severity: Severity;
  open: boolean;
  onToggle: () => void;
}) {
  const m = SEV[severity];
  const tierRaw = item.effectiveTier ?? item.baseTier;
  const tier = typeof tierRaw === "number" && Number.isInteger(tierRaw) && tierRaw >= 1 && tierRaw <= 7 ? clampTier(tierRaw) : null;
  const when = formatShortDate(item.addedDate);

  return (
    <div style={{ background: "var(--color-bg-surface)", borderLeft: `3px solid ${m.hue}`, borderBottom: "1px solid var(--color-border-subtle)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", padding: "14px 18px" }}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="cl-res-row-hit"
          style={{ flex: 1, minWidth: 0, textAlign: "left", fontFamily: "inherit", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
        >
          <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap", margin: "0 0 5px" }}>
            <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: m.hue, border: `1px solid ${m.chipBd}`, borderRadius: 4, padding: "2px 8px" }}>
              {m.label}
            </span>
            {item.sourceName && (
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", color: "var(--brass)" }}>
                {item.sourceName}
                {tier != null && <> · T{tier}</>}
              </span>
            )}
            {when && <span style={{ fontSize: 10.5, color: "var(--color-text-muted)" }}>{when}</span>}
          </div>
          <p style={{ fontSize: 15, fontWeight: 800, margin: 0, lineHeight: 1.35, color: "var(--color-text-primary)" }}>{item.title}</p>
          {item.summary && (
            <p style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--color-text-secondary)", margin: "5px 0 0", maxWidth: "96ch" }}>{item.summary}</p>
          )}
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
          {/* Key figure — honest em-dash: no structured key-figure column backs
              this slot yet, so it renders muted with a reason (§4), never a
              fabricated number. Lights up when the field ships. */}
          <div style={{ textAlign: "right", minWidth: 96 }}>
            <p style={{ fontFamily: "var(--font-display)", fontSize: 26, lineHeight: 1, color: "var(--color-text-muted)", margin: 0, whiteSpace: "nowrap" }}>—</p>
            <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--color-text-muted)", margin: "4px 0 0", whiteSpace: "nowrap" }}>
              no key figure yet
            </p>
          </div>
          <Link
            href={`/research/${encodeURIComponent(item.id)}`}
            style={{ fontSize: 11.5, fontWeight: 800, padding: "7px 14px", borderRadius: 6, border: "1px solid var(--color-primary)", background: "var(--color-primary)", color: "var(--color-text-inverse, #fff)", textDecoration: "none", whiteSpace: "nowrap" }}
          >
            Full analysis →
          </Link>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-label={open ? "Collapse finding" : "Expand finding"}
            title={open ? "Collapse" : "Expand"}
            style={{ fontFamily: "inherit", cursor: "pointer", fontSize: 18, fontWeight: 700, lineHeight: 1, padding: "6px 8px", border: "none", background: "transparent", color: "var(--color-primary)" }}
          >
            {open ? "–" : "+"}
          </button>
        </div>
      </div>
      {open && (
        <div style={{ borderTop: "1px solid var(--color-border-subtle)", padding: "14px 18px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div style={{ borderLeft: "3px solid var(--color-text-primary)", padding: "2px 0 2px 12px" }}>
            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-text-primary)", display: "block", margin: "0 0 4px" }}>
              Our analysis · what it changes
            </span>
            {item.whatItChanges ? (
              <p style={{ fontSize: 11.5, lineHeight: 1.6, margin: 0 }}>{item.whatItChanges}</p>
            ) : (
              <p style={{ fontSize: 11.5, lineHeight: 1.6, margin: 0, color: "var(--color-text-muted)" }}>
                — not yet extracted for this finding
              </p>
            )}
          </div>
          <div style={{ borderLeft: "3px solid var(--destructive-quiet)", padding: "2px 0 2px 12px" }}>
            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--destructive-quiet)", display: "block", margin: "0 0 4px" }}>
              What it does not resolve
            </span>
            {item.doesNotResolve ? (
              <p style={{ fontSize: 11.5, lineHeight: 1.6, margin: 0 }}>{item.doesNotResolve}</p>
            ) : (
              <p style={{ fontSize: 11.5, lineHeight: 1.6, margin: 0, color: "var(--color-text-muted)" }}>
                — not yet extracted for this finding
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function RailCard({ children }: { children: ReactNode }) {
  return (
    <div style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border)", borderRadius: 8, padding: "14px 16px" }}>{children}</div>
  );
}

function PendingFrame({
  headline,
  body,
  action,
}: {
  headline: string;
  body: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div style={{ border: "1px dashed rgba(0,0,0,0.25)", background: "var(--color-bg-base)", borderRadius: 8, padding: "22px 20px" }}>
      <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--brass)", margin: "0 0 6px" }}>Nothing to show</p>
      <p style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)", margin: "0 0 6px" }}>{headline}</p>
      <p style={{ fontSize: 12.5, color: "var(--color-text-secondary)", lineHeight: 1.55, margin: 0 }}>{body}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          style={{ marginTop: 12, fontFamily: "inherit", fontSize: 12, fontWeight: 800, color: "var(--color-primary)", background: "none", border: "1px solid var(--color-primary)", borderRadius: 6, padding: "7px 14px", cursor: "pointer" }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
