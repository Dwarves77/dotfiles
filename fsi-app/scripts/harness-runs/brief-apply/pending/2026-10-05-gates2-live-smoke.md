## Change

Lane gates2-live-smoke (2026-10-05): one of this family's governing files changes.
`src/lib/agent/canonical-pipeline.ts` `writeSynthesizedBrief` now refuses a body that carries an internal marker
(an unclosed claim ledger, a `*_PROVENANCE` token, a JSON payload) before any database call, returning
`ok: false` with detail `internal_marker_in_body`. The pattern list is the shared constant in
`src/lib/agent/section-markers.mjs`. Covered by fixture tests
(`src/lib/agent/canonical-pipeline.markers.npmtest.mjs`, `src/lib/agent/section-markers.test.mjs`), not a live
`brief-apply` run.

## Planned run

The next `.github/workflows/brief-apply.yml` dispatch, landing the next `brief-apply-run-NNN.json`. Delete this
file the moment that artifact lands.
