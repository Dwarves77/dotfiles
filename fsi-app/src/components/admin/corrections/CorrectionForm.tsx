"use client";

/**
 * CorrectionForm , the one inline form every correction action opens (lane G7-UI, 2026-10-06). One form shape for
 * all five target kinds keeps the same action looking the same everywhere (ux-laws 16). It asks only for what the
 * action needs, always ends with the reason, and keeps everything the admin typed when the API refuses, showing
 * the API's own message (a non-verbatim span says so in the API's words, never a generic error).
 *
 *   fact suppress          reason only
 *   fact replace           claim text (optional, prefilled), source span, capture id, reason
 *   tag add                tag, reason            tag remove: reason only
 *   connection add         item picked by search, relationship, reason     connection remove: reason only
 *   section_text replace   the new text (prefilled with the current text), reason
 *   full_brief replace     the new brief (prefilled with the current brief), reason
 */

import { useState } from "react";
import { ActionButton } from "@/components/ui/ActionRow";
import { ItemSearchPicker } from "@/components/admin/corrections/ItemSearchPicker";
import { EDGE_RELATIONSHIPS, relationshipLabel, valueFor } from "@/components/admin/corrections/model.mjs";
import { fieldStyle, labelStyle } from "@/components/admin/corrections/styles";
import type { Fetcher, TargetKind, CorrectionOp } from "@/components/admin/corrections/types";

export interface FormDraft {
  kind: TargetKind;
  op: CorrectionOp;
  ref: string;
  value: Record<string, unknown> | null;
  reason: string;
}

export interface CorrectionFormProps {
  kind: TargetKind;
  op: CorrectionOp;
  /** The target ref, or "" when the form builds it (tag add: column plus typed tag; connection add: picked item). */
  ref: string;
  /** Tag add only: which tag column the new tag goes in. */
  tagColumn?: string;
  /** Prefill for a replace: the current claim text, section text or brief. */
  currentText?: string;
  /** The item being corrected, left out of the connection search. */
  itemId: string;
  heading: string;
  submitLabel: string;
  onSubmit: (draft: FormDraft) => Promise<{ ok: boolean; message?: string }>;
  onCancel: () => void;
  fetcher?: Fetcher;
}

export function CorrectionForm(p: CorrectionFormProps) {
  const [text, setText] = useState(p.currentText ?? "");
  const [claimText, setClaimText] = useState(p.kind === "fact" ? (p.currentText ?? "") : "");
  const [span, setSpan] = useState("");
  const [capture, setCapture] = useState("");
  const [tag, setTag] = useState("");
  const [picked, setPicked] = useState<{ id: string; title: string } | null>(null);
  const [relationship, setRelationship] = useState("related");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    let ref = p.ref;
    let value: Record<string, unknown> | null = null;
    if (p.kind === "tag" && p.op === "add") ref = `${p.tagColumn ?? ""}:${tag.trim()}`;
    if (p.kind === "connection" && p.op === "add") {
      ref = picked?.id ?? "";
      value = valueFor("connection", "add", { relationship });
    }
    if (p.kind === "fact" && p.op === "replace") value = valueFor("fact", "replace", { claim_text: claimText, source_span: span, search_result_id: capture });
    if (p.kind === "section_text") value = valueFor("section_text", "replace", { content_md: text });
    if (p.kind === "full_brief") value = valueFor("full_brief", "replace", { text });
    const out = await p.onSubmit({ kind: p.kind, op: p.op, ref, value, reason });
    setPending(false);
    if (!out.ok) setError(out.message ?? "The correction did not go through. Your input is kept. Try again.");
  }

  const needsTag = p.kind === "tag" && p.op === "add";
  const needsPick = p.kind === "connection" && p.op === "add";
  const disabledReason =
    needsTag && !tag.trim() ? "Type the tag to add." : needsPick && !picked ? "Pick the related item first." : "";

  return (
    <div
      role="group"
      aria-label={p.heading}
      style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12, background: "var(--tag)", borderRadius: 8, minWidth: 0 }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{p.heading}</div>

      {p.kind === "fact" && p.op === "suppress" && (
        <div style={{ fontSize: 12, color: "var(--ink-2)" }}>
          This hides the fact from customers everywhere it shows. Nothing is deleted, and revoking brings it back.
        </div>
      )}

      {p.kind === "fact" && p.op === "replace" && (
        <>
          <label style={labelStyle}>
            Corrected claim text (optional, leave it to keep the wording)
            <textarea value={claimText} onChange={(e) => setClaimText(e.target.value)} rows={3} disabled={pending} style={fieldStyle} />
          </label>
          <label style={labelStyle}>
            Source span, copied word for word from the source
            <textarea value={span} onChange={(e) => setSpan(e.target.value)} rows={3} disabled={pending} style={fieldStyle} />
          </label>
          <label style={labelStyle}>
            Capture id the span comes from
            <input value={capture} onChange={(e) => setCapture(e.target.value)} disabled={pending} style={fieldStyle} />
          </label>
        </>
      )}

      {needsTag && (
        <label style={labelStyle}>
          Tag to add
          <input value={tag} onChange={(e) => setTag(e.target.value)} disabled={pending} style={fieldStyle} />
        </label>
      )}

      {needsPick && (
        <>
          {picked ? (
            <div style={{ fontSize: 13, color: "var(--ink)", overflowWrap: "anywhere" }}>
              Connect to: <strong>{picked.title}</strong>{" "}
              <button type="button" onClick={() => setPicked(null)} style={{ minHeight: 44, padding: "0 8px", fontSize: 12, background: "none", border: "none", textDecoration: "underline", cursor: "pointer", color: "var(--ink)" }}>
                Choose another
              </button>
            </div>
          ) : (
            <ItemSearchPicker label="Find the related item" excludeIds={[p.itemId]} onPick={setPicked} fetcher={p.fetcher} />
          )}
          <label style={labelStyle}>
            How they are related
            <select value={relationship} onChange={(e) => setRelationship(e.target.value)} disabled={pending} style={fieldStyle}>
              {EDGE_RELATIONSHIPS.map((r: string) => (
                <option key={r} value={r}>{relationshipLabel(r)}</option>
              ))}
            </select>
          </label>
        </>
      )}

      {(p.kind === "section_text" || p.kind === "full_brief") && (
        <label style={labelStyle}>
          {p.kind === "section_text" ? "New section text" : "New full brief"}
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} disabled={pending} style={fieldStyle} />
        </label>
      )}

      <label style={labelStyle}>
        Reason (required)
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} disabled={pending} style={fieldStyle} />
      </label>

      {disabledReason && <div style={{ fontSize: 12, color: "var(--ink-2)" }}>{disabledReason}</div>}
      {error && (
        <div role="alert" style={{ fontSize: 12, color: "var(--color-error)", overflowWrap: "anywhere" }}>
          {error}
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <ActionButton variant="primary" onClick={submit} disabled={pending || disabledReason !== ""}>
          {pending ? "Saving..." : p.submitLabel}
        </ActionButton>
        <ActionButton onClick={p.onCancel} disabled={pending}>Cancel</ActionButton>
      </div>
    </div>
  );
}
