// relative-time-format — the JSX-free formatters behind RelativeTime (V-07, 2026-07-11).
//
// Extracted from RelativeTime.tsx so the hydration invariant these encode is mechanically
// testable in the portable `node --test` discipline suite (Node type-stripping imports a .ts
// with no JSX; it cannot import the .tsx component). RelativeTime.tsx re-exports both, so every
// existing import path is unchanged.
//
// The V-07 invariant (React #418/#423 fix): the label used for the SERVER render AND the FIRST
// client render must be deterministic and independent of `Date.now()`, so the two renders agree
// byte-for-byte and there is no hydration mismatch. `stableDateLabel` is that label. The live
// relative form (`relativeTimeLabel`, which DOES read `Date.now()`) is swapped in only AFTER
// hydration, in an effect. The overflow-hydration guard's hydration leg asserts exactly this: the
// initial-render formatter is now-independent (green), and the pre-fix now-dependent formatter is
// not (red).

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
