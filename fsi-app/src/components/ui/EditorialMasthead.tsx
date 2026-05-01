"use client";

/**
 * EditorialMasthead — auto-eyebrow wrapper around PageMasthead.
 *
 * Computes a Vol IV editorial eyebrow line of the form:
 *   "Vol IV · No. {ISO week} · {Day name}"
 *
 * Vol is hard-coded to "IV" per the 2026-04 design handoff.
 * Day name is rendered via Intl.DateTimeFormat in the user's locale.
 * ISO week number follows ISO 8601 (Monday-start, week 1 contains the
 * year's first Thursday).
 *
 * Pass `eyebrow` to override the auto-generated string.
 *
 * Matches design_handoff_2026-04/preview/dashboard-v3.html `.masthead` block.
 * The 3px navy→red gradient bar at the very top of the page is shell chrome
 * applied by AppShell — NOT reimplemented here. PageMasthead's own padding
 * and border-bottom stay intact via composition.
 */

import type { ReactNode } from "react";
import { PageMasthead } from "@/components/shell/PageMasthead";

interface EditorialMastheadProps {
  /** Override the auto-computed "Vol IV · No. {weekNo} · {Day}" eyebrow. */
  eyebrow?: string;
  /** Big Anton headline, uppercase. */
  title: string;
  /** Muted meta line below the title (date, counts, etc). */
  meta?: ReactNode;
  /** Content rendered inside the masthead body, beneath the title block. */
  belowSlot?: ReactNode;
}

/** ISO 8601 week number (Mon-start, week 1 contains first Thursday). */
function isoWeekNumber(date: Date): number {
  // Copy date so we don't mutate caller's Date.
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Set to nearest Thursday: current date + 4 - current day number
  // (ISO day of week: Mon=1 ... Sun=7).
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  // Get first day of year.
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  // Calculate full weeks to nearest Thursday.
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return weekNo;
}

function defaultEyebrow(now: Date = new Date()): string {
  const weekNo = isoWeekNumber(now);
  const dayName = new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(now);
  return `VOL IV · NO. ${weekNo} · ${dayName.toUpperCase()}`;
}

export function EditorialMasthead({
  eyebrow,
  title,
  meta,
  belowSlot,
}: EditorialMastheadProps) {
  const resolvedEyebrow = eyebrow ?? defaultEyebrow();
  return (
    <PageMasthead
      eyebrow={resolvedEyebrow}
      title={title}
      meta={meta}
      belowSlot={belowSlot}
    />
  );
}
