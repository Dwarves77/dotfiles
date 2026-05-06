"use client";

/**
 * CoverageMatrixView — admin sub-tab rendering the (jurisdiction × item_type)
 * coverage matrix produced by GET /api/admin/coverage.
 *
 * Backed by:
 *   GET /api/admin/coverage?tier=1|2|3&country=XX
 *
 * Visual contract (light-first, Apple HIG):
 *   1. Stat strip — covered / partial / gap counts, plus "last refreshed"
 *   2. Tier filter chips — All / Tier 1 / Tier 2 / Tier 3
 *   3. Group-by-country toggle — collapses sub-national rows under their parent
 *   4. Matrix table — rows = jurisdictions, columns = item_types
 *      - Each cell shows item_count + colored background per cell_state
 *      - gap-no-source cells get a small warning icon
 *      - Hover/focus shows a tooltip with most_recent_item_at + source_count
 *   5. Action panel — when a row is selected, "Run discovery" and
 *      "Bulk-add sources" buttons emit `onAction` callbacks. Wiring to the
 *      actual discovery API and BulkImportView dialog happens in the
 *      orchestrator integration layer (W2.A and W2.B).
 *
 * Empty state: when zero jurisdictions resolve under the active filter the
 * component renders a neutral placeholder instead of a stripped-down table.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/Button";
import {
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Search,
  PlusCircle,
} from "lucide-react";

// ── Types matching /api/admin/coverage response ─────────────────────────────

type CellState =
  | "covered-fresh"
  | "covered-stale"
  | "sparse"
  | "gap-with-source"
  | "gap-no-source";

type OverallState = "covered" | "partial" | "gap";

interface MatrixRow {
  jurisdiction_iso: string;
  label: string;
  country: string;
  item_type: string;
  item_count: number;
  source_count: number;
  most_recent_item_at: string | null;
  oldest_item_at: string | null;
  has_critical: boolean;
  cell_state: CellState;
}

interface JurisdictionSummary {
  jurisdiction_iso: string;
  label: string;
  country: string;
  tier: 1 | 2 | 3 | null;
  is_subnational: boolean;
  total_items: number;
  total_sources: number;
  overall_state: OverallState;
}

interface CoverageResponse {
  generated_at: string;
  matrix: MatrixRow[];
  jurisdictions: JurisdictionSummary[];
  item_types: string[];
}

// ── Component props ─────────────────────────────────────────────────────────

export type CoverageMatrixAction =
  | { kind: "discover"; jurisdictionIso: string; label: string }
  | { kind: "bulk-add"; jurisdictionIso: string; label: string };

interface CoverageMatrixViewProps {
  /** Orchestrator wires this. Receives a tagged action; W2.A and W2.B wire the
   *  actual discovery API + BulkImportView dialog when integrated. */
  onAction?: (action: CoverageMatrixAction) => void;
}

// ── Cell-state visual treatment ─────────────────────────────────────────────
// Each cell uses a semantic token so dark-mode and theme overrides take effect
// automatically. Falls back to inline rgba for the muted backdrops because the
// design system tokens currently expose only foreground variants for warning /
// caution / info states.

interface CellPalette {
  bg: string;
  fg: string;
  border: string;
  label: string;
  description: string;
}

const CELL_PALETTE: Record<CellState, CellPalette> = {
  "gap-no-source": {
    bg: "rgba(220, 38, 38, 0.08)",
    fg: "var(--color-error)",
    border: "rgba(220, 38, 38, 0.24)",
    label: "Gap — no source",
    description:
      "Zero items and zero active sources. Discovery has not run, or sources are paused.",
  },
  "gap-with-source": {
    bg: "rgba(217, 119, 6, 0.08)",
    fg: "var(--color-warning)",
    border: "rgba(217, 119, 6, 0.22)",
    label: "Gap — sources tracked",
    description:
      "At least one active source but no items yet. Run a regeneration or let the worker pick this up on its next pass.",
  },
  sparse: {
    bg: "rgba(202, 138, 4, 0.08)",
    fg: "#a16207",
    border: "rgba(202, 138, 4, 0.22)",
    label: "Sparse",
    description: "1–2 items. Coverage exists but is thin.",
  },
  "covered-stale": {
    bg: "rgba(59, 130, 246, 0.08)",
    fg: "#1d4ed8",
    border: "rgba(59, 130, 246, 0.22)",
    label: "Covered — stale",
    description: "≥3 items but the most recent is older than 180 days.",
  },
  "covered-fresh": {
    bg: "rgba(22, 163, 74, 0.10)",
    fg: "var(--color-success)",
    border: "rgba(22, 163, 74, 0.24)",
    label: "Covered — fresh",
    description: "≥3 items, most recent within 180 days.",
  },
};

// ── Tier filter chip type ──

type TierFilter = "all" | 1 | 2 | 3;

// ════════════════════════════════════════════════════════════════════════════

export function CoverageMatrixView({ onAction }: CoverageMatrixViewProps) {
  const [data, setData] = useState<CoverageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const [groupByCountry, setGroupByCountry] = useState<boolean>(false);
  const [selectedIso, setSelectedIso] = useState<string | null>(null);

  const supabase = createSupabaseBrowserClient();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      // We always pull the full set and filter client-side for tier; the API
      // accepts a tier query param too, but client-side filtering keeps the
      // UI snappy when toggling chips.
      const resp = await fetch("/api/admin/coverage", {
        headers: { Authorization: `Bearer ${session?.access_token || ""}` },
      });
      const payload = await resp.json();
      if (!resp.ok) {
        setError(payload?.error || `Failed to load (${resp.status})`);
        setData(null);
      } else {
        setData(payload);
      }
    } catch (e: any) {
      setError(e.message || "Network error");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Derive filtered jurisdictions ─────────────────────────────────────────

  const jurisdictionsAll = data?.jurisdictions ?? [];
  const matrixAll = data?.matrix ?? [];
  const itemTypes = data?.item_types ?? [];

  const visibleJurisdictions = useMemo<JurisdictionSummary[]>(() => {
    let list = jurisdictionsAll;
    if (tierFilter !== "all") {
      list = list.filter((j) => j.tier === tierFilter);
    }
    return list;
  }, [jurisdictionsAll, tierFilter]);

  const visibleIsoSet = useMemo(
    () => new Set(visibleJurisdictions.map((j) => j.jurisdiction_iso)),
    [visibleJurisdictions]
  );

  // Group rows by (jurisdiction_iso, item_type) for fast cell lookup.
  const cellLookup = useMemo<Map<string, Map<string, MatrixRow>>>(() => {
    const m = new Map<string, Map<string, MatrixRow>>();
    for (const row of matrixAll) {
      if (!visibleIsoSet.has(row.jurisdiction_iso)) continue;
      let inner = m.get(row.jurisdiction_iso);
      if (!inner) {
        inner = new Map();
        m.set(row.jurisdiction_iso, inner);
      }
      inner.set(row.item_type, row);
    }
    return m;
  }, [matrixAll, visibleIsoSet]);

  // Group-by-country: collapse sub-national rows. The country row aggregates
  // its own (national) row plus all sub-national rows; each cell becomes a
  // sum of item counts and a max of source counts (matching the API rollup).
  const displayJurisdictions = useMemo<JurisdictionSummary[]>(() => {
    if (!groupByCountry) return visibleJurisdictions;
    const byCountry = new Map<string, JurisdictionSummary>();
    for (const j of visibleJurisdictions) {
      // Prefer the country-level row if present; otherwise pick the first
      // sub-national entry as the placeholder.
      const existing = byCountry.get(j.country);
      if (!existing) {
        byCountry.set(j.country, { ...j, jurisdiction_iso: j.country });
        continue;
      }
      existing.total_items += j.total_items;
      existing.total_sources = Math.max(existing.total_sources, j.total_sources);
      // Promote overall_state to the higher coverage level if any child is.
      const order: OverallState[] = ["gap", "partial", "covered"];
      if (
        order.indexOf(j.overall_state) > order.indexOf(existing.overall_state)
      ) {
        existing.overall_state = j.overall_state;
      }
      // Pick the country-level label/iso when we encounter the parent code.
      if (!j.is_subnational) {
        existing.jurisdiction_iso = j.jurisdiction_iso;
        existing.label = j.label;
        existing.tier = j.tier;
        existing.is_subnational = false;
      }
    }
    return Array.from(byCountry.values()).sort((a, b) => {
      const ta = a.tier ?? 99;
      const tb = b.tier ?? 99;
      if (ta !== tb) return ta - tb;
      return a.label.localeCompare(b.label);
    });
  }, [groupByCountry, visibleJurisdictions]);

  // Stat strip aggregates against the visible jurisdictions, NOT the grouped
  // display, so the count reflects the actual jurisdiction-level state.
  const stats = useMemo(() => {
    let covered = 0;
    let partial = 0;
    let gap = 0;
    for (const j of visibleJurisdictions) {
      if (j.overall_state === "covered") covered += 1;
      else if (j.overall_state === "partial") partial += 1;
      else gap += 1;
    }
    return { covered, partial, gap, total: visibleJurisdictions.length };
  }, [visibleJurisdictions]);

  // ── Render ───────────────────────────────────────────────────────────────

  const refreshedLabel = data?.generated_at
    ? new Date(data.generated_at).toLocaleString()
    : "—";

  const selectedJurisdiction = selectedIso
    ? displayJurisdictions.find((j) => j.jurisdiction_iso === selectedIso) ||
      visibleJurisdictions.find((j) => j.jurisdiction_iso === selectedIso) ||
      null
    : null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2
            className="text-xl font-bold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Coverage matrix
          </h2>
          <p
            className="text-sm mt-1"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Jurisdictions × item types. Cells are coloured by coverage state;
            empty cells with no source show a warning icon.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
          <RefreshCw size={12} />
          Refresh
        </Button>
      </div>

      {/* Stat strip */}
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}
      >
        <StatCell
          label="Covered"
          value={loading ? "…" : String(stats.covered)}
          tone="success"
        />
        <StatCell
          label="Partial"
          value={loading ? "…" : String(stats.partial)}
          tone="warning"
        />
        <StatCell
          label="Gaps"
          value={loading ? "…" : String(stats.gap)}
          tone="error"
          critical={stats.gap > 0}
        />
        <StatCell
          label="Last refreshed"
          value={loading ? "…" : refreshedLabel}
          tone="muted"
        />
      </div>

      {/* Filter row — tier chips + group toggle */}
      <div
        className="flex flex-wrap items-center gap-3"
        style={{
          padding: "10px 12px",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--r-md)",
          backgroundColor: "var(--color-surface)",
        }}
      >
        <span
          className="text-[11px] font-bold uppercase tracking-wider"
          style={{ color: "var(--color-text-muted)" }}
        >
          Tier
        </span>
        <div className="flex gap-1">
          {(["all", 1, 2, 3] as TierFilter[]).map((t) => {
            const active = tierFilter === t;
            const label = t === "all" ? "All" : `Tier ${t}`;
            return (
              <button
                key={String(t)}
                onClick={() => setTierFilter(t)}
                className="text-[12px] font-semibold px-2.5 py-1 rounded-md"
                style={{
                  border: active
                    ? "1px solid var(--color-primary)"
                    : "1px solid var(--color-border)",
                  background: active
                    ? "var(--color-active-bg)"
                    : "var(--color-background)",
                  color: active
                    ? "var(--color-primary)"
                    : "var(--color-text-secondary)",
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
        <div
          className="ml-auto flex items-center gap-2"
          style={{ marginLeft: "auto" }}
        >
          <span
            className="text-[11px] font-bold uppercase tracking-wider"
            style={{ color: "var(--color-text-muted)" }}
          >
            Group by country
          </span>
          <button
            role="switch"
            aria-checked={groupByCountry}
            onClick={() => setGroupByCountry((v) => !v)}
            className="text-[12px] font-semibold px-2.5 py-1 rounded-md"
            style={{
              border: groupByCountry
                ? "1px solid var(--color-primary)"
                : "1px solid var(--color-border)",
              background: groupByCountry
                ? "var(--color-active-bg)"
                : "var(--color-background)",
              color: groupByCountry
                ? "var(--color-primary)"
                : "var(--color-text-secondary)",
              cursor: "pointer",
            }}
          >
            {groupByCountry ? "On" : "Off"}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          className="p-3 rounded-md text-sm"
          style={{
            color: "var(--color-error)",
            border: "1px solid var(--color-error)",
            backgroundColor: "rgba(220,38,38,0.04)",
          }}
        >
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && data && displayJurisdictions.length === 0 && !error && (
        <EmptyState />
      )}

      {/* Matrix table */}
      {!loading && data && displayJurisdictions.length > 0 && (
        <div
          className="rounded-lg overflow-x-auto"
          style={{ border: "1px solid var(--color-border)" }}
        >
          <table
            className="w-full text-[12.5px] border-collapse"
            style={{ minWidth: 720 }}
          >
            <thead style={{ background: "var(--color-surface-raised)" }}>
              <tr>
                <Th>Jurisdiction</Th>
                <Th align="right">Items</Th>
                <Th align="right">Sources</Th>
                {itemTypes.map((t) => (
                  <Th key={t} align="center">
                    {t}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayJurisdictions.map((j) => {
                const selected = j.jurisdiction_iso === selectedIso;
                return (
                  <tr
                    key={j.jurisdiction_iso}
                    onClick={() =>
                      setSelectedIso(
                        selected ? null : j.jurisdiction_iso
                      )
                    }
                    style={{
                      borderTop: "1px solid var(--color-border)",
                      cursor: "pointer",
                      background: selected
                        ? "var(--color-active-bg)"
                        : "transparent",
                    }}
                  >
                    <Td>
                      <div className="flex flex-col gap-0.5">
                        <span
                          className="font-semibold"
                          style={{ color: "var(--color-text-primary)" }}
                        >
                          {j.label}
                        </span>
                        <span
                          className="text-[11px] tabular-nums"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          {j.jurisdiction_iso}
                          {j.tier ? ` · Tier ${j.tier}` : ""}
                          {j.is_subnational ? " · sub" : ""}
                        </span>
                      </div>
                    </Td>
                    <Td align="right">
                      <span
                        className="tabular-nums"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        {j.total_items}
                      </span>
                    </Td>
                    <Td align="right">
                      <span
                        className="tabular-nums"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        {j.total_sources}
                      </span>
                    </Td>
                    {itemTypes.map((t) => {
                      const cell = cellLookup
                        .get(j.jurisdiction_iso)
                        ?.get(t);
                      return (
                        <CellTd
                          key={t}
                          cell={cell}
                          fallback={j.total_sources > 0
                            ? "gap-with-source"
                            : "gap-no-source"}
                        />
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      {!loading && data && (
        <div
          className="flex flex-wrap items-center gap-2 text-[11px]"
          style={{ color: "var(--color-text-muted)" }}
        >
          <span className="font-bold uppercase tracking-wider">Legend</span>
          {(
            [
              "covered-fresh",
              "covered-stale",
              "sparse",
              "gap-with-source",
              "gap-no-source",
            ] as CellState[]
          ).map((state) => {
            const p = CELL_PALETTE[state];
            return (
              <span
                key={state}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md"
                style={{
                  border: `1px solid ${p.border}`,
                  background: p.bg,
                  color: p.fg,
                }}
                title={p.description}
              >
                {state === "gap-no-source" && <AlertTriangle size={10} />}
                {p.label}
              </span>
            );
          })}
        </div>
      )}

      {/* Action panel */}
      {selectedJurisdiction && (
        <div
          className="flex flex-wrap items-center gap-3 p-3 rounded-md"
          style={{
            border: "1px solid var(--color-border)",
            backgroundColor: "var(--color-surface)",
          }}
        >
          <div className="flex flex-col">
            <span
              className="text-[11px] font-bold uppercase tracking-wider"
              style={{ color: "var(--color-text-muted)" }}
            >
              Selected
            </span>
            <span
              className="text-sm font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              {selectedJurisdiction.label}
            </span>
            <span
              className="text-[11px] tabular-nums"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {selectedJurisdiction.total_items} items ·{" "}
              {selectedJurisdiction.total_sources} active sources ·{" "}
              {selectedJurisdiction.overall_state}
            </span>
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={!onAction}
              onClick={() =>
                onAction?.({
                  kind: "discover",
                  jurisdictionIso: selectedJurisdiction.jurisdiction_iso,
                  label: selectedJurisdiction.label,
                })
              }
            >
              <Search size={12} />
              Run discovery on {selectedJurisdiction.label}
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!onAction}
              onClick={() =>
                onAction?.({
                  kind: "bulk-add",
                  jurisdictionIso: selectedJurisdiction.jurisdiction_iso,
                  label: selectedJurisdiction.label,
                })
              }
            >
              <PlusCircle size={12} />
              Bulk-add sources for {selectedJurisdiction.label}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

type StatTone = "success" | "warning" | "error" | "muted";

const STAT_TONE_COLOR: Record<StatTone, string> = {
  success: "var(--color-success)",
  warning: "var(--color-warning)",
  error: "var(--color-error)",
  muted: "var(--color-text-muted)",
};

function StatCell({
  label,
  value,
  tone,
  critical,
}: {
  label: string;
  value: string;
  tone: StatTone;
  critical?: boolean;
}) {
  const toneColor = STAT_TONE_COLOR[tone];
  return (
    <div
      className="p-4 rounded-lg"
      style={{
        border: critical
          ? `1px solid ${toneColor}`
          : "1px solid var(--color-border)",
        backgroundColor: critical
          ? "rgba(220, 38, 38, 0.04)"
          : "var(--color-surface)",
      }}
    >
      <div
        className="text-[11px] font-bold uppercase tracking-wider mb-2"
        style={{ color: toneColor }}
      >
        {label}
      </div>
      <div
        className="text-2xl font-semibold tabular-nums"
        style={{
          color:
            tone === "muted" ? "var(--color-text-primary)" : toneColor,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Th({
  children,
  align,
}: {
  children: ReactNode;
  align?: "right" | "center";
}) {
  return (
    <th
      className="px-3 py-2.5 font-bold text-[10.5px] uppercase tracking-wide"
      style={{
        color: "var(--color-text-secondary)",
        letterSpacing: "0.06em",
        textAlign:
          align === "right" ? "right" : align === "center" ? "center" : "left",
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
}: {
  children: ReactNode;
  align?: "right" | "center";
}) {
  return (
    <td
      className="px-3 py-2.5 align-middle"
      style={{
        textAlign:
          align === "right" ? "right" : align === "center" ? "center" : "left",
        color: "var(--color-text-primary)",
      }}
    >
      {children}
    </td>
  );
}

/**
 * Single matrix cell. Renders nothing-but-background when there's no data
 * for this (jurisdiction × item_type), with a warning icon when the cell
 * resolves to gap-no-source.
 */
function CellTd({
  cell,
  fallback,
}: {
  cell: MatrixRow | undefined;
  fallback: CellState;
}) {
  const state: CellState = cell ? cell.cell_state : fallback;
  const palette = CELL_PALETTE[state];
  const count = cell?.item_count ?? 0;
  const sourceCount = cell?.source_count ?? 0;
  const recent = cell?.most_recent_item_at
    ? new Date(cell.most_recent_item_at).toLocaleDateString()
    : null;
  const titleParts = [
    palette.label,
    `${count} item${count === 1 ? "" : "s"}`,
    `${sourceCount} active source${sourceCount === 1 ? "" : "s"}`,
    recent ? `most recent ${recent}` : null,
  ].filter(Boolean);

  return (
    <td
      className="px-2 py-2"
      style={{
        textAlign: "center",
        background: palette.bg,
        borderLeft: "1px solid var(--color-border)",
        color: palette.fg,
      }}
      title={titleParts.join(" · ")}
    >
      <div
        className="inline-flex items-center justify-center gap-1 tabular-nums"
        style={{ minWidth: 28, fontWeight: 600 }}
      >
        {state === "gap-no-source" && (
          <AlertTriangle size={10} aria-hidden="true" />
        )}
        <span>{count}</span>
      </div>
    </td>
  );
}

function EmptyState() {
  return (
    <div
      className="flex flex-col items-center justify-center py-12 text-center rounded-lg"
      style={{
        border: "1px dashed var(--color-border)",
        backgroundColor: "var(--color-surface)",
      }}
    >
      <CheckCircle size={28} style={{ color: "var(--color-text-muted)" }} />
      <h3
        className="mt-3 text-sm font-medium"
        style={{ color: "var(--color-text-primary)" }}
      >
        No jurisdictions in scope yet
      </h3>
      <p
        className="mt-1 text-xs max-w-md"
        style={{ color: "var(--color-text-secondary)" }}
      >
        Run a discovery agent or bulk-import sources to populate this matrix.
        Once intelligence_items rows have populated jurisdiction_iso arrays,
        rows will appear here automatically.
      </p>
    </div>
  );
}
