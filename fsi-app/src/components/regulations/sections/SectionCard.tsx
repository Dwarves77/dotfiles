/**
 * SectionCard — wrapper for the 7 §-numbered regulation sections.
 *
 * Sprint 3 A5.3 (2026-05-27). Matches the design_handoff_2026-05
 * regulations-detail.html `.sec` pattern:
 *   - left-aligned numbered badge (e.g. "§3")
 *   - heading row with `Always · N` chip on the right
 *   - body slot for the section-specific renderer
 */

interface SectionCardProps {
  /** Numeric section ref (e.g., "3", "8", "14") rendered in the badge. */
  sectionKey: string;
  /** Section title — pulled from the row's heading text or a fallback label. */
  heading: string;
  /** Right-aligned tag like "Always · 3" or "Always · 6 sources". */
  tag?: string;
  /** id used for in-page anchors (e.g., "section-3"). */
  id?: string;
  children: React.ReactNode;
}

export function SectionCard({ sectionKey, heading, tag, id, children }: SectionCardProps) {
  return (
    <section
      id={id ?? `section-${sectionKey}`}
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)",
        marginBottom: 14,
        boxShadow: "var(--shadow-card)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 22px",
          background: "var(--color-bg-raised)",
          borderBottom: "1px solid var(--color-border-subtle)",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 13,
            fontWeight: 400,
            letterSpacing: "0.08em",
            color: "#fff",
            background: "var(--color-primary)",
            padding: "4px 10px",
            borderRadius: 3,
            minWidth: 36,
            textAlign: "center",
            lineHeight: 1.1,
          }}
        >
          §{sectionKey}
        </span>
        <span style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-text-primary)" }}>
          {heading}
        </span>
        {tag && (
          <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--color-text-muted)", fontWeight: 600 }}>
            {tag}
          </span>
        )}
      </div>
      <div style={{ padding: "18px 22px 22px" }}>{children}</div>
    </section>
  );
}
