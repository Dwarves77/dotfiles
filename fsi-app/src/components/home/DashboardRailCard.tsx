"use client";

/**
 * RailEmptyFrame, shared honest-state primitive for the Dashboard (TEMPLATE 01, HANDOFF section
 * 6.3 + mock, section 4): 1px dashed rgba(0,0,0,0.25) border, bg --color-bg-base, radius 6, a
 * muted one-liner stating what is absent, and a recovery CTA. One pattern for every empty rail
 * widget so the honest-state language stays identical.
 *
 * `DashboardRailCard` (the card shell this frame used to sit inside) was removed in lane
 * W10-RailCard, 2026-09-22: its only consumer, `DashboardWatchlist.tsx`, now mounts the shared
 * `src/components/ui/RailCard.tsx` part instead (`titleHref`/`titleCount` cover the same "title is
 * the entry point, count beside it" shape this file used to hand-roll). `RailEmptyFrame` stays,
 * it is a distinct empty-state primitive, not a card shell, and is out of this lane's scope (the
 * empty/loading/error state part is StateNote's lane).
 */

import Link from "next/link";

export function RailEmptyFrame({
  body,
  cta,
}: {
  body: string;
  cta: { label: string; href: string };
}) {
  return (
    <div
      style={{
        border: "1px dashed rgba(0,0,0,0.25)",
        borderRadius: 6,
        background: "var(--color-bg-base)",
        padding: "12px 14px",
      }}
    >
      <p style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.55, margin: "0 0 8px" }}>
        {body}
      </p>
      {/* Law-2 floor: same fix as the title link above - `minHeight: 28` + inline-flex. */}
      <Link
        href={cta.href}
        prefetch={false}
        style={{ display: "inline-flex", alignItems: "center", minHeight: 28, fontSize: 11.5, fontWeight: 800, color: "var(--color-primary)", textDecoration: "none" }}
      >
        {cta.label}
      </Link>
    </div>
  );
}
