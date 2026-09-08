"use client";

/**
 * Rail cards shared by the five list surfaces (Legend is identical text on
 * every artboard 02/04/06/08/11; a plain summary card is the generic
 * fallback for a surface-specific rail card this lane did not build —
 * logged per-page in DEVIATION-LOG.md). Not a src/components/ui/ part
 * (only the five list surfaces use these); kept here to avoid a five-way
 * copy of the same JSX.
 */

import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { SectionRule } from "@/components/ui/SectionRule";
import { formatLocaleDate, formatNumber } from "@/lib/format";
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
import { nowFrom } from "@/lib/render-now";

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
          {/* Artboard 02/id="p2" draws `Clear 1` (one facet active) and artboard 04/id="p4" draws a
              bare `Clear` (none active) in the SAME head position, so the link is part of the card's
              drawn anatomy in both states and is rendered unconditionally here — lane lists60,
              2026-09-08, closing the fold's "the rail Filters card has no Clear link" item, which was
              this control hiding itself whenever the fixture had no active facet. With nothing
              selected it is `disabled`: the artboard's own geometry and type are kept (11px/600 ink,
              24px box) so the card still looks like the image, and a press that would clear nothing
              is refused rather than silently doing nothing (operator audit P0 1.1's class). */}
          <button
            type="button"
            onClick={clearAll}
            disabled={activeCount === 0}
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
              cursor: activeCount === 0 ? "default" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {activeCount === 0 ? "Clear" : `Clear ${activeCount}`}
          </button>
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

// FOLD-59 (2026-09-08): the instant comes from the SERVER (src/lib/render-now.ts), never from this
// client component's own clock. Both reads below decide which URGENCY BAND a date falls in and how
// many days away it is, so an SSR pass and a hydration pass on different sides of a day boundary
// would paint different colours and different day counts for the same row (the React #418 class
// HYDRATION-59 root-caused). comp-oblig built this card before that rule landed.
export function ObligationsRailCard({ nowIso }: { nowIso?: string }) {
  const now = nowFrom(nowIso);
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
    () => selectObligationRailRows(state.events, now) as ObligationRailEvent[],
    [state.events, now]
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
            const days = daysFrom(ev.event_date, now) as number | null;
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

// CARBON COST PER FEU rail card (artboard 04/id="p4", drawn between the Filters card and NEXT DATA
// DROPS; the page-composition audit found the region missing from the built rail, which carried
// SOURCES TRACKED there instead). The artboard's own anatomy: the head label, a 12px dek
// ("EUA / ETS2 / CBAM / UKA cost per forty-foot unit, by corridor."), a `1fr auto` grid of corridor
// rows whose right cell is a small-caps pending token, and an 11px foot line naming the missing
// inputs ONCE rather than a GAP box per corridor.
//
// DATA (lane lists60, 2026-09-08). No new read. /market already computes one carbonCostPerFeu()
// result per LIVE CORRIDOR ENTITY for the <CarbonCostOverlay/> section below the ledger
// (src/app/market/page.tsx's buildCarbonCostOverlays, reading getCachedCorridorScopes()); this card
// is a second, compact view of those same entries, reduced by the pure summariseCarbonCorridors
// (src/lib/market/market-rail-select.mjs). The fuller overlay section stays exactly where it is
// (ruling R7 — an app feature the artboard does not draw, already sitting after the last designed
// region of the page).
//
// ABSENCE, NEVER A FABRICATED FIGURE. Every live corridor is in the gapped state today, because
// carbon-cost-per-feu.mjs's four inputs are four named GAPs: no emission factor for the corridor's
// mode, no licence-clear routing-distance dataset, no licence-clear tonnes-per-FEU convention (GLEC
// and ISO 14083 are both `prohibited` in migration 258's register), and no EU ETS/FuelEU/CBAM/UKA
// price in market_series (the eex-eua producer is an unimplemented stub). That is exactly the state
// the ARTBOARD ITSELF draws ("4 inputs pending"), so the card matches the image today and lights up
// with a real figure the moment any one of the four lands, with no change here. With no corridor at
// all the card renders the fixed-vocabulary Absence token rather than an empty shell.
export interface CarbonCorridorRow {
  label: string;
  pending: number;
  point: number | null;
  currency: string | null;
}

export function CarbonCostRailCard({ corridors }: { corridors: CarbonCorridorRow[] }) {
  return (
    <RailCard title="Carbon cost per FEU" dataAudit="carbon-feu-rail">
      <div data-audit="carbon-feu-dek" style={{ fontSize: "var(--fs-12)", lineHeight: 1.5, color: "var(--ink-2)" }}>
        EUA / ETS2 / CBAM / UKA cost per forty-foot unit, by corridor.
      </div>
      {corridors.length === 0 ? (
        <div style={{ marginTop: 8 }}>
          <Absence reason="connect data" />
        </div>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: "6px 12px",
              fontSize: "var(--fs-125)",
              marginTop: 8,
              alignItems: "baseline",
            }}
          >
            {corridors.map((c) => (
              <Fragment key={c.label}>
                <span data-audit="carbon-feu-corridor">{c.label}</span>
                <span style={{ fontWeight: 600, justifySelf: "end" }}>
                  {c.pending > 0 ? (
                    <span
                      data-audit="carbon-feu-pending"
                      style={{
                        fontSize: "var(--fs-105)",
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: "var(--ink-3)",
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {c.pending} input{c.pending === 1 ? "" : "s"} pending
                    </span>
                  ) : (
                    `${c.currency ?? ""}${formatNumber(Math.round(c.point ?? 0))}`
                  )}
                </span>
              </Fragment>
            ))}
          </div>
          {corridors.some((c) => c.pending > 0) && (
            <div data-audit="carbon-feu-foot" style={{ fontSize: "var(--fs-11)", color: "var(--ink-3)", marginTop: 8, lineHeight: 1.5 }}>
              No emission factor · no corridor distance · no tonnes-per-FEU convention · no carbon price feed. Stated once,
              here, instead of a four-line GAP box per corridor.
            </div>
          )}
        </>
      )}
    </RailCard>
  );
}

// NEXT DATA DROPS rail card (artboard 04/id="p4", drawn between CARBON COST PER FEU and Legend).
// The artboard's anatomy: three rows of a `70px 1fr` grid — a tabular-nums weekday+date in ink at
// weight 700, then the producer name.
//
// THE DATE IS NOT A NEW PREDICTION (spec 02 §9). It is the same derivation the product already
// publishes as `published_price_statistics.next_release_at`: the producer's latest observed
// reference period plus that producer's own REGISTERED cadence, read through the same `addDaysIso`
// helper (see market-rail-select.mjs's own header). A producer with no registered cadence, no
// implemented producer script, or no observation yet is OMITTED rather than given a guessed date, so
// this card can never imply a scheduler that does not exist. With every producer omitted it renders
// the Absence token, never an invented calendar.
/** Artboard 04's own row label form: "Mon Sep 8" — weekday, space, month, day, NO comma. A single
 *  `formatLocaleDate` with `weekday: "short"` renders "Mon, Sep 8" in the pinned locale, so the two
 *  halves are formatted separately and joined by a space. Both halves stay inside format.ts's
 *  locale-pinned helper (F36); nothing here hand-writes a month or weekday name. */
function formatNextDropDate(dateIso: string): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  const weekday = formatLocaleDate(d, { weekday: "short", timeZone: "UTC" });
  const monthDay = formatLocaleDate(d, { month: "short", day: "numeric", timeZone: "UTC" });
  return `${weekday} ${monthDay}`;
}

export interface NextDataDropRow {
  keyPrefix: string;
  name: string;
  dateIso: string;
}

export function NextDataDropsRailCard({ drops }: { drops: NextDataDropRow[] }) {
  return (
    <RailCard title="Next data drops" dataAudit="next-drops-rail">
      <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: "var(--fs-12)" }}>
        {drops.length === 0 ? (
          <Absence reason="pending" />
        ) : (
          drops.map((d) => (
            <div key={d.keyPrefix} data-audit="next-drop-row" style={{ display: "grid", gridTemplateColumns: "70px 1fr", gap: 10 }}>
              {/* nowrap: at the rail's 300px the artboard's 70px date column is a tight fit for a
                  two-digit day ("Thu Sep 10"), and the first capture broke it across two lines with
                  "10" orphaned on the second — exactly the wrap the operator's 2026-09-07 visual
                  pass rules out. The column keeps the artboard's 70px; the date simply never wraps
                  inside it. */}
              <span
                data-audit="next-drop-date"
                style={{ fontWeight: 700, color: "var(--ink)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}
              >
                {formatNextDropDate(d.dateIso)}
              </span>
              <span>{d.name}</span>
            </div>
          ))
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
