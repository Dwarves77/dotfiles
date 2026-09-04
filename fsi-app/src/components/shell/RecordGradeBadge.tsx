/**
 * RecordGradeBadge — Lane POP (2026-09-01, migration 278 `intelligence_items.item_grade`).
 *
 * Operator ruling (system-review-2026-09-01.md): record-grade items MAY appear on customer surfaces,
 * as long as they are LABELED. A record-grade item carries only deterministically extracted FACT/GAP
 * spans (title/identity/date/scope — see src/lib/intake/record-facts.mjs) with no synthesized brief;
 * this badge is the label. Renders nothing for the historical "brief" grade (the default — see
 * Resource.itemGrade in src/types/resource.ts) or when the grade is not yet known/projected by a
 * surface's mapper (undefined), matching the fail-open posture other lens badges in this directory use
 * (e.g. RelevanceBadge: absent signal renders nothing, never a placeholder).
 *
 * REWORDED (RECORD-SURFACE lane, 2026-09-04): the operator's own screenshot showed this badge as the
 * ONLY content on the page — the Summary tab below it was empty (see this lane's report / the record-
 * grade Summary renderer this same lane built for RegulationDetailSurface.tsx et al.). The original
 * copy ("extracted facts only, full brief pending") read as an apology for missing content because
 * there WAS no content rendered next to it. Now that the Summary tab renders the extracted facts
 * themselves (and carries its own reworded explanation of what a catalogue record is and that a full
 * brief is a separate, later upgrade — see RecordGradeSummary/RecordFactsCard/ResearchRecordFacts),
 * this pill's own job shrinks back to what a header chip is FOR: a terse label, not a sentence. The
 * full explanation lives in the tooltip (`title`) and in the Summary tab's own prose, never squeezed
 * into the pill text itself — a first pass at a longer pill label ("Catalogue record — verified facts,
 * source-quoted") overflowed the header row at a 375px viewport on all three surfaces this lane wired
 * it into (caught by this lane's own detail-surfaces-smoke.mjs record-grade fixture, not by inspection).
 *
 * Server component (no client state), styled like RelevanceBadge/TierBadge — a small pill, not a full
 * card, so it reads naturally in either a header chip row or the meta rail.
 */

export function RecordGradeBadge({ itemGrade }: { itemGrade?: "record" | "brief" }) {
  if (itemGrade !== "record") return null;
  return (
    <span
      title="Catalogue record: every fact below is quoted directly from the source document. A synthesized full brief is a separate, later upgrade for this item."
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        padding: "5px 10px",
        borderRadius: 4,
        border: "1px solid var(--moderate)",
        color: "var(--moderate)",
        background: "transparent",
        whiteSpace: "nowrap",
      }}
    >
      Catalogue record
    </span>
  );
}
