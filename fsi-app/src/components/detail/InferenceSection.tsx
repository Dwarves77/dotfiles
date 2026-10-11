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
