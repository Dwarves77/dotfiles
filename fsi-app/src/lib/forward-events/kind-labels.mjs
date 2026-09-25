// kind-labels.mjs, the human-readable label for each item_forward_events.event_kind value
// (migration 274's CHECK-constrained vocabulary; see read-upcoming.mjs's EVENT_KINDS for the same
// 6-value set). Extracted from UpcomingObligationsStripView.tsx (lane PARITY-PARTS, 2026-09-25, the
// operator ruling that merges these events into the TIMELINE's own markers) so RegulationDetailSurface
// and the list-strip view can both use the SAME map rather than one re-deriving or duplicating it.
// Plain ESM, no `@/` alias (same portability posture as read-upcoming.mjs and forward-event-format.mjs
// alongside it) so it stays importable by a bare `node --test` proof with zero bundler resolution.
export const KIND_LABELS = Object.freeze({
  entry_into_force: "Entry into force",
  compliance_deadline: "Compliance deadline",
  review_or_report: "Review / report",
  phase_step: "Phase step",
  consultation_close: "Consultation close",
  other: "Other",
});
