"use client";

/**
 * FilePickRow , shared "choose a file, or paste text below" row (lane M7a, 2026-09-20, F45 dedup
 * fix). Extracted from Spec09CsvUpload.tsx and StatutoryRowsUpload.tsx, which had each grown a
 * byte-near-identical choose-file label + hidden file input + "or paste ... below" caption , reuse-
 * before-construction (fsi-app/.claude/CLAUDE.md), applied once F45's duplicate-code gate flagged the
 * clone rather than left as two copies drifting apart.
 *
 * Renders the exact DOM/markup both callers already used (verified byte-identical apart from the
 * label text, accept filter, and an optional leading icon before extraction).
 */
import type { ReactNode } from "react";

export function FilePickRow({
  label,
  hint,
  accept,
  onFile,
  icon,
  inputRef,
}: {
  /** Button text, e.g. "Choose CSV file" or "Choose rows-file JSON". */
  label: string;
  /** Caption to the right of the button, e.g. "or paste CSV text below". */
  hint: string;
  accept: string;
  onFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  icon?: ReactNode;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
      <label
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          minHeight: 44,
          padding: "0 16px",
          borderRadius: 6,
          border: "1px solid var(--color-border-medium)",
          background: "var(--surface)",
          color: "var(--color-text-primary)",
          fontSize: 12.5,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        {icon}
        {label}
        <input ref={inputRef} type="file" accept={accept} onChange={onFile} style={{ display: "none" }} />
      </label>
      <span style={{ fontSize: 10.5, color: "var(--color-text-muted)" }}>{hint}</span>
    </div>
  );
}
