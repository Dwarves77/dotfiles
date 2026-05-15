"use client";

/**
 * ResearchView — Phase C / Block C surface.
 *
 * Mirrors design_handoff_2026-04/preview/research.html:
 *   - Stage legend strip
 *   - 4-up StatStrip with "Active review" as the primary tile
 *   - AiPromptBar with research-specific chips
 *   - Tabs: Pipeline (default) | Source coverage
 *   - Pipeline tab: filter bar (stage + region) + collapsible row cards
 *   - Source coverage tab: modes × regions matrix with colored-dot encoding
 *
 * Counts come from the intelligence_items.pipeline_stage column (added in
 * migration 026 and backfilled to 'published' for existing rows). The
 * server fetches a slim view of intelligence_items (id, title, summary,
 * pipeline_stage, transport_modes, jurisdictions, source name + URL,
 * added_date) and passes the array in here.
 *
 * Coverage matrix is a stub for now (data: real for the count column,
 * stubbed for the per-cell coverage state). See REPORT BACK note in the
 * Phase C handoff — wiring this fully requires per-(mode, region)
 * rollups that the source registry doesn't yet expose.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { EditorialMasthead } from "@/components/ui/EditorialMasthead";
import { AiPromptBar } from "@/components/ui/AiPromptBar";
import { StatStrip, type StatTone } from "@/components/shell/StatStrip";

// ── Types ──

export interface ResearchPipelineItem {
  id: string;
  title: string;
  summary: string;
  /** 'draft' | 'active_review' | 'published' | 'archived' | null */
  pipelineStage: string | null;
  transportModes: string[];
  jurisdictions: string[];
  /** Source name + URL (joined from sources table). */
  sourceName: string | null;
  sourceUrl: string | null;
  /** Display date for "First seen" column. */
  addedDate: string | null;
  /** Owner / researcher (placeholder until owner field lands). */
  owner: string | null;
  partnerFlagged: boolean;
}

interface ResearchViewProps {
  items: ResearchPipelineItem[];
}

// ── Date helpers ──

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatDateUTC(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Returns true when an ISO date is within the trailing 7 days (UTC). */
function isWithinLast7Days(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  const now = Date.now();
  const ageMs = now - d.getTime();
  return ageMs >= 0 && ageMs <= 7 * 24 * 60 * 60 * 1000;
}

// ── Stage metadata ──

type Stage = "draft" | "active_review" | "published" | "archived";

const STAGE_LABEL: Record<Stage, string> = {
  draft: "Draft",
  active_review: "Active review",
  published: "Published",
  archived: "Archived",
};

const STAGE_DOT_COLOR: Record<Stage, string> = {
  draft: "var(--text-2)",
  active_review: "var(--high)",
  published: "var(--low)",
  archived: "var(--text-2)",
};

const STAGE_PILL_TONE: Record<Stage, { color: string; bg: string; bd: string }> = {
  draft:         { color: "var(--text-2)", bg: "var(--bg)",        bd: "var(--border)" },
  active_review: { color: "var(--high)",   bg: "var(--high-bg)",   bd: "var(--high-bd)" },
  published:     { color: "var(--low)",    bg: "var(--low-bg)",    bd: "var(--low-bd)" },
  archived:      { color: "var(--text-2)", bg: "var(--bg)",        bd: "var(--border-sub)" },
};

const STAGE_HELPER: Record<Stage, string> = {
  draft: "Internal — researcher building the file",
  active_review: "Awaiting validator sign-off",
  published: "Live in regulations & intel",
  archived: "Superseded or out-of-scope",
};

const STAGE_TONE: Record<Stage, StatTone> = {
  draft: "muted",
  active_review: "high",
  published: "low",
  archived: "muted",
};

const STAGE_ICON: Record<Stage, string> = {
  draft: "▢",
  active_review: "◑",
  published: "●",
  archived: "○",
};

// ── Region + mode metadata for the coverage matrix ──

const COVERAGE_MODES = ["Ocean", "Air", "Road", "Facility"] as const;
const COVERAGE_REGIONS = ["EU", "UK", "US Federal", "California", "Singapore", "China", "UAE"] as const;

type CoverageState = "full" | "partial" | "none";
const COVERAGE_DOT: Record<CoverageState, string> = {
  full: "var(--low)",
  partial: "var(--moderate)",
  none: "var(--text-2)",
};
const COVERAGE_LABEL: Record<CoverageState, string> = {
  full: "Full",
  partial: "Partial",
  none: "Not yet",
};

/**
 * Stub coverage matrix. The real wiring requires per-(mode × region)
 * source rollups. Until then, hard-coded placeholder values mirror
 * the editorial coverage story.
 */
const COVERAGE_MATRIX: Record<string, Record<string, CoverageState>> = {
  Ocean:    { EU: "full",    UK: "full",    "US Federal": "partial", California: "partial", Singapore: "full",    China: "partial", UAE: "partial" },
  Air:      { EU: "full",    UK: "full",    "US Federal": "full",    California: "full",    Singapore: "partial", China: "partial", UAE: "partial" },
  Road:     { EU: "partial", UK: "full",    "US Federal": "partial", California: "full",    Singapore: "none",    China: "partial", UAE: "none" },
  Facility: { EU: "partial", UK: "partial", "US Federal": "none",    California: "partial", Singapore: "none",    China: "none",    UAE: "partial" },
};

// ── Helpers ──

function normalizeStage(s: string | null): Stage {
  if (s === "draft" || s === "active_review" || s === "published" || s === "archived") {
    return s;
  }
  // NULL/legacy → published per migration 026 backfill semantics.
  return "published";
}

function regionLabel(jurisdictions: string[]): string {
  if (!jurisdictions.length) return "Global";
  const first = jurisdictions[0];
  const map: Record<string, string> = {
    eu: "EU",
    uk: "UK",
    us: "US",
    "us-ca": "California",
    california: "California",
    singapore: "Singapore",
    china: "China",
    uae: "UAE",
    global: "Global",
  };
  return map[first.toLowerCase()] || first.toUpperCase();
}

function modeLabel(modes: string[]): string {
  if (!modes.length) return "All modes";
  return modes
    .map((m) => m.charAt(0).toUpperCase() + m.slice(1))
    .join(" · ");
}

// ── Component ──

export function ResearchView({ items }: ResearchViewProps) {
  const [tab, setTab] = useState<"pipeline" | "sources">("pipeline");
  const [stageFilter, setStageFilter] = useState<"all" | Stage>("all");
  const [regionFilter, setRegionFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Stage counts from pipeline_stage column.
  const stageCounts = useMemo(() => {
    const counts: Record<Stage, number> = {
      draft: 0,
      active_review: 0,
      published: 0,
      archived: 0,
    };
    for (const item of items) {
      counts[normalizeStage(item.pipelineStage)]++;
    }
    return counts;
  }, [items]);

  // Available regions for the filter dropdown.
  const availableRegions = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) set.add(regionLabel(item.jurisdictions));
    return Array.from(set).sort();
  }, [items]);

  // Items published in the trailing 7 days — drives the "What's new this week" callout.
  const publishedThisWeek = useMemo(
    () =>
      items.filter(
        (i) =>
          normalizeStage(i.pipelineStage) === "published" &&
          isWithinLast7Days(i.addedDate)
      ),
    [items]
  );

  // Filtered pipeline items.
  const filteredItems = useMemo(() => {
    let list = items;
    if (stageFilter !== "all") {
      list = list.filter((i) => normalizeStage(i.pipelineStage) === stageFilter);
    }
    if (regionFilter !== "all") {
      list = list.filter((i) => regionLabel(i.jurisdictions) === regionFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.summary.toLowerCase().includes(q) ||
          (i.sourceName?.toLowerCase().includes(q) ?? false)
      );
    }
    return list;
  }, [items, stageFilter, regionFilter, searchQuery]);

  // Stat tiles — Active review is primary.
  const statTiles = (["draft", "active_review", "published", "archived"] as Stage[]).map((s) => ({
    tone: STAGE_TONE[s],
    eyebrow: STAGE_LABEL[s],
    helper: STAGE_HELPER[s],
    icon: STAGE_ICON[s],
    numeral: stageCounts[s],
    primary: s === "active_review",
    onClick: () => {
      setTab("pipeline");
      setStageFilter(s);
    },
    ariaLabel: `${STAGE_LABEL[s]} — ${stageCounts[s]} items`,
  }));

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh" }}>
      <EditorialMasthead
        title="Research Pipeline"
        meta="The regulations and consultations our team is tracking, drafting, or has already published. Each item shows where it sits in our review pipeline, which sources we monitor, and who owns it."
      />

      <div style={{ padding: "28px 36px 60px" }}>
        {/* Legend strip */}
        <div
          style={{
            display: "flex",
            gap: 18,
            flexWrap: "wrap",
            padding: "6px 0 14px",
            fontSize: 11,
            color: "var(--text-2)",
          }}
        >
          {(["draft", "active_review", "published", "archived"] as Stage[]).map((s) => (
            <span
              key={s}
              style={{ display: "inline-flex", gap: 6, alignItems: "center" }}
            >
              <span
                aria-hidden="true"
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: STAGE_DOT_COLOR[s],
                }}
              />
              <b style={{ fontWeight: 800, letterSpacing: "0.06em" }}>{STAGE_LABEL[s]}</b>{" "}
              <span>{STAGE_HELPER[s]}</span>
            </span>
          ))}
        </div>

        {/* 4-up Stat strip */}
        <div style={{ marginBottom: 22 }}>
          <StatStrip tiles={statTiles} />
        </div>

        {/* AI prompt bar */}
        <div style={{ marginBottom: 22 }}>
          <AiPromptBar
            placeholder="Ask anything about your research pipeline — e.g. What's queued for the EU?"
            chips={[
              "What's queued for the EU?",
              "Partner-flagged this month",
              "Show recent publishes",
            ]}
          />
        </div>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: 0,
            borderBottom: "1px solid var(--border-sub)",
            marginBottom: 8,
          }}
        >
          {([
            { id: "pipeline" as const, label: "Pipeline" },
            // Source coverage tab is hidden until the source registry rollup
            // endpoint exists. The COVERAGE_MATRIX values below are stub
            // placeholders that would mislead workspace users. Re-enable by
            // restoring this entry once the rollup endpoint lands.
            // { id: "sources" as const, label: "Source coverage" },
          ]).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: "12px 18px",
                fontSize: 13,
                fontWeight: 700,
                color: tab === t.id ? "var(--accent)" : "var(--text-2)",
                borderBottom:
                  tab === t.id
                    ? "3px solid var(--accent)"
                    : "3px solid transparent",
                background: "transparent",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {t.label}
            </button>
          ))}
          {/* Single-line user-visible note for the deferred Source coverage tab.
              Per Decision 2, the tab itself stays hidden until the source
              registry rollup endpoint lands; this signpost tells users it's
              coming so they don't assume the surface is missing. */}
          <span
            style={{
              marginLeft: "auto",
              alignSelf: "center",
              padding: "0 4px",
              fontSize: 11,
              color: "var(--text-2)",
              fontStyle: "italic",
            }}
          >
            Source coverage matrix arriving with registry rollup, ETA Phase D
          </span>
        </div>

        {tab === "pipeline" && (
          <div style={{ paddingTop: 22 }}>
            <h3
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 26,
                fontWeight: 400,
                letterSpacing: "0.02em",
                margin: "0 0 6px",
                color: "var(--text)",
              }}
            >
              Currently in pipeline
            </h3>
            <p
              style={{
                fontSize: 14,
                lineHeight: 1.5,
                color: "var(--text-2)",
                margin: "0 0 14px",
                maxWidth: "88ch",
              }}
            >
              The queue of regulations and consultations our team is tracking — items being drafted, awaiting validator sign-off, and recently published. Each row traces back to a primary source feed.
            </p>

            {/* Quick counter callout — reuses stageCounts + publishedThisWeek */}
            <div
              role="status"
              aria-live="polite"
              style={{
                display: "flex",
                gap: 18,
                flexWrap: "wrap",
                fontSize: 12,
                color: "var(--text-2)",
                padding: "10px 14px",
                background: "var(--surface)",
                border: "1px solid var(--border-sub)",
                borderRadius: "var(--r-sm)",
                margin: "0 0 14px",
              }}
            >
              <span>
                <b style={{ color: "var(--text)", fontWeight: 800 }}>{stageCounts.active_review}</b>{" "}
                in active review
              </span>
              <span style={{ color: "var(--border)" }} aria-hidden="true">·</span>
              <span>
                <b style={{ color: "var(--text)", fontWeight: 800 }}>{stageCounts.draft}</b>{" "}
                in draft
              </span>
              <span style={{ color: "var(--border)" }} aria-hidden="true">·</span>
              <span>
                <b style={{ color: "var(--text)", fontWeight: 800 }}>{publishedThisWeek.length}</b>{" "}
                published this week
              </span>
              <span style={{ color: "var(--border)" }} aria-hidden="true">·</span>
              <span>
                <b style={{ color: "var(--text)", fontWeight: 800 }}>{stageCounts.published}</b>{" "}
                live in regulations &amp; intel
              </span>
            </div>

            {/* What's new this week — only renders if there are recent published items */}
            {publishedThisWeek.length > 0 && (
              <div
                style={{
                  padding: "12px 14px",
                  margin: "0 0 18px",
                  background: "var(--low-bg)",
                  border: "1px solid var(--low-bd)",
                  borderRadius: "var(--r-sm)",
                  fontSize: 12.5,
                  lineHeight: 1.55,
                  color: "var(--text)",
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "var(--low)",
                    marginBottom: 6,
                  }}
                >
                  What&apos;s new this week
                </div>
                <div style={{ color: "var(--text-2)" }}>
                  {publishedThisWeek.length === 1
                    ? "1 regulation went live in the last 7 days:"
                    : `${publishedThisWeek.length} regulations went live in the last 7 days:`}
                </div>
                <ul
                  style={{
                    margin: "6px 0 0",
                    padding: "0 0 0 18px",
                    listStyle: "disc",
                  }}
                >
                  {publishedThisWeek.slice(0, 4).map((p) => (
                    <li key={p.id} style={{ marginBottom: 2 }}>
                      <b style={{ fontWeight: 700 }}>{p.title}</b>
                      {p.sourceName ? (
                        <span style={{ color: "var(--text-2)" }}> · {p.sourceName}</span>
                      ) : null}
                    </li>
                  ))}
                  {publishedThisWeek.length > 4 && (
                    <li style={{ color: "var(--text-2)", listStyle: "none", marginLeft: -18 }}>
                      &nbsp;+ {publishedThisWeek.length - 4} more — filter to <b>Published</b> below to see all.
                    </li>
                  )}
                </ul>
              </div>
            )}

            {/* Per-stage description helper — explains what stage filters mean */}
            <p
              style={{
                fontSize: 12,
                lineHeight: 1.5,
                color: "var(--text-2)",
                margin: "0 0 10px",
                maxWidth: "88ch",
              }}
            >
              <b style={{ color: "var(--text)", fontWeight: 700 }}>Draft</b> {STAGE_HELPER.draft.toLowerCase()}.{" "}
              <b style={{ color: "var(--text)", fontWeight: 700 }}>Active review</b> {STAGE_HELPER.active_review.toLowerCase()}.{" "}
              <b style={{ color: "var(--text)", fontWeight: 700 }}>Published</b> {STAGE_HELPER.published.toLowerCase()}.{" "}
              Partner-flagged items came from a Caro&apos;s Ledge advisor; the rest are tracked from public regulator feeds.
            </p>

            {/* Filter bar */}
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                marginBottom: 16,
                alignItems: "center",
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--text-2)",
                  marginRight: 6,
                }}
              >
                Stage
              </span>
              {([
                { id: "all" as const, label: `All (${items.length})`, helper: "All items in the pipeline regardless of stage" },
                { id: "draft" as const, label: `${STAGE_LABEL.draft} (${stageCounts.draft})`, helper: STAGE_HELPER.draft },
                { id: "active_review" as const, label: `${STAGE_LABEL.active_review} (${stageCounts.active_review})`, helper: STAGE_HELPER.active_review },
                { id: "published" as const, label: `${STAGE_LABEL.published} (${stageCounts.published})`, helper: STAGE_HELPER.published },
              ]).map((s) => (
                <button
                  key={s.id}
                  onClick={() => setStageFilter(s.id as "all" | Stage)}
                  title={s.helper}
                  aria-label={`${s.label} — ${s.helper}`}
                  style={{
                    fontFamily: "inherit",
                    fontSize: 12,
                    padding: "7px 14px",
                    background:
                      stageFilter === s.id ? "var(--accent)" : "var(--surface)",
                    border:
                      stageFilter === s.id
                        ? "1px solid var(--accent)"
                        : "1px solid var(--border)",
                    borderRadius: 999,
                    color:
                      stageFilter === s.id ? "#fff" : "var(--text-2)",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {s.label}
                </button>
              ))}

              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--text-2)",
                  marginLeft: 12,
                  marginRight: 6,
                }}
              >
                Region
              </span>
              <select
                value={regionFilter}
                onChange={(e) => setRegionFilter(e.target.value)}
                style={{
                  fontFamily: "inherit",
                  fontSize: 12,
                  padding: "7px 12px",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--r-sm)",
                  color: "var(--text-2)",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                <option value="all">All regions</option>
                {availableRegions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>

              <input
                type="text"
                placeholder="Search title, summary, source…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  flex: 1,
                  minWidth: 240,
                  padding: "8px 12px",
                  fontFamily: "inherit",
                  fontSize: 12,
                  border: "1px solid var(--border)",
                  borderRadius: "var(--r-sm)",
                  background: "var(--surface)",
                  color: "var(--text)",
                }}
              />
            </div>

            {/* Item rows */}
            {filteredItems.length === 0 ? (
              <div
                style={{
                  padding: "40px 20px",
                  textAlign: "center",
                  color: "var(--text-2)",
                  fontSize: 13,
                  background: "var(--surface)",
                  border: "1px solid var(--border-sub)",
                  borderRadius: "var(--r-md)",
                }}
              >
                No items match the current filters. Try widening the stage or region.
              </div>
            ) : (
              filteredItems.map((item) => (
                <PipelineRow key={item.id} item={item} />
              ))
            )}
          </div>
        )}

        {tab === "sources" && (
          <div style={{ paddingTop: 22 }}>
            <h3
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 26,
                fontWeight: 400,
                letterSpacing: "0.02em",
                margin: "0 0 6px",
                color: "var(--text)",
              }}
            >
              Source feeds &amp; coverage matrix
            </h3>
            <p
              style={{
                fontSize: 14,
                lineHeight: 1.5,
                color: "var(--text-2)",
                margin: "0 0 18px",
                maxWidth: "88ch",
              }}
            >
              Every regulation in the pipeline traces back to a primary source feed. This is what we monitor, how often, and where we still have gaps.
            </p>

            {/* Coverage matrix table */}
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border-sub)",
                borderRadius: "var(--r-md)",
                overflow: "auto",
                boxShadow: "var(--shadow)",
              }}
            >
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
                <thead>
                  <tr>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "12px 16px",
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: "0.14em",
                        textTransform: "uppercase",
                        color: "var(--text-2)",
                        background: "var(--raised)",
                        borderBottom: "1px solid var(--border-sub)",
                      }}
                    >
                      Mode
                    </th>
                    {COVERAGE_REGIONS.map((r) => (
                      <th
                        key={r}
                        style={{
                          textAlign: "left",
                          padding: "12px 16px",
                          fontSize: 10,
                          fontWeight: 800,
                          letterSpacing: "0.14em",
                          textTransform: "uppercase",
                          color: "var(--text-2)",
                          background: "var(--raised)",
                          borderBottom: "1px solid var(--border-sub)",
                        }}
                      >
                        {r}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {COVERAGE_MODES.map((mode) => (
                    <tr key={mode}>
                      <td
                        style={{
                          padding: "12px 16px",
                          fontSize: 13,
                          fontWeight: 700,
                          color: "var(--text)",
                          borderTop: "1px solid var(--border-sub)",
                        }}
                      >
                        {mode}
                      </td>
                      {COVERAGE_REGIONS.map((region) => {
                        const state = COVERAGE_MATRIX[mode][region] || "none";
                        return (
                          <td
                            key={region}
                            style={{
                              padding: "12px 16px",
                              fontSize: 12,
                              color: "var(--text-2)",
                              borderTop: "1px solid var(--border-sub)",
                            }}
                          >
                            <span
                              style={{
                                display: "inline-flex",
                                gap: 6,
                                alignItems: "center",
                              }}
                            >
                              <span
                                aria-hidden="true"
                                style={{
                                  display: "inline-block",
                                  width: 8,
                                  height: 8,
                                  borderRadius: "50%",
                                  backgroundColor: COVERAGE_DOT[state],
                                }}
                              />
                              {COVERAGE_LABEL[state]}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p
              style={{
                fontSize: 11,
                color: "var(--text-2)",
                marginTop: 12,
                fontStyle: "italic",
              }}
            >
              Coverage values are placeholders pending the source registry rollup endpoint. Item counts and pipeline stages above are live.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Pipeline row ──

function PipelineRow({ item }: { item: ResearchPipelineItem }) {
  const [open, setOpen] = useState(false);
  const stage = normalizeStage(item.pipelineStage);
  const tone = STAGE_PILL_TONE[stage];
  const region = regionLabel(item.jurisdictions);
  const mode = modeLabel(item.transportModes);
  const dateStr = item.addedDate ? formatDateUTC(item.addedDate) : "—";

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border-sub)",
        borderRadius: "var(--r-md)",
        marginBottom: 12,
        boxShadow: "var(--shadow)",
        overflow: "hidden",
      }}
    >
      {/* Title row + chevron split: title is a <Link> to /regulations/[slug];
          chevron is a separate <button> that toggles expand/collapse.
          Wrapping a <button> in <Link> would be invalid; the split keeps
          two distinct keyboard targets and matches the audit doc plan. */}
      <div
        style={{
          padding: "16px 20px",
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: 14,
          alignItems: "center",
        }}
      >
        <Link
          href={`/regulations/${encodeURIComponent(item.id)}`}
          prefetch={false}
          style={{
            display: "block",
            textDecoration: "none",
            color: "inherit",
            cursor: "pointer",
            padding: "2px 4px",
            margin: "-2px -4px",
            borderRadius: "var(--r-sm)",
            transition: "background-color 120ms ease",
          }}
          className="hover:bg-[var(--raised)]"
        >
          {/* Source kicker — promoted per CC3 source-attribution prominence */}
          {item.sourceName && (
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--text-2)",
                marginBottom: 4,
              }}
            >
              {item.sourceName}
            </div>
          )}
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "baseline",
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontSize: 9,
                padding: "3px 8px",
                borderRadius: 3,
                fontWeight: 800,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                border: `1px solid ${tone.bd}`,
                color: tone.color,
                background: tone.bg,
              }}
            >
              {STAGE_LABEL[stage]}
            </span>
            <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
              {item.title}
            </span>
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: "var(--text-2)",
              marginTop: 4,
              lineHeight: 1.5,
              display: "flex",
              gap: 14,
              flexWrap: "wrap",
            }}
          >
            <span>
              First seen · <b style={{ color: "var(--text)" }}>{dateStr}</b>
            </span>
            {item.owner && (
              <span>
                Owner · <b style={{ color: "var(--text)" }}>{item.owner}</b>
              </span>
            )}
          </div>
        </Link>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span
            style={{
              fontSize: 9,
              padding: "3px 8px",
              borderRadius: 3,
              fontWeight: 600,
              letterSpacing: 0,
              textTransform: "none",
              border: "1px solid var(--border)",
              color: "var(--text-2)",
              background: "var(--surface)",
            }}
          >
            {mode} · {region}
          </span>
          {item.partnerFlagged && (
            <span
              style={{
                fontSize: 9,
                padding: "3px 8px",
                borderRadius: 3,
                fontWeight: 800,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#6D28D9",
                border: "1px solid #DDD6FE",
                background: "#F5F3FF",
              }}
            >
              Partner-flagged
            </span>
          )}
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-label={open ? "Collapse pipeline row" : "Expand pipeline row"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 4,
              background: "transparent",
              border: 0,
              cursor: "pointer",
              borderRadius: 3,
            }}
          >
            <ChevronDown
              size={16}
              style={{
                color: "var(--text-2)",
                transform: open ? "rotate(180deg)" : "rotate(0)",
                transition: "transform 0.15s ease",
              }}
            />
          </button>
        </div>
      </div>

      {open && (
        <div
          style={{
            padding: "4px 20px 18px",
            borderTop: "1px solid var(--border-sub)",
            display: "grid",
            gridTemplateColumns: "1fr 220px",
            gap: 24,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--text-2)",
                margin: "14px 0 8px",
              }}
            >
              Synopsis
            </div>
            <p
              style={{
                fontSize: 13,
                lineHeight: 1.6,
                color: "var(--text)",
                margin: 0,
              }}
            >
              {item.summary || "Summary not yet drafted."}
            </p>

            {item.sourceUrl && (
              <>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "var(--text-2)",
                    margin: "14px 0 8px",
                  }}
                >
                  Primary source
                </div>
                <a
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: 12,
                    color: "var(--accent)",
                    textDecoration: "underline",
                    wordBreak: "break-all",
                  }}
                >
                  {item.sourceUrl}
                </a>
              </>
            )}
          </div>

          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--text-2)",
                margin: "14px 0 8px",
              }}
            >
              Meta
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.65, color: "var(--text)" }}>
              <div>
                <span style={{ color: "var(--text-2)" }}>Stage</span> ·{" "}
                <b>{STAGE_LABEL[stage]}</b>
              </div>
              <div>
                <span style={{ color: "var(--text-2)" }}>Region</span> · <b>{region}</b>
              </div>
              <div>
                <span style={{ color: "var(--text-2)" }}>Mode</span> · <b>{mode}</b>
              </div>
              <div>
                <span style={{ color: "var(--text-2)" }}>Added</span> · <b>{dateStr}</b>
              </div>
              {item.owner && (
                <div>
                  <span style={{ color: "var(--text-2)" }}>Owner</span> ·{" "}
                  <b>{item.owner}</b>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
