"use client";

import { Bot } from "lucide-react";

interface AiPromptBarProps {
  placeholder: string;
}

export function AiPromptBar({ placeholder }: AiPromptBarProps) {
  return (
    <div
      className="cl-ai-bar cursor-pointer group sticky top-0 z-20"
      onClick={() => {
        window.dispatchEvent(new CustomEvent("open-ask-assistant", { detail: { placeholder } }));
      }}
    >
      <Bot size={16} className="shrink-0" style={{ color: "var(--color-primary)" }} />
      <span className="cl-card-body flex-1">{placeholder}</span>
      <button
        className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-md"
        style={{
          backgroundColor: "var(--color-primary)",
          color: "var(--color-text-inverse)",
        }}
      >
        Ask AI
      </button>
    </div>
  );
}
