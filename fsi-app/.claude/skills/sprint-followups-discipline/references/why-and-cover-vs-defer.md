## Why the Skill Exists

Operator-observed findings during sprint execution are captured as numbered OBS entries in the current sprint's followups doc (e.g. `docs/sprint-1/followups.md`, `docs/sprint-2/followups.md`). The capture step is cheap and routine. The hard step is closing the loop in the next design or implementation dispatch that touches the relevant surface.

Concrete example from Sprint 1: OBS-14 captured that the triage UI lacks inline source metadata, forcing every triage decision into a multi-tab workflow. OBS-15 captured that briefs cite journal homepages without article-level source context (DOI, authors, abstract, publication date). Both findings have natural phase owners: OBS-14 belongs to Phase 7 (admin chrome and triage UI), OBS-15 belongs to Phase 6 (ingest wiring and brief generation) with a Phase 7 downstream consumer.

Without this skill's discipline:

- The Phase 6 design dispatch authors a brief-generation spec, ships, and never reads `docs/sprint-1/followups.md`. OBS-15 stays open. Sprint 2 inherits the same article-level source opacity. The operator surfaces the same finding again.
- The Phase 7 design dispatch scopes the triage UI based on the integrity-flag flow alone. OBS-13 (gate 7.2a all-rejected-jurisdictions rows), OBS-14 (inline source metadata), and the Phase-7-consumer half of OBS-15 all get missed. The triage UI ships, the operator opens it, the same friction recurs three different ways at once.

The skill prevents this. It enforces that every design or implementation dispatch on a phase explicitly addresses every open OBS, either by incorporating it or deferring it with reasoning that names the eventual owner.

## How to Cover vs How to Defer

### Acceptable cover

- The OBS describes a Phase 7 triage UI gap, and the current dispatch designs the Phase 7 triage UI. Incorporate the gap into the spec.
- The OBS describes a brief-generation context gap, and the current dispatch builds brief generation. Incorporate the gap into the implementation.
- The OBS describes a backfill rollback pattern, and the current dispatch designs a new backfill. Apply the pattern in the design.

### Acceptable deferral reasoning

- "Different design owner. OBS-15 (article-level source context) belongs to Phase 6 ingest wiring; the current dispatch is Phase 7 triage UI. Phase 6 design dispatch will own incorporation; Phase 7 will own the downstream display surface once Phase 6 lands."
- "Different sprint owner. OBS-9 (classifier feedback loop) is explicitly Sprint 2 scope per operator decision; the current Sprint 1 dispatch defers, no action."
- "Out of dispatch surface. OBS-7 (Norway Fjords instrument_type pending counsel) is a single-row UPDATE pending external input; no code or design action available to the current dispatch."
- "Blocked on prerequisite. OBS-X depends on OBS-Y being resolved first; OBS-Y is open and Deferred to a different phase; current dispatch cannot act."

### Unacceptable deferral reasoning

- "Forgot." Not a reason. The skill exists specifically to prevent this.
- "Didn't seem relevant." If the OBS appears in the followups doc and the dispatch touches the relevant surface, the relevance call must be substantive, not vibes.
- "Out of scope" without naming the actual owner. Every deferral names the next owner so the followups doc carries forward a routing assignment, not a punt.
- "Will get to it later" without naming the later dispatch. "Later" is not a routing assignment.
