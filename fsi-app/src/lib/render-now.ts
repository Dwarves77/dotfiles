/**
 * renderNowIso — THE one clock a rendered page is allowed to read.
 *
 * WHY THIS EXISTS (lane HYDRATION-59, 2026-09-07). A `"use client"` component that calls
 * `new Date()` / `Date.now()` DURING RENDER is evaluated twice with two different clocks: once
 * on the server while producing the SSR HTML, and again in the browser during hydration. Any
 * text derived from that value (a date label, an ISO week number, a "N days" countdown, a
 * "week of ..." caption) is therefore a hydration hazard on TWO independent axes:
 *
 *   1. TIMEZONE — `Date#getFullYear/getMonth/getDate` and an unpinned `toLocaleDateString`
 *      read the HOST's zone. The server runs UTC; the browser runs the viewer's zone. For any
 *      viewer whose local calendar date differs from UTC's (every viewer west of Greenwich for
 *      part of each day, every viewer east of it for another part) the two renders produce
 *      different text. [CONFIRMED this lane: `/` rendered "week of Sep 7" server-side and
 *      "week of Sep 8" in a Pacific/Kiritimati browser, producing React error #418 —
 *      `DashboardBrief`'s `weekOfLabel`.]
 *   2. THE INSTANT ITSELF — even with locale and timezone pinned, SSR happens at T and
 *      hydration at T+Δ. Any value bucketed by day/week/relative-time can straddle a boundary
 *      inside Δ, and Δ is unbounded when the HTML is served from a cache.
 *
 * Pinning the locale (`format.ts`'s FIXED_LOCALE) and the timezone (`format-fixed-date.ts`'s
 * UTC helpers) closes axis 1 only. This module closes axis 2, which is the one that cannot be
 * closed inside the client component at all: the SERVER decides the instant, once, and passes
 * it down as a plain serialisable prop. The client component then renders from a value it was
 * GIVEN, never one it read from its own host — so both renders are, by construction, the same
 * string.
 *
 * `cache()` is React's per-request memo (the same primitive `src/lib/detail/load-detail.ts`
 * uses): every server component in ONE request that asks for the instant gets the SAME instant,
 * so two mastheads on one page can never disagree either.
 *
 * THE RULE THIS ENCODES, enforced by `render-clock.npmtest.mjs`: a `"use client"` module MUST
 * NOT evaluate `new Date()` / `Date.now()` in render. Inside an event handler or an effect it
 * is fine (that code never runs on the server). In render, take `nowIso` as a prop.
 */
import { cache } from "react";

/** The one instant for this server render. Serialise it into client props as `nowIso`. */
export const renderNowIso = cache((): string => new Date().toISOString());

/** Parse a `nowIso` prop back to a Date. Falls back to the epoch-free "now" only when the prop
 *  is absent (a caller that has not been threaded yet) — never silently, the caller's own prop
 *  type keeps it required on every threaded surface. */
export function nowFrom(nowIso: string | undefined): Date {
  return nowIso ? new Date(nowIso) : new Date();
}
