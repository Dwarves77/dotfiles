"use client";

/**
 * ReportPostMenu — "Report this post" action.
 *
 * Self-contained: a Flag-icon button that, when clicked, mounts a small
 * inline dialog with a reason select and an optional body textarea.
 * Submits to POST /api/community/moderation/reports.
 *
 * Integration (C5 wires this in): render this component inside
 * Post.tsx's overflow ("...") menu OR as a standalone footer action.
 * The orchestrator passes `postId` and an optional `onToast` callback
 * for status feedback. The component owns its own open/close state.
 *
 * Light-first design — neutral surface, subtle border, no emojis.
 */

import { useEffect, useRef, useState } from "react";
import { Flag, X } from "lucide-react";

const REASONS: { value: string; label: string }[] = [
  { value: "spam", label: "Spam or commercial promotion" },
  { value: "harassment", label: "Harassment or abuse" },
  { value: "misinformation", label: "Misinformation or false claim" },
  { value: "off-topic", label: "Off-topic for this group" },
  { value: "self-harm", label: "Self-harm or crisis content" },
  { value: "other", label: "Other (explain below)" },
];

interface ReportPostMenuProps {
  postId: string;
  /** When the caller already shows their own toast/status surface. */
  onToast?: (message: string, variant?: "success" | "error") => void;
  /** Optional render override — when supplied, replaces the default
   * Flag button. Use this to plug ReportPostMenu into a parent
   * overflow menu where the parent renders its own row. The render
   * prop receives `open` (function) so the parent's own row can
   * trigger the dialog. */
  trigger?: (open: () => void) => React.ReactNode;
}

export function ReportPostMenu({
  postId,
  onToast,
  trigger,
}: ReportPostMenuProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("spam");
  const [body, setBody] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reasonRef = useRef<HTMLSelectElement | null>(null);

  useEffect(() => {
    if (open) {
      // Focus the reason select on open for keyboard reachability.
      reasonRef.current?.focus();
    } else {
      setError(null);
    }
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/community/moderation/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          post_id: postId,
          reason,
          body: body.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const j = await safeJson(res);
        const msg = j?.error || `Could not file report (${res.status})`;
        setError(msg);
        onToast?.(msg, "error");
        return;
      }
      onToast?.("Report filed; a moderator will review");
      setOpen(false);
      setBody("");
      setReason("spam");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      setError(msg);
      onToast?.(msg, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {trigger ? (
        trigger(() => setOpen(true))
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Report this post"
          title="Report this post"
          style={{
            background: "transparent",
            border: "1px solid var(--color-border)",
            color: "var(--color-text-secondary)",
            borderRadius: 4,
            padding: "5px 9px",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          <Flag size={12} />
          Report
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="Report this post"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.32)",
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <form
            onSubmit={submit}
            style={{
              width: "100%",
              maxWidth: 460,
              background: "var(--color-bg-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              boxShadow: "0 12px 40px rgba(15, 23, 42, 0.18)",
              padding: 22,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <h2
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  margin: 0,
                  color: "var(--color-text-primary)",
                }}
              >
                Report this post
              </h2>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--color-text-secondary)",
                  cursor: "pointer",
                  padding: 4,
                  display: "inline-flex",
                }}
              >
                <X size={16} />
              </button>
            </div>

            <p
              style={{
                fontSize: 12,
                color: "var(--color-text-secondary)",
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              Reports are visible only to group admins, moderators, and
              Caro&rsquo;s Ledge platform staff.
            </p>

            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  color: "var(--color-text-secondary)",
                }}
              >
                Reason
              </span>
              <select
                ref={reasonRef}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={busy}
                style={{
                  fontSize: 13,
                  padding: "8px 10px",
                  borderRadius: 4,
                  border: "1px solid var(--color-border)",
                  background: "var(--color-bg-base)",
                  color: "var(--color-text-primary)",
                }}
              >
                {REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  color: "var(--color-text-secondary)",
                }}
              >
                Details (optional)
              </span>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                maxLength={2000}
                disabled={busy}
                placeholder="Add context for the moderator (max 2000 characters)."
                style={{
                  fontSize: 13,
                  padding: "8px 10px",
                  borderRadius: 4,
                  border: "1px solid var(--color-border)",
                  background: "var(--color-bg-base)",
                  color: "var(--color-text-primary)",
                  resize: "vertical",
                  fontFamily: "inherit",
                }}
              />
              <span
                style={{
                  fontSize: 11,
                  color: "var(--color-text-muted)",
                  alignSelf: "flex-end",
                }}
              >
                {body.length}/2000
              </span>
            </label>

            {error && (
              <div
                role="alert"
                style={{
                  fontSize: 12,
                  color: "var(--color-error, #b91c1c)",
                  background: "var(--color-error-bg, #fef2f2)",
                  border: "1px solid var(--color-error-border, #fecaca)",
                  borderRadius: 4,
                  padding: "6px 10px",
                }}
              >
                {error}
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                marginTop: 4,
              }}
            >
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
                style={{
                  background: "transparent",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text-secondary)",
                  borderRadius: 4,
                  padding: "8px 14px",
                  fontSize: 12,
                  cursor: busy ? "wait" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                style={{
                  background: "var(--color-text-primary)",
                  color: "var(--color-bg-base)",
                  border: "1px solid var(--color-text-primary)",
                  borderRadius: 4,
                  padding: "8px 14px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: busy ? "wait" : "pointer",
                  opacity: busy ? 0.6 : 1,
                }}
              >
                {busy ? "Submitting…" : "Submit report"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

async function safeJson(res: Response): Promise<{ error?: string } | null> {
  try {
    return (await res.json()) as { error?: string };
  } catch {
    return null;
  }
}
