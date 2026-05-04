"use client";

/**
 * RegulationDetailSurface — client subcomponent for /regulations/[id].
 *
 * Owns tab state (Summary / Exposure / Penalty calculator / Timeline /
 * Full text / Sources / Notes) and renders the matching panel below.
 * The hero card, 4-stat strip, and right-rail metadata are rendered
 * here too because they share state with the action buttons.
 *
 * Layout matches design_handoff_2026-04/preview/regulation-detail.html:
 *   - Hero card with mode chips, title row + pills, deck, tag chips, actions
 *   - 4-stat strip: Effective / Penalty rate / Your exposure / Lanes
 *   - Tab bar (3px accent underline on active tab)
 *   - Layout grid: main panel (1fr) + 320px right rail
 *   - Default Summary panel: AI summary block + What changed + Why it matters
 */

import { useState } from "react";
import { Sparkles, AlertTriangle } from "lucide-react";
import { TimelineBar } from "@/components/resource/TimelineBar";
import { TOPIC_COLORS, JURISDICTIONS } from "@/lib/constants";
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

type TabKey =
  | "summary"
  | "exposure"
  | "calculator"
  | "timeline"
  | "full"
  | "sources"
  | "notes";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "summary", label: "Summary" },
  { key: "exposure", label: "Exposure" },
  { key: "calculator", label: "Penalty calculator" },
  { key: "timeline", label: "Timeline" },
  { key: "full", label: "Full text" },
  { key: "sources", label: "Sources" },
  { key: "notes", label: "Team notes" },
];

const PRIORITY_TONE: Record<
  string,
  { bg: string; bd: string; color: string; label: string }
> = {
  CRITICAL: {
    bg: "var(--critical-bg)",
    bd: "var(--critical-bd)",
    color: "var(--critical)",
    label: "Critical",
  },
  HIGH: {
    bg: "var(--high-bg)",
    bd: "var(--high-bd)",
    color: "var(--high)",
    label: "High",
  },
  MODERATE: {
    bg: "var(--moderate-bg)",
    bd: "var(--moderate-bd)",
    color: "var(--moderate)",
    label: "Moderate",
  },
  LOW: {
    bg: "var(--low-bg)",
    bd: "var(--low-bd)",
    color: "var(--low)",
    label: "Low",
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
  const jurisLabel =
    JURISDICTIONS.find((j) => j.id === r.jurisdiction)?.label || r.jurisdiction || "Global";

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

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
            marginBottom: 10,
            flexWrap: "wrap",
          }}
        >
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 30,
              fontWeight: 400,
              letterSpacing: "0.01em",
              margin: 0,
              lineHeight: 1.05,
              color: "var(--text)",
            }}
          >
            {r.title}
          </h2>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
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
          <ActionButton primary>+ Add to watchlist</ActionButton>
          <ActionButton>Export brief</ActionButton>
          <ActionButton>Share</ActionButton>
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
        <Stat label="Effective" value={effective.value} sub={effective.sub} />
        <Stat
          label="Penalty rate"
          value={r.penaltyRange || "—"}
          critical
          sub={r.enforcementBody}
        />
        <Stat label="Your exposure" value={yourExposure} sub="Workspace data pending" />
        <Stat label="Lanes affected" value={lanesAffected} sub="Of active lanes" />
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
              {t.key === "notes" && " (0)"}
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
          {tab === "full" && (
            <BriefSection title="Full text">
              {r.fullBrief ? (
                <div
                  style={{ fontSize: 14, lineHeight: 1.7, color: "var(--text)", whiteSpace: "pre-wrap" }}
                >
                  {r.fullBrief}
                </div>
              ) : r.url ? (
                <p style={{ fontSize: 14, lineHeight: 1.7, margin: 0 }}>
                  Full regulatory text is hosted at the source —{" "}
                  <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>
                    open original document
                  </a>
                  .
                </p>
              ) : (
                <p style={{ fontSize: 14, color: "var(--muted)", margin: 0 }}>
                  No long-form text on record yet.
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
          {tab === "notes" && (
            <PlaceholderPanel
              title="Team notes"
              copy="Threaded team notes for this regulation. Connect once collaboration data lands."
            />
          )}
        </div>

        {/* Right rail */}
        <aside style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <DeadlineCard effective={effective} />
          <SideCard label="Identification">
            <KV k="ID" v={r.id} />
            <KV k="Type" v={r.type} />
            {r.legalInstrument && <KV k="Instrument" v={r.legalInstrument} />}
            {r.enforcementBody && <KV k="Publisher" v={r.enforcementBody} />}
            <KV k="Effective" v={r.complianceDeadline || effective.sub} />
            {r.lastVerifiedDate && <KV k="Reviewed" v={r.lastVerifiedDate} />}
          </SideCard>
          <SideCard label="Coverage">
            <KV k="Jurisdiction" v={jurisLabel || "Global"} />
            <KV k="Modes" v={modes.map((m) => m.toUpperCase()).join(", ")} />
            {r.topic && <KV k="Topic" v={r.topic} />}
          </SideCard>
          <SideCard label="Owners">
            <KV k="Owner" v={r.actionOwner || "Unassigned"} />
            <KV k="Priority" v={r.priority} />
          </SideCard>
          {(xrefIds.length > 0 || refByIds.length > 0 || supersessions.length > 0) && (
            <SideCard label="Related">
              {[...xrefIds, ...refByIds].slice(0, 6).map((id) => {
                const ref = resourceLookup[id];
                if (!ref) return null;
                return (
                  <a
                    key={id}
                    href={`/regulations/${encodeURIComponent(id)}`}
                    style={{
                      display: "block",
                      fontSize: 12.5,
                      lineHeight: 1.55,
                      color: "var(--text)",
                      textDecoration: "none",
                      padding: "4px 0",
                    }}
                  >
                    {ref.title}
                  </a>
                );
              })}
            </SideCard>
          )}
        </aside>
      </div>
    </div>
  );
}

// ── Subcomponents ───────────────────────────────────────────────────────────

function ActionButton({
  children,
  primary,
}: {
  children: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
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
}: {
  r: Resource;
  changelog: ChangeLogEntry[];
  dispute: Dispute | null;
}) {
  return (
    <>
      {/* AI summary block */}
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
    </>
  );
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
