import type { CSSProperties } from "react";

/** README section 0.4 type scale: card/section titles 20px, Anton, uppercase, 0.04em, --ink. */
export const SECTION_TITLE_STYLE: CSSProperties = {
  fontFamily: "var(--font-display)",
  fontWeight: 400,
  fontSize: 20,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  margin: 0,
  color: "var(--ink)",
};
