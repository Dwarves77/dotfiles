import type { ReactNode } from "react";
import { formatNumber } from "@/lib/format";

export function MoreBelowDisclosure({
  count,
  itemNoun = "more",
  children,
}: {
  /** Hidden-row count. Renders nothing (not even a placeholder) when 0 — see ux-laws honest-state rule. */
  count: number;
  /** e.g. "more series", "more items" — defaults to "more". */
  itemNoun?: string;
  /** The hidden rows themselves. Rendered inside the disclosure body, revealed on activation. */
  children: ReactNode;
}) {
  if (count <= 0) return null;
  return (
    <details className="cl-more-below" style={{ marginTop: 10 }}>
      <summary
        style={{
          cursor: "pointer",
          listStyle: "none",
          display: "inline-flex",
          alignItems: "center",
          minHeight: 44,
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--color-primary, #1a5fb4)",
        }}
      >
        {formatNumber(count)} {itemNoun} below
      </summary>
      <div style={{ marginTop: 8 }}>{children}</div>
    </details>
  );
}
