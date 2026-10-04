## 42. `resolve-error-body-gate`

**Purpose**: resolve the `error-body-gate` `integrity_flags` family -- Part 7 task 7.4 (34 open rows at
authoring, no resolver anywhere in the codebase before this step). Written by
`src/lib/agent/canonical-pipeline.ts` (~L1671) whenever a stored capture is excluded from grounding as a
failed fetch (`isErrorBody` -- bot wall / 403 / 404 / Request-Access block / nav shell).

**Upstream**: `scripts/maintenance/resolve-error-body-gate.mjs`, reusing `captureCitedUrl` +
`buildCaptureSearchRow` (`scripts/mint/heal-provenance.mjs`, imported unmodified -- "the same write the
heal uses") and `makePoliteFetch` (`scripts/mint/export-census-rows.mjs`).

**Ruling**: ADR-030 rider. Not gated by a separate `arg` token. RESPECTS THE SCRAPE-HOLD GATE
(`holdEngaged`, `src/lib/sources/fetch-hold.mjs`, `SCRAPE_HOLD`): while engaged, every row reports
`fetch_held` and nothing is fetched or resolved -- re-dispatch after the hold lifts.

**Dispatch**: `mode=dry` extracts every failed-fetch URL per flag and reports the hold state and per-URL
intended action; never fetches. `mode=apply` (hold lifted) re-fetches each URL through the free capture
path: a `"captured"` outcome stores a fresh `agent_run_searches` row via the guarded insert and the flag
resolves noting the recapture; a still-`"held"` outcome routes the URL's host to the attach-found-sources
worklist (`scripts/_worklists/attach-found-sources.seed.json`) and the flag still resolves (a decision
either way, per ADR-030).

**Worklist row shape (fix round 1, review-7.1-7.4.md finding C -- Important)**. The row carries all four
of `item_id`/`token`/`url`/`quote` -- `token` is the failing URL's HOST (still never a Gate-A orphan
FIGURE, so `heal-provenance.mjs`'s own `foundSourcesForItem` token-matching still never consumes it --
see the script's own header); `url` is the failed-fetch URL itself; `quote` is an excerpt of the
error-body-gate flag's OWN `description` (which already names the failure class at its write site, e.g.
"stored capture(s) excluded from grounding as failed fetches (bot wall / 403 / 404 / nav shell)"), never
a fetched page's own text (there is none). This makes every appended row PASS
`attach-found-sources.mjs`'s own `isWorklistRowReady` gate (all four fields required) instead of being
filed `notReady` PERMANENTLY, which the first version of this file did -- cross-checked directly against
that gate in `resolve-error-body-gate.test.mjs`. `class: "error_body_refetch"` still distinguishes these
rows from that file's Gate-A-orphan-figure rows.

**Durability (fix round 1, same finding)**. The `maintenance.yml` step immediately after this one --
"Commit the attach-found-sources worklist (resolve-error-body-gate apply only)" -- runs
`scripts/maintenance/commit-worklist-artifact.sh` (a generalized sibling of task 6.1b's
`commit-brief-apply-artifact.sh`, modeled on it) to commit
`scripts/_worklists/attach-found-sources.seed.json` back to the dispatched ref whenever this step ran in
apply mode. A rejected push on a protected ref (`master`) degrades to a `::warning::` and never fails the
job; only a git error before any push attempt is a genuine tooling failure (`exit 1`). Read
`attach-found-sources.mjs`'s own consumer contract before changing this: it takes its worklist ONLY via
`--arg <path>` on disk, never from `integrity_flags` -- committing the FILE is the only architecturally
consistent fix.

**Artifact / read back**: `summary.json`'s `counts` (`recaptured`/`still_failing`/`hold_engaged`) and
`read_back.remaining_open` -- confirm against `SELECT count(*) FROM integrity_flags WHERE status='open'
AND created_by='error-body-gate'` (0 expected after a clean apply with the hold lifted); the modified
`attach-found-sources.seed.json` diff for the new `error_body_refetch` rows (each carrying `url`/`quote`
now); and the "Commit the attach-found-sources worklist" step's own log line (pushed, or a named
`::warning::` on a protected ref / persistent rejection) for whether the append actually landed on the
ref.

---

