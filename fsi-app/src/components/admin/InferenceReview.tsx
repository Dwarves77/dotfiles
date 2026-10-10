/**
 * InferenceReview, the operator surface for `inference_records` (migration 338/339, ADR-036). Lists
 * every CURRENT (not superseded) inference: status token, confidence, citations. NO edit actions this
 * pass (coordinator ruling 2026-09-29: "it lists inference_records with status token, confidence and
 * citations; no edit actions this pass"), a read-only diagnostic screen, the same posture
 * `src/app/admin/factors/page.tsx` documents for `emission_factors` ("no mutation controls... inserts/
 * corrections belong to the seeders and the append-only trigger, never a screen"), applied here to a
 * table whose only legal writer is the governed drain (migration 339's `register_inference_record()`).
 *
 * REUSE-BEFORE-CONSTRUCTION (lane-common-contract item 6, prior art checked before writing this file):
 * `AdminTableView.tsx`'s "Family B" primitives (`AdminPanelFrame`, `AdminPanelMetaText`,
 * `AdminEmptyDashedFrame`) are the EXACT panel-frame + header-bar + dashed-empty-state shape
 * `src/app/admin/factors/page.tsx` and `CorpusTurnPanel.tsx` already extracted from; this file reuses
 * them rather than re-inlining the same styles a third time (F45's duplicate-code ratchet caught the
 * first draft doing exactly that). Renders each row through `src/components/shared/InferenceClaim.tsx`
 * (built this same lane) rather than a bespoke row treatment, DP-2/law-16 (pattern consistency): a
 * status-token badge and a confidence readout should look and behave the same everywhere
 * `inference_records` is shown, on this admin surface and on any future customer surface that renders
 * the same component.
 */
import { InferenceClaim, type InferenceRecord } from "@/components/shared/InferenceClaim";
import { AdminPanelFrame, AdminPanelMetaText, AdminEmptyDashedFrame } from "@/components/admin/AdminTableView";

export interface InferenceReviewRow {
  inference_id: string;
  subject_id: string | null;
  claim_text: string;
  status_token: "CONFIRMED" | "HYPOTHESIS" | "REFUTED";
  confidence: number;
  cited_item_ids: string[];
  origin_class: "derived" | "modelled";
  trigger_question_ref: string | null;
  computed_at: string;
}

interface InferenceReviewProps {
  rows: InferenceReviewRow[];
  /** item_id -> title, for the citation list under each claim. Built by the page (a single batched
   *  intelligence_items read), never fabricated here, an id with no resolved title falls back to the
   *  bare id (InferenceClaim's own contract). */
  itemTitles: Record<string, string>;
}

function rowToClaim(row: InferenceReviewRow): InferenceRecord {
  return {
    claimText: row.claim_text,
    statusToken: row.status_token,
    confidence: row.confidence,
    citedItemIds: row.cited_item_ids,
    originClass: row.origin_class,
  };
}

export function InferenceReview({ rows, itemTitles }: InferenceReviewProps) {
  return (
    <AdminPanelFrame
      title="inference_records"
      right={<AdminPanelMetaText>migration 338/339 - read-only - written only by the governed drain</AdminPanelMetaText>}
    >
      {rows.length === 0 ? (
        <AdminEmptyDashedFrame title="No inferences yet.">
          <code>inference_records</code> (migration 338/339) fills as the learning loop&apos;s S/M steps
          (trigger questions, then the drain&apos;s recompute pass) run for real, against the live corpus.
          Empty here is the honest state, not a broken page.
        </AdminEmptyDashedFrame>
      ) : (
        <div style={{ padding: 16, display: "grid", gap: 12 }}>
          {rows.map((row) => (
            <div key={row.inference_id}>
              <InferenceClaim
                claim={rowToClaim(row)}
                resolveCitationTitle={(id) => itemTitles[id] ?? null}
                use="display"
              />
              <div style={{ fontSize: 10.5, color: "var(--text-2)", marginTop: 4 }}>
                {row.subject_id ? `subject: ${row.subject_id} - ` : ""}
                computed {row.computed_at}
                {row.trigger_question_ref ? ` - from question ${row.trigger_question_ref}` : ""}
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminPanelFrame>
  );
}
