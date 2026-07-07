"use client";

/**
 * DashboardAskBar — the Ask bar on the Dashboard (TEMPLATE 01, HANDOFF §6.3 +
 * mock). Input + Ask button + suggestion chips. Submitting dispatches the
 * `open-ask-assistant` CustomEvent (the same contract RegulationsLedger uses),
 * anchored under the bar so the assistant drops down in place.
 *
 * The Ask bar on the Dashboard is intended (only Map / Community / Account
 * intentionally omit it per HANDOFF §9); this restores the bar the previous
 * dashboard had removed.
 */

import { useRef, useState } from "react";

const CHIPS = [
  "How will crude oil prices affect my air freight costs?",
  "What CBAM deadlines do I need to prepare for?",
  "Which EV trucks are viable for 200-mile drayage routes?",
  "Summarize the EU packaging regulation impact on freight",
];

export function DashboardAskBar() {
  const formRef = useRef<HTMLFormElement>(null);
  const [value, setValue] = useState("");

  const submit = (question: string) => {
    const q = question.trim();
    if (!q) return;
    const rect = formRef.current?.getBoundingClientRect();
    const anchor = rect ? { top: rect.bottom, left: rect.left, width: rect.width } : null;
    window.dispatchEvent(new CustomEvent("open-ask-assistant", { detail: { question: q, anchor } }));
  };

  return (
    <div
      style={{
        background: "var(--color-bg-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        padding: "14px 16px",
        margin: "0 0 30px",
      }}
    >
      <form
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault();
          submit(value);
          setValue("");
        }}
        style={{ display: "flex", gap: 10, alignItems: "center" }}
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Ask about regulations, costs, technology"
          placeholder="Ask about regulations, costs, technology…"
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: "inherit",
            fontSize: 13.5,
            padding: "11px 14px",
            border: "1px solid var(--color-border-medium)",
            borderRadius: 6,
            outline: "none",
            background: "var(--color-bg-base)",
            color: "var(--color-text-primary)",
          }}
        />
        <button
          type="submit"
          style={{
            fontFamily: "inherit",
            fontSize: 12.5,
            fontWeight: 800,
            padding: "11px 20px",
            borderRadius: 6,
            border: "1px solid var(--color-primary)",
            background: "var(--color-primary)",
            color: "var(--color-text-inverse, #fff)",
            cursor: "pointer",
          }}
        >
          Ask
        </button>
      </form>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0 0" }}>
        {CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => setValue(chip)}
            style={{
              fontFamily: "inherit",
              fontSize: 11.5,
              fontWeight: 600,
              color: "var(--color-text-secondary)",
              background: "var(--color-bg-base)",
              border: "1px solid var(--color-border-medium)",
              borderRadius: 999,
              padding: "6px 13px",
              cursor: "pointer",
            }}
          >
            {chip}
          </button>
        ))}
      </div>
    </div>
  );
}
