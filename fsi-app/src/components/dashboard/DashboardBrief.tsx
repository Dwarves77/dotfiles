"use client";

/**
 * DashboardBrief — the dashboard body, assembled ONLY from the UI system's
 * shared parts (UI system handoff 2026-09-06, README screen 1 / artboard 1):
 * band tiles -> Due next -> What changed; rail = Across the platform,
 * Watchlist, Legend.
 *
 * Nothing here is dormant: every part (BandTile, ListRow, ImpactMeter,
 * MilestoneTimeline, StatBlock, StateNote, Absence) is a component this
 * lane also ships under src/components/ui/ — F25/the closure gates check
 * this file actually mounts them, not just defines them.
 */

import { Suspense, useMemo } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { BandTile } from "@/components/ui/BandTile";
import { ListRow, ListRowColumnHeader } from "@/components/ui/ListRow";
import { SectionRule } from "@/components/ui/SectionRule";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { CardFoot } from "@/components/ui/CardFoot";
import { StateNote } from "@/components/ui/StateNote";
import { StatBlock } from "@/components/ui/StatBlock";
import { formatNumber, formatLocaleDate } from "@/lib/format";
import { nowFrom } from "@/lib/render-now";
import { SkeletonListRow, SkeletonBandTile, SkeletonStatBlock } from "@/components/ui/Skeleton";
import { BAND_ORDER, bandFromPriority } from "@/lib/urgency/bands";
import type { BriefRow } from "@/lib/dashboard/brief-rows";
import type { WorkspaceAggregates } from "@/lib/data";
import type { SurfaceCoverageSnapshot } from "@/lib/dashboard/surface-coverage";
import { DashboardWatchlist } from "@/components/home/DashboardWatchlist";
import type { WatchlistItem } from "@/lib/data";
import { BAND_FACET_PARAM, SORT_FACET_PARAM } from "@/components/list-surface/list-surface-helpers";


function Card({ children }: { children: ReactNode }) {
  // Operator audit items 5.1 + 4.1 (2026-09-07, CLOSED rulings, artboard 18): every panel/section
  // card sitewide gets the 3px top gradient rule (full card width, top edge, no radius on it) and
  // loses the divider that used to sit below the section title — see `<SectionRule/>`'s own header
  // for the shared value and `SectionHeading` above for the removed divider.
  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--line-1)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-card)",
        overflow: "hidden",
      }}
    >
      <SectionRule />
      {children}
    </div>
  );
}

export interface DashboardBriefProps {
  /** Rows SELECTED AND SHAPED ON THE SERVER (src/lib/dashboard/brief-rows.ts) through the shared
   *  `toListRowFields` derivation the list ledgers use — see that module for defect D3, and
   *  src/lib/render-now.ts for why no row derivation may run against this component's own clock. */
  dueNextRows: BriefRow[];
  changedRows: BriefRow[];
  /** Total changes in the last detection pass (the card foot's figure) — the rows themselves are
   *  capped at CHANGED_CAP. */
  totalChanges: number;
  aggregates: WorkspaceAggregates;
  auditDate: string;
  /** Server render instant (src/lib/render-now.ts). */
  nowIso?: string;
  surfaceCoverage: SurfaceCoverageSnapshot;
  watchlistPromise: Promise<WatchlistItem[]>;
  loadingCounts?: boolean;
  /** lib/data.ts's fail-soft sentinel (data._error). Rendered as a neutral
   *  StateNote at the foot of the primary card (README §0.4: "sits at the
   *  foot of the primary card on every page that has a state worth
   *  declaring") rather than a page-wide banner — the artboard carries no
   *  such banner (per-page RULES OF THE BUILD: no page-local ask/alert
   *  panel outside the shared parts). */
  fetchError?: string;
  /** Additive extension (lane rsc503, 2026-09-08): the reason clause from
   *  `describeFallbackTrigger(data._fallbackTrigger)`, rendered under the sentinel inside the
   *  SAME StateNote. Undefined renders exactly what this card rendered before. */
  fetchErrorReason?: string;
}

export function DashboardBrief({
  dueNextRows,
  changedRows,
  totalChanges,
  aggregates,
  auditDate,
  nowIso,
  surfaceCoverage,
  watchlistPromise,
  loadingCounts,
  fetchError,
  fetchErrorReason,
}: DashboardBriefProps) {
  // HYDRATION-59 [CONFIRMED root cause of this route's React #418]: this label was
  // `formatLocaleDate(new Date(), { month: "short", day: "numeric" })` — a client component
  // reading its OWN host clock in render, with no timezone pin. The SSR pass (UTC container) and
  // the hydration pass (the viewer's zone) resolve a different calendar date for part of every
  // day, so the SSR HTML said "week of Sep 7" and the browser said "week of Sep 8" — reproduced
  // this lane in a Pacific/Kiritimati Playwright context, verbatim React text-mismatch diff. Now
  // derived from the SERVER's instant (`nowIso`) and UTC-pinned: identical string, both passes.
  const weekOfLabel = useMemo(
    () => formatLocaleDate(nowFrom(nowIso), { month: "short", day: "numeric", timeZone: "UTC" }),
    [nowIso],
  );
  const immediateTotal = aggregates.byPriority.CRITICAL ?? 0;
  const actionTotal = aggregates.byPriority.HIGH ?? 0;
  const monitorTotal = aggregates.byPriority.MODERATE ?? 0;

  return (
    // Content column top padding is 20px (README §0.3), matching operator ruling 4.2's nav-card
    // margin-top (fix58-tokens, 2026-09-07, page-frame.json B171) so the two align.
    <div style={{ maxWidth: 1440, margin: "0 auto", padding: "20px 40px 40px", display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: 28, alignItems: "start" }} className="cl-brief-outer">
      <style>{`
        @media (max-width: 1280px) {
          .cl-brief-outer { grid-template-columns: 1fr !important; }
        }
        /* Mobile spec (BAND TILES, BREAKPOINTS): below 768 (theme.css's
           documented --bp-mobile) — one column, 2x2 band tiles, gap 10px,
           container padding 14px 16px 16px. */
        @media (max-width: 767px) {
          .cl-brief-outer { padding: 14px 16px 16px !important; }
          .cl-band-tiles { grid-template-columns: repeat(2, 1fr) !important; gap: 10px !important; }
        }
      `}</style>
      <div style={{ display: "flex", flexDirection: "column", gap: 28, minWidth: 0 }} className="cl-brief-grid">
        {/* Band tiles */}
        <div className="cl-band-tiles" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
          {BAND_ORDER.map((band) =>
            loadingCounts ? (
              <SkeletonBandTile key={band.key} />
            ) : (
              // Defect D2 (2026-09-07) [CONFIRMED root cause]: these four tiles were mounted with
              // NEITHER `onSelect` NOR any navigation target, so <BandTile/>'s own
              // `onClick={() => onSelect?.(band.key)}` resolved to a no-op — every one of the four
              // was dead, not just "Immediate" (the audit clicked only that one). They now carry
              // the SAME `?band=` contract the card foot's "All N immediate" link already used
              // (train 57, list-surface-helpers.ts's BAND_FACET_PARAM), so the dashboard has ONE
              // way to open a band, not two.
              <BandTile
                key={band.key}
                band={band}
                count={aggregates.byPriority[band.priority] ?? 0}
                href={`/regulations?${BAND_FACET_PARAM}=${band.key}`}
              />
            ),
          )}
        </div>

        {/* Due next */}
        <section>
          <Card>
            <SectionHeading
              title={`Due next · ${dueNextRows.length} items`}
              aside={`By next binding date · week of ${weekOfLabel}`}
            />
            {dueNextRows.length === 0 ? (
              <div style={{ padding: 16 }}>
                <StateNote>
                  Nothing with a dated deadline right now. Items appear here as they enter scope and are verified.
                </StateNote>
              </div>
            ) : (
              <>
                <ListRowColumnHeader dueLabel="Due" />
                {dueNextRows.map((row) => (
                  <ListRow
                    key={row.id}
                    href={row.href}
                    band={bandFromPriority(row.priority)}
                    jurisdiction={row.jurisdiction}
                    title={row.title}
                    meta={row.meta}
                    impact={row.impact}
                    due={row.due}
                    timeline={row.timeline}
                    tier={row.tier}
                  />
                ))}
                <CardFoot
                  // Audit item 1.1 (2026-09-07): was plain text, a dead control (click did
                  // nothing). Navigates to /regulations with the Immediate band facet applied,
                  // via the same `?band=` contract RegulationsLedger reads (see
                  // list-surface-helpers.ts's BAND_FACET_PARAM/bandFromSearchParam) — no second,
                  // inline expansion of the Immediate band built here on the dashboard.
                  // Lane opsclip (train 61, defect 5): the anchor and its law-2 padding moved into
                  // CardFoot's own `leftHref`, so the sibling foot below cannot be built without
                  // them again.
                  left={<>All {formatNumber(immediateTotal)} immediate</>}
                  leftHref={`/regulations?${BAND_FACET_PARAM}=immediate`}
                  right={<>then {formatNumber(actionTotal)} action · {formatNumber(monitorTotal)} monitor</>}
                />
              </>
            )}
            {fetchError && (
              <div style={{ padding: 12 }}>
                <StateNote>
                  {fetchError}
                  {fetchErrorReason && (
                    <span style={{ display: "block", marginTop: 3, color: "var(--ink-2)" }}>
                      {fetchErrorReason}
                    </span>
                  )}
                </StateNote>
              </div>
            )}
          </Card>
        </section>

        {/* What changed */}
        <section>
          <Card>
            <SectionHeading
              title="What changed"
              aside={auditDate ? `Detection pass ${auditDate}` : "No detection pass on record"}
            />
            {changedRows.length === 0 ? (
              <div style={{ padding: 16 }}>
                <StateNote>
                  Nothing added or updated in the last detection pass.
                </StateNote>
              </div>
            ) : (
              <>
                <ListRowColumnHeader dueLabel="Due" />
                {/* Defect D3 (2026-09-07): these rows used to be built from the change feed
                    alone (impact/due/timeline/tier all hard-coded null), so every one read
                    "UNSCORED · PENDING · not in primary source" while the SAME item on
                    /regulations showed its score and tier. They are now the SHARED row shape
                    (src/lib/dashboard/brief-rows.ts -> toListRowFields), resolved against the
                    corpus payload this route already loads — no second query shape. A change
                    whose item is outside the loaded slice still degrades to the Absence
                    convention rather than an invented value. */}
                {changedRows.map((row) => (
                  <ListRow
                    key={row.id}
                    href={row.href}
                    band={bandFromPriority(row.priority)}
                    jurisdiction={row.jurisdiction}
                    title={row.title}
                    meta={row.isNew ? `NEW · first seen this pass${row.meta ? ` · ${row.meta}` : ""}` : row.meta}
                    impact={row.impact}
                    due={row.due}
                    timeline={row.timeline}
                    tier={row.tier}
                  />
                ))}
                <CardFoot
                  // DEFECT 5 (lane opsclip, train 61, 2026-09-08): this shipped as a bare <span>
                  // while its counterpart on the Due Next card above was an anchor, and the
                  // artboard draws both as links. "The changes" is the regulations list ordered
                  // newest-first, so it links to that ordering through the `?sort=` contract added
                  // beside `?band=` in list-surface-helpers.ts — a real target, not a link to an
                  // unordered list that happens to navigate.
                  left={<>All {formatNumber(totalChanges)} changes in the last 7 days</>}
                  leftHref={`/regulations?${SORT_FACET_PARAM}=newest`}
                  right="old band → new band · NEW = first seen this pass"
                />
              </>
            )}
          </Card>
        </section>
      </div>

      {/* Rail */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Card>
          <div style={{ padding: "14px 16px" }}>
            <p style={{ fontSize: "var(--fs-105)", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-3)", margin: "0 0 10px" }}>
              Across the platform
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {loadingCounts ? (
                <>
                  <SkeletonStatBlock />
                  <SkeletonStatBlock />
                  <SkeletonStatBlock />
                </>
              ) : (
                <>
                  <RailStat label="Regulations" note="Binding law, agency rules, court decisions" value={surfaceCoverage.intelligence.regulations} href="/regulations" />
                  <RailStat label="Market" note="Price series, corporate moves, capital" value={surfaceCoverage.intelligence.marketIntel} href="/market" />
                  <RailStat label="Research" note="Horizon-scan findings" value={surfaceCoverage.intelligence.research} href="/research" />
                  <RailStat label="Operations" note="Regional cost, feasibility, infrastructure" value={surfaceCoverage.intelligence.operations} href="/operations" />
                  <RailStat label="Community" note={`${surfaceCoverage.community.activeGroups} regional rooms`} value={surfaceCoverage.community.activeGroups} href="/community" />
                </>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <div style={{ padding: "14px 16px" }}>
            <Suspense fallback={<SkeletonListRow />}>
              <DashboardWatchlist promise={watchlistPromise} />
            </Suspense>
          </div>
        </Card>

        <Card>
          <div style={{ padding: "14px 16px" }}>
            <p style={{ fontSize: "var(--fs-105)", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-3)", margin: "0 0 10px" }}>
              Legend
            </p>
            <dl style={{ margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <dt style={{ fontSize: "var(--fs-11)", fontWeight: 800, color: "var(--ink)" }}>Impact</dt>
                <dd style={{ fontSize: "var(--fs-11)", color: "var(--ink-2)", margin: "2px 0 0" }}>
                  Four scored dimensions, sorted low to high: green left, red right. Height is the sum, score 1–3.
                </dd>
              </div>
              <div>
                <dt style={{ fontSize: "var(--fs-11)", fontWeight: 800, color: "var(--ink)" }}>Timeline</dt>
                <dd style={{ fontSize: "var(--fs-11)", color: "var(--ink-2)", margin: "2px 0 0" }}>
                  Passed · next · ahead.
                </dd>
              </div>
              <div>
                <dt style={{ fontSize: "var(--fs-11)", fontWeight: 800, color: "var(--ink)" }}>Source tier</dt>
                <dd style={{ fontSize: "var(--fs-11)", color: "var(--ink-2)", margin: "2px 0 0" }}>
                  T1 binding law → T6 commentary.
                </dd>
              </div>
            </dl>
          </div>
        </Card>
      </div>
    </div>
  );
}

function RailStat({ label, note, value, href }: { label: string; note: string; value: number; href: string }) {
  return (
    <Link href={href} prefetch={false} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
      <StatBlock layout="row" label={label} note={note} value={formatNumber(value)} />
    </Link>
  );
}
