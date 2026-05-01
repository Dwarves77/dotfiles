"use client";

/**
 * /events — static stub for Phase C.
 *
 * Visual list of upcoming industry events grouped by month. RSVP buttons
 * fire a "Coming soon" toast — the events backend lands in Phase D.
 *
 * Row pattern is loosely modelled on the community.html right-rail block
 * (date plate + title + meta), adapted for a vertical full-width list.
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
              {section.items.map((ev) => (
                <li
                  key={ev.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 24,
                    padding: "20px 0",
                    borderBottom: "1px solid var(--border-sub)",
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
                        color: "var(--text)",
                        marginBottom: 4,
                      }}
                    >
                      {ev.isPrivate && (
                        <Lock
                          size={13}
                          strokeWidth={2}
                          style={{ color: "var(--color-text-muted)", flex: "0 0 auto" }}
                          aria-label="Private event"
                        />
                      )}
                      <span>{ev.title}</span>
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

                  {/* RSVP */}
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
                      transition: "background 200ms, color 200ms, border-color 200ms",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--text)";
                      e.currentTarget.style.color = "var(--bg)";
                      e.currentTarget.style.borderColor = "var(--text)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.color = "var(--text)";
                      e.currentTarget.style.borderColor = "var(--border-sub)";
                    }}
                  >
                    RSVP
                  </button>
                </li>
              ))}
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
