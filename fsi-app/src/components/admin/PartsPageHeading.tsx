/**
 * PartsPageHeading (lane W10-CommandBar-parts, 2026-09-23). Extracted from the identical heading
 * block `/admin/parts/masthead/page.tsx` and `/admin/parts/command-bar/page.tsx` each retyped
 * (F45 duplicate-code caught the second copy: +18 duplicated lines on this branch vs its merge-base).
 * Every `/admin/parts/<slug>` sign-off page's own one-line summary heading ("N states, frozen real
 * record ..., no database read") is this ONE component now, not a hand-typed `<h1>` per page.
 */
export function PartsPageHeading({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: "28px 36px 0" }}>
      <h1
        style={{
          fontSize: "var(--fs-13)",
          fontWeight: 800,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: "var(--ink-3)",
          margin: "0 0 4px",
        }}
      >
        {children}
      </h1>
    </div>
  );
}
