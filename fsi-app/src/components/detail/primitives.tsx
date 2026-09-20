"use client";

/**
 * primitives.tsx: shared detail-surface primitives (lane L34, system health
 * audit 2026-09-17 section 2: "Detail surfaces (MarketSignalDetailSurface,
 * ResearchFindingDetailSurface, RegulationDetailSurface, OperationsDetailSurface,
 * SourcesGrid) | 5 | wire: shared detail primitives; the 107-line block shared
 * by Market and Research is the first cut").
 *
 * Extraction, not redesign: every export here renders the exact DOM and
 * styles the three source files (MarketSignalDetailSurface.tsx,
 * ResearchFindingDetailSurface.tsx, RegulationDetailSurface.tsx) already
 * rendered inline, verified byte-identical before extraction. The shared
 * SourcesGrid module (src/components/detail/SourcesGrid.tsx, lane uidetails2)
 * is the sibling primitive for the "Sources" section; this module covers the
 * record-grade fact display and the jurisdiction-label derivation that were
 * still duplicated per-file.
 *
 * - `jurisLabelOf`: the jurisdiction-label derivation block, byte-identical
 *   across Market, Research and Regulation.
 * - `RecordFactCard`: the record-grade single-fact renderer, byte-identical
 *   across Market, Research and Regulation.
 * - `RecordFactsBody`: the "Key dates" / "Verbatim facts" / tags body,
 *   byte-identical between Market and Research only (Regulation's own
 *   RecordGradeSections carries an additional gaps-count line and a
 *   different tag treatment, so it stays local rather than being forced
 *   onto this shape; forcing it would be a redesign, not an extraction).
 */

import type { ReactNode } from "react";
import { StateNote } from "@/components/ui/StateNote";
import { Absence } from "@/components/ui/Absence";
import { TagChip } from "@/components/ui/Chips";
import { FactCard } from "@/components/ui/FactCard";
import { deriveRecordFactCardModel } from "@/lib/detail/fact-card-model";
import { JURISDICTIONS } from "@/lib/constants";
import { isoToDisplayLabel } from "@/lib/jurisdictions/iso";
import type { RecordFactRow } from "@/lib/agent/parse-record-sections";

/** The subset of Resource this helper reads. Typed narrowly rather than
 *  importing the full Resource type so callers can pass any object shape
 *  that carries these two fields. */
export interface JurisdictionFields {
  jurisdictionIso?: string[] | null;
  jurisdiction?: string | null;
}

/** The jurisdiction-label derivation block, byte-identical across Market,
 *  Research and Regulation before this extraction:
 *    r.jurisdictionIso (mapped via isoToDisplayLabel) if non-empty, else
 *    the JURISDICTIONS lookup for r.jurisdiction, else ["Global"], joined
 *    with " · ". */
export function jurisLabelOf(r: JurisdictionFields): string {
  const jurisdictionLabels =
    r.jurisdictionIso && r.jurisdictionIso.length > 0
      ? r.jurisdictionIso.map(isoToDisplayLabel)
      : r.jurisdiction
      ? [JURISDICTIONS.find((j) => j.id === r.jurisdiction)?.label || r.jurisdiction]
      : ["Global"];
  return jurisdictionLabels.join(" · ");
}

/** One record-grade fact row: a sourced FactCard when the row is a FACT with
 *  a verbatim span, else a plain label/text line. Byte-identical across
 *  Market, Research and Regulation before this extraction. */
export function RecordFactCard({ fact }: { fact: RecordFactRow }) {
  const model = fact.kind === "FACT" ? deriveRecordFactCardModel(fact) : null;
  if (!model) {
    return (
      <p style={{ fontSize: "var(--fs-13)", lineHeight: 1.6, color: "var(--ink-2)", margin: "0 0 8px" }}>
        <strong style={{ color: "var(--ink-3)" }}>{fact.label}:</strong> {fact.text || <Absence reason="not in primary source" />}
      </p>
    );
  }
  return <FactCard model={model} />;
}

/** The record-grade body: lead StateNote, "Key dates" (when present),
 *  "Verbatim facts" (or Absence when empty), and a tag row (when tags are
 *  given). Byte-identical between Market's RecordGradeSections and
 *  Research's ResearchRecordFacts before this extraction: only the lead
 *  note text and the tags source (r.tags vs a `tags` prop) differed, and
 *  both are parameters here. */
export function RecordFactsBody({
  leadNote,
  dateFacts,
  otherFacts,
  tags,
}: {
  leadNote: ReactNode;
  dateFacts: RecordFactRow[];
  otherFacts: RecordFactRow[];
  tags?: string[] | null;
}) {
  return (
    <>
      <StateNote>{leadNote}</StateNote>
      {dateFacts.length > 0 && (
        <div style={{ margin: "14px 0" }}>
          <p style={{ fontSize: "var(--fs-105)", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-3)", margin: "0 0 8px" }}>Key dates</p>
          {dateFacts.map((f) => <RecordFactCard key={f.slotKey} fact={f} />)}
        </div>
      )}
      <div style={{ margin: "14px 0" }}>
        <p style={{ fontSize: "var(--fs-105)", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-3)", margin: "0 0 8px" }}>Verbatim facts</p>
        {otherFacts.length > 0 ? otherFacts.map((f) => <RecordFactCard key={f.slotKey} fact={f} />) : <Absence reason="not in primary source" />}
      </div>
      {tags && tags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {tags.map((t) => <TagChip key={t}>{t}</TagChip>)}
        </div>
      )}
    </>
  );
}
