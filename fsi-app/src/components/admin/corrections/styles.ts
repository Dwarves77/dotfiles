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
