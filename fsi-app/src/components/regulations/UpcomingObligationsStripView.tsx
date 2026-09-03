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
      <div data-guard-strip style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4 }}>
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

/** List-strip card — a fixed-width tile in the horizontal-scroll top strip.
 *
 *  Lane MOBILE-2, 2026-09-03 (coordinator's round-2 probe, /market): the title's PRIOR nowrap +
 *  ellipsis single-line treatment cut it mid-word inside the 240px tile, reading (with the kind/date
 *  row right above it) like "Compliance deadline September 2…" — a truncation, not a real overflow
 *  (the strip's own `overflowX: auto` parent is a legitimate scrollable ancestor, so the guard's
 *  clipped-overflow detector never flagged it), but the coordinator's round-2 instruction requires
 *  the tile TEXT itself to wrap within the tile rather than being cut off. Fixed: the title now wraps
 *  (overflowWrap: anywhere), clamped to 2 lines so the tile's height stays bounded — the SAME
 *  2-line-clamp idiom this file already uses one paragraph down for the obligation-text preview,
 *  just applied to the title too. The tile's own partial-next-tile affordance (no scroll-snap, fixed
 *  240px cards, checked by reading — a strip whose total content width isn't an exact multiple of
 *  the viewport always leaves the next tile partially visible) is unchanged and was confirmed still
 *  present; no edge-fade was added on top of it. */
function EventCard({ ev }: { ev: UpcomingEvent }) {
  const href = itemDetailHref({ id: ev.item.legacy_id || ev.item.id });
  const jurisdiction = ev.item.jurisdiction_iso?.[0] ?? null;

  return (
    <Link
      href={href}
      // The squeezed-title detector falls back to document.body's width for a title's "container"
      // when no [data-guard-container] ancestor is present (documented false positive, see
      // docs/plans/mobile-evidence/README.md's "Cross-cutting finding") — without this, the 2-line
      // title above (now genuinely, deliberately narrower than the FULL PAGE width, since it's a
      // fixed 240px tile) reads as squeezed relative to the page rather than to its own tile.
      data-guard-container="upcoming-event-card"
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.03em",
            color: "var(--color-primary)",
            minWidth: 0,
          }}
        >
          {KIND_LABELS[ev.event_kind] ?? ev.event_kind}
        </span>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--color-text-primary)", whiteSpace: "nowrap", flexShrink: 0 }}>
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
          overflowWrap: "anywhere",
          minWidth: 0,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
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

// Lane MOBILE-2, 2026-09-03: hardcoded 36px side padding had no responsive escape (the same shape
// item 1's detail-surface header padding fix addresses) — --cl-detail-pad-x (globals.css) steps to
// 16px at <=767px, both widening the strip on a phone and letting a bit more of the next tile show
// (the strip's partial-tile affordance).
const stripWrapStyle: React.CSSProperties = {
  maxWidth: 1180,
  margin: "0 auto",
  paddingTop: 18,
  paddingLeft: "var(--cl-detail-pad-x)",
  paddingRight: "var(--cl-detail-pad-x)",
};
