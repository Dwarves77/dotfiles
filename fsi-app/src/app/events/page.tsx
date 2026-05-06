"use client";

/**
 * /events — static stub for Phase C.
 *
 * Visual list of upcoming industry events grouped by month. RSVP buttons
 * fire a "Coming soon" toast — the events backend lands in Phase D.
 *
 * Row pattern is loosely modelled on the community.html right-rail block
 * (date plate + title + meta), adapted for a vertical full-width list.
 *
 * Past-event treatment (audit fix): events whose computed UTC date is
 * before today render with muted color, a "PAST" badge, and an
 * "RSVP closed" pill instead of the active RSVP button. The today cutoff
 * is computed once on initial render to avoid hydration mismatch — the
 * static EVENTS list means the same date always resolves to the same
 * past/future split between server and client.
 */

import { useState } from "react";
import { Lock } from "lucide-react";
import { PageMasthead } from "@/components/shell/PageMasthead";
import { Toast } from "@/components/ui/Toast";

interface EventItem {
  id: string;
  day: number;
  month: string; // 3-letter uppercase, e.g. "APR"
  monthFull: string; // for section header, e.g. "April 2026"
  title: string;
  group: string;
  timeVenue: string;
  isPrivate?: boolean;
}

// Map the 3-letter month tokens used by EVENTS to 0-indexed month
// numbers for Date construction.
const MONTH_TOKEN_TO_INDEX: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

// Parse the year off the monthFull label (e.g. "April 2026" → 2026).
// Falls back to the current year if no 4-digit token is present.
function parseEventYear(monthFull: string): number {
  const m = monthFull.match(/\b(\d{4})\b/);
  if (m) return Number(m[1]);
  return new Date().getUTCFullYear();
}

// True when the event's calendar day is strictly before today (UTC).
// Time-of-day on the event itself is opaque to this static stub, so
// "is past" means the calendar date alone has already elapsed.
function isPastEvent(ev: EventItem, todayUtcMs: number): boolean {
  const monthIdx = MONTH_TOKEN_TO_INDEX[ev.month];
  if (monthIdx === undefined) return false;
  const year = parseEventYear(ev.monthFull);
  const eventUtcMs = Date.UTC(year, monthIdx, ev.day);
  return eventUtcMs < todayUtcMs;
}

const EVENTS: EventItem[] = [
  {
    id: "cbam-q1-office-hours",
    day: 17,
    month: "APR",
    monthFull: "April 2026",
    title: "CBAM Q1 reporting office hours",
    group: "EU Public Forum",
    timeVenue: "Thu 14:00 UTC",
  },
  {
    id: "fueleu-pooling-roundtable",
    day: 22,
    month: "APR",
    monthFull: "April 2026",
    title: "FuelEU pooling structures roundtable",
    group: "EU Compliance Council (private)",
    timeVenue: "Tue 10:00 UTC",
    isPrivate: true,
  },
  {
    id: "internal-carbon-ledger-workshop",
    day: 25,
    month: "APR",
    monthFull: "April 2026",
    title: "Workshop: building an internal carbon ledger",
    group: "SAF Working Group",
    timeVenue: "Cross-region · Fri 15:00 UTC",
  },
  {
    id: "frankfurt-meetup",
    day: 2,
    month: "MAY",
    monthFull: "May 2026",
    title: "Member meetup — Frankfurt",
    group: "EU Public Forum",
    timeVenue: "FRA airport hotel · 18:00 CEST",
  },
  {
    id: "icct-freight-decarb-panel",
    day: 14,
    month: "MAY",
    monthFull: "May 2026",
    title: "ICCT freight decarbonisation panel",
    group: "Global",
    timeVenue: "Virtual · 16:00 UTC",
  },
  {
    id: "carb-acf-qa",
    day: 21,
    month: "MAY",
    monthFull: "May 2026",
    title: "CARB ACF Q&A",
    group: "US Public Forum",
    timeVenue: "Wed 17:00 UTC",
  },
  {
    id: "uk-ets-phase-2-briefing",
    day: 4,
    month: "JUN",
    monthFull: "June 2026",
    title: "UK ETS Phase 2 briefing",
    group: "UK Public Forum",
    timeVenue: "Tue 11:00 UTC",
  },
  {
    id: "singapore-mpa-bunker-fuel",
    day: 12,
    month: "JUN",
    monthFull: "June 2026",
    title: "Singapore MPA bunker fuel session",
    group: "APAC",
    timeVenue: "Virtual · 09:00 UTC",
  },
];

function groupByMonth(events: EventItem[]): { label: string; items: EventItem[] }[] {
  const map = new Map<string, EventItem[]>();
  for (const ev of events) {
    const bucket = map.get(ev.monthFull);
    if (bucket) bucket.push(ev);
    else map.set(ev.monthFull, [ev]);
  }
  return Array.from(map.entries()).map(([label, items]) => ({ label, items }));
}

export default function EventsPage() {
  const [toastVisible, setToastVisible] = useState(false);

  const handleRsvp = () => {
    setToastVisible(true);
  };

  // Today's UTC midnight in ms. Computed once at render — the static
  // EVENTS array means server and client agree on the past/future split
  // for the rest of the day. (Crossing a UTC midnight without a refresh
  // would briefly mis-classify the day's events; acceptable for a stub.)
  const now = new Date();
  const todayUtcMs = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );

  const grouped = groupByMonth(EVENTS);

  return (
    <>
      <PageMasthead
        eyebrow="Industry calendar"
        title="Events"
        meta="Industry roundtables, member meetups, regulator office hours"
      />

      <div style={{ padding: "32px 36px 64px", maxWidth: 960 }}>
        {grouped.map((section) => (
          <section key={section.label} style={{ marginBottom: 40 }}>
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 14,
                fontWeight: 400,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--color-text-muted)",
                margin: "0 0 16px",
                paddingBottom: 8,
                borderBottom: "1px solid var(--border-sub)",
              }}
            >
              {section.label}
            </h2>

            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {section.items.map((ev) => {
                const past = isPastEvent(ev, todayUtcMs);
                return (
                  <li
                    key={ev.id}
                    aria-label={past ? `${ev.title} (past event)` : ev.title}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 24,
                      padding: "20px 0",
                      borderBottom: "1px solid var(--border-sub)",
                      opacity: past ? 0.55 : 1,
                    }}
                  >
                    {/* Date plate */}
                    <div
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: 36,
                        lineHeight: 1,
                        textAlign: "center",
                        width: 60,
                        flex: "0 0 60px",
                        color: past
                          ? "var(--color-text-muted)"
                          : "var(--text)",
                      }}
                    >
                      <div>{ev.day}</div>
                      <small
                        style={{
                          fontSize: 10,
                          letterSpacing: "0.14em",
                          color: "var(--color-text-muted)",
                        }}
                      >
                        {ev.month}
                      </small>
                    </div>

                    {/* Title + meta */}
                    <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          fontSize: 15,
                          fontWeight: 600,
                          color: past
                            ? "var(--color-text-muted)"
                            : "var(--text)",
                          marginBottom: 4,
                        }}
                      >
                        {ev.isPrivate && (
                          <Lock
                            size={13}
                            strokeWidth={2}
                            style={{
                              color: "var(--color-text-muted)",
                              flex: "0 0 auto",
                            }}
                            aria-label="Private event"
                          />
                        )}
                        <span>{ev.title}</span>
                        {past && (
                          <span
                            aria-label="Past event"
                            style={{
                              fontSize: 9,
                              fontWeight: 800,
                              letterSpacing: "0.14em",
                              textTransform: "uppercase",
                              padding: "2px 6px",
                              border: "1px solid var(--border-sub)",
                              color: "var(--color-text-muted)",
                              borderRadius: 2,
                              flex: "0 0 auto",
                            }}
                          >
                            PAST
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--color-text-muted)",
                          letterSpacing: "0.02em",
                        }}
                      >
                        {ev.group} · {ev.timeVenue}
                      </div>
                    </div>

                    {/* RSVP — disabled / replaced for past events */}
                    {past ? (
                      <span
                        aria-label="RSVP closed"
                        style={{
                          flex: "0 0 auto",
                          fontFamily: "inherit",
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: "0.14em",
                          textTransform: "uppercase",
                          padding: "8px 16px",
                          border: "1px dashed var(--border-sub)",
                          background: "transparent",
                          color: "var(--color-text-muted)",
                          borderRadius: 2,
                        }}
                      >
                        RSVP closed
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={handleRsvp}
                        style={{
                          flex: "0 0 auto",
                          fontFamily: "inherit",
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: "0.14em",
                          textTransform: "uppercase",
                          padding: "8px 16px",
                          border: "1px solid var(--border-sub)",
                          background: "transparent",
                          color: "var(--text)",
                          cursor: "pointer",
                          borderRadius: 2,
                          transition:
                            "background 200ms, color 200ms, border-color 200ms",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "var(--text)";
                          e.currentTarget.style.color = "var(--bg)";
                          e.currentTarget.style.borderColor = "var(--text)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                          e.currentTarget.style.color = "var(--text)";
                          e.currentTarget.style.borderColor =
                            "var(--border-sub)";
                        }}
                      >
                        RSVP
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <Toast
        message="Coming soon — events backend launches in Phase D"
        visible={toastVisible}
        onDismiss={() => setToastVisible(false)}
      />
    </>
  );
}
