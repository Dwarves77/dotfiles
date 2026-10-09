## Cross-Reference Rule

OBS entries cross-reference each other. When the dispatch report cites an OBS, it surfaces the OBS's existing cross-references so the design connectivity is preserved.

Example: a Phase 7 design dispatch covering OBS-14 (triage UI inline source metadata) surfaces OBS-14's cross-references in the coverage table: OBS-4 (source_column tracking from migration 082), OBS-13 (all-rejected-jurisdictions gate), OBS-9 (Sprint 2 classifier feedback loop). The Phase 7 designer then knows the triage UI scope intersects with the classifier feedback loop's eventual feedback path and with the gate 7.2a rows, and can design the UI to accommodate both rather than discovering the coupling at implementation time.

The cross-reference surfacing is the agent's job. The dispatch report does not need to act on every cross-reference, but it does need to display them so the design reviewer sees the graph the OBS already encodes.

## Handling New OBS Surfaced During Execution

Implementation dispatches frequently surface new findings (CHECK constraint not in the design's pre-flight, trigger interaction not modeled, pooler limit not anticipated, operator workflow gap visible only in production). When a new finding surfaces:

1. Add a new OBS entry to the current sprint's followups doc with the next available number. Format matches the existing entries: source line, phase line, priority line, narrative.
2. Cross-reference any related existing OBS entries.
3. Note the new OBS in the dispatch report's "OBS surfaced during this dispatch" section.
4. If the new OBS has a clear owner that is NOT the current dispatch, note the routing.

Implementation reports MUST surface new OBS even when no existing OBS required coverage. The capture is the loop's input; missing the capture step breaks the loop for the next dispatch.

## Output Format Requirement

### Design dispatch reports

Carry both an OBS coverage table AND a DP compliance section in the dispatch report, immediately after the dispatch summary and before the design content.

**OBS coverage table:**

| OBS | State | Decision | Cross-references | Reasoning |
|---|---|---|---|---|
| OBS-13 | Open | COVER | OBS-14, OBS-9, DP-1 | Phase 7 design scope; adding third triage tab for all-rejected-jurisdictions rows per option 1; triage tab itself DP-1 compliant. |
| OBS-14 | Open | COVER | OBS-4, OBS-13, OBS-9, DP-1 | Phase 7 design scope; spec adds inline source metadata strip on every queue surface per DP-1. |
| OBS-15 | Open | DEFER | OBS-14, OBS-9, DP-1 | Phase 6 ingest-wiring owner for field generation; Phase 7 design notes downstream consumer of article-level fields with DP-1 compliance binding once Phase 6 lands. |
| OBS-7 | Open | DEFER | (none) | External dependency (counsel review); no design action available. |
| OBS-11 | Implemented | NO ACTION | (none) | Bracket pattern landed in `phase-5-backfill.mjs`; current dispatch does not reopen. |

**DP compliance section:**

| DP | Compliance test | Result | Evidence or reasoning |
|---|---|---|---|
| DP-1 (Single-Pane Operator Review) | Can the operator complete every related decision and edit on this single item without leaving the current screen, form, or workflow? | PASS | Design § 3.2 (triage surface) inlines flag, source metadata strip with edit-in-place, decision controls, audit-note field, and audit trail on one screen. § 3.4 (all-rejected-jurisdictions tab) inlines the same controls plus a canonical-replacement picker. Zero tab switches in any documented operator workflow. |

If a DP fails, the section MUST say so and the dispatch redesigns before report submission. If a DP is not applicable, state the reason ("no operator-surface scope in this dispatch", "no actions to consolidate; read-only display").

### Implementation dispatch reports

Carry an OBS coverage table and a DP compliance section with the same structure, plus a separate "OBS surfaced during this dispatch" section listing any new entries:

```
## OBS Surfaced During This Dispatch

- **OBS-N: [title]**, captured at `docs/sprint-N/followups.md`. Source: [where it surfaced]. Owner: [phase or sprint]. Cross-references: [related OBS].
```

### Sprint planning or sequencing dispatches

Carry the coverage table for OBS entries the planning decision affects. Use the Decision column to surface scope assignments rather than per-OBS implementation moves.
