/**
 * UpcomingObligationsStrip — the CUSTOMER-FACING top strip for item_forward_events ("what is due,
 * when"), lane SURF (2026-09-01). Server component, no "use client": renders on the Regulations LIST
 * page (top strip, next 8 obligations) and, in its `variant="detail"` shape, the Regulation DETAIL
 * page's "Upcoming" section for one item.
 *
 * WHY THIS EXISTS. Migration 274/275's 901 rows render on exactly one surface today: the admin-only
 * UpcomingObligationsPanel (reached via SourceHealthDashboard, platform-admin gated). This component is
 * the first customer-facing render of that data — see src/lib/forward-events/read-upcoming.mjs's own
 * header for the read-layer contract (RLS-only gate + the extra provenance_status='verified' defense in
 * depth this reader adds on top of it).
 *
 * DATA ACCESS. Calls fetchUpcomingObligations with the REQUEST-SCOPED client
 * (createSupabaseServerClient — cookie-bound, anon key, RLS applies), never the admin API and never a
 * service-role client. Precision-honest date rendering goes through
 * src/lib/connections/forward-event-format.mjs's formatEventDate, unmodified — same function the admin
 * panel already uses, so a year-precision obligation never renders a fabricated day/month here either.
 *
 * JURISDICTION DEFAULT (list variant only). Reads the viewer's workspace profile
 * (src/lib/workspace/profile.ts's getWorkspaceProfile) and defaults the jurisdiction filter to the
 * workspace's weighted jurisdictions (read-upcoming.mjs's defaultJurisdictionFilter) — a workspace with
 * no org / no configured profile degrades to "no filter" (every jurisdiction), never an empty result
 * from a filter that was never really chosen. The detail variant needs no jurisdiction filter: it is
 * already scoped to one item via `itemId`.
 */

import Link from "next/link";
import { Calendar } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { resolveOrgIdFromCookies } from "@/lib/api/org";
import { getWorkspaceProfile } from "@/lib/workspace/profile";
import { fetchUpcomingObligations, defaultJurisdictionFilter } from "@/lib/forward-events/read-upcoming.mjs";
import { formatEventDate } from "@/lib/connections/forward-event-format.mjs";
import { itemDetailHref } from "@/lib/item-links";

const KIND_LABELS: Record<string, string> = {
  entry_into_force: "Entry into force",
  compliance_deadline: "Compliance deadline",
  review_or_report: "Review / report",
  phase_step: "Phase step",
  consultation_close: "Consultation close",
  other: "Other",
};

interface UpcomingEvent {
  id: string;
  event_date: string;
  date_precision: "day" | "month" | "year";
  event_kind: string;
  obligation_text: string;
  item: { id: string; title: string; legacy_id: string | null; jurisdiction_iso: string[] | null };
}

interface Props {
  /** "list" (default): top strip, next 8, jurisdiction-filtered to the workspace's weighted
   *  jurisdictions. "detail": one item's own upcoming events — pass `itemId`. */
  variant?: "list" | "detail";
  /** Required for variant="detail" — the item's UI id (RegulationDetailSurface's `resource.id`, which
   *  may be either a real uuid or a legacy_id; resolved to the real uuid below before the read, since
   *  item_forward_events.intelligence_item_id is a uuid FK). */
  itemId?: string;
  /** How many rows to show. Defaults: 8 for the list strip, 20 for a detail section. */
  limit?: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function UpcomingObligationsStrip({ variant = "list", itemId, limit }: Props) {
  if (variant === "detail" && !itemId) return null; // nothing to scope to — honest omission, not an error

  const supabase = await createSupabaseServerClient();

  // legacy_id -> uuid resolution, via the SAME request-scoped client (not service-role): migration
  // 157/259's intelligence_items_read RLS policy already scopes anon/authenticated reads to
  // provenance_status='verified' AND is_archived IS NOT TRUE — exactly the customer-visible set this
  // surface should ever resolve an id against, so this lookup needs no elevated client. A legacy_id that
  // does not resolve (quarantined/archived/unknown) yields no upcoming section — honest omission, not a
  // leak and not an error.
  let resolvedItemId: string | null = itemId ?? null;
  if (variant === "detail" && itemId && !UUID_RE.test(itemId)) {
    try {
      const { data } = await supabase.from("intelligence_items").select("id").eq("legacy_id", itemId).maybeSingle();
      resolvedItemId = data?.id ?? null;
    } catch {
      resolvedItemId = null;
    }
  }
  if (variant === "detail" && !resolvedItemId) return null;

  let jurisdictionFilter: string[] | null = null;
  if (variant === "list") {
    try {
      const orgId = await resolveOrgIdFromCookies();
      const profile = await getWorkspaceProfile(supabase, orgId);
      jurisdictionFilter = defaultJurisdictionFilter(profile.jurisdictions);
    } catch {
      jurisdictionFilter = null; // soft-fail to "no filter" — never blocks the strip from rendering
    }
  }

  let events: UpcomingEvent[] = [];
  try {
    events = (await fetchUpcomingObligations(supabase, {
      itemId: variant === "detail" ? (resolvedItemId ?? undefined) : undefined,
      limit: limit ?? (variant === "detail" ? 20 : 8),
      jurisdictionFilter,
    })) as UpcomingEvent[];
  } catch {
    return null; // soft-fail — an obligations read failure must never break the surrounding page
  }

  if (variant === "detail") {
    // Honest omission when this item has none — most items have no forward events (901 events, 322
    // live items), so a "nothing due" card is not worth showing on every item, matching the meta rail's
    // own pattern (ItemConnectionsCard shows a "No connections on file yet." line instead of hiding —
    // this section instead hides, since an ever-present empty obligations card next to a populated
    // connections card would read as broken, not honest, on the common case).
    if (events.length === 0) return null;
    return <DetailCard events={events} />;
  }

  if (events.length === 0) {
    return (
      <section style={stripWrapStyle}>
        <Header />
        <p style={{ fontSize: 12.5, color: "var(--color-text-muted)", margin: "6px 0 0" }}>
          No upcoming obligations match{jurisdictionFilter ? " your workspace's jurisdictions" : ""} right now.
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
 *  RegulationDetailSurface.tsx, per this lane's write-set instruction (near the connections card mount,
 *  not the header). */
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
            <div style={{ fontSize: 12, lineHeight: 1.4, color: "var(--text)" }}>{ev.obligation_text}</div>
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

/** List-strip card — a fixed-width tile in the horizontal-scroll top strip. */
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
