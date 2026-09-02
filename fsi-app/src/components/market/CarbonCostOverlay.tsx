/**
 * CarbonCostOverlay — spec 02 §6 item 3: "Carbon cost overlay on the freight rate ... expressed as cost
 * per FEU per corridor, not EUR/tCO2e. The differentiating component." Lane CORR, wave 2,
 * system-completion train, 2026-09-02.
 *
 * Server component, NO FETCH HERE (CORR write set: "no fetch in the component") — every corridor's
 * computed result (or honest gap) is handed down as `overlays`, already produced by
 * `carbonCostPerFeu()` (src/lib/market/carbon-cost-per-feu.mjs) from data the page assembled
 * (corridor identity per ADR-024 §4, emission-factor fixture rows, an optional market_series ETS price).
 * This component renders that finished shape and NOTHING ELSE — no computation, no data derivation.
 *
 * THREE RENDER STATES, one badge vocabulary per corridor card:
 *   STATUTORY / DERIVED / ESTIMATE — carbonCostPerFeu()'s own three-way `classification`, which falls
 *     out of migration 286's statutory/estimate purity rule (an estimate never presents as statutory —
 *     see that module's own header). The badge names match StatutoryFigure.tsx/EstimatedFigure.tsx's own
 *     badge vocabulary on purpose, for a reader who has seen those cards elsewhere on the product.
 *   GAP — `carbonCostPerFeu()` returned `ok:false`. Every named gap reason renders verbatim (never
 *     collapsed to a generic "not available"), plus whatever partial basis WAS resolvable, so the card is
 *     decision-ready evidence of exactly what is missing, not a placeholder.
 *
 * The figure is always rendered as an ascending low – point – high triple via `formatRange()`
 * (src/lib/figures/format-range.mjs, the SAME renderer EstimatedFigure.tsx uses) — never a bare point,
 * per ADR-024 decision 2 (ESTIMATE_DISPLAY="range", src/lib/entities/decisions.mjs). When the
 * classification is 'derived' or 'statutory', carbonCostPerFeu() itself collapses low===point===high (no
 * contractable/statutory input carries an invented band), so the triple degenerates to one honest number
 * without this component needing a second code path.
 *
 * Lead-time chart (spec 02 §6 item 5) stays ruled out — no data source (finish-plan-2026-09-02.md §5).
 * This overlay's own footer names that explicitly, on the same surface, rather than leaving the reader to
 * notice its absence.
 */

import { formatRange } from "@/lib/figures/format-range.mjs";

export interface CarbonCostOverlayEntry {
  /** Human-readable corridor label, e.g. "Shanghai – Rotterdam, ocean". Built by the caller from the
   *  same UN/LOCODE pair + mode the result's `corridor` field carries — this component never invents one. */
  label: string;
  result: CarbonCostResult;
}

interface CarbonIntensitySummary {
  headlineLabel: string;
  unit: string;
  sourceKey: string | null;
}

interface CarbonPriceSummary {
  value: number;
  currency: string;
  sourceKey: string;
  asOf: string | null;
  basis: string;
}

export type CarbonCostResult =
  | {
      ok: true;
      corridor: { origin: string; dest: string; mode: string };
      unit: "FEU";
      currency: string;
      low: number;
      point: number;
      high: number;
      classification: "statutory" | "derived" | "estimate";
      intensity: CarbonIntensitySummary;
      distanceKm: number;
      distanceBasis: string;
      payloadTonnesPerFeu: number;
      payloadBasis: string;
      carbonPrice: CarbonPriceSummary;
      gaps: [];
    }
  | {
      ok: false;
      corridor: { origin: string; dest: string; mode: string };
      gaps: string[];
      partial: {
        intensity: CarbonIntensitySummary | null;
        distanceKm: number | null;
        distanceBasis: string | null;
        payloadTonnesPerFeu: number | null;
        payloadBasis: string | null;
        carbonPrice: CarbonPriceSummary | null;
      };
    };

interface CarbonCostOverlayProps {
  overlays: CarbonCostOverlayEntry[];
}

const BADGE: Record<"statutory" | "derived" | "estimate" | "gap", { text: string; bg: string; fg: string }> = {
  statutory: { text: "STATUTORY", bg: "var(--color-secondary)", fg: "#FFFFFF" },
  derived: { text: "DERIVED", bg: "var(--color-bg-raised)", fg: "var(--color-text-secondary)" },
  estimate: { text: "ESTIMATE", bg: "var(--color-primary)", fg: "#FFFFFF" },
  gap: { text: "GAP", bg: "var(--color-bg-raised)", fg: "var(--color-text-muted)" },
};

function Chip({ label, title }: { label: string; title?: string }) {
  return (
    <span
      title={title}
      style={{
        display: "inline-block",
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: "0.04em",
        color: "var(--color-text-muted)",
        border: "1px solid var(--color-border)",
        borderRadius: 4,
        padding: "2px 6px",
        marginRight: 6,
        marginBottom: 4,
      }}
    >
      {label}
    </span>
  );
}

export function CarbonCostOverlay({ overlays }: CarbonCostOverlayProps) {
  if (!overlays || overlays.length === 0) return null;

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 36px 28px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 16,
          borderBottom: "2px solid var(--color-text-primary)",
          padding: "0 0 8px",
          margin: "0 0 12px",
          flexWrap: "wrap",
        }}
      >
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 400,
            fontSize: 26,
            letterSpacing: "0.02em",
            textTransform: "uppercase",
            margin: 0,
          }}
        >
          Carbon cost per FEU
        </h2>
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 800,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--color-text-muted)",
          }}
        >
          per corridor, not EUR/tCO2e — the differentiating component
        </span>
      </div>

      <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: "0 0 14px", maxWidth: "82ch" }}>
        EUA / ETS2 / CBAM / UKA cost, converted from a per-mode emission factor through the corridor&apos;s
        own routing distance and container payload, to what a shipper actually pays per forty-foot
        equivalent unit. Corridor identity is UN/LOCODE port-pair + mode (ADR-024 §4). The lead-time
        position chart (spec 02 §6 item 5) is not built here — no data source exists for it, and that stays
        named rather than silently absent.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
        {overlays.map((entry, i) => (
          <CorridorCard key={`${entry.result.corridor.origin}-${entry.result.corridor.dest}-${entry.result.corridor.mode}-${i}`} entry={entry} />
        ))}
      </div>
    </div>
  );
}

function CorridorCard({ entry }: { entry: CarbonCostOverlayEntry }) {
  const { label, result } = entry;
  const badge = BADGE[result.ok ? result.classification : "gap"];

  return (
    <div
      className="cl-card"
      data-figure-kind={result.ok ? result.classification : "gap"}
      style={{
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        background: "var(--color-bg-surface)",
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          className="cl-badge"
          style={{
            background: badge.bg,
            color: badge.fg,
            borderColor: badge.bg,
            fontSize: 9.5,
            fontWeight: 800,
            letterSpacing: "0.08em",
            borderRadius: 4,
            padding: "2px 7px",
            border: "1px solid",
          }}
        >
          {badge.text}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700 }}>{label}</span>
      </div>

      {result.ok ? (
        <>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--color-text-primary)" }}>
            {formatRange(result.low, result.point, result.high, null, result.currency)}
            <span style={{ fontSize: 12, fontWeight: 400, color: "var(--color-text-muted)", marginLeft: 6 }}>/ FEU</span>
          </div>
          <div>
            <Chip
              label={`${result.intensity.headlineLabel} factor · ${result.intensity.sourceKey ?? "unknown source"}`}
              title={`Emission intensity: ${result.intensity.unit}`}
            />
            <Chip label="Distance" title={result.distanceBasis} />
            <Chip label="Payload/FEU" title={result.payloadBasis} />
            <Chip
              label={`Carbon price · ${result.carbonPrice.sourceKey}`}
              title={`${result.carbonPrice.basis}${result.carbonPrice.asOf ? ` (as of ${result.carbonPrice.asOf})` : ""}`}
            />
          </div>
        </>
      ) : (
        <>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
            {result.gaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
          {(result.partial.intensity || result.partial.distanceBasis || result.partial.payloadBasis || result.partial.carbonPrice) && (
            <div>
              {result.partial.intensity && (
                <Chip
                  label={`${result.partial.intensity.headlineLabel} factor · ${result.partial.intensity.sourceKey ?? "unknown source"}`}
                  title="Already resolved for this corridor"
                />
              )}
              {result.partial.distanceBasis && <Chip label="Distance" title={result.partial.distanceBasis} />}
              {result.partial.payloadBasis && <Chip label="Payload/FEU" title={result.partial.payloadBasis} />}
              {result.partial.carbonPrice && (
                <Chip label={`Carbon price · ${result.partial.carbonPrice.sourceKey}`} title={result.partial.carbonPrice.basis} />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
