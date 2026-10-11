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
