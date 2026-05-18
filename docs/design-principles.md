# Caro's Ledge Design Principles

Binding cross-sprint, cross-phase design principles for Caro's Ledge. Each entry (DP-N) is a MUST, not a SHOULD. Compliance is verified yes/no per the entry's compliance test; "maybe / partially / in some cases" is a failure.

These principles persist across sprints and apply to any current or future design dispatch, implementation dispatch, or operator-surface work. They take precedence over scope convenience.

**Loading.** The `sprint-followups-discipline` skill (`fsi-app/.claude/skills/sprint-followups-discipline/SKILL.md`) reads this file alongside the current sprint's followups doc on every in-scope dispatch and emits a DP compliance section in the dispatch report.

**Authorship rule.** New principles are added only on explicit operator authorization. The agent may surface candidate principles (in followups OBS entries or dispatch reports) but does not author new DP-N entries without authorization.

---

## DP-1: Single-Pane Operator Review

**Statement.** When an operator is reviewing or fixing materials for a single item, every related action MUST be available from one location. Tab-switching across the admin surface to handle related decisions for the same item is forbidden by design.

This principle is binding. It is not aspirational, not a guideline, not a default. Any operator-surface design that requires the operator to navigate away and back to complete related decisions on the same item violates DP-1.

### Scope of "single item"

For DP-1, "single item" means any of:

- An `intelligence_items` row
- A `sources` row
- A `jurisdictions` row (or the canonical jurisdiction taxonomy referenced by an item)
- A flag: `integrity_flags` row, `pending_jurisdiction_review` row, `ingest_rejections` row, or any future operator-queue row keyed to a single record
- A supersession: `item_supersessions` row (dedup or archive relationship between two `intelligence_items` rows; the "single item" surface is the winner-loser pair as one operator decision)

### Scope of "related actions"

For DP-1, "related actions" means any of:

- Viewing the item's current state
- Editing the item's metadata (status fields, jurisdiction fields, classification fields, hidden_reason, instrument_type, instrument_identifier, etc.)
- Triaging a flag against the item (mark resolved, defer, reroute, replace value)
- Updating the source registry record the item depends on (source tier, access type, paywall status, ingestion endpoint, last verified date)
- Recording an audit decision (mark resolved, replace URL, defer to counsel, override classifier, etc.)
- Capturing an operator note that future operators can grep
- Viewing the audit trail of past decisions on this item, including past decisions on adjacent surfaces (flags resolved on this item; supersession events; source-side metadata edits)

When any combination of these actions touches the same single item, they MUST be reachable from one screen, one form, one operator workflow.

### Out of scope

DP-1 does NOT apply to:

- **Customer-facing UI.** Workspace owners and end users browsing the dashboard, regulations pages, market pages, etc. DP-1 is an operator-surface principle.
- **Read-only displays with no actions to consolidate.** A read-only audit log or a read-only source list does not need consolidation; there are no actions to inline.
- **Different items in sequence.** Each item gets its own single-pane surface. The operator reviewing item A then item B opens two single-pane views in sequence. DP-1 does not require merging item A and item B into one view.
- **Cross-item batch actions.** Operations that act on many items at once (e.g. "mark all flags older than 30 days resolved") have their own batch surface and are outside DP-1.

### Compliance test

For any operator-surface design that touches review or fix workflows on a single item, ask: **"Can the operator complete every related decision and edit on this single item without leaving the current screen, form, or workflow?"**

- Yes: DP-1 compliant.
- No: DP-1 violation. Redesign to inline the missing actions or restructure the workflow to remove the cross-surface dependency.

"Maybe", "partially", "for most cases", "in the common path" are all DP-1 violations. The test is binary.

### Violation example (current Sprint 1 state)

Operator triages an integrity flag:

1. Opens INTEGRITY FLAGS tab. Views the flag, the agent's brief, the flagged content.
2. Realizes the underlying source's tier or access metadata needs updating before the flag decision is well-grounded.
3. Switches to SOURCE REGISTRY tab. Locates the source. Updates metadata. Saves.
4. Switches back to INTEGRITY FLAGS tab. Marks flag resolved.
5. Switches to AUDIT LOG tab. Verifies the resolution was recorded with the correct note.

Four tabs, three context switches, one decision. DP-1 violation.

### Compliance example (target Phase 7 state)

Operator triages an integrity flag on a single-pane operator review surface:

- The flag, the agent's brief, the flagged content are all visible.
- Inline strip on the same page: the underlying source's full metadata (tier, access type, paywall status, last verified date, ingestion endpoint) with edit-in-place fields.
- Inline decision controls: mark resolved, defer, reroute, replace URL, replace value.
- Inline audit-note text field.
- Inline audit trail: past decisions on this flag, past decisions on this source, past supersession events involving this item.

One screen, zero tab switches, one decision recorded with full context.

### Cross-references

- **OBS-14** in `docs/sprint-1/followups.md`: triage UI lacks inline source metadata; every triage decision is a multi-tab workflow. DP-1 is the underlying axiom OBS-14 manifests against.
- **OBS-15** in `docs/sprint-1/followups.md`: briefs cite journal homepages without article-level source context. The Phase 7 display half of OBS-15 (operator triaging a brief needs DOI / authors / abstract inline) is also a DP-1 manifestation; the Phase 6 generation half (the brief must populate the fields in the first place) is the upstream dependency.
- **OBS-13** in `docs/sprint-1/followups.md`: all-rejected-jurisdictions rows that fail gate 7.2a need a triage path. Whatever Phase 7 option is selected, the triage surface for these rows MUST comply with DP-1.
- **`sprint-followups-discipline` skill**: enforces that design dispatches read this file alongside the current sprint's followups doc and emit a DP compliance section.

### Owners

DP-1 owners by phase:

- **Phase 7 admin chrome and triage UI**: primary owner. Phase 7 design dispatch MUST cite DP-1 and demonstrate compliance in the design spec.
- **Phase 6 brief generation**: indirect owner via OBS-15's upstream dependency. Phase 6 design must produce article-level fields that the Phase 7 single-pane surface can render inline.
- **Any future sprint adding operator surfaces**: DP-1 applies. The new surface's design dispatch MUST cite DP-1 and demonstrate compliance.

---
