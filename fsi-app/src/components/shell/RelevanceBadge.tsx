import type { ItemRelevance } from "@/lib/workspace/profile";

const BAND_COLOR: Record<ItemRelevance["band"], string> = {
  high: "var(--accent)",
  medium: "var(--moderate)",
  low: "var(--muted)",
};
const BAND_LABEL: Record<ItemRelevance["band"], string> = {
  high: "High relevance",
  medium: "Some relevance",
  low: "General applicability",
};

export function RelevanceBadge({ relevance }: { relevance: ItemRelevance | null }) {
  if (!relevance) return null;
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border-sub)",
        borderRadius: "var(--r-md)",
        padding: "10px 14px",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span
        style={{
          fontSize: 9,
          fontWeight: 800,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          padding: "2px 8px",
          borderRadius: 999,
          background: BAND_COLOR[relevance.band],
          color: "var(--surface)",
          whiteSpace: "nowrap",
        }}
      >
        {BAND_LABEL[relevance.band]}
      </span>
      <span style={{ fontSize: 11.5, lineHeight: 1.4, color: "var(--text-2)" }}>{relevance.summary}</span>
    </div>
  );
}
