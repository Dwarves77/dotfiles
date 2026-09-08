"use client";

/**
 * Chips — the one chip family (UI system handoff 2026-09-06, README §0.4).
 * Only band chips carry colour (tinted pill, band dot, band-coloured
 * label). Tier is a bordered square T1-T6. Kind/mode/topic are neutral
 * tags on --tag. Filter chips are grouped in labelled sets (Mode / Band /
 * Region) so a wrapped group keeps its label.
 *
 * Mobile (lane moblist, 2026-09-07, mobile-390 spec "FILTERS"): below 768px
 * each `FilterChipGroup` becomes its own 36px-tall bordered "shell" (1px
 * solid rgba(0,0,0,.1), radius 8, #FFFFFF, padding 0 8px) that never wraps
 * internally and never shrinks — so when `ListSurfaceShell` lays a row of
 * these shells out as one horizontally-scrolling strip (operator's prose
 * addition: "chip groups scroll sideways as whole units so a group never
 * loses its label"), each group scrolls as one intact block, label attached
 * to its chips. `FilterChip` itself squares off (radius 6, not the pill)
 * and recolors (active #5A5552/white, inactive #5A6B67 on a
 * rgba(0,0,0,.15) border) per the same spec section. A CSS media query on
 * both shared parts, never a page-local override.
 */

import type { UrgencyBand } from "@/lib/urgency/bands";

export function BandChip({ band }: { band: UrgencyBand }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: "var(--fs-105)",
        fontWeight: 800,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: band.cssVar,
        background: band.tintCssVar,
        border: `1px solid ${band.borderCssVar}`,
        borderRadius: "var(--radius-pill)",
        padding: "3px 9px 3px 7px",
      }}
    >
      <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", background: band.cssVar }} />
      {band.label}
    </span>
  );
}

// Mobile-390 spec (FOLD-56, F4): the tier square below 768px is 9.5px/800 letter-spacing .06em
// text in a 1px rgba(0,0,0,.2) radius-4 box — additive media block on the shared part, same
// pattern as FILTER_GROUP_MOBILE_CSS above.
const TIER_CHIP_MOBILE_CSS = `
  @media (max-width: 767px) {
    .cl-tier-chip {
      font-size: 9.5px !important;
      font-weight: 800 !important;
      letter-spacing: 0.06em !important;
      border: 1px solid rgba(0,0,0,.2) !important;
      border-radius: 4px !important;
    }
  }
`;

/** Bordered square tier chip, T1-T6. Clamped so a raw out-of-range source
 *  tier never renders a broken label.
 *
 *  `max` widens the clamp for the SOURCE tier vocabulary, which runs T1-T7
 *  (src/lib/tier-labels.ts) rather than the item-tier T1-T6 of operator ruling
 *  2.5, the admin provisional-review table (artboard 13) renders source tiers.
 *  Additive: the default is unchanged, so every existing call site and every
 *  spec measuring one keeps the T1-T6 behaviour exactly. */
export function TierChip({ tier, max = 6 }: { tier: number; max?: number }) {
  const clamped = Math.max(1, Math.min(max, Math.round(tier)));
  return (
    <>
      <style>{TIER_CHIP_MOBILE_CSS}</style>
      <span
        className="cl-tier-chip"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "3px 7px",
          fontSize: "var(--fs-10)",
          fontWeight: 800,
          letterSpacing: "0.06em",
          color: "var(--ink-2)",
          border: "1px solid rgba(0,0,0,.2)",
          borderRadius: 4,
          fontVariantNumeric: "tabular-nums",
          textAlign: "center",
        }}
      >
        T{clamped}
      </span>
    </>
  );
}

/**
 * Neutral kind/mode/topic tag on --tag. NO border at either size — the tier
 * square is the only bordered chip (chip family rule 2.5, operator 2026-09-07,
 * restated in item B1 of 2026-09-08).
 *
 * Two sizes, because the artboards draw two and only two:
 *
 *  - `variant="detail"` (default, unchanged): the detail header's chip row,
 *    dc.html p5 line 292 — `padding:3px 8px;border-radius:4px;background:
 *    #F5F2EE;font-weight:600;font-size:10.5px;letter-spacing:.04em;
 *    text-transform:uppercase`. Every existing caller keeps this byte for byte.
 *  - `variant="row"` (item B1, operator 2026-09-08): the LIST ROW's kind chip,
 *    dc.html p4 line 517 — `padding:1px 6px;border-radius:3px;background:
 *    #F5F2EE;font-weight:700;font-size:9.5px;letter-spacing:.06em;
 *    text-transform:uppercase;color:#1A1A1A`. The operator's item states the
 *    vertical padding as 2px, not the artboard's 1px, and his item list is the
 *    later and explicit instruction ("exact values ... are not to be rounded,
 *    adjusted or improved"), so 2px 6px is built and the artboard's 1px is
 *    logged in DEVIATION-LOG.md. Colour is the artboard's #1A1A1A (the item
 *    does not name a colour; the artboard is the authority where it is silent).
 *
 * The list row selects the row size itself, from `ListRow`'s `kind` prop — no
 * page builds a chip of its own, so no page can drift.
 */
export function TagChip({ children, variant = "detail" }: { children: React.ReactNode; variant?: "detail" | "row" }) {
  const row = variant === "row";
  return (
    <span
      className={row ? "cl-tag-chip cl-tag-chip-row" : "cl-tag-chip"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontSize: row ? "var(--fs-95)" : "var(--fs-105)",
        fontWeight: row ? 700 : 600,
        color: row ? "var(--ink)" : "var(--ink-2)",
        background: "var(--tag)",
        borderRadius: row ? 3 : 4,
        textTransform: "uppercase",
        letterSpacing: row ? "0.06em" : "0.04em",
        padding: row ? "2px 6px" : "3px 8px",
        // Row-only: the row's meta line is a single nowrap/ellipsis line (dc.html p4 line 517), so
        // the chip inside it must not wrap. The detail variant is left exactly as it was.
        ...(row ? { whiteSpace: "nowrap" as const, flexShrink: 0 } : null),
      }}
    >
      {children}
    </span>
  );
}

/**
 * WorkspaceTagPill — the workspace-tag chip (lane uitags, 2026-09-07,
 * README "Workspace tags" / ruling R6): a 6px SQUARE ink dot (never round —
 * that is BandChip's mark, and the neutral TagChip above has no dot at all,
 * so the three chip families stay visually distinct at a glance), #F5F2EE
 * fill, 1px rgba(0,0,0,.14) border, 11.5px/600 label. Optional `onRemove`
 * renders a trailing × (removable, used inside TagPopover's applied rows
 * and the detail tag row).
 */
export function WorkspaceTagPill({
  name,
  onRemove,
}: {
  name: string;
  onRemove?: () => void;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 11.5,
        fontWeight: 600,
        color: "var(--ink-2)",
        background: "#F5F2EE",
        border: "1px solid rgba(0,0,0,.14)",
        borderRadius: "var(--radius-pill)",
        padding: onRemove ? "3px 6px 3px 8px" : "3px 9px",
      }}
    >
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 1, background: "var(--ink)", flexShrink: 0 }} />
      {name}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove tag ${name}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 14,
            height: 14,
            border: "none",
            background: "transparent",
            color: "var(--ink-3)",
            cursor: "pointer",
            padding: 0,
            fontSize: 12,
            lineHeight: 1,
            fontFamily: "inherit",
          }}
        >
          ×
        </button>
      )}
    </span>
  );
}

export interface FilterChipGroupProps {
  label: string;
  children: React.ReactNode;
}

// Mobile-390 spec "FILTERS" (lane moblist, 2026-09-07): a media query on this shared part.
// `.cl-filter-group` becomes the 36px shell; `ListSurfaceShell` lays a row of these shells out
// as one horizontally-scrolling strip at mobile (see that file's own CSS) — this rule only
// styles the shell and stops it wrapping/shrinking internally, it does not create the strip.
const FILTER_GROUP_MOBILE_CSS = `
  @media (max-width: 767px) {
    .cl-filter-group {
      height: 36px;
      min-height: 36px;
      border: 1px solid rgba(0,0,0,.1);
      border-radius: 8px;
      background: #FFFFFF;
      padding: 0 8px;
      flex-wrap: nowrap !important;
      flex-shrink: 0;
      white-space: nowrap;
    }
    .cl-filter-group .cl-filter-group-chips { flex-wrap: nowrap !important; }
    .cl-filter-group-label { font-size: 9.5px !important; letter-spacing: 0.1em !important; }
    /* MOBILE-60 (2026-09-08): the mobile 390 spec writes "chips 12px/600"; the weight was
       inherited from the desktop chip (700) because only the size and radius were overridden
       here. Measured mismatch, fixed at the one place the mobile chip is described. */
    .cl-filter-chip { font-size: 12px !important; font-weight: 600 !important; border-radius: 6px !important; white-space: nowrap; }
    .cl-filter-chip[data-active="true"] { background: #5A5552 !important; color: #FFFFFF !important; border-color: #5A5552 !important; }
    /* Operator audit item 2.5 (2026-09-07, CLOSED ruling): "Filter chips inside a labelled group
       shell keep the group's border; the individual inactive chips inside it do not." The shell
       (.cl-filter-group above) already carries the border — an inactive chip's own border is
       always transparent here, never a second visible border stacked inside the shell's. */
    .cl-filter-chip[data-active="false"] { background: transparent !important; color: #5A6B67 !important; border-color: transparent !important; }
  }
`;

/** A labelled set of filter chips (Mode / Band / Region) — the label stays
 *  attached to its group even when the row wraps (>=768px) or the group
 *  scrolls as one unit inside a horizontal strip (<768px). */
export function FilterChipGroup({ label, children }: FilterChipGroupProps) {
  return (
    <div className="cl-filter-group" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <style>{FILTER_GROUP_MOBILE_CSS}</style>
      <span
        className="cl-filter-group-label"
        style={{
          fontSize: "var(--fs-10)",
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--ink-3)",
        }}
      >
        {label}
      </span>
      {/* UILISTS lane (2026-09-06, RD-60/F35 law-2): 6px left two adjacent pills 6px apart — under
          the law-2 24px-alternative floor's 8px clearance requirement once these five surfaces put
          many chips in one wrapped row. Bumped to 8px, additive (no other FilterChipGroup consumer
          depends on the old 6px). */}
      <div className="cl-filter-group-chips" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{children}</div>
    </div>
  );
}

export function FilterChip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="cl-filter-chip"
      data-active={active ? "true" : "false"}
      onClick={onClick}
      aria-pressed={active}
      style={{
        fontSize: "var(--fs-11)",
        fontWeight: 700,
        color: active ? "#FFFFFF" : "var(--ink-2)",
        background: active ? "var(--brand)" : "var(--tag)",
        border: "1px solid transparent",
        borderRadius: "var(--radius-pill)",
        padding: "5px 11px",
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      {children}
    </button>
  );
}
