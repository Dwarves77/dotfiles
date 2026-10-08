/**
 * SeriesProvenance: the methodology and provenance drawer of spec 02 section 6 item 10 and section 5
 * ("one click from any number"), extracted from MarketSeriesBoard.tsx (lane MKT-1, 2026-10-08) so every
 * Market page that shows a market_series figure mounts the SAME disclosure instead of retyping it.
 *
 * THE MARKUP IS MOVED, NOT CHANGED. `SeriesProvenanceDrawer` is the exact <details> block the board
 * rendered inline under each populated series row, and `SeriesProvenanceFields` is the grid inside it,
 * split out only so a second mount that already owns its own disclosure (the headline ribbon, whose
 * cards are too narrow to open a grid inside) can draw the identical fields. MarketSeriesBoard imports
 * the drawer; /market/series renders byte-for-byte what it rendered before.
 *
 * REAL FIELDS ONLY. The registry's own derivation, origin class and licence text plus the row's own
 * envelope columns, never the removed "convergence scoring" claim (spec 02 section 9). A field the row
 * does not carry renders nothing (MethodRow), never a padded dash.
 *
 * Server component, no client state, no fetch.
 */

import type { MarketSeriesDisplayRow, MarketSeriesProducerGroup } from "@/lib/supabase-server";

/** The slice of a producer group (or a series-registry.mjs entry) the drawer reads. */
export type SeriesProducerRef = Pick<MarketSeriesProducerGroup, "sourceUrl" | "licenceStatus" | "sourceName">;

export function SeriesProvenanceDrawer({ row, producer }: { row: MarketSeriesDisplayRow; producer: SeriesProducerRef | null }) {
  return (
    <details style={{ marginTop: 4 }}>
      <summary
        style={{
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: "0.04em",
          color: "var(--color-text-secondary)",
          cursor: "pointer",
        }}
      >
        Methodology &amp; provenance
      </summary>
      <SeriesProvenanceFields row={row} producer={producer} />
    </details>
  );
}

/** The fields grid: one row per known field, in the order the series board has always shown them. */
export function SeriesProvenanceFields({ row, producer }: { row: MarketSeriesDisplayRow; producer: SeriesProducerRef | null }) {
  return (
    <div
      data-audit="series-provenance-fields"
      style={{
        marginTop: 6,
        padding: "8px 10px",
        border: "1px solid var(--color-border-subtle)",
        borderRadius: 6,
        background: "var(--color-bg-base)",
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        rowGap: 3,
        columnGap: 8,
        fontSize: 10,
      }}
    >
      <MethodRow k="Derivation" v={row.derivation} />
      <MethodRow k="Origin class" v={row.originClass} />
      <MethodRow k="Method version" v={row.methodVersion} />
      <MethodRow k="Observations (n)" v={row.nObservations != null ? String(row.nObservations) : null} />
      <MethodRow k="Source key" v={row.sourceKey} />
      <MethodRow
        k="Source ref"
        v={row.sourceRef}
        href={row.sourceRef && producer?.sourceUrl ? producer.sourceUrl : undefined}
      />
      <MethodRow k="Licence" v={producer?.licenceStatus} />
      <MethodRow k="Attribution" v={producer ? `${producer.sourceName}. ${producer.licenceStatus}.` : null} />
    </div>
  );
}

/** One methodology-drawer row. Renders nothing (not an empty dash) when the field is absent: a drawer
 *  states what it knows, never pads out fields the row does not carry. */
function MethodRow({ k, v, href }: { k: string; v: string | null | undefined; href?: string }) {
  if (!v) return null;
  return (
    <>
      <span style={{ color: "var(--color-text-muted)", fontWeight: 700, whiteSpace: "nowrap" }}>{k}</span>
      <span style={{ color: "var(--color-text-secondary)", wordBreak: "break-word" }}>
        {href ? (
          // Law 2 target floor (lane MKT-1): the bare inline link measured 86 by 12px; the padding
          // gives it a 24px target and changes nothing else about the row.
          <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", display: "inline-block", padding: "6px 0" }}>
            {v}
          </a>
        ) : (
          v
        )}
      </span>
    </>
  );
}
