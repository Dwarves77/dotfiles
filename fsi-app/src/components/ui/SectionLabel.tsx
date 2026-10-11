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
