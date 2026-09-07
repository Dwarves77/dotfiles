/**
 * SourcesGrid — shared "Sources" section body for the detail surfaces
 * (UI system handoff 2026-09-06, README §0.5: sections of fact cards ->
 * rail, the sources list belongs to the last section index entry on every
 * surface).
 *
 * Lane uidetails2 (2026-09-07): extracted from RegulationDetailSurface's
 * page-local `sourceEntriesOf`/`SourcesGrid` pair so market/research/
 * operations detail (this lane's scope) don't each carry a third copy of
 * the same structured-sources list (the #172 "never a raw dump" pattern).
 * `RegulationDetailSurface.tsx` itself is out of this lane's stated scope
 * (only its DetailShell-contract change — list/pos/of — is touched) and is
 * left calling its own inline copy; logged in DEVIATION-LOG.md as a
 * follow-up so a future lane can fold it onto this shared one too.
 */

import type { Resource } from "@/types/resource";
import { extractRegulationSections, type SourceEntry } from "@/lib/agent/extract-regulation-sections";

/** Clamp any tier value to the customer-facing 1-7 range (DO-NOT-REVERT). */
function clampTier(n: number): number {
  return Math.min(7, Math.max(1, Math.round(n)));
}

/** The item's structured source list: parsed from fullBrief's "## Sources"
 *  block when present, else a single synthetic row from the item's own
 *  url/sourceName/sourceTier fields, else empty (renders Absence). */
export function sourceEntriesOf(r: Resource): SourceEntry[] {
  let parsedList: SourceEntry[] = [];
  if (r.fullBrief) {
    const map = extractRegulationSections(r.fullBrief);
    for (const section of Object.values(map)) {
      if (section && section.kind === "sources_list") {
        parsedList = section.entries;
        break;
      }
    }
  }
  return parsedList.length > 0
    ? parsedList
    : r.url
    ? [{ tier: typeof r.sourceTier === "number" ? r.sourceTier : null, name: r.sourceName || r.url, meta: r.enforcementBody || "", url: r.url }]
    : [];
}

export function SourcesGrid({ rows }: { rows: SourceEntry[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {rows.map((s, i) => {
        const inner = (
          <>
            {typeof s.tier === "number" ? (
              <span style={{ fontSize: "var(--fs-10)", fontWeight: 800, padding: "3px 7px", borderRadius: 4, border: "1px solid var(--line-1)", color: "var(--ink-2)" }}>
                T{clampTier(s.tier)}
              </span>
            ) : (
              <span aria-hidden style={{ width: 24 }} />
            )}
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: "var(--fs-125)", fontWeight: 700, margin: 0, color: "var(--ink)", overflowWrap: "anywhere" }}>{s.name}</p>
              {s.meta && <p style={{ fontSize: "var(--fs-11)", color: "var(--ink-3)", margin: "2px 0 0" }}>{s.meta}</p>}
            </div>
          </>
        );
        const cellStyle: React.CSSProperties = {
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: 12,
          alignItems: "baseline",
          padding: "11px 0",
          borderBottom: i < rows.length - 1 ? "1px solid var(--line-3)" : "none",
          textDecoration: "none",
          color: "inherit",
          minHeight: 44,
        };
        return s.url ? (
          <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" style={cellStyle}>
            {inner}
          </a>
        ) : (
          <div key={i} style={cellStyle}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}
