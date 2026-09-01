/**
 * ChangedSinceStrip — Dashboard surface for the change-detection chain (Task 3, lane CD, 2026-09-01).
 *
 * Server-rendered (no "use client"): fetches via a fresh, request-scoped Supabase client
 * (getChangedSinceData -> a plain anon-key createClient() call per render, not a shared/service-role
 * singleton — RLS is exercised on every render exactly as migration 279 defines it) and renders directly,
 * no client-side fetch or hydration boundary.
 *
 * TWO signals, kept visually distinct because they come from two different pipelines running on two
 * different cadences (never conflated into one undifferentiated "changed" list):
 *   - "Source changed" — a source this item is grounded on changed content (check-sources -> reconcile ->
 *     intelligence_changes). Dated by `detectedAt`, the reconcile pass's own timestamp.
 *   - "Theme changed" — this item's cluster membership moved on the last flywheel pass
 *     (connection_theme_runs.theme_delta). Dated by `runFinishedAt`, the analyze-corpus run's own
 *     timestamp — which can be considerably older than "now" since that pipeline runs on its own cadence,
 *     not continuously.
 *
 * PRECISION-HONEST DATES: every stamp reads "as of <relative-time-from-the-real-source-timestamp>", never
 * a bare "recently" and never implied to be live/real-time — matching the WhatChanged component's own
 * binding rule for the sibling change-log surface.
 */

import Link from "next/link";
import { getChangedSinceData, type SourceChangedRow, type ThemeChangedRow } from "@/lib/dashboard/changed-since";
import { itemDetailHref } from "@/lib/item-links";
import { formatRelative, toDate } from "@/lib/relative-time";

const WINDOW_DAYS = 14;
const MAX_ROWS = 6;

function relativeStamp(iso: string | null): string {
  const d = toDate(iso);
  return d ? formatRelative(d) : "date unknown";
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: "var(--reg-band-immediate, #b3261e)",
  significant: "var(--reg-band-action, #9a5b00)",
  minor: "var(--reg-band-monitor, #6b6b6b)",
  administrative: "var(--reg-band-awareness, #6b6b6b)",
};

function SourceChangedItem({ row }: { row: SourceChangedRow }) {
  const href = itemDetailHref({ id: row.itemId, type: row.itemType, domain: row.domain });
  return (
    <li style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 0", borderBottom: "1px solid var(--color-border, #e5e5e5)" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span
          aria-hidden="true"
          style={{ width: 6, height: 6, borderRadius: "50%", background: SEVERITY_COLOR[row.changeSeverity] ?? "var(--reg-band-awareness, #6b6b6b)", flexShrink: 0 }}
        />
        <Link href={href} style={{ fontWeight: 600, textDecoration: "none", color: "var(--color-text-primary)" }}>
          {row.title}
        </Link>
      </div>
      <span style={{ fontSize: 12, color: "var(--color-text-secondary, #666)" }}>
        Source changed · as of {relativeStamp(row.detectedAt)}
        {row.changeSummary ? ` — ${row.changeSummary}` : ""}
      </span>
    </li>
  );
}

const THEME_REASON_LABEL: Record<ThemeChangedRow["reason"], string> = {
  added: "joined a connected theme",
  removed: "left a connected theme",
  appeared: "part of a newly identified theme",
};

function ThemeChangedItem({ row }: { row: ThemeChangedRow }) {
  const href = itemDetailHref({ id: row.itemId, type: row.itemType, domain: row.domain });
  return (
    <li style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 0", borderBottom: "1px solid var(--color-border, #e5e5e5)" }}>
      <Link href={href} style={{ fontWeight: 600, textDecoration: "none", color: "var(--color-text-primary)" }}>
        {row.title}
      </Link>
      <span style={{ fontSize: 12, color: "var(--color-text-secondary, #666)" }}>
        {THEME_REASON_LABEL[row.reason]} · as of last theme pass ({relativeStamp(row.runFinishedAt)})
      </span>
    </li>
  );
}

export async function ChangedSinceStrip() {
  const { sourceChanged, themeChanged, windowDays } = await getChangedSinceData(WINDOW_DAYS);

  if (sourceChanged.length === 0 && themeChanged.length === 0) {
    return (
      <div style={{ padding: "12px 0", fontSize: 13, color: "var(--color-text-secondary, #666)" }}>
        No source or theme changes detected in the last {windowDays} days.
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: sourceChanged.length && themeChanged.length ? "1fr 1fr" : "1fr", gap: 24 }}>
      {sourceChanged.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--color-text-secondary, #666)", marginBottom: 4 }}>
            Source changed (last {windowDays} days)
          </div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {sourceChanged.slice(0, MAX_ROWS).map((row) => (
              <SourceChangedItem key={row.itemId} row={row} />
            ))}
          </ul>
          {sourceChanged.length > MAX_ROWS && (
            <div style={{ fontSize: 12, color: "var(--color-text-secondary, #666)", marginTop: 4 }}>
              +{sourceChanged.length - MAX_ROWS} more
            </div>
          )}
        </div>
      )}
      {themeChanged.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--color-text-secondary, #666)", marginBottom: 4 }}>
            Theme membership changed (last pass)
          </div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {themeChanged.slice(0, MAX_ROWS).map((row) => (
              <ThemeChangedItem key={`${row.itemId}-${row.themeId}-${row.reason}`} row={row} />
            ))}
          </ul>
          {themeChanged.length > MAX_ROWS && (
            <div style={{ fontSize: 12, color: "var(--color-text-secondary, #666)", marginTop: 4 }}>
              +{themeChanged.length - MAX_ROWS} more
            </div>
          )}
        </div>
      )}
    </div>
  );
}
