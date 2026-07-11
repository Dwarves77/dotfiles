"use client";

import { useEffect, useState } from "react";

/**
 * RelativeTime — hydration-safe "N min ago" label (fixes React #418, V-07 2026-07-11).
 *
 * A relative-time string computed from `Date.now()` during render differs between the server
 * (SSR) and the client (hydration) whenever the two land in different minutes — an intermittent
 * hydration mismatch. This component renders a STABLE, deterministic absolute label on the server
 * AND on the first client render (derived purely from `iso`, formatted in UTC so it never depends
 * on `Date.now()` or the local timezone), then swaps to the live relative form in an effect that
 * runs only AFTER hydration. Server HTML === first client render, so there is no mismatch.
 *
 * This is the fix, not `suppressHydrationWarning` — the two renders genuinely agree.
 */

const STABLE_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** Deterministic absolute label from an ISO string (UTC; identical on server and client). */
export function stableDateLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return STABLE_FMT.format(d);
}

/** Live "N min / hr / day / mo ago" label. Uses Date.now(); client-only (post-mount). */
export function relativeTimeLabel(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diffMs = Math.max(0, Date.now() - t);
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return `${Math.floor(days / 30)} mo ago`;
}

export function RelativeTime({ iso }: { iso: string }) {
  // Initial state = stable absolute label (matches SSR). Effect swaps to relative post-hydration.
  const [label, setLabel] = useState(() => stableDateLabel(iso));
  useEffect(() => {
    const tick = () => setLabel(relativeTimeLabel(iso));
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, [iso]);
  return <>{label}</>;
}
