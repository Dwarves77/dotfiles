"use client";

import { useEffect, useState } from "react";
import { stableDateLabel, relativeTimeLabel } from "./relative-time-format";

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
 *
 * The two formatters live in ./relative-time-format (JSX-free) so the overflow-hydration guard
 * can unit-test the V-07 invariant (initial-render label is now-independent) in the portable
 * `node --test` suite. Re-exported here so every existing import path is unchanged.
 */

export { stableDateLabel, relativeTimeLabel };

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
