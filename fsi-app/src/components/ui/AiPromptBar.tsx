"use client";

/**
 * AiPromptBar — inline ask-anything bar with input, submit, and chip
 * suggestions. Replaces the previous click-to-open-modal stub.
 *
 * Matches design_handoff_2026-04/preview/dashboard-v3.html `.ai` block:
 *   - Outer container .cl-ai-bar (defined in fsi-app/src/app/globals.css)
 *   - Pill-shaped input row with focus ring
 *   - Sparkle accent, transparent input, accent-colored Ask button
 *   - Optional chip suggestions below the row
 *
 * Submission:
 *   - If `onSubmit` is provided, it is called with the trimmed question.
 *   - Otherwise the legacy `open-ask-assistant` CustomEvent is dispatched
 *     on `window`, with `detail: { question }` so existing listeners
 *     (modal openers, etc.) keep working.
 *
 * Chip click fills the input but does not auto-submit, mirroring the
 * preview behavior in dashboard-v3.html.
 */

import { useState, type FormEvent } from "react";
import { Sparkles } from "lucide-react";

interface AiPromptBarProps {
  placeholder?: string;
  chips?: string[];
  onSubmit?: (question: string) => void;
}

const DEFAULT_PLACEHOLDER =
  "Ask anything about your regulations — e.g. What's due in the next 30 days?";

export function AiPromptBar({
  placeholder = DEFAULT_PLACEHOLDER,
  chips,
  onSubmit,
}: AiPromptBarProps) {
  const [value, setValue] = useState("");

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const question = value.trim();
    if (!question) return;
    if (onSubmit) {
      onSubmit(question);
    } else {
      window.dispatchEvent(
        new CustomEvent("open-ask-assistant", { detail: { question } })
      );
    }
    setValue("");
  }

  return (
    <div
      className="cl-ai-bar"
      style={{
        // .cl-ai-bar in globals.css sets display:flex + cursor:pointer for
        // the legacy click-to-open variant. Override to a vertical block
        // layout so the form + chips stack correctly.
        display: "block",
        cursor: "default",
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-3 rounded-full px-4 py-1.5"
        style={{
          background: "var(--color-bg-surface)",
          border: "1px solid var(--color-border-ai, var(--color-border))",
        }}
      >
        <Sparkles
          size={16}
          className="shrink-0"
          style={{ color: "var(--color-primary)" }}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="flex-1 min-w-0 border-0 outline-none bg-transparent text-sm py-2"
          style={{ color: "var(--color-text-primary)" }}
        />
        <button
          type="submit"
          className="shrink-0 text-xs font-bold rounded-full px-4 py-2 cursor-pointer"
          style={{
            backgroundColor: "var(--color-primary)",
            color: "var(--color-text-inverse, #fff)",
            border: 0,
          }}
        >
          Ask
        </button>
      </form>
      {chips && chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2.5 pl-1">
          {chips.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => setValue(chip)}
              className="text-xs font-semibold rounded-full px-3 py-1 cursor-pointer transition-colors"
              style={{
                background: "var(--color-bg-surface)",
                border: "1px solid var(--color-border-ai, var(--color-border))",
                color: "var(--color-primary)",
              }}
            >
              {chip}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
