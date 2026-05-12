"use client";

/**
 * RegulationDetailSurface — client subcomponent for /regulations/[id].
 *
 * Tabs (post Decision #12 rationalization, PR-F):
 *   Summary · Exposure · Penalty calculator · Timeline · Sources
 *
 *   - Team notes: dropped (no collaboration data path).
 *   - Full text: merged into Summary as inline bottom-most section.
 *     PR #24's navigateToFullSection helper is rewired to scroll within
 *     Summary to the inline Full text section, instead of switching tabs.
 *
 * Layout matches design_handoff_2026-04/preview/regulation-detail.html:
 *   - Hero card with mode chips, title row + pills, deck, tag chips, actions
 *   - 4-stat strip: Effective / Penalty rate / Your exposure / Lanes
 *   - Tab bar (3px accent underline on active tab)
 *   - Layout grid: main panel (1fr) + 320px right rail
 *   - Summary panel content order: AI summary · Tier 2 expander (PR #24) ·
 *     inline horizontal Timeline · Impact scores · What changed ·
 *     Why it matters · Key data · Recommended actions · Disputed ·
 *     Full text (inline, anchored as `synopsis-full-text`)
 *   - Right rail: Affected lanes · Owner & team · Identification · Coverage ·
 *     Linked regulations
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { TimelineBar } from "@/components/resource/TimelineBar";
import { ImpactScores } from "@/components/resource/ImpactScores";
import { IntelligenceBrief } from "@/components/resource/IntelligenceBrief";
import { AiPromptBar } from "@/components/ui/AiPromptBar";
import { AffectedLanesCard } from "@/components/regulations/AffectedLanesCard";
import { OwnerTeamCard } from "@/components/regulations/OwnerTeamCard";
import { LinkedItemsCard } from "@/components/regulations/LinkedItemsCard";
import { scoreResource } from "@/lib/scoring";
import {
  extractOperationalBriefing,
  extractSeverityLabel,
  headingSlug,
  type ExtractedSection,
  type SeverityLabel,
} from "@/lib/agent/extract-sections";
import {
  TOPIC_COLORS,
  JURISDICTIONS,
  PRIORITY_DISPLAY_LABEL_SHORT,
  type PriorityKey,
} from "@/lib/constants";
import { isoToDisplayLabel } from "@/lib/jurisdictions/iso";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import type {
  Resource,
  ChangeLogEntry,
  Dispute,
  Supersession,
} from "@/types/resource";

interface Props {
  resource: Resource;
  changelog: ChangeLogEntry[];
  dispute: Dispute | null;
  supersessions: Supersession[];
  xrefIds: string[];
  refByIds: string[];
  resourceLookup: Record<string, { id: string; title: string; priority: string }>;
}

// Decision #12: dropped "notes" (no collaboration data path) and "full"
// (merged into Summary as inline bottom-most section).
type TabKey =
  | "summary"
  | "exposure"
  | "calculator"
  | "timeline"
  | "sources";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "summary", label: "Summary" },
  { key: "exposure", label: "Exposure" },
  { key: "calculator", label: "Penalty calculator" },
  { key: "timeline", label: "Timeline" },
  { key: "sources", label: "Sources" },
];

// Maps an Issues-Requiring-Immediate-Action severity label (from the
// agent's space-separated severity convention — see system-prompt.ts
// lines 223-230) to a UI tone token. Used for the elevated callout at
// the top of the operational briefing expander (Task C).
//
// CRITICAL/HIGH/MODERATE/LOW priority tokens already exist in
// PRIORITY_TONE; severity labels are a parallel vocabulary so they get
// their own map keyed on the label text the agent emits.
const SEVERITY_LABEL_TONE: Record<
  SeverityLabel,
  { bg: string; bd: string; color: string }
> = {
  "ACTION REQUIRED": {
    bg: "var(--critical-bg)",
    bd: "var(--critical-bd)",
    color: "var(--critical)",
  },
  "COST ALERT": {
    bg: "var(--high-bg)",
    bd: "var(--high-bd)",
    color: "var(--high)",
  },
  "WINDOW CLOSING": {
    bg: "var(--critical-bg)",
    bd: "var(--critical-bd)",
    color: "var(--critical)",
  },
  "COMPETITIVE EDGE": {
    bg: "var(--accent-bg)",
    bd: "var(--accent-bd)",
    color: "var(--accent)",
  },
  MONITORING: {
    bg: "var(--moderate-bg)",
    bd: "var(--moderate-bd)",
    color: "var(--moderate)",
  },
};

const PRIORITY_TONE: Record<
  string,
  { bg: string; bd: string; color: string; label: string }
> = {
  CRITICAL: {
    bg: "var(--critical-bg)",
    bd: "var(--critical-bd)",
    color: "var(--critical)",
    label: PRIORITY_DISPLAY_LABEL_SHORT.CRITICAL,
  },
  HIGH: {
    bg: "var(--high-bg)",
    bd: "var(--high-bd)",
    color: "var(--high)",
    label: PRIORITY_DISPLAY_LABEL_SHORT.HIGH,
  },
  MODERATE: {
    bg: "var(--moderate-bg)",
    bd: "var(--moderate-bd)",
    color: "var(--moderate)",
    label: PRIORITY_DISPLAY_LABEL_SHORT.MODERATE,
  },
  LOW: {
    bg: "var(--low-bg)",
    bd: "var(--low-bd)",
    color: "var(--low)",
    label: PRIORITY_DISPLAY_LABEL_SHORT.LOW,
  },
};

export function RegulationDetailSurface({
  resource: r,
  changelog,
  dispute,
  supersessions,
  xrefIds,
  refByIds,
  resourceLookup,
}: Props) {
  const [tab, setTab] = useState<TabKey>("summary");
  // Pending scroll-to-anchor inside the inline Full text section
  // (Decision #12: Full text moved from a sibling tab to the bottom of
  // Summary). When PR #24's Tier 2 expander deep-link button is clicked,
  // we set this anchor, switch to the Summary tab if needed, and the
  // FullTextPanel inside SummaryPanel consumes it.
  const [pendingFullSectionAnchor, setPendingFullSectionAnchor] = useState<
    string | null
  >(null);

  /** Scroll to a heading slug inside the inline Full text section at
   * the bottom of Summary. Used by PR #24's Tier 2 expander deep-link
   * buttons. Slug is the headingSlug() value of the heading text —
   * IntelligenceBrief composes its own per-render briefId prefix, and
   * the Full text panel resolves the prefix at scroll time.
   *
   * Pre-Decision-#12 this switched tab to "full"; post-Decision-#12 the
   * Full text section lives inside Summary, so we ensure Summary is
   * active and pass the anchor downstream. */
  const navigateToFullSection = useCallback((slug: string) => {
    setPendingFullSectionAnchor(slug);
    setTab("summary");
  }, []);

  // Admin-only banner gating. The flag is populated from intelligence_items
  // migration 035 (agent_integrity_flag), surfaced through fetchIntelligenceItem,
  // and rendered ONLY when the current viewer is an owner/admin. Members,
  // editors, viewers, and unauthenticated visitors never see this surface.
  const userRole = useWorkspaceStore((s) => s.userRole);
  const isAdminViewer = userRole === "owner" || userRole === "admin";
  const showIntegrityBanner =
    isAdminViewer && r.agentIntegrityFlag === true && !!r.agentIntegrityPhrase;

  const tone = PRIORITY_TONE[r.priority] || PRIORITY_TONE.MODERATE;
  const modes = r.modes || [r.cat];
  const tags = r.tags || [];

  // Prefer the migration 033 jurisdiction_iso column (supports US-CA,
  // EU, GB-SCT, etc.) and only fall back to the legacy `jurisdiction`
  // single-string when ISO data isn't yet populated. This keeps SB 253
  // showing "California, United States" instead of just "United States".
  const jurisdictionLabels =
    r.jurisdictionIso && r.jurisdictionIso.length > 0
      ? r.jurisdictionIso.map(isoToDisplayLabel)
      : r.jurisdiction
      ? [
          JURISDICTIONS.find((j) => j.id === r.jurisdiction)?.label ||
            r.jurisdiction,
        ]
      : ["Global"];
  const jurisLabel = jurisdictionLabels.join(" · ");

  // 4-stat strip values
  const effective = nextDeadline(r);
  const lanesAffected = "—"; // No lane-level data on the schema yet.
  const yourExposure = "—"; // Requires workspace shipment volumes.

  return (
    <div className="px-9 pt-8 pb-16 max-w-[1280px] mx-auto">
      {/* Agent integrity banner — admins only.
          Renders when migration 035 detected a self-flag phrase in the
          brief body and an admin hasn't resolved it. Hidden from members /
          editors / viewers / anonymous via the userRole gate above. */}
      {showIntegrityBanner && (
        <div
          role="alert"
          style={{
            display: "flex",
            gap: 12,
            alignItems: "flex-start",
            background: "var(--high-bg, rgba(217, 119, 6, 0.08))",
            border: "1px solid var(--high-bd, rgba(217, 119, 6, 0.3))",
            borderLeft: "4px solid var(--high, #d97706)",
            borderRadius: "var(--r-md)",
            padding: "12px 16px",
            marginBottom: 16,
            fontSize: 13,
            color: "var(--text)",
            lineHeight: 1.5,
          }}
        >
          <AlertTriangle
            size={18}
            style={{ color: "var(--high, #d97706)", flexShrink: 0, marginTop: 2 }}
            aria-hidden="true"
          />
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--high, #d97706)",
                marginBottom: 4,
              }}
            >
              Agent flagged integrity concern
            </div>
            <div style={{ color: "var(--text)" }}>
              The agent self-flagged this brief with the phrase{" "}
              <code
                style={{
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                  background: "rgba(217, 119, 6, 0.12)",
                  border: "1px solid rgba(217, 119, 6, 0.25)",
                  borderRadius: 3,
                  padding: "1px 6px",
                  fontSize: 12,
                }}
              >
                {r.agentIntegrityPhrase}
              </code>
              . Resolve in{" "}
              <a
                href="/admin#integrity-flags"
                style={{
                  color: "var(--high, #d97706)",
                  fontWeight: 700,
                  textDecoration: "underline",
                }}
              >
                /admin → Integrity flags
              </a>
              .
            </div>
          </div>
        </div>
      )}

      {/* Hero card */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border-sub)",
          borderLeft: `5px solid ${tone.color}`,
          borderRadius: "var(--r-lg)",
          padding: "22px 26px 20px",
          boxShadow: "var(--shadow)",
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
                  border: "1px solid var(--border)",
                  borderRadius: 999,
                  background: "var(--surface)",
                  color: "var(--text-2)",
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

        {/* Title metadata strip — operator dispatch 2026-05-12 issue 4.
            Pre 2026-05-12 the hero card re-rendered r.title as an Anton 30px
            h2. That duplicated the masthead title (which now responsively
            scales for mobile) and ate viewport on long titles. The strip
            now carries only the type pill and priority pill alongside the
            mode chips above; the masthead is the single source of truth
            for the regulation name. */}
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
              background: tone.bg,
              color: tone.color,
              border: `1px solid ${tone.bd}`,
            }}
          >
            {tone.label}
          </span>
        </div>

        {(r.note || r.whatIsIt) && (
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.55,
              color: "var(--text-2)",
              marginBottom: 14,
              maxWidth: "78ch",
            }}
          >
            {r.note || r.whatIsIt}
          </p>
        )}

        {tags.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
            {tags.map((t) => (
              <span
                key={t}
                style={{
                  fontSize: 11,
                  padding: "3px 10px",
                  background: "var(--bg)",
                  border: "1px solid var(--border-sub)",
                  borderRadius: 999,
                  color: "var(--text-2)",
                  fontWeight: 600,
                }}
              >
                {t}
              </span>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {/* Add to watchlist — HIDDEN.
              PR-E3 (watchlist persistence) is deferred. There's no
              backend table or API for per-user / per-workspace watchlist
              membership yet, so the button has no destination. Restoring
              it requires PR-E3 to land first; at that point change the
              ternary below to render <ActionButton primary onClick={...}>
              that calls the watchlist add/remove endpoint. */}
          {false && <ActionButton primary>+ Add to watchlist</ActionButton>}
          {(r.fullBrief || r.url) && (
            <ActionButton onClick={() => exportBriefAsMarkdown(r)}>
              Export brief
            </ActionButton>
          )}
          <ActionButton onClick={() => shareCurrentRegulation(r)}>
            Share
          </ActionButton>
        </div>
      </div>

      {/* 4-stat strip */}
      <div
        className="cl-detail-stat-strip"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 10,
          marginBottom: 18,
        }}
      >
        <style>{`
          @media (max-width: 1100px) { .cl-detail-stat-strip { grid-template-columns: 1fr 1fr !important; } }
        `}</style>
        {/* The effective stat tile is hidden when there's no real
            value — an empty card with a red border looks broken per
            the audit. Show only when nextDeadline returns something
            meaningful. */}
        {effective.value && effective.value !== "—" && (
          <Stat label="Effective" value={effective.value} sub={effective.sub} />
        )}
        {r.penaltyRange && r.penaltyRange !== "—" && (
          <Stat
            label="Penalty rate"
            value={r.penaltyRange}
            critical
            sub={r.enforcementBody}
          />
        )}
        {yourExposure && yourExposure !== "—" && (
          <Stat label="Your exposure" value={yourExposure} sub="Workspace data pending" />
        )}
        {lanesAffected && lanesAffected !== "—" && (
          <Stat label="Lanes affected" value={lanesAffected} sub="Of active lanes" />
        )}
      </div>

      {/* AI inquiry bar — most natural place for "what does this mean for
          my workspace" follow-ups about a specific regulation. Placeholder
          and chips are regulation-aware. */}
      <div style={{ marginBottom: 16 }}>
        <AiPromptBar
          placeholder={`Ask anything about ${r.title} — e.g. what does this mean for my workspace?`}
          chips={[
            "What does this mean for me?",
            "When does this hit force?",
            "Who's affected in my supply chain?",
          ]}
        />
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 0,
          borderBottom: "1px solid var(--border-sub)",
          marginBottom: 22,
          overflowX: "auto",
        }}
      >
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: "12px 18px",
                fontSize: 13,
                fontWeight: 700,
                color: active ? "var(--accent)" : "var(--text-2)",
                borderBottom: `3px solid ${active ? "var(--accent)" : "transparent"}`,
                cursor: "pointer",
                whiteSpace: "nowrap",
                background: "transparent",
                border: 0,
                borderBottomWidth: 3,
                borderBottomStyle: "solid",
                borderBottomColor: active ? "var(--accent)" : "transparent",
                fontFamily: "inherit",
              }}
            >
              {t.label}
            </button>
          );
        })}
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
          {tab === "summary" && (
            <SummaryPanel
              r={r}
              changelog={changelog}
              dispute={dispute}
              onNavigateToFullSection={navigateToFullSection}
              pendingFullSectionAnchor={pendingFullSectionAnchor}
              onAnchorConsumed={() => setPendingFullSectionAnchor(null)}
            />
          )}
          {tab === "exposure" && (
            <PlaceholderPanel
              title="Exposure"
              copy="Workspace exposure modeling will appear here once shipment-volume data is connected."
            />
          )}
          {tab === "calculator" && (
            <PlaceholderPanel
              title="Penalty calculator"
              copy="Inputs for shipment count, weight, and corridor — wired to the regulation's penalty schedule."
            />
          )}
          {tab === "timeline" && (
            <BriefSection title="Timeline">
              {r.timeline && r.timeline.length > 0 ? (
                <TimelineBar items={r.timeline} color={TOPIC_COLORS[r.topic || ""] || undefined} />
              ) : (
                <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
                  No timeline milestones recorded yet.
                </p>
              )}
            </BriefSection>
          )}
          {tab === "sources" && (
            <BriefSection title="Sources">
              {r.url ? (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.75 }}>
                  <li>
                    <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>
                      {r.sourceName || r.url}
                    </a>
                    {r.sourceTier && ` · Tier ${r.sourceTier}`}
                  </li>
                </ul>
              ) : (
                <p style={{ fontSize: 14, color: "var(--muted)", margin: 0 }}>
                  Primary source not yet linked.
                </p>
              )}
            </BriefSection>
          )}
        </div>

        {/* Right rail. Order (PR-F):
              · Next deadline (existing — only when real)
              · Affected lanes (PR-F new — F22)
              · Owner & team (PR-F new — F23)
              · Identification (existing)
              · Coverage (existing)
              · Linked regulations (PR-F new — F22, replaces "Related" SideCard)
        */}
        <aside style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {effective.value && effective.value !== "—" && (
            <DeadlineCard effective={effective} />
          )}
          <AffectedLanesCard resource={r} />
          <OwnerTeamCard resource={r} />
          <SideCard label="Identification">
            <KV k="ID" v={r.id} />
            <KV k="Type" v={r.type} />
            {r.legalInstrument && <KV k="Instrument" v={r.legalInstrument} />}
            {r.enforcementBody && <KV k="Publisher" v={r.enforcementBody} />}
            {r.complianceDeadline ||
            (effective.value && effective.value !== "—") ? (
              <KV
                k="Effective"
                v={r.complianceDeadline || effective.sub}
              />
            ) : null}
            {r.lastVerifiedDate && <KV k="Reviewed" v={r.lastVerifiedDate} />}
            <KV
              k="Priority"
              v={
                PRIORITY_DISPLAY_LABEL_SHORT[r.priority as PriorityKey] ||
                r.priority
              }
            />
          </SideCard>
          <SideCard label="Coverage">
            <KV k="Jurisdiction" v={jurisLabel || "Global"} />
            <KV k="Modes" v={modes.map((m) => m.toUpperCase()).join(", ")} />
            {r.topic && <KV k="Topic" v={r.topic} />}
          </SideCard>
          <LinkedItemsCard
            xrefIds={xrefIds}
            refByIds={refByIds}
            supersessions={supersessions}
            selfId={r.id}
            resourceLookup={resourceLookup}
          />
        </aside>
      </div>
    </div>
  );
}

// ── Subcomponents ───────────────────────────────────────────────────────────

function ActionButton({
  children,
  primary,
  onClick,
}: {
  children: React.ReactNode;
  primary?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontSize: 12,
        fontWeight: 700,
        padding: "8px 14px",
        borderRadius: "var(--r-sm)",
        border: primary ? `1px solid var(--accent)` : `1px solid var(--border)`,
        background: primary ? "var(--accent)" : "var(--surface)",
        color: primary ? "#fff" : "var(--text)",
        cursor: "pointer",
        fontFamily: "inherit",
        letterSpacing: "0.04em",
      }}
    >
      {children}
    </button>
  );
}

// ── Action button helpers ─────────────────────────────────────────────
//
// Export brief: writes the regulation's full_brief markdown (or a
// generated minimal stub when full_brief is absent but a URL exists) to
// a Blob and triggers a download. Per project convention all exports use
// Blob download — no clipboard API, no window.open, no iframe.print.
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
    r.fullBrief ||
    [r.whatIsIt, r.whyMatters].filter(Boolean).join("\n\n") ||
    r.note ||
    "(No briefing body recorded.)";
  const md = `${titleLine}${meta ? meta + "\n\n" : ""}${body}\n`;

  const slug = (r.id || "regulation")
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const filename = `regulation-${slug || "brief"}.md`;

  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke to next tick so the download starts before we drop the
  // object URL (Safari quirk).
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

// Share: prefer the native Web Share API on platforms that support it
// (iOS Safari, Android Chrome). Otherwise fall back to copying the
// canonical URL to the clipboard. We don't surface a toast here because
// the page is server-rendered and the surrounding shell owns toast UI;
// the navigator share sheet / clipboard write is its own user-feedback.
function shareCurrentRegulation(r: Resource) {
  if (typeof window === "undefined") return;
  const href =
    typeof window.location !== "undefined" ? window.location.href : "";
  const shareData = {
    title: r.title,
    text: r.note || r.whatIsIt || r.title,
    url: href,
  };
  // Web Share API — narrow to environments that genuinely support it.
  const nav = window.navigator as Navigator & {
    share?: (data: ShareData) => Promise<void>;
  };
  if (typeof nav.share === "function") {
    nav.share(shareData).catch(() => {
      // User dismissed or share failed — fall through to clipboard.
      copyToClipboard(href);
    });
    return;
  }
  copyToClipboard(href);
}

function copyToClipboard(text: string) {
  if (typeof window === "undefined" || !text) return;
  const nav = window.navigator as Navigator & {
    clipboard?: { writeText: (s: string) => Promise<void> };
  };
  if (nav.clipboard && typeof nav.clipboard.writeText === "function") {
    nav.clipboard.writeText(text).catch(() => {
      /* swallow — clipboard rejection is non-actionable in this context */
    });
  }
}

function Stat({
  label,
  value,
  sub,
  critical,
}: {
  label: string;
  value: string;
  sub?: string;
  critical?: boolean;
}) {
  return (
    <div
      style={{
        background: critical ? "var(--critical-bg)" : "var(--surface)",
        border: critical ? "1px solid var(--critical-bd)" : "1px solid var(--border-sub)",
        borderLeft: critical ? "4px solid var(--critical)" : undefined,
        borderRadius: "var(--r-md)",
        padding: "14px 16px",
        boxShadow: "var(--shadow)",
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 800,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: critical ? "var(--critical)" : "var(--muted)",
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
          color: critical ? "var(--critical)" : "var(--text)",
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          style={{
            fontSize: 11,
            color: "var(--text-2)",
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
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border-sub)",
        borderRadius: "var(--r-md)",
        padding: "22px 26px",
        marginBottom: 14,
        boxShadow: "var(--shadow)",
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
          borderBottom: "1px solid var(--border-sub)",
          color: "var(--text)",
        }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

function PlaceholderPanel({ title, copy }: { title: string; copy: string }) {
  return (
    <BriefSection title={title}>
      <p style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.7, margin: 0 }}>
        {copy}
      </p>
    </BriefSection>
  );
}

function SideCard({
  label,
  children,
  deadline,
}: {
  label: string;
  children: React.ReactNode;
  deadline?: boolean;
}) {
  return (
    <div
      style={{
        background: deadline ? "var(--critical-bg)" : "var(--surface)",
        border: deadline ? "1px solid var(--critical-bd)" : "1px solid var(--border-sub)",
        borderRadius: "var(--r-md)",
        padding: "14px 16px",
        boxShadow: "var(--shadow)",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: deadline ? "var(--critical)" : "var(--muted)",
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "78px 1fr", gap: "6px 10px", fontSize: 12.5, lineHeight: 1.55 }}>
        {children}
      </div>
    </div>
  );
}

function KV({ k, v }: { k: string; v?: string | null }) {
  if (!v) return null;
  return (
    <>
      <div style={{ color: "var(--muted)", fontWeight: 600 }}>{k}</div>
      <div style={{ color: "var(--text)", fontWeight: 600 }}>{v}</div>
    </>
  );
}

function DeadlineCard({ effective }: { effective: { value: string; sub?: string } }) {
  return (
    <div
      style={{
        background: "var(--critical-bg)",
        border: "1px solid var(--critical-bd)",
        borderRadius: "var(--r-md)",
        padding: "14px 16px",
        boxShadow: "var(--shadow)",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--critical)",
          marginBottom: 8,
        }}
      >
        Next deadline
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 36,
          lineHeight: 1,
          color: "var(--critical)",
          marginBottom: 8,
        }}
      >
        {effective.value}
      </div>
      <p style={{ fontSize: 12, lineHeight: 1.55, margin: 0, color: "var(--text)" }}>
        {effective.sub || "Action required: review obligations and assign owner."}
      </p>
    </div>
  );
}

function SummaryPanel({
  r,
  changelog,
  dispute,
  onNavigateToFullSection,
  pendingFullSectionAnchor,
  onAnchorConsumed,
}: {
  r: Resource;
  changelog: ChangeLogEntry[];
  dispute: Dispute | null;
  onNavigateToFullSection: (slug: string) => void;
  pendingFullSectionAnchor: string | null;
  onAnchorConsumed: () => void;
}) {
  // Tier 2 — Operational briefing extraction. Computed at render-time
  // from full_brief markdown. For non-regulatory_fact_document briefs
  // (technology_profile, operations_profile, etc.) the three target
  // sections won't appear in the markdown, so the briefing returns all
  // null and the expander is omitted (per audit section 6).
  const operationalBriefing = useMemo(
    () => (r.fullBrief ? extractOperationalBriefing(r.fullBrief) : null),
    [r.fullBrief]
  );

  return (
    <>
      {/* AI summary block — Tier 1 (~100 word AI summary) */}
      {(r.whatIsIt || r.note) && (
        <div
          style={{
            background: "var(--accent-strip)",
            border: "1px solid var(--accent-strip-bd)",
            borderRadius: "var(--r-md)",
            padding: "16px 20px",
            marginBottom: 16,
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
                color: "var(--accent)",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Sparkles size={12} />
              AI plain-language summary
            </span>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>Generated</span>
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.6, margin: 0, color: "var(--text)" }}>
            {r.whatIsIt || r.note}
          </p>
        </div>
      )}

      {/* Tier 2 — Operational briefing.
          Renders only for regulatory_fact_document briefs that have at
          least one of the three target sections populated. Non-regulatory
          briefs (technology_profile, etc.) don't have these sections in
          their markdown so we collapse the affordance entirely. */}
      {operationalBriefing && (
        <OperationalBriefingExpander
          briefing={operationalBriefing}
          onNavigateToFullSection={onNavigateToFullSection}
        />
      )}

      {/* Inline horizontal Timeline — PR-F (F22).
          Reuses TimelineBar from /components/resource/TimelineBar.tsx
          (already horizontal with milestones, dates, and countdown).
          Sits in the Summary content flow between the Tier 2 operational
          briefing and the impact bars so users see the regulation
          lifecycle inline before drilling into impact / changelog detail.
          Hidden when no timeline data — honest empty pattern. */}
      {r.timeline && r.timeline.length > 0 && (
        <BriefSection title="Timeline">
          <TimelineBar
            items={r.timeline}
            color={TOPIC_COLORS[r.topic || ""] || undefined}
          />
        </BriefSection>
      )}

      {/* Impact assessment — gradient bars */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border-sub)",
          borderRadius: "var(--r-md)",
          padding: "16px 20px",
          marginBottom: 16,
        }}
      >
        <ImpactScores scores={r.impactScores ?? scoreResource(r)} />
      </div>

      {/* What changed */}
      {changelog.length > 0 && (
        <BriefSection title="What changed">
          {changelog.map((c, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              {c.fields && c.fields.length > 0 && (
                <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", margin: "0 0 4px" }}>
                  {c.fields.join(", ")}
                </p>
              )}
              {c.prev && (
                <p style={{ fontSize: 14, lineHeight: 1.7, color: "var(--text-2)", margin: 0, textDecoration: "line-through" }}>
                  {c.prev}
                </p>
              )}
              {c.now && (
                <p style={{ fontSize: 14, lineHeight: 1.7, color: "var(--text)", margin: 0, fontWeight: 600 }}>
                  {c.now}
                </p>
              )}
              {c.impact && (
                <p style={{ fontSize: 12, lineHeight: 1.6, color: "var(--high)", margin: "4px 0 0" }}>
                  Impact: {c.impact}
                </p>
              )}
            </div>
          ))}
        </BriefSection>
      )}

      {/* Why it matters */}
      {(r.whyMatters || r.reasoning) && (
        <BriefSection title="Why it matters">
          {r.reasoning && (
            <div
              style={{
                borderLeft: "3px solid var(--accent)",
                paddingLeft: 16,
                fontSize: 14.5,
                lineHeight: 1.7,
                margin: "0 0 16px",
                color: "var(--text)",
              }}
            >
              {r.reasoning}
            </div>
          )}
          {r.whyMatters && (
            <p style={{ fontSize: 14, lineHeight: 1.7, margin: 0, color: "var(--text)" }}>
              {r.whyMatters}
            </p>
          )}
        </BriefSection>
      )}

      {/* Key data */}
      {r.keyData && r.keyData.length > 0 && (
        <BriefSection title="Key data">
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.75 }}>
            {r.keyData.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </BriefSection>
      )}

      {/* Recommended actions */}
      {r.recommendedActions && r.recommendedActions.length > 0 && (
        <BriefSection title="Recommended actions">
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.75 }}>
            {r.recommendedActions.map((a, i) => (
              <li key={i}>
                <b>{a.action}</b>
                {a.owner && ` — ${a.owner}`}
                {a.timeframe && ` (${a.timeframe})`}
              </li>
            ))}
          </ul>
        </BriefSection>
      )}

      {/* Dispute */}
      {dispute?.note && (
        <BriefSection title="Disputed">
          <p style={{ fontSize: 14, lineHeight: 1.7, color: "var(--text)", margin: "0 0 8px" }}>
            {dispute.note}
          </p>
          {dispute.sources && dispute.sources.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {dispute.sources.map((s, i) =>
                s.url ? (
                  <a
                    key={i}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 11,
                      padding: "3px 8px",
                      borderRadius: 3,
                      background: "var(--high-bg)",
                      color: "var(--high)",
                      border: "1px solid var(--high-bd)",
                      textDecoration: "none",
                    }}
                  >
                    {s.name}
                  </a>
                ) : (
                  <span
                    key={i}
                    style={{
                      fontSize: 11,
                      padding: "3px 8px",
                      borderRadius: 3,
                      background: "var(--high-bg)",
                      color: "var(--high)",
                      border: "1px solid var(--high-bd)",
                    }}
                  >
                    {s.name}
                  </span>
                )
              )}
            </div>
          )}
        </BriefSection>
      )}

      {/* Inline Full text — Decision #12 merge.
          Pre-#12 this lived behind a separate "Full text" tab. Now it's
          the bottom-most section of Summary. PR #24's
          navigateToFullSection helper still scrolls to a heading slug
          inside this panel — see the rewire in RegulationDetailSurface
          (it now sets the anchor and ensures the Summary tab is active,
          rather than switching tabs to "full"). */}
      {(r.fullBrief || r.url) && (
        <BriefSection title="Full text">
          {r.fullBrief ? (
            <FullTextPanel
              markdown={r.fullBrief}
              pendingAnchorSlug={pendingFullSectionAnchor}
              onAnchorConsumed={onAnchorConsumed}
            />
          ) : (
            <p style={{ fontSize: 14, lineHeight: 1.7, margin: 0 }}>
              Full regulatory text is hosted at the source —{" "}
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--accent)" }}
              >
                open original document
              </a>
              .
            </p>
          )}
        </BriefSection>
      )}
    </>
  );
}

// ── Tier 2 (Operational Briefing) components ───────────────────────────────

/** Tier 2 expander.
 *
 * Closed: a compact button-style affordance with subtitle.
 * Open: severity callout (when an Immediate Action paragraph leads with a
 * severity label) plus three stacked subsections, each linking to its
 * full counterpart in the Full text tab via onNavigateToFullSection. */
function OperationalBriefingExpander({
  briefing,
  onNavigateToFullSection,
}: {
  briefing: {
    immediateAction: ExtractedSection | null;
    whatItIsWhyItApplies: ExtractedSection | null;
    complianceChain: ExtractedSection | null;
  };
  onNavigateToFullSection: (slug: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const sections: Array<{
    key: "immediateAction" | "whatItIsWhyItApplies" | "complianceChain";
    label: string;
    section: ExtractedSection | null;
  }> = [
    {
      key: "immediateAction",
      label: "Issues requiring immediate action",
      section: briefing.immediateAction,
    },
    {
      key: "whatItIsWhyItApplies",
      label: "What this regulation is and why it applies",
      section: briefing.whatItIsWhyItApplies,
    },
    {
      key: "complianceChain",
      label: "How the workspace sits in the compliance chain",
      section: briefing.complianceChain,
    },
  ];

  // Suppress the expander entirely when none of the three sections has
  // substantive content. This is the non-regulatory_fact_document case
  // (technology_profile etc.) where Tier 2 doesn't apply.
  const hasAnyContent = sections.some((s) => s.section?.hasContent);
  if (!hasAnyContent) return null;

  // Severity callout uses the first paragraph of Immediate Action. The
  // callout is the elevated "ACTION REQUIRED — first sentence" block at
  // the top of the open expander (Task C).
  const immediateFirstP =
    briefing.immediateAction?.firstParagraphs?.[0] ?? "";
  const severity = extractSeverityLabel(immediateFirstP);

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border-sub)",
        borderRadius: "var(--r-md)",
        padding: open ? "16px 20px 18px" : "12px 16px",
        marginBottom: 16,
        boxShadow: "var(--shadow)",
        transition: "padding 200ms ease",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          background: "transparent",
          border: 0,
          padding: 0,
          cursor: "pointer",
          fontFamily: "inherit",
          textAlign: "left",
          color: "var(--text)",
        }}
        aria-expanded={open}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            fontWeight: 700,
            color: "var(--text)",
          }}
        >
          <Sparkles size={14} style={{ color: "var(--accent)" }} aria-hidden />
          Read operational briefing
        </span>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            color: "var(--text-2)",
            fontSize: 12,
          }}
        >
          <span
            style={{
              fontSize: 11,
              color: "var(--muted)",
              fontWeight: 500,
            }}
          >
            {open ? "Collapse" : "What to do, when, who's affected · 30-second scan"}
          </span>
          {open ? (
            <ChevronDown size={14} aria-hidden />
          ) : (
            <ChevronRight size={14} aria-hidden />
          )}
        </span>
      </button>

      {open && (
        <div style={{ marginTop: 14 }}>
          {/* Severity callout — Task C. Only shown when the Immediate
              Action section's first paragraph leads with a recognised
              severity label per the agent's emission convention. */}
          {severity.label && (
            <SeverityCallout
              label={severity.label}
              text={firstSentence(severity.rest) || severity.rest}
            />
          )}

          {sections.map(({ key, label, section }) =>
            section?.hasContent ? (
              <OperationalBriefingSubsection
                key={key}
                label={label}
                section={section}
                showSeverity={key === "immediateAction" && !!severity.label}
                onNavigateToFullSection={onNavigateToFullSection}
              />
            ) : null
          )}
        </div>
      )}
    </div>
  );
}

function OperationalBriefingSubsection({
  label,
  section,
  showSeverity,
  onNavigateToFullSection,
}: {
  label: string;
  section: ExtractedSection;
  showSeverity: boolean;
  onNavigateToFullSection: (slug: string) => void;
}) {
  const slug = headingSlug(section.heading);
  // First paragraph: when the Immediate Action subsection rendered a
  // severity callout above, strip the leading severity label from the
  // body paragraph so we don't duplicate the callout text.
  const paragraphs = section.firstParagraphs.map((p, i) => {
    if (i === 0 && showSeverity) {
      const stripped = extractSeverityLabel(p);
      return stripped.label ? stripped.rest : p;
    }
    return p;
  });

  return (
    <section style={{ marginTop: 14 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--text-2)",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {paragraphs.map((p, i) => (
        <p
          key={i}
          style={{
            fontSize: 13.5,
            lineHeight: 1.65,
            color: "var(--text)",
            margin: i === 0 ? "0 0 8px" : "0 0 8px",
          }}
        >
          {/* Strip leading bold markdown markers so the paragraph reads
              as prose — the markdown renderer is in Tier 3, the Tier 2
              preview is plain text. */}
          {stripLightMarkdown(p)}
        </p>
      ))}
      <button
        type="button"
        onClick={() => onNavigateToFullSection(slug)}
        style={{
          background: "transparent",
          border: 0,
          padding: 0,
          fontFamily: "inherit",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--accent)",
          cursor: "pointer",
          letterSpacing: "0.02em",
        }}
      >
        Read full {label.toLowerCase()} in regulatory analysis →
      </button>
    </section>
  );
}

function SeverityCallout({
  label,
  text,
}: {
  label: SeverityLabel;
  text: string;
}) {
  const tone = SEVERITY_LABEL_TONE[label];
  return (
    <div
      role="note"
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        background: tone.bg,
        border: `1px solid ${tone.bd}`,
        borderLeft: `4px solid ${tone.color}`,
        borderRadius: "var(--r-sm)",
        padding: "10px 14px",
        marginBottom: 4,
      }}
    >
      <AlertTriangle
        size={16}
        style={{ color: tone.color, flexShrink: 0, marginTop: 2 }}
        aria-hidden
      />
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: tone.color,
            marginBottom: 4,
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: 13,
            lineHeight: 1.55,
            color: "var(--text)",
          }}
        >
          {stripLightMarkdown(text)}
        </div>
      </div>
    </div>
  );
}

/** Tier 3 wrapper — renders the IntelligenceBrief markdown and, when a
 * Tier 2 deep-link queues a section anchor, scrolls to the matching
 * heading id once the markdown has rendered.
 *
 * IntelligenceBrief composes heading ids as `${briefId}-${slug}` (its
 * briefId is a per-render useId() value). We don't have access to that
 * briefId here, so we resolve the actual element by querying the
 * intelligence-brief root for an element whose id ends with `-${slug}`. */
function FullTextPanel({
  markdown,
  pendingAnchorSlug,
  onAnchorConsumed,
}: {
  markdown: string;
  pendingAnchorSlug: string | null;
  onAnchorConsumed: () => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!pendingAnchorSlug) return;
    // Defer one frame so the markdown DOM has rendered before we query.
    const raf = requestAnimationFrame(() => {
      const root = rootRef.current;
      if (!root) return;
      // IntelligenceBrief composes heading ids as `${briefId}-${slug}`;
      // the briefId is a per-render useId() value we don't have access
      // to here, so we match by id-suffix.
      const target = root.querySelector(
        `[id$="-${cssEscape(pendingAnchorSlug)}"]`
      ) as HTMLElement | null;
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        // Brief flash-highlight to anchor the eye on arrival.
        const prev = target.style.backgroundColor;
        target.style.transition = "background-color 600ms ease";
        target.style.backgroundColor = "var(--accent-bg)";
        window.setTimeout(() => {
          target.style.backgroundColor = prev;
        }, 1200);
      }
      onAnchorConsumed();
    });
    return () => cancelAnimationFrame(raf);
  }, [pendingAnchorSlug, onAnchorConsumed]);

  return (
    <div ref={rootRef}>
      <IntelligenceBrief markdown={markdown} />
    </div>
  );
}

/** Tiny CSS.escape() shim. CSS.escape is widely supported but not in
 * older test runtimes — we fall back to simple alnum/hyphen escaping
 * because headingSlug already produces alnum/hyphen strings. */
function cssEscape(s: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(s);
  }
  return s.replace(/[^a-zA-Z0-9-_]/g, (ch) => `\\${ch}`);
}

/** Strip light markdown markers (bold/italic/inline-code) for the Tier 2
 * plain-text preview. We don't run a full markdown parser here — Tier 3
 * is where ReactMarkdown does the real rendering. */
function stripLightMarkdown(s: string): string {
  if (!s) return s;
  return s
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/_([^_]+)_/g, "$1");
}

/** Pull the first sentence out of a paragraph. Used for the severity
 * callout body so we don't dump the entire first paragraph into the
 * elevated callout — that paragraph also renders below as the first
 * paragraph of the Immediate Action subsection. */
function firstSentence(text: string): string {
  if (!text) return text;
  const m = /^([\s\S]+?[.!?])(\s|$)/.exec(text);
  return m ? m[1] : text;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function nextDeadline(r: Resource): { value: string; sub?: string } {
  const candidates: string[] = [];
  if (r.timeline) {
    for (const t of r.timeline) {
      if (t.status !== "past") candidates.push(t.date);
    }
  }
  if (r.complianceDeadline) candidates.push(r.complianceDeadline);
  const future = candidates
    .map((d) => new Date(d))
    .filter((d) => !isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime())[0];
  if (!future) return { value: "—", sub: r.complianceDeadline || "No deadline on record" };
  const days = Math.round((future.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const dateLabel = future.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  if (days < 0) return { value: dateLabel, sub: "Already in effect" };
  return { value: `${days}d`, sub: dateLabel };
}
