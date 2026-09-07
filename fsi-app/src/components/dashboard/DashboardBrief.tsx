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
import { StateNote } from "@/components/ui/StateNote";
import { StatBlock } from "@/components/ui/StatBlock";
import { formatNumber, formatLocaleDate } from "@/lib/format";
import { SkeletonListRow, SkeletonBandTile, SkeletonStatBlock } from "@/components/ui/Skeleton";
import { BAND_ORDER, bandFromPriority } from "@/lib/urgency/bands";
import { jurisdictionCode, dueInfo, metaLine } from "@/lib/dashboard/row-fields";
import { itemDetailHref } from "@/lib/item-links";
import type { Resource } from "@/types/resource";
import type { RecentChangeRow } from "@/lib/supabase-server";
import type { WorkspaceAggregates } from "@/lib/data";
import type { SurfaceCoverageSnapshot } from "@/lib/dashboard/surface-coverage";
import { DashboardWatchlist } from "@/components/home/DashboardWatchlist";
import type { WatchlistItem } from "@/lib/data";

const DUE_NEXT_CAP = 5;
const CHANGED_CAP = 6;

function SectionHeading({ title, aside }: { title: string; aside: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        borderBottom: "2px solid var(--ink)",
        padding: "14px 16px 8px",
        gap: 12,
      }}
    >
      <h2
        data-guard-title
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 400,
          fontSize: 20,
          letterSpacing: "0.02em",
          textTransform: "uppercase",
          margin: 0,
          color: "var(--ink)",
        }}
      >
        {title}
      </h2>
      <span
        style={{
          fontSize: "var(--fs-105)",
          fontWeight: 800,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--ink-3)",
        }}
      >
        {aside}
      </span>
    </div>
  );
}

/** The foot line inside a Due next / What changed card (artboard: "All 14
 *  immediate ... then 31 action · 1,135 monitor" / "All 500 changes ...
 *  old band → new band · NEW = first seen this pass"). */
function CardFoot({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 12,
        padding: "10px 16px",
        borderTop: "1px solid var(--line-3)",
        fontSize: "var(--fs-105)",
        color: "var(--ink-3)",
      }}
    >
      <span>{left}</span>
      <span>{right}</span>
    </div>
  );
}

function Card({ children }: { children: ReactNode }) {
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
      {children}
    </div>
  );
}

export interface DashboardBriefProps {
  resources: Resource[];
  aggregates: WorkspaceAggregates;
  recentChanges: RecentChangeRow[];
  auditDate: string;
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
}

export function DashboardBrief({
  resources,
  aggregates,
  recentChanges,
  auditDate,
  surfaceCoverage,
  watchlistPromise,
  loadingCounts,
  fetchError,
}: DashboardBriefProps) {
  const dueNext = useMemo(() => {
    const withDue = resources
      .map((r) => ({ r, due: dueInfo(r) }))
      .filter((x): x is { r: Resource; due: NonNullable<ReturnType<typeof dueInfo>> } => x.due != null)
      .sort((a, b) => a.due.daysNum - b.due.daysNum);
    return withDue.slice(0, DUE_NEXT_CAP);
  }, [resources]);

  const changed = useMemo(() => {
    const seen = new Set<string>();
    const rows: Array<{ id: string; title: string; href: string; band: ReturnType<typeof bandFromPriority>; isNew: boolean }> = [];
    for (const c of recentChanges) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      rows.push({
        id: c.id,
        title: c.title,
        href: itemDetailHref({ id: c.id, type: c.itemType, domain: c.domain }),
        band: bandFromPriority(c.priority),
        isNew: true,
      });
      if (rows.length >= CHANGED_CAP) break;
    }
    return rows;
  }, [recentChanges]);

  const weekOfLabel = useMemo(
    () => formatLocaleDate(new Date(), { month: "short", day: "numeric" }),
    [],
  );
  const immediateTotal = aggregates.byPriority.CRITICAL ?? 0;
  const actionTotal = aggregates.byPriority.HIGH ?? 0;
  const monitorTotal = aggregates.byPriority.MODERATE ?? 0;

  return (
    <div style={{ maxWidth: 1440, margin: "0 auto", padding: "16px 40px 40px", display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: 28, alignItems: "start" }} className="cl-brief-outer">
      <style>{`
        @media (max-width: 1280px) {
          .cl-brief-outer { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 640px) {
          .cl-band-tiles { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
      <div style={{ display: "flex", flexDirection: "column", gap: 28, minWidth: 0 }} className="cl-brief-grid">
        {/* Band tiles */}
        <div className="cl-band-tiles" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
          {BAND_ORDER.map((band) =>
            loadingCounts ? (
              <SkeletonBandTile key={band.key} />
            ) : (
              <BandTile key={band.key} band={band} count={aggregates.byPriority[band.priority] ?? 0} />
            ),
          )}
        </div>

        {/* Due next */}
        <section>
          <Card>
            <SectionHeading
              title={`Due next · ${dueNext.length} items`}
              aside={`By next binding date · week of ${weekOfLabel}`}
            />
            {dueNext.length === 0 ? (
              <div style={{ padding: 16 }}>
                <StateNote>
                  Nothing with a dated deadline right now. Items appear here as they enter scope and are verified.
                </StateNote>
              </div>
            ) : (
              <>
                <ListRowColumnHeader dueLabel="Due" />
                {dueNext.map(({ r, due }) => (
                  <ListRow
                    key={r.id}
                    href={itemDetailHref(r)}
                    band={bandFromPriority(r.priority)}
                    jurisdiction={jurisdictionCode(r)}
                    title={r.title}
                    meta={metaLine(r)}
                    impact={r.impactScores}
                    due={{ label: due.label, days: `${due.days}` }}
                    timeline={r.timeline}
                    tier={r.sourceTier ?? null}
                  />
                ))}
                <CardFoot
                  left={<>All {formatNumber(immediateTotal)} immediate</>}
                  right={<>then {formatNumber(actionTotal)} action · {formatNumber(monitorTotal)} monitor</>}
                />
              </>
            )}
            {fetchError && (
              <div style={{ padding: 12 }}>
                <StateNote>{fetchError}</StateNote>
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
            {changed.length === 0 ? (
              <div style={{ padding: 16 }}>
                <StateNote>
                  Nothing added or updated in the last detection pass.
                </StateNote>
              </div>
            ) : (
              <>
                <ListRowColumnHeader dueLabel="Due" />
                {changed.map((c) => (
                  <ListRow
                    key={c.id}
                    href={c.href}
                    band={c.band}
                    jurisdiction=""
                    title={c.title}
                    meta={c.isNew ? "NEW · first seen this pass" : undefined}
                    impact={null}
                    due={null}
                    timeline={null}
                    tier={null}
                  />
                ))}
                <CardFoot
                  left={<>All {formatNumber(recentChanges.length)} changes in the last 7 days</>}
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
