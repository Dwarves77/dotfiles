"use client";

/**
 * ObligationRegisterPageView — the body of /regulations/register (UI fix round 2026-09-08, item D2).
 *
 * WHY THIS PAGE EXISTS. The obligation register used to be a full-width section mounted BELOW the
 * /regulations list, under the artboard's last card. The operator's page-scope ruling (item D, this
 * round) is that an artboard defines the whole page and content below its last card must move or go:
 * the register moves here, and the horizontal "Upcoming obligations" card strip that sat beside it is
 * removed outright (the rail card "Obligations · next 30 days" is the design for that).
 *
 * NO ARTBOARD. /regulations/register is one of the three pages this round creates that Claude Design
 * has not drawn (coordinator note N4). It is therefore built in the STANDARD FRAME from the parts that
 * already exist — Masthead (carrying the one CommandBar), the 778px content column + 300px rail grid,
 * FiltersRailCard, ObligationsRailCard, LegendRailCard — and the register itself is the CURRENT
 * implementation moved across, not a rewrite. Logged in DEVIATION-LOG.md as awaiting an artboard.
 *
 * THE FACETS ARE THE SHARED ONES. The register's four page-local `<select>` dropdowns are gone; its
 * jurisdiction / mode / binding-position / due-window facets render through the SAME rail Filters card
 * every list surface uses, with live per-option counts from read-register.mjs's own corpus-wide tally
 * (never derived from the loaded page). Selecting a facet refetches the register from offset 0 through
 * the route it already used — see ObligationRegisterFilterBar.tsx.
 *
 * SORT. The register is ordered by NEXT DUE, not by oldest — a change made at the read
 * (read-register.mjs's NEXT_DUE_SEGMENTS), correct across page boundaries, not a display tweak.
 */

import { useMemo, useState } from "react";
import { Masthead } from "@/components/ui/Masthead";
import { SectionCard } from "@/components/ui/SectionCard";
import { FiltersRailCard, LegendRailCard, ObligationsRailCard } from "@/components/list-surface/ListSurfaceRailCards";
import type { ListSurfaceFacetGroup } from "@/components/list-surface/ListSurfaceShell";
import { LIST_SURFACE_MOBILE_CSS } from "@/components/list-surface/ListSurfaceShell";
import { ObligationRegister } from "@/components/regulations/ObligationRegister";
import {
  REGISTER_FILTERS_NONE,
  type RegisterFilters,
} from "@/components/regulations/ObligationRegisterFilterBar";
import { UNCLASSIFIED, DUE_WINDOWS } from "@/lib/obligations/read-register.mjs";
import { BINDING_POSITION, TRANSPORT_MODES, orderedValues } from "@/lib/contracts/vocabularies.mjs";
import { isoToDisplayLabel } from "@/lib/jurisdictions/iso";
import { formatNumber } from "@/lib/format";
import type { PublicObligationRegisterFirstPage, RegisterFacetCounts } from "@/lib/data";

const MODE_META = TRANSPORT_MODES as Record<string, { code: string; label: string; order: number; corridorOnly: boolean }>;

const DUE_WINDOW_LABELS: Record<string, string> = {
  overdue: "Overdue",
  "30": "Next 30 days",
  "90": "Next 90 days",
  "365": "Next 12 months",
  undated: "No date on file",
};

const ALL = "__all__";

/** Options for one facet group, ordered by live count then label — the same ordering the list
 *  surfaces' own facet helper uses, so a reader moving between them reads the same shape. */
function optionsFrom(
  counts: Record<string, number>,
  label: (key: string) => string,
  order?: (key: string) => number,
) {
  return Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([value, count]) => ({ value, label: label(value), count }))
    .sort((a, b) =>
      order ? order(a.value) - order(b.value) : b.count - a.count || a.label.localeCompare(b.label),
    );
}

export function ObligationRegisterPageView({
  initialResult,
  dateLabel,
  nowIso,
}: {
  initialResult: PublicObligationRegisterFirstPage;
  dateLabel: string;
  nowIso?: string;
}) {
  const [filters, setFilters] = useState<RegisterFilters>(REGISTER_FILTERS_NONE);
  const counts: RegisterFacetCounts = initialResult.facetCounts;

  const set = (key: keyof RegisterFilters, none: string) => (value: string | null) =>
    setFilters((prev) => ({ ...prev, [key]: value ?? none }));

  const facetGroups: ListSurfaceFacetGroup[] = useMemo(
    () => [
      {
        key: "jurisdiction",
        label: "Jurisdiction",
        // The filter side lower-cases its jurisdiction token (buildRegisterQuerySpec), so the option
        // VALUE is the lower-cased code and the LABEL is the humanized one — never the raw code.
        options: optionsFrom(counts.jurisdiction, (j) => isoToDisplayLabel(j)).map((o) => ({
          ...o,
          value: o.value.toLowerCase(),
        })),
        selected: filters.jurisdiction === ALL ? null : filters.jurisdiction,
        onSelect: set("jurisdiction", ALL),
      },
      {
        key: "mode",
        label: "Mode",
        options: optionsFrom(counts.mode, (m) => MODE_META[m]?.label ?? m, (m) => MODE_META[m]?.order ?? 99),
        selected: filters.mode === ALL ? null : filters.mode,
        onSelect: set("mode", ALL),
      },
      {
        key: "binding-position",
        label: "Binding position",
        options: optionsFrom(counts.bindingPosition, (b) =>
          b === UNCLASSIFIED ? "Not classified" : BINDING_POSITION[b]?.label ?? b,
        ).sort((a, b) => {
          // The vocabulary's own order, with the unclassified state last — a fixed, meaningful
          // sequence rather than a count ranking that reshuffles as the corpus fills.
          const seq = orderedValues("binding_position").map((v: { code: string }) => v.code);
          const rank = (v: string) => (v === UNCLASSIFIED ? seq.length : seq.indexOf(v));
          return rank(a.value) - rank(b.value);
        }),
        selected: filters.bindingPosition === ALL ? null : filters.bindingPosition,
        onSelect: set("bindingPosition", ALL),
      },
      {
        key: "due",
        label: "Due",
        options: DUE_WINDOWS.filter((w: string) => w !== "all")
          .map((w: string) => ({ value: w, label: DUE_WINDOW_LABELS[w] ?? w, count: counts.dueWindow[w] ?? 0 }))
          .filter((o: { count: number }) => o.count > 0),
        selected: filters.dueWindow === "all" ? null : filters.dueWindow,
        onSelect: set("dueWindow", "all"),
      },
    ],
    [counts, filters],
  );

  return (
    <>
      <div className="cl-list-surface-masthead" style={{ padding: "20px 40px 0" }}>
        <style>{LIST_SURFACE_MOBILE_CSS}</style>
        <Masthead
          title="Obligation register"
          dek={
            <>
              Every dated obligation on file, <b style={{ color: "var(--ink)" }}>next due first</b> ·{" "}
              {formatNumber(initialResult.total)} obligation{initialResult.total === 1 ? "" : "s"} ·
              jurisdiction, mode, binding position and due window filter it
            </>
          }
          dateLabel={dateLabel}
          nowIso={nowIso}
          commandBar={{
            itemCount: initialResult.total,
            scope: "regulations",
            placeholder: 'Search the register — or ask "what is due in the next 30 days?"',
          }}
        />
      </div>
      <div
        className="cl-list-surface-grid cl-list-surface-grid--mobile-facets"
        style={{
          padding: "20px 40px 40px",
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) 300px",
          gap: 28,
          alignItems: "start",
        }}
      >
        <style>{`
          @media (max-width: 1280px) {
            .cl-list-surface-grid { grid-template-columns: minmax(0, 1fr) !important; }
          }
        `}</style>
        <style>{LIST_SURFACE_MOBILE_CSS}</style>
        {/* FOLD 63 (2026-09-08). This card shell was five hand-typed declarations plus a
            hand-mounted `<SectionRule/>`, which is exactly the shape operator item A1 named and
            fitness rule F42 forbids: a card shell assembled outside `SectionCard`. The lane that
            built this page branched from wave 61, before `SectionCard` existed, so this is a base
            difference, not a lane defect. Converted rather than exempted: the card's border,
            radius, shadow, `overflow: hidden` and 3px rule now come from the one component, and
            `minWidth: 0` (this card's own grid-cell property, which keeps the register's tables
            from forcing the column open) is passed through the `style` escape hatch the component
            provides for exactly that. */}
        <SectionCard dataAudit="register-card" style={{ minWidth: 0 }}>
          <div style={{ padding: "14px 16px 16px" }}>
            <ObligationRegister variant="list" initialResult={initialResult} filters={filters} />
          </div>
        </SectionCard>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* FOLD 63 (2026-09-08), cross-lane resolution. This lane shipped a `footnote` on this
              card reading "Counts are live for the whole register, not the loaded page. Filters
              never hide behind a button."; lane communitynav2, folded in the same train, DELETED
              the `footnote` prop from FiltersRailCard on the operator ruling of 2026-09-08 ("gone
              everywhere ... Remove from /regulations too; the artboard is corrected"), because
              that sentence is a note to the auditor and was never UI. The ruling is sitewide, so
              it governs this page too and the sentence goes with the prop. The BEHAVIOUR it
              described is unchanged and still measured: `fetchRegisterFacetOptions` tallies the
              whole `obligations` table, never the loaded page. */}
          <FiltersRailCard groups={facetGroups} />
          <ObligationsRailCard nowIso={nowIso} />
          <LegendRailCard />
        </div>
      </div>
    </>
  );
}
