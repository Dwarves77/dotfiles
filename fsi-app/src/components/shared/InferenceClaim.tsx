"use client";

/**
 * InferenceClaim, M, learning-loop-design-2026-09-25.md section 6 ("a component analogous to
 * EstimatedFigure for narrative claims with mandatory status token and citations"), ADR-036 decision 2.
 * Renders one `inference_records` row (migration 338): a machine-written NARRATIVE claim, never a bare
 * numeric figure, see src/components/figures/EstimatedFigure.tsx for that sibling.
 *
 * WRITE-SET COORDINATION NOTE (per this lane's dispatch): src/components/shared/ is lane W2-C's write
 * set for absence wording; this lane (W2-G) adds ONLY this one new file here, per the coordinator's
 * explicit carve-out in wave2b-lanes-2026-09-29.md's W2-G row. No other file in this directory is
 * touched.
 *
 * TWO RULES ENFORCED HERE, NEVER LEFT TO THE CALLER (mirrors EstimatedFigure's own header framing):
 *   1. A status token ALWAYS renders (CLAUDE.md rule 14, every finding carries CONFIRMED/HYPOTHESIS/
 *      REFUTED, and a HYPOTHESIS is spoken as one in prose, never presented flatly as a measurement).
 *      A REFUTED claim never renders as a live inference at all (see admissibleForInference below), *      it is corrected-in-place history, not a thing to act on.
 *   2. `cited_item_ids` ALWAYS renders alongside the claim (migration 338's own non-empty CHECK, an
 *      uncited inference cannot exist in the table, but this component still refuses to render a claim
 *      object that somehow arrives with an empty citation list, the same defensive posture
 *      EstimatedFigure applies to figure.value).
 *
 * THE GATE. inference_records carries no half_life_days/asserted_at decay column (migration 338's own
 * header: the M pass models a static confidence, not a decay curve, the L pass, not built in this
 * lane, is where reliability/decay would enter). So the gate here is the STATIC half of
 * admissible-for.ts's own logic (FLOOR[use] from src/lib/entities/decisions.mjs, ADR-024 decision 3),
 * reused rather than re-derived, plus the two inference-specific rules REFUTED and cited_item_ids
 * above that admissibleFor() has no equivalent for (it knows lifecycle/admissibility, not status_token).
 */

import { Fragment } from "react";
import Link from "next/link";
import { FLOOR } from "@/lib/entities/decisions.mjs";

export type InferenceStatusToken = "CONFIRMED" | "HYPOTHESIS" | "REFUTED";
type InferenceUse = "display" | "analysis" | "calculation" | "filing";

export interface InferenceRecord {
  claimText: string;
  statusToken: InferenceStatusToken;
  confidence: number;
  citedItemIds: string[];
  originClass: "derived" | "modelled";
}

interface InferenceVerdict {
  ok: boolean;
  reason?: string;
}

/**
 * The gate every InferenceClaim render passes through first (mirrors admissibleFor's "one gate, every
 * consumer calls it" framing, scoped to this narrower table). PURE.
 *   - REFUTED never admits, at any use, any confidence, a refuted claim is history (rule 13's
 *     corollary: corrected in place, never silently rendered as if still live).
 *   - an empty cited_item_ids list never admits (defensive; migration 338's CHECK should make this
 *     unreachable from a real row, but a caller-constructed object might still violate it).
 *   - `display` never gates on confidence (same as admissibleFor's own `use !== "display"` carve-out).
 *   - every other use requires `confidence >= FLOOR[use]` (ADR-024 decision 3, reused verbatim).
 */
export function admissibleForInference(claim: InferenceRecord, use: InferenceUse): InferenceVerdict {
  if (claim.statusToken === "REFUTED") return { ok: false, reason: "refuted" };
  if (!Array.isArray(claim.citedItemIds) || claim.citedItemIds.length === 0) return { ok: false, reason: "uncited" };
  if (use !== "display" && claim.confidence < FLOOR[use]) {
    return { ok: false, reason: `below floor for ${use} (${claim.confidence} < ${FLOOR[use]})` };
  }
  return { ok: true };
}

function statusBadge(statusToken: InferenceStatusToken) {
  const styles: Record<InferenceStatusToken, { bg: string; fg: string }> = {
    CONFIRMED: { bg: "var(--color-success)", fg: "#FFFFFF" },
    HYPOTHESIS: { bg: "var(--color-primary)", fg: "#FFFFFF" },
    REFUTED: { bg: "var(--color-error)", fg: "#FFFFFF" },
  };
  const s = styles[statusToken];
  return (
    <span className="cl-badge" style={{ background: s.bg, color: s.fg, borderColor: s.bg }}>
      {statusToken}
    </span>
  );
}

interface InferenceClaimProps {
  claim: InferenceRecord;
  /** Resolves a cited item id to its display title; falls back to the bare id when a resolver is not
   *  supplied or returns null (never fabricates a title, same integrity posture as every other
   *  render in this codebase). */
  resolveCitationTitle?: (itemId: string) => string | null;
  /** Resolves a cited item id to its detail page (DFIX-1, row 05-p2). A title whose item has an href is a link,
   *  its own 44px target (ux-laws law 2); one without stays plain text. Omitted, every title is plain text,
   *  exactly the earlier behaviour, so a caller that cannot build a route (the admin review) is unchanged. */
  resolveCitationHref?: (itemId: string) => string | null;
  use?: InferenceUse;
}

export function InferenceClaim({ claim, resolveCitationTitle, resolveCitationHref, use = "analysis" }: InferenceClaimProps) {
  const verdict = admissibleForInference(claim, use);

  return (
    <div className="cl-card" style={{ padding: "16px 18px" }} data-figure-kind="inference" data-origin-class={claim.originClass}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        {statusBadge(claim.statusToken)}
        <span className="cl-card-meta" style={{ fontSize: 12 }}>{claim.originClass}</span>
      </div>

      {!verdict.ok ? (
        <div role="status" className="cl-card-body" style={{ color: "var(--color-error)", fontWeight: 600 }}>
          Not admissible for {use}: {verdict.reason}.
        </div>
      ) : (
        <>
          <div className="cl-card-body">{claim.claimText}</div>
          <div className="cl-card-meta" style={{ marginTop: 8 }}>
            Confidence {(claim.confidence * 100).toFixed(0)}%
          </div>
          <div className="cl-card-meta" style={{ marginTop: 4 }}>
            Cited:{" "}
            {claim.citedItemIds.map((id, i) => {
              const title = resolveCitationTitle?.(id) ?? id;
              const href = resolveCitationHref?.(id) ?? null;
              return (
                <Fragment key={id}>
                  {i > 0 ? ", " : ""}
                  {href ? (
                    <Link
                      href={href}
                      style={{ display: "inline-flex", alignItems: "center", minHeight: 44, color: "inherit", textDecoration: "underline" }}
                    >
                      {title}
                    </Link>
                  ) : (
                    title
                  )}
                </Fragment>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
