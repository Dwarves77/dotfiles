/**
 * SectionLabel: a small uppercase in-card section label (e.g. "EXPOSURE", "TIMELINE"). Extracted
 * from ActionCard.tsx and Timeline.tsx (lane W10-ActionCard-b, 2026-09-22): both had typed the
 * identical style object for their own section head after the rendering guard's L7 check caught
 * `var(--font-display)` (Anton) on a label outside the display-typeface allowlist (CLAUDE.md's
 * Design System section: Anton is scoped to page-title/card-title/numerals, never a plain section
 * label); fixing both in place left F45 (duplicate-code) red on the resulting identical block, so
 * this is the one home instead of a second copy.
 */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontFamily: "var(--font-sans)",
        fontSize: 17,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.02em",
        color: "var(--ink)",
        margin: 0,
      }}
    >
      {children}
    </p>
  );
}
