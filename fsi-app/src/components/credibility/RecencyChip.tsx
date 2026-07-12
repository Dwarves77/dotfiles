"use client";

/**
 * RecencyChip, relative-time display for credibility signals.
 *
 * Per Q9: recency is a primary signal on Research (when was this published),
 * Market Intel (how fresh is this signal), and is a secondary signal on
 * provenance panels. The chip is intentionally compact so it composes with
 * tier and citation count in dense layouts.
 *
 * Implementation note: the project does not ship date-fns. The formatter
 * below is intentionally simple (months / weeks / days / hours / minutes),
 * since credibility recency is a coarse "how stale" signal not a precise
 * timestamp. Precise timestamps belong on the source's own detail surface.
 */

import type { CSSProperties } from "react";
import { formatRelative, toDate } from "@/lib/relative-time";

export interface RecencyChipProps {
  /** Null renders nothing. */
  timestamp: string | Date | null;
  /** Visual size. Default 'sm' since recency is usually a secondary signal. */
  size?: "sm" | "md";
}

export function RecencyChip({ timestamp, size = "sm" }: RecencyChipProps) {
  if (timestamp === null || timestamp === undefined) return null;
  const d = toDate(timestamp);
  if (!d) return null;

  const label = formatRelative(d);
  const absolute = d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const style: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    fontSize: size === "sm" ? 10 : 11,
    fontWeight: 600,
    color: "var(--color-text-muted)",
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  };

  return (
    <time dateTime={d.toISOString()} title={absolute} style={style}>
      {label}
    </time>
  );
}
