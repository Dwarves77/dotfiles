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
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useResourceStore, mergeWithOverrides } from "@/stores/resourceStore";
import {
  MODES,
  TOPICS,
  PRIORITIES,
  type PriorityKey,
} from "@/lib/constants";
import { TIER1_PRIORITY_ISOS } from "@/lib/tier1-priority-jurisdictions";
import { REGULATIONS_DOMAIN } from "@/lib/domains";
import { DismissedStash } from "./DismissedStash";
import type { Resource } from "@/types/resource";
import type { WorkspaceAggregates } from "@/lib/data";

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
  }[];
  /** Verified-population count bundle from getSurfaceCounts('regulations').
   *  totalItems === 0 signals the fail-soft path (RPC absent / empty), in
   *  which case the ledger derives counts from the loaded verified rows. */
  aggregates: WorkspaceAggregates;
  /** Deep-link priority filter from ?priority=CRITICAL etc. */
  initialPriorityFilter?: string | null;
  /** Deep-link Tier-1 ISO region filter from ?region=us-ca etc. */
  initialRegionFilter?: string | null;
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

type SortKey = "newest" | "priority" | "az";
const ROWS_COLLAPSED = 5;

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

/** Nearest upcoming milestone date for a row (from item_timelines), or null. */
function nextMilestone(r: Resource, now: number): Date | null {
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

export function RegulationsLedger({
  initialResources,
  initialArchived,
  initialOverrides = [],
  aggregates,
  initialPriorityFilter = null,
  initialRegionFilter = null,
}: RegulationsLedgerProps) {
  const { resources: platformResources, setResources, setArchived, overrides, setOverrides, restoreDismissed } =
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
  const [activePriorities, setActivePriorities] = useState<Set<string>>(initialPrioritySet);
  const [activeModes, setActiveModes] = useState<Set<string>>(new Set());
  const [activeTopics, setActiveTopics] = useState<Set<string>>(new Set());
  const [activeRegionIsos, setActiveRegionIsos] = useState<Set<string>>(initialRegionIsoSet);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sort, setSort] = useState<SortKey>("priority");
  const [openBands, setOpenBands] = useState<Record<string, boolean>>({});

  // ── Hydrate the shared resource store (applies workspace overrides) ──
  useEffect(() => {
    setResources(initialResources);
    setArchived(initialArchived);
    if (initialOverrides.length > 0) setOverrides(initialOverrides);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialResources]);

  const effectiveResources =
    platformResources.length > 0 ? platformResources : initialResources;
  const { active, dismissed } = useMemo(
    () => mergeWithOverrides(effectiveResources, overrides),
    [effectiveResources, overrides]
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

  // Single render-stable "now" (avoids an impure Date.now() at render and
  // keeps SSR/client date math consistent through hydration).
  const [now] = useState(() => Date.now());

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

  const sortRows = (rows: Resource[]): Resource[] => {
    const copy = [...rows];
    if (sort === "az") {
      copy.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sort === "newest") {
      copy.sort(
        (a, b) => (parseDate(b.added)?.getTime() ?? 0) - (parseDate(a.added)?.getTime() ?? 0)
      );
    } else {
      // priority (default): within a band all rows share a priority, so
      // order by next deadline ascending, undated last.
      copy.sort((a, b) => {
        const da = nextMilestone(a, now)?.getTime() ?? Infinity;
        const db = nextMilestone(b, now)?.getTime() ?? Infinity;
        if (da !== db) return da - db;
        return a.title.localeCompare(b.title);
      });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regulatory, search, activeModes, activeTopics, activeRegionIsos, sort]);

  const anyFilterActive =
    !!search.trim() ||
    activePriorities.size > 0 ||
    activeModes.size > 0 ||
    activeTopics.size > 0 ||
    activeRegionIsos.size > 0;

  const visibleBands = BANDS.filter((b) => isPriorityIncluded(b.key));
  const totalShown = visibleBands.reduce((n, b) => n + bandRows[b.key].length, 0);

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
            ] as [SortKey, string][]).map(([key, label]) => {
              const on = sort === key;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setSort(key)}
                  style={{
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
          Four bands · sorted by next deadline
        </span>
      </div>

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
                <p
                  style={{
                    fontSize: 12.5,
                    color: "var(--color-text-muted)",
                    padding: "14px 18px",
                    margin: 0,
                  }}
                >
                  No matching regulations in this band.
                </p>
              ) : (
                shown.map((r) => {
                  const md = nextMilestone(r, now);
                  const days = md ? Math.round((md.getTime() - now) / 86400000) : null;
                  const dateStr = md
                    ? md.toLocaleDateString("en-US", { month: "short", day: "numeric" })
                    : null;
                  const dateRed = days !== null && days >= 0 && days <= 90;
                  const tier = r.sourceTier != null ? clampTier(r.sourceTier) : null;
                  return (
                    <Link
                      key={r.id}
                      href={`/regulations/${encodeURIComponent(r.id)}`}
                      className="cl-reg-row"
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
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          letterSpacing: "0.08em",
                          color: "var(--brass)",
                        }}
                      >
                        {jurTag(r)}
                      </span>
                      <p style={{ fontSize: 13.5, fontWeight: 700, margin: 0, lineHeight: 1.4 }}>
                        {r.title}
                      </p>
                      <span
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
                      </span>
                    </Link>
                  );
                })
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

      {/* Dismissed-regulations recovery drawer (restore path). Renders nothing when empty. */}
      <DismissedStash dismissed={dismissedRegulations} onRestore={(id) => restoreDismissed(id)} />

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
