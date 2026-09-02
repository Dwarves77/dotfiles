"use client";

/**
 * EstimatedFigure — Layer 4 of docs/specs/08-flywheel-design.md §4 (see StatutoryFigure.tsx's header for
 * the shared "one gate, separate components" rationale). This is the OTHER half of that isolation: a
 * modelled/estimated number can never be mistaken for a statutory one because it renders through a
 * different component, with a visibly different badge and a range that never collapses to a bare point.
 *
 * ADR-024 (docs/decisions/ADR-024-decision-propagation.md), ESTIMATE_DISPLAY="range": "never a bare
 * point... break-even wage gets equal billing." Two rules enforced here, not left to the caller:
 *   1. `figure.value` alone is never rendered — low/point/high always render together, even when
 *      low === point === high (a degenerate but honest range).
 *   2. A `companions` entry (e.g. automate-vs-hire's break-even wage, riding alongside NPV in the same
 *      estimated_values row's `distribution` jsonb — see methods/automate-vs-hire.ts's header) renders
 *      with the SAME card treatment as the primary figure, not a smaller secondary line — "equal billing"
 *      means equal visual weight, not an afterthought footnote.
 *
 * THE ONE GATE — same as StatutoryFigure: every render passes through admissibleFor() first.
 *
 * DerivedFigure (bottom of this file) is a DIFFERENT, third rendering: a plain derived value that is
 * neither statutory nor estimated (carbon-intensity's own words, methods/carbon-intensity.ts: "a
 * deterministic conversion of a published factor," derivation "calculated", never a range). The write set
 * for this lane names three figure component files (StatutoryFigure, EstimatedFigure,
 * RecalculationNotice) and no fourth — DerivedFigure lives here, as a second export, rather than in a new
 * file with no allowlisted destination. It still calls the one gate.
 */

import type { Value, Use } from "@/lib/propagation/types.ts";
import { admissibleFor } from "@/lib/propagation/admissible-for.ts";
import { formatRange } from "@/lib/figures/format-range.mjs";

export interface EstimatedFigureCompanion {
  label: string;
  low: number | null;
  point: number | null;
  high: number | null;
  unit: string | null;
  /** The companion's OWN currency, when it is a money figure. A companion never inherits the primary
   *  figure's currency (a payback period is years even when the NPV is USD — /operations, 2026-09-02). */
  currency?: string | null;
  /** Named refusal reason when this companion metric has no value at this input point (e.g.
   *  automate-vs-hire.mjs's REFUSAL.NO_HOUR_SAVINGS / REFUSAL.NEVER_PAYS_BACK) — rendered instead of a
   *  blank or a fabricated zero. */
  refusal?: string | null;
}

export interface EstimatedFigureProps {
  figure: Value;
  label: string;
  /** Rendered with the same visual weight as the primary figure — see header. */
  companions?: EstimatedFigureCompanion[];
  /** A short note on how this figure was derived (e.g. a pedigree score's meaning, or the ±10% sensitivity
   *  convention automate-vs-hire.mjs documents) shown as a hover tooltip, never as invented precision. */
  pedigreeNote?: string | null;
  use?: Use;
  now?: Date;
}

function badge(text: string, bg: string, fg: string) {
  return (
    <span className="cl-badge" style={{ background: bg, color: fg, borderColor: bg }}>
      {text}
    </span>
  );
}

export function EstimatedFigure({ figure, label, companions = [], pedigreeNote, use = "analysis", now = new Date() }: EstimatedFigureProps) {
  const verdict = admissibleFor(figure, use, now);
  const cards = [
    { label, low: figure.valueLow, point: figure.value, high: figure.valueHigh, unit: figure.unit, currency: figure.currency, refusal: null as string | null },
    ...companions.map((c) => ({ ...c, currency: c.currency ?? null })),
  ];

  return (
    <div className="cl-card" style={{ padding: "16px 18px" }} data-figure-kind="estimated" data-method-id={figure.methodId} data-method-version={figure.methodVersion}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        {badge("ESTIMATE", "var(--color-primary)", "#FFFFFF")}
        <span className="cl-card-title" style={{ fontSize: 13 }}>{label}</span>
        {pedigreeNote && (
          <span title={pedigreeNote} aria-label={pedigreeNote} className="cl-card-meta" style={{ cursor: "help", border: "1px solid var(--color-border)", borderRadius: "50%", width: 16, height: 16, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            i
          </span>
        )}
      </div>

      {!verdict.ok ? (
        <div role="status" className="cl-card-body" style={{ color: "var(--color-error)", fontWeight: 600 }}>
          Not admissible for {use}: {verdict.reason}.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: cards.length > 1 ? "repeat(auto-fit, minmax(160px, 1fr))" : "1fr" }}>
          {cards.map((c, i) => (
            <div key={i}>
              <div className="cl-card-meta">{c.label}</div>
              {c.refusal ? (
                <div className="cl-card-body" style={{ color: "var(--color-text-muted)", fontStyle: "italic" }}>{c.refusal}</div>
              ) : (
                <div className="cl-stat-number" style={{ fontSize: 20 }}>
                  {formatRange(c.low, c.point, c.high, c.unit, c.currency)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {verdict.ok && (
        <div className="cl-card-meta" style={{ marginTop: 8 }}>
          Confidence {(verdict.effectiveConfidence * 100).toFixed(0)}% · origin: {verdict.mustLabel} · lifecycle: {figure.lifecycle}
        </div>
      )}
    </div>
  );
}

// ── DerivedFigure — a plain derived value, neither statutory nor estimated (see file header) ───────────

export interface DerivedFigureProps {
  figure: Value;
  label: string;
  /** e.g. an emission_factors row's own source_key, so the reader can trace the underlying factor. */
  sourceNote?: string | null;
  use?: Use;
  now?: Date;
}

export function DerivedFigure({ figure, label, sourceNote, use = "calculation", now = new Date() }: DerivedFigureProps) {
  const verdict = admissibleFor(figure, use, now);

  return (
    <div className="cl-card" style={{ padding: "16px 18px" }} data-figure-kind="derived" data-method-id={figure.methodId} data-method-version={figure.methodVersion}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        {badge("DERIVED", "var(--color-bg-raised)", "var(--color-text-secondary)")}
        <span className="cl-card-title" style={{ fontSize: 13 }}>{label}</span>
      </div>

      {!verdict.ok ? (
        <div role="status" className="cl-card-body" style={{ color: "var(--color-error)", fontWeight: 600 }}>
          Not admissible for {use}: {verdict.reason}.
        </div>
      ) : (
        <div className="cl-stat-number" style={{ fontSize: 22 }}>
          {figure.value === null || !Number.isFinite(figure.value) ? "—" : figure.value.toLocaleString(undefined, { maximumFractionDigits: 1 })}
          {figure.unit ? <span className="cl-card-meta" style={{ marginLeft: 6, fontSize: 12 }}>{figure.unit}</span> : null}
        </div>
      )}

      {sourceNote && <div className="cl-card-meta" style={{ marginTop: 4 }}>{sourceNote}</div>}
      {verdict.ok && (
        <div className="cl-card-meta" style={{ marginTop: 4 }}>
          Confidence {(verdict.effectiveConfidence * 100).toFixed(0)}% · origin: {verdict.mustLabel} · lifecycle: {figure.lifecycle}
        </div>
      )}
    </div>
  );
}
