## Change

Lane L4-B (coordinator ruling 2026-10-05): `src/lib/propagation/drain.ts` Pass 2b, after a stale inference is
recomputed and registered, calls `reopenQuestionForRecompute` with the `reopenQuestionRef` that
`computeInferFromQuestion` returns, so the question the recomputed answer rests on is asked again against current
holdings (the question generator's own flag row, the same one-open-flag dedup rule). The re-open is best effort: a
failure to re-open is recorded as a drain error for that inference and never undoes the recompute. The change
adds a `questionsReopened` count to the drain result and leaves the L4-A `processedEvents` return untouched.

## Planned run

The next propagation drain run in apply mode supersedes this file. Delete it in the same change that lands that run.
