/**
 * SourcesList — §15 Sources tier-tagged citation list.
 *
 * Sprint 3 A5.3 (2026-05-27). Matches the mockup `.sources-list` shape:
 * per-row tier badge + bolded source name + meta line + URL.
 *
 * Tier resolution: prefer the parser-extracted inline tier marker (e.g.
 * "[T2]" prefix). When absent, the entry renders with no tier badge.
 * Operator Q2 confirmed the longer-term path joins
 * intelligence_item_sections.source_ids[] → sources.base_tier — A5.3
 * does NOT yet implement that join (the source_ids column is empty
 * after backfill since the parser doesn't extract UUIDs from markdown).
 * Follow-up dispatch wires the join when source_ids are populated by
 * the per-regeneration agent persist step.
 */

import type { SourceEntry } from "@/lib/agent/extract-regulation-sections";

const TIER_STYLE: Record<number, { fg: string; bg: string }> = {
  1: { fg: "#fff", bg: "var(--color-critical)" },
  2: { fg: "#fff", bg: "var(--color-high)" },
  3: { fg: "var(--color-text-primary)", bg: "var(--color-moderate-bg)" },
  4: { fg: "var(--color-text-primary)", bg: "var(--color-surface-raised)" },
  5: { fg: "var(--color-text-muted)", bg: "var(--color-surface-raised)" },
};

export function SourcesList({ entries }: { entries: SourceEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
      {entries.map((e, i) => {
        const tone = e.tier ? TIER_STYLE[e.tier] : null;
        return (
          <li
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              gap: 10,
              padding: "8px 0",
              borderBottom: i < entries.length - 1 ? "1px solid var(--color-border-subtle)" : "none",
              alignItems: "baseline",
            }}
          >
            {e.tier && tone ? (
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  color: tone.fg,
                  background: tone.bg,
                  padding: "3px 8px",
                  borderRadius: 3,
                  whiteSpace: "nowrap",
                }}
              >
                T{e.tier}
              </span>
            ) : (
              <span style={{ width: 32 }} aria-hidden="true" />
            )}
            <div>
              <p style={{ fontSize: 13.5, fontWeight: 700, color: "var(--color-text-primary)", margin: 0 }}>
                {e.url ? (
                  <a href={e.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-text-primary)", textDecoration: "underline" }}>
                    {e.name}
                  </a>
                ) : (
                  e.name
                )}
              </p>
              {e.meta && (
                <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "2px 0 0" }}>
                  {e.meta}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
