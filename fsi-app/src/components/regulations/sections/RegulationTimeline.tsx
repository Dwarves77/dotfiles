/**
 * RegulationTimeline — §14 Confirmed Regulatory Timeline.
 *
 * Sprint 3 A5.3 (2026-05-27). Matches the mockup `.timeline` shape:
 * date column + label + optional source citation per row. Returns null
 * when entries is empty.
 */

import type { TimelineEntry } from "@/lib/agent/extract-regulation-sections";
import { dropUnbackedRows } from "@/lib/agent/source-entry-filter.mjs";

export function RegulationTimeline({ entries }: { entries: TimelineEntry[] }) {
  // F-1 class guard: never render a timeline row whose event label is empty/header-echo.
  const shown = dropUnbackedRows(entries, "label") as TimelineEntry[];
  if (shown.length === 0) return null;
  return (
    <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
      {shown.map((e, i) => (
        <li
          key={i}
          style={{
            display: "grid",
            gridTemplateColumns: "120px 1fr",
            gap: 16,
            paddingBottom: 10,
            borderBottom: i < shown.length - 1 ? "1px solid var(--color-border-subtle)" : "none",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 13,
              letterSpacing: "0.06em",
              color: "var(--color-primary)",
              whiteSpace: "nowrap",
            }}
          >
            {e.date}
          </span>
          <div>
            <p style={{ fontSize: 14, lineHeight: 1.55, color: "var(--color-text-primary)", margin: 0 }}>
              {e.label}
            </p>
            {e.source && (
              <p style={{ fontSize: 11.5, color: "var(--color-text-muted)", margin: "4px 0 0", fontStyle: "italic" }}>
                Source: {e.source}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
