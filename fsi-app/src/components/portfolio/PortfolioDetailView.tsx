"use client";

/**
 * PortfolioDetailView: /dashboard/portfolio/[id], one portfolio (lane S8-D, 2026-10-07; spec 00 section 5;
 * migration 362).
 *
 * WHAT IT SHOWS. The members grouped by the surface each one lives on (Regulations, Market Intel, Research,
 * Operations; corridors and other spine entities in their own group), every member drawn by the ONE ListRow
 * every list uses, and a rail of roll-ups computed at read time from held data only. Every aggregate carries
 * its denominator beside it (spec 00 section 8 assertion 13), the weakest origin class is shown and never
 * hidden (section 3.6, assertion 9), and members the platform no longer holds are named, counted in the
 * total and left out of every figure.
 *
 * NO NEW ROW PART. Item rows are ListRow (grade, tier and bias chips and the impact meter come with it);
 * corridor and entity rows are the same ListRow with the value cells left to the Absence convention, since
 * an entity has no band of its own. Entities link to /search, because the entity canonical page (assertion
 * 3) does not exist yet.
 *
 * Reader's goal: see what is in this portfolio and what needs attention first. Path: the page opens on the
 * roll-ups and the groups, most urgent date first inside each group. One primary action: Add (the search
 * card). Quieter actions: remove from a row's menu, rename and delete in the rail. Feedback: every request
 * shows its in-flight label, a failure shows an inline banner with the typed text kept, a delete asks first.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Masthead } from "@/components/ui/Masthead";
import { PageFrame } from "@/components/layout/PageFrame";
import { SectionCard } from "@/components/ui/SectionCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ListRow, ListRowColumnHeader } from "@/components/ui/ListRow";
import { RailCard } from "@/components/ui/RailCard";
import { StatBlock } from "@/components/ui/StatBlock";
import { StateNote } from "@/components/ui/StateNote";
import { CardFoot } from "@/components/ui/CardFoot";
import { Button } from "@/components/ui/Button";
import { InlineErrorBanner } from "@/components/ui/InlineErrorBanner";
import { PriorityDropdown } from "@/components/regulations/PriorityDropdown";
import { PortfolioAddSearch } from "@/components/portfolio/PortfolioAddSearch";
import { BAND_ORDER, bandFromPriority } from "@/lib/urgency/bands";
import { ORIGIN_CLASS } from "@/lib/contracts/vocabularies.mjs";
import { formatLocaleDate, countNoun } from "@/lib/format";
import { nowFrom } from "@/lib/render-now";
import { deletePortfolioRequest, removeMemberRequest, renamePortfolioRequest } from "@/lib/portfolio/client";
import type { PortfolioDetailView as DetailModel, PortfolioItemRow, PortfolioSurfaceKey } from "@/lib/portfolio/types";

const SURFACE_LABEL: Record<PortfolioSurfaceKey, string> = {
  regulations: "Regulations",
  market: "Market Intel",
  research: "Research",
  operations: "Operations",
};

const ENTITY_KIND_LABEL: Record<string, string> = {
  corridor: "Corridor",
  node: "Place",
  jurisdiction: "Jurisdiction",
  organisation: "Organisation",
  asset: "Vessel or asset",
  instrument: "Instrument",
  obligation: "Obligation",
  method: "Method",
  technology: "Technology",
  signpost: "Signpost",
  person: "Person",
};

const menuButtonStyle = {
  display: "flex",
  alignItems: "center",
  width: "100%",
  minHeight: 44,
  padding: "0 12px",
  background: "transparent",
  border: "none",
  fontSize: "var(--fs-13)",
  color: "var(--ink)",
  cursor: "pointer",
  textAlign: "left" as const,
};

export interface PortfolioDetailViewProps {
  view: DetailModel;
  nowIso?: string;
}

export function PortfolioDetailView({ view, nowIso }: PortfolioDetailViewProps) {
  const router = useRouter();
  const { portfolio, rollup, groups, entityRows } = view;
  const now = nowFrom(nowIso);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState(portfolio.name);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const allRows: PortfolioItemRow[] = groups.flatMap((g) => g.rows);
  const memberItemIds = allRows.map((r) => r.itemUuid);
  const nextDueRow = rollup.nextDue ? allRows.find((r) => r.itemUuid === rollup.nextDue?.itemId) : undefined;
  const notHeld = rollup.items.notHeld;

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>, after: () => void) {
    if (busy) return;
    setBusy(key);
    setError(null);
    const res = await fn();
    setBusy(null);
    if (!res.ok) {
      setError(res.error ?? "That did not go through. Try again.");
      return;
    }
    after();
  }

  const removeItem = (itemUuid: string) =>
    run(`rm:${itemUuid}`, () => removeMemberRequest(portfolio.id, { itemId: itemUuid }), () => router.refresh());
  const removeEntity = (entityId: string) =>
    run(`rm:${entityId}`, () => removeMemberRequest(portfolio.id, { entityId }), () => router.refresh());

  const removeMenu = (label: string, onRemove: () => void) => (
    <PriorityDropdown
      variant="card"
      showPriorityActions={false}
      ariaLabel={`Actions for ${label}`}
      menuTopContent={
        <button type="button" style={menuButtonStyle} onClick={onRemove} disabled={busy !== null}>
          Remove from portfolio
        </button>
      }
    />
  );

  const dek = (
    <span>
      <b style={{ color: "var(--ink)" }}>{rollup.items.held}</b> of {countNoun(rollup.items.members, "item")} held ·{" "}
      <b style={{ color: "var(--ink)" }}>{rollup.entities.corridors}</b> {rollup.entities.corridors === 1 ? "corridor" : "corridors"} ·{" "}
      <b style={{ color: "var(--ink)" }}>{rollup.entities.other}</b> {rollup.entities.other === 1 ? "entity" : "entities"}
    </span>
  );

  const bandCounts = BAND_ORDER.map((b) => ({ band: b, n: rollup.byPriority[b.priority] }));
  const heldCount = rollup.items.held;
  const weakest = rollup.origin.weakest ? (ORIGIN_CLASS as Record<string, { label: string }>)[rollup.origin.weakest] : null;

  return (
    <>
      <div style={{ padding: "20px 40px 0" }}>
        <Masthead
          title={portfolio.name}
          dateLabel={formatLocaleDate(now, { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}
          nowIso={nowIso}
          dek={dek}
        />
      </div>
      <PageFrame
        rail={
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <RailCard title="By surface">
              {(Object.keys(SURFACE_LABEL) as PortfolioSurfaceKey[]).map((k) => (
                <StatBlock key={k} layout="row" label={SURFACE_LABEL[k]} value={rollup.bySurface[k]} note={`of ${heldCount} held`} />
              ))}
            </RailCard>
            <RailCard title="By urgency">
              {bandCounts.map(({ band, n }) => (
                <StatBlock key={band.key} layout="row" label={`${band.label} · ${band.window}`} value={n} note={`of ${heldCount} held`} />
              ))}
              {rollup.byPriority.unscored > 0 && (
                <StatBlock layout="row" label="No band yet" value={rollup.byPriority.unscored} note={`of ${heldCount} held`} />
              )}
            </RailCard>
            <RailCard title="Held data">
              <StatBlock
                layout="row"
                label="Next date"
                value={rollup.nextDue ? `${rollup.nextDue.days}d` : "No date"}
                note={nextDueRow ? nextDueRow.title : rollup.nextDue ? undefined : "no held item carries a future date"}
              />
              <StatBlock
                layout="row"
                label="Weakest source class"
                value={weakest ? weakest.label : "No class"}
                note={
                  weakest
                    ? `${rollup.origin.classified} of ${heldCount} classified`
                    : heldCount === 0
                      ? "nothing held yet"
                      : `0 of ${heldCount} classified`
                }
              />
              {rollup.origin.unclassified > 0 && rollup.origin.classified > 0 && (
                <p style={{ fontSize: "var(--fs-11)", color: "var(--ink-3)", margin: "6px 0 0" }}>
                  {countNoun(rollup.origin.unclassified, "held item")} carry no class and are not counted in it.
                </p>
              )}
            </RailCard>
            <RailCard title="Manage">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run("rename", () => renamePortfolioRequest(portfolio.id, name.trim()), () => router.refresh());
                }}
                style={{ display: "flex", flexDirection: "column", gap: 8 }}
              >
                <label htmlFor="portfolio-rename" style={{ fontSize: "var(--fs-11)", color: "var(--ink-3)" }}>
                  Portfolio name
                </label>
                <input
                  id="portfolio-rename"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  style={{
                    minHeight: 44,
                    padding: "0 12px",
                    fontSize: "var(--fs-13)",
                    border: "1px solid var(--line-1)",
                    borderRadius: 6,
                    background: "var(--card)",
                    color: "var(--ink)",
                  }}
                />
                <Button type="submit" variant="secondary" disabled={busy !== null || name.trim().length === 0 || name.trim() === portfolio.name} style={{ minHeight: 44 }}>
                  {busy === "rename" ? "Saving..." : "Rename"}
                </Button>
              </form>
              <div style={{ marginTop: 12 }}>
                {confirmDelete ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <p style={{ fontSize: "var(--fs-12)", color: "var(--ink-2)", margin: 0, lineHeight: 1.45 }}>
                      Delete this portfolio for everyone in your workspace? The items, corridors and entities themselves stay where they are.
                    </p>
                    <Button
                      type="button"
                      variant="danger"
                      disabled={busy !== null}
                      style={{ minHeight: 44 }}
                      onClick={() => void run("delete", () => deletePortfolioRequest(portfolio.id), () => router.push("/dashboard/portfolio"))}
                    >
                      {busy === "delete" ? "Deleting..." : "Yes, delete portfolio"}
                    </Button>
                    <Button type="button" variant="ghost" disabled={busy !== null} style={{ minHeight: 44 }} onClick={() => setConfirmDelete(false)}>
                      Keep it
                    </Button>
                  </div>
                ) : (
                  <Button type="button" variant="ghost" style={{ minHeight: 44 }} onClick={() => setConfirmDelete(true)}>
                    Delete portfolio
                  </Button>
                )}
              </div>
            </RailCard>
          </div>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          {error && <InlineErrorBanner message={error} />}

          {notHeld.length > 0 && (
            <StateNote
              action={{
                label: busy?.startsWith("clear") ? "Removing..." : "Remove them",
                onClick: () => {
                  void (async () => {
                    setBusy("clear");
                    setError(null);
                    for (const id of notHeld) {
                      const res = await removeMemberRequest(portfolio.id, { itemId: id });
                      if (!res.ok) {
                        setError(res.error ?? "That did not go through. Try again.");
                        break;
                      }
                    }
                    setBusy(null);
                    router.refresh();
                  })();
                },
              }}
            >
              {countNoun(notHeld.length, "item")} in this portfolio {notHeld.length === 1 ? "is" : "are"} no longer held by the platform (archived or withdrawn). They are
              counted in the total and left out of every figure.
            </StateNote>
          )}

          {rollup.total === 0 && (
            <SectionCard>
              <SectionHeading title="Nothing here yet" aside="Add your first item below" />
              <div style={{ padding: "0 16px 16px" }}>
                <StateNote>
                  This portfolio is empty. Search below to add an item, or add an item, corridor or entity from the page that shows it.
                </StateNote>
              </div>
            </SectionCard>
          )}

          {groups.map((g) => (
            <SectionCard key={g.surface}>
              <SectionHeading title={`${SURFACE_LABEL[g.surface]} · ${g.rows.length}`} aside="Nearest date first" />
              <ListRowColumnHeader />
              {g.rows.map((r) => (
                <ListRow
                  key={r.itemUuid}
                  href={r.href}
                  band={bandFromPriority(r.priority)}
                  jurisdiction={r.jurisdiction}
                  title={r.title}
                  meta={r.meta}
                  impact={r.impact}
                  due={r.due}
                  timeline={r.timeline}
                  tier={r.tier}
                  biasTags={r.biasTags}
                  itemGrade={r.itemGrade}
                  overflow={removeMenu(r.title, () => void removeItem(r.itemUuid))}
                />
              ))}
              <CardFoot left={`${g.rows.length} of ${heldCount} held items in this portfolio`} right={null} />
            </SectionCard>
          ))}

          {entityRows.length > 0 && (
            <SectionCard>
              <SectionHeading title={`Corridors and entities · ${entityRows.length}`} aside="Spine entities" />
              <ListRowColumnHeader titleLabel="Name" />
              {entityRows.map((e) => (
                <ListRow
                  key={e.entityId}
                  href={`/search?q=${encodeURIComponent(e.label)}`}
                  band={bandFromPriority(null)}
                  jurisdiction={(ENTITY_KIND_LABEL[e.entityKind] ?? e.entityKind).slice(0, 5).toUpperCase()}
                  title={e.label}
                  meta={ENTITY_KIND_LABEL[e.entityKind] ?? e.entityKind}
                  impact={null}
                  due={null}
                  timeline={null}
                  tier={null}
                  overflow={removeMenu(e.label, () => void removeEntity(e.entityId))}
                />
              ))}
              <CardFoot left="Open an entity to search the platform for what it holds about it." right={null} />
            </SectionCard>
          )}
          {view.entitiesUnread > 0 && (
            <StateNote>
              {countNoun(view.entitiesUnread, "entity")} could not be read just now and {view.entitiesUnread === 1 ? "is" : "are"} not shown.
            </StateNote>
          )}

          <SectionCard>
            <SectionHeading title="Add to this portfolio" aside="Held items only" />
            <PortfolioAddSearch portfolioId={portfolio.id} memberItemIds={memberItemIds} />
          </SectionCard>
        </div>
      </PageFrame>
    </>
  );
}
