"use client";

/**
 * CorrectionRow , one admin correction, in words (lane G7-UI, 2026-10-06). Used by the item panel's history and by
 * the Corrections tab, so the same correction looks and behaves the same in both (ux-laws 16).
 *
 * Shows what was done, the reason, who and when, the machine value it overrode, and the state (active, revoked,
 * orphaned). An orphaned fact correction carries a plain explanation. Revoke is a separate, confirmed action: the
 * first press opens a confirmation that says the machine value will be restored and asks for a reason; only the
 * confirm press posts (laws 14, 15). Every async state is visible: pending, failed with the API's own message
 * and the reason kept, or done.
 */

import { useState } from "react";
import { ActionButton } from "@/components/ui/ActionRow";
import {
  describeCorrection,
  kindLabel,
  machineValueOf,
  stateLabel,
  stateOf,
  ORPHAN_EXPLANATION,
} from "@/components/admin/corrections/model.mjs";
import type { CorrectionData } from "@/components/admin/corrections/types";

export interface RevokeResult {
  ok: boolean;
  message?: string;
}

export interface CorrectionRowProps {
  correction: CorrectionData;
  /** Posts the revoke. The row never decides what happens next: the owner refetches. */
  onRevoke: (c: CorrectionData, reason: string) => Promise<RevokeResult>;
  /** Tab only: where "Open item" goes. */
  itemHref?: string;
}

const SHOW_CHARS = 280;

function textOf(value: Record<string, unknown> | null | undefined): string {
  if (!value) return "";
  for (const k of ["claim_text", "content_md", "text", "source_span", "relationship"]) {
    const v = value[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return "";
}

function clip(s: string): string {
  return s.length > SHOW_CHARS ? `${s.slice(0, SHOW_CHARS)}...` : s;
}

function dateText(iso: string | null | undefined): string {
  const t = Date.parse(iso ?? "");
  return Number.isNaN(t) ? "an unknown date" : new Date(t).toISOString().slice(0, 10);
}

const STATE_STYLE: Record<string, { color: string; background: string }> = {
  active: { color: "var(--ink)", background: "var(--tag)" },
  revoked: { color: "var(--ink-3)", background: "var(--tag)" },
  orphaned: { color: "var(--color-error)", background: "rgba(220,38,38,0.08)" },
};

export function CorrectionRow({ correction: c, onRevoke, itemHref }: CorrectionRowProps) {
  const state = stateOf(c);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const machine = textOf(machineValueOf(c));
  const corrected = textOf(c.value);

  async function confirmRevoke() {
    setPending(true);
    setError(null);
    const out = await onRevoke(c, reason);
    setPending(false);
    if (!out.ok) setError(out.message ?? "The revoke did not go through. Try again.");
    else setConfirming(false);
  }

  return (
    <div
      data-correction-row={c.id}
      style={{
        background: "var(--card)",
        border: "1px solid var(--line-1)",
        borderRadius: "var(--radius-card)",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "6px 12px", minWidth: 0 }}>
        <h3
          data-guard-title
          style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--ink)", flex: "1 1 200px", minWidth: 0, overflowWrap: "anywhere" }}
        >
          {describeCorrection(c)}
        </h3>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: "3px 8px",
            borderRadius: 999,
            ...(STATE_STYLE[state] ?? STATE_STYLE.active),
          }}
        >
          {stateLabel(state)}
        </span>
      </div>

      <div style={{ fontSize: 12, color: "var(--ink-2)", overflowWrap: "anywhere" }}>
        {kindLabel(c.target_kind)}
        {c.item_title ? ` on ${c.item_title}` : ""}. Made {dateText(c.created_at)}
        {c.created_by ? ` by user ${c.created_by.slice(0, 8)}` : ""}.
        {c.revoked_at ? ` Revoked ${dateText(c.revoked_at)}${c.revoked_reason ? `: ${c.revoked_reason}` : ""}.` : ""}
      </div>

      <div style={{ fontSize: 13, color: "var(--ink)", overflowWrap: "anywhere" }}>
        <strong>Reason.</strong> {c.reason}
      </div>

      {(corrected || machine) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "var(--ink-2)", overflowWrap: "anywhere" }}>
          {corrected && (
            <div>
              <strong>Corrected value.</strong> {clip(corrected)}
            </div>
          )}
          {machine && (
            <div>
              <strong>Machine value.</strong> {clip(machine)}
            </div>
          )}
        </div>
      )}

      {state === "orphaned" && (
        <div
          role="note"
          style={{
            fontSize: 12,
            color: "var(--ink)",
            borderLeft: "3px solid var(--color-error)",
            background: "rgba(220,38,38,0.05)",
            padding: "9px 12px",
            borderRadius: "0 6px 6px 0",
            overflowWrap: "anywhere",
          }}
        >
          {ORPHAN_EXPLANATION}
        </div>
      )}

      {(state !== "revoked" || itemHref) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {itemHref && (
            <a
              href={itemHref}
              style={{
                display: "inline-flex",
                alignItems: "center",
                minHeight: 44,
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: 700,
                color: "var(--ink)",
                textDecoration: "underline",
              }}
            >
              Open item
            </a>
          )}
          {state !== "revoked" && !confirming && (
            <ActionButton onClick={() => setConfirming(true)}>Revoke</ActionButton>
          )}
        </div>
      )}

      {confirming && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid var(--line-1)", paddingTop: 10 }}>
          <div role="alert" style={{ fontSize: 13, color: "var(--ink)" }}>
            Revoking restores the machine value. Customers will see it again straight away.
          </div>
          <label style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-2)", display: "flex", flexDirection: "column", gap: 4 }}>
            Why are you revoking this?
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              disabled={pending}
              style={{ width: "100%", boxSizing: "border-box", minHeight: 44, padding: 8, fontSize: 13, fontFamily: "inherit", border: "1px solid var(--line-1)", borderRadius: 6 }}
            />
          </label>
          {error && (
            <div role="alert" style={{ fontSize: 12, color: "var(--color-error)", overflowWrap: "anywhere" }}>
              {error}
            </div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <ActionButton variant="primary" onClick={confirmRevoke} disabled={pending}>
              {pending ? "Revoking..." : "Revoke and restore machine value"}
            </ActionButton>
            <ActionButton onClick={() => { setConfirming(false); setError(null); }} disabled={pending}>
              Keep the correction
            </ActionButton>
          </div>
        </div>
      )}
    </div>
  );
}
