"use client";

/**
 * CredibilityChipEvidence — the "evidence × agreement" half of spec-03 §4's split credibility model
 * (Score 1, IPCC-shaped). Lane DASH, 2026-09-02. See CredibilityChipShared.tsx's header for exactly
 * which inputs have a live data path today (none — this chip renders "Not scored" until an
 * evidence-synthesis pipeline lands) and which GRADE modifier does (`risk_of_bias`, from
 * `source_bias_tags`).
 *
 * Hover shows the honest reason as a native tooltip (zero-JS, always available); click toggles the
 * GRADE modifier ledger inline, same disclosure pattern ResearchLedger's own FindingRow "+ / –"
 * toggle uses (an absolutely-positioned popover would be clipped — the finding row's containing band
 * body renders with `overflow: hidden`).
 */

import { useState } from "react";
import {
  buildGradeModifiers,
  GradeModifierLedger,
  chipButtonStyle,
  chipPanelStyle,
  type ResearchBiasTag,
} from "./CredibilityChipShared";

export interface CredibilityChipEvidenceProps {
  /** Evidence dimension (limited/medium/robust) — always null today; see file header. */
  evidenceLevel?: "limited" | "medium" | "robust" | null;
  /** Agreement dimension (low/medium/high) — always null today; see file header. */
  agreementLevel?: "low" | "medium" | "high" | null;
  biasTags: ResearchBiasTag[];
}

const NOT_SCORED_REASON =
  "No evidence-synthesis pipeline yet computes n_works, n_independent_groups, n_countries or claim-polarity variance (spec-03 §4 Score 1). Click to see the GRADE modifier ledger this chip already carries.";

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function CredibilityChipEvidence({ evidenceLevel, agreementLevel, biasTags }: CredibilityChipEvidenceProps) {
  const [open, setOpen] = useState(false);
  const scored = evidenceLevel != null && agreementLevel != null;
  const modifiers = buildGradeModifiers(biasTags);
  const flaggedCount = modifiers.filter((m) => m.status === "flagged").length;

  return (
    <span style={{ display: "inline-block" }}>
      <button
        type="button"
        // Row-chip rule (lane CHIPS, 2026-09-05, W3.4): stopPropagation + preventDefault so this
        // chip works when mounted inside an anchor-wrapped row (RegulationsLedger's RegRow,
        // OperationsItemsView's whole-card <Link>) — without it, toggling the chip's own popover
        // would also fire the row's navigation, same hazard PriorityDropdown.tsx's own trigger
        // documents and guards against. A no-op inside ResearchLedger's non-anchor row.
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        title={scored ? "Evidence × agreement (spec-03 §4 Score 1)" : NOT_SCORED_REASON}
        style={chipButtonStyle(scored)}
      >
        Evidence × agreement: {scored ? `${cap(evidenceLevel!)} × ${cap(agreementLevel!)}` : "Not scored"}
        {flaggedCount > 0 ? ` (${flaggedCount})` : ""}
      </button>
      {open && (
        <div role="group" aria-label="Evidence × agreement detail" style={chipPanelStyle}>
          {!scored && (
            <p style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.5, margin: "0 0 4px" }}>
              {NOT_SCORED_REASON}
            </p>
          )}
          <GradeModifierLedger modifiers={modifiers} />
        </div>
      )}
    </span>
  );
}
