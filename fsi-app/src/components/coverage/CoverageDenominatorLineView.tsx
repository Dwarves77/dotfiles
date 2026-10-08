/**
 * CoverageDenominatorLineView: the render-only half of a surface's coverage denominator line (lane COV-1,
 * 2026-10-08; spec 00 section 4: "denominators everywhere, beside the number and not in a footnote").
 *
 * One quiet line at the foot of each of the four intelligence list pages: how many of the instruments the
 * discovery census catalogued for THIS surface are dual-verified, the separate count of grounded briefs, and a
 * link to the surface's cell on the generated Coverage page. It is the same text the Coverage page's cell and the
 * portfolio-add line use (formatDenominatorLine in coverage-matrix.mjs), so the three never say different things.
 *
 * The three states it can be in are the coverage-state vocabulary, not three ad hoc strings:
 *   - read: the line and its link;
 *   - nothing catalogued for this surface: the "not covered" state, with Request coverage;
 *   - the read failed: the "error" state, with a Retry that reloads this page.
 *
 * VIEW/FETCH SPLIT, the idiom ThemeStrip and the spec-09 panels use: this file imports no server module, so a
 * smoke spec can mount it with fixture data. The fetch half is CoverageDenominatorLine.tsx.
 */

import Link from "next/link";
import { CoverageState } from "@/components/ui/CoverageState";
import { formatDenominatorLine } from "@/lib/coverage/coverage-matrix.mjs";

export interface DenominatorModel {
  surface: string;
  label: string;
  numerator: number;
  denominator: number;
  verifiedBriefs: number | null;
  href: string;
}

export function CoverageDenominatorLineView({
  denominator,
  error,
  surfacePath,
}: {
  denominator: DenominatorModel | null;
  error: string | null;
  /** This page's own path, the target of the error state's Retry. */
  surfacePath: string;
}) {
  // The ThemeStrip's frame, for the reason its own header gives (lane P3): this is a flex-column item of the list shell
  // with auto side margins, which is NOT stretched, so width 100% + minWidth 0 + border-box makes it take the column.
  const frame = { maxWidth: 1180, width: "100%", minWidth: 0, boxSizing: "border-box", margin: "0 auto", padding: "14px 36px 0" } as const;

  if (error || !denominator) {
    return (
      <div data-guard-container="coverage-denominator" style={frame}>
        <CoverageState state="error" variant="inline" subject="The coverage count" retryHref={surfacePath} />
      </div>
    );
  }

  if (denominator.denominator === 0) {
    return (
      <div data-guard-container="coverage-denominator" style={frame}>
        <CoverageState
          state="not_covered"
          variant="inline"
          subject={`The ${denominator.label} catalogue`}
          reason="No instrument has been catalogued for this surface yet."
          requestRef={denominator.href}
        />
      </div>
    );
  }

  return (
    <div data-guard-container="coverage-denominator" style={frame}>
      <p
        data-part="coverage-denominator"
        style={{ margin: 0, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0 12px", fontSize: "var(--fs-11)", color: "var(--ink-2)" }}
      >
        <span style={{ overflowWrap: "anywhere" }}>{formatDenominatorLine(denominator)}</span>
        <Link
          href={denominator.href}
          style={{ display: "inline-flex", alignItems: "center", minHeight: 28, padding: "8px 0", fontWeight: 600, color: "var(--ink)" }}
        >
          See coverage
        </Link>
      </p>
    </div>
  );
}
