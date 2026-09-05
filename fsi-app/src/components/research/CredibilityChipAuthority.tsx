"use client";

/**
 * CredibilityChipAuthority — the "source authority" half of spec-03 §4's split credibility model
 * (Score 2, computable/free). Lane DASH, 2026-09-02. Kept a SEPARATE component and a separate chip
 * from CredibilityChipEvidence, per §4's own framing: "a vendor consortium producing internally
 * consistent robust evidence must read as *high evidence, low independence*, in one glance" — the
 * two scores share a row but must never be collapsed into one chip.
 *
 * See CredibilityChipShared.tsx's header for the full read-path audit. Short version: no component
 * of Score 2 (role class, TOPIC-SCOPED institutional/author standing, funder independence,
 * FWCI/percentile reception, integrity) is computed anywhere. `sourceTier` and `citationCount` DO
 * exist (source registry tier; get_source_citation_stats), but rendering either AS the authority
 * score would violate the spec directly — acceptance criterion 8 forbids raw `cited_by_count` as a
 * credibility signal, and a bare tier number is not the multi-component DISTRIBUTION §4 asks for
 * ("3 high-authority independent, 1 medium, 2 vendor-flagged... a mean hides the one dissenting
 * national lab"). So this chip always renders "Not scored", and its expand panel shows the six
 * components §4 names, each `not assessed`, plus the two real signals as explicitly labeled RAW
 * context — never presented as the score itself.
 *
 * The GRADE modifier ledger (spec-03 §4) is an evidence-confidence framework (indirectness, risk of
 * bias, imprecision, inconsistency, publication bias, upgrades) — it modifies Score 1, not Score 2,
 * so it lives on CredibilityChipEvidence, not here; this panel cross-references it instead of
 * duplicating it.
 */

import { useState } from "react";
import { chipButtonStyle, chipPanelStyle } from "./CredibilityChipShared";

export interface CredibilityChipAuthorityProps {
  /** Always null today — no distribution is computed; see file header. */
  authorityDistribution?: { highAuthorityIndependent: number; medium: number; vendorFlagged: number } | null;
  /** Real signal, NOT the authority score — source registry tier, clamped 1-7. */
  sourceTier?: number | null;
  /** Real signal, NOT the authority score — raw citation count (never rendered as credibility itself). */
  citationCount?: number | null;
}

const AUTHORITY_COMPONENTS = [
  { key: "role_class", label: "Role class (university / national lab / standards body / vendor / …)" },
  { key: "institutional_standing", label: "Institutional standing (topic-scoped, not brand)" },
  { key: "author_standing", label: "Author standing (topic-scoped in-topic works, FWCI, h-index)" },
  { key: "funder_independence", label: "Funding independence" },
  { key: "reception", label: "Reception (FWCI / citation_normalized_percentile, never raw citation count)" },
  { key: "integrity", label: "Integrity (retraction, corrections, predatory-venue flag)" },
];

const NOT_SCORED_REASON =
  "No OpenAlex/ROR-backed role-class, topic-scoped standing, or funder-independence computation exists yet (spec-03 §4 Score 2). Source tier and citation count are raw registry signals, not this score — acceptance criterion 8 forbids rendering raw citation count as credibility.";

export function CredibilityChipAuthority({
  authorityDistribution,
  sourceTier,
  citationCount,
}: CredibilityChipAuthorityProps) {
  const [open, setOpen] = useState(false);
  const scored = !!authorityDistribution;
  const label = scored
    ? `${authorityDistribution!.highAuthorityIndependent} high-authority · ${authorityDistribution!.medium} medium · ${authorityDistribution!.vendorFlagged} vendor-flagged`
    : "Not scored";

  const tier = typeof sourceTier === "number" ? Math.max(1, Math.min(7, Math.round(sourceTier))) : null;

  return (
    <span style={{ display: "inline-block" }}>
      <button
        type="button"
        // Row-chip rule (lane CHIPS, 2026-09-05, W3.4): same anchor-safe stopPropagation as
        // CredibilityChipEvidence.tsx — see that file's comment for the full rationale.
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        title={scored ? "Source authority (spec-03 §4 Score 2)" : NOT_SCORED_REASON}
        style={chipButtonStyle(scored)}
      >
        Source authority: {label}
      </button>
      {open && (
        <div role="group" aria-label="Source authority detail" style={chipPanelStyle}>
          {!scored && (
            <p style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.5, margin: "0 0 6px" }}>
              {NOT_SCORED_REASON}
            </p>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: (tier != null || citationCount != null) ? 8 : 0 }}>
            {AUTHORITY_COMPONENTS.map((c) => (
              <div key={c.key} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 800,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    minWidth: 90,
                    flexShrink: 0,
                    color: "var(--color-text-muted)",
                  }}
                >
                  Not assessed
                </span>
                <span style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.45 }}>{c.label}</span>
              </div>
            ))}
          </div>
          {(tier != null || citationCount != null) && (
            <p style={{ fontSize: 10.5, color: "var(--color-text-muted)", lineHeight: 1.5, margin: 0, borderTop: "1px solid var(--color-border-subtle)", paddingTop: 6 }}>
              Raw signals on record (not this score): {tier != null ? `source tier T${tier}` : null}
              {tier != null && citationCount != null ? " · " : ""}
              {citationCount != null ? `${citationCount} citation${citationCount === 1 ? "" : "s"}` : null}
            </p>
          )}
        </div>
      )}
    </span>
  );
}
