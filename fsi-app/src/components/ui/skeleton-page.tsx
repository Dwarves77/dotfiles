import type { CSSProperties, ReactNode } from "react";

/** A placeholder block in the raised surface colour. */
export function skeletonBox(h: number, w: string | number = "100%"): CSSProperties {
  return { height: h, width: w, borderRadius: 6, background: "var(--color-surface-raised)" };
}

/** The pulsing page frame every route skeleton renders inside (the ledger's max width and padding). */
export function SkeletonPage({ children }: { children: ReactNode }) {
  return (
    <div className="animate-pulse" style={{ maxWidth: 1040, margin: "0 auto", padding: "20px 32px" }}>
      {children}
    </div>
  );
}
