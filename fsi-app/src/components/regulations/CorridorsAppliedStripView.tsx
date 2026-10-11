import Link from "next/link";

export interface CorridorAppliedRow {
  entityId: string;
  label: string;
  jurisdictions: ReadonlyArray<{ code: string; name: string | null }>;
}

interface CorridorsAppliedStripViewProps {
  corridors: ReadonlyArray<CorridorAppliedRow>;
}

export function CorridorsAppliedStripView({ corridors }: CorridorsAppliedStripViewProps) {
  if (!corridors || corridors.length === 0) return null;

  return (
    <div
      data-guard-container
      style={{
        maxWidth: 1180,
        margin: "0 auto",
        padding: "0 var(--cl-detail-pad-x, 24px) 28px",
      }}
    >
      <div
        style={{
          border: "1px solid var(--border-sub, #E3E3E0)",
          borderRadius: "var(--r-md, 8px)",
          background: "var(--surface, #FFFFFF)",
          padding: "14px 16px",
        }}
      >
        <div
          data-guard-title
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--muted, #767671)",
            marginBottom: 10,
          }}
        >
          Corridors this applies on
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {corridors.map((c) => (
            <Link
              key={c.entityId}
              href={`/market#corridor-${encodeURIComponent(c.entityId)}`}
              style={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 8,
                minHeight: 44,
                padding: "6px 8px",
                borderRadius: 6,
                textDecoration: "none",
                color: "var(--text, #17171B)",
                border: "1px solid var(--border-sub, #E3E3E0)",
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 700, overflowWrap: "anywhere", minWidth: 0 }}>{c.label}</span>
              {c.jurisdictions.length > 0 && (
                <span style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {c.jurisdictions.map((j) => (
                    <span
                      key={j.code}
                      style={{
                        fontSize: 10,
                        padding: "2px 7px",
                        border: "1px solid var(--border-sub, #E3E3E0)",
                        borderRadius: 999,
                        background: "var(--bg, #FAFAF8)",
                        color: "var(--text-2, #4A4A46)",
                        fontWeight: 700,
                        letterSpacing: "0.03em",
                      }}
                    >
                      {j.name ? `${j.name} (${j.code})` : j.code}
                    </span>
                  ))}
                </span>
              )}
              <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted, #767671)" }}>
                View on Market Intel &rarr;
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
