## Change

Lane gates2-live-smoke (2026-10-05): one of this family's governing files changes. `src/lib/intake/record-facts.mjs`
`buildRecordFullBrief` now refuses an assembled full_brief that carries an internal marker (an unclosed claim ledger,
a `*_PROVENANCE` token, a JSON payload), throwing `internal_marker_in_body`. The pattern list is the shared constant in
`src/lib/agent/section-markers.mjs`. Covered by fixture tests (`src/lib/intake/record-facts.markers.test.mjs`), not a
live mint run.

## Planned run

The next mint harness run that lands the next `mint-run-NNN.json`. Delete this file the moment that artifact lands.
