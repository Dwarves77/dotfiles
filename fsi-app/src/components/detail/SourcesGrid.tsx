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
import { BiasChips, type BiasTagInput } from "@/components/ui/BiasChips";
import { Absence } from "@/components/ui/Absence";
import { hasBiasTags } from "@/lib/credibility/bias-display.mjs";
import { canonicalizeUrl } from "@/lib/sources/url-canonicalize";

/** A Sources-grid row: the parsed entry plus, for the item's own registered source only, that
 *  source's bias tags (lane P1, 2026-10-05). A row never carries a tag it was not given. */
export type SourceRow = SourceEntry & { biasTags?: BiasTagInput[] | null };

/** Clamp any tier value to the customer-facing 1-7 range (DO-NOT-REVERT).
 *  Exported (lane L34) so RegulationDetailSurface.tsx can drop its own
 *  byte-identical copy and import this one instead of re-declaring it. */
export function clampTier(n: number): number {
  return Math.min(7, Math.max(1, Math.round(n)));
}

/** The item's structured source list: parsed from fullBrief's "## Sources"
 *  block when present, else a single synthetic row from the item's own
 *  url/sourceName/sourceTier fields, else empty (renders Absence). */
export function sourceEntriesOf(r: Resource): SourceRow[] {
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
  if (parsedList.length === 0) {
    return r.url
      ? [
          {
            tier: typeof r.sourceTier === "number" ? r.sourceTier : null,
            name: r.sourceName || r.url,
            meta: r.enforcementBody || "",
            url: r.url,
            biasTags: r.biasTags,
          },
        ]
      : [];
  }
  // The parsed list is read from the brief's own text and carries no source id, so only the entry
  // that IS the item's registered source can take that source's rating: matched by canonical url
  // (the item's source url), else by name. It then shows the same customer tier the row chip and
  // the ActionCard show (admin override included), not the tier the brief text was written with,
  // and that source's bias tags. Every other entry keeps exactly what the brief says, with no bias
  // (nothing is invented for a source this page cannot identify).
  // Lane P2 (coordinator item 5): every OTHER entry is matched to a registered source the item cites
  // (intelligence_item_citations) by canonical url, the same canonicalizeUrl the registry uses. A match shows
  // that source's customer tier and bias; an entry with no match keeps exactly what the brief says.
  const cited = r.citedSources ?? [];
  const primary = primaryEntryIndex(parsedList, r);
  return parsedList.map((e, i): SourceRow => {
    if (i === primary) return { ...e, tier: typeof r.sourceTier === "number" ? r.sourceTier : e.tier, biasTags: r.biasTags };
    const hit = cited.find((c) => sameUrl(c.url, e.url));
    if (!hit) return e;
    return { ...e, tier: hit.tier ?? e.tier, biasTags: hit.biasTags.length > 0 ? hit.biasTags : undefined };
  });
}

function sameUrl(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && canonicalizeUrl(a) === canonicalizeUrl(b);
}

function primaryEntryIndex(entries: SourceEntry[], r: Resource): number {
  const byUrl = entries.findIndex((e) => sameUrl(e.url, r.url));
  if (byUrl >= 0) return byUrl;
  const name = (r.sourceName ?? "").trim().toLowerCase();
  return name ? entries.findIndex((e) => e.name.trim().toLowerCase() === name) : -1;
}

export function SourcesGrid({ rows }: { rows: SourceRow[] }) {
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
              // Lane P1: a source whose tier cannot be derived shows the Absence part (dash form,
              // the narrow tier slot), never a blank. Same slot width as before.
              <span style={{ width: 24, display: "inline-flex", justifyContent: "center", fontSize: "var(--fs-10)" }}>
                <Absence reason="not in primary source" variant="dash" />
              </span>
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
          textDecoration: "none",
          color: "inherit",
          minHeight: 44,
        };
        const cell = s.url ? (
          <a href={s.url} target="_blank" rel="noopener noreferrer" style={cellStyle}>
            {inner}
          </a>
        ) : (
          <div style={cellStyle}>{inner}</div>
        );
        return (
          <div key={i} data-part="source-row" style={{ borderBottom: i < rows.length - 1 ? "1px solid var(--line-3)" : "none" }}>
            {cell}
            {/* Lane P1: this source's bias tags, outside the link (a control must not nest inside an
                anchor), with 8px clear of the link above and the next row below so the disclosure
                button clears the law-2 target floor. Renders nothing when the source has none. */}
            {hasBiasTags(s.biasTags) && (
              <div style={{ margin: "8px 0", paddingLeft: 36 }}>
                <BiasChips tags={s.biasTags} variant="detail" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
