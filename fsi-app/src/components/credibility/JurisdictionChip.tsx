"use client";

/**
 * JurisdictionChip, jurisdiction code with optional human label.
 *
 * Per Q9: jurisdiction is a primary signal on Regulations, Operations, and
 * the Map overlay. The chip composes with CredibilityBadge so a Regulations
 * card reads "T1 Binding Law · EU European Union" in one glance.
 *
 * Resolution order for the human label:
 *   1. Explicit `label` prop (caller knows the local display name)
 *   2. JURISDICTION_LABELS map (common codes)
 *   3. The platform helper `isoToDisplayLabel` from `@/lib/jurisdictions/iso`
 *      handles ISO 3166-1 alpha-2 + ISO 3166-2 + known free-text codes
 *
 * Stable contract: pass the raw code (e.g., "EU", "US-CA", "US-FED"). The
 * chip handles formatting. Calling code does NOT need to know about the
 * underlying ISO helper.
 */

import type { CSSProperties } from "react";
import { isoToDisplayLabel } from "@/lib/jurisdictions/iso";

export interface JurisdictionChipProps {
  /** Null renders nothing. */
  jurisdiction: string | null;
  /** Optional human label override. */
  label?: string;
  /** Whether to show the human label alongside the code. Default true. */
  showLabel?: boolean;
  /** Visual size. Default 'md'. */
  size?: "sm" | "md";
}

// Common codes operator-surfaced via sources.jurisdictions. Keeps the chip
// label resolution path cheap (no helper call) for the most frequent codes
// without expanding scope to a full ISO atlas. The helper at
// `@/lib/jurisdictions/iso` handles the long tail.
export const JURISDICTION_LABELS: Readonly<Record<string, string>> = {
  EU: "European Union",
  US: "United States",
  "US-FED": "US Federal",
  "US-CA": "California",
  "US-NY": "New York",
  "US-TX": "Texas",
  GB: "United Kingdom",
  UK: "United Kingdom",
  CA: "Canada",
  AU: "Australia",
  CN: "China",
  JP: "Japan",
  KR: "South Korea",
  SG: "Singapore",
  HK: "Hong Kong",
  IN: "India",
  BR: "Brazil",
  IMO: "International Maritime Organization",
  ICAO: "International Civil Aviation Organization",
  GLOBAL: "Global",
};

function resolveLabel(code: string, override?: string): string | null {
  if (override) return override;
  const direct = JURISDICTION_LABELS[code] ?? JURISDICTION_LABELS[code.toUpperCase()];
  if (direct) return direct;
  // Fall back to the platform helper. If it returns the same code unchanged,
  // we treat that as "no label available" and render the code alone.
  try {
    const resolved = isoToDisplayLabel(code);
    if (resolved && resolved.toUpperCase() !== code.toUpperCase()) {
      return resolved;
    }
  } catch {
    // helper threw on unrecognized input; fall through
  }
  return null;
}

export function JurisdictionChip({
  jurisdiction,
  label,
  showLabel = true,
  size = "md",
}: JurisdictionChipProps) {
  if (!jurisdiction || jurisdiction.trim().length === 0) return null;

  const code = jurisdiction.trim();
  const resolved = showLabel ? resolveLabel(code, label) : null;

  const codeStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    fontSize: size === "sm" ? 9 : 10,
    fontWeight: 800,
    letterSpacing: "0.06em",
    color: "var(--color-text-primary)",
    backgroundColor: "var(--color-surface-raised)",
    border: "1px solid var(--color-border-subtle)",
    padding: size === "sm" ? "1px 4px" : "2px 6px",
    borderRadius: 3,
    lineHeight: 1.2,
    fontVariantNumeric: "tabular-nums",
    textTransform: "uppercase",
  };

  const labelStyle: CSSProperties = {
    fontSize: size === "sm" ? 10 : 11,
    fontWeight: 500,
    color: "var(--color-text-secondary)",
    lineHeight: 1.2,
  };

  return (
    <span
      title={resolved ? `${code}, ${resolved}` : code}
      aria-label={resolved ? `Jurisdiction ${code}, ${resolved}` : `Jurisdiction ${code}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
      }}
    >
      <span style={codeStyle}>{code}</span>
      {resolved && <span style={labelStyle}>{resolved}</span>}
    </span>
  );
}
