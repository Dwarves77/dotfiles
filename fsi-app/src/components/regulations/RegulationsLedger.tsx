"use client";

/**
 * RegulationsLedger — the redesigned /regulations index (Redesign TEMPLATE 02,
 * the archetype for all index pages). Replaces the priority kanban.
 *
 * Shape (HANDOFF §6.1): severity tiles (clickable filters, Anton count,
 * colored bottom rule) → Ask bar → search + sort segment + Filters → a
 * BANDED LEDGER (one card per severity band: 4px gradient strip, tinted head
 * row with count, item rows = jurisdiction tag / title / meta / tier chip,
 * "All N {band} →" expander, next-band footer).
 *
 * COUNTS (binding): tile + band-header + header totals read the RPC bundle
 * (get_surface_counts via getSurfaceCounts, migration 148/#173), which is
 * verified-gated and fails soft to row-derived counts when the RPC is absent
 * (migrations 148/149 not applied yet). Counts are NEVER recomputed from the
 * capped/visible rows and the mock's snapshot numbers are NEVER hard-coded.
 * When a filter/search narrows the visible set, an explicit "X shown"
 * disclosure sits beside the authoritative band total (it does not replace it).
 *
 * HONEST STATE (HANDOFF §4): an absent next-date renders as an em-dash with a
 * muted reason; filters that can yield zero always render a "Clear filters"
 * recovery. Tier chips bind to a real field (sourceTier), clamped 1–7, and
 * suppress themselves when the field is absent — never a chip without backing.
 * Non-verified items never reach this surface (the listings RPC gates
 * provenance_status='verified' server-side).
 *
 * Kanban is dead — this surface does not reintroduce it.
 */

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
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
import { useResourceStore, mergeWithOverrides } from "@/stores/resourceStore";
import { formatMilestoneChip } from "@/components/regulations/format-fixed-date";
import { usePersonalStateHydration } from "@/lib/hooks/usePersonalState";
import { useListOrder } from "@/lib/hooks/useListOrder";
import { applyMove, compareRanks } from "@/lib/list-order";
import { PriorityDropdown } from "@/components/regulations/PriorityDropdown";
import { bandEmptyState } from "@/components/regulations/band-empty-state";
import {
  MODES,
  TOPICS,
  PRIORITIES,
  type PriorityKey,
} from "@/lib/constants";
import { TIER1_PRIORITY_ISOS } from "@/lib/tier1-priority-jurisdictions";
import { REGULATIONS_DOMAIN } from "@/lib/domains";
import { DismissedStash } from "./DismissedStash";
import { ArchiveDialog } from "@/components/workspace/ArchiveDialog";
import { RecordGradeBadge } from "@/components/shell/RecordGradeBadge";
import type { Resource } from "@/types/resource";
import type { WorkspaceAggregates } from "@/lib/data";
// PERF-12 (2026-09-04, ADR-027 §2): LIST_FIRST_PAGE_SIZE / the old fetch-the-rest mechanism
// (LIST_REMAINDER_LIMIT, /api/listings/rest) are gone — see useLedgerInfiniteQuery.ts and
// list-pagination.ts's own headers for the replacement (useInfiniteQuery + a keyset cursor).
import { useLedgerInfiniteQuery, type LedgerPage } from "@/lib/hooks/useLedgerInfiniteQuery";
import { useInfiniteScrollSentinel } from "@/lib/hooks/useInfiniteScrollSentinel";
import { VirtualizedRowList } from "@/components/ledger/VirtualizedRowList";

interface RegulationsLedgerProps {
  initialResources: Resource[];
  initialArchived: Resource[];
  initialOverrides?: {
    itemId: string;
    priorityOverride: string | null;
    isArchived: boolean;
    archiveReason: string | null;
    archiveNote: string | null;
    notes: string;
    dismissedAt?: string | null;
    // Phase 1 ownership (migration 234)
    ownerUserId?: string | null;
    ownerName?: string | null;
  }[];
  /** Verified-population count bundle from getSurfaceCounts('regulations').
   *  totalItems === 0 signals the fail-soft path (RPC absent / empty), in
   *  which case the ledger derives counts from the loaded verified rows. */
  aggregates: WorkspaceAggregates;
  /** Deep-link priority filter from ?priority=CRITICAL etc.
   *  PERF-10 (2026-09-04, root-cause fix, ADR-026 Follow-up): regulations/page.tsx no longer reads
   *  `searchParams` at all — that read was itself a Dynamic API, forcing `ƒ` (Dynamic) independent of
   *  every other fix in this lane. This prop now defaults to null in production (kept for any other
   *  caller / test harness that wants to seed it directly); the real deep-link value is read
   *  CLIENT-SIDE via useSearchParams() inside this component (see the SearchParamsFilterBridge sub-
   *  component below and its Suspense wrapper in the render tree) — the officially-recommended Next.js
   *  pattern for keeping a page statically generated while a small piece of it still needs the URL's
   *  query string: only the tiny bridge component suspends, never the whole ledger. */
  initialPriorityFilter?: string | null;
  /** Deep-link Tier-1 ISO region filter from ?region=us-ca etc. See initialPriorityFilter's doc above
   *  for why this is now resolved client-side via the search-params bridge, not a server prop. */
  initialRegionFilter?: string | null;
  /** Deep-link owner filter from ?owner=<display name> (DashboardByOwner
   *  links; Phase 1 ownership). Matched case-insensitively against the
   *  merged actionOwner. See initialPriorityFilter's doc above for why this is now resolved
   *  client-side via the search-params bridge, not a server prop. */
  initialOwnerFilter?: string | null;
  /**
   * PERF-12 (2026-09-04, ADR-027 §2): the cursor for the page AFTER the SSR first page, and
   * whether one exists — computed server-side (regulations/page.tsx) with the SAME
   * `cursorAfter`/hasMore math /api/listings/cursor's own route uses, so the seeded
   * useLedgerInfiniteQuery cache entry and a real fetch of the "next" page always agree on where
   * "next" starts. `null`/`false` when the SSR first page already covers the whole corpus.
   */
  initialNextCursor?: string | null;
  initialHasMore?: boolean;
}

/** PERF-10 (2026-09-04): reads the URL's ?priority=/?region=/?owner= deep-link params CLIENT-SIDE and
 *  reports them once, on mount, to the parent's filter state. Isolated into its own component (rather
 *  than calling useSearchParams() directly inside RegulationsLedger) so ONLY this tiny, render-nothing
 *  piece needs the <Suspense> boundary Next.js requires around useSearchParams() during static
 *  generation — the ledger's actual content (rows, tiles, bands) renders immediately, unblocked, using
 *  its own default (no-filter) state until this bridge's effect fires. Mirrors the same "apply once,
 *  never clobber a real user action" discipline as NotesField's override-hydration effect
 *  (MarketSignalDetailSurface.tsx) — appliedRef guards a StrictMode double-invoke and a HMR remount
 *  from re-applying the deep link after the viewer has already changed a filter by hand. */
function SearchParamsFilterBridge({
  onParams,
}: {
  onParams: (params: { priority: string | null; region: string | null; owner: string | null }) => void;
}) {
  const searchParams = useSearchParams();
  const appliedRef = useRef(false);
  useEffect(() => {
    if (appliedRef.current) return;
    appliedRef.current = true;
    onParams({
      priority: searchParams.get("priority"),
      region: searchParams.get("region"),
      owner: searchParams.get("owner"),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  return null;
}

type BandKey = PriorityKey;

interface BandDef {
  key: BandKey;
  anchor: string;
  label: string;
  sub: string;
  hueVar: string;
  bgVar: string;
  stripVar: string;
}

// Priority → band. Labels/subs/hues/tints lifted from the "Pages - 02
// Regulations" mock; the exact hex live as tokens in theme.css.
const BANDS: BandDef[] = [
  {
    key: "CRITICAL",
    anchor: "band-immediate",
    label: "Immediate",
    sub: "critical, within 90 days",
    hueVar: "var(--reg-band-immediate)",
    bgVar: "var(--reg-band-immediate-bg)",
    stripVar: "var(--reg-band-immediate-strip)",
  },
  {
    key: "HIGH",
    anchor: "band-action",
    label: "Action",
    sub: "material impact, within 6 months",
    hueVar: "var(--reg-band-action)",
    bgVar: "var(--reg-band-action-bg)",
    stripVar: "var(--reg-band-action-strip)",
  },
  {
    key: "MODERATE",
    anchor: "band-monitor",
    label: "Monitor",
    sub: "6 to 12 months out",
    hueVar: "var(--reg-band-monitor)",
    bgVar: "var(--reg-band-monitor-bg)",
    stripVar: "var(--reg-band-monitor-strip)",
  },
  {
    key: "LOW",
    anchor: "band-awareness",
    label: "Awareness",
    sub: "background only",
    hueVar: "var(--reg-band-awareness)",
    bgVar: "var(--reg-band-awareness-bg)",
    stripVar: "var(--reg-band-awareness-strip)",
  },
];

// "custom" is the caller's own drag order (migrations 237 + 238). It is a SORT
// MODE rather than an always-on affordance because the four bands each carry a
// meaning the platform asserts (next deadline within a severity band); a
// personal arrangement has to be something the user opts into and can leave,
// not a state the surface can be knocked into by a stray drag.
type SortKey = "newest" | "priority" | "az" | "custom";
const ROWS_COLLAPSED = 5;
/** RegRow's real rendered height in px — see list-pagination.ts's LIST_PAGE_SIZE header for the
 *  same derivation this constant is lifted from (kept here, not imported, since it's a markup fact
 *  about THIS component's own row, not a pagination constant). Feeds VirtualizedRowList's initial
 *  layout estimate; the virtualizer re-measures the real height per row after mount. */
const ROW_HEIGHT_PX = 44;

/** list_key this surface owns in user_list_order. In LIST_KEYS in the route. */
const REGULATIONS_LIST_KEY = "regulations" as const;

const ASK_CHIPS = [
  "What's due in 30 days?",
  "What changed this week?",
  "CBAM obligations Q2",
];

/** Parse a loosely-formatted date string; null when unparseable. */
function parseDate(s?: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Nearest upcoming milestone date for a row (from item_timelines), or null. `now === null`
 *  (pre-mount, see the `now` state's own header) means "no reference time yet" — every timeline
 *  entry is untestable against "is this upcoming", so this returns null exactly as it would for a
 *  row with no timeline at all, deterministically, on both SSR and the client's matching first
 *  render. */
function nextMilestone(r: Resource, now: number | null): Date | null {
  if (now === null) return null;
  if (!r.timeline || r.timeline.length === 0) return null;
  let best: Date | null = null;
  for (const t of r.timeline) {
    const d = parseDate(t.date);
    if (!d) continue;
    if (d.getTime() < now) continue;
    if (best === null || d.getTime() < best.getTime()) best = d;
  }
  return best;
}

/** Tier badge clamp 1–7 (DO-NOT-REVERT: no raw tier values render). */
function clampTier(tier: number): number {
  return Math.max(1, Math.min(7, Math.round(tier)));
}

/** Short jurisdiction tag for the row (uppercase code, e.g. EU / US-NC). */
function jurTag(r: Resource): string {
  const iso = r.jurisdictionIso?.[0];
  if (iso) return iso.toUpperCase();
  if (r.jurisdiction) return r.jurisdiction.toUpperCase();
  return "GLOBAL";
}

/** Keep the first occurrence of each id (pure). */
function dedupeById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

export function RegulationsLedger({
  initialResources,
  initialArchived,
  initialOverrides = [],
  aggregates,
  initialPriorityFilter = null,
  initialRegionFilter = null,
  initialOwnerFilter = null,
  initialNextCursor = null,
  initialHasMore = false,
}: RegulationsLedgerProps) {
  const { resources: platformResources, setResources, setArchived, overrides, setOverrides, restoreDismissed, personalState } =
    useResourceStore();

  // ── Filter state ────────────────────────────────────────────────────
  // Empty set == "all" (no filter). Non-empty == "only these".
  const initialPrioritySet = useMemo<Set<string>>(() => {
    const upper = (initialPriorityFilter || "").toUpperCase();
    return PRIORITIES.includes(upper as PriorityKey) ? new Set([upper]) : new Set();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const initialRegionIsoSet = useMemo<Set<string>>(() => {
    const upper = (initialRegionFilter || "").trim().toUpperCase();
    return upper && TIER1_PRIORITY_ISOS.has(upper) ? new Set([upper]) : new Set();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [search, setSearch] = useState("");
  // Phase 1 ownership: ?owner= deep link (DashboardByOwner). Cleared via its
  // chip in the facet bar or Clear filters.
  const [ownerFilter, setOwnerFilter] = useState<string | null>(
    () => (initialOwnerFilter || "").trim() || null
  );
  const [activePriorities, setActivePriorities] = useState<Set<string>>(initialPrioritySet);
  const [activeModes, setActiveModes] = useState<Set<string>>(new Set());
  const [activeTopics, setActiveTopics] = useState<Set<string>>(new Set());
  const [activeRegionIsos, setActiveRegionIsos] = useState<Set<string>>(initialRegionIsoSet);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sort, setSort] = useState<SortKey>("priority");
  const [openBands, setOpenBands] = useState<Record<string, boolean>>({});
  // Dual-scope archive (migration 235): the row the ArchiveDialog is open for.
  // Held here rather than per-row because the dialog must render outside the
  // row <Link> (see CardPriorityDropdown).
  const [archiveTarget, setArchiveTarget] = useState<{ id: string; title: string } | null>(null);

  // PERF-10 (2026-09-04): applies the client-resolved ?priority=/?region=/?owner= deep-link params
  // (see SearchParamsFilterBridge's own header above) exactly once, the same validation each value
  // already got when it arrived as a server prop — an invalid/unrecognized value is silently ignored
  // rather than clearing an already-active filter.
  const handleFilterParams = useCallback(
    (params: { priority: string | null; region: string | null; owner: string | null }) => {
      const upperPriority = (params.priority || "").toUpperCase();
      if (PRIORITIES.includes(upperPriority as PriorityKey)) {
        setActivePriorities(new Set([upperPriority]));
      }
      const upperRegion = (params.region || "").trim().toUpperCase();
      if (upperRegion && TIER1_PRIORITY_ISOS.has(upperRegion)) {
        setActiveRegionIsos(new Set([upperRegion]));
      }
      const trimmedOwner = (params.owner || "").trim();
      if (trimmedOwner) {
        setOwnerFilter(trimmedOwner);
      }
    },
    []
  );

  // ── Cursor pagination (ADR-027 §2) ─────────────────────────────────────
  // The server renders the first LIST_PAGE_SIZE rows (list-pagination.ts's own "one screen"
  // derivation); everything after that arrives PAGE-AT-A-TIME via useInfiniteQuery's
  // `fetchNextPage`, triggered by scroll proximity to the end (useInfiniteScrollSentinel, below),
  // not one background fetch of the whole remainder — see useLedgerInfiniteQuery.ts's own header
  // for why LIST_REMAINDER_LIMIT/the old one-shot mechanism is gone, not merely unused.
  const initialPage: LedgerPage = useMemo(
    () => ({
      resources: initialResources,
      archived: initialArchived,
      nextCursor: initialNextCursor,
      hasMore: initialHasMore,
    }),
    // Stable across re-renders in practice (server-provided props, set once on mount) — an
    // eslint-exhaustive dep here would re-seed `initialData` on every parent re-render, which
    // TanStack Query's own initialData contract does not expect mid-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  // RECONCILE (2026-09-04, item 1): no orgId to forward — /api/listings/cursor now serves the
  // org-independent public RPC (see that route's own header), so there is nothing here to resolve
  // or verify against a session. See useLedgerInfiniteQuery.ts's own header for the removed
  // X-Org-Id mechanism.
  const {
    resources: pagedResources,
    archived: pagedArchived,
    status: queryStatus,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error: queryError,
    isFetchNextPageError,
  } = useLedgerInfiniteQuery("regulations", initialPage);

  // PERF-13 (2026-09-04, docs/audits/perf-clickthrough-2026-09-04.md §(g)): the ledger-wide
  // `restStatus` this used to compute (a single "loading"/"done"/"error" value fed identically to
  // every band) is GONE — see band-empty-state.ts's own header for why: it could not tell "a fetch
  // is happening right now" from "the cursor stream merely isn't exhausted yet", which is what let
  // the Awareness band claim "Loading 169 regulations…" indefinitely with no request ever in flight
  // for it. Each band now calls `bandEmptyState` directly with the raw flags (below, at the band
  // render site) instead of through this pre-collapsed value.
  const initialLoadPending = queryStatus === "pending";

  // ── Hydrate the shared resource store (applies workspace overrides) ──
  useEffect(() => {
    // Dedupe by id (2026-09-03, kept under cursor pagination as a defensive backstop): the RPC's
    // own total order + keyset cursor make an overlap between pages impossible in principle, this
    // keeps a stale client from ever rendering one item twice if a page were re-fetched across a
    // deploy that changed the order mid-session.
    setResources(dedupeById(pagedResources));
    setArchived(dedupeById(pagedArchived));
    if (initialOverrides.length > 0) setOverrides(initialOverrides);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagedResources, pagedArchived]);

  // Scroll-near-the-end trigger (ADR-027 §2: "fetchNextPage on scroll near the end via
  // IntersectionObserver or the virtualizer's range"). A single sentinel at the foot of the whole
  // ledger — simpler and just as effective as a per-band trigger, since the RPC's own total order
  // means only the LAST band with any loaded rows can possibly have more to fetch next.
  const sentinelRef = useInfiniteScrollSentinel(fetchNextPage, hasNextPage && !isFetchingNextPage);

  // Personal archive layer (migration 235). The override layer above arrives
  // with the SSR payload; user_item_state is per-user so it is fetched here.
  usePersonalStateHydration();

  const effectiveResources =
    platformResources.length > 0 ? platformResources : initialResources;
  const { active, dismissed } = useMemo(
    () => mergeWithOverrides(effectiveResources, overrides, personalState),
    [effectiveResources, overrides, personalState]
  );
  // Dismissed regulations surface in the DismissedStash drawer at the bottom (restore path).
  // The Template-02 rebuild dropped this drawer; without it a dismissed item — e.g. a CRITICAL
  // regulation dismissed by accident from the detail-page priority dropdown — vanished from
  // /regulations with NO recovery. The stash + restoreDismissed both already existed (the old
  // kanban surface mounted them); this re-mounts the recovery path.
  const dismissedRegulations = useMemo(
    () => dismissed.filter((r) => r.domain === REGULATIONS_DOMAIN),
    [dismissed]
  );
  const regulatory = useMemo(
    () => active.filter((r) => r.domain === REGULATIONS_DOMAIN),
    [active]
  );

  // RECONCILE (2026-09-04, item 4b-iii): fixes a hydration hazard `useState(() => Date.now())`
  // introduced. That initializer runs once on EVERY first render, server AND client — under the
  // classic (non-PPR) model those are two SEPARATE invocations, at two different real times, and
  // this page is now server-CACHED (unstable_cache, 60s revalidate — PERF-10's whole point): the SSR
  // HTML a client hydrates against can legitimately be up to a minute-plus old by the time hydration
  // runs, so the server's `Date.now()` and the client's would routinely disagree by far more than
  // clock skew, silently corrupting the milestone "days until"/red-highlight math (nextMilestone/
  // RegRow below) on every cache-stale hydration, not merely at rare millisecond boundaries. Baking a
  // server-computed timestamp into the cached HTML would not fix this either — it would freeze `now`
  // at cache-build time for the whole revalidate window, growing MORE wrong the staler the cache
  // entry gets. The correct fix (this lane's own dispatch, item 4b-iii): render this specific
  // countdown client-only, AFTER mount. `now` starts `null` — IDENTICAL on the server render and the
  // client's matching first (hydration) render, so there is no mismatch to react to — then one
  // `useEffect` (fires client-only, post-hydration) sets the real wall-clock value, producing a
  // single, ordinary post-hydration re-render exactly like any other client-only affordance (the
  // personal drag order below has the same "empty on first render, filled after a client effect"
  // shape). `nextMilestone(r, null)` returns null (its own header), so every `now`-derived value
  // (sort order, days-until, the red-deadline highlight) renders in its safe "no milestone data yet"
  // state until that effect fires, on both server and client alike.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
  }, []);

  // Personal drag order (migrations 237 + 238). Per-user and fetched
  // client-side for the same reason the personal archive is: user_list_order is
  // keyed by user, the surface's SSR payload is org-scoped. Fails soft to no
  // order at all, which reads as the default surface.
  const {
    ranks,
    hasOrder,
    move: moveInOrder,
    reset: resetOrder,
    error: orderError,
  } = useListOrder(REGULATIONS_LIST_KEY);
  const customMode = sort === "custom";

  // ── Counts (RPC-sourced, fail-soft) ─────────────────────────────────
  const rpcOk = aggregates.totalItems > 0;
  const rowBandCount = (key: BandKey) =>
    regulatory.filter((r) => r.priority === key).length;
  const bandCount = (key: BandKey): number =>
    rpcOk ? aggregates.byPriority[key] : rowBandCount(key);
  const headerTotal = rpcOk ? aggregates.totalItems : regulatory.length;
  const sumBands =
    bandCount("CRITICAL") + bandCount("HIGH") + bandCount("MODERATE") + bandCount("LOW");

  // ── Facet vocab present in the loaded corpus (labels only; no RPC exists
  //    for a mode/topic distribution, so no numeric counts are shown here
  //    — a count must trace to the RPC, never to the visible rows) ───────
  const presentModes = useMemo(() => {
    const s = new Set<string>();
    for (const r of regulatory) for (const m of r.modes || []) s.add(m);
    return MODES.filter((m) => s.has(m.id));
  }, [regulatory]);
  const presentTopics = useMemo(() => {
    const s = new Set<string>();
    for (const r of regulatory) if (r.topic) s.add(r.topic);
    return TOPICS.filter((t) => s.has(t.id));
  }, [regulatory]);

  // ── Row filter predicate (search + mode + topic + region) ────────────
  const matchesFilters = (r: Resource): boolean => {
    if (ownerFilter && (r.actionOwner || "").toLowerCase() !== ownerFilter.toLowerCase()) return false;
    if (activeModes.size > 0 && !(r.modes || []).some((m) => activeModes.has(m))) return false;
    if (activeTopics.size > 0 && !(r.topic && activeTopics.has(r.topic))) return false;
    if (activeRegionIsos.size > 0) {
      const isos = (r.jurisdictionIso || []).map((c) => c.toUpperCase());
      if (!isos.some((c) => activeRegionIsos.has(c))) return false;
    }
    const q = search.trim().toLowerCase();
    if (q) {
      const hay = [
        r.title,
        r.jurisdiction || "",
        (r.tags || []).join(" "),
        r.whatIsIt || "",
        r.whyMatters || "",
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  };

  // The platform's own order, with no personal layer applied. Custom mode uses
  // this as its base so a list that has never been dragged looks exactly like
  // the default surface rather than like a random shuffle, and so the seed sent
  // on the first drag is the order the user was actually looking at.
  const sortRowsBase = (rows: Resource[]): Resource[] => {
    const copy = [...rows];
    if (sort === "az") {
      copy.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sort === "newest") {
      copy.sort(
        (a, b) => (parseDate(b.added)?.getTime() ?? 0) - (parseDate(a.added)?.getTime() ?? 0)
      );
    } else {
      // priority (default, and the base under custom): within a band all rows
      // share a priority, so order by next deadline ascending, undated last.
      copy.sort((a, b) => {
        const da = nextMilestone(a, now)?.getTime() ?? Infinity;
        const db = nextMilestone(b, now)?.getTime() ?? Infinity;
        if (da !== db) return da - db;
        return a.title.localeCompare(b.title);
      });
    }
    return copy;
  };

  const sortRows = (rows: Resource[]): Resource[] => {
    const copy = sortRowsBase(rows);
    // Stable sort over the base order, so rows the user has never placed hold
    // their platform order instead of scattering. compareRanks owns the
    // unplaced-first rule and its reasoning; it is shared with the server
    // reader so an SSR order and an optimistic order cannot disagree.
    if (customMode && ranks.size > 0) {
      copy.sort((a, b) => compareRanks(ranks.get(a.id), ranks.get(b.id)));
    }
    return copy;
  };

  const isPriorityIncluded = (key: BandKey) =>
    activePriorities.size === 0 || activePriorities.has(key);

  // Filtered rows per band.
  const bandRows = useMemo(() => {
    const map: Record<string, Resource[]> = {};
    for (const b of BANDS) {
      const rows = regulatory.filter((r) => r.priority === b.key && matchesFilters(r));
      map[b.key] = sortRows(rows);
    }
    return map;
    // `ranks` is load-bearing here, not decorative: it arrives asynchronously
    // from useListOrder's fetch, and every other dep is already settled by the
    // time it lands. Without it the stored order would only appear after the
    // user happened to touch a filter, which reads as "my arrangement did not
    // save". It is a useMemo keyed on the order array, so it is referentially
    // stable between actual order changes and does not thrash this memo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regulatory, search, ownerFilter, activeModes, activeTopics, activeRegionIsos, sort, ranks]);

  const anyFilterActive =
    !!search.trim() ||
    !!ownerFilter ||
    activePriorities.size > 0 ||
    activeModes.size > 0 ||
    activeTopics.size > 0 ||
    activeRegionIsos.size > 0;

  const visibleBands = BANDS.filter((b) => isPriorityIncluded(b.key));
  const totalShown = visibleBands.reduce((n, b) => n + bandRows[b.key].length, 0);

  // ── Drag ordering (custom mode only) ────────────────────────────────
  // Pointer drags need a small activation distance or a click on the row would
  // start a drag and swallow the navigation; the row is a link first.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // The seed is the UNFILTERED corpus in band order, not the rows currently on
  // screen. Seeding only what a search left visible would leave every
  // filtered-out row unplaced, and unplaced rows sort first — so clearing the
  // search after one drag would throw hundreds of rows above the handful the
  // user had just arranged. Seed everything once, order what is asked for.
  //
  // The move is deliberately NOT baked in. reorder_user_list_item seeds the
  // ladder first and only then places the item between prev and next, so
  // pre-applying the drop here would be redundant work; worse, doing it would
  // force the moved band to come from the FILTERED post-drop array, which is
  // exactly the hidden-row hole this function exists to close.
  const buildSeed = (): string[] => {
    const seed: string[] = [];
    for (const b of BANDS) {
      seed.push(...sortRows(regulatory.filter((r) => r.priority === b.key)).map((r) => r.id));
    }
    return seed;
  };

  // Drags are WITHIN a band. Band membership is priority, which the platform
  // asserts and the user retags through the row menu, so dragging a row across
  // a band boundary would silently mean "change this regulation's severity" —
  // a different action with a different affordance. Positions stay global
  // (one list_key for the surface) because only relative order inside a band is
  // ever observed, and a midpoint between two band neighbours is still between
  // them however many hidden rows share the gap.
  const onBandDragEnd = (bandKey: string) => async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    // The FULL band array, not the visible slice: a collapsed band renders its
    // first five rows, and the neighbour below the last visible row is row six,
    // not nothing. The slice is a prefix, so display indices are array indices.
    const rows = bandRows[bandKey];
    const from = rows.findIndex((r) => r.id === active.id);
    const to = rows.findIndex((r) => r.id === over.id);
    if (from < 0 || to < 0) return;

    const { items, prevIndex, nextIndex } = applyMove(rows, from, to);
    await moveInOrder({
      itemId: String(active.id),
      prevItemId: items[prevIndex]?.id ?? null,
      nextItemId: items[nextIndex]?.id ?? null,
      seedItemIds: buildSeed(),
    });
  };

  // ── Actions ─────────────────────────────────────────────────────────
  const toggleInSet = (
    setter: Dispatch<SetStateAction<Set<string>>>,
    value: string
  ) =>
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });

  const rootRef = useRef<HTMLDivElement>(null);
  const onTileClick = (key: BandKey) => {
    const isolated = activePriorities.size === 1 && activePriorities.has(key);
    setActivePriorities(isolated ? new Set() : new Set([key]));
    // Scroll to the band (jump-filter behavior from the mock).
    const anchor = BANDS.find((b) => b.key === key)?.anchor;
    if (anchor) {
      requestAnimationFrame(() =>
        document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" })
      );
    }
  };
  const tilePressed = (key: BandKey) =>
    activePriorities.size === 1 && activePriorities.has(key);

  const clearFilters = () => {
    setSearch("");
    setOwnerFilter(null);
    setActivePriorities(new Set());
    setActiveModes(new Set());
    setActiveTopics(new Set());
    setActiveRegionIsos(new Set());
  };

  const askRef = useRef<HTMLFormElement>(null);
  const [askValue, setAskValue] = useState("");
  const submitAsk = (question: string) => {
    const q = question.trim();
    if (!q) return;
    const rect = askRef.current?.getBoundingClientRect();
    const anchor = rect ? { top: rect.bottom, left: rect.left, width: rect.width } : null;
    window.dispatchEvent(new CustomEvent("open-ask-assistant", { detail: { question: q, anchor } }));
  };

  // ── Shared inline styles ────────────────────────────────────────────
  const cardBorder = "1px solid var(--color-border)";
  const facetChip = (pressed: boolean): CSSProperties => ({
    fontFamily: "inherit",
    fontSize: "11.5px",
    fontWeight: pressed ? 800 : 600,
    color: pressed ? "var(--color-primary)" : "var(--color-text-secondary)",
    background: pressed ? "rgba(232,97,10,0.09)" : "var(--color-bg-base)",
    border: `1px solid ${pressed ? "var(--color-primary)" : "var(--color-border-medium)"}`,
    borderRadius: "999px",
    padding: "5px 12px",
    cursor: "pointer",
  });

  return (
    <div
      ref={rootRef}
      style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 36px 80px" }}
    >
      {/* PERF-10 (2026-09-04): the ONLY piece of this component that reads the URL's search params —
          see SearchParamsFilterBridge's own header above for why it is isolated here, wrapped in its
          own Suspense boundary, rather than calling useSearchParams() directly in this component
          (which would require Suspense-wrapping — and therefore deferring the first paint of — the
          entire ledger). Renders nothing; fallback={null} is never visibly different from its resolved
          state. */}
      <Suspense fallback={null}>
        <SearchParamsFilterBridge onParams={handleFilterParams} />
      </Suspense>
      {/* ── Priority tiles — clickable band filters ── */}
      <div
        role="group"
        aria-label="Filter by priority band"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 14,
          margin: "0 0 22px",
        }}
        className="cl-reg-tiles"
      >
        {BANDS.map((b) => {
          const fig = b.key === "LOW" ? "var(--reg-tile-low-fig)" : b.hueVar;
          const pressed = tilePressed(b.key);
          return (
            <button
              key={b.key}
              type="button"
              aria-pressed={pressed}
              aria-label={`${b.label} — ${bandCount(b.key)} regulations; filter this band`}
              onClick={() => onTileClick(b.key)}
              style={{
                textAlign: "left",
                background: "var(--color-bg-surface)",
                border: `1px solid ${pressed ? b.hueVar : "var(--color-border)"}`,
                borderRadius: 8,
                overflow: "hidden",
                display: "block",
                cursor: "pointer",
                fontFamily: "inherit",
                padding: 0,
              }}
            >
              <div style={{ padding: "16px 18px 12px" }}>
                <p
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: "0.13em",
                    textTransform: "uppercase",
                    color: fig,
                    margin: "0 0 4px",
                  }}
                >
                  {b.key === "CRITICAL" ? "Immediate action" : b.label}
                </p>
                <p
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 44,
                    lineHeight: 1,
                    color: fig,
                    margin: 0,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {bandCount(b.key)}
                </p>
                <p
                  style={{
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: "var(--color-text-secondary)",
                    margin: "6px 0 0",
                  }}
                >
                  {b.sub}
                </p>
              </div>
              <div style={{ height: 5, background: b.stripVar }} />
            </button>
          );
        })}
      </div>

      {/* ── Ask bar ── */}
      <div
        style={{
          background: "var(--color-bg-surface)",
          border: cardBorder,
          borderRadius: 8,
          padding: "14px 16px",
          margin: "0 0 18px",
        }}
      >
        <form
          ref={askRef}
          onSubmit={(e) => {
            e.preventDefault();
            submitAsk(askValue);
            setAskValue("");
          }}
          style={{ display: "flex", gap: 10, alignItems: "center" }}
        >
          <input
            value={askValue}
            onChange={(e) => setAskValue(e.target.value)}
            aria-label="Ask anything about your regulations"
            placeholder="Ask anything about your regulations — e.g. What's due in the next 30 days?"
            style={{
              flex: 1,
              minWidth: 0,
              fontFamily: "inherit",
              fontSize: 13.5,
              padding: "11px 14px",
              border: "1px solid var(--color-border-medium)",
              borderRadius: 6,
              outline: "none",
              background: "var(--color-bg-base)",
              color: "var(--color-text-primary)",
            }}
          />
          <button
            type="submit"
            style={{
              fontFamily: "inherit",
              fontSize: 12.5,
              fontWeight: 800,
              padding: "11px 20px",
              borderRadius: 6,
              border: "1px solid var(--color-primary)",
              background: "var(--color-primary)",
              color: "var(--color-text-inverse, #fff)",
              cursor: "pointer",
            }}
          >
            Ask
          </button>
        </form>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0 0" }}>
          {ASK_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => setAskValue(chip)}
              style={facetChip(false)}
            >
              {chip}
            </button>
          ))}
        </div>
      </div>

      {/* ── Facet bar: search + sort segment + Filters ── */}
      <div
        style={{
          background: "var(--color-bg-surface)",
          border: cardBorder,
          borderRadius: 8,
          margin: "0 0 26px",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "12px 16px", flexWrap: "wrap" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search regulations by title, tags, jurisdiction"
            placeholder="Search title, tags, jurisdiction…"
            style={{
              flex: 1,
              minWidth: 180,
              fontFamily: "inherit",
              fontSize: 13,
              padding: "9px 13px",
              border: "1px solid var(--color-border-medium)",
              borderRadius: 6,
              outline: "none",
              background: "var(--color-bg-base)",
              color: "var(--color-text-primary)",
            }}
          />
          {/* Law-2 floor (docs/design/ux-laws.md #2): a 0px-clearance segmented control at ~30px
              tall (mobile measured 38x58, the group's own flex-wrap making one segment taller
              than wide) — under both the 44px target size and the 24px+8px-clearance alternative.
              Same fix as ResearchLedger's window control: minHeight 44 per segment, kept the
              segmented-pill shape. */}
          <div
            role="group"
            aria-label="Sort order"
            style={{
              display: "flex",
              border: "1px solid var(--color-border-medium)",
              borderRadius: 6,
              overflow: "hidden",
            }}
          >
            {([
              ["newest", "Newest"],
              ["priority", "Priority"],
              ["az", "A → Z"],
              ["custom", "My order"],
            ] as [SortKey, string][]).map(([key, label]) => {
              const on = sort === key;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setSort(key)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: 44,
                    whiteSpace: "nowrap",
                    fontFamily: "inherit",
                    fontSize: 11.5,
                    fontWeight: on ? 800 : 600,
                    padding: "8px 14px",
                    border: "none",
                    background: on ? "var(--color-text-primary)" : "var(--color-bg-surface)",
                    color: on ? "var(--color-bg-surface)" : "var(--color-text-secondary)",
                    cursor: "pointer",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((v) => !v)}
            style={{
              fontFamily: "inherit",
              fontSize: 11.5,
              fontWeight: filtersOpen ? 800 : 700,
              padding: "8px 16px",
              borderRadius: 6,
              border: `1px solid ${filtersOpen ? "var(--color-primary)" : "var(--color-border-medium)"}`,
              background: filtersOpen ? "var(--color-primary)" : "var(--color-bg-surface)",
              color: filtersOpen ? "var(--color-text-inverse, #fff)" : "var(--color-text-primary)",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Filters {filtersOpen ? "▴" : "▾"}
          </button>
          {ownerFilter && (
            <button
              type="button"
              onClick={() => setOwnerFilter(null)}
              title="Clear the owner filter"
              style={{
                fontFamily: "inherit",
                fontSize: 11.5,
                fontWeight: 700,
                padding: "8px 14px",
                borderRadius: 6,
                border: "1px solid var(--color-primary)",
                background: "var(--color-bg-raised, var(--color-bg-surface))",
                color: "var(--color-primary)",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Owner: {ownerFilter} ✕
            </button>
          )}
        </div>

        {filtersOpen && (
          <div
            style={{
              borderTop: "1px solid var(--color-border-subtle)",
              padding: "14px 16px",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <FacetRow label="Mode">
              {presentModes.length === 0 ? (
                <EmDash reason="No mode tags on the current set" />
              ) : (
                presentModes.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={activeModes.has(m.id)}
                    onClick={() => toggleInSet(setActiveModes, m.id)}
                    style={facetChip(activeModes.has(m.id))}
                  >
                    {m.label}
                  </button>
                ))
              )}
            </FacetRow>

            <FacetRow label="Priority">
              {BANDS.map((b) => (
                <button
                  key={b.key}
                  type="button"
                  aria-pressed={activePriorities.has(b.key)}
                  onClick={() => toggleInSet(setActivePriorities, b.key)}
                  style={facetChip(activePriorities.has(b.key))}
                >
                  {b.label} <b>{bandCount(b.key)}</b>
                </button>
              ))}
            </FacetRow>

            <FacetRow label="Topic">
              {presentTopics.length === 0 ? (
                <EmDash reason="No topic classification on the current set" />
              ) : (
                presentTopics.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={activeTopics.has(t.id)}
                    onClick={() => toggleInSet(setActiveTopics, t.id)}
                    style={facetChip(activeTopics.has(t.id))}
                  >
                    {t.label}
                  </button>
                ))
              )}
            </FacetRow>

            {anyFilterActive && (
              <div style={{ display: "flex", gap: 16, paddingTop: 4, borderTop: "1px solid var(--color-border-subtle)" }}>
                <button
                  type="button"
                  onClick={clearFilters}
                  style={{
                    fontFamily: "inherit",
                    fontSize: 11.5,
                    fontWeight: 800,
                    color: "var(--color-primary)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Ledger section header ── */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 16,
          borderBottom: "2px solid var(--color-text-primary)",
          padding: "0 0 8px",
          margin: "0 0 18px",
          flexWrap: "wrap",
        }}
      >
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 400,
            fontSize: 26,
            letterSpacing: "0.02em",
            textTransform: "uppercase",
            margin: 0,
          }}
        >
          {headerTotal} {headerTotal === 1 ? "regulation" : "regulations"}
        </h2>
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 800,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--color-text-muted)",
          }}
        >
          {/* The strap states what the order actually is. Leaving it at
              "sorted by next deadline" while a personal order is applied would
              make the surface assert something untrue about itself. */}
          {customMode
            ? hasOrder
              ? "Four bands · your order"
              : "Four bands · drag to arrange"
            : "Four bands · sorted by next deadline"}
        </span>
      </div>

      {/* Custom mode is a state the user can enter, so it has to be a state they
          can leave. A personal arrangement with no exit is a trap. */}
      {customMode && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            padding: "9px 12px",
            margin: "0 0 14px",
            borderRadius: 6,
            border: "1px solid var(--color-border-subtle)",
            background: "var(--color-bg-subtle, var(--color-bg-surface))",
          }}
        >
          <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
            Drag rows by the handle to arrange them. Order is yours alone and
            applies within a band, not across bands.
          </span>
          {hasOrder && (
            <button
              type="button"
              onClick={() => void resetOrder()}
              style={{
                fontFamily: "inherit",
                fontSize: 11.5,
                fontWeight: 700,
                padding: "5px 12px",
                borderRadius: 6,
                border: "1px solid var(--color-border-medium)",
                background: "var(--color-bg-surface)",
                color: "var(--color-text-primary)",
                cursor: "pointer",
              }}
            >
              Reset to default order
            </button>
          )}
          {orderError && (
            <span
              role="status"
              style={{ fontSize: 12, fontWeight: 700, color: "var(--reg-band-immediate)" }}
            >
              {orderError}
            </span>
          )}
        </div>
      )}

      {/* Multi-label disclosure: only when the header total and the sum of
          band labels differ (items may carry no priority label). */}
      {headerTotal !== sumBands && (
        <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "0 0 14px" }}>
          {headerTotal} items across {sumBands} prioritised.
        </p>
      )}

      {/* ── Global honest empty states ── */}
      {regulatory.length === 0 ? (
        <PendingFrame
          headline="No regulations to show yet"
          body="Verified regulatory items appear here once the workspace has classified, source-grounded coverage. Nothing is hidden — there is simply no verified item on this surface right now."
        />
      ) : totalShown === 0 ? (
        <PendingFrame
          headline="No regulations match these filters"
          body="Every band is filtered out by your current search and facet selection."
          action={{ label: "Clear filters", onClick: clearFilters }}
        />
      ) : (
        visibleBands.map((b, idx) => {
          const rows = bandRows[b.key];
          const total = bandCount(b.key);
          const open = !!openBands[b.key];
          const shown = open ? rows : rows.slice(0, ROWS_COLLAPSED);
          const hasMore = rows.length > ROWS_COLLAPSED;
          // Next visible band footer note.
          const nextBand = visibleBands[idx + 1];
          const nextNote = nextBand
            ? `next band: ${nextBand.label} · ${bandCount(nextBand.key)}`
            : "end of ledger";
          const filteredDelta = rows.length !== total;

          return (
            <div
              key={b.key}
              id={b.anchor}
              style={{
                background: "var(--color-bg-surface)",
                border: cardBorder,
                borderRadius: 8,
                overflow: "hidden",
                margin: "0 0 16px",
                scrollMarginTop: 12,
              }}
            >
              <div style={{ height: 4, background: b.stripVar }} />
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  padding: "11px 18px",
                  background: b.bgVar,
                  borderBottom: "1px solid var(--color-border-subtle)",
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: b.hueVar,
                    display: "flex",
                    alignItems: "baseline",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  {b.label}
                  <span
                    style={{
                      fontWeight: 600,
                      letterSpacing: "0.02em",
                      textTransform: "none",
                      color: "var(--color-text-muted)",
                    }}
                  >
                    {b.sub}
                  </span>
                </span>
                <span style={{ display: "flex", alignItems: "baseline", gap: 8, whiteSpace: "nowrap" }}>
                  {filteredDelta && (
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--color-text-muted)" }}>
                      {rows.length} shown
                    </span>
                  )}
                  <span style={{ fontFamily: "var(--font-display)", fontSize: 17, color: b.hueVar }}>
                    {total}
                  </span>
                </span>
              </div>

              {rows.length === 0 ? (
                // See band-empty-state.ts's own header comment (FIRSTPAGE lane, refined PERF-13,
                // perf-waterfall audit §(g)) for the two generations of defect this replaces and why.
                // "ready" is the state that used to render as an indefinite, nothing-in-flight
                // "Loading N…" lie — it now shows the band's true count plus a real control
                // (`fetchNextPage`, the SAME handler the footer's own "Load more" button already
                // calls: one cursor, one fetch path, no new request mechanism) instead of a passive
                // claim with nothing behind it.
                (() => {
                  const state = bandEmptyState({
                    total,
                    isFetchingNextPage,
                    hasNextPage,
                    isFetchNextPageError,
                    initialLoadPending,
                    anyFilterActive,
                  });
                  return (
                    <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <p
                        role={state.kind === "loading" ? "status" : undefined}
                        style={{ fontSize: 12.5, color: "var(--color-text-muted)", margin: 0 }}
                      >
                        {state.text}
                      </p>
                      {state.kind === "ready" && (
                        <button
                          type="button"
                          onClick={() => fetchNextPage()}
                          style={{
                            fontFamily: "inherit",
                            fontSize: 11.5,
                            fontWeight: 800,
                            padding: "5px 12px",
                            borderRadius: 6,
                            border: "1px solid var(--color-border-medium)",
                            background: "var(--color-bg-surface)",
                            color: "var(--color-primary)",
                            cursor: "pointer",
                          }}
                        >
                          Load more ({state.total} in this band)
                        </button>
                      )}
                      {state.kind === "error" && !isFetchNextPageError && (
                        // The stream reports exhausted (hasNextPage===false) yet this band's
                        // authoritative total was never met — not a live in-flight failure
                        // (isFetchNextPageError is false), so there is nothing for the shared
                        // fetchNextPage retry to do; a page refresh re-runs the SSR count + cursor
                        // from scratch, the only real remediation for a stream/count disagreement.
                        <button
                          type="button"
                          onClick={() => window.location.reload()}
                          style={{
                            fontFamily: "inherit",
                            fontSize: 11.5,
                            fontWeight: 800,
                            padding: "5px 12px",
                            borderRadius: 6,
                            border: "1px solid var(--color-border-medium)",
                            background: "var(--color-bg-surface)",
                            color: "var(--color-primary)",
                            cursor: "pointer",
                          }}
                        >
                          Refresh
                        </button>
                      )}
                      {state.kind === "error" && isFetchNextPageError && (
                        <button
                          type="button"
                          onClick={() => fetchNextPage()}
                          style={{
                            fontFamily: "inherit",
                            fontSize: 11.5,
                            fontWeight: 800,
                            padding: "5px 12px",
                            borderRadius: 6,
                            border: "1px solid var(--color-border-medium)",
                            background: "var(--color-bg-surface)",
                            color: "var(--color-primary)",
                            cursor: "pointer",
                          }}
                        >
                          Try again
                        </button>
                      )}
                    </div>
                  );
                })()
              ) : (
                customMode ? (
                  // One DndContext per band: bands are independent drag
                  // containers because a cross-band drop would mean "change
                  // this regulation's severity", which is the row menu's job,
                  // not the drag handle's.
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    modifiers={[restrictToVerticalAxis]}
                    onDragEnd={onBandDragEnd(b.key)}
                  >
                    <SortableContext
                      items={shown.map((r) => r.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {shown.map((r) => (
                        <SortableRegRow
                          key={r.id}
                          r={r}
                          now={now}
                          onArchive={() => setArchiveTarget({ id: r.id, title: r.title })}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                ) : (
                  // PERF-12 (2026-09-04, ADR-027 §2): TanStack Virtual windowing (VirtualizedRowList,
                  // shared with any other ledger that adopts the same primitive — see its own
                  // header). ROW_HEIGHT_PX (44) matches list-pagination.ts's own LIST_PAGE_SIZE
                  // derivation for RegRow's real rendered height. Only the non-drag sort paths use
                  // this: dnd-kit's SortableContext (the `customMode` branch above) needs every row
                  // it manages actually mounted to track drag geometry, and reordering is an opt-in,
                  // per-user affordance over whatever is currently loaded (not a structural "load
                  // everything" defect the audit named) — see this component's own module header for
                  // the "custom mode is not always-on" rationale, unchanged by this lane.
                  <VirtualizedRowList
                    rows={shown}
                    rowHeight={ROW_HEIGHT_PX}
                    getRowId={(r) => r.id}
                    renderRow={(r) => (
                      <RegRow r={r} now={now} onArchive={() => setArchiveTarget({ id: r.id, title: r.title })} />
                    )}
                  />
                )
              )}

              {hasMore && (
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() =>
                    setOpenBands((prev) => ({ ...prev, [b.key]: !prev[b.key] }))
                  }
                  style={{
                    width: "100%",
                    minHeight: 44,
                    textAlign: "left",
                    fontFamily: "inherit",
                    padding: "11px 18px",
                    background: "var(--color-bg-surface)",
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 800, color: "var(--color-primary)" }}>
                    {open ? "Show fewer" : `All ${rows.length} ${b.label.toLowerCase()} →`}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{nextNote}</span>
                </button>
              )}
            </div>
          );
        })
      )}

      <p style={{ fontSize: 12, color: "var(--color-text-muted)", lineHeight: 1.6, margin: "6px 2px 0" }}>
        Rows show jurisdiction, title, next date, and source tier where classified. Deadlines in red
        fall within 90 days. Open any regulation for the full brief, sources, and connected intelligence.
      </p>

      {/* PERF-12 (2026-09-04, ADR-027 §2): infinite-scroll trigger + honest end-of-list state.
          Sentinel fires fetchNextPage BEFORE it is physically visible (useInfiniteScrollSentinel's
          own rootMargin) — the primary mechanism. The "Load more" button is the same affordance
          kept visible and keyboard-reachable (not every input is a scroll gesture), matching the
          "honest, visible mechanism" precedent PERF-11's own UX-compliance note set for this exact
          ledger. Neither renders anything false: "Loading more…" only while a fetch is genuinely
          in flight, "end of ledger" only once hasNextPage is confirmed false (not merely "no rows
          arrived yet"), and the block that could error says so instead of pretending done. */}
      <div ref={sentinelRef} aria-hidden="true" style={{ height: 1 }} />
      {isFetchingNextPage && (
        <p role="status" style={{ fontSize: 11, color: "var(--color-text-muted)", margin: "4px 2px 0" }}>
          Loading more…
        </p>
      )}
      {!isFetchingNextPage && hasNextPage && !isFetchNextPageError && (
        <button
          type="button"
          onClick={() => fetchNextPage()}
          style={{
            marginTop: 8,
            minHeight: 44,
            width: "100%",
            fontFamily: "inherit",
            fontSize: 12,
            fontWeight: 800,
            color: "var(--color-primary)",
            background: "var(--color-bg-surface)",
            border: "1px solid var(--color-border-medium)",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          Load more
        </button>
      )}
      {!isFetchingNextPage && !hasNextPage && regulatory.length > 0 && (
        <p style={{ fontSize: 11, color: "var(--color-text-muted)", margin: "4px 2px 0" }}>
          End of ledger — every loaded regulation is shown above.
        </p>
      )}
      {isFetchNextPageError && (
        <p role="status" style={{ fontSize: 11, fontWeight: 700, color: "var(--reg-band-immediate)", margin: "4px 2px 0" }}>
          Could not load more regulations right now{queryError ? ` (${queryError})` : ""}. What&apos;s
          already shown is unaffected —{" "}
          <button
            type="button"
            onClick={() => fetchNextPage()}
            style={{ fontFamily: "inherit", fontSize: 11, fontWeight: 800, color: "var(--color-primary)", background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline" }}
          >
            try again
          </button>
          .
        </p>
      )}

      {/* Dismissed-regulations recovery drawer (restore path). Renders nothing when empty. */}
      <DismissedStash dismissed={dismissedRegulations} onRestore={(id) => restoreDismissed(id)} />

      {/* Dual-scope archive (migration 235). Mounted at the ledger root, OUTSIDE
          the row <Link>s that host the ⋯ menus — a dialog nested in an anchor is
          invalid HTML and its clicks would navigate away mid-form. */}
      {archiveTarget && (
        <ArchiveDialog
          itemId={archiveTarget.id}
          title={archiveTarget.title}
          onClose={() => setArchiveTarget(null)}
        />
      )}

      <style>{`
        .cl-reg-row:hover { background: var(--color-bg-base); }
        @media (max-width: 720px) {
          .cl-reg-tiles { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 440px) {
          .cl-reg-tiles { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

function FacetRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "92px 1fr",
        gap: 12,
        alignItems: "baseline",
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--color-text-muted)",
        }}
      >
        {label}
      </span>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{children}</div>
    </div>
  );
}

function EmDash({ reason }: { reason: string }) {
  return (
    <span style={{ fontSize: 12, color: "var(--color-text-muted)" }} title={reason} aria-label={reason}>
      — <span style={{ fontStyle: "normal" }}>{reason}</span>
    </span>
  );
}

function PendingFrame({
  headline,
  body,
  action,
}: {
  headline: string;
  body: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div
      style={{
        border: "1px dashed rgba(0,0,0,0.25)",
        background: "var(--color-bg-base)",
        borderRadius: 8,
        padding: "22px 20px",
      }}
    >
      <p
        style={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--brass)",
          margin: "0 0 6px",
        }}
      >
        Nothing to show
      </p>
      <p style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)", margin: "0 0 6px" }}>
        {headline}
      </p>
      <p style={{ fontSize: 12.5, color: "var(--color-text-secondary)", lineHeight: 1.55, margin: 0 }}>
        {body}
      </p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          style={{
            marginTop: 12,
            fontFamily: "inherit",
            fontSize: 12,
            fontWeight: 800,
            color: "var(--color-primary)",
            background: "none",
            border: "1px solid var(--color-primary)",
            borderRadius: 6,
            padding: "7px 14px",
            cursor: "pointer",
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

// ── Row components ───────────────────────────────────────────────────────
// Extracted from the band render so the same markup can be mounted plain
// (default sorts) or wrapped in a sortable (custom mode). One definition, two
// mounts: a second hand-written copy for the drag path would be free to drift
// from the one every other sort renders, and the row is the surface's most
// load-bearing piece of markup.
function RegRow({
  r,
  now,
  onArchive,
}: {
  r: Resource;
  now: number | null;
  onArchive: () => void;
}) {
  const md = nextMilestone(r, now);
  // `md` is only ever non-null when `now` is itself non-null (nextMilestone's own guard) — `now!` is
  // safe here, not a cast around a real possibility.
  const days = md ? Math.round((md.getTime() - now!) / 86400000) : null;
  // HYDRATION-418 (2026-09-04): pin the zone — see format-fixed-date.ts's header for the reproduced
  // server(UTC)/client(local) mismatch this was throwing React error #418 on.
  const dateStr = formatMilestoneChip(md);
  const dateRed = days !== null && days >= 0 && days <= 90;
  const tier = r.sourceTier != null ? clampTier(r.sourceTier) : null;
  return (
    <Link
      href={`/regulations/${encodeURIComponent(r.id)}`}
      // prefetch RE-ENABLED (perf lane, 2026-09-03, superseding the 2026-07-13 diagnosis's
      // prefetch={false}). That flag was correct for what existed then: every detail render did
      // 8-11 SEQUENTIAL, UNCACHED Supabase round trips, so N visible rows prefetching at once meant N
      // concurrent uncached SSR renders — the Supabase-saturation spike behind the 503s. The fan-out
      // itself is fixed now (src/lib/detail/load-detail.ts + src/app/regulations/[slug]/page.tsx): the
      // item-scoped bundle a prefetch would trigger is ONE cached unstable_cache entry per item, shared
      // across every viewer and every concurrent prefetch of the same row — a burst of visible rows no
      // longer means a burst of fresh Supabase reads, it means one cache population plus N cache hits.
      //
      // PERF-13 (2026-09-04, item 1 + item 2, docs/audits/perf-clickthrough-2026-09-04.md §(d)):
      // CORRECTS the paragraph above, kept as history rather than deleted (rule 14) — it assumed
      // "for a fully-dynamic route this only prefetches the static shell + loading.tsx boundary, not
      // the dynamic RSC payload." That was true when this route built `ƒ` (Dynamic). It no longer
      // builds that way: `generateStaticParams` (this file's `[slug]/page.tsx` sibling) now
      // enumerates every verified slug, so for any already-built item this `<Link>` targets a STATIC
      // route — and left at the framework default (prop omitted, not an explicit override), Next's
      // own documented behavior for a static destination is to prefetch the FULL route (data +
      // rendered payload), not merely the loading skeleton (nextjs.org/docs/app/api-reference/
      // components/link#prefetch: "if `true` -> prefetched; `null`/omitted (default) -> full
      // prefetching for statically generated pages, loading.js boundary only for dynamic ones").
      // Both prefetch depths were always cheap for the reason above (cache-shared item bundles), and
      // the default now upgrades automatically as each item's page moves from "not yet built" to
      // "resident in the Full Route Cache" — no prop change needed here to benefit from item 1.
      //
      // The coordinator's own live measurement (finding (d): only 6/12 visible rows carried an
      // `_rsc` prefetch entry) was taken against the PRE-item-1 build (every route still `ƒ`,
      // shell-only prefetch depth) — this lane could not re-measure it live (no reachable Supabase
      // from this sandbox's build process to stand up a `next start` server with real listing rows;
      // see this lane's own REPORT). [HYPOTHESIS, pending the coordinator's live re-measurement
      // after landing]: once every existing item is statically built (item 1), most visible rows
      // should show a full-payload `_rsc` prefetch on viewport entry by Next's own default, with the
      // residual (items minted after the last deploy, briefly on-demand) closed by the warm step —
      // see docs/runbooks/warm-static-detail-routes.md.
      className="cl-reg-row cl-row-grid"
      data-guard-container="regulation-row"
      style={{
        display: "grid",
        gridTemplateColumns: "96px 1fr auto",
        gap: 14,
        alignItems: "center",
        padding: "11px 18px",
        borderBottom: "1px solid var(--color-border-subtle)",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <span
        className="cl-row-grid__label"
        style={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.08em",
          color: "var(--brass)",
        }}
      >
        {jurTag(r)}
      </span>
      <p data-guard-title className="cl-row-grid__title cl-row-grid__title--clamp3" style={{ fontSize: 13.5, fontWeight: 700, margin: 0, lineHeight: 1.4, overflowWrap: "anywhere" }}>
        {r.title}
      </p>
      <span
        className="cl-row-grid__meta"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          whiteSpace: "nowrap",
          justifyContent: "flex-end",
        }}
      >
        {dateStr ? (
          <span
            style={{
              fontSize: 12,
              fontWeight: 800,
              color: dateRed ? "var(--reg-band-immediate)" : "var(--color-text-muted)",
            }}
          >
            {dateStr}
          </span>
        ) : (
          <span
            title="No upcoming milestone on record"
            aria-label="No upcoming milestone on record"
            style={{ fontSize: 12, fontWeight: 800, color: "var(--color-text-muted)" }}
          >
            —
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
              color: "#fff",
            }}
          >
            T{tier}
          </span>
        )}
        <RecordGradeBadge itemGrade={r.itemGrade} />
        {/* Phase 0 (operator go 2026-08-01): per-row ⋯ retag/dismiss —
            the built-but-unwired "card" variant, now mounted. Safe
            inside the row <Link>: the popover stops propagation. */}
        <CardPriorityDropdown
          currentPriority={r.priority as PriorityKey}
          itemId={r.id}
          onArchive={onArchive}
        />
      </span>
    </Link>
  );
}

// The same row with a drag handle, mounted only in custom mode.
//
// THE HANDLE IS OUTSIDE THE LINK, deliberately. Attaching the drag listeners to
// the row itself would put a pointer-down handler on a navigation target: every
// click would begin a drag, and the row's primary job is to open the regulation.
// A dedicated activator keeps "go there" and "move this" as two distinct
// gestures on two distinct targets, which is also what makes the keyboard path
// coherent — the handle is a real button, so it is tabbable and dnd-kit's
// keyboard sensor drives it with the arrow keys.
function SortableRegRow({
  r,
  now,
  onArchive,
}: {
  r: Resource;
  now: number | null;
  onArchive: () => void;
}) {
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
        gridTemplateColumns: "30px 1fr",
        alignItems: "center",
        transform: CSS.Transform.toString(transform),
        transition,
        // The dragged row has to paint above its neighbours or it slides
        // underneath the rows it is passing.
        position: "relative",
        zIndex: isDragging ? 2 : undefined,
        opacity: isDragging ? 0.85 : undefined,
        background: isDragging ? "var(--color-surface)" : undefined,
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
      <RegRow r={r} now={now} onArchive={onArchive} />
    </div>
  );
}


// ── Per-row priority dropdown (Phase 0 mount of the built card variant) ──
// Mirrors RegulationDetailSurface's HeroPriorityDropdown wiring: reads the
// live override for effective priority + dismissed state, writes through the
// store's optimistic updatePriority/dismissResource (rollback on failure).
function CardPriorityDropdown({
  currentPriority,
  itemId,
  onArchive,
}: {
  currentPriority: PriorityKey;
  itemId: string;
  onArchive: () => void;
}) {
  const updatePriority = useResourceStore((s) => s.updatePriority);
  const dismissResource = useResourceStore((s) => s.dismissResource);
  const override = useResourceStore((s) => s.overrides.get(itemId));
  const isDismissed = !!override?.dismissedAt;
  const effectivePriority = (override?.priorityOverride as PriorityKey | undefined) ?? currentPriority;
  return (
    <PriorityDropdown
      variant="card"
      currentPriority={effectivePriority}
      isDismissed={isDismissed}
      onSetPriority={(p) => updatePriority(itemId, p)}
      onDismiss={() => dismissResource(itemId)}
      // The dialog itself is NOT mounted here: this dropdown renders inside
      // the row <Link>, and a dialog (with its own <form>) nested in an anchor
      // is invalid HTML whose clicks would also navigate. The ledger owns the
      // open state and renders ArchiveDialog outside every row link.
      onArchive={onArchive}
    />
  );
}
