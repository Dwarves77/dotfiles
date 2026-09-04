"use client";

/**
 * StatutoryFigure — Layer 4 of docs/specs/08-flywheel-design.md §4's four-layer statutory/estimate
 * isolation: "separate render components" for a statutory figure vs. an estimated one, so a reader can
 * never mistake a modelled range for a filing-grade number (or vice versa) by looking at the same
 * component with different data.
 *
 * THE ONE GATE. Every figure this component renders passes through `admissibleFor()`
 * (src/lib/propagation/admissible-for.ts, spec §3.3's "pollution barrier") before a number is shown —
 * never a raw read of `figure.value` without the verdict first. A refused figure renders its refusal
 * reason, never a stale or falsified number quietly relabelled.
 *
 * WHY `use` DEFAULTS TO "filing". A StatutoryFigure exists to be cited in a contract or a regulatory
 * filing — that is the whole reason this component (and not EstimatedFigure) was chosen for this number.
 * A caller showing a statutory figure in a lighter context (e.g. a dashboard preview) may pass a lower
 * `use`, but the default matches the component's own reason for existing.
 */

import type { Value, Use } from "@/lib/propagation/types.ts";
import { admissibleFor } from "@/lib/propagation/admissible-for.ts";
import { formatNumber } from "@/lib/format";

export interface StatutoryFigureProps {
  /** The full derived_values-shaped figure (or a statutory_computations row mapped onto the same shape —
   *  admissibleFor() only reads lifecycle/admissibility/originClass/obsStatus/derivation/baseConfidence/
   *  assertedAt/halfLifeDays, so either source satisfies it). */
  figure: Value;
  /** The regulation/article this number is computed under — FUELEU_STATUTE_CITATION-shaped, or any other
   *  statute citation string. Never omitted: a statutory figure with no citation is not distinguishable
   *  from an estimate by the reader. */
  citation: string;
  /** The formula's own version string, so a superseded formula's output is never confused with the
   *  current one — FUELEU_FORMULA_VERSION-shaped. */
  formulaVersion: string;
  /** A short label naming what the number IS ("FuelEU Annex IV penalty", "compliance balance"). */
  label: string;
  /** Defaults to "filing" — see header. */
  use?: Use;
  /** Injected clock, matching every pure function in this engine — never `Date.now()` internally. */
  now?: Date;
}

function formatValue(value: number | null, unit: string | null, currency: string | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const formatted = Math.abs(value) >= 1000 ? formatNumber(value, { maximumFractionDigits: 0 }) : formatNumber(value, { maximumFractionDigits: 2 });
  if (currency) return `${currency} ${formatted}`;
  if (unit) return `${formatted} ${unit}`;
  return formatted;
}

export function StatutoryFigure({ figure, citation, formulaVersion, label, use = "filing", now = new Date() }: StatutoryFigureProps) {
  const verdict = admissibleFor(figure, use, now);

  return (
    <div
      className="cl-card"
      style={{ padding: "16px 18px" }}
      data-figure-kind="statutory"
      data-method-id={figure.methodId}
      data-method-version={figure.methodVersion}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span
          className="cl-badge"
          style={{ background: "var(--color-secondary)", color: "#FFFFFF", borderColor: "var(--color-secondary)" }}
        >
          STATUTORY
        </span>
        <span className="cl-card-title" style={{ fontSize: 13 }}>{label}</span>
      </div>

      {verdict.ok ? (
        <div className="cl-stat-number" style={{ fontSize: 26, marginBottom: 4 }}>
          {formatValue(figure.value, figure.unit, figure.currency)}
        </div>
      ) : (
        <div
          role="status"
          className="cl-card-body"
          style={{ color: "var(--color-error)", fontWeight: 600, marginBottom: 4 }}
        >
          Not admissible for {use}: {verdict.reason}.
        </div>
      )}

      <div className="cl-card-meta" style={{ lineHeight: 1.5 }}>
        {citation}
        <br />
        Formula version: {formulaVersion}
      </div>

      {verdict.ok && (
        <div className="cl-card-meta" style={{ marginTop: 4 }}>
          Confidence {(verdict.effectiveConfidence * 100).toFixed(0)}% · origin: {verdict.mustLabel}
        </div>
      )}
    </div>
  );
}
