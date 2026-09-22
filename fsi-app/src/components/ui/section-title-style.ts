// section-title-style.ts (lane W10-SectionHeader, 2026-09-22, F45 duplicate-code: SectionHeader.tsx
// and SectionHeading.tsx both render an Anton, uppercase, 20px, 0.04em, --ink section title h2 -
// two different components for two different roles (ruling 1, 2026-09-20: SectionHeader carries a
// rule under the whole header block, SectionHeading carries none, ruling 4.1/5.1), but the shared
// TITLE TYPE ITSELF is one style, extracted here once rather than duplicated inline in both files.

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
