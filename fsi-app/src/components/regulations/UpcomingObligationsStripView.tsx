/**
 * UpcomingObligationsStripView — the pure presentational half of UpcomingObligationsStrip
 * (lane MOBILE, 2026-09-03). Extracted so the row markup can be UX-smoke-tested at all.
 *
 * WHY THIS FILE EXISTS. UpcomingObligationsStrip.tsx is an async Server Component whose only
 * data-access import (`createSupabaseServerClient` -> `next/headers`'s `cookies()`) cannot be
 * evaluated in a browser bundle: confirmed empirically while building this lane's UX smoke specs —
 * esbuild bundles the module without error (it resolves fine), but the moment ANY export of that
 * module is actually used by the render tree, `next/headers`'s own top-level code runs and throws
 * "process is not defined" in the page (no `process` global outside Node/Next's server runtime).
 * Tree-shaking does not save an unused SIBLING export in the SAME file either — importing one named
 * export from a module still evaluates that module's own top-level statements in full, `next/headers`
 * import included, before any binding is available to use.
 *
 * The fix is physical separation, not a smarter import: this file carries every byte of the row
 * markup (Header / EventCard / DetailCard, unchanged) and zero server-only imports, so it is safe to
 * mount with `ReactDOM.createRoot` the same way every other row component in this lane's UX smoke
 * specs is. UpcomingObligationsStrip.tsx now does the data fetch and calls this component with the
 * result — identical rendered output, reached through a file the harness can actually load.
 */

import Link from "next/link";
import { Calendar } from "lucide-react";
import { formatEventDate } from "@/lib/connections/forward-event-format.mjs";
import { itemDetailHref } from "@/lib/item-links";

export const KIND_LABELS: Record<string, string> = {
  entry_into_force: "Entry into force",
  compliance_deadline: "Compliance deadline",
  review_or_report: "Review / report",
  phase_step: "Phase step",
  consultation_close: "Consultation close",
  other: "Other",
};

export interface UpcomingEvent {
  id: string;
  event_date: string;
  date_precision: "day" | "month" | "year";
  event_kind: string;
  obligation_text: string;
  item: { id: string; title: string; legacy_id: string | null; jurisdiction_iso: string[] | null };
}

interface ViewProps {
  variant: "list" | "detail";
  events: UpcomingEvent[];
  /** List variant only: whether the jurisdiction filter narrowed the read, so the empty-state copy
   *  can say so honestly. */
  hasJurisdictionFilter?: boolean;
}

export function UpcomingObligationsStripView({ variant, events, hasJurisdictionFilter = false }: ViewProps) {
  if (variant === "detail") {
    if (events.length === 0) return null; // honest omission — see UpcomingObligationsStrip.tsx's header
    return <DetailCard events={events} />;
  }

  if (events.length === 0) {
    return (
      <section style={stripWrapStyle}>
        <Header />
        <p style={{ fontSize: 12.5, color: "var(--color-text-muted)", margin: "6px 0 0" }}>
          No upcoming obligations match{hasJurisdictionFilter ? " your workspace's jurisdictions" : ""} right now.
        </p>
      </section>
    );
  }

  return (
    <section style={stripWrapStyle}>
      <Header count={events.length} />
      <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4 }}>
        {events.map((ev) => (
          <EventCard key={ev.id} ev={ev} />
        ))}
      </div>
    </section>
  );
}

/** Detail-page rail card — deliberately mirrors ItemConnectionsCard's exact token set (--surface,
 *  --border-sub, --r-md, --shadow, --muted, --text) so it sits in the meta rail as a matching sibling
 *  card, not a visually foreign strip. Mounted directly ABOVE ItemConnectionsCard in
 *  RegulationDetailSurface.tsx. */
function DetailCard({ events }: { events: UpcomingEvent[] }) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border-sub)",
        borderRadius: "var(--r-md)",
        padding: "14px 16px",
        boxShadow: "var(--shadow)",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--muted)",
          marginBottom: 10,
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
        }}
      >
        <span>Upcoming</span>
        <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.08em", color: "var(--text-2)" }}>
          {events.length}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {events.map((ev) => (
          <a key={ev.id} href={itemDetailHref({ id: ev.item.legacy_id || ev.item.id })} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
            <div
              style={{
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--accent)",
                marginBottom: 2,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 6,
              }}
            >
              <span>{KIND_LABELS[ev.event_kind] ?? ev.event_kind}</span>
              <span style={{ color: "var(--text-2)", fontWeight: 700 }}>{formatEventDate(ev.event_date, ev.date_precision)}</span>
            </div>
            <div data-guard-title style={{ fontSize: 12, lineHeight: 1.4, color: "var(--text)", overflowWrap: "anywhere" }}>{ev.obligation_text}</div>
          </a>
        ))}
      </div>
    </div>
  );
}

function Header({ count }: { count?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
      <Calendar size={14} style={{ color: "var(--color-text-muted)" }} />
      <h2
        style={{
          fontSize: 13,
          fontWeight: 800,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: "var(--color-text-primary)",
          margin: 0,
        }}
      >
        Upcoming obligations
      </h2>
      {typeof count === "number" && (
        <span style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>
          {count} {count === 1 ? "event" : "events"}
        </span>
      )}
    </div>
  );
}

/** List-strip card — a fixed-width tile in the horizontal-scroll top strip. Its title is nowrap +
 *  ellipsis deliberately: the card is a self-contained 240px tile inside a horizontally-SCROLLING
 *  strip (overflowX: auto on the parent, never the page), the allowed exception to "no nowrap on
 *  text that can exceed the viewport" — the aside/figure carve-out in globals.css's row-system
 *  comment. */
function EventCard({ ev }: { ev: UpcomingEvent }) {
  const href = itemDetailHref({ id: ev.item.legacy_id || ev.item.id });
  const jurisdiction = ev.item.jurisdiction_iso?.[0] ?? null;

  return (
    <Link
      href={href}
      style={{
        display: "block",
        flex: "0 0 240px",
        textDecoration: "none",
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        padding: "10px 12px",
        background: "var(--color-surface)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.03em",
            color: "var(--color-primary)",
          }}
        >
          {KIND_LABELS[ev.event_kind] ?? ev.event_kind}
        </span>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--color-text-primary)" }}>
          {formatEventDate(ev.event_date, ev.date_precision)}
        </span>
      </div>
      <div
        data-guard-title
        style={{
          fontSize: 12.5,
          fontWeight: 600,
          color: "var(--color-text-primary)",
          margin: "4px 0 2px",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {ev.item.title}
        {jurisdiction && (
          <span style={{ fontFamily: "monospace", fontSize: 10, color: "var(--color-text-muted)", marginLeft: 6 }}>
            {jurisdiction}
          </span>
        )}
      </div>
      <p
        style={{
          fontSize: 11.5,
          color: "var(--color-text-secondary)",
          margin: 0,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {ev.obligation_text}
      </p>
    </Link>
  );
}

const stripWrapStyle: React.CSSProperties = {
  maxWidth: 1180,
  margin: "0 auto",
  padding: "18px 36px 0",
};
