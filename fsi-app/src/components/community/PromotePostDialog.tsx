"use client";

// PromotePostDialog — modal form for promoting a community post into
// platform intelligence. Renders form, validates, POSTs to
// /api/community/posts/[id]/promote, dismisses on success.
//
// Promotion is ALWAYS staged: the post is added to the staged-updates queue
// for admin review, then grounded like any other item on approval. The
// former "Promote directly" admin radio (which inserted straight into
// intelligence_items, bypassing grounding) was removed 2026-06-28.
//
// Light-first design: respects --color-surface, --color-text-primary,
// --color-border tokens defined in the global theme. No hardcoded hex.
//
// Form fields:
//   - Title (required, prefilled from post.body if it begins with a
//     short, single-line statement)
//   - Source URL (required, http(s))
//   - Item type (12-value select)
//   - Jurisdiction ISO codes (comma-separated, optional)
//   - Priority (4-value select, default MODERATE)
//   - Summary (textarea, defaults to post.body if blank server-side)
//   - Notes (textarea, optional)

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import type { PromotePostButtonPost } from "./PromotePostButton";

const ITEM_TYPES = [
  { value: "regulation", label: "Regulation" },
  { value: "directive", label: "Directive" },
  { value: "standard", label: "Standard" },
  { value: "guidance", label: "Guidance" },
  { value: "framework", label: "Framework" },
  { value: "technology", label: "Technology" },
  { value: "innovation", label: "Innovation" },
  { value: "tool", label: "Tool" },
  { value: "regional_data", label: "Regional data" },
  { value: "market_signal", label: "Market signal" },
  { value: "initiative", label: "Initiative" },
  { value: "research_finding", label: "Research finding" },
] as const;

const PRIORITIES = [
  { value: "CRITICAL", label: "Critical" },
  { value: "HIGH", label: "High" },
  { value: "MODERATE", label: "Moderate" },
  { value: "LOW", label: "Low" },
] as const;

interface PromotePostDialogProps {
  post: PromotePostButtonPost;
  onClose: () => void;
}

export function PromotePostDialog({
  post,
  onClose,
}: PromotePostDialogProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // The first sentence of the post body is a reasonable title default;
  // strip to ~120 chars so the input doesn't overflow.
  const initialTitle = post.body
    ? post.body.split(/[.\n]/)[0]?.slice(0, 120).trim() ?? ""
    : "";

  const [title, setTitle] = useState(initialTitle);
  const [sourceUrl, setSourceUrl] = useState("");
  const [itemType, setItemType] =
    useState<(typeof ITEM_TYPES)[number]["value"]>("regulation");
  const [jurisdictionIso, setJurisdictionIso] = useState("");
  const [priority, setPriority] =
    useState<(typeof PRIORITIES)[number]["value"]>("MODERATE");
  const [summary, setSummary] = useState(post.body ?? "");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ESC closes the dialog. Click-outside also closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, submitting]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (!sourceUrl.trim()) {
      setError("Source URL is required");
      return;
    }
    try {
      const u = new URL(sourceUrl);
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        setError("Source URL must start with http:// or https://");
        return;
      }
    } catch {
      setError("Source URL must be a valid URL");
      return;
    }

    const jurisdictions = jurisdictionIso
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter((s) => s.length > 0);

    setSubmitting(true);
    try {
      const res = await fetch(`/api/community/posts/${post.id}/promote`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "staged",
          intelligence_item: {
            title: title.trim(),
            source_url: sourceUrl.trim(),
            item_type: itemType,
            jurisdiction_iso: jurisdictions.length > 0 ? jurisdictions : undefined,
            priority,
            summary: summary.trim() || undefined,
          },
          notes: notes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        let msg = `Promotion failed (${res.status})`;
        try {
          const data = await res.json();
          if (data?.error) msg = data.error;
        } catch {
          // ignore
        }
        setError(msg);
        setSubmitting(false);
        return;
      }

      // Success — close, refresh server data so the post shows the
      // "Promoted" tag.
      onClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="promote-post-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[color:rgb(0_0_0_/_0.4)] p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-xl rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border-subtle)] px-5 py-4">
          <div>
            <h2
              id="promote-post-dialog-title"
              className="text-base font-semibold text-[var(--color-text-primary)]"
            >
              Promote post to intelligence
            </h2>
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
              Add this community finding to the staged-updates queue. A platform
              admin reviews and grounds it before it goes live.
            </p>
          </div>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            className="rounded-md p-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
            aria-label="Close dialog"
            disabled={submitting}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 px-5 py-4 text-sm text-[var(--color-text-primary)]"
        >
          {/* Title */}
          <div>
            <label
              htmlFor="pp-title"
              className="block text-xs font-medium text-[var(--color-text-secondary)]"
            >
              Title <span className="text-[var(--color-danger,#b91c1c)]">*</span>
            </label>
            <input
              id="pp-title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={300}
              className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            />
          </div>

          {/* Source URL */}
          <div>
            <label
              htmlFor="pp-source-url"
              className="block text-xs font-medium text-[var(--color-text-secondary)]"
            >
              Source URL <span className="text-[var(--color-danger,#b91c1c)]">*</span>
            </label>
            <input
              id="pp-source-url"
              type="url"
              required
              placeholder="https://"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            />
          </div>

          {/* Item type + Priority */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="pp-item-type"
                className="block text-xs font-medium text-[var(--color-text-secondary)]"
              >
                Item type
              </label>
              <select
                id="pp-item-type"
                value={itemType}
                onChange={(e) =>
                  setItemType(
                    e.target.value as (typeof ITEM_TYPES)[number]["value"]
                  )
                }
                className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
              >
                {ITEM_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="pp-priority"
                className="block text-xs font-medium text-[var(--color-text-secondary)]"
              >
                Priority
              </label>
              <select
                id="pp-priority"
                value={priority}
                onChange={(e) =>
                  setPriority(
                    e.target.value as (typeof PRIORITIES)[number]["value"]
                  )
                }
                className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
              >
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Jurisdiction */}
          <div>
            <label
              htmlFor="pp-jurisdiction"
              className="block text-xs font-medium text-[var(--color-text-secondary)]"
            >
              Jurisdiction ISO codes
            </label>
            <input
              id="pp-jurisdiction"
              type="text"
              placeholder="EU, GB, US"
              value={jurisdictionIso}
              onChange={(e) => setJurisdictionIso(e.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            />
            <p className="mt-1 text-[11px] text-[var(--color-text-secondary)]">
              Comma-separated. Leave blank if not jurisdiction-specific.
            </p>
          </div>

          {/* Summary */}
          <div>
            <label
              htmlFor="pp-summary"
              className="block text-xs font-medium text-[var(--color-text-secondary)]"
            >
              Summary
            </label>
            <textarea
              id="pp-summary"
              rows={4}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            />
            <p className="mt-1 text-[11px] text-[var(--color-text-secondary)]">
              Defaults to the post body if left empty.
            </p>
          </div>

          {/* Notes */}
          <div>
            <label
              htmlFor="pp-notes"
              className="block text-xs font-medium text-[var(--color-text-secondary)]"
            >
              Notes (optional)
            </label>
            <textarea
              id="pp-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Why is this worth elevating?"
              className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            />
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-md border border-[var(--color-danger,#fca5a5)] bg-[color:rgb(239_68_68_/_0.08)] px-3 py-2 text-xs text-[var(--color-danger,#b91c1c)]"
            >
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => !submitting && onClose()}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-[var(--color-on-primary,white)] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] disabled:opacity-50"
              disabled={submitting}
            >
              {submitting ? "Staging…" : "Stage for review"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
