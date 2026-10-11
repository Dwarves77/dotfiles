export type ScrapeCadence = "off" | "weekly" | "monthly";

export interface ScrapeSchedule {
  cadence: ScrapeCadence;
  /** 'YYYY-MM-DD' anchor (first run + recurrence phase); null = unset (never runs). */
  startDate: string | null;
}

const DAY_MS = 86_400_000;

/** Parse a 'YYYY-MM-DD' (date-only) to a UTC-midnight Date with no timezone drift. */
function parseYmdUtc(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** UTC-midnight of the given instant. */
export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Is `now` on a scheduled scrape DAY for this schedule? Pure — the worker calls this each hourly tick
 * ("should I run now?"). false when: off / no anchor / before the anchor / not an interval boundary.
 * monthly clamps a short month (anchor day 31 -> the month's last day).
 */
export function scrapeWindowOpen(s: ScrapeSchedule, now: Date): boolean {
  if (s.cadence === "off" || !s.startDate) return false;
  const start = parseYmdUtc(s.startDate);
  if (!start) return false;
  const today = startOfUtcDay(now);
  if (today.getTime() < start.getTime()) return false; // "paused until started"
  if (s.cadence === "weekly") {
    const days = Math.round((today.getTime() - start.getTime()) / DAY_MS);
    return days % 7 === 0;
  }
  // monthly: same day-of-month as the anchor, clamped to the current month's length.
  const anchorDom = start.getUTCDate();
  const lastDom = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)).getUTCDate();
  return today.getUTCDate() === Math.min(anchorDom, lastDom);
}

/**
 * The next scheduled scrape date at/after `now` (for the admin "next scrape" display). null when
 * off/unset. Bounded scan (<= ~400 days) so a malformed schedule can never loop unbounded.
 */
export function nextScrapeDate(s: ScrapeSchedule, now: Date): Date | null {
  if (s.cadence === "off" || !s.startDate) return null;
  const start = parseYmdUtc(s.startDate);
  if (!start) return null;
  let cand = startOfUtcDay(now).getTime() < start.getTime() ? new Date(start) : startOfUtcDay(now);
  for (let i = 0; i < 400; i++) {
    if (scrapeWindowOpen(s, cand)) return cand;
    cand = new Date(cand.getTime() + DAY_MS);
  }
  return null;
}
