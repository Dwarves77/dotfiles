## Worked Example

Suppose a Phase 7 design dispatch reads `docs/sprint-1/followups.md` and finds the following open OBS entries:

- OBS-4: source_column tracking (migration 082) (Implemented)
- OBS-6: severity vocabulary 'replacement' (Q5 amendment history) (Implemented)
- OBS-7: Norway Fjords instrument_type pending counsel (Open, external dependency)
- OBS-8: OBS-2 broader audit deferred (Deferred to Sprint 1 follow-up dispatch)
- OBS-9: Classifier feedback loop Sprint 2 pre-decisions (Deferred to Sprint 2)
- OBS-10: Drift event rate monitoring post-Phase-7 (Open, post-Phase-7 monitoring)
- OBS-11: Rollback trigger-bracket gap (Implemented)
- OBS-12: Bulk SQL CTE pattern (Implemented as canonical pattern)
- OBS-13: Gate 7.2a all-rejected-jurisdictions rows (Open, Phase 7 dependency)
- OBS-14: Triage UI inline source metadata (Open, Phase 7 owner)
- OBS-15: Briefs article-level source context (Open, Phase 6 owner with Phase 7 consumer half)

The Phase 7 design dispatch's coverage table:

| OBS | State | Decision | Cross-references | Reasoning |
|---|---|---|---|---|
| OBS-4 | Implemented | NO ACTION | (none) | Migration 082 shipped; Phase 7 UI consumes source_column without reopening. |
| OBS-6 | Implemented | NO ACTION | (none) | History of Q5 amendment; no Phase 7 surface. |
| OBS-7 | Open | DEFER | (none) | External dependency (counsel review); no Phase 7 design action. Routing remains operator-initiated UPDATE post-review. |
| OBS-8 | Deferred | NO ACTION | (none) | Standalone Sprint 1 follow-up dispatch owner; not Phase 7. |
| OBS-9 | Deferred | NO ACTION | OBS-14, OBS-15 | Sprint 2 owner. Phase 7 design notes that triage decisions captured today feed Sprint 2 loop input. |
| OBS-10 | Open | DEFER | (none) | Post-Phase-7 monitoring; operator-dashboard task after Phase 7 ships. Phase 7 design notes the dashboard hook point. |
| OBS-11 | Implemented | NO ACTION | (none) | Backfill-script-level pattern; no Phase 7 surface. |
| OBS-12 | Implemented | NO ACTION | (none) | Backfill canonical pattern; no Phase 7 surface. |
| OBS-13 | Open | COVER | OBS-14, OBS-9, DP-1 | Phase 7 design adds third triage tab for items with all-rejected jurisdictions. Option 1 from OBS-13's recommendation set; no new schema. The new tab itself is DP-1 compliant. |
| OBS-14 | Open | COVER | OBS-4, OBS-13, OBS-9, DP-1 | Phase 7 design adds inline source-metadata strip on every queue surface (integrity flags, PJR, IR, and the new all-rejected tab) per DP-1. |
| OBS-15 | Open | DEFER | OBS-14, OBS-9, DP-1 | Phase 6 owns the article-level field generation; Phase 7 design reserves an inline display slot in the brief-detail view and notes the field contract dependency on Phase 6. Phase 7 display half is DP-1 binding once Phase 6 lands. |

The same dispatch's DP compliance section:

| DP | Compliance test | Result | Evidence or reasoning |
|---|---|---|---|
| DP-1 (Single-Pane Operator Review) | Can the operator complete every related decision and edit on this single item without leaving the current screen, form, or workflow? | PASS | Design § 3.2 (integrity flag triage surface) inlines flag, agent brief, source metadata strip with edit-in-place fields, decision controls, audit-note text field, and audit trail on one screen. § 3.3 (PJR triage) and § 3.4 (all-rejected-jurisdictions tab) inline the equivalent controls plus canonical-replacement pickers. Zero tab switches in any documented operator workflow. Article-level brief context (OBS-15 deferred half) noted as a Phase 6 dependency that will enable full DP-1 compliance on the brief-detail surface once Phase 6 ships. |

This pair tells the operator: every OBS was read, three were covered (13, 14, and the Phase 7 half of 15's display), the rest were deferred to named owners or noted as no-action, the cross-references are preserved so the design reviewer can follow the graph, and the cross-sprint binding design principle (DP-1) was verified as satisfied by the design.

If the Phase 7 implementation dispatch later surfaces a CHECK constraint failure on the new triage decision table, the implementation report adds OBS-17 to the followups doc and cites it in the "OBS surfaced during this dispatch" section. The next Phase 7 hotfix or Sprint 2 design dispatch picks up OBS-17 from the doc on its own loop-closure pass.
