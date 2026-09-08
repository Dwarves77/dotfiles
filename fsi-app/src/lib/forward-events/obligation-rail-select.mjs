// obligation-rail-select.mjs — the pure window/cap selection behind the Regulations rail card
// "OBLIGATIONS · NEXT 30 DAYS" (artboard 02/id="p2", the card the artboard draws BELOW the Filters
// card and ABOVE Legend).
//
// WHY A SEPARATE PURE MODULE. The card itself (ListSurfaceRailCards.tsx, ObligationsRailCard) is a
// client component whose only I/O is a fetch of the EXISTING bounded read GET
// /api/obligations/upcoming (src/app/api/obligations/upcoming/route.ts -> read-upcoming.mjs's
// fetchUpcomingObligations, request-scoped client, RLS-gated, jurisdiction-defaulted). No new
// Supabase read is introduced by that card. What IS new is the artboard's own two constraints on
// top of that read: a 30-DAY WINDOW ("next 30 days" is in the card's own title) and the artboard's
// ROW COUNT (four rows drawn). Both are pure functions of the fetched array plus "now", so they
// live here where `node --test` can prove them without a browser, a bundle, or a database.
//
// PLAIN ESM, NO `@/` ALIAS — the same portability constraint read-upcoming.mjs and
// forward-event-format.mjs state for themselves, for the same reason: importable by a plain
// `node --test` proof with zero tsconfig/Next resolution, and by a client component through the
// normal bundler path.

/** The window the artboard's own card title states: "Obligations · next 30 days". */
export const OBLIGATION_RAIL_WINDOW_DAYS = 30;

/** Rows the artboard draws in this card (four). The brief's "at most the artboard's row count". */
export const OBLIGATION_RAIL_ROW_CAP = 4;

const MS_PER_DAY = 86400000;

/**
 * Pure: parse a 'YYYY-MM-DD' Postgres date column to a UTC-midnight epoch, without ever letting the
 * viewer's timezone roll it a calendar day (the same hazard forward-event-format.mjs's own header
 * documents and avoids by parsing the string parts directly).
 * @param {unknown} value
 * @returns {number | null} epoch ms at UTC midnight, or null when unparseable
 */
export function utcDayStart(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ""));
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Pure: whole days from `from` to the event date, both normalised to UTC midnight. Negative for a
 * date already passed.
 * @param {unknown} eventDate 'YYYY-MM-DD'
 * @param {Date} from
 * @returns {number | null} null when the date is unparseable
 */
export function daysFrom(eventDate, from) {
  const target = utcDayStart(eventDate);
  if (target === null) return null;
  const base = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  return Math.round((target - base) / MS_PER_DAY);
}

/**
 * Pure: the rows the rail card renders — every fetched event whose date falls inside [today,
 * today + 30 days], soonest first, capped at the artboard's four rows. Events with no parseable
 * date are dropped rather than rendered undated (the card's whole claim is "what is due, when");
 * when that leaves nothing, the card renders the Absence convention, which is the caller's job.
 *
 * @param {Array<{event_date?: unknown}>|null|undefined} events as returned by GET /api/obligations/upcoming
 * @param {Date} [now]
 * @returns {Array<object>} the same event objects, filtered, sorted and capped
 */
export function selectObligationRailRows(events, now = new Date()) {
  if (!Array.isArray(events)) return [];
  return events
    .map((ev) => ({ ev, days: ev && typeof ev === "object" ? daysFrom(ev.event_date, now) : null }))
    .filter((e) => e.days !== null && e.days >= 0 && e.days <= OBLIGATION_RAIL_WINDOW_DAYS)
    .sort((a, b) => a.days - b.days)
    .slice(0, OBLIGATION_RAIL_ROW_CAP)
    .map((e) => e.ev);
}
