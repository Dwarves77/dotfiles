/**
 * CredibilityChipShared — types + the GRADE modifier ledger, shared by CredibilityChipEvidence.tsx
 * and CredibilityChipAuthority.tsx (docs/specs/03-research.md §4 "Credibility: two scores, never
 * merged"). Lane DASH, 2026-09-02.
 *
 * WHAT DATA EXISTS TODAY (read before writing, per this lane's brief — `grep -rn
 * "credib|grade|evidence" src/lib` and the research read path, fetchResearchPipelineRows in
 * src/lib/supabase-server.ts): NEITHER of spec-03 §4's two scores has a data path.
 *   - Score 1 (evidence×agreement, IPCC-shaped) needs n_works / n_independent_groups / n_countries /
 *     evidence-type mix / has_operational_data (evidence dimension) and claim-polarity + estimate
 *     variance + dissent-from-a-high-authority-source (agreement dimension). None of these are
 *     computed or stored anywhere — no evidence-synthesis pipeline exists.
 *   - Score 2 (source authority, computable/free) needs role class, TOPIC-SCOPED institutional/
 *     author standing (OpenAlex), funder independence, and FWCI/citation_normalized_percentile
 *     reception — rendered as a DISTRIBUTION, never a mean. None of these exist either.
 * What DOES exist and is real: `source_bias_tags` (migration 092; funding/methodology/stakeholder
 * dimension + tag + confidence, surfaced as ResearchPipelineItem.biasTags) — a genuine, sourced
 * signal that maps onto exactly one GRADE modifier, "risk of bias". `base_tier`/`effective_tier`
 * (source provenance tier) and `citationCount` also exist, but are NOT source-authority — acceptance
 * criterion 8 explicitly forbids raw `cited_by_count` as a credibility signal, and tier alone is not
 * the multi-component distribution the spec asks for. Both chips below therefore render "Not scored"
 * today, with the GRADE ledger showing biasTags-derived rows as `flagged` and every other GRADE
 * modifier as `not_assessed` — never fabricated, never silently blank.
 */

import { buildGradeModifiers as buildGradeModifiersImpl } from "./credibility-grade-modifiers.mjs";

export type GradeModifierStatus = "flagged" | "not_assessed";

export interface GradeModifier {
  key: string;
  label: string;
  status: GradeModifierStatus;
  /** Human-readable evidence for a `flagged` row; always null for `not_assessed`. */
  detail: string | null;
}

export interface ResearchBiasTag {
  dimension: "funding" | "methodology" | "stakeholder";
  tag: string;
  confidence: number | null;
}

/**
 * The full GRADE-style modifier ledger spec-03 §4 names: indirectness, risk of bias, imprecision,
 * inconsistency, publication bias, and the two upgrades (large effect size, convergent independent
 * evidence). Only "risk of bias" has a live data path today (source_bias_tags); the rest render
 * `not_assessed` — this function is the ONE place that fact is stated, so a future data path lights
 * up its row here rather than requiring a second component to learn the same six-item list.
 *
 * Logic lives in credibility-grade-modifiers.mjs (plain ESM, zero deps; deliberately NOT named
 * CredibilityChipShared.mjs — see that file's header for the webpack same-basename resolution bug
 * that name caused) so it has a portable, DB-free `node --test` proof — this .tsx file cannot itself
 * be imported by that suite once it carries JSX (GradeModifierLedger below). This is a typed
 * pass-through, not a duplicate implementation.
 */
export function buildGradeModifiers(biasTags: ResearchBiasTag[]): GradeModifier[] {
  return buildGradeModifiersImpl(biasTags) as GradeModifier[];
}

export function GradeModifierLedger({ modifiers }: { modifiers: GradeModifier[] }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 5,
        marginTop: 6,
        borderTop: "1px solid var(--color-border-subtle)",
        paddingTop: 6,
      }}
    >
      <p
        style={{
          fontSize: 9,
          fontWeight: 800,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--color-text-muted)",
          margin: "0 0 2px",
        }}
      >
        GRADE modifier ledger
      </p>
      {modifiers.map((m) => (
        <div key={m.key} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
          <span
            style={{
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              minWidth: 62,
              flexShrink: 0,
              color: m.status === "flagged" ? "var(--reg-band-action)" : "var(--color-text-muted)",
            }}
          >
            {m.status === "flagged" ? "Flagged" : "Not assessed"}
          </span>
          <span style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.45, minWidth: 0, overflowWrap: "anywhere" }}>
            <span style={{ fontWeight: 700, color: "var(--color-text-primary)" }}>{m.label}</span>
            {m.detail ? ` — ${m.detail}` : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Shared chip chrome ──

// Law-2 floor (docs/design/ux-laws.md #2): 9.5px text at 2px vertical padding rendered at ~14px
// tall — below the "24px + 8px clearance" alternative to the 44px target size, even though the
// row that hosts these two chips (FindingRow, `gap: 8`) already supplies the 8px clearance.
// `minHeight: 24` + `inline-flex`/`alignItems: center` closes the gap without changing the type
// scale, colour, or the chip's visual chrome (same font-size, padding, border, radius).
export const chipButtonStyle = (scored: boolean): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  minHeight: 24,
  fontFamily: "inherit",
  cursor: "pointer",
  fontSize: 9.5,
  fontWeight: 800,
  letterSpacing: "0.07em",
  textTransform: "uppercase",
  padding: "2px 8px",
  borderRadius: 4,
  border: `1px solid ${scored ? "var(--color-primary)" : "var(--color-border-medium)"}`,
  background: scored ? "var(--color-bg-ai-strip)" : "transparent",
  color: scored ? "var(--color-primary)" : "var(--color-text-muted)",
  whiteSpace: "nowrap",
});

export const chipPanelStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 4,
  padding: "8px 10px",
  border: "1px solid var(--color-border)",
  borderRadius: 6,
  background: "var(--color-bg-base)",
};
