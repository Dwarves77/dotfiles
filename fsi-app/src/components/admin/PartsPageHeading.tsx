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
