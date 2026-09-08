"use client";

/**
 * F35 row-ux-coverage: every row's squeezed-title floor is guarded by the
 * data-guard-title attribute on src/components/ui/ListRow.tsx's title span
 * (added additively this lane), not re-declared per surface.
 *
 * ResearchLedger — /research's list surface (UI system handoff 2026-09-06,
 * artboard 06 "Research list": themes are a second facet row, not a second
 * tile system; same bands, same rows; "NOT SCORED" chips gone).
 *
 * REWRITTEN this lane (UILISTS, 2026-09-06). The previous ~1,500-line
 * component rendered its own four-value "research relevance" severity as
 * TILES (a second, competing tile system per the artboard's own note) over
 * a `ResearchPipelineItem` shape that carries no priority/impact/timeline
 * fields at all. This version consumes `getPublicResearchItems()`'s full
 * `Resource[]` (the SAME category-routed, verified-gated read the old page
 * already fetched in parallel to intersect against — see research/page.tsx)
 * instead, so the row gets the one real urgency band (src/lib/urgency/
 * bands.ts), the real ImpactMeter/MilestoneTimeline/TierChip every other
 * surface's row carries, and Themes become a facet (THEME_KEYS, the shared
 * src/lib/research/taxonomy.mjs classifier already used by
 * ResearchFindingDetailSurface.tsx) instead of a second tile row.
 *
 * Assembled ONLY from src/components/ui/ parts via ListSurfaceShell. The
 * per-page ask bar and the old severity-tile system are deleted, not left
 * dormant.
 */

import { Fragment, useMemo, useState, type ReactNode } from "react";
import type { Resource } from "@/types/resource";
import type { WorkspaceAggregates } from "@/lib/data";
import { BAND_ORDER, bandFromPriority, type UrgencyBandKey } from "@/lib/urgency/bands";
import { scoreResource } from "@/lib/scoring";
import { formatLocaleDate, formatNumber } from "@/lib/format";
import { nowFrom } from "@/lib/render-now";
import { itemDetailHref } from "@/lib/item-links";
import { dueInfo, jurisdictionCode, metaLine } from "@/lib/dashboard/row-fields";
import { WatchButton } from "@/components/ui/WatchButton";
import { isImpactScored } from "@/components/ui/ImpactMeter";
import { ResearchThemeCards } from "@/components/research/ResearchThemeCards";
import { ListSurfaceSortRow } from "@/components/list-surface/ListSurfaceSortRow";
import { PriorityDropdown } from "@/components/regulations/PriorityDropdown";
import { StateNote } from "@/components/ui/StateNote";
import { TagChip } from "@/components/ui/Chips";
import { ListSurfaceShell, type ListSurfaceFacetGroup } from "@/components/list-surface/ListSurfaceShell";
import { RailCard, LegendRailCard } from "@/components/list-surface/ListSurfaceRailCards";
import { useWorkspaceTagsFacet } from "@/lib/tags/useWorkspaceTagsFacet";
import {
  EMPTY_FILTER_STATE,
  WINDOW_OPTIONS,
  bandFacetOptions,
  modeFacetOptions,
  regionFacetOptions,
  filterByWindow,
  filterRows,
  windowDays,
  withListPosition,
  type ListSurfaceWindowKey,
  type RowFilterState,
} from "@/components/list-surface/list-surface-helpers";
import {
  SEVERITY_LABELS,
  THEME_KEYS,
  THEME_LABELS,
  THEME_COLUMN_TO_KEY,
  assignTheme,
  deriveSeverity,
} from "@/lib/research/taxonomy.mjs";

const PER_BAND_CAP = 5;
const LIST_KEY = "research";
/** "+N new" on a theme card counts items added inside this window (artboard 06/id="p6" draws
 *  "+4 new" on the selected theme card; the window itself is this file's own choice, stated here
 *  rather than buried, and logged in DEVIATION-LOG.md). */
const NEW_WINDOW_DAYS = 7;
/** The masthead command-bar prompt, artboard 06/id="p6", verbatim. */
const SEARCH_PLACEHOLDER = 'Search findings and themes — or ask "what affects my FY26 Scope 3 baseline?"';

function themeKeyOf(r: Resource): string | null {
  const column = r.theme && (THEME_COLUMN_TO_KEY as Record<string, string>)[r.theme] ? r.theme : undefined;
  const text = [r.title, r.whatIsIt, r.whyMatters].filter(Boolean).join(" ");
  return assignTheme(text, column) as string | null;
}

export interface ResearchSourceCoverageCellProp {
  transportMode: string;
  jurisdictionIso: string;
  sourceCount: number;
}

export interface ResearchLedgerProps {
  /** Server render instant (src/lib/render-now.ts `renderNowIso()`). Threaded from this
   *  surface's page.tsx so every date this ledger renders comes from ONE instant the SERVER
   *  chose — the SSR pass and the hydration pass then produce identical text by construction
   *  (React #418 class, see render-now.ts). */
  nowIso?: string;
  resources: Resource[];
  aggregates: WorkspaceAggregates;
  sourceCoverage?: ResearchSourceCoverageCellProp[];
  /** Page content the artboard does not draw, rendered at the FOOT of the content column rather
   *  than above the masthead where it used to sit (operator ruling R7: an app feature the artboard
   *  has no region for stays live, moved out of the region an artboard region must occupy).
   *  /research passes ThemeStrip plus the split-credibility legend here, both server-rendered in
   *  app/research/page.tsx and handed down as an element, so this client component never has to
   *  own their data reads. */
  belowRows?: ReactNode;
}

export function ResearchLedger({ resources, aggregates, sourceCoverage, nowIso, belowRows }: ResearchLedgerProps) {
  const [filter, setFilter] = useState<RowFilterState>(EMPTY_FILTER_STATE);
  const [theme, setTheme] = useState<string | null>(null);
  const [windowKey, setWindowKey] = useState<ListSurfaceWindowKey>("all");
  const [expanded, setExpanded] = useState<Set<UrgencyBandKey>>(new Set());

  const tagsFacet = useWorkspaceTagsFacet();

  /** Everything except the theme facet, the theme cards' own counts are read off this, so
   *  selecting one theme never rewrites the other three cards' numbers to 0. */
  const beforeTheme = useMemo(() => {
    const base = filterByWindow(filterRows(resources, filter), windowKey);
    return base.filter((r) => tagsFacet.matchesSelectedTag(r.id));
  }, [resources, filter, windowKey, tagsFacet.matchesSelectedTag]);

  const filtered = useMemo(
    () => (theme ? beforeTheme.filter((r) => themeKeyOf(r) === theme) : beforeTheme),
    [beforeTheme, theme],
  );

  const bandCounts = useMemo(() => {
    const opts = bandFacetOptions(resources, aggregates.byPriority as unknown as Record<string, number>);
    return Object.fromEntries(opts.map((o) => [o.key, o.count])) as Record<UrgencyBandKey, number>;
  }, [resources, aggregates.byPriority]);

  const modeOptions = useMemo(() => modeFacetOptions(resources), [resources]);
  const regionOptions = useMemo(() => regionFacetOptions(resources, aggregates.byJurisdiction), [resources, aggregates.byJurisdiction]);

  /** Theme cards (artboard 06/id="p6"): one card per theme PRESENT in the current selection, in
   *  THEME_KEYS order, each with its live count and how many of those arrived inside
   *  NEW_WINDOW_DAYS. This is the theme facet, the artboard's own caption ("themes are a second
   *  facet row, not a second tile system"), so the theme group is NOT also listed in the rail's
   *  Filters card; one control per facet. */
  const themeCards = useMemo(() => {
    const counts = new Map<string, number>();
    const fresh = new Map<string, number>();
    // FOLD-59: from the SERVER instant, not Date.now(). This cutoff decides which theme cards
    // carry the "+N new" badge, so reading the host clock made the badge differ between the SSR
    // and hydration passes for any finding added within a render of the boundary.
    const cutoff = nowFrom(nowIso).getTime() - NEW_WINDOW_DAYS * 86400000;
    for (const r of beforeTheme) {
      const key = themeKeyOf(r);
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      const added = r.added ? new Date(r.added).getTime() : NaN;
      if (!Number.isNaN(added) && added >= cutoff) fresh.set(key, (fresh.get(key) ?? 0) + 1);
    }
    return (THEME_KEYS as string[])
      .filter((k) => counts.has(k))
      .map((k) => ({ key: k, count: counts.get(k) ?? 0, newCount: fresh.get(k) ?? 0 }));
  }, [beforeTheme, nowIso]);

  const facetGroups: ListSurfaceFacetGroup[] = [
    { key: "mode", label: "Mode", options: modeOptions, selected: filter.mode, onSelect: (v) => setFilter((f) => ({ ...f, mode: v })) },
    { key: "region", label: "Region", options: regionOptions, selected: filter.region, onSelect: (v) => setFilter((f) => ({ ...f, region: v })) },
  ];

  const themeFacetGroups: ListSurfaceFacetGroup[] = [
    {
      key: "workspace-tags",
      label: "Workspace tags",
      options: tagsFacet.tags.map((t) => ({ value: t.id, label: t.name, count: t.itemCount })),
      selected: tagsFacet.selectedTagId,
      onSelect: tagsFacet.setSelectedTagId,
    },
  ];

  const rowsByBand = useMemo(() => {
    return BAND_ORDER.map((band) => {
      const bandRows = filter.band && filter.band !== band.key ? [] : filtered.filter((r) => bandFromPriority(r.priority).key === band.key);
      return {
        band,
        total: bandRows.length,
        rows: bandRows.map((r, i) => {
          const due = dueInfo(r);
          const baseHref = itemDetailHref(r);
          const themeKey = themeKeyOf(r);
          const themeLabel = themeKey ? (THEME_LABELS as Record<string, string>)[themeKey] ?? themeKey : null;
          // Artboard 06/id="p6" row: a kind TagChip carrying the row's SEVERITY ("Cost alert",
          // "Background") followed by "Finding · <theme> · <kind>". The theme lives in the meta
          // TEXT here, not in the chip, this is the same one-tag-then-meta anatomy
          // MarketIntelLedger's signal-kind tag already uses, with the artboard's own strings.
          // Severity comes from the shared classifier (src/lib/research/taxonomy.mjs), never a
          // page-local vocabulary.
          const severityLabel = (SEVERITY_LABELS as Record<string, string>)[
            deriveSeverity([r.title, r.whatIsIt, r.whyMatters].filter(Boolean).join(" "), r.added, r.severity) as string
          ];
          const metaText = [r.type, themeLabel, r.sub || (r.modes ?? []).join(", ")].filter(Boolean).join(" · ");
          const meta = (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              {severityLabel && <TagChip>{severityLabel}</TagChip>}
              <span>{metaText || metaLine(r)}</span>
            </span>
          );
          return {
            key: r.id,
            href: withListPosition(baseHref, LIST_KEY, i + 1, bandRows.length, {
              prev: bandRows[i - 1]?.id,
              next: bandRows[i + 1]?.id,
            }),
            band,
            jurisdiction: jurisdictionCode(r),
            title: r.title,
            meta,
            impact: r.impactScores ?? scoreResource(r),
            due: due ? { label: due.label, days: `${due.days}` } : null,
            timeline: r.timeline ?? null,
            tier: r.sourceTier ?? null,
            tags: tagsFacet.tagsForItem(r.id),
            overflow: (
              <PriorityDropdown
                variant="card"
                showPriorityActions={false}
                ariaLabel="Research item actions"
                menuTopContent={<WatchButton itemType="research" itemId={r.id} />}
              />
            ),
          };
        }),
      };
    });
  }, [filtered, filter.band, tagsFacet.tagsForItem]);

  const coverageBySource = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of sourceCoverage ?? []) map.set(c.transportMode, (map.get(c.transportMode) ?? 0) + c.sourceCount);
    return Array.from(map.entries());
  }, [sourceCoverage]);

  const total = aggregates.totalItems || resources.length;
  const shown = filtered.length;
  const themeLabelOf = (key: string) => (THEME_LABELS as Record<string, string>)[key] ?? key;
  const windowLabel = WINDOW_OPTIONS.find((o) => o.key === windowKey)?.label ?? "All";
  const widerWindow = WINDOW_OPTIONS.find((o) => {
    const days = windowDays(windowKey);
    return days != null && (o.days == null || o.days > days);
  });
  /** Awareness-band rows the meter itself calls unscored, the number artboard 06's transition
   *  strip states ("34 findings sit below the scoring threshold and are kept for context"). */
  const unscoredAwareness = useMemo(
    () =>
      filtered.filter(
        (r) => bandFromPriority(r.priority).key === "awareness" && !isImpactScored(r.impactScores ?? scoreResource(r)),
      ).length,
    [filtered],
  );

  return (
    <ListSurfaceShell
      title="Research"
      scopeLine={
        <>
          <b style={{ color: "var(--ink)" }}>{formatNumber(total)}</b> active findings · <b style={{ color: "var(--ink)" }}>{themeCards.length}</b>{" "}
          themes · peer-reviewed journals, think tanks, quantified-climate research, analytical press
        </>
      }
      dateLabel={formatLocaleDate(nowFrom(nowIso), { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}
      nowIso={nowIso}
      itemCount={total}
      scope="research"
      searchPlaceholder={SEARCH_PLACEHOLDER}
      onSearch={(q) => setFilter((f) => ({ ...f, query: q }))}
      bandCounts={bandCounts}
      selectedBand={filter.band}
      onSelectBand={(key) => setFilter((f) => ({ ...f, band: f.band === key ? null : key }))}
      facetGroups={facetGroups}
      secondaryFacetGroups={themeFacetGroups}
      aboveRows={<ResearchThemeCards themes={themeCards} selected={theme} onSelect={setTheme} />}
      sortRow={
        <ListSurfaceSortRow
          countLabel={
            <>
              <b style={{ color: "var(--ink)" }}>
                {formatNumber(shown)} of {formatNumber(total)}
              </b>{" "}
              findings{theme ? ` · ${themeLabelOf(theme)}` : ""}
            </>
          }
          linkLabel={theme ? "Clear theme" : undefined}
          onLink={theme ? () => setTheme(null) : undefined}
          controlLabel="Window"
          options={WINDOW_OPTIONS.map((o) => ({ key: o.key, label: o.label }))}
          active={windowKey}
          onSelect={(k) => setWindowKey(k as ListSurfaceWindowKey)}
        />
      }
      rowsByBand={rowsByBand}
      perBandCap={PER_BAND_CAP}
      expandedBands={expanded}
      onExpandBand={(key) => setExpanded((s) => new Set(s).add(key))}
      sectionFoot={(_bandKey, nextBandKey) =>
        nextBandKey === "awareness" && unscoredAwareness > 0 ? (
          <StateNote
            band={BAND_ORDER.find((b) => b.key === "awareness")}
            action={{
              label: "Why unscored →",
              // The artboard links this to a scoring-methodology page the product does not have.
              // Rather than ship a dead href (operator audit P0 1.1), it asks the one ask surface
              //, the same `open-ask-assistant` event the masthead CommandBar dispatches. Logged
              // in DEVIATION-LOG.md.
              onClick: () =>
                window.dispatchEvent(
                  new CustomEvent("open-ask-assistant", {
                    detail: { question: "Why are some research findings unscored?", scope: "research" },
                  }),
                ),
            }}
          >
            <b>Awareness</b> · {unscoredAwareness} findings sit below the scoring threshold and are kept for context
          </StateNote>
        ) : null
      }
      emptyState={
        <div style={{ padding: "28px 20px", textAlign: "center" }}>
          <div
            style={{
              fontFamily: "var(--font-display)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              fontSize: 20,
              color: "var(--ink)",
            }}
          >
            {windowDays(windowKey) == null
              ? "Nothing matches this selection"
              : `Nothing in the last ${windowDays(windowKey)} days`}
          </div>
          <div style={{ fontSize: "var(--fs-125)", color: "var(--ink-2)", marginTop: 6, lineHeight: 1.45 }}>
            0 of {formatNumber(total)} findings match{theme ? ` ${themeLabelOf(theme)} · ` : " "}
            {windowLabel}.{" "}
            {widerWindow && (
              <>
                <button
                  type="button"
                  onClick={() => setWindowKey(widerWindow.key)}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    font: "inherit",
                    color: "var(--ink)",
                    fontWeight: 600,
                    textDecoration: "underline",
                    textDecorationColor: "rgba(0,0,0,.3)",
                    cursor: "pointer",
                  }}
                >
                  Widen to {widerWindow.days} days
                </button>
                {theme ? " or " : "."}
              </>
            )}
            {theme && (
              <>
                <button
                  type="button"
                  onClick={() => setTheme(null)}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    font: "inherit",
                    color: "var(--ink)",
                    fontWeight: 600,
                    textDecoration: "underline",
                    textDecorationColor: "rgba(0,0,0,.3)",
                    cursor: "pointer",
                  }}
                >
                  clear the theme
                </button>
                .
              </>
            )}
          </div>
        </div>
      }
      belowRows={belowRows}
      rail={
        <>
          {/* Source coverage (artboard 06/id="p6" rail card 2): label + Anton value pairs in a
              1fr/auto grid, then the caption. The artboard's four rows are SOURCE CLASSES
              (peer-reviewed / think tank / quantified research / analytical press); no per-item
              source-class field exists in this corpus, so the card states the axis the data
              really has (getResearchSourceCoverage's transport modes) with the artboard's own
              geometry: logged in DEVIATION-LOG.md rather than invented. */}
          <RailCard title="Source coverage" dataAudit="source-coverage-rail">
            {coverageBySource.length === 0 ? (
              <p style={{ fontSize: "var(--fs-11)", color: "var(--ink-2)", margin: 0 }}>No coverage matrix populated yet.</p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "6px 12px", fontSize: "var(--fs-125)", alignItems: "baseline" }}>
                {coverageBySource.map(([mode, count]) => (
                  <Fragment key={mode}>
                    <span style={{ color: "var(--ink)" }}>{mode}</span>
                    <span style={{ fontFamily: "var(--font-display)", fontSize: 16, color: "var(--ink)" }}>{formatNumber(count)}</span>
                  </Fragment>
                ))}
              </div>
            )}
            <p style={{ fontSize: "var(--fs-11)", color: "var(--ink-3)", margin: "8px 0 0", lineHeight: 1.5 }}>
              Distribution across the transport modes the coverage matrix records.
            </p>
          </RailCard>
          <LegendRailCard />
        </>
      }
    />
  );
}
