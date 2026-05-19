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

export interface RecencyChipProps {
  /** Null renders nothing. */
  timestamp: string | Date | null;
  /** Visual size. Default 'sm' since recency is usually a secondary signal. */
  size?: "sm" | "md";
}

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

function formatRelative(ts: Date): string {
  const diff = Date.now() - ts.getTime();

  if (diff < 0) {
    // future timestamp, show absolute upcoming distance
    const abs = Math.abs(diff);
    if (abs < HOUR) return `in ${Math.max(1, Math.round(abs / MIN))} min`;
    if (abs < DAY) return `in ${Math.round(abs / HOUR)} hr`;
    if (abs < WEEK) return `in ${Math.round(abs / DAY)} days`;
    if (abs < MONTH) return `in ${Math.round(abs / WEEK)} weeks`;
    if (abs < YEAR) return `in ${Math.round(abs / MONTH)} months`;
    return `in ${Math.round(abs / YEAR)} years`;
  }

  if (diff < MIN) return "just now";
  if (diff < HOUR) {
    const m = Math.max(1, Math.round(diff / MIN));
    return `${m} min ago`;
  }
  if (diff < DAY) {
    const h = Math.round(diff / HOUR);
    return `${h} hr ago`;
  }
  if (diff < WEEK) {
    const d = Math.round(diff / DAY);
    return `${d} day${d === 1 ? "" : "s"} ago`;
  }
  if (diff < MONTH) {
    const w = Math.round(diff / WEEK);
    return `${w} week${w === 1 ? "" : "s"} ago`;
  }
  if (diff < YEAR) {
    const mo = Math.round(diff / MONTH);
    return `${mo} month${mo === 1 ? "" : "s"} ago`;
  }
  const y = Math.round(diff / YEAR);
  return `${y} year${y === 1 ? "" : "s"} ago`;
}

function toDate(input: string | Date): Date | null {
  if (input instanceof Date) {
    return isNaN(input.getTime()) ? null : input;
  }
  const d = new Date(input);
  return isNaN(d.getTime()) ? null : d;
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
