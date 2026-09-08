/**
 * Shared row/facet derivations for the five list surfaces (UI system handoff
 * 2026-09-06, README screens 2/4/6/8/11: Regulations, Market, Research,
 * Operations, Watchlist). Extracted here — not duplicated per surface —
 * because all five render the SAME facet groups (Mode / Band / Region) over
 * the same band vocabulary (src/lib/urgency/bands.ts) and the same row
 * anatomy (ListRow). This is a lib helper, not a UI part: it holds no JSX
 * and is the natural home for logic five sibling page components would
 * otherwise hand-copy (CLAUDE.md rule "no duplication").
 *
 * Band counts come from the surface's own get_surface_counts RPC bundle
 * (WorkspaceAggregates.byPriority) wherever a caller has one — the SAME
 * "single SoT, never recomputed from the visible rows" rule every existing
 * list page in this app already follows (see regulations/market/operations/
 * research page.tsx headers). Region facet counts likewise come from
 * WorkspaceAggregates.byJurisdiction (migration 148), also a live corpus
 * count, not a loaded-rows count. Mode has no such per-surface RPC
 * breakdown today; its counts are computed from the rows actually loaded
 * (first-paint page, then the full corpus once the after-paint remainder
 * fetch resolves) and are logged as a deviation in
 * docs/design/handoff-2026-09-06/DEVIATION-LOG.md.
 */

import type { Resource } from "@/types/resource";
import { TRANSPORT_MODES } from "@/lib/contracts/vocabularies.mjs";
import { BAND_ORDER, bandFromPriority, type UrgencyBandKey } from "@/lib/urgency/bands";
import { dueInfo } from "@/lib/dashboard/row-fields";

export interface FacetOption {
  value: string;
  label: string;
  count: number;
  /** Optional display form of `count` for a facet whose count is a ratio rather than a tally
   *  (added additively, lane comp-08 2026-09-08 — artboard 08/id="p8"'s DIMENSION group shows
   *  "3/5", coverage over the region roster, not a row count). `count` stays the number every
   *  other consumer sorts and sums on; this only changes what the rail prints. */
  countLabel?: string;
}

/** Every distinct mode across the loaded rows, with a loaded-row count each,
 *  ordered by count descending then alphabetically.
 *
 *  The option's `label` is the mode's DISPLAY label from the TRANSPORT_MODES vocabulary
 *  ("Road", "Rail", "Ocean", "Air"), which is what artboards 02/04/06/08/11 all draw in the
 *  FILTERS rail card. It used to be the raw canonical token, so the rail read "road / rail /
 *  ocean / air" in lower case against the artboard's title case, and against its own JURISDICTION
 *  and TOPIC groups, which are already title case. Found by eye in train 60's visual pass; no
 *  spec measured it.
 *
 *  `value` is UNCHANGED and is still the canonical token. The canonical transport mode is `ocean`
 *  (operator ruling 2026-08-12, migration 263) and nothing here writes, stores, filters or
 *  round-trips the label: the filter callbacks, the URL state and every count still key on
 *  `value`. This is a display form for one rail card, never a second vocabulary. A mode with no
 *  registry entry (an unexpected token from data) falls back to printing itself rather than
 *  being dropped or renamed. */
export function modeFacetOptions(rows: Resource[]): FacetOption[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    for (const m of r.modes ?? []) {
      const key = m.trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, label: modeDisplayLabel(value), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function modeDisplayLabel(code: string): string {
  const entry = (TRANSPORT_MODES as Record<string, { label: string } | undefined>)[code];
  return entry?.label ?? code;
}

/** Every distinct topic across the loaded rows, with a loaded-row count each (artboard 02/id="p2"
 *  rail: MODE / JURISDICTION / TOPIC / SOURCE TIER — the same loaded-rows-tally caveat
 *  `modeFacetOptions` above already documents applies here too: no per-surface RPC breakdown for
 *  topic exists today). Ordered by count descending then alphabetically, same as Mode. */
export function topicFacetOptions(rows: Resource[]): FacetOption[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const key = (r.topic ?? "").trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** Source-tier facet options (T1-T6, artboard 02/id="p2" rail's fourth facet section, grouped as
 *  "T1 binding law" / "T2 regulator guidance" / "T3-T6" on the artboard — here every distinct tier
 *  present in the loaded rows gets its own row, sorted T1 first, since collapsing T3-T6 into one
 *  bucket is a presentation choice the artboard makes with real per-tier data behind it that this
 *  loaded-rows tally cannot reproduce honestly). */
export function tierFacetOptions(rows: Resource[]): FacetOption[] {
  const counts = new Map<number, number>();
  for (const r of rows) {
    const tier = r.sourceTier;
    if (tier == null) continue;
    counts.set(tier, (counts.get(tier) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([tier, count]) => ({ value: String(tier), label: `T${tier}`, count }));
}

/** Region facet options from the live per-jurisdiction corpus count
 *  (WorkspaceAggregates.byJurisdiction) when present; falls back to a
 *  loaded-rows tally only when that bundle is absent (pre-apply / RPC
 *  error — the same fail-soft posture every list page already applies to
 *  its band tiles). */
export function regionFacetOptions(
  rows: Resource[],
  byJurisdiction: Record<string, number> | undefined,
): FacetOption[] {
  if (byJurisdiction && Object.keys(byJurisdiction).length > 0) {
    return Object.entries(byJurisdiction)
      .map(([value, count]) => ({ value, label: value, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }
  const counts = new Map<string, number>();
  for (const r of rows) {
    const key = (r.jurisdiction || "global").trim();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** Band facet options from the live surface-counts bundle
 *  (WorkspaceAggregates.byPriority) when present; falls back to a
 *  loaded-rows tally only when absent. */
export function bandFacetOptions(
  rows: Resource[],
  byPriority: Record<string, number> | undefined,
): Array<FacetOption & { key: UrgencyBandKey }> {
  if (byPriority) {
    return BAND_ORDER.map((b) => ({
      key: b.key,
      value: b.key,
      label: b.label,
      count: byPriority[b.priority] ?? 0,
    }));
  }
  const counts = new Map<UrgencyBandKey, number>();
  for (const r of rows) counts.set(bandFromPriority(r.priority).key, (counts.get(bandFromPriority(r.priority).key) ?? 0) + 1);
  return BAND_ORDER.map((b) => ({ key: b.key, value: b.key, label: b.label, count: counts.get(b.key) ?? 0 }));
}

export interface RowFilterState {
  band: UrgencyBandKey | null;
  mode: string | null;
  region: string | null;
  /** Topic facet (artboard 02/id="p2" rail's third section). Optional: only Regulations wires a
   *  Topic facet group today: `undefined`/`null` behaves identically to every other surface's
   *  pre-existing filter shape, so this addition changes nothing for Market/Research/Operations. */
  topic?: string | null;
  /** Source-tier facet (artboard 02/id="p2" rail's fourth section, "T1"/"T2"/etc — the value is the
   *  tier NUMBER as a string, matching `tierFacetOptions`' own `value`). Same optionality note as
   *  `topic` above. */
  tier?: string | null;
  query: string;
}

export const EMPTY_FILTER_STATE: RowFilterState = { band: null, mode: null, region: null, topic: null, tier: null, query: "" };

/**
 * BAND_FACET_PARAM — the URL query-parameter name for deep-linking the band facet on a list
 * surface (audit item 1.1, 2026-09-07). Verified against this base: no list surface read a band
 * facet from the URL before this — `filter.band` was local `useState` only (RegulationsLedger,
 * MarketIntelLedger, ResearchLedger, OperationsLedger all follow the same pattern), so the
 * Dashboard's "All N immediate" control had no existing contract to reuse. This constant plus
 * `bandFromSearchParam` is that contract's one home, additive to this shared helper file rather
 * than invented per-caller, so any future list-surface caller (or another dashboard row) links to
 * `/{surface}?band=<UrgencyBandKey>` and reads it back the same way.
 */
export const BAND_FACET_PARAM = "band";

/** Parses a `?band=` value into a valid UrgencyBandKey, or null for anything else (absent,
 *  misspelled, stale). Never trusts the raw string past BAND_ORDER's own vocabulary. */
export function bandFromSearchParam(value: string | null | undefined): UrgencyBandKey | null {
  const match = BAND_ORDER.find((b) => b.key === value);
  return match ? match.key : null;
}

/**
 * SORT_FACET_PARAM, the URL query-parameter name for deep-linking a list surface's SORT, the
 * sibling of BAND_FACET_PARAM above and built for the same reason.
 *
 * DEFECT 5, lane opsclip (train 61, 2026-09-08). The dashboard's "All N changes in the last 7
 * days" shipped as a bare <span>, `closest('a') === false`, `cursor: auto`, proven statically off
 * production, while its counterpart "All N immediate" beside it is a real anchor and the artboard
 * draws both as links. Wiring it needed a target that MEANS "the changes", and "the changes" is
 * the regulations list ordered newest-first, which had no URL contract: `sortKey` was local
 * `useState` in every ledger [CONFIRMED by reading all four]. This is that contract, in the same
 * one home, so the fix is a link to a real ordering rather than a link to an unordered list.
 */
export const SORT_FACET_PARAM = "sort";

/** Parses a `?sort=` value into a valid ListSurfaceSortKey, or null for anything else. Never
 *  trusts the raw string past the sort vocabulary the surfaces already use. */
export function sortFromSearchParam(value: string | null | undefined): ListSurfaceSortKey | null {
  const keys: ListSurfaceSortKey[] = ["next-date", "newest", "az", "my-order"];
  return keys.find((k) => k === value) ?? null;
}

function haystack(r: Resource): string {
  return [r.title, r.jurisdiction, r.topic, ...(r.tags ?? []), r.whatIsIt, r.whyMatters]
    .filter(Boolean)
    // FOLD-59 (2026-09-08): the separator is U+0000, written as an ESCAPE rather than a literal
    // NUL byte. Semantics are unchanged (a byte no query can contain, so a search term cannot
    // match across two fields); what changes is that the FILE is now text. A literal NUL made
    // git classify this module as binary, and a binary file has no line-level merge: the
    // comp-06 cherry-pick silently replaced comp-08's `countLabel` addition wholesale instead
    // of conflicting, and tsc caught it only downstream.
    .join(" \u0000 ")
    .toLowerCase();
}

/** Applies band + mode + region + free-text search, in that order, over the
 *  set of rows currently loaded (first-paint page, or the full corpus once
 *  the after-paint remainder fetch resolves). Order-preserving. */
export function filterRows(rows: Resource[], filter: RowFilterState): Resource[] {
  let out = rows;
  if (filter.band) out = out.filter((r) => bandFromPriority(r.priority).key === filter.band);
  if (filter.mode) out = out.filter((r) => (r.modes ?? []).includes(filter.mode!));
  if (filter.region) out = out.filter((r) => (r.jurisdiction || "global") === filter.region);
  if (filter.topic) out = out.filter((r) => r.topic === filter.topic);
  if (filter.tier) out = out.filter((r) => String(r.sourceTier ?? "") === filter.tier);
  const q = filter.query.trim().toLowerCase();
  if (q) out = out.filter((r) => haystack(r).includes(q));
  return out;
}

/**
 * The detail-return contract this lane and the details lane share (logged
 * in DEVIATION-LOG.md): a row's href carries its 1-based position and the
 * filtered list's total as query params, so the detail rail can render
 * "In this list · N of M" and a "back to the same scroll position" return.
 * `list` names which surface's filtered set this position was computed
 * against (a filtered view is a different "list" than the unfiltered one).
 *
 * FOLD-56 (F7): `neighbors` optionally carries this row's immediate list
 * neighbours (`prev`/`next`, each the neighbour's own detail-route slug —
 * same value `itemDetailHref` puts in its own URL, e.g. the item id).
 * Bounded to exactly these two slugs, no extra query beyond them: the rail
 * ("In this list · N of M") already knows this row's own `list`/`pos`/`of`,
 * so on the DETAIL page InThisListStat reconstructs each neighbour's own
 * list/pos/of from what it already has (pos-1/pos+1, same list/of) rather
 * than the row href needing to carry a second copy of that per neighbour.
 * Either slug is omitted (not written) when there is no such neighbour
 * (first row has no prev, last row has no next).
 */
export function withListPosition(
  href: string,
  list: string,
  position: number,
  of: number,
  neighbors?: { prev?: string | null; next?: string | null },
): string {
  const sep = href.includes("?") ? "&" : "?";
  let out = `${href}${sep}list=${encodeURIComponent(list)}&pos=${position}&of=${of}`;
  if (neighbors?.prev) out += `&prev=${encodeURIComponent(neighbors.prev)}`;
  if (neighbors?.next) out += `&next=${encodeURIComponent(neighbors.next)}`;
  return out;
}

/** ListSurfaceSortRow's own sort keys (artboards 02/04, id="p2"/"p4": "Sort Next date | Newest |
 *  A-Z" — Regulations' four options add "My order"). Shared here rather than hand-copied per
 *  ledger (CLAUDE.md rule "no duplication") since the three real sorts (next-date/newest/az) are
 *  the same comparison over the same Resource shape on every surface that carries this row. */
export type ListSurfaceSortKey = "next-date" | "newest" | "az" | "my-order";

/** "my-order" is the corpus's own incoming order — no surface in this rebuild has drag-reorder, so
 *  it is honestly the identity/no-op sort, not a fabricated manual-order feature (see the ledgers'
 *  own header comments). */
export function sortResourceRows(rows: Resource[], sortKey: ListSurfaceSortKey): Resource[] {
  if (sortKey === "my-order") return rows;
  const sorted = rows.slice();
  if (sortKey === "az") {
    sorted.sort((a, b) => a.title.localeCompare(b.title));
  } else if (sortKey === "newest") {
    sorted.sort((a, b) => new Date(b.added).getTime() - new Date(a.added).getTime());
  } else {
    // "next-date": soonest due date first; rows with no due date sort last, original order among them.
    sorted.sort((a, b) => {
      const da = dueInfo(a)?.daysNum;
      const db = dueInfo(b)?.daysNum;
      if (da == null && db == null) return 0;
      if (da == null) return 1;
      if (db == null) return -1;
      return da - db;
    });
  }
  return sorted;
}

/** The Window row's own option keys (artboard 06/id="p6": "WINDOW 7d | 30d | 90d | All", All
 *  active). Research is the surface that carries this row where Regulations/Market carry Sort. */
export type ListSurfaceWindowKey = "7d" | "30d" | "90d" | "all";

export const WINDOW_OPTIONS: Array<{ key: ListSurfaceWindowKey; label: string; days: number | null }> = [
  { key: "7d", label: "7d", days: 7 },
  { key: "30d", label: "30d", days: 30 },
  { key: "90d", label: "90d", days: 90 },
  { key: "all", label: "All", days: null },
];

/** Days for a window key, or null for "all" (no date bound). */
export function windowDays(key: ListSurfaceWindowKey): number | null {
  return WINDOW_OPTIONS.find((o) => o.key === key)?.days ?? null;
}

/** Rows whose `added` date falls inside the window, lower bound inclusive. "all" (or an
 *  unparseable `added`) keeps the row: a window is a recency filter, never a way to silently drop
 *  an item whose date the corpus does not carry. UTC day math, the same reason `dueInfo` uses it
 *  (SSR/hydration-stable). Order-preserving. */
export function filterByWindow(
  rows: Resource[],
  key: ListSurfaceWindowKey,
  now: Date = new Date(),
): Resource[] {
  const days = windowDays(key);
  if (days == null) return rows;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const floor = today - days * 86400000;
  return rows.filter((r) => {
    if (!r.added) return true;
    const ms = new Date(r.added + (r.added.length === 10 ? "T00:00:00Z" : "")).getTime();
    if (Number.isNaN(ms)) return true;
    return ms >= floor;
  });
}
