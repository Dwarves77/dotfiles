"use client";

/**
 * RailAbsenceNote -- the one shared "nothing here yet" paragraph for a rail panel's absence state
 * (DissentPanel, SignpostList, AssessmentHistoryLedger, lane L5, 2026-10-02). Extracted after F45
 * (duplicate-code ratchet) flagged the same style literal repeated across those three new files, each
 * near-identical to ResearchAssessmentCard's own absence paragraph on this same page (lane W2-R, PR
 * #887) -- the exact "extract the shared home and import it" instruction F45's own violation message
 * gives. ResearchAssessmentCard itself is out of this lane's write set and is not touched; this shared
 * home is for the three panels this lane owns.
 */

import type { ReactNode } from "react";

export function RailAbsenceNote({ children }: { children: ReactNode }) {
  return <p style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.5, margin: 0 }}>{children}</p>;
}

/**
 * RailBadge -- the small uppercase status pill this rail's cards use (F45 dedup: SignpostList's
 * fired/unfired pill shared this exact multi-line style literal with ResearchAssessmentCard's
 * statusToken pill, both on this same page; that file is PR #887's own scope and out of this lane's
 * write set, so the shared home lives here instead and SignpostList imports it).
 */
const BADGE_SHAPE = { fontSize: 9, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase" as const };
const BADGE_BOX = { padding: "1px 6px", borderRadius: 4, border: "1px solid var(--color-border-medium)", whiteSpace: "nowrap" as const };

export function RailBadge({ children, active }: { children: ReactNode; active: boolean }) {
  return (
    <span style={{ ...BADGE_SHAPE, ...BADGE_BOX, color: active ? "var(--color-primary)" : "var(--color-text-muted)" }}>{children}</span>
  );
}
