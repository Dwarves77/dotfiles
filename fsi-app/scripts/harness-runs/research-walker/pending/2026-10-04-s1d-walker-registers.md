## Change

Lane S1-D, 2026-10-04: `scripts/research/research-walker.mjs` (a `research-walker` governing file) now
resolves each OpenAlex candidate's publisher host through the institution class table plus committed host
verdicts (rule 18). A host that places is registered (previewed as `would_register` in dry mode) and then
minted through the unchanged chokepoint; a host that does not place is residue ("awaiting host verdict
batch"), listed in `metrics.unplaced_hosts`, and no longer counted as an `unsourced` rejection.

## Planned run

`research-walker-run-003.json` (dry, fixture, no network) is committed with this lane and supersedes this
marker; it carries the new metrics shape. Delete this file when the next real `research-walker` run lands.
