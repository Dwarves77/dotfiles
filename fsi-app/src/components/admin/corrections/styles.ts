// styles.ts , the one home for the form control styles the Corrections screen shares (lane G7-UI, 2026-10-06).
// The field, the select and the textarea are the same 44 px control; the label is the same small bold caption.
import type { CSSProperties } from "react";

export const fieldStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  minHeight: 44,
  padding: "8px 10px",
  fontSize: 13,
  fontFamily: "inherit",
  border: "1px solid var(--line-1)",
  borderRadius: 6,
};

export const labelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "var(--ink-2)",
  display: "flex",
  flexDirection: "column",
  gap: 4,
};
