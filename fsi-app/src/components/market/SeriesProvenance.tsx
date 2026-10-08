/**
 * SeriesProvenance: the methodology and provenance drawer of spec 02 section 6 item 10 and section 5
 * ("one click from any number"), extracted from MarketSeriesBoard.tsx (lane MKT-1, 2026-10-08) so every
 * Market page that shows a market_series figure mounts the SAME disclosure instead of retyping it.
 *
 * THE MARKUP IS MOVED, NOT CHANGED. `ProvenanceDrawer` is the exact <details> block the board rendered
 * inline under each populated series row, and `ProvenanceFields` is the grid inside it, split out only so
 * a second mount that already owns its own disclosure (the headline ribbon, whose cards are too narrow to
 * open a grid inside) can draw the identical fields. /market/series renders what it rendered before.
 *
 * ONE COMPONENT FOR EVERY FIGURE (operator ruling 2026-10-08, lane MKT-1): the props are a FIGURE ENVELOPE
 * (the spec 00 section 2 fields: derivation, origin class, method version, n, source, licence, plus the
 * rating and as-of date where a figure carries them), not a market_series row. `envelopeFromSeriesRow`
 * adapts a series row for the board and the ribbon; /market/[slug] builds an envelope from the emission
 * factor row or the series behind the price board it actually shows. A field the figure does not carry
 * renders nothing, so a figure with a thin envelope shows a thin drawer, never an invented field.
 *
 * REAL FIELDS ONLY. The registry's own derivation, origin class and licence text plus the row's own
 * envelope columns, never the removed "convergence scoring" claim (spec 02 section 9). A field the row
 * does not carry renders nothing (MethodRow), never a padded dash.
 *
 * Server component, no client state, no fetch.
 */

import type { MarketSeriesDisplayRow } from "@/lib/supabase-server";

/** The slice of a producer group (or a series-registry.mjs entry) the series adapter reads. */
export interface SeriesProducerRef {
  sourceUrl: string;
  licenceStatus: string;
  sourceName: string;
}

/** The envelope of one figure (spec 00 section 2). Every field is optional: the drawer states what the
 *  figure carries and nothing else. */
export interface FigureEnvelope {
  derivation?: string | null;
  originClass?: string | null;
  methodVersion?: string | null;
  nObservations?: number | null;
  sourceKey?: string | null;
  sourceRef?: string | null;
  /** Where the source ref links to, when it can. */
  sourceUrl?: string | null;
  licence?: string | null;
  attribution?: string | null;
  /** The source rating the figure carries, already formatted (for example "T3"). */
  sourceTier?: string | null;
  /** The date the source asserted the value (an as-at date or a release date). */
  asOf?: string | null;
}

/** A market_series display row plus its producer, as a figure envelope (exactly what the series board has
 *  always drawn: licence and attribution come from the registry producer). */
export function envelopeFromSeriesRow(
  row: Pick<MarketSeriesDisplayRow, "derivation" | "originClass" | "methodVersion" | "nObservations" | "sourceKey" | "sourceRef">,
  producer: SeriesProducerRef | null,
): FigureEnvelope {
  return {
    derivation: row.derivation,
    originClass: row.originClass,
    methodVersion: row.methodVersion,
    nObservations: row.nObservations,
    sourceKey: row.sourceKey,
    sourceRef: row.sourceRef,
    sourceUrl: producer?.sourceUrl ?? null,
    licence: producer?.licenceStatus ?? null,
    attribution: producer ? `${producer.sourceName}. ${producer.licenceStatus}.` : null,
  };
}

/** The licence gate's entry for a source (licence_clear_sources), as /market/[slug] reads it. */
export interface SourceLicence {
  name: string | null;
  attribution: string | null;
  licence: string | null;
  url: string | null;
}

/** An emission factor row (migration 258 envelope columns) as a figure envelope, with its source's licence
 *  and attribution from the licence gate. A column the row does not carry stays out of the drawer. */
export function envelopeFromFactorRow(
  f: {
    source_key: string;
    tier?: string | null;
    derivation?: string | null;
    origin_class?: string | null;
    method_version?: string | null;
    n_observations?: number | null;
    as_at_date?: string | null;
  },
  licences: Record<string, SourceLicence>,
): FigureEnvelope {
  const lic = licences[f.source_key];
  return {
    derivation: f.derivation ?? null,
    originClass: f.origin_class ?? null,
    methodVersion: f.method_version ?? null,
    nObservations: f.n_observations ?? null,
    sourceKey: f.source_key,
    sourceUrl: lic?.url ?? null,
    licence: lic?.licence ?? null,
    attribution: lic?.attribution ?? null,
    sourceTier: f.tier ?? null,
    asOf: f.as_at_date ?? null,
  };
}

/** A published price statistic (migration 151) as a figure envelope. That table carries only a source
 *  rating and a release date, so those are the only fields the drawer shows for it; the richer envelope
 *  comes from the series behind the board when the item is one of the ratified series items. */
export function envelopeFromPriceStat(stat: { sourceTier?: number | null; releasedAt?: string | null }): FigureEnvelope {
  return {
    sourceTier: stat.sourceTier != null ? `T${stat.sourceTier}` : null,
    asOf: stat.releasedAt ?? null,
  };
}

export function ProvenanceDrawer({ envelope }: { envelope: FigureEnvelope }) {
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
      <ProvenanceFields envelope={envelope} />
    </details>
  );
}

/** The fields grid: one row per known field, in the order the series board has always shown them. */
export function ProvenanceFields({ envelope }: { envelope: FigureEnvelope }) {
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
      <MethodRow k="Derivation" v={envelope.derivation} />
      <MethodRow k="Origin class" v={envelope.originClass} />
      <MethodRow k="Method version" v={envelope.methodVersion} />
      <MethodRow k="Observations (n)" v={envelope.nObservations != null ? String(envelope.nObservations) : null} />
      <MethodRow k="Source key" v={envelope.sourceKey} />
      <MethodRow
        k="Source ref"
        v={envelope.sourceRef}
        href={envelope.sourceRef && envelope.sourceUrl ? envelope.sourceUrl : undefined}
      />
      <MethodRow k="Licence" v={envelope.licence} />
      <MethodRow k="Attribution" v={envelope.attribution} />
      <MethodRow k="Source rating" v={envelope.sourceTier} />
      <MethodRow k="As of" v={envelope.asOf} />
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
          // gives it a 25px target and changes nothing else about the row.
          <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", display: "inline-block", padding: "7px 0" }}>
            {v}
          </a>
        ) : (
          v
        )}
      </span>
    </>
  );
}
