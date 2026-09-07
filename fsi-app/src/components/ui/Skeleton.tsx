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

export function SkeletonListRow() {
  return (
    <div
      aria-hidden="true"
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
