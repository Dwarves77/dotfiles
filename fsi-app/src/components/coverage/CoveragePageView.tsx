/**
 * CoveragePageView: the body of /dashboard/coverage, the generated Coverage surface (lane COV-1, 2026-10-08; spec 00 section 4).
 *
 * WHAT IT IS. What the platform watches and what it does not, as a matrix of mode x geography x data class with a
 * numerator and a denominator in every cell, a version and two dates, a static URL per cell, a CSV export and a
 * "request coverage" action on every gap. Every number is generated from the index (src/lib/coverage/
 * coverage-matrix.mjs); nothing here is hand-written. It is NOT a sixth customer surface (PI-1): it is a generated
 * page reachable from each surface's denominator line and from the portfolio-add flow, and it carries no content
 * category of its own.
 *
 * AGGREGATES ONLY. Counts per cell. No catalogue entry (title, identifier, URL) appears here: the operator ruling of
 * 2026-07-29 keeps those admin-only, and this page does not reopen it.
 *
 * READER'S GOAL: see how much of a surface, place or mode the platform actually covers, before relying on it.
 * PATH: arrive from a surface's denominator line (already on that data class), or open /dashboard/coverage and pick an axis.
 * ONE PRIMARY ACTION per section: the selected-cell panel offers Download CSV, or Request coverage when the cell is
 * a gap (never both as equals). FEEDBACK: both actions acknowledge at once and state the outcome (see their islands).
 *
 * LAYOUT. The geography rows are plain wrapping flex rows, not a table: at 375 px a row's cells wrap under its title
 * instead of forcing the page sideways. This is a look the artboards do not draw (there is no Coverage artboard);
 * it is built from existing parts (Masthead, SectionCard, RailCard, CoverageState) and recorded on the DESIGN
 * CHANGES OWED list for Claude Design (rule 20), never decided silently.
 *
 * Server-renderable: no hooks here. The interactive islands are CoverageState (request, retry) and
 * CoverageExportButton.
 */

import Link from "next/link";
import { Masthead } from "@/components/ui/Masthead";
import { SectionCard } from "@/components/ui/SectionCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { RailCard } from "@/components/ui/RailCard";
import { CoverageState } from "@/components/ui/CoverageState";
import { LIST_SURFACE_MOBILE_CSS } from "@/components/list-surface/ListSurfaceShell";
import { CoverageExportButton } from "@/components/coverage/CoverageExportButton";
import { ALL, UNTAGGED, coverageHref } from "@/lib/coverage/coverage-matrix.mjs";
import { formatLocaleDate, formatNumber } from "@/lib/format";

/* eslint-disable @typescript-eslint/no-explicit-any -- the matrix and view are the plain objects coverage-matrix.mjs returns */
export interface CoveragePageViewProps {
  matrix: any;
  view: any;
  query: { mode: string; dataClass: string; geography: string };
  /** Set when the matrix could not be read: the page shows the error state and no numbers. */
  error: string | null;
  dateLabel: string;
  nowIso?: string;
}

const dateOf = (iso: string | null) =>
  iso ? formatLocaleDate(new Date(iso), { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }) : null;

const SELECT_STYLE = {
  minHeight: 44,
  width: "100%",
  padding: "0 10px",
  fontSize: "var(--fs-13)",
  border: "1px solid var(--line-1)",
  borderRadius: 6,
  background: "var(--card)",
  color: "var(--ink)",
  boxSizing: "border-box",
} as const;

const LABEL_STYLE = { display: "block", fontSize: "var(--fs-105)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-3)", margin: "0 0 4px" } as const;

function Fraction({ numerator, denominator }: { numerator: number; denominator: number }) {
  return (
    <span style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
      {formatNumber(numerator)} of {formatNumber(denominator)}
    </span>
  );
}

function scopeLabel(matrix: any, query: CoveragePageViewProps["query"]): string {
  const cls = query.dataClass === ALL ? "every data class" : matrix.dataClasses.find((c: any) => c.code === query.dataClass)?.label ?? query.dataClass;
  const geo = query.geography === ALL ? "every geography" : matrix.geographies.find((g: any) => g.code === query.geography)?.label ?? query.geography;
  const mode = query.mode === ALL ? "all modes" : matrix.modes.find((m: any) => m.code === query.mode)?.label ?? query.mode;
  return `${cls}, ${geo}, ${mode}`;
}

export function CoveragePageView({ matrix, view, query, error, dateLabel, nowIso }: CoveragePageViewProps) {
  const here = coverageHref(query);

  return (
    <>
      <div className="cl-list-surface-masthead" style={{ padding: "20px 40px 0" }}>
        <style>{LIST_SURFACE_MOBILE_CSS}</style>
        <Masthead
          title="Coverage"
          dek={
            <>
              What the platform watches and what it does not · instruments catalogued per surface and place, and how many are{" "}
              <b style={{ color: "var(--ink)" }}>dual-verified</b> · generated from the data
            </>
          }
          dateLabel={dateLabel}
          nowIso={nowIso}
        />
      </div>

      <div
        className="cl-list-surface-grid"
        style={{ padding: "20px 40px 40px", display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: 28, alignItems: "start" }}
      >
        <style>{`
          @media (max-width: 1280px) {
            .cl-list-surface-grid { grid-template-columns: minmax(0, 1fr) !important; }
          }
        `}</style>
        <style>{LIST_SURFACE_MOBILE_CSS}</style>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          {error ? (
            <SectionCard dataAudit="coverage-card" style={{ minWidth: 0 }}>
              <div style={{ padding: "14px 16px 16px" }}>
                <CoverageState state="error" variant="block" subject="The coverage matrix" reason={error} retryHref={here} />
              </div>
            </SectionCard>
          ) : (
            <>
              <SectionCard dataAudit="coverage-card" style={{ minWidth: 0 }}>
                <SectionHeading
                  title={`Coverage matrix · ${formatNumber(matrix.geographies.length)} places`}
                  aside={
                    <span data-part="coverage-version">
                      Version {matrix.version} · generated {dateOf(matrix.generatedAt)} · data as of{" "}
                      {dateOf(matrix.dataAsOf) ?? "not recorded by the index yet"}
                    </span>
                  }
                />
                <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
                  {/* The methodology drawer (coordinator ruling 2026-10-08): the numerator definition in one line, closed by
                      default (accordions are closed platform-wide). MKT-1's SeriesProvenance envelope component had not
                      merged when this was written, so the drawer is a native details element in the page's own type;
                      swap it for that component once it lands. */}
                  <details data-part="coverage-methodology">
                    <summary style={{ minHeight: 44, display: "flex", alignItems: "center", cursor: "pointer", fontSize: "var(--fs-12)", fontWeight: 600, color: "var(--ink)" }}>
                      How these figures are made
                    </summary>
                    <p style={{ margin: "0 0 4px", fontSize: "var(--fs-12)", color: "var(--ink-2)" }}>{matrix.definitions.numerator_one_line}</p>
                  </details>
                  <form method="get" action="/dashboard/coverage" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, alignItems: "end" }}>
                    <label>
                      <span style={LABEL_STYLE}>Data class</span>
                      <select name="data_class" defaultValue={query.dataClass} style={SELECT_STYLE}>
                        <option value={ALL}>All data classes</option>
                        {matrix.dataClasses.map((c: any) => (
                          <option key={c.code} value={c.code}>{c.label}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span style={LABEL_STYLE}>Geography</span>
                      <select name="geography" defaultValue={query.geography} style={SELECT_STYLE}>
                        <option value={ALL}>All geographies</option>
                        {matrix.geographies.map((g: any) => (
                          <option key={g.code} value={g.code}>{g.label}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span style={LABEL_STYLE}>Mode</span>
                      <select name="mode" defaultValue={query.mode} style={SELECT_STYLE}>
                        <option value={ALL}>All modes</option>
                        {matrix.modes.map((m: any) => (
                          <option key={m.code} value={m.code}>{m.label}</option>
                        ))}
                      </select>
                    </label>
                    <button type="submit" style={{ ...SELECT_STYLE, width: "auto", padding: "0 16px", fontWeight: 600, cursor: "pointer" }}>
                      Show
                    </button>
                  </form>

                  {matrix.modeTagging.tagged > 0 && matrix.modeTagging.tagged < matrix.modeTagging.total && (
                    <p data-part="coverage-mode-tagging" style={{ margin: 0, fontSize: "var(--fs-11)", color: "var(--ink-2)" }}>
                      Transport mode is tagged on <Fraction numerator={matrix.modeTagging.tagged} denominator={matrix.modeTagging.total} /> catalogued
                      instruments; the rest sit under Mode not tagged.
                    </p>
                  )}

                  {matrix.modeTagging.tagged === 0 && (
                    <CoverageState
                      state="not_covered"
                      variant="block"
                      subject="Transport mode on the catalogue"
                      reason={matrix.definitions.untagged_mode}
                      requestRef={coverageHref({ mode: UNTAGGED })}
                    />
                  )}

                  <p style={{ margin: 0, fontSize: "var(--fs-12)", color: "var(--ink)" }}>
                    <b>
                      <Fraction numerator={view.scoped.numerator} denominator={view.scoped.denominator} />
                    </b>{" "}
                    catalogued instruments in this view are dual-verified.{" "}
                    <span style={{ color: "var(--ink-2)" }}>
                      An instrument tagged to two data classes counts in both columns; the platform total is{" "}
                      <Fraction numerator={matrix.totals.numerator} denominator={matrix.totals.denominator} />.
                    </span>
                  </p>

                  {/* The one primary action of the matrix section: take this view away as a file. */}
                  {view.rows.length > 0 && <CoverageExportButton query={query} label={scopeLabel(matrix, query)} />}

                  {view.rows.length === 0 ? (
                    <CoverageState
                      state="not_covered"
                      variant="block"
                      subject="This view of the catalogue"
                      reason="No catalogued instrument matches the data class, geography and mode you chose."
                      requestRef={here}
                    />
                  ) : (
                    <div data-audit="coverage-rows" style={{ display: "flex", flexDirection: "column" }}>
                      {view.rows.map((row: any) => (
                        <div
                          key={row.geography}
                          data-part="coverage-row"
                          style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 12px", padding: "10px 0", borderTop: "1px solid var(--line-3)" }}
                        >
                          <span
                            data-guard-title
                            style={{ flex: "1 1 100%", minWidth: 0, fontSize: "var(--fs-13)", fontWeight: 600, color: "var(--ink)", overflowWrap: "anywhere" }}
                          >
                            {row.label}
                          </span>
                          <span style={{ display: "flex", flexWrap: "wrap", gap: 8, flex: "1 1 100%", minWidth: 0 }}>
                            {row.cells.map((c: any) => (
                              <Link
                                key={c.dataClass}
                                href={c.href}
                                aria-label={
                                  c.present
                                    ? `${c.dataClassLabel} in ${row.label}: ${c.numerator} of ${c.denominator} dual-verified`
                                    : `${c.dataClassLabel} in ${row.label}: not covered, open the cell to request coverage`
                                }
                                style={{
                                  display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44, padding: "0 12px",
                                  border: "1px solid var(--line-1)", borderRadius: 6, fontSize: "var(--fs-12)", color: "var(--ink)", textDecoration: "none",
                                }}
                              >
                                <span style={{ color: "var(--ink-2)" }}>{c.dataClassLabel}</span>
                                {c.present ? (
                                  <b>
                                    <Fraction numerator={c.numerator} denominator={c.denominator} />
                                  </b>
                                ) : (
                                  <CoverageState state="not_covered" variant="cell" subject={`${c.dataClassLabel} in ${row.label}`} />
                                )}
                              </Link>
                            ))}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </SectionCard>

              {view.selected && (
                <SectionCard dataAudit="coverage-selected" style={{ minWidth: 0 }}>
                  <SectionHeading title="Selected cell" aside={scopeLabel(matrix, query)} />
                  <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
                    {view.selected.present ? (
                      <>
                        <p style={{ margin: 0, fontSize: "var(--fs-13)", color: "var(--ink)" }}>
                          <b>
                            <Fraction numerator={view.selected.numerator} denominator={view.selected.denominator} />
                          </b>{" "}
                          catalogued instruments here are dual-verified.
                        </p>
                        <p style={{ margin: 0, fontSize: "var(--fs-12)", color: "var(--ink-2)" }}>
                          This cell has its own address. Copy the page address to share exactly this view.
                        </p>
                      </>
                    ) : (
                      <CoverageState
                        state="not_covered"
                        variant="block"
                        subject={scopeLabel(matrix, query).slice(0, 100)}
                        reason={
                          view.selected.validAxes
                            ? "Nothing has been catalogued in this cell yet."
                            : "This combination is not in the catalogue."
                        }
                        requestRef={here}
                      />
                    )}
                  </div>
                </SectionCard>
              )}
            </>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {!error && (
            <>
              <RailCard title="How to read this" dataAudit="coverage-definitions">
                <p style={{ margin: "0 0 8px", fontSize: "var(--fs-12)", color: "var(--ink)" }}>
                  <b>Denominator.</b> {matrix.definitions.denominator}
                </p>
                <p style={{ margin: "0 0 8px", fontSize: "var(--fs-12)", color: "var(--ink)" }}>
                  <b>Numerator.</b> {matrix.definitions.numerator}
                </p>
                <p style={{ margin: 0, fontSize: "var(--fs-12)", color: "var(--ink)" }}>
                  <b>Verified briefs.</b>{" "}
                  {matrix.verifiedBriefs === null
                    ? "The count could not be read just now."
                    : `${formatNumber(matrix.verifiedBriefs)} on the platform. ${matrix.definitions.verified_briefs}`}
                </p>
              </RailCard>
            </>
          )}
        </div>
      </div>
    </>
  );
}
