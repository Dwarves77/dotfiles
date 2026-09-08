"use client";

/**
 * Skeletons in final geometry (UI system handoff 2026-09-06, README §0.6):
 * "Nav and masthead render immediately; tiles and rows arrive as skeletons
 * in their final geometry so nothing jumps. A count still loading shows a
 * skeleton, never 0 — a zero is a fact, not a placeholder."
 */

function shimmer(): React.CSSProperties {
  return { background: "var(--tag)", borderRadius: 6 };
}

// MOBILE-60 (2026-09-08) [CONFIRMED, measured at 390 by the audit's mobile-* specs]:
// SkeletonListRow repeats ListRow's desktop eight-track grid literally, which is the
// point ("final geometry so nothing jumps"), but it carried no counterpart to
// ListRow's own mobile reflow. So below 768 a real row became the two-line 3px/1fr
// row while its skeleton stayed 489px wide (the fixed tracks alone) and ran past the
// viewport — a skeleton in the WRONG final geometry, which is the one thing this
// component exists not to do. Below 768 it now states the geometry the row actually
// has at that width: full-bleed 3px spine, jurisdiction + title on line 1, the
// remaining cells wrapping to line 2, min-height 76, the same 10px 6px 10px 12px
// content padding, and the timeline cell dropped exactly as ListRow drops it.
// (nth-of-type, not nth-child: the <style> tag below is itself a child of the row.)
const SKELETON_ROW_MOBILE_CSS = `
  @media (max-width: 767px) {
    .cl-skeleton-row {
      display: flex !important;
      flex-wrap: wrap;
      align-items: center;
      gap: 9px;
      min-height: 76px !important;
      padding: 10px 6px 10px 12px !important;
      position: relative;
    }
    .cl-skeleton-row > span:nth-of-type(1) { position: absolute; left: 0; top: 0; bottom: 0; width: 3px; }
    .cl-skeleton-row > span:nth-of-type(6) { display: none !important; }
  }
`;

export function SkeletonListRow() {
  return (
    <div
      aria-hidden="true"
      className="cl-skeleton-row"
      style={{
        display: "grid",
        gridTemplateColumns: "3px 56px 1fr 88px 84px 76px 40px 44px",
        gap: "0 14px",
        minHeight: 56,
        alignItems: "center",
        borderBottom: "1px solid var(--line-3)",
        padding: "0 8px",
      }}
    >
      <style>{SKELETON_ROW_MOBILE_CSS}</style>
      <span style={{ ...shimmer(), alignSelf: "stretch", borderRadius: 0 }} />
      <span style={{ ...shimmer(), height: 16, width: 40 }} />
      <span style={{ ...shimmer(), height: 14, width: "70%" }} />
      <span style={{ ...shimmer(), height: 9, width: 60 }} />
      <span style={{ ...shimmer(), height: 12, width: 52 }} />
      <span style={{ ...shimmer(), height: 1, width: 76 }} />
      <span style={{ ...shimmer(), height: 20, width: 24 }} />
      <span style={{ ...shimmer(), height: 20, width: 20 }} />
    </div>
  );
}

export function SkeletonBandTile() {
  return (
    <div
      aria-hidden="true"
      style={{
        background: "var(--card)",
        border: "1px solid var(--line-1)",
        borderRadius: "var(--radius-card)",
        padding: "14px 16px 0",
        minHeight: 112,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <span style={{ ...shimmer(), height: 10, width: 60 }} />
      <span style={{ ...shimmer(), height: 34, width: 44 }} />
      <span style={{ ...shimmer(), height: 4, margin: "auto -16px 0" }} />
    </div>
  );
}

export function SkeletonStatBlock() {
  return (
    <div aria-hidden="true" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ ...shimmer(), height: 10, width: 70 }} />
      <span style={{ ...shimmer(), height: 26, width: 40 }} />
    </div>
  );
}

/** A dated rail-card row in its final geometry — the `3px 48px 1fr` band bar / date / obligation
 *  grid artboard 02/id="p2" draws in the "Obligations · next 30 days" card. Same literal-geometry
 *  convention as SkeletonListRow (which repeats ListRow's own grid): the skeleton states the
 *  geometry it is holding open, so nothing jumps when the rows arrive. */
export function SkeletonRailDateRow() {
  return (
    <div
      aria-hidden="true"
      style={{ display: "grid", gridTemplateColumns: "3px 48px 1fr", gap: 10, alignItems: "start", minHeight: 32 }}
    >
      <span style={{ ...shimmer(), alignSelf: "stretch", borderRadius: 2 }} />
      <span style={{ ...shimmer(), height: 12, width: 44 }} />
      <span style={{ ...shimmer(), height: 12, width: "80%" }} />
    </div>
  );
}
