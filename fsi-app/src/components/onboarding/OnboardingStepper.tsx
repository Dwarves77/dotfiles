"use client";

/**
 * OnboardingStepper — the 4-pill progress row (UI system handoff
 * 2026-09-06, README screen 17): Workspace / Modes & jurisdictions /
 * Sectors / Briefing. Shared by /workspace/new (step 1) and /onboarding
 * (steps 2-4) so progress reads consistently across both routes — see
 * OnboardingWizard.tsx and workspace/new/page.tsx.
 */

import { Check } from "lucide-react";

export const ONBOARDING_STEPS = [
  { n: 1, label: "Workspace" },
  { n: 2, label: "Modes & jurisdictions" },
  { n: 3, label: "Sectors" },
  { n: 4, label: "Briefing" },
] as const;

export function OnboardingStepper({ current }: { current: 1 | 2 | 3 | 4 }) {
  return (
    <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
      {ONBOARDING_STEPS.map((s) => {
        const done = s.n < current;
        const active = s.n === current;
        return (
          <div
            key={s.n}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: "var(--fs-12)",
              fontWeight: active ? 700 : 600,
              color: done || active ? "var(--ink)" : "var(--ink-3)",
            }}
          >
            <span
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "var(--fs-105)",
                background: done ? "var(--awareness)" : active ? "var(--brand)" : "transparent",
                color: done || active ? "#fff" : "var(--ink-3)",
                border: done || active ? "none" : "1.5px solid rgba(0,0,0,.3)",
                flexShrink: 0,
              }}
            >
              {done ? <Check size={11} /> : s.n}
            </span>
            {s.label}
          </div>
        );
      })}
    </div>
  );
}
