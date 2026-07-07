// src/lib/agent/timeline-harvest.mjs
//
// §14 TIMELINE HARVEST (Phase-3b, DATE-AND-DEDUP-AUDIT DD-01/DD-02). The corpus audit found the
// single most decision-critical field in the product broken two ways: ~85% of verified reg briefs
// carried NO structured timeline at all (the dates lived only in prose — often a fully-written
// "Confirmed Regulatory Timeline" §14 the model DID assemble), and of the ~16 stored timelines all
// but one were wrong or missing their nearest deadline (PPWR stored Aug-1 where the enacted text
// says 12 August 2026). Root cause confirmed in code: item_timelines had NO production writer —
// only a one-time seed migration ever filled it. This module is the writer's PURE half.
//
// EDIT-THE-SOURCE (ICM discipline): the extraction step harvests §14 into item_timelines on every
// future generation (canonical-pipeline sectionBrief), and the backfill script re-harvests the
// stored corpus — one parser, both directions (scripts/backfill-item-timelines.mjs).
//
// PRECISION HONESTY (the PPWR-class defense): item_timelines.milestone_date is a strict DATE, but
// §14 prose dates carry many precisions ("12 August 2026", "Q3 2026", "2027", ranges). Forcing a
// non-day-precision token into a bare date FABRICATES a day — exactly the Aug-12→Aug-1 defect.
// Rule: a DAY-precise token maps to its exact date and the label stays clean; ANY other precision
// (month / quarter / half / year / range) keeps the ORIGINAL token IN the label ("Q3 2026 — …")
// and milestone_date carries the period START purely for sort order. An unparseable date token is
// SKIPPED AND REPORTED (never silently dropped — the no-silent-truncation rule).
//
// PURE — no I/O. Input is TimelineEntry[] from extractRegulationSections (§14's existing parser —
// reuse-before-construction; that parser was display-only and its output was never persisted).

const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const pad = (n) => String(n).padStart(2, "0");
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const validDay = (y, m, d) => {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

/**
 * Normalize one date-ish token to an ISO date + its precision.
 * Returns { iso, precision } or null when unparseable.
 * precision: "day" | "month" | "quarter" | "half" | "year"
 * Ranges ("X to Y", "X – Y") normalize to their FIRST endpoint with precision "range".
 * @param {string} token
 */
export function toIsoDate(token) {
  if (!token || typeof token !== "string") return null;
  let t = token.trim();

  // Range: normalize the first endpoint; the caller keeps the full token in the label.
  const rangeParts = t.split(/\s+(?:to|–|—|through)\s+/i);
  if (rangeParts.length > 1) {
    const first = toIsoDate(rangeParts[0]);
    return first ? { iso: first.iso, precision: "range" } : null;
  }

  t = t.replace(/(\d+)(st|nd|rd|th)\b/gi, "$1"); // strip ordinals: 12th → 12
  t = t.replace(/[,.]/g, " ").replace(/\s+/g, " ").trim();

  // Qualifier prefixes common in regulatory prose ("By 2030", "From 12 August 2026", "End of 2027",
  // "Until Q3 2026", "Effective 1 January 2025"): recurse on the remainder, DEMOTING day-precision to
  // "qualified" so the original token stays in the label (honest — "By 2030" is not a date).
  const qual = /^(?:by|from|until|before|after|effective|starting|beginning|end of|deadline)\s+(.+)$/i.exec(t);
  if (qual) {
    const inner = toIsoDate(qual[1]);
    return inner ? { iso: inner.iso, precision: inner.precision === "day" ? "qualified" : inner.precision } : null;
  }
  // Sub-year season/segment tokens: "mid-2026", "early 2027", "late 2028". milestone_date is
  // sort-order only for these (the original token rides the label); period anchors: early=Jan,
  // mid=Jun, late=Oct.
  const seg = /^(early|mid|late)[\s-]+(\d{4})$/i.exec(t);
  if (seg) {
    const y = Number(seg[2]);
    if (y >= 1990 && y <= 2100) {
      const mo = { early: 1, mid: 6, late: 10 }[seg[1].toLowerCase()];
      return { iso: iso(y, mo, 1), precision: "segment" };
    }
    return null;
  }

  // ISO forms: 2026-08-12 / 2026-08 / 2026
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return validDay(y, mo, d) ? { iso: iso(y, mo, d), precision: "day" } : null;
  }
  m = /^(\d{4})-(\d{1,2})$/.exec(t);
  if (m) {
    const [y, mo] = [Number(m[1]), Number(m[2])];
    return mo >= 1 && mo <= 12 ? { iso: iso(y, mo, 1), precision: "month" } : null;
  }

  // Quarter / half: Q3 2026, H2 2027
  m = /^q([1-4])\s+(\d{4})$/i.exec(t);
  if (m) return { iso: iso(Number(m[2]), (Number(m[1]) - 1) * 3 + 1, 1), precision: "quarter" };
  m = /^h([12])\s+(\d{4})$/i.exec(t);
  if (m) return { iso: iso(Number(m[2]), m[1] === "1" ? 1 : 7, 1), precision: "half" };

  // Day month year: "12 August 2026" / "12 Aug 2026"
  m = /^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/i.exec(t);
  if (m && MONTHS[m[2].toLowerCase()]) {
    const [d, mo, y] = [Number(m[1]), MONTHS[m[2].toLowerCase()], Number(m[3])];
    return validDay(y, mo, d) ? { iso: iso(y, mo, d), precision: "day" } : null;
  }

  // Month day year: "August 12 2026" (comma already stripped)
  m = /^([a-z]+)\s+(\d{1,2})\s+(\d{4})$/i.exec(t);
  if (m && MONTHS[m[1].toLowerCase()]) {
    const [mo, d, y] = [MONTHS[m[1].toLowerCase()], Number(m[2]), Number(m[3])];
    return validDay(y, mo, d) ? { iso: iso(y, mo, d), precision: "day" } : null;
  }

  // Month year: "August 2026" / "Aug 2026"
  m = /^([a-z]+)\s+(\d{4})$/i.exec(t);
  if (m && MONTHS[m[1].toLowerCase()]) return { iso: iso(Number(m[2]), MONTHS[m[1].toLowerCase()], 1), precision: "month" };

  // Bare year: "2026" (guard the plausible-regulation window; a bare "12" or "20260" is not a year)
  m = /^(\d{4})$/.exec(t);
  if (m) {
    const y = Number(m[1]);
    return y >= 1990 && y <= 2100 ? { iso: iso(y, 1, 1), precision: "year" } : null;
  }

  return null;
}

/**
 * Build item_timelines rows from §14 TimelineEntry[] ({date,label,source}).
 * - day-precision: milestone_date exact, label clean (source appended in parens when present).
 * - any other precision (incl. ranges): the ORIGINAL date token is kept IN the label
 *   ("Q3 2026 — …"); milestone_date is the period start (sort order only) — never a fabricated day.
 * - unparseable tokens are returned in `skipped` (reported, never silent).
 * - rows sorted chronologically (stable on tie), deduped on (milestone_date,label).
 * @param {Array<{date:string,label:string,source:(string|null)}>} entries
 * @param {string} todayIso  e.g. "2026-07-07" — is_completed = milestone_date < today
 */
export function buildTimelineRows(entries, todayIso) {
  const skipped = [];
  const parsed = [];
  for (const e of entries || []) {
    if (!e || !e.label || !e.label.trim()) { skipped.push({ date: e?.date ?? "", label: e?.label ?? "", reason: "empty label" }); continue; }
    const norm = toIsoDate(e.date);
    if (!norm) { skipped.push({ date: e.date, label: e.label, reason: "unparseable date token" }); continue; }
    const baseLabel = e.source ? `${e.label.trim()} (${e.source.trim()})` : e.label.trim();
    const label = norm.precision === "day" ? baseLabel : `${e.date.trim()} — ${baseLabel}`;
    parsed.push({ milestone_date: norm.iso, label: label.slice(0, 500), precision: norm.precision });
  }
  parsed.sort((a, b) => (a.milestone_date < b.milestone_date ? -1 : a.milestone_date > b.milestone_date ? 1 : 0));
  const seen = new Set();
  const rows = [];
  for (const p of parsed) {
    const key = `${p.milestone_date}|${p.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      milestone_date: p.milestone_date,
      label: p.label,
      is_completed: p.milestone_date < todayIso,
      sort_order: rows.length,
    });
  }
  return { rows, skipped };
}
