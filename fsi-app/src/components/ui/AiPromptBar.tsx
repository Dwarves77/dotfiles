"use client";

import { Bot } from "lucide-react";

interface AiPromptBarProps {
  placeholder: string;
  onSubmit?: (query: string) => void;
}

/**
 * Inline AI prompt bar — placed below page headers to promote
 * the Ask AI feature. Clicking focuses the floating assistant.
 */
export function AiPromptBar({ placeholder, onSubmit }: AiPromptBarProps) {
  return (
    <div
      className="cl-card flex items-center gap-3 px-5 py-3.5 cursor-pointer group"
      onClick={() => {
        // Open the floating AskAssistant by dispatching a custom event
        window.dispatchEvent(new CustomEvent("open-ask-assistant", { detail: { placeholder } }));
      }}
    >
      <Bot size={16} className="shrink-0" style={{ color: "var(--color-primary)" }} />
      <span className="text-sm flex-1" style={{ color: "var(--color-text-muted)" }}>
        {placeholder}
      </span>
      <span
        className="text-[11px] font-medium px-2 py-0.5 rounded-md shrink-0"
        style={{
          backgroundColor: "var(--color-active-bg)",
          color: "var(--color-primary)",
          border: "1px solid var(--color-active-border)",
        }}
      >
        Ask AI
      </span>
    </div>
  );
}
