"use client";

/**
 * InlineErrorBanner , shared compact inline error banner (lane M7a, 2026-09-20, F45 dedup fix).
 * Extracted from Spec09CsvUpload.tsx and StatutoryRowsUpload.tsx, which had each grown a byte-near-
 * identical `role="alert"` banner (fontSize 12, padding 10px 12px, borderRadius 6, border/background/
 * color tied to `--color-error`) , reuse-before-construction (fsi-app/.claude/CLAUDE.md).
 *
 * Deliberately distinct from ErrorState.tsx (a full-page centered empty state with an icon and a
 * retry button , AdminTableView.tsx's own header already documents that shape as a non-match for this
 * inline, one-line-or-list banner). `children` lets a caller add detail below the headline message
 * (StatutoryRowsUpload's own violation list).
 */
import type { ReactNode } from "react";

export function InlineErrorBanner({ message, children }: { message: string; children?: ReactNode }) {
  return (
    <div
      role="alert"
      style={{
        fontSize: 12,
        padding: "10px 12px",
        borderRadius: 6,
        border: "1px solid var(--color-error)",
        background: "rgba(220,38,38,0.05)",
        color: "var(--color-error)",
      }}
    >
      {message}
      {children}
    </div>
  );
}
