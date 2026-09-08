"use client";

/**
 * Rail cards shared by the five list surfaces (Legend is identical text on
 * every artboard 02/04/06/08/11; a plain summary card is the generic
 * fallback for a surface-specific rail card this lane did not build —
 * logged per-page in DEVIATION-LOG.md). Not a src/components/ui/ part
 * (only the five list surfaces use these); kept here to avoid a five-way
 * copy of the same JSX.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { SectionRule } from "@/components/ui/SectionRule";
import { Absence } from "@/components/ui/Absence";
import { SkeletonRailDateRow } from "@/components/ui/Skeleton";
import { classifyByDays } from "@/lib/urgency/bands";
import { formatEventDateCompact } from "@/lib/connections/forward-event-format.mjs";
import {
  daysFrom,
  selectObligationRailRows,
  OBLIGATION_RAIL_ROW_CAP,
} from "@/lib/forward-events/obligation-rail-select.mjs";
import type { ListSurfaceFacetGroup } from "./ListSurfaceShell";

/** The card-head label type, shared by RailCard's title and FiltersRailCard's own head. */
const RAIL_CARD_TITLE_STYLE: React.CSSProperties = {
  fontSize: "var(--fs-105)",
  fontWeight: 800,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--ink-3)",
  margin: 0,
};

// Ruling 5.1 (2026-09-07, CLOSED): every panel/section card carries the dark-grey graduated 3px
// rule above its title, full card width, top edge, no radius on the rule. Design audit B163/B165/
// B170 (2026-09-07, docs/design/handoff-2026-09-06/AUDIT-2026-09-07.md, list-surface.json /
// section-card-lists.json) found this rail card and the facets card (ListSurfaceShell.tsx)
// rendered NO rule at all — the base lane's own DEVIATION-LOG entry named rolling SectionRule onto
// this file as later-lane scope; this is that lane.
export function RailCard({
  title,
  children,
  dataAudit,
  headLink,
}: {
  title: string;
  children: ReactNode;
  /** Design-audit hook (../../.discipline/rendering/audit) — a stable selector for a real page
   *  composition mount, since a caller like LegendRailCard mounts this with no wrapper div of its
   *  own. Optional: only the callers a compose-*.json spec needs to address by name pass it. */
  dataAudit?: string;
  /** Optional right-aligned link on the card head's baseline — artboard 02/id="p2" draws one on the
   *  "Obligations · next 30 days" card ("Calendar →") and none on Legend. Omitted callers render the
   *  head exactly as before (a bare title paragraph), so no existing card's geometry moves. */
  headLink?: { label: string; href: string };
}) {
  return (
    <div
      data-audit={dataAudit}
      style={{
        background: "var(--card)",
        border: "1px solid var(--line-1)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-card)",
        overflow: "hidden",
      }}
    >
      <SectionRule />
      <div style={{ padding: "14px 16px" }}>
        {headLink ? (
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, margin: "0 0 10px" }}>
            <p style={RAIL_CARD_TITLE_STYLE}>{title}</p>
            <a
              href={headLink.href}
              style={{
                minHeight: 24,
                display: "inline-flex",
                alignItems: "center",
                flexShrink: 0,
                // Artboard 02/id="p2" head link: 11px, weight 600.
                fontSize: "var(--fs-11)",
                fontWeight: 600,
                color: "var(--ink)",
                textDecoration: "underline",
                textDecorationColor: "rgba(0,0,0,.3)",
              }}
            >
              {headLink.label}
            </a>
          </div>
        ) : (
          <p style={{ ...RAIL_CARD_TITLE_STYLE, margin: "0 0 10px" }}>{title}</p>
        )}
        {children}
      </div>
    </div>
  );
}

// FILTERS rail card (operator audit 2026-09-07: "the filters were not above the regulations, they
// were on the right — same on every page"; artboard 02/id="p2" FILTERS card: title + "Clear N" link,
// MODE / JURISDICTION / TOPIC / WORKSPACE TAGS sections as checkbox lists with right-aligned live
// counts, "+ N more" disclosure past a visible cap). Built once here and mounted by ListSurfaceShell
// itself (not per-page) from the SAME facetGroups/secondaryFacetGroups data and onSelect callbacks
// each of the five list surfaces already passes in — the chip groups this replaced sat ABOVE the
// list in the content column; this card is the one relocation point for all five surfaces at once.
// A group with a single-select radio-style onSelect (current URL/state contract: one value or null)
// renders as a checkbox list where checking a row selects it and checking the already-selected row
// clears it — visually a checkbox, behaviourally the same single-select the chips already had, so no
// list surface's filter semantics changed, only where the control lives.
// 6, not 5: artboard 08/id="p8"'s DIMENSION group lists all six dimensions D1-D6 with no "+ N more"
// disclosure, and the disclosure is what this cap exists to trigger.
const VISIBLE_OPTIONS_CAP = 6;

function FacetSection({ group }: { group: ListSurfaceFacetGroup }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? group.options : group.options.slice(0, VISIBLE_OPTIONS_CAP);
  const hidden = group.options.length - visible.length;
  return (
    // data-audit: a stable per-group selector so a compose-*.json spec can assert the rail's facet
    // ORDER (the operator's complaint was placement), not merely that a group exists.
    <div data-audit={`facet-${group.key}`}>
      <p
        style={{
          fontSize: "var(--fs-105)",
          fontWeight: 800,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--ink-3)",
          margin: "0 0 6px",
        }}
      >
        {group.label}
      </p>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {visible.map((opt) => {
          const checked = group.selected === opt.value;
          return (
            <label
              key={opt.value}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                minHeight: 44,
                cursor: "pointer",
                fontSize: "var(--fs-11)",
                color: "var(--ink)",
              }}
            >
              {/* Operator ruling 2026-09-07: the 44px hit-target law applies to the ROW (this whole
                  label is the click target, minHeight 44 below), not to the glyph. Artboard 02/id="p2"
                  draws the checkbox itself at 13x13px, restored here. */}
              <input
                type="checkbox"
                checked={checked}
                onChange={() => group.onSelect(checked ? null : opt.value)}
                style={{ width: 13, height: 13, accentColor: "var(--brand)", flexShrink: 0 }}
              />
              <span style={{ flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {opt.label}
              </span>
              <span style={{ color: "var(--ink-3)", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{opt.countLabel ?? opt.count}</span>
            </label>
          );
        })}
      </div>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          style={{
            marginTop: 4,
            minHeight: 24,
            display: "inline-flex",
            alignItems: "center",
            background: "none",
            border: "none",
            padding: 0,
            fontSize: "var(--fs-11)",
            fontWeight: 700,
            color: "var(--ink-2)",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          + {hidden} more
        </button>
      )}
    </div>
  );
}

export function FiltersRailCard({
  groups,
  footnote,
}: {
  groups: ListSurfaceFacetGroup[];
  /** README §"the band tiles above are the fourth facet" — shown once, at the card foot. */
  footnote?: ReactNode;
}) {
  // A facet group with no options has nothing to check and renders as a bare heading over empty
  // space (seen live on /research's Workspace tags group in a workspace with no tags, lane
  // comp-06 2026-09-08). None of the artboards draw an empty group; the group returns the moment
  // its data does.
  const shown = useMemo(() => groups.filter((g) => g.options.length > 0), [groups]);
  const activeCount = useMemo(() => shown.filter((g) => g.selected !== null).length, [shown]);
  const clearAll = () => shown.forEach((g) => g.onSelect(null));
  if (shown.length === 0) return null;
  return (
    <div
      data-audit="filters-rail"
      style={{
        background: "var(--card)",
        border: "1px solid var(--line-1)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-card)",
        overflow: "hidden",
      }}
    >
      <SectionRule />
      <div style={{ padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
          <p
            style={{
              fontSize: "var(--fs-105)",
              fontWeight: 800,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--ink-3)",
              margin: 0,
            }}
          >
            Filters
          </p>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={clearAll}
              style={{
                minHeight: 24,
                background: "none",
                border: "none",
                padding: 0,
                fontSize: "var(--fs-11)",
                fontWeight: 700,
                color: "var(--ink)",
                textDecoration: "underline",
                textDecorationColor: "rgba(0,0,0,.3)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Clear {activeCount}
            </button>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {shown.map((group) => (
            <FacetSection key={group.key} group={group} />
          ))}
        </div>
        {footnote && (
          <p style={{ fontSize: "var(--fs-105)", color: "var(--ink-3)", margin: "12px 0 0", paddingTop: 10, borderTop: "1px solid var(--line-3)" }}>
            {footnote}
          </p>
        )}
      </div>
    </div>
  );
}

// OBLIGATIONS · NEXT 30 DAYS rail card (artboard 02/id="p2", drawn BELOW the Filters card and ABOVE
// Legend; the page-composition audit found the region simply missing from the built rail). The
// artboard's own anatomy, exactly: a head carrying the label and a "Calendar →" link on the same
// baseline, then up to four rows of `3px 48px 1fr` — a band-coloured bar, the date, and one line of
// "<item title> — <obligation>".
//
// DATA. No new Supabase read: this fetches the EXISTING bounded, RLS-gated, jurisdiction-defaulted
// route GET /api/obligations/upcoming (the same route UpcomingObligationsStrip reads, backed by
// read-upcoming.mjs's fetchUpcomingObligations with its own limit), then applies the artboard's two
// extra constraints — the 30-day window and the four-row count — through the pure
// selectObligationRailRows (src/lib/forward-events/obligation-rail-select.mjs, proven by its own
// npmtest). A limit of 8 is requested rather than 4 because the route's ordering is "soonest first
// across all future events": asking for 4 and then dropping the ones past day 30 could show fewer
// rows than exist inside the window, while 8 covers the artboard's four with headroom and is still
// bounded (F38/F39).
//
// ABSENCE, SKELETON, NEVER A ZERO (README §0.4/§0.6). While the fetch is in flight the card holds
// the artboard's row geometry open with SkeletonRailDateRow — never an empty card, never "0". When
// the read returns nothing inside the window (no obligation dates, or the route's own soft-fail to
// an empty array), the card renders the fixed-vocabulary Absence token instead of rows.
//
// BAND BAR. The bar hue is the ONE urgency module's own classification of the days remaining
// (classifyByDays, src/lib/urgency/bands.ts) — not a page-local colour ramp. Every row inside a
// 30-day window classifies as Immediate, so the live card's bars are one hue where the artboard's
// sample data drew a red/orange mix; that is a data-driven difference, logged in DEVIATION-LOG.md,
// not a geometry or colour deviation.
export interface ObligationRailEvent {
  id: string;
  event_date: string;
  date_precision: "day" | "month" | "year";
  event_kind: string;
  obligation_text: string;
  item: { id: string; title: string; legacy_id: string | null; jurisdiction_iso: string[] | null };
}

export function ObligationsRailCard() {
  const [state, setState] = useState<{ loading: boolean; events: ObligationRailEvent[] }>({
    loading: true,
    events: [],
  });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/obligations/upcoming?limit=8", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : { events: [] }))
      .then((result: { events?: ObligationRailEvent[] }) => {
        if (!cancelled) setState({ loading: false, events: Array.isArray(result?.events) ? result.events : [] });
      })
      .catch(() => {
        if (!cancelled) setState({ loading: false, events: [] });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(
    () => selectObligationRailRows(state.events, new Date()) as ObligationRailEvent[],
    [state.events]
  );

  return (
    // "Calendar →" points at the Obligation Register section already mounted lower on /regulations
    // (ruling R7: the register is the app's real full obligation schedule and stays exactly as it
    // is; there is no calendar route to invent, and the artboard's own link is a self-anchor).
    <RailCard title="Obligations · next 30 days" dataAudit="obligations-rail" headLink={{ label: "Calendar →", href: "#obligation-register" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 9, fontSize: "var(--fs-12)" }}>
        {state.loading ? (
          Array.from({ length: OBLIGATION_RAIL_ROW_CAP }, (_, i) => <SkeletonRailDateRow key={i} />)
        ) : rows.length === 0 ? (
          <Absence reason="not in primary source" />
        ) : (
          rows.map((ev) => {
            const days = daysFrom(ev.event_date, new Date()) as number | null;
            return (
              <div key={ev.id} data-audit="obligation-row" style={{ display: "grid", gridTemplateColumns: "3px 48px 1fr", gap: 10, alignItems: "start" }}>
                <span aria-hidden="true" style={{ background: classifyByDays(days).hex, borderRadius: 2, alignSelf: "stretch" }} />
                <span style={{ fontWeight: 700, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
                  {formatEventDateCompact(ev.event_date, ev.date_precision)}
                </span>
                <span style={{ lineHeight: 1.4, color: "var(--ink)" }}>
                  {ev.item.title} — {ev.obligation_text}
                </span>
              </div>
            );
          })
        )}
      </div>
    </RailCard>
  );
}

export function LegendRailCard() {
  return (
    <RailCard title="Legend" dataAudit="legend-rail">
      <dl style={{ margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
          <dt style={{ fontSize: "var(--fs-11)", fontWeight: 800, color: "var(--ink)" }}>Impact</dt>
          <dd style={{ fontSize: "var(--fs-11)", color: "var(--ink-2)", margin: "2px 0 0" }}>
            Four scored dimensions, sorted low to high: green left, red right. Height is the sum, score 1–3.
          </dd>
        </div>
        <div>
          <dt style={{ fontSize: "var(--fs-11)", fontWeight: 800, color: "var(--ink)" }}>Timeline</dt>
          <dd style={{ fontSize: "var(--fs-11)", color: "var(--ink-2)", margin: "2px 0 0" }}>Passed · next · ahead.</dd>
        </div>
        <div>
          <dt style={{ fontSize: "var(--fs-11)", fontWeight: 800, color: "var(--ink)" }}>Source tier</dt>
          <dd style={{ fontSize: "var(--fs-11)", color: "var(--ink-2)", margin: "2px 0 0" }}>
            T1 binding law → T6 commentary.
          </dd>
        </div>
      </dl>
    </RailCard>
  );
}
