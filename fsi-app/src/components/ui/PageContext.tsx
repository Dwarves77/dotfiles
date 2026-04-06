"use client";

import { AiPromptBar } from "./AiPromptBar";

interface PageContextProps {
  context: string;
  aiPlaceholder: string;
}

/**
 * Page-level context banner + AI prompt bar.
 * Adds "why this page matters" context for freight operators
 * and promotes the AI assistant with a page-specific prompt.
 */
export function PageContext({ context, aiPlaceholder }: PageContextProps) {
  return (
    <div className="space-y-3 mb-4">
      <p className="text-[13px] leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
        {context}
      </p>
      <AiPromptBar placeholder={aiPlaceholder} />
    </div>
  );
}
