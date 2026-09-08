"use client";

/**
 * ProvisionalReviewTable, the "SOURCES · PROVISIONAL REVIEW" card of artboard
 * 13 (dc.html p13), built from the shared parts: SectionRule + RowTable +
 * TierChip + StateNote + Absence.
 *
 * Region order, top to bottom, exactly as the artboard draws it:
 *   3px SectionRule
 *   head: Anton "Sources · provisional review" | "N pending · approve, reject
 *         or re-tier on the row"
 *   table: SOURCE | TIER | STATUS | DISCOVERED | (Approve) | (⋯)
 *   foot:  "All N provisional" | "Approve = registry · Reject = archived with
 *          reason · Re-tier = stays provisional"
 *   StateNote (neutral): the pipeline line
 *
 * ACTIONS ARE REAL. All three post to /api/admin/sources/promote, the same
 * endpoint ProvisionalReviewCard has always used, with the same three decisions:
 *   Approve  → decision "approve" + assignedTier (the tier shown on the row).
 *              Server inserts the sources row and marks the provisional row
 *              promoted, so the row leaves the queue.
 *   Reject   → decision "reject". Row is archived with the reviewer note.
 *   Re-tier  → decision "defer" with the chosen tier recorded in reviewerNotes.
 *              Defer writes reviewer_notes + reviewed_at and leaves status at
 *              'pending_review', which is precisely the artboard's own legend,
 *              "Re-tier = stays provisional". There is no in-place tier write
 *              for a provisional row: commit-tier-change returns 409 for
 *              kind:"provisional" and directs callers to promote (its own
 *              header says so), so the chosen tier is held on the row and
 *              applied as assignedTier when the operator then approves.
 *
 * The deep classification editor (domains, jurisdictions, transport modes,
 * topic tags, AI recommendation, tier audit panel) still lives in
 * ProvisionalReviewCard; this table is the artboard's queue view of the same
 * rows and the same endpoint, not a second implementation of that editor.
 */

import React, { useState } from "react";
import { authedFetch } from "@/lib/api/authed-fetch";
import type { ProvisionalSource } from "@/types/source";
import { SectionRule } from "@/components/ui/SectionRule";
import { RowTable, RowTableAction, RowTableOverflow } from "@/components/ui/RowTable";
import { TierChip } from "@/components/ui/Chips";
import { StateNote } from "@/components/ui/StateNote";
import { Absence } from "@/components/ui/Absence";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { ProvisionalReviewCard } from "@/components/sources/ProvisionalReviewCard";
import { formatNumber } from "@/lib/format";
import { hostFromUrl } from "@/lib/entities/host-from-url.mjs";

export type ProvisionalDecision = "approve" | "reject" | "defer";

export interface ProvisionalReviewTableProps {
  rows: ProvisionalSource[];
  /** Called after a successful write so the caller can drop the row from its list. */
  onActionDone: (id: string, decision: ProvisionalDecision) => void;
  /** Staged updates awaiting review, the pipeline note's live count. */
  stagedUpdatesCount?: number | null;
  /** Opens the ingest queue (Ingest / Staged updates). Omitted = no link rendered. */
  onOpenQueue?: () => void;
  /**
   * The Sources sub-tab row, rendered INSIDE this card directly under its head
   * (lane admin60, 2026-09-08). dc.html p13 draws that row inside the card, not
   * above it; the page owns the tabs' state, this card owns their placement, so
   * the row is passed in rather than reimplemented here. Omitted = no row.
   */
  headTabs?: React.ReactNode;
  /**
   * The QUEUE's own total, from the same `admin_attention_counts()` read the Sources tab badge
   * beside this card uses. Additive and optional: omitted, the head names the rows it holds, which
   * is what it did before.
   *
   * FOLD-61, found by eye at 1440, and it is COUNTS-61's own defect class at a third site the lane
   * did not reach. That lane fixed "one screen, three numbers for one queue" by making
   * `admin_attention_counts()` count the queue AS RENDERED (migration 314, 491 = 489
   * pending_review + 2 needs_more_data) and pointing the tab badge at it. This head still read
   * `rows.length`, the loaded PAGE, so the screen showed "Provisional review · 489" in the tab and
   * "4 pending" directly under it against a four-row fixture, and would show 489 against a
   * thousand-row page cap in production. Both numbers now come from the same queue, and when the
   * card is holding fewer rows than the queue has, it SAYS so rather than quietly renaming the
   * queue after its page.
   */
  pendingTotal?: number | null;
}

const COLUMNS = [
  { label: "Source", width: "1fr" },
  { label: "Tier", width: "40px" },
  { label: "Status", width: "160px" },
  { label: "Discovered", width: "120px" },
  { label: "", width: "90px" },
  { label: "", width: "44px" },
];

const STATUS_LABEL: Record<ProvisionalSource["status"], string> = {
  pending_review: "Provisional",
  needs_more_data: "Needs data",
  confirmed: "Confirmed",
  rejected: "Rejected",
};

/**
 * The row's sub-line host. Derived through the entity spine's ONE normalizer
 * (`hostFromUrl`, src/lib/entities/entity-id.mjs) rather than a local
 * `new URL(...).host`, F30's `url_host_derivation` ratchet exists precisely to
 * stop N call-site reimplementations drifting from that seed function. Returns
 * null (not "") for an underivable URL so the cell renders Absence.
 */
export function hostOf(url: string): string | null {
  return hostFromUrl(url) || null;
}

/** The tier a row is reviewed at: the operator's own pick wins, then the system
 *  recommendation, then the provisional estimate. */
export function rowTier(
  ps: Pick<ProvisionalSource, "provisional_tier" | "recommended_tier">,
  picked: number | undefined
): number {
  return picked ?? ps.recommended_tier ?? ps.provisional_tier;
}

export function ProvisionalReviewTable({
  rows,
  onActionDone,
  stagedUpdatesCount = null,
  onOpenQueue,
  headTabs,
  pendingTotal = null,
}: ProvisionalReviewTableProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  // Ruling R7: the full classification editor (ProvisionalReviewCard) is a real
  // feature the artboard does not draw, so it moves to the row ⋯ menu and opens
  // as a disclosure at the card foot rather than being deleted or left in place.
  const [classifying, setClassifying] = useState<string | null>(null);
  const classifyingRow = classifying ? rows.find((r) => r.id === classifying) ?? null : null;

  async function submit(ps: ProvisionalSource, decision: ProvisionalDecision, tier: number) {
    setBusy(ps.id);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        provisionalSourceId: ps.id,
        decision,
        reviewerNotes:
          decision === "defer" ? `Re-tier: T${tier} (queue view)` : `${decision} at T${tier} (queue view)`,
      };
      if (decision === "approve") body.assignedTier = tier;
      const res = await authedFetch("/api/admin/sources/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify(body),
      });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error || "Action failed");
        return;
      }
      onActionDone(ps.id, decision);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      data-audit="provisional-card"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-card)",
        overflow: "hidden",
      }}
    >
      <SectionRule />

      <div
        data-audit="provisional-head"
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 16,
          padding: "14px 16px 10px",
          borderBottom: "1px solid var(--line-2)",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-display)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            fontSize: 20,
            whiteSpace: "nowrap",
            color: "var(--ink)",
          }}
        >
          Sources · provisional review
        </span>
        <span
          style={{
            fontSize: "var(--fs-105)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--ink-3)",
            fontWeight: 500,
            textAlign: "right",
            maxWidth: 300,
            lineHeight: 1.35,
          }}
        >
          {formatNumber(pendingTotal ?? rows.length)} pending
          {pendingTotal != null && pendingTotal !== rows.length ? ` · showing ${formatNumber(rows.length)}` : ""}
          {" · approve, reject or re-tier on the row"}
        </span>
      </div>

      {headTabs}

      {error && (
        <div style={{ padding: "10px 16px" }}>
          <StateNote>{error}</StateNote>
        </div>
      )}

      {rows.length === 0 ? (
        <div style={{ padding: "18px 16px" }}>
          <Absence reason="pending" />
        </div>
      ) : (
        <RowTable
          columns={COLUMNS}
          rows={rows.map((ps) => {
            const tier = rowTier(ps, picked[ps.id]);
            const host = hostOf(ps.url);
            return {
              key: ps.id,
              cells: [
                <React.Fragment key="source">
                  <span
                    style={{
                      display: "block",
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      color: "var(--ink)",
                    }}
                  >
                    {ps.name}
                  </span>
                  <span style={{ display: "block", fontSize: "var(--fs-11)", color: "var(--ink-3)" }}>
                    {host ?? <Absence reason="not in primary source" />}
                  </span>
                </React.Fragment>,
                <TierChip key="tier" tier={tier} max={7} />,
                <span
                  key="status"
                  style={{
                    fontSize: "var(--fs-11)",
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "var(--ink)",
                  }}
                >
                  {STATUS_LABEL[ps.status]}
                </span>,
                <span key="discovered" style={{ fontSize: "var(--fs-115)", color: "var(--ink-2)" }}>
                  {ps.created_at ? <RelativeTime iso={ps.created_at} /> : <Absence reason="pending" />}
                </span>,
                <RowTableAction
                  key="approve"
                  label={busy === ps.id ? "Working…" : "Approve"}
                  disabled={busy !== null}
                  onClick={() => submit(ps, "approve", tier)}
                />,
                <RowTableOverflow
                  key="overflow"
                  label={`Actions for ${ps.name}`}
                  items={[
                    { key: "reject", label: "Reject", onSelect: () => submit(ps, "reject", tier) },
                    {
                      key: "classify",
                      label: "Classify…",
                      onSelect: () => setClassifying((c) => (c === ps.id ? null : ps.id)),
                    },
                  ]}
                  extra={
                    <span style={{ display: "block", padding: "6px 10px 4px" }}>
                      <span
                        style={{
                          display: "block",
                          fontSize: "var(--fs-10)",
                          letterSpacing: "0.12em",
                          textTransform: "uppercase",
                          color: "var(--ink-3)",
                          fontWeight: 700,
                          marginBottom: 6,
                        }}
                      >
                        Re-tier
                      </span>
                      <span style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {[1, 2, 3, 4, 5, 6, 7].map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => {
                              setPicked((p) => ({ ...p, [ps.id]: t }));
                              submit(ps, "defer", t);
                            }}
                            aria-pressed={t === tier}
                            style={{
                              minWidth: 30,
                              minHeight: 30,
                              borderRadius: 4,
                              border: "1px solid rgba(0,0,0,.2)",
                              background: t === tier ? "var(--tag)" : "var(--surface)",
                              fontFamily: "inherit",
                              fontSize: "var(--fs-10)",
                              fontWeight: 800,
                              letterSpacing: "0.06em",
                              color: "var(--ink-2)",
                              cursor: "pointer",
                            }}
                          >
                            T{t}
                          </button>
                        ))}
                      </span>
                    </span>
                  }
                />,
              ],
            };
          })}
        />
      )}

      {classifyingRow && (
        <div style={{ padding: "12px 16px 0" }}>
          <ProvisionalReviewCard
            ps={classifyingRow}
            initiallyExpanded
            onActionDone={(id, decision) => {
              setClassifying(null);
              onActionDone(id, decision);
            }}
          />
        </div>
      )}

      <div
        data-audit="provisional-foot"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          padding: "10px 16px",
          borderTop: "1px solid var(--line-2)",
          background: "var(--color-background)",
          fontSize: "var(--fs-12)",
        }}
      >
        <span style={{ fontWeight: 600, color: "var(--ink)" }}>
          All {formatNumber(rows.length)} provisional
        </span>
        <span style={{ color: "var(--ink-3)" }}>
          Approve = registry · Reject = archived with reason · Re-tier = stays provisional
        </span>
      </div>

      <div data-audit="provisional-note" style={{ margin: "0 16px 14px" }}>
        <StateNote action={onOpenQueue ? { label: "Open the queue →", onClick: onOpenQueue } : undefined}>
          <b>Pipeline</b> · last full extraction run <Absence reason="pending" /> ·{" "}
          {stagedUpdatesCount === null ? (
            <Absence reason="pending" />
          ) : (
            `${formatNumber(stagedUpdatesCount)} items awaiting review`
          )}
        </StateNote>
      </div>
    </div>
  );
}
