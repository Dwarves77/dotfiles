"use client";

/**
 * RegionDimensionMatrix — regions on one axis, dimensions on the other, for the Operations surface.
 *
 * WHAT IT REPLACES, AND WHY. Spec 04 acceptance criterion 1 asks for "a cross-region view in which two
 * regions appear on one axis for one dimension, WITHOUT expanding accordions". The surface rendered
 * per-region accordions, all closed by default, so comparing EU against US meant opening two panels and
 * holding the numbers in your head. The register calls this the cheapest change with the largest
 * contract movement, because the data is already keyed (region, dimension) — the shape was the problem,
 * not the storage.
 *
 * IT IS ALSO A COVERAGE INSTRUMENT. EU and US hold ZERO sourced facts across all five dimensions
 * (measured live 2026-08-18: 75 rows, all ASIA/UAE/UK). In a grid that hole is two empty columns you
 * see at a glance, which is the point — the register's ordering argument is that making the gap visible
 * correctly PRICES the producer work rather than hiding it behind closed panels.
 *
 * WHAT IT DELIBERATELY DOES NOT RENDER, because the data cannot support it honestly:
 *   - No index versus a base region, and no normalisation. `regional_data_facts.value` is free text
 *     ("AED 0.23-0.38/kWh (tiered); blended business rate approx. AED 0.405/kWh (USD 0.110/kWh) all-in")
 *     with no numeric, unit, currency or reference-period column. Spec 04 component 2's dual-layer cell
 *     needs the number envelope (WO-12) plus a schema migration. Deriving a number from that string
 *     would be the fabricated-claim failure the spec calls worse than a gap. The base-region control
 *     therefore REORDERS COLUMNS and says so in its own label.
 *   - No reference period, because the column does not exist. `last_updated` is when the row was
 *     written, which is a different fact, and it is labelled as such.
 *
 * All computation lives in `@/lib/operations/region-grid.mjs`, which OperationsLedger's coverage rail
 * also consumes, so this surface cannot show two different coverage numbers for one page.
 */

import { Fragment, useMemo, useState } from "react";
import type { OperationsFact, OperationsCoverageRow } from "@/lib/supabase-server";
import {
  buildRegionGrid,
  orderRegions,
  sourceUrlFromNote,
  sourceNameFromNote,
} from "@/lib/operations/region-grid.mjs";

export interface MatrixRegion { key: string; label: string }
export interface MatrixDimension { key: string; db: string; name: string }

interface Props {
  regions: MatrixRegion[];
  /** SOURCED dimensions only — the ones with rows in regional_data_facts. */
  dimensions: MatrixDimension[];
  facts: OperationsFact[];
  coverageRows?: OperationsCoverageRow[];
  /** Regulation cross-reference counts per region. Reported, never folded into coverage. */
  crossRefCountsByRegion?: Record<string, number>;
}

const FRESHNESS_LABEL: Record<string, string> = {
  current: "current",
  ageing: "ageing",
  stale: "stale",
  frozen: "not updating",
  unknown: "date unknown",
};

const FRESHNESS_COLOR: Record<string, string> = {
  current: "var(--color-success)",
  ageing: "var(--color-warning)",
  stale: "var(--color-warning)",
  frozen: "var(--color-error)",
  unknown: "var(--color-text-muted)",
};

export function RegionDimensionMatrix({
  regions,
  dimensions,
  facts,
  coverageRows = [],
  crossRefCountsByRegion = {},
}: Props) {
  const [baseRegion, setBaseRegion] = useState<string | null>(null);
  const [openDimension, setOpenDimension] = useState<string | null>(null);

  const dbByKey = useMemo(() => Object.fromEntries(dimensions.map((d) => [d.db, d.key])), [dimensions]);

  const grid = useMemo(
    () =>
      buildRegionGrid({
        regionKeys: regions.map((r) => r.key),
        sourcedDimensions: dimensions.map((d) => d.db),
        facts: facts.map((f) => ({
          regionKey: f.region_code,
          dimension: f.dimension,
          factLabel: f.fact_label,
          value: f.value,
          status: f.status,
          sourceNote: f.source_note,
          sourceName: f.source_name,
          sourceUrl: f.source_url,
          lastUpdated: f.last_updated,
          freshness: f.freshness,
        })),
        coverageRows: coverageRows.map((c) => ({
          regionKey: c.region_code,
          dimension: c.dimension,
          state: c.state,
          factCount: c.fact_count,
        })),
        crossRefCountsByRegion,
      }),
    [regions, dimensions, facts, coverageRows, crossRefCountsByRegion]
  );

  const orderedKeys: string[] = useMemo(
    () => orderRegions(regions.map((r) => r.key), baseRegion),
    [regions, baseRegion]
  );
  const orderedRegions = orderedKeys.map((k) => regions.find((r) => r.key === k)!).filter(Boolean);
  const coverageByRegion = Object.fromEntries(grid.regionCoverage.map((r: any) => [r.regionKey, r]));

  if (regions.length === 0 || dimensions.length === 0) return null;

  return (
    <section style={{ margin: "0 0 24px" }}>
      <header style={{ marginBottom: 10 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: "var(--color-text-primary)" }}>
          Regions side by side
        </h2>
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "4px 0 0", maxWidth: "78ch" }}>
          Sourced facts per region and dimension. {grid.fillRate.filled} of {grid.fillRate.total} cells hold
          data ({grid.fillRate.pct}%), counted from sourced facts only. Select a dimension row to compare
          the regions on it.
        </p>
      </header>

      {/* Base region: arrangement, and the control says so rather than implying an index. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10, fontSize: 12 }}>
        <span style={{ color: "var(--color-text-muted)" }}>Compare against:</span>
        {regions.map((r) => (
          <button
            key={r.key}
            onClick={() => setBaseRegion(baseRegion === r.key ? null : r.key)}
            style={{
              padding: "2px 8px",
              borderRadius: 4,
              border: "1px solid",
              borderColor: baseRegion === r.key ? "var(--color-primary)" : "var(--color-border)",
              backgroundColor: baseRegion === r.key ? "var(--color-primary)20" : "var(--color-surface)",
              color: "var(--color-text-primary)",
              cursor: "pointer",
            }}
          >
            {r.key}
          </button>
        ))}
        <span style={{ color: "var(--color-text-muted)" }}>
          (moves that column first; values are not indexed — the stored figures are free text, not numbers)
        </span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
          <thead style={{ backgroundColor: "var(--color-surface-raised)" }}>
            <tr>
              <th style={{ ...cell, textAlign: "left", minWidth: 190 }}>Dimension</th>
              {orderedRegions.map((r) => {
                const cov = coverageByRegion[r.key];
                return (
                  <th key={r.key} style={{ ...cell, minWidth: 130 }}>
                    <div style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>{r.label}</div>
                    <div style={{ fontSize: 11, fontWeight: 400, color: cov?.filled ? "var(--color-text-secondary)" : "var(--color-error)" }}>
                      {cov?.filled ?? 0}/{cov?.total ?? 0} dimensions sourced
                    </div>
                    {cov?.crossReferenceCount > 0 && (
                      <div style={{ fontSize: 11, fontWeight: 400, color: "var(--color-text-muted)" }}>
                        {cov.crossReferenceCount} linked regulations
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {dimensions.map((d) => {
              const open = openDimension === d.db;
              return (
                <Fragment key={d.db}>
                  <tr
                    onClick={() => setOpenDimension(open ? null : d.db)}
                    style={{ cursor: "pointer", backgroundColor: open ? "var(--color-surface-raised)" : undefined }}
                  >
                    <td style={{ ...cell, textAlign: "left", fontWeight: 500, color: "var(--color-text-primary)" }}>
                      {d.name}
                    </td>
                    {orderedRegions.map((r) => {
                      const c = grid.byCell[`${r.key}|${d.db}`];
                      if (!c || c.factCount === 0) {
                        return (
                          <td key={r.key} style={{ ...cell, color: "var(--color-text-muted)" }}>
                            <span title="No producer has written this cell">— no data</span>
                          </td>
                        );
                      }
                      const fresh = c.facts[0]?.freshness ?? "unknown";
                      return (
                        <td key={r.key} style={{ ...cell, color: "var(--color-text-secondary)" }}>
                          <div style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>{c.factCount}</div>
                          <div style={{ fontSize: 11, color: FRESHNESS_COLOR[fresh] }}>{FRESHNESS_LABEL[fresh]}</div>
                        </td>
                      );
                    })}
                  </tr>

                  {open && (
                    <tr>
                      <td style={{ ...cell, verticalAlign: "top", color: "var(--color-text-muted)", fontSize: 12 }}>
                        Facts
                      </td>
                      {orderedRegions.map((r) => {
                        const c = grid.byCell[`${r.key}|${d.db}`];
                        return (
                          <td key={r.key} style={{ ...cell, verticalAlign: "top" }}>
                            {!c || c.factCount === 0 ? (
                              <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>
                                No sourced fact for {r.key} on this dimension.
                              </span>
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                {c.facts.map((f: any, i: number) => {
                                  const url = f.sourceUrl ?? sourceUrlFromNote(f.sourceNote);
                                  const name = f.sourceName ?? sourceNameFromNote(f.sourceNote);
                                  return (
                                    <div key={i}>
                                      <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{f.factLabel}</div>
                                      <div style={{ fontSize: 12, color: "var(--color-text-primary)", lineHeight: 1.5 }}>{f.value}</div>
                                      <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>
                                        {name ? (url ? <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-primary)", textDecoration: "underline" }}>{name}</a> : name) : "source not linked"}
                                        {f.lastUpdated ? ` · row written ${String(f.lastUpdated).slice(0, 10)}` : " · no date on row"}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {grid.emptyRegions.length > 0 && (
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "10px 0 0", maxWidth: "78ch" }}>
          <strong style={{ color: "var(--color-error)" }}>
            {grid.emptyRegions.join(" and ")} hold no sourced facts on any dimension.
          </strong>{" "}
          There is no live producer writing them. Regulation cross-references for those regions are counted
          separately in the column header and are not part of the coverage figure.
        </p>
      )}

      {grid.reconciliation.disagreed.length > 0 && (
        <p style={{ fontSize: 12, color: "var(--color-warning)", margin: "8px 0 0", maxWidth: "78ch" }}>
          Coverage-table mismatch on {grid.reconciliation.disagreed.length} of {grid.reconciliation.checked} cells:
          the stored coverage row and the facts present disagree. The counts above are computed from the facts.
        </p>
      )}
    </section>
  );
}

const cell: React.CSSProperties = {
  border: "1px solid var(--color-border)",
  padding: "6px 10px",
  textAlign: "center",
  verticalAlign: "top",
};
