/**
 * LeadTimeChart, spec 02 section 6 item 5: "Lead-time position chart (months axis; you, peer cohort,
 * adjacent-industry band). When must I act before a customer RFP starts scoring me on it. Converts
 * vague pressure into months." Lane L10, coordinator ruling 2026-10-03 (docs/dispatches/lane-briefs/
 * 2026-10-03/brief-l10.md): supersedes `finish-plan-2026-09-02.md`'s "no data source, stays ruled out"
 * hold on this chart, it IS built here, fed by lane L11's SBTi Target Dashboard producer (spec 02
 * section 7: "This is the diffusion engine behind the lead-time chart").
 *
 * Server component, NO FETCH HERE, same contract as CarbonCostOverlay.tsx (CORR write set, "no fetch
 * in the component"). The caller (market/page.tsx) hands down the raw market_series rows it already
 * has in scope; this component filters to the sbti-prefixed subset and derives the comparative
 * position through the pure `buildLeadTimePosition()` (src/lib/market/lead-time-position.mjs, see
 * that module's own header for why it reads RAW rows rather than the series board's reduced display
 * shape). No computation beyond rendering that finished result lives here.
 *
 * TWO RENDER STATES, never a fabricated third. `forecastable: true` renders the sorted peer-cohort
 * distribution (months axis) with the cohort median marked; `forecastable: false` renders the
 * explicit "not forecastable" absence line (Absence.tsx's own sentence-shaped text treatment) naming
 * the real sample size against the floor, never a guessed position under any sample size (CLAUDE.md
 * rule 2; this lane's brief, "Standing prohibitions").
 *
 * WHAT THIS CHART DOES NOT RENDER, NAMED RATHER THAN SILENTLY DROPPED. Spec 02 section 3's own worked
 * example reads "you are 14 months ahead of the forwarding median and 6 months behind the automotive
 * OEM cohort", a customer-specific marker plus a separate adjacent-industry band. Neither is rendered
 * today: `market_series` carries no column linking a row to THIS platform's own customer (there is no
 * "your" SBTi target to plot), and the SBTi feed's own per-company sector is not yet threaded into a
 * market_series column (the 16-column envelope, migration 268, carries no sector field), so an
 * adjacent-industry split would be fabricated, not derived. This renders the one thing the data
 * honestly supports: the peer-cohort distribution and its median, exactly as `buildLeadTimePosition()`
 * computes it. The gap is named here, not papered over, per CLAUDE.md's "no invented content; a gap is
 * flagged, not filled."
 *
 * UX: one goal (an honest comparative lead-time read, or an honest absence), no primary action
 * (read-only, like CarbonCostOverlay), no asynchronous state (server-assembled props). Title carries
 * `data-guard-title` via the shared `SectionHeading` (house convention, UI system handoff 2026-09-06),
 * mounted inside the shared `SectionCard` shell per ruling A1/5.1 (cardrule) rather than hand-rolled
 * chrome, CarbonCostOverlay predates both shared components; this is new code, so it uses them.
 */

import { SectionCard } from "@/components/ui/SectionCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ABSENCE_TEXT_STYLE } from "@/components/ui/Absence";
import { formatNumber } from "@/lib/format";
import { buildLeadTimePosition, DEFAULT_MIN_SAMPLE, type LeadTimePositionEntry } from "@/lib/market/lead-time-position.mjs";

/** The raw market_series row shape this component reads (migration 268's 16-column envelope), the
 *  same shape the page's own `fetchMarketSeriesBoard`/raw query already carries, never reduced to a
 *  formatted display string before it reaches this component (see this file's header). */
export interface RawMarketSeriesRow {
  series_key: string;
  label?: string | null;
  value_numeric?: number | string | null;
  unit?: string | null;
  origin_class?: string | null;
  source_key?: string | null;
  n_observations?: number | null;
  as_at_date?: string | null;
  reference_period?: string | null;
}

interface LeadTimeChartProps {
  /** Every market_series row the caller has in scope (any mix of prefixes, this component filters to
   *  `sbti:*` itself, mirroring `buildLeadTimePosition()`'s own filter, so the caller never has to
   *  pre-filter). Pass `[]`, never omit, when the page has not fetched raw rows (renders the honest
   *  zero-sample absence state, same as a populated-but-thin fetch). */
  rows: RawMarketSeriesRow[];
  /** Override for tests/fixtures. Defaults to DEFAULT_MIN_SAMPLE (5): SBTi itself states no minimum
   *  sample for this dataset (docs/specs/02-market-intel.md section 7); the default reuses this same
   *  spec's own nearest named floor convention (Xeneta's 5, section 1) as a conservative stand-in, a
   *  judgment call named in this lane's report rather than invented silently. */
  minSample?: number;
}

function CompanyBar({ entry, maxMonths }: { entry: LeadTimePositionEntry; maxMonths: number }) {
  const widthPct = maxMonths > 0 ? Math.max(2, (entry.months / maxMonths) * 100) : 2;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "3px 0" }}>
      <span
        style={{
          flex: "0 0 160px",
          fontSize: 11,
          fontWeight: 600,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={entry.label}
      >
        {entry.label}
      </span>
      <div style={{ flex: 1, minWidth: 0, background: "var(--color-bg-raised)", borderRadius: 3, height: 10 }}>
        <div
          style={{
            width: `${widthPct}%`,
            height: "100%",
            borderRadius: 3,
            background: "var(--color-primary)",
          }}
        />
      </div>
      <span style={{ flex: "0 0 68px", textAlign: "right", fontSize: 11, fontWeight: 700, fontFamily: "var(--font-display)" }}>
        {formatNumber(entry.months, { maximumFractionDigits: 1 })} mo
      </span>
    </div>
  );
}

export function LeadTimeChart({ rows, minSample = DEFAULT_MIN_SAMPLE }: LeadTimeChartProps) {
  const position = buildLeadTimePosition(rows, { minSample });
  const maxMonths = position.forecastable ? Math.max(...position.rows.map((r) => r.months), 1) : 1;

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 36px 28px" }}>
      <SectionCard as="section" padding="16px 18px" dataAudit="lead-time-chart">
        <SectionHeading title="Lead-time position" aside="SBTi Target Dashboard" />
        <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: "0 0 12px", maxWidth: "82ch" }}>
          Peer-cohort distribution of months to each company&apos;s SBTi target commitment, months axis
          (spec 02 section 6 item 5). A customer marker and an adjacent-industry band are not rendered
          yet, no market_series column links a row to a customer-specific target or a sector today,
          named here rather than silently absent.
        </p>

        {!position.forecastable ? (
          <p data-part="not-forecastable" style={ABSENCE_TEXT_STYLE}>
            Not forecastable, {position.reason} (minimum {position.minSample} to render a position).
          </p>
        ) : (
          <div>
            <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-text-muted)", margin: "0 0 8px" }}>
              Cohort median: {formatNumber(position.cohortMedianMonths!, { maximumFractionDigits: 1 })} months · n = {position.sampleSize}
            </p>
            {position.rows.map((entry) => (
              <CompanyBar key={entry.seriesKey} entry={entry} maxMonths={maxMonths} />
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
