import { SectionCard } from "@/components/ui/SectionCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ABSENCE_TEXT_STYLE } from "@/components/ui/Absence";
import { formatNumber } from "@/lib/format";
import { buildLeadTimePosition, DEFAULT_MIN_SAMPLE, type LeadTimePositionEntry } from "@/lib/market/lead-time-position.mjs";
import type { RawMarketSeriesRow } from "@/lib/supabase-server";

export type { RawMarketSeriesRow };

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
