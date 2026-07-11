"use client";

/**
 * RegulationDetailSurface — client subcomponent for /regulations/[slug].
 *
 * REDESIGN T03 (feat/redesign-t03-regulation-detail): the presentation
 * layer is rebuilt to the approved mock
 * "Pages - 03 Regulation Detail.dc.html" (HANDOFF §6.2). Exact hex/px are
 * lifted from that mock's inline styles into the `C` palette + literals
 * below (HANDOFF §8.1: lift exact hex, do not substitute Tailwind
 * defaults). Structure:
 *   Hero (gradient strip omitted — AppShell already supplies the shell
 *     strip; see DESIGN-DEVIATIONS D2) → breadcrumb → title + deck +
 *     chips (priority bullet chip + type + tier) + actions (Export brief
 *     solid orange / Share / Watch) → tab strip (3px orange underline)
 *   Ask bar (page-scoped chips) → tab bodies.
 *   Summary: Short/Full toggle → short summary card → impact assessment →
 *     interactive milestone timeline → accordion sections (ALL OPEN by
 *     default; closed shows a one-line italic summary) → connected
 *     intelligence.
 *   Sources tab: STRUCTURED rows with clamped tier chips (never a raw
 *     "## Sources" dump — the #172 stripSources pattern).
 *
 * Data binding is unchanged — every value comes from the real Resource /
 * parsed full_brief; nothing is hard-coded from the mock's snapshot.
 * DO-NOT-REVERT invariants preserved: tier CLAMP 1-7, structured sources,
 * honest empty states, epistemic chips bound to real fields, non-verified
 * content never fabricated.
 */

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { ImpactScores } from "@/components/resource/ImpactScores";
import { IntelligenceBrief } from "@/components/resource/IntelligenceBrief";
import { AiPromptBar } from "@/components/ui/AiPromptBar";
import { WatchButton } from "@/components/ui/WatchButton";
import { AffectedLanesCard } from "@/components/regulations/AffectedLanesCard";
import { OwnerTeamCard } from "@/components/regulations/OwnerTeamCard";
import { LinkedItemsCard } from "@/components/regulations/LinkedItemsCard";
import { scoreResource, matchResourceSector } from "@/lib/scoring";
import {
  extractOperationalBriefing,
  extractSeverityLabel,
  type ExtractedSection,
  type SeverityLabel,
} from "@/lib/agent/extract-sections";
import {
  extractRegulationSections,
  type SourceEntry,
} from "@/lib/agent/extract-regulation-sections";
import {
  JURISDICTIONS,
  PRIORITY_DISPLAY_LABEL_SHORT,
  ALL_SECTORS,
  type PriorityKey,
} from "@/lib/constants";
import { isoToDisplayLabel } from "@/lib/jurisdictions/iso";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import type {
  Resource,
  ChangeLogEntry,
  Dispute,
  Supersession,
  TimelineEntry,
} from "@/types/resource";
import type { IntelligenceItemSectionRow } from "@/lib/supabase-server";
import { RegulationSections } from "@/components/regulations/sections/RegulationSections";
import { PriorityDropdown } from "@/components/regulations/PriorityDropdown";
import { useResourceStore } from "@/stores/resourceStore";

// ── Palette — lifted verbatim from the approved mock inline styles ──────
const C = {
  page: "#FAFAF8",
  card: "#FFFFFF",
  plate: "#F5F2EE",
  tint: "#FFF7F0",
  ink: "#1A1A1A",
  ink2: "#5A6B67",
  muted: "#7A6E6C",
  accent: "#E8610A",
  accentHover: "#D05509",
  blue: "#2563EB",
  sevCritical: "#DC2626",
  sevHigh: "#E8610A",
  sevMod: "#CA8A04",
  sevLow: "#16A34A",
  signal: "#B45309",
  quiet: "#9A3412",
  brass: "#8A6A2A",
  hair: "rgba(0,0,0,0.12)",
  hairSoft: "rgba(0,0,0,0.06)",
  hairStrong: "rgba(0,0,0,0.18)",
} as const;

interface Props {
  resource: Resource;
  changelog: ChangeLogEntry[];
  dispute: Dispute | null;
  supersessions: Supersession[];
  xrefIds: string[];
  refByIds: string[];
  resourceLookup: Record<string, { id: string; title: string; priority: string }>;
  sections?: IntelligenceItemSectionRow[];
  /** Breadcrumb middle segment, e.g. "Global · IMO". Computed on the server
   *  from jurisdiction + publisher. Falls back to the jurisdiction label. */
  groupLabel?: string;
  /** Hero deck sub-line, e.g. "IMO MEPC · adopted 7 July 2023 · in force". */
  deck?: string;
}

type TabKey = "summary" | "exposure" | "calculator" | "timeline" | "sources";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "summary", label: "Summary" },
  { key: "exposure", label: "Exposure" },
  { key: "calculator", label: "Penalty schedule" },
  { key: "timeline", label: "Timeline" },
  { key: "sources", label: "Sources" },
];

// Priority → hero severity tone (mock: "● Immediate" is red critical).
const PRIORITY_TONE: Record<
  string,
  { bg: string; bd: string; color: string; label: string }
> = {
  CRITICAL: { bg: "#FEF2F2", bd: "#FECACA", color: C.sevCritical, label: PRIORITY_DISPLAY_LABEL_SHORT.CRITICAL },
  HIGH: { bg: "#FFF7ED", bd: "#FED7AA", color: C.sevHigh, label: PRIORITY_DISPLAY_LABEL_SHORT.HIGH },
  MODERATE: { bg: "#FEFCE8", bd: "#FEF08A", color: C.sevMod, label: PRIORITY_DISPLAY_LABEL_SHORT.MODERATE },
  LOW: { bg: "#F0FDF4", bd: "#BBF7D0", color: C.sevLow, label: PRIORITY_DISPLAY_LABEL_SHORT.LOW },
};

const SEVERITY_LABEL_TONE: Record<SeverityLabel, string> = {
  "ACTION REQUIRED": C.sevCritical,
  "COST ALERT": C.sevHigh,
  "WINDOW CLOSING": C.sevCritical,
  "COMPETITIVE EDGE": C.sevLow,
  MONITORING: C.ink2,
};

/** Clamp any tier value to the customer-facing 1-7 range (DO-NOT-REVERT). */
function clampTier(n: number): number {
  return Math.min(7, Math.max(1, Math.round(n)));
}

export function RegulationDetailSurface({
  resource: r,
  changelog,
  dispute,
  supersessions,
  xrefIds,
  refByIds,
  resourceLookup,
  sections = [],
  groupLabel,
  deck,
}: Props) {
  const [tab, setTab] = useState<TabKey>("summary");

  const userRole = useWorkspaceStore((s) => s.userRole);
  const isAdminViewer = userRole === "owner" || userRole === "admin";
  const showIntegrityBanner =
    isAdminViewer && r.agentIntegrityFlag === true && !!r.agentIntegrityPhrase;

  const tone = PRIORITY_TONE[r.priority] || PRIORITY_TONE.MODERATE;
  const modes = (r.modes && r.modes.length > 0 ? r.modes : [r.cat]).filter(Boolean);

  const jurisdictionLabels =
    r.jurisdictionIso && r.jurisdictionIso.length > 0
      ? r.jurisdictionIso.map(isoToDisplayLabel)
      : r.jurisdiction
      ? [JURISDICTIONS.find((j) => j.id === r.jurisdiction)?.label || r.jurisdiction]
      : ["Global"];
  const jurisLabel = jurisdictionLabels.join(" · ");
  const crumbGroup = groupLabel || jurisLabel;
  const crumbItem = r.legalInstrument || r.title;

  return (
    <div style={{ padding: "0 0 90px", fontFamily: "var(--font-sans)", color: C.ink }}>
      {/* ── Hero header ── */}
      <header style={{ background: C.card, borderBottom: `1px solid ${C.hair}` }}>
        <div style={{ padding: "18px 36px 0" }}>
          {/* Breadcrumb (replaces the VOL eyebrow on detail pages) */}
          <nav
            aria-label="Breadcrumb"
            style={{ fontSize: 12, margin: "0 0 12px", display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}
          >
            <Link href="/regulations" prefetch={false} style={{ color: C.ink2, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}>
              Regulations
            </Link>
            <span style={{ color: C.muted }}>/</span>
            <span style={{ color: C.ink2, fontWeight: 600, whiteSpace: "nowrap" }}>{crumbGroup}</span>
            <span style={{ color: C.muted }}>/</span>
            <span
              style={{ color: C.ink, fontWeight: 800, whiteSpace: "nowrap", maxWidth: "48ch", overflow: "hidden", textOverflow: "ellipsis" }}
              title={crumbItem}
            >
              {crumbItem}
            </span>
          </nav>

          <div style={{ display: "flex", justifyContent: "space-between", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ maxWidth: "86ch" }}>
              <h1
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 400,
                  fontSize: 34,
                  lineHeight: 1.08,
                  letterSpacing: "0.02em",
                  textTransform: "uppercase",
                  margin: 0,
                  color: C.ink,
                }}
              >
                {r.title}
              </h1>
              {deck && (
                <p style={{ fontSize: 13, color: C.ink2, margin: "10px 0 0", lineHeight: 1.6 }}>{deck}</p>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                {/* Priority bullet chip — interactive dropdown (retag/dismiss) */}
                <HeroPriorityDropdown currentPriority={r.priority as PriorityKey} itemId={r.id} />
                {r.type && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: "0.09em",
                      textTransform: "uppercase",
                      color: C.ink2,
                      border: `1px solid ${C.hairStrong}`,
                      borderRadius: 4,
                      padding: "5px 11px",
                    }}
                  >
                    {r.type.replace(/_/g, " ")}
                  </span>
                )}
                {typeof r.sourceTier === "number" && (
                  <TierBadge tier={r.sourceTier} />
                )}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {(r.fullBrief || r.url) && (
                  <ActionButton primary onClick={() => exportBriefAsMarkdown(r)}>
                    Export brief
                  </ActionButton>
                )}
                <ActionButton onClick={() => shareCurrentRegulation(r)}>Share</ActionButton>
                <WatchButton itemType="reg" itemId={String(r.id)} palette={{ accent: C.accent, hairStrong: C.hairStrong, tint: C.tint, card: C.card, ink: C.ink }} />
              </div>
            </div>
          </div>

          {/* Tab strip */}
          <div style={{ display: "flex", gap: 2, margin: "18px 0 0", overflowX: "auto" }} role="tablist" aria-label="Regulation views">
            {TABS.map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.key)}
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: 12.5,
                    fontWeight: active ? 800 : 600,
                    padding: "10px 18px",
                    whiteSpace: "nowrap",
                    border: 0,
                    borderBottom: `3px solid ${active ? C.accent : "transparent"}`,
                    background: "transparent",
                    color: active ? C.ink : C.ink2,
                    cursor: "pointer",
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Admin integrity banner (admins only) */}
      {showIntegrityBanner && (
        <div style={{ padding: "16px 36px 0" }}>
          <IntegrityBanner phrase={r.agentIntegrityPhrase!} />
        </div>
      )}

      {/* Ask bar — page-scoped */}
      <div style={{ padding: "22px 36px 0" }}>
        <AiPromptBar
          placeholder={`Ask anything about ${r.title} — e.g. what does this mean for my workspace?`}
          chips={[
            "What does this mean for me?",
            "When does this hit force?",
            "Who's affected in my supply chain?",
          ]}
        />
      </div>

      {/* ── Body: main + meta rail ── */}
      <div
        id="cl-detail-grid"
        style={{
          padding: "22px 36px 0",
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) 264px",
          gap: 24,
          alignItems: "start",
        }}
      >
        <style>{`
          @media (max-width: 1100px) {
            #cl-detail-grid { grid-template-columns: minmax(0,1fr) !important; }
            #cl-meta-rail { flex-direction: row !important; flex-wrap: wrap !important; }
            #cl-meta-rail > div { flex: 1 1 240px; }
          }
        `}</style>

        <main style={{ minWidth: 0 }}>
          {tab === "summary" && (
            <SummaryTab r={r} changelog={changelog} dispute={dispute} sections={sections} onOpenTimeline={() => setTab("timeline")} />
          )}
          {tab === "exposure" && <ExposureTab resource={r} jurisdictionLabels={jurisdictionLabels} />}
          {tab === "calculator" && <PenaltyTab resource={r} />}
          {tab === "timeline" && <TimelineTab resource={r} />}
          {tab === "sources" && <SourcesTab resource={r} />}
        </main>

        {/* Meta rail */}
        <div id="cl-meta-rail" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <AtAGlanceCard r={r} jurisLabel={jurisLabel} modes={modes} tone={tone} />
          <AffectedLanesCard resource={r} />
          <OwnerTeamCard resource={r} />
          <LinkedItemsCard
            xrefIds={xrefIds}
            refByIds={refByIds}
            supersessions={supersessions}
            selfId={r.id}
            resourceLookup={resourceLookup}
          />
        </div>
      </div>
    </div>
  );
}

// ── Hero primitives ────────────────────────────────────────────────────

function ActionButton({
  children,
  primary,
  onClick,
}: {
  children: React.ReactNode;
  primary?: boolean;
  onClick?: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        fontFamily: "var(--font-sans)",
        fontSize: 11.5,
        fontWeight: primary ? 800 : 700,
        padding: "8px 16px",
        borderRadius: 6,
        border: `1px solid ${primary ? (hover ? C.accentHover : C.accent) : hover ? C.accent : C.hairStrong}`,
        background: primary ? (hover ? C.accentHover : C.accent) : C.card,
        color: primary ? "#fff" : hover ? C.accent : C.ink,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function TierBadge({ tier }: { tier: number }) {
  const t = clampTier(tier);
  // Blue solid for primary tiers (verified provenance colour), dark for
  // mid, dashed for aggregator/unverified. Always clamped; never raw.
  let style: React.CSSProperties;
  if (t <= 2) style = { background: C.blue, color: "#fff" };
  else if (t <= 5) style = { background: C.ink, color: "#fff" };
  else style = { border: `1px dashed rgba(0,0,0,0.3)`, color: C.muted };
  return (
    <span
      title={`Tier ${t} — provenance, never urgency`}
      style={{ fontSize: 10, fontWeight: 800, padding: "5px 10px", borderRadius: 4, ...style }}
    >
      T{t}
    </span>
  );
}

function IntegrityBanner({ phrase }: { phrase: string }) {
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
        background: "rgba(217,119,6,0.08)",
        border: "1px solid rgba(217,119,6,0.3)",
        borderLeft: `4px solid ${C.sevHigh}`,
        borderRadius: 8,
        padding: "12px 16px",
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      <AlertTriangle size={18} style={{ color: C.sevHigh, flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
      <div>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.sevHigh, marginBottom: 4 }}>
          Agent flagged integrity concern
        </div>
        <div style={{ color: C.ink }}>
          The agent self-flagged this brief with the phrase{" "}
          <code style={{ background: "rgba(217,119,6,0.12)", border: "1px solid rgba(217,119,6,0.25)", borderRadius: 3, padding: "1px 6px", fontSize: 12 }}>
            {phrase}
          </code>
          . Resolve in{" "}
          <a href="/admin#integrity-flags" style={{ color: C.sevHigh, fontWeight: 700, textDecoration: "underline" }}>
            /admin → Integrity flags
          </a>
          .
        </div>
      </div>
    </div>
  );
}

// ── Reusable card + accordion ──────────────────────────────────────────

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.hair}`, borderRadius: 8, ...style }}>{children}</div>
  );
}

function PlateEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.13em", textTransform: "uppercase", color: C.muted, margin: "0 0 10px" }}>
      {children}
    </p>
  );
}

/** Accordion — mock language. ALL OPEN by default per platform doctrine
 *  for this reader surface (HANDOFF §6.2 "ALL OPEN by default"). When
 *  closed, a one-line italic summary is shown in the header. +/− toggle. */
function Accordion({
  title,
  count,
  summary,
  children,
  source,
}: {
  title: string;
  count?: string;
  summary: string;
  children: React.ReactNode;
  source?: string;
}) {
  const [open, setOpen] = useState(true);
  return (
    <Card style={{ overflow: "hidden", marginBottom: 14 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          width: "100%",
          textAlign: "left",
          fontFamily: "var(--font-sans)",
          padding: "12px 20px",
          background: C.plate,
          border: 0,
          borderBottom: `1px solid ${C.hairSoft}`,
          cursor: "pointer",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 14,
        }}
      >
        <span style={{ minWidth: 0 }}>
          <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: C.ink }}>
            {title}
            {count && (
              <span style={{ fontWeight: 700, color: C.muted, letterSpacing: "0.02em", textTransform: "none" }}> · {count}</span>
            )}
          </span>
          {!open && (
            <span style={{ display: "block", fontSize: 11.5, fontStyle: "italic", color: C.muted, fontWeight: 500, letterSpacing: "normal", textTransform: "none", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {summary}
            </span>
          )}
        </span>
        <span aria-hidden style={{ fontSize: 18, fontWeight: 700, lineHeight: 1, color: C.accent, flexShrink: 0 }}>
          {open ? "–" : "+"}
        </span>
      </button>
      {open && (
        <>
          <div style={{ padding: "16px 20px" }}>{children}</div>
          {source && (
            <p style={{ fontSize: 11.5, color: C.muted, margin: 0, padding: "10px 20px", borderTop: `1px solid ${C.hairSoft}` }}>
              {source}
            </p>
          )}
        </>
      )}
    </Card>
  );
}

// ── SUMMARY TAB ────────────────────────────────────────────────────────

function SummaryTab({
  r,
  changelog,
  dispute,
  sections,
  onOpenTimeline,
}: {
  r: Resource;
  changelog: ChangeLogEntry[];
  dispute: Dispute | null;
  sections: IntelligenceItemSectionRow[];
  onOpenTimeline: () => void;
}) {
  const [mode, setMode] = useState<"short" | "full">("short");

  const briefing = useMemo(
    () => (r.fullBrief ? extractOperationalBriefing(r.fullBrief) : null),
    [r.fullBrief]
  );
  const hasFull = !!(
    briefing &&
    (briefing.immediateAction?.hasContent ||
      briefing.whatItIsWhyItApplies?.hasContent ||
      briefing.complianceChain?.hasContent)
  );

  const shortText = r.whatIsIt || r.note || "";
  const impact = r.impactScores ?? scoreResource(r);

  return (
    <>
      {/* Short/Full toggle */}
      <div style={{ display: "flex", gap: 2, margin: "0 0 14px", alignItems: "center" }}>
        <Segment active={mode === "short"} side="left" onClick={() => setMode("short")}>
          Short summary
        </Segment>
        <Segment active={mode === "full"} side="right" onClick={() => setMode("full")} disabled={!hasFull}>
          Full summary
        </Segment>
        <span style={{ marginLeft: 12, fontSize: 11, color: C.muted }}>
          {mode === "short"
            ? "Essentials only — switch to Full for the compliance chain, reporting, and workstreams."
            : "Complete brief"}
        </span>
      </div>

      {/* Short summary card */}
      {shortText && (
        <Card style={{ borderLeft: `3px solid ${C.accent}`, padding: "16px 20px", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "baseline" }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.13em", textTransform: "uppercase", color: C.accent }}>
              Short summary
            </span>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: C.muted }}>Generated · 30-second read</span>
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.7, margin: "8px 0 0", maxWidth: "86ch", color: C.ink }}>{shortText}</p>
        </Card>
      )}

      {/* Impact assessment */}
      <Card style={{ padding: "16px 20px", marginBottom: 14 }}>
        <PlateEyebrow>Impact assessment</PlateEyebrow>
        <ImpactScores scores={impact} />
      </Card>

      {/* Interactive milestone timeline */}
      <Card style={{ padding: "16px 20px", marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "0 0 6px" }}>
          <PlateEyebrow>Timeline</PlateEyebrow>
          {r.timeline && r.timeline.length > 0 && (
            <button
              type="button"
              onClick={onOpenTimeline}
              style={{ fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 800, color: C.accent, background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              All {r.timeline.length} milestones →
            </button>
          )}
        </div>
        <InteractiveTimeline items={r.timeline || []} />
      </Card>

      {/* Immediate action accordion — always on Summary when present */}
      {briefing?.immediateAction?.hasContent && (
        <ImmediateActionAccordion section={briefing.immediateAction} />
      )}

      {/* Full-summary accordions */}
      {mode === "full" && hasFull && (
        <>
          {briefing?.whatItIsWhyItApplies?.hasContent && (
            <ProseAccordion title="What this regulation is and why it applies" section={briefing.whatItIsWhyItApplies} />
          )}
          {briefing?.complianceChain?.hasContent && (
            <ProseAccordion title="How the workspace sits in the compliance chain" section={briefing.complianceChain} />
          )}
          {sections.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <RegulationSections rows={sections} />
            </div>
          )}
          {r.recommendedActions && r.recommendedActions.length > 0 && (
            <Accordion
              title="Operational system requirements"
              count={`${r.recommendedActions.length} workstreams`}
              summary={r.recommendedActions.map((a) => a.action).slice(0, 2).join("; ")}
            >
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 24px" }}>
                {r.recommendedActions.map((a, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "26px 1fr", gap: 10 }}>
                    <span style={{ fontFamily: "var(--font-display)", fontSize: 16, color: C.accent, lineHeight: 1.4 }}>{i + 1}</span>
                    <div>
                      <p style={{ fontSize: 12.5, fontWeight: 800, margin: "0 0 2px", color: C.ink }}>{a.action}</p>
                      {(a.owner || a.timeframe) && (
                        <p style={{ fontSize: 12, lineHeight: 1.6, color: C.ink2, margin: 0 }}>
                          {a.owner}
                          {a.owner && a.timeframe ? " — " : ""}
                          {a.timeframe && <b>{a.timeframe}</b>}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Accordion>
          )}
          {r.fullBrief && (
            <Accordion title="Full regulatory analysis" summary="The complete brief text, sources rendered under the Sources tab.">
              {/* stripSources = the #172 pattern: the raw "## Sources" section
                  is NOT dumped here; structured rows render on the Sources tab. */}
              <IntelligenceBrief markdown={r.fullBrief} stripSources />
            </Accordion>
          )}
        </>
      )}

      {/* What changed */}
      {changelog.length > 0 && (
        <Accordion title="What changed" summary={changelog.map((c) => c.now).filter(Boolean).slice(0, 1).join("")}>
          {changelog.map((c, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              {c.fields && c.fields.length > 0 && (
                <p style={{ fontSize: 12, fontWeight: 700, color: C.ink, margin: "0 0 4px" }}>{c.fields.join(", ")}</p>
              )}
              {c.prev && (
                <p style={{ fontSize: 14, lineHeight: 1.7, color: C.ink2, margin: 0, textDecoration: "line-through" }}>{c.prev}</p>
              )}
              {c.now && <p style={{ fontSize: 14, lineHeight: 1.7, color: C.ink, margin: 0, fontWeight: 600 }}>{c.now}</p>}
              {c.impact && <p style={{ fontSize: 12, lineHeight: 1.6, color: C.sevHigh, margin: "4px 0 0" }}>Impact: {c.impact}</p>}
            </div>
          ))}
        </Accordion>
      )}

      {/* Disputed */}
      {dispute?.note && (
        <Accordion title="Disputed" summary={dispute.note}>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: C.ink, margin: "0 0 8px" }}>{dispute.note}</p>
          {dispute.sources && dispute.sources.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {dispute.sources.map((s, i) => {
                const chip = { fontSize: 11, padding: "3px 8px", borderRadius: 3, background: "#FFF7ED", color: C.sevHigh, border: "1px solid #FED7AA", textDecoration: "none" } as React.CSSProperties;
                return s.url ? (
                  <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" style={chip}>{s.name}</a>
                ) : (
                  <span key={i} style={chip}>{s.name}</span>
                );
              })}
            </div>
          )}
        </Accordion>
      )}

      {/* Connected intelligence — always on Summary */}
      <ConnectedIntelligence r={r} />
    </>
  );
}

function Segment({
  children,
  active,
  side,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  active: boolean;
  side: "left" | "right";
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      style={{
        fontFamily: "var(--font-sans)",
        fontSize: 11.5,
        fontWeight: active ? 800 : 600,
        padding: "8px 16px",
        border: active ? `1px solid ${C.ink}` : `1px solid ${C.hairStrong}`,
        background: active ? C.ink : C.card,
        color: active ? "#fff" : disabled ? "rgba(0,0,0,0.3)" : C.ink2,
        cursor: disabled ? "not-allowed" : "pointer",
        borderRadius: side === "left" ? "6px 0 0 6px" : "0 6px 6px 0",
        marginLeft: side === "right" ? -1 : 0,
      }}
    >
      {children}
    </button>
  );
}

function ImmediateActionAccordion({ section }: { section: ExtractedSection }) {
  const first = section.firstParagraphs?.[0] ?? "";
  const sev = extractSeverityLabel(first);
  const paras = section.firstParagraphs.map((p, i) => {
    if (i === 0 && sev.label) return sev.rest;
    return p;
  });
  return (
    <Accordion title="Issues requiring immediate action" summary={stripLightMarkdown(firstSentence(sev.rest || first))}>
      {sev.label && (
        <div
          role="note"
          style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "#FEF2F2", border: `1px solid #FECACA`, borderLeft: `4px solid ${SEVERITY_LABEL_TONE[sev.label]}`, borderRadius: 6, padding: "10px 14px", marginBottom: 12 }}
        >
          <AlertTriangle size={16} style={{ color: SEVERITY_LABEL_TONE[sev.label], flexShrink: 0, marginTop: 2 }} aria-hidden />
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: SEVERITY_LABEL_TONE[sev.label], marginBottom: 4 }}>
              {sev.label}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.55, color: C.ink }}>{stripLightMarkdown(firstSentence(sev.rest) || sev.rest)}</div>
          </div>
        </div>
      )}
      {paras.map((p, i) => (
        <p key={i} style={{ fontSize: 12.5, lineHeight: 1.6, margin: i === 0 ? 0 : "8px 0 0", color: C.ink }}>
          {stripLightMarkdown(p)}
        </p>
      ))}
    </Accordion>
  );
}

function ProseAccordion({ title, section }: { title: string; section: ExtractedSection }) {
  return (
    <Accordion title={title} summary={stripLightMarkdown(firstSentence(section.firstParagraphs?.[0] || ""))}>
      {section.firstParagraphs.map((p, i) => (
        <p key={i} style={{ fontSize: 12.5, lineHeight: 1.65, margin: i === 0 ? 0 : "8px 0 0", color: C.ink }}>
          {stripLightMarkdown(p)}
        </p>
      ))}
    </Accordion>
  );
}

function ConnectedIntelligence({ r }: { r: Resource }) {
  // Honest state: cross-surface connections are not yet a first-class
  // data path on the Resource. Render the pending frame rather than a
  // fabricated list (HANDOFF §4).
  return (
    <Card style={{ overflow: "hidden" }}>
      <div style={{ padding: "12px 20px", background: C.plate, borderBottom: `1px solid ${C.hairSoft}`, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase" }}>Connected intelligence</span>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: C.muted }}>across surfaces</span>
      </div>
      <div style={{ padding: "14px 20px" }}>
        <PendingFrame header="Cross-surface links pending">
          Market and research items that corroborate or reference {r.legalInstrument || "this regulation"} appear here once
          the cross-surface link graph is populated. Linked regulations render in the rail.
        </PendingFrame>
      </div>
    </Card>
  );
}

// ── Interactive milestone timeline ─────────────────────────────────────

function InteractiveTimeline({ items }: { items: TimelineEntry[] }) {
  const [pick, setPick] = useState(0);

  const milestones = useMemo(() => {
    return items.map((t, i) => {
      const done = t.status === "past";
      const hue = done ? C.sevLow : t.status === "current" ? C.accent : C.muted;
      return { ...t, done, hue, i };
    });
  }, [items]);

  if (milestones.length === 0) {
    return (
      <PendingFrame header="No milestones recorded yet">
        Deadline milestones for this regulation appear here once dated obligations are confirmed in primary sources.
      </PendingFrame>
    );
  }

  const n = milestones.length;
  const pastCount = milestones.filter((m) => m.done).length;
  const progress = n > 1 ? `${(pastCount / n) * 100}%` : pastCount ? "100%" : "0%";
  const active = milestones[Math.min(pick, n - 1)];

  return (
    <div>
      <div style={{ position: "relative", height: 4, background: "rgba(0,0,0,0.08)", borderRadius: 2, margin: "12px 40px 0" }}>
        <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: progress, background: `linear-gradient(90deg,${C.sevLow},#CFA000)`, borderRadius: 2 }} />
        {milestones.map((m, i) => {
          const left = n > 1 ? `${(i / (n - 1)) * 100}%` : "0%";
          const sel = i === pick;
          return (
            <button
              key={i}
              onClick={() => setPick(i)}
              aria-label={`${m.label} (${m.date})`}
              aria-pressed={sel}
              title={m.label}
              style={{
                position: "absolute",
                left,
                top: "50%",
                transform: "translate(-50%,-50%)",
                width: sel ? 16 : 12,
                height: sel ? 16 : 12,
                borderRadius: "50%",
                cursor: "pointer",
                padding: 0,
                background: m.done ? C.sevLow : "#fff",
                border: sel ? `3px solid ${m.hue}` : `2px solid ${m.done ? C.sevLow : "rgba(0,0,0,0.3)"}`,
              }}
            />
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", margin: "10px 40px 0" }}>
        {milestones.map((m, i) => (
          <button
            key={i}
            onClick={() => setPick(i)}
            style={{ fontFamily: "var(--font-sans)", background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 11, fontWeight: i === pick ? 800 : 600, color: i === pick ? C.ink : C.muted }}
          >
            {shortDate(m.date)}
          </button>
        ))}
      </div>
      <div style={{ border: `1px solid rgba(0,0,0,0.1)`, borderLeft: `3px solid ${active.hue}`, borderRadius: 6, background: C.page, padding: "12px 16px", margin: "16px 0 0", display: "flex", justifyContent: "space-between", gap: 16, alignItems: "baseline" }}>
        <div>
          <p style={{ fontSize: 12.5, fontWeight: 800, margin: 0, color: C.ink }}>{active.label}</p>
          <p style={{ fontSize: 12, lineHeight: 1.6, color: C.ink2, margin: "3px 0 0" }}>{fullDate(active.date)}</p>
        </div>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.09em", textTransform: "uppercase", color: active.hue, whiteSpace: "nowrap" }}>
          {active.status === "past" ? "In force" : active.status === "current" ? "In progress" : "Upcoming"}
        </span>
      </div>
    </div>
  );
}

// ── EXPOSURE TAB ───────────────────────────────────────────────────────

function ExposureTab({ resource: r, jurisdictionLabels }: { resource: Resource; jurisdictionLabels: string[] }) {
  const sectorProfile = useWorkspaceStore((s) => s.sectorProfile);
  const modes = (r.modes && r.modes.length > 0 ? r.modes : [r.cat]).filter(Boolean);
  const modeList = modes.map((m) => (m || "").toLowerCase()).join(", ");
  const jurisList = jurisdictionLabels.join(", ");

  const matchedSectorId = sectorProfile && sectorProfile.length > 0 ? matchResourceSector(r, sectorProfile) : null;
  const matchedSectorLabel = matchedSectorId
    ? ALL_SECTORS.find((s) => s.id === matchedSectorId)?.label || matchedSectorId
    : null;

  return (
    <>
      <Card style={{ overflow: "hidden", marginBottom: 14 }}>
        <div style={{ padding: "12px 20px", background: C.plate, borderBottom: `1px solid ${C.hairSoft}` }}>
          <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase" }}>Where the exposure sits</span>
        </div>
        <div style={{ padding: "16px 20px" }}>
          <p style={{ fontSize: 13, lineHeight: 1.7, margin: "0 0 12px", color: C.ink }}>
            {matchedSectorLabel ? (
              <>This regulation intersects your <b>{matchedSectorLabel}</b> activity. It applies to <b>{modeList}</b> freight in <b>{jurisList}</b>.</>
            ) : (
              <>This regulation applies to <b>{modeList}</b> freight in <b>{jurisList}</b>. Costs may flow through as a pass-through on any shipment in those modes / jurisdictions.</>
            )}
          </p>
          {(!sectorProfile || sectorProfile.length === 0) && (
            <p style={{ fontSize: 12.5, color: C.ink2, margin: "0 0 4px" }}>
              Add your sectors in{" "}
              <Link href="/settings" style={{ color: C.accent, fontWeight: 700, textDecoration: "none" }}>settings</Link>{" "}
              to see how this maps to your business.
            </p>
          )}
        </div>
      </Card>
      <Card style={{ padding: "16px 20px" }}>
        <PlateEyebrow>Affected lanes</PlateEyebrow>
        <PendingFrame header="Lane-level exposure pending">
          Lane-level exposure appears here once workspace shipment data is connected. Jurisdiction scope today: <b>{jurisList}</b> · Mode: <b>{modeList || "—"}</b>.
        </PendingFrame>
      </Card>
    </>
  );
}

// ── PENALTY SCHEDULE TAB ───────────────────────────────────────────────

const PENALTY_SENTENCE_RE = new RegExp(
  "[^.!?\\n]*?\\b(penalt|fine[ds]?|surcharge|forfeit|shortfall|non[- ]compliance|infringement)[^.!?\\n]*[.!?]",
  "gi"
);

function extractPenaltySentences(markdown: string | undefined, max = 4): string[] {
  if (!markdown) return [];
  const text = markdown
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
  const matches = text.match(PENALTY_SENTENCE_RE) || [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of matches) {
    const trimmed = m.trim();
    if (trimmed.length < 30 || trimmed.length > 320) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= max) break;
  }
  return out;
}

function PenaltyTab({ resource: r }: { resource: Resource }) {
  const sentences = useMemo(() => extractPenaltySentences(r.fullBrief), [r.fullBrief]);
  const structured = [
    r.penaltyRange && { label: "Penalty amount", value: r.penaltyRange, critical: true },
    r.costMechanism && { label: "Cost mechanism", value: r.costMechanism },
    r.enforcementBody && { label: "Enforcement body", value: r.enforcementBody },
    r.complianceDeadline && { label: "Compliance deadline", value: r.complianceDeadline },
  ].filter(Boolean) as Array<{ label: string; value: string; critical?: boolean }>;

  if (structured.length === 0 && sentences.length === 0) {
    return (
      <Card style={{ padding: "16px 20px" }}>
        <PlateEyebrow>Penalty schedule</PlateEyebrow>
        <PendingFrame header="No direct penalty schedule on file">
          No structured penalty data on file for this regulation yet. Where enforcement flows through downstream
          instruments, penalties reach the workspace indirectly as carrier compliance costs — tracked under Exposure.
        </PendingFrame>
      </Card>
    );
  }

  return (
    <Card style={{ padding: "16px 20px" }}>
      <PlateEyebrow>Penalty schedule</PlateEyebrow>
      {structured.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))", gap: 12, marginBottom: sentences.length ? 16 : 0 }}>
          {structured.map((t, i) => (
            <div key={i} style={{ background: t.critical ? "#FEF2F2" : C.page, border: `1px solid ${t.critical ? "#FECACA" : C.hairSoft}`, borderLeft: t.critical ? `3px solid ${C.sevCritical}` : undefined, borderRadius: 6, padding: "12px 14px" }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: t.critical ? C.sevCritical : C.muted, marginBottom: 6 }}>{t.label}</div>
              <div style={{ fontSize: 14, lineHeight: 1.4, fontWeight: 600, color: C.ink }}>{t.value}</div>
            </div>
          ))}
        </div>
      )}
      {sentences.length > 0 && (
        <>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted, marginBottom: 8 }}>From the regulatory brief</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.65, color: C.ink }}>
            {sentences.map((s, i) => (<li key={i} style={{ marginBottom: 6 }}>{s}</li>))}
          </ul>
        </>
      )}
      <p style={{ fontSize: 11.5, lineHeight: 1.5, color: C.muted, margin: "14px 0 0" }}>
        The schedule describes what the penalty is based on (value, %, per-unit). Workspace-specific exposure modeling lands once shipment data is connected.
      </p>
    </Card>
  );
}

// ── TIMELINE TAB ───────────────────────────────────────────────────────

function TimelineTab({ resource: r }: { resource: Resource }) {
  const items = r.timeline || [];
  return (
    <>
      <Card style={{ overflow: "hidden", marginBottom: 14 }}>
        <div style={{ padding: "12px 20px", background: C.plate, borderBottom: `1px solid ${C.hairSoft}`, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase" }}>Obligations by deadline</span>
          {items.length > 0 && <span style={{ fontSize: 10.5, fontWeight: 700, color: C.muted }}>{items.length} milestones · confirmed in primary sources</span>}
        </div>
        {items.length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr", gap: 0 }}>
            {["Milestone", "Date", "Status"].map((h, i) => (
              <span key={h} style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.11em", textTransform: "uppercase", color: C.muted, padding: `10px 14px 10px ${i === 0 ? "20px" : "14px"}`, background: C.page, borderBottom: `1px solid rgba(0,0,0,0.1)` }}>{h}</span>
            ))}
            {items.map((o, i) => (
              <FragmentRow key={i} o={o} last={i === items.length - 1} />
            ))}
          </div>
        ) : (
          <div style={{ padding: "16px 20px" }}>
            <PendingFrame header="No consolidated schedule yet">
              Dated obligations render here where confirmed in primary sources. None are recorded for this regulation yet.
            </PendingFrame>
          </div>
        )}
      </Card>
    </>
  );
}

function FragmentRow({ o, last }: { o: TimelineEntry; last: boolean }) {
  const bd = last ? "none" : `1px solid ${C.hairSoft}`;
  const statusLabel = o.status === "past" ? "In force" : o.status === "current" ? "In progress" : "Upcoming";
  return (
    <>
      <span style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.5, padding: "10px 14px 10px 20px", borderBottom: bd, color: C.ink }}>{o.label}</span>
      <span style={{ fontSize: 12, lineHeight: 1.5, padding: "10px 14px", borderBottom: bd, color: C.ink2 }}>{fullDate(o.date)}</span>
      <span style={{ fontSize: 12, lineHeight: 1.5, padding: "10px 14px", borderBottom: bd, color: C.ink2 }}>{statusLabel}</span>
    </>
  );
}

// ── SOURCES TAB — structured rows, never a raw dump (#172) ──────────────

/** D-2 fix — the ONE selector over the per-regulation source set. Both homes (Sources tab
 *  header and the At-a-glance rail) derive from THIS; the rail previously hardcoded "1"
 *  (a primary-only literal), disagreeing with the tab's parsed count. */
function sourceEntriesOf(r: Resource): SourceEntry[] {
  let parsed: SourceEntry[] = [];
  if (r.fullBrief) {
    const map = extractRegulationSections(r.fullBrief);
    for (const section of Object.values(map)) {
      if (section && section.kind === "sources_list") { parsed = section.entries; break; }
    }
  }
  // Fallback single-source row from the Resource when the brief has no
  // parseable Sources section — still a STRUCTURED row, never a raw dump.
  return parsed.length > 0
    ? parsed
    : r.url
    ? [{ tier: typeof r.sourceTier === "number" ? r.sourceTier : null, name: r.sourceName || r.url, meta: r.enforcementBody || "", url: r.url }]
    : [];
}

function SourcesTab({ resource: r }: { resource: Resource }) {
  const rows = useMemo<SourceEntry[]>(() => sourceEntriesOf(r), [r]);

  return (
    <Card style={{ overflow: "hidden" }}>
      <div style={{ padding: "12px 20px", background: C.plate, borderBottom: `1px solid ${C.hairSoft}`, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase" }}>Sources</span>
        {rows.length > 0 && <span style={{ fontSize: 10.5, fontWeight: 700, color: C.muted }}>{rows.length} {rows.length === 1 ? "source" : "sources"} · tier = provenance, never urgency</span>}
      </div>
      {rows.length > 0 ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 32px", padding: "4px 20px" }}>
            {rows.map((s, i) => {
              const inner = (
                <>
                  {typeof s.tier === "number" ? <TierBadge tier={s.tier} /> : <span aria-hidden style={{ fontSize: 10, fontWeight: 800, padding: "5px 10px", borderRadius: 4, border: `1px dashed rgba(0,0,0,0.3)`, color: C.muted }}>—</span>}
                  <div>
                    <p style={{ fontSize: 12.5, fontWeight: 700, margin: 0, lineHeight: 1.45, color: C.ink }}>{s.name}</p>
                    {s.meta && <p style={{ fontSize: 11, color: C.muted, margin: "2px 0 0" }}>{s.meta}</p>}
                  </div>
                </>
              );
              const cellStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "auto 1fr", gap: 12, alignItems: "baseline", padding: "11px 0", borderBottom: `1px solid ${C.hairSoft}`, textDecoration: "none", color: "inherit" };
              return s.url ? (
                <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" style={cellStyle}>{inner}</a>
              ) : (
                <div key={i} style={cellStyle}>{inner}</div>
              );
            })}
          </div>
          {r.url && (
            <p style={{ fontSize: 11.5, color: C.muted, margin: 0, padding: "10px 20px", borderTop: `1px solid ${C.hairSoft}`, background: C.page }}>
              Full regulatory text is hosted at the source —{" "}
              <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ color: C.accent, fontWeight: 700, textDecoration: "none" }}>open the original document ↗</a>
            </p>
          )}
        </>
      ) : (
        <div style={{ padding: "16px 20px" }}>
          <PendingFrame header="Primary source not yet linked">
            The primary source document will be linked here once verified against the registry.
          </PendingFrame>
        </div>
      )}
    </Card>
  );
}

// ── Meta rail ──────────────────────────────────────────────────────────

function AtAGlanceCard({
  r,
  jurisLabel,
  modes,
  tone,
}: {
  r: Resource;
  jurisLabel: string;
  modes: string[];
  tone: { color: string; label: string };
}) {
  const rows: Array<[string, React.ReactNode]> = [
    ["Type", r.type ? r.type.replace(/_/g, " ") : "—"],
    ["Priority", <span key="priority" style={{ fontWeight: 800, color: tone.color }}>{tone.label}</span>],
    ["Jurisdiction", jurisLabel || "Global"],
    ["Modes", modes.length ? modes.map((m) => m.toUpperCase()).join(" · ") : "—"],
  ];
  if (r.topic) rows.push(["Topic", r.topic]);
  // D-2 fix: same selector as the Sources tab (sourceEntriesOf) — the hardcoded "1" was the
  // wrong home (primary-only literal, disagreed with the tab's parsed count).
  const sourceCount = sourceEntriesOf(r).length;
  if (sourceCount > 0 && typeof r.sourceTier === "number") {
    rows.push(["Sources", <span key="sources">{sourceCount} · <span style={{ color: C.blue }}>T{clampTier(r.sourceTier)} primary</span></span>]);
  }
  return (
    <Card style={{ padding: "14px 16px" }}>
      <PlateEyebrow>At a glance</PlateEyebrow>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 14px", fontSize: 12 }}>
        {rows.map(([k, v], i) => (
          <Fragment key={i}>
            <span style={{ color: C.muted, fontWeight: 600 }}>{k}</span>
            <span style={{ fontWeight: 700, color: C.ink }}>{v}</span>
          </Fragment>
        ))}
      </div>
    </Card>
  );
}

// ── Honest-state pending frame (HANDOFF §4) ────────────────────────────

function PendingFrame({ header, children }: { header: string; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px dashed rgba(0,0,0,0.25)", background: C.page, borderRadius: 8, padding: "12px 14px" }}>
      <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.11em", textTransform: "uppercase", color: C.brass, display: "block", margin: "0 0 4px" }}>{header}</span>
      <p style={{ fontSize: 12, lineHeight: 1.6, color: C.ink2, margin: 0 }}>{children}</p>
    </div>
  );
}

// ── Hero priority dropdown (interactive retag/dismiss) ──────────────────

function HeroPriorityDropdown({ currentPriority, itemId }: { currentPriority: PriorityKey; itemId: string }) {
  const updatePriority = useResourceStore((s) => s.updatePriority);
  const dismissResource = useResourceStore((s) => s.dismissResource);
  const override = useResourceStore((s) => s.overrides.get(itemId));
  const isDismissed = !!override?.dismissedAt;
  const effectivePriority = (override?.priorityOverride as PriorityKey | undefined) ?? currentPriority;
  return (
    <PriorityDropdown
      variant="hero"
      currentPriority={effectivePriority}
      isDismissed={isDismissed}
      onSetPriority={(p) => updatePriority(itemId, p)}
      onDismiss={() => dismissResource(itemId)}
    />
  );
}

// ── Action handlers ────────────────────────────────────────────────────

function exportBriefAsMarkdown(r: Resource) {
  if (typeof window === "undefined") return;
  const titleLine = `# ${r.title}\n\n`;
  const meta = [
    r.jurisdiction ? `- Jurisdiction: ${r.jurisdiction}` : null,
    r.priority ? `- Priority: ${r.priority}` : null,
    r.complianceDeadline ? `- Compliance deadline: ${r.complianceDeadline}` : null,
    r.url ? `- Source: ${r.url}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const body =
    r.fullBrief || [r.whatIsIt, r.whyMatters].filter(Boolean).join("\n\n") || r.note || "(No briefing body recorded.)";
  const md = `${titleLine}${meta ? meta + "\n\n" : ""}${body}\n`;
  const slug = (r.id || "regulation").toString().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `regulation-${slug || "brief"}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function shareCurrentRegulation(r: Resource) {
  if (typeof window === "undefined") return;
  const href = typeof window.location !== "undefined" ? window.location.href : "";
  const shareData = { title: r.title, text: r.note || r.whatIsIt || r.title, url: href };
  const nav = window.navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
  if (typeof nav.share === "function") {
    nav.share(shareData).catch(() => copyToClipboard(href));
    return;
  }
  copyToClipboard(href);
}

function copyToClipboard(text: string) {
  if (typeof window === "undefined" || !text) return;
  const nav = window.navigator as Navigator & { clipboard?: { writeText: (s: string) => Promise<void> } };
  if (nav.clipboard && typeof nav.clipboard.writeText === "function") {
    nav.clipboard.writeText(text).catch(() => {});
  }
}

// ── Text helpers ───────────────────────────────────────────────────────

function stripLightMarkdown(s: string): string {
  if (!s) return s;
  return s
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/_([^_]+)_/g, "$1");
}

function firstSentence(text: string): string {
  if (!text) return text;
  const m = /^([\s\S]+?[.!?])(\s|$)/.exec(text);
  return m ? m[1] : text;
}

function shortDate(d: string): string {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-US", { year: "numeric" });
}

function fullDate(d: string): string {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
