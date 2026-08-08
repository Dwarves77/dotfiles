"use client";

/**
 * DashboardTopPriority — the "This week" priority glance list (left column).
 *
 * Redesign TEMPLATE 01 (HANDOFF §6.3 + mock). One glance row per top-priority
 * item: severity eyebrow + jurisdiction tag (left) / deadline chip + tier chip
 * (right), title, then a LABELED-ANALYSIS line (epistemic grammar §3 — ink on
 * paper, caps label, never colored as fact) + suggested owner. Footer expander
 * links into Regulations filtered to the band.
 *
 * HONESTY (binding):
 *   - Every rendered value binds a REAL field. The analysis line renders the
 *     item's stored `whyMatters` under an "OUR ANALYSIS" label (labeled
 *     analysis, not a fabricated "do now" directive — no per-item do-now field
 *     exists yet; see DESIGN-DEVIATIONS.md). Owner renders `actionOwner` only
 *     when present.
 *   - Tier chip binds `sourceTier`, clamped 1–7 (DO-NOT-REVERT), suppressed
 *     when the field is absent — never a chip without its backing field.
 *   - An absent deadline renders an em-dash with a muted reason (§4), never a
 *     fabricated "In force".
 *   - Zero top-priority items renders the honest-state frame (§4).
 *   - When a personal order is applied, the sub-line SAYS so ("arranged by
 *     you") — the surface never silently asserts urgency order it is not
 *     actually showing.
 *
 * DRAG ORDER (operator ruling: drag arranges THE REGULATIONS on the dashboard
 * and the regulations page, never inside a regulation). This surface is the
 * dashboard half of the write path. It shares the /regulations contract
 * end-to-end: the same "regulations" list_key, the same useListOrder hook, the
 * same compareRanks/applyMove pair, the same reorder RPC (migrations 237 +
 * 238). A row dragged here is a row dragged on /regulations — one stored
 * order, two surfaces.
 *
 * Differences from the ledger, each deliberate:
 *   - ALWAYS-ON, not a sort mode. The ledger's four bands carry a
 *     platform-asserted meaning, so its custom order is opt-in. The glance
 *     list is a single band and the drag handle is the only ordering
 *     affordance on the dashboard; a mode toggle here would be a control with
 *     nothing to toggle against. The 6px pointer activation distance keeps a
 *     click a click.
 *   - Band-pool seed, not full-corpus seed. The dashboard payload is the
 *     LIMIT-50 priority slice, so a full-corpus seed cannot be built here.
 *     Ranks are only ever observed WITHIN a band (both surfaces stable-sort
 *     band pools), so seeding just this band's pool places exactly the rows
 *     whose relative order the drag asserts; rows outside the seed stay
 *     unplaced and follow the documented unplaced-first rule, self-resolving
 *     on their first drag.
 *   - No reset control. "Reset to default order" lives on /regulations, which
 *     owns the full arrangement surface; a second copy here would be a
 *     duplicate control for the same stored state.
 */

import Link from "next/link";
import { useMemo } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { useListOrder } from "@/lib/hooks/useListOrder";
import { applyMove, compareRanks } from "@/lib/list-order";
import type { Resource } from "@/types/resource";

/** The /regulations surface's list_key (LIST_KEYS in /api/user/list-order).
 *  Deliberately the SAME key: the ruling is one arrangement of the
 *  regulations, written from either surface, not a dashboard-private order. */
const REGULATIONS_LIST_KEY = "regulations" as const;

interface DashboardTopPriorityProps {
  resources: Resource[];
  /** Workspace jurisdiction total for the sub-line (true total, not row-derived). */
  jurisdictionsCount: number;
}

const SHOWN_CAP = 5;

type Band = "CRITICAL" | "HIGH";

const SEV_COLOR: Record<Band, string> = {
  CRITICAL: "var(--reg-band-immediate)",
  HIGH: "var(--reg-band-action)",
};

// Priority-derived eyebrow. The mock's per-item flavour labels ("Window
// closing", "Cost alert") have no backing field; a priority-derived label is
// the honest equivalent. See DESIGN-DEVIATIONS.md.
const SEV_EYEBROW: Record<Band, string> = {
  CRITICAL: "Action required",
  HIGH: "High priority",
};

function clampTier(tier: number): number {
  return Math.max(1, Math.min(7, Math.round(tier)));
}

function jurTag(r: Resource): string {
  const iso = r.jurisdictionIso?.[0];
  if (iso) return iso.toUpperCase();
  if (r.jurisdiction) return r.jurisdiction.toUpperCase();
  return "GLOBAL";
}

/** Nearest future deadline label + whether one exists.
 *  V-07 (2026-07-11): compute "today" and parse date-only deadlines in UTC so the SSR render and
 *  the client hydration agree on the day-count (local-midnight math varied by the viewer's
 *  timezone → React #418). UTC is deterministic across server and client; the only residual
 *  divergence is a sub-second render straddling UTC midnight, which is negligible. */
function deadlineLabel(r: Resource): string | null {
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const candidates: string[] = [];
  if (r.complianceDeadline) candidates.push(r.complianceDeadline);
  if (r.timeline) for (const t of r.timeline) if (t.date) candidates.push(t.date);
  let best: number | null = null;
  for (const raw of candidates) {
    const d = new Date(raw + (raw.length === 10 ? "T00:00:00Z" : ""));
    const ms = d.getTime();
    if (Number.isNaN(ms)) continue;
    if (ms < today) continue;
    if (best === null || ms < best) best = ms;
  }
  if (best === null) return null;
  const diff = Math.round((best - today) / 86400000);
  if (diff <= 365) return `${diff} day${diff === 1 ? "" : "s"}`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(best);
}

export function DashboardTopPriority({
  resources,
  jurisdictionsCount,
}: DashboardTopPriorityProps) {
  // Personal drag order, shared with /regulations. Fails soft to the urgency
  // sort: a signed-out viewer, a fetch failure, and a user who has never
  // dragged anything all see the platform's own order.
  const { ranks, hasOrder, move: moveInOrder, error: orderError } =
    useListOrder(REGULATIONS_LIST_KEY);

  const { pool, shown, band, totalInBand } = useMemo(() => {
    const critical = resources.filter((r) => r.priority === "CRITICAL");
    const high = resources.filter((r) => r.priority === "HIGH");
    const activeBand: Band = critical.length > 0 ? "CRITICAL" : "HIGH";
    const bandRows = activeBand === "CRITICAL" ? critical : high;
    // The platform's own order first (urgency desc, title tiebreak) …
    const sorted = bandRows.slice().sort((a, b) => {
      const ua = a.urgencyScore ?? 0;
      const ub = b.urgencyScore ?? 0;
      if (ub !== ua) return ub - ua;
      return a.title.localeCompare(b.title);
    });
    // … then the personal layer as a STABLE re-sort, exactly as the ledger
    // applies it: placed rows follow the stored order, unplaced rows keep the
    // urgency order and sort first (compareRanks owns that rule and why).
    if (ranks.size > 0) {
      sorted.sort((a, b) => compareRanks(ranks.get(a.id), ranks.get(b.id)));
    }
    return {
      pool: sorted,
      shown: sorted.slice(0, SHOWN_CAP),
      band: activeBand,
      totalInBand: bandRows.length,
    };
  }, [resources, ranks]);

  // A drop's neighbours come from the FULL band pool, not the visible slice:
  // the shown five are a PREFIX of the pool, so a drop onto the last visible
  // slot still has a real successor (row six) and placing above it is what
  // keeps the stored order aligned with what /regulations renders. Same
  // truncation reasoning as the ledger's collapsed bands (see applyMove).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = pool.findIndex((r) => r.id === active.id);
    const to = pool.findIndex((r) => r.id === over.id);
    if (from < 0 || to < 0) return;
    const { items, prevIndex, nextIndex } = applyMove(pool, from, to);
    await moveInOrder({
      itemId: String(active.id),
      prevItemId: items[prevIndex]?.id ?? null,
      nextItemId: items[nextIndex]?.id ?? null,
      // Seed = this band's pool in the order the user was looking at (the
      // move itself is NOT baked in — the RPC seeds first, then places). See
      // the header for why the seed is band-scoped on this surface.
      seedItemIds: pool.map((r) => r.id),
    });
  };

  const headingId = "priority";

  if (shown.length === 0) {
    // Honest-state frame (§4): no top-priority items right now.
    return (
      <div style={{ minWidth: 0 }}>
        <h3 id={headingId} style={{ fontSize: 15, fontWeight: 800, margin: "0 0 12px" }}>
          Top priority this week
        </h3>
        <div
          style={{
            border: "1px dashed rgba(0,0,0,0.25)",
            borderRadius: 8,
            background: "var(--color-bg-base)",
            padding: "16px 18px",
          }}
        >
          <p
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--brass)",
              margin: "0 0 6px",
            }}
          >
            Nothing critical this week
          </p>
          <p style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.55, margin: 0 }}>
            No critical or high-priority items are open right now. New items appear here as they
            enter scope and are verified.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          margin: "0 0 12px",
          gap: 12,
        }}
      >
        <h3 id={headingId} style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>
          Top priority this week — {shown.length} item{shown.length === 1 ? "" : "s"}
        </h3>
        <span style={{ fontSize: 11.5, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
          across {jurisdictionsCount} jurisdiction{jurisdictionsCount === 1 ? "" : "s"}
          {/* The sub-line states what the order actually is (same honesty rule
              as the ledger strap): once a stored rank can reorder these rows,
              claiming pure urgency order would be untrue. */}
          {hasOrder ? " · arranged by you" : ""}
        </span>
      </div>

      {orderError && (
        <p
          role="status"
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "var(--reg-band-immediate)",
            margin: "0 0 10px",
          }}
        >
          {orderError}
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={shown.map((r) => r.id)} strategy={verticalListSortingStrategy}>
            {shown.map((r) => (
              <SortablePriorityRow key={r.id} r={r} band={band} />
            ))}
          </SortableContext>
        </DndContext>

        <Link
          href={`/regulations?priority=${band}`}
          prefetch={false}
          style={{
            textDecoration: "none",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 18px",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            background: "var(--color-bg-surface)",
            gap: 12,
          }}
        >
          <span style={{ fontSize: 12.5, fontWeight: 800, color: "var(--color-primary)" }}>
            All {totalInBand} priority item{totalInBand === 1 ? "" : "s"} →
          </span>
          <span style={{ fontSize: 11, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
            opens Regulations, filtered to {band === "CRITICAL" ? "Immediate" : "High"}
          </span>
        </Link>
      </div>
    </div>
  );
}

// ── Row components ───────────────────────────────────────────────────────
// One markup definition, wrapped by the sortable — the ledger's RegRow /
// SortableRegRow shape. A second hand-written copy of the glance row for the
// drag path would be free to drift from the one the default render uses.
function PriorityRow({ r, band }: { r: Resource; band: Band }) {
  const sevColor = SEV_COLOR[band];
  const tier = r.sourceTier != null ? clampTier(r.sourceTier) : null;
  const deadline = deadlineLabel(r);
  const analysis = r.whyMatters?.trim();
  return (
    <Link
      href={`/regulations/${r.id}`}
      prefetch={false}
      style={{
        textDecoration: "none",
        color: "inherit",
        display: "block",
        background: "var(--color-bg-surface)",
        border: "1px solid var(--color-border)",
        borderLeft: `3px solid ${sevColor}`,
        borderRadius: 8,
        padding: "14px 18px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.09em",
              textTransform: "uppercase",
              color: sevColor,
              whiteSpace: "nowrap",
            }}
          >
            {SEV_EYEBROW[band]}
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.09em",
              color: "var(--brass)",
              whiteSpace: "nowrap",
            }}
          >
            {jurTag(r)}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, whiteSpace: "nowrap" }}>
          {deadline ? (
            <span style={{ fontSize: 12, fontWeight: 800, color: sevColor }}>{deadline}</span>
          ) : (
            <span
              title="No dated deadline on record"
              style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-muted)" }}
            >
              — no date
            </span>
          )}
          {tier != null && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                padding: "2px 7px",
                borderRadius: 4,
                background: "var(--accent-blue)",
                color: "#FFFFFF",
              }}
            >
              T{tier}
            </span>
          )}
        </div>
      </div>
      <p style={{ fontSize: 15, fontWeight: 800, margin: "5px 0 0" }}>{r.title}</p>
      {analysis && (
        <p
          style={{
            fontSize: 12.5,
            lineHeight: 1.55,
            color: "var(--color-text-primary)",
            margin: "7px 0 0",
            borderLeft: "3px solid var(--color-text-primary)",
            padding: "1px 0 1px 10px",
          }}
        >
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 800,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--color-text-primary)",
              display: "block",
              margin: "0 0 2px",
            }}
          >
            Our analysis
          </span>
          {analysis}
          {r.actionOwner && (
            <span style={{ color: "var(--color-text-muted)" }}> Owner: {r.actionOwner}.</span>
          )}
        </p>
      )}
    </Link>
  );
}

// The glance row with its drag handle. THE HANDLE IS OUTSIDE THE LINK — same
// reasoning as the ledger's SortableRegRow: drag listeners on a navigation
// target would turn every click into a drag-start, and a real <button>
// activator is what makes the keyboard path work (tabbable; dnd-kit's keyboard
// sensor drives it with the arrow keys).
function SortablePriorityRow({ r, band }: { r: Resource; band: Band }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: r.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        display: "grid",
        gridTemplateColumns: "26px 1fr",
        alignItems: "stretch",
        transform: CSS.Transform.toString(transform),
        transition,
        // The dragged row paints above its neighbours or it slides underneath
        // the rows it is passing.
        position: "relative",
        zIndex: isDragging ? 2 : undefined,
        opacity: isDragging ? 0.85 : undefined,
      }}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${r.title}`}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: 0,
          border: "none",
          background: "transparent",
          color: "var(--color-text-muted)",
          cursor: isDragging ? "grabbing" : "grab",
          // Without this the browser claims the gesture for scrolling and a
          // touch drag never reaches dnd-kit.
          touchAction: "none",
        }}
      >
        <GripVertical size={14} aria-hidden="true" />
      </button>
      <PriorityRow r={r} band={band} />
    </div>
  );
}
