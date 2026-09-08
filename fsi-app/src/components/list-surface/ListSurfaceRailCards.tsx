"use client";

/**
 * Rail cards shared by the five list surfaces (Legend is identical text on
 * every artboard 02/04/06/08/11; a plain summary card is the generic
 * fallback for a surface-specific rail card this lane did not build —
 * logged per-page in DEVIATION-LOG.md). Not a src/components/ui/ part
 * (only the five list surfaces use these); kept here to avoid a five-way
 * copy of the same JSX.
 */

import { useMemo, useState, type ReactNode } from "react";
import { SectionRule } from "@/components/ui/SectionRule";
import type { ListSurfaceFacetGroup } from "./ListSurfaceShell";

// Ruling 5.1 (2026-09-07, CLOSED): every panel/section card carries the dark-grey graduated 3px
// rule above its title, full card width, top edge, no radius on the rule. Design audit B163/B165/
// B170 (2026-09-07, docs/design/handoff-2026-09-06/AUDIT-2026-09-07.md, list-surface.json /
// section-card-lists.json) found this rail card and the facets card (ListSurfaceShell.tsx)
// rendered NO rule at all — the base lane's own DEVIATION-LOG entry named rolling SectionRule onto
// this file as later-lane scope; this is that lane.
export function RailCard({
  title,
  children,
  dataAudit,
}: {
  title: string;
  children: ReactNode;
  /** Design-audit hook (../../.discipline/rendering/audit) — a stable selector for a real page
   *  composition mount, since a caller like LegendRailCard mounts this with no wrapper div of its
   *  own. Optional: only the callers a compose-*.json spec needs to address by name pass it. */
  dataAudit?: string;
}) {
  return (
    <div
      data-audit={dataAudit}
      style={{
        background: "var(--card)",
        border: "1px solid var(--line-1)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-card)",
        overflow: "hidden",
      }}
    >
      <SectionRule />
      <div style={{ padding: "14px 16px" }}>
        <p
          style={{
            fontSize: "var(--fs-105)",
            fontWeight: 800,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--ink-3)",
            margin: "0 0 10px",
          }}
        >
          {title}
        </p>
        {children}
      </div>
    </div>
  );
}

// FILTERS rail card (operator audit 2026-09-07: "the filters were not above the regulations, they
// were on the right — same on every page"; artboard 02/id="p2" FILTERS card: title + "Clear N" link,
// MODE / JURISDICTION / TOPIC / WORKSPACE TAGS sections as checkbox lists with right-aligned live
// counts, "+ N more" disclosure past a visible cap). Built once here and mounted by ListSurfaceShell
// itself (not per-page) from the SAME facetGroups/secondaryFacetGroups data and onSelect callbacks
// each of the five list surfaces already passes in — the chip groups this replaced sat ABOVE the
// list in the content column; this card is the one relocation point for all five surfaces at once.
// A group with a single-select radio-style onSelect (current URL/state contract: one value or null)
// renders as a checkbox list where checking a row selects it and checking the already-selected row
// clears it — visually a checkbox, behaviourally the same single-select the chips already had, so no
// list surface's filter semantics changed, only where the control lives.
const VISIBLE_OPTIONS_CAP = 5;

function FacetSection({ group }: { group: ListSurfaceFacetGroup }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? group.options : group.options.slice(0, VISIBLE_OPTIONS_CAP);
  const hidden = group.options.length - visible.length;
  return (
    <div>
      <p
        style={{
          fontSize: "var(--fs-105)",
          fontWeight: 800,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--ink-3)",
          margin: "0 0 6px",
        }}
      >
        {group.label}
      </p>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {visible.map((opt) => {
          const checked = group.selected === opt.value;
          return (
            <label
              key={opt.value}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                minHeight: 36,
                cursor: "pointer",
                fontSize: "var(--fs-11)",
                color: "var(--ink)",
              }}
            >
              {/* DEVIATION (logged in docs/design/handoff-2026-09-06/DEVIATION-LOG.md): artboard
                  02/id="p2" draws this checkbox at 13x13px; law-2 (docs/design/ux-laws.md, the
                  rendering guard's own floor) requires every interactive target be >=24px on its
                  short axis (or >=44px), which a real <input type="checkbox"> at 13px never clears
                  regardless of spacing. Sized to the law-2 floor instead — 24px, with row spacing
                  (minHeight 36) giving >=8px clearance from every neighbouring checkbox. */}
              <input
                type="checkbox"
                checked={checked}
                onChange={() => group.onSelect(checked ? null : opt.value)}
                style={{ width: 24, height: 24, accentColor: "var(--brand)", flexShrink: 0 }}
              />
              <span style={{ flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {opt.label}
              </span>
              <span style={{ color: "var(--ink-3)", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{opt.count}</span>
            </label>
          );
        })}
      </div>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          style={{
            marginTop: 4,
            minHeight: 24,
            display: "inline-flex",
            alignItems: "center",
            background: "none",
            border: "none",
            padding: 0,
            fontSize: "var(--fs-11)",
            fontWeight: 700,
            color: "var(--ink-2)",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          + {hidden} more
        </button>
      )}
    </div>
  );
}

export function FiltersRailCard({
  groups,
  footnote,
}: {
  groups: ListSurfaceFacetGroup[];
  /** README §"the band tiles above are the fourth facet" — shown once, at the card foot. */
  footnote?: ReactNode;
}) {
  const activeCount = useMemo(() => groups.filter((g) => g.selected !== null).length, [groups]);
  const clearAll = () => groups.forEach((g) => g.onSelect(null));
  if (groups.length === 0) return null;
  return (
    <div
      data-audit="filters-rail"
      style={{
        background: "var(--card)",
        border: "1px solid var(--line-1)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-card)",
        overflow: "hidden",
      }}
    >
      <SectionRule />
      <div style={{ padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
          <p
            style={{
              fontSize: "var(--fs-105)",
              fontWeight: 800,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--ink-3)",
              margin: 0,
            }}
          >
            Filters
          </p>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={clearAll}
              style={{
                minHeight: 24,
                background: "none",
                border: "none",
                padding: 0,
                fontSize: "var(--fs-11)",
                fontWeight: 700,
                color: "var(--ink)",
                textDecoration: "underline",
                textDecorationColor: "rgba(0,0,0,.3)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Clear {activeCount}
            </button>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {groups.map((group) => (
            <FacetSection key={group.key} group={group} />
          ))}
        </div>
        {footnote && (
          <p style={{ fontSize: "var(--fs-105)", color: "var(--ink-3)", margin: "12px 0 0", paddingTop: 10, borderTop: "1px solid var(--line-3)" }}>
            {footnote}
          </p>
        )}
      </div>
    </div>
  );
}

export function LegendRailCard() {
  return (
    <RailCard title="Legend" dataAudit="legend-rail">
      <dl style={{ margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
          <dt style={{ fontSize: "var(--fs-11)", fontWeight: 800, color: "var(--ink)" }}>Impact</dt>
          <dd style={{ fontSize: "var(--fs-11)", color: "var(--ink-2)", margin: "2px 0 0" }}>
            Four scored dimensions, sorted low to high: green left, red right. Height is the sum, score 1–3.
          </dd>
        </div>
        <div>
          <dt style={{ fontSize: "var(--fs-11)", fontWeight: 800, color: "var(--ink)" }}>Timeline</dt>
          <dd style={{ fontSize: "var(--fs-11)", color: "var(--ink-2)", margin: "2px 0 0" }}>Passed · next · ahead.</dd>
        </div>
        <div>
          <dt style={{ fontSize: "var(--fs-11)", fontWeight: 800, color: "var(--ink)" }}>Source tier</dt>
          <dd style={{ fontSize: "var(--fs-11)", color: "var(--ink-2)", margin: "2px 0 0" }}>
            T1 binding law → T6 commentary.
          </dd>
        </div>
      </dl>
    </RailCard>
  );
}
