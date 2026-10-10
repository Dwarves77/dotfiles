/**
 * InferenceSection (lane P2, 2026-10-05; ADR-044 decision 3): the ONE "Inferences" section every detail page
 * mounts, so a reader sees what the system has inferred about an item, labelled as an inference and never as a
 * fact. It draws the existing `InferenceClaim` part for each inference, with the question that raised it in
 * words above it.
 *
 * WHAT SHOWS. The rows come from `fetchInferencesForItem` (supabase-server.ts): current, not superseded, cited
 * to this item, customer-visible methods only (ADR-039 section (a) keeps the pool-position inference
 * internal), every citation one the customer can open. This component then asks `admissibleForInference`
 * (InferenceClaim.tsx, use "display") about each one, the single gate: a REFUTED claim and an uncited claim
 * never show. With none left the section renders NOTHING, no heading, no empty state ("never break existing
 * display": an item with no inference reads exactly as it did).
 *
 * LABELLING. The section title says Inferences, its aside says machine-written and not facts, a note under the
 * heading says what an inference is, and each card carries its status token, origin, confidence and the titles
 * of the items it cites (InferenceClaim's own rules). Nothing here is a number the reader could mistake for a
 * measurement.
 *
 * OVERFLOW. Each inference sits in a wrapper with `overflow-wrap: anywhere` (an inherited property), so a claim
 * or a cited title with no break opportunity wraps inside the card instead of pushing it past a 375px screen
 * (the first guard run of this lane measured +358px with such a token). InferenceClaim itself is unchanged.
 *
 * No async action and no control: the section is read-only text, so there is nothing to click, wait on or
 * recover from (ux-laws 6, 14, 15 do not apply). The primary reading order is question, then claim.
 *
 * ARTBOARD NOTE (CLAUDE.md rule 20): no artboard draws this section; it is built from existing shell parts
 * (DetailSection, StateNote, InferenceClaim) and recorded as a design change owed.
 */

import { DetailSection } from "@/components/detail/DetailShell";
import { StateNote } from "@/components/ui/StateNote";
import { InferenceClaim, admissibleForInference, type InferenceStatusToken } from "@/components/shared/InferenceClaim";
import { pickVisibleInferences } from "@/lib/detail/inference-view.mjs";

interface InferenceSectionClaim {
  id: string;
  claimText: string;
  statusToken: string;
  confidence: number;
  citedItemIds: string[];
  originClass: string;
  questionText: string | null;
}

export interface InferenceSectionData {
  claims: InferenceSectionClaim[];
  /** id to title of every cited item the customer may see. */
  titles: Record<string, string>;
  /** id to detail-page href of the cited items that have one (DFIX-1, row 05-p2). An item with no entry is plain text. */
  hrefs?: Record<string, string>;
}

/** The InferenceClaim shape of a section claim; the one conversion, also read by the index presence check. */
export function inferenceClaimOf(v: InferenceSectionClaim) {
  return {
    claimText: v.claimText,
    statusToken: v.statusToken as InferenceStatusToken,
    confidence: v.confidence,
    citedItemIds: v.citedItemIds,
    originClass: (v.originClass === "modelled" ? "modelled" : "derived") as "derived" | "modelled",
  };
}

export function InferenceSection({ inferences, index }: { inferences?: InferenceSectionData | null; index?: number | null }) {
  const titles = inferences?.titles ?? {};
  const hrefs = inferences?.hrefs ?? {};
  const visible = pickVisibleInferences(inferences?.claims ?? [], (v) => admissibleForInference(inferenceClaimOf(v), "display").ok);
  if (visible.length === 0) return null;
  return (
    <DetailSection id="inferences" title="Inferences" aside="Machine-written, not facts" index={index}>
      <div data-guard-container="inferences">
        <StateNote>
          These are inferences, not facts. Each one shows its status, its confidence and the items it is drawn from.
        </StateNote>
        {visible.map((v) => (
          <div key={v.id} style={{ marginTop: 14, overflowWrap: "anywhere", minWidth: 0 }}>
            {v.questionText && (
              <p
                data-guard-title
                style={{
                  fontSize: "var(--fs-125)",
                  fontWeight: 700,
                  lineHeight: 1.35,
                  color: "var(--ink)",
                  margin: "0 0 6px",
                  overflowWrap: "anywhere",
                }}
              >
                Question: {v.questionText}
              </p>
            )}
            <InferenceClaim claim={inferenceClaimOf(v)} use="display" resolveCitationTitle={(id) => titles[id] ?? null} resolveCitationHref={(id) => hrefs[id] ?? null} />
          </div>
        ))}
      </div>
    </DetailSection>
  );
}
