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
 * LAYER 2 (WO-9's deferred half, landed 2026-08-30 on WO-12's migration 267): a fact row that carries
 * the full number envelope (value_numeric + unit at minimum — see `isEnvelopedFact`) now renders as an
 * indexed number, with unit/derivation/origin_class shown, and indexes against the chosen base region
 * when that region ALSO carries an enveloped fact in the same unit for the same cell. A row that does
 * NOT carry the envelope — which is 100% of the 75 live rows as of this write, both WO-17 producers
 * being kill-switched off — renders EXACTLY as before: the free-text `value` column, unchanged. A
 * malformed envelope (value_numeric with a NULL unit) is NOT enveloped per `isEnvelopedFact` and also
 * falls back to the legacy path, never a bare number with no unit. The base-region control's own label
 * says which case applies to the data actually loaded, rather than a single static disclaimer.
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
  isEnvelopedFact,
  indexAgainstBase,
  formatEnvelopedValue,
  originClassLabel,
  originClassStrength,
  derivationLabel,
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
          // Layer 2 (WO-12 envelope, migration 267) — carried through unchanged so isEnvelopedFact /
          // indexAgainstBase / formatEnvelopedValue below can read them. NULL on every one of the 75
          // live rows today (rule 0.15 re-read 2026-08-30); the dual-layer render below is exercised
          // by fixtures in region-grid.test.mjs, not yet by live data.
          valueNumeric: f.value_numeric,
          unit: f.unit,
          currency: f.currency,
          derivation: f.derivation,
          originClass: f.origin_class,
          sourceKey: f.source_key,
          sourceRef: f.source_ref,
          nObservations: f.n_observations,
          methodVersion: f.method_version,
          asAtDate: f.as_at_date,
          referencePeriod: f.reference_period,
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

  // Layer 2: whether ANY loaded fact carries a valid envelope. Governs the base-region control's own
  // disclaimer (honest per the data actually on screen, never a static claim) — true today only in
  // tests, since 0 of 75 live rows are enveloped.
  const anyEnveloped = useMemo(
    () => grid.cells.some((c: any) => c.facts.some(isEnvelopedFact)),
    [grid]
  );

  // For an enveloped fact in a non-base region's cell, find the base region's matching fact in the
  // SAME cell to index against: same fact_label preferred (the same series), else the first enveloped
  // fact the base region's cell carries for this dimension. Returns null (no index) rather than
  // guessing across an unrelated series.
  const baseFactFor = (dimDb: string, fact: any): any => {
    if (!baseRegion) return null;
    const baseCell = grid.byCell[`${baseRegion}|${dimDb}`];
    const baseFacts: any[] = baseCell?.facts ?? [];
    return (
      baseFacts.find((bf) => bf.factLabel === fact.factLabel && isEnvelopedFact(bf)) ??
      baseFacts.find(isEnvelopedFact) ??
      null
    );
  };

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
              // Law-2 floor (docs/design/ux-laws.md #2): was `padding: "2px 8px"` at 12px text,
              // ~21px tall — under the 24px+8px-clearance alternative to 44px even though the
              // row's `gap: 8` already supplies the clearance. `minHeight: 24` + inline-flex/
              // center closes the gap without changing type scale or colour.
              display: "inline-flex",
              alignItems: "center",
              minHeight: 24,
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
          {anyEnveloped
            ? "(moves that column first; sourced numeric facts index against it — legacy free-text facts are still not indexed)"
            : "(moves that column first; values are not indexed — the stored figures are free text, not numbers)"}
        </span>
      </div>

      {/* Lane MOBILE-2, 2026-09-03 (coordinator's round-2 probe, /operations, "United States 1/5
          dimensions sourced" clipped at the right edge on a growing live region roster): the wide
          table already scrolled inside this div's own overflowX:auto (pre-existing), but requiring
          horizontal panning for the PAGE'S PRIMARY comparison view on a phone is poor UX regardless
          of whether the guard's clipped-overflow detector technically passes. `.cl-ops-matrix-table`
          hides this table at <=640px (globals.css); `.cl-ops-matrix-cards` below replaces it with one
          card per region at that width. Desktop is unchanged — same table, same class list plus the
          new one. */}
      <div className="cl-ops-matrix-table" style={{ overflowX: "auto" }}>
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
                    {/* `data-guard-title` sits on the inner span, not the `<td>`: the squeezed-title
                        detector (ux-assert.mjs, read-only to this lane) estimates "one line" as
                        fontSize x 1.3 and has no notion of a title element's own padding — measured
                        against the padded `<td>` (the shared `cell` style's 6px vertical padding,
                        `line-height: normal`), a single-line dimension name reads as height >= 2
                        estimated lines and false-positives as "squeezed", confirmed by a raw
                        Range.getClientRects() count of 1 on the same markup. The inner span carries
                        no padding, so its measured height matches its actual (single) line. */}
                    <td style={{ ...cell, textAlign: "left", fontWeight: 500, color: "var(--color-text-primary)" }}>
                      <span data-guard-title style={{ display: "block", overflowWrap: "anywhere" }}>{d.name}</span>
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
                                {c.facts.map((f: any, i: number) =>
                                  isEnvelopedFact(f) ? (
                                    <EnvelopedFactRow key={i} fact={f} baseFact={baseFactFor(d.db, f)} isBaseColumn={r.key === baseRegion} />
                                  ) : (
                                    <LegacyFactRow key={i} fact={f} />
                                  )
                                )}
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

      {/* Mobile card reflow (<=640px, see the table's own comment above): one card per region —
          region name, "n/total dimensions" chip, the sourced dimensions stacked, each with a
          real >=44px expand/collapse control and wrapping facts. Shares `openDimension` /
          `baseRegion` state with the table so the two never disagree when a viewport crosses the
          breakpoint mid-session. */}
      <div className="cl-ops-matrix-cards" data-guard-container="ops-region-card">
        {orderedRegions.map((r) => {
          const cov = coverageByRegion[r.key];
          return (
            <div
              key={r.key}
              style={{
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                padding: "14px 16px",
                marginBottom: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: cov?.crossReferenceCount > 0 ? 4 : 8 }}>
                <span data-guard-title style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)", overflowWrap: "anywhere", minWidth: 0 }}>
                  {r.label}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "3px 9px",
                    borderRadius: 12,
                    whiteSpace: "nowrap",
                    background: "var(--color-surface-raised)",
                    color: cov?.filled ? "var(--color-text-secondary)" : "var(--color-error)",
                  }}
                >
                  {cov?.filled ?? 0}/{cov?.total ?? 0} dimensions
                </span>
              </div>
              {cov?.crossReferenceCount > 0 && (
                <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 8 }}>
                  {cov.crossReferenceCount} linked regulations
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column" }}>
                {dimensions.map((d) => {
                  const c = grid.byCell[`${r.key}|${d.db}`];
                  const open = openDimension === d.db;
                  const hasData = !!c && c.factCount > 0;
                  const fresh = c?.facts[0]?.freshness ?? "unknown";
                  return (
                    <div key={d.db} style={{ borderTop: "1px solid var(--color-border-subtle)" }}>
                      <button
                        type="button"
                        onClick={() => setOpenDimension(open ? null : d.db)}
                        aria-expanded={open}
                        style={{
                          width: "100%",
                          minHeight: 44,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 10,
                          background: "none",
                          border: "none",
                          padding: "6px 0",
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)", overflowWrap: "anywhere", minWidth: 0 }}>
                          {d.name}
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                          {hasData ? (
                            <span style={{ fontSize: 11, color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>
                              {c!.factCount} · <span style={{ color: FRESHNESS_COLOR[fresh] }}>{FRESHNESS_LABEL[fresh]}</span>
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>no data</span>
                          )}
                          <span aria-hidden style={{ fontSize: 16, fontWeight: 700, lineHeight: 1, color: "var(--color-primary)" }}>
                            {open ? "−" : "+"}
                          </span>
                        </span>
                      </button>
                      {open && (
                        <div style={{ padding: "0 0 12px" }}>
                          {!hasData ? (
                            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                              No sourced fact for {r.key} on this dimension.
                            </span>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                              {c!.facts.map((f: any, i: number) =>
                                isEnvelopedFact(f) ? (
                                  <EnvelopedFactRow key={i} fact={f} baseFact={baseFactFor(d.db, f)} isBaseColumn={r.key === baseRegion} />
                                ) : (
                                  <LegacyFactRow key={i} fact={f} />
                                )
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
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

// ── Fact row rendering, split by envelope state ──────────────────────────────────────────────────
// TWO components, not one branching component: the render-rule (WO-12 step 4) is "a mixed table
// renders enveloped rows indexed and legacy rows as labelled prose" — two genuinely different
// treatments of two genuinely different data shapes, not one component with an `if` inside that a
// later edit could accidentally let leak across.

/** UNCHANGED from the pre-envelope render (verbatim markup) — the legacy free-text path this surface
 *  has always used, and the one 100% of live rows exercise today. */
function LegacyFactRow({ fact: f }: { fact: any }) {
  const url = f.sourceUrl ?? sourceUrlFromNote(f.sourceNote);
  const name = f.sourceName ?? sourceNameFromNote(f.sourceNote);
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{f.factLabel}</div>
      <div style={{ fontSize: 12, color: "var(--color-text-primary)", lineHeight: 1.5 }}>{f.value}</div>
      <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>
        {name ? (url ? <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-primary)", textDecoration: "underline" }}>{name}</a> : name) : "source not linked"}
        {f.lastUpdated ? ` · row written ${String(f.lastUpdated).slice(0, 10)}` : " · no date on row"}
      </div>
    </div>
  );
}

// Origin-class accent, banded by strength (vocabularies.mjs ORIGIN_CLASS: 1 weakest .. 7 strongest) —
// same three-tier idiom as this file's own FRESHNESS_COLOR above, so a reader who has already learned
// "green/amber/muted = good/caution/unknown" on this page does not have to learn a second code.
function originClassColor(strength: number | null): string {
  if (strength === null) return "var(--color-text-muted)";
  if (strength >= 6) return "var(--color-success)"; // verified, official
  if (strength >= 3) return "var(--color-warning)"; // modelled, derived, partner
  return "var(--color-error)"; // community, community-corroborated — never citable as fact
}

/** THE dual-layer render: an indexed number, in its unit, with unit/derivation/origin_class shown
 *  rather than hidden (task requirement — provenance surfaced, not suppressed), plus an index against
 *  the chosen base region when one is selected and comparable (`indexAgainstBase` — same unit, both
 *  sides enveloped, never fabricated across a unit mismatch). */
function EnvelopedFactRow({ fact: f, baseFact, isBaseColumn }: { fact: any; baseFact: any; isBaseColumn: boolean }) {
  const display = formatEnvelopedValue(f);
  const originLabel = originClassLabel(f.originClass);
  const strength = originClassStrength(f.originClass);
  const derivLabel = derivationLabel(f.derivation);
  const idx = !isBaseColumn ? indexAgainstBase(f, baseFact) : null;
  const period = f.referencePeriod ? `for ${f.referencePeriod}` : f.asAtDate ? `as at ${String(f.asAtDate).slice(0, 10)}` : null;

  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{f.factLabel}</div>
      <div style={{ fontSize: 12, color: "var(--color-text-primary)", lineHeight: 1.5, fontWeight: 600 }}>
        {display ?? f.value}
        {idx !== null && (
          <span style={{ fontSize: 11, fontWeight: 400, color: "var(--color-text-secondary)", marginLeft: 6 }}>
            (index {Math.round(idx)} vs base)
          </span>
        )}
      </div>
      {/* Provenance chips — surfaced, never suppressed. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, margin: "3px 0 2px" }}>
        {originLabel && (
          <span
            title={`origin_class: ${f.originClass}`}
            style={{
              fontSize: 9.5, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase",
              padding: "1px 6px", borderRadius: 4, border: "1px solid",
              borderColor: originClassColor(strength), color: originClassColor(strength),
              backgroundColor: `${originClassColor(strength)}14`,
            }}
          >
            {originLabel}
          </span>
        )}
        {derivLabel && (
          <span style={{ fontSize: 10, color: "var(--color-text-muted)", alignSelf: "center" }}>{derivLabel}</span>
        )}
      </div>
      <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 1 }}>
        {f.sourceKey ? `${f.sourceKey}${f.sourceRef ? ` · ${f.sourceRef}` : ""}` : "source not linked"}
        {period ? ` · ${period}` : ""}
      </div>
    </div>
  );
}

const cell: React.CSSProperties = {
  border: "1px solid var(--color-border)",
  padding: "6px 10px",
  textAlign: "center",
  verticalAlign: "top",
};
