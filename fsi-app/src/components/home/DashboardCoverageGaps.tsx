"use client";

/**
 * DashboardCoverageGaps — Housekeeping body (left). Hand-curated v1
 * surfaces potentially-missing regulations the system would expect to
 * track for the workspace's active sectors. Each entry has a recommended
 * action (e.g. "Suggest a source", "Add to registry").
 *
 * - Reads via React 19 use() inside a Suspense boundary set by HomeSurface.
 * - Capped at 2 items by the fetcher (sorted high then medium then low).
 * - High-severity item gets the filled --high-bg / --high-bd treatment;
 *   others get the muted treatment with --moderate left rule.
 * - Description supports inline <i> callouts (rendered with safe HTML —
 *   the strings are operator-curated in the coverage_gaps table).
 *
 * Empty + caveat copy is spec-verbatim. Do not paraphrase.
 */

import { use } from "react";
import { TypesetSection } from "./TypesetSection";
import type { CoverageGap } from "@/lib/data";

export interface DashboardCoverageGapsProps {
  promise: Promise<CoverageGap[]>;
}

const SEV_LABEL: Record<CoverageGap["severity"], string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

const CAVEAT_COPY =
  "We're still expanding our source registry; check back as jurisdictions are added.";

export function DashboardCoverageGaps({ promise }: DashboardCoverageGapsProps) {
  // The promise is constructed by getCoverageGaps in src/lib/data.ts which
  // catches all errors and resolves to []. We cannot wrap use() in try/catch
  // because it throws a Suspense exception React needs to bubble; rely on
  // the fetcher's try/catch and the Suspense boundary in HomeSurface for
  // safety. Per the plan, error state is "hide the widget silently"; that
  // case is reached by the fetcher returning [] which falls into the empty
  // state below.
  const items = use(promise);

  if (items.length === 0) {
    return (
      <TypesetSection
        eyebrow="What you might be missing"
        title="Coverage gaps"
        deck="Heuristic — severity is a recommendation, not a precise score."
      >
        <p
          style={{
            fontSize: 12,
            color: "var(--text-2)",
            lineHeight: 1.5,
            margin: "4px 0 12px",
          }}
        >
          Coverage looks complete for your active sectors.
        </p>
        <p
          style={{
            fontSize: 11,
            color: "var(--muted)",
            lineHeight: 1.5,
            margin: 0,
          }}
        >
          {CAVEAT_COPY}
        </p>
      </TypesetSection>
    );
  }

  return (
    <TypesetSection
      eyebrow="What you might be missing"
      title="Coverage gaps"
      count={`${items.length} flagged`}
      deck="Heuristic — severity is a recommendation, not a precise score."
    >
      <div>
        {items.map((g) => {
          const isHigh = g.severity === "high";
          return (
            <div
              key={g.id}
              className={`cov-item${isHigh ? " high-sev" : ""}`}
            >
              <div className="row">
                <span className="t">{g.title}</span>
                <span className="sev">{SEV_LABEL[g.severity]}</span>
              </div>
              <p
                className="desc"
                // Description is editor-curated in coverage_gaps. Allows
                // a small subset of inline tags (<i>) per the spec.
                dangerouslySetInnerHTML={{ __html: g.description }}
              />
              <a className="act" href={g.suggestedAction.href}>
                {g.suggestedAction.label} →
              </a>
            </div>
          );
        })}
      </div>
      <p
        style={{
          fontSize: 11,
          color: "var(--muted)",
          lineHeight: 1.5,
          margin: "8px 0 0",
        }}
      >
        {CAVEAT_COPY}
      </p>
    </TypesetSection>
  );
}
