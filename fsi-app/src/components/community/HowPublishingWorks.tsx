/**
 * HowPublishingWorks — static side-card explaining the three-stage
 * publishing flow:
 *
 *   1. Draft inside a private group
 *   2. Group admin promotes the post to the public forum
 *   3. (Optional) Caro's Ledge editorial promotes it into platform
 *      intelligence
 *
 * Pure presentational. No data dependency. Lives in the right rail of
 * /community/[slug] and on the default /community body to set
 * expectations for what the PROMOTE TO PUBLIC action does.
 *
 * Design intent: matches design_handoff_2026-04 community.html
 * "HOW PUBLISHING WORKS" rail (per VISUAL-RECONCILIATION § 3.8).
 */

import { FileText, ArrowUpRight, Globe } from "lucide-react";

export function HowPublishingWorks() {
  const steps: { n: string; icon: React.ReactNode; title: string; body: string }[] = [
    {
      n: "1",
      icon: <FileText size={12} aria-hidden="true" />,
      title: "Draft in your private group",
      body: "Members workshop a thread privately. RLS keeps it inside the room.",
    },
    {
      n: "2",
      icon: <ArrowUpRight size={12} aria-hidden="true" />,
      title: "Promote to public",
      body: "A group admin uses PROMOTE TO PUBLIC to copy the post to the open forum.",
    },
    {
      n: "3",
      icon: <Globe size={12} aria-hidden="true" />,
      title: "Editorial pickup (optional)",
      body: "Caro's Ledge editors may surface a public thread inside platform intelligence.",
    },
  ];

  return (
    <aside
      aria-label="How publishing works"
      style={{
        background: "var(--color-bg-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 6,
        padding: "16px 18px",
      }}
    >
      <h3
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 13,
          fontWeight: 400,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--color-text-muted)",
          margin: "0 0 12px",
        }}
      >
        How publishing works
      </h3>

      <ol
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {steps.map((s) => (
          <li key={s.n} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span
              aria-hidden
              style={{
                flexShrink: 0,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 22,
                height: 22,
                borderRadius: 999,
                background: "var(--color-bg-base)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text-secondary)",
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {s.n}
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  fontSize: 12,
                  fontWeight: 700,
                  color: "var(--color-text-primary)",
                  lineHeight: 1.3,
                  marginBottom: 2,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    color: "var(--color-text-muted)",
                    display: "inline-flex",
                  }}
                >
                  {s.icon}
                </span>
                {s.title}
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: 11.5,
                  lineHeight: 1.5,
                  color: "var(--color-text-secondary)",
                }}
              >
                {s.body}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </aside>
  );
}
