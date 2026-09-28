# 2026-09-28, Lane CLOCK-TEST (real-clock time bomb in timeline-math.test.mjs)

Dispatch: fix master CI red, GitHub Actions run 36366954373 ("Discipline engine"), sha `f796a93e`.
Worktree `.claude/worktrees/clock-test`, branch `lane/clock-test`, off `origin/master` (`f796a93e`).

## Evidence [CONFIRMED]

`fsi-app/src/lib/detail/timeline-math.test.mjs:123` ("nextMilestoneClause: the EXPOSURE cell's
compact clause") failed on 2026-09-28: actual `'Transition deadline · 29 Sep 2026 · in 1 day'`,
expected `'Transition deadline · 29 Sep 2026 · in 1 days'`. Root cause: the test computed its
expectation from the real wall clock (`daysBetween("2026-09-29")`, no `fromIso`, defaulting to
`new Date()`) concatenated with a hardcoded literal `" days"`, never routed through `daysPhrase`'s
own singular/plural rule. On 2026-09-28, today+1 = 2026-09-29 = 1 day out, so the code correctly
emitted "1 day" and the test's own hand-built "1 days" string was wrong. The test was a time bomb:
it would keep failing every day the gap to the fixture's fixed 2026-09-29 date is exactly 1, and
would have silently passed on every other day for the wrong reason (string concatenation, not
`daysPhrase`).

## Fix

`fsi-app/src/lib/detail/timeline-math.ts`: `nextMilestoneClause` gains an optional `nowIso?: string`
second parameter, forwarded to `daysBetween`'s existing `fromIso` parameter (that function already
supported a pinned "from" date; only `nextMilestoneClause` was missing the pass-through). Omitted,
behavior is unchanged (falls back to the real wall clock, same as before).

`fsi-app/src/lib/detail/timeline-math.test.mjs`: the affected test now pins `now` to `2026-09-21`
and asserts the exact literal string (`"in 8 days"`), matching the review's own worked example
instead of re-deriving it from a second live `daysBetween` call. Two new tests added alongside it,
covering the two boundary cases the original test's shape could never catch even by accident:
singular (`nowIso="2026-09-28"` gives `"in 1 day"`) and zero (`nowIso="2026-09-29"` gives `"today"`).

## Class check (remediation-discipline: instance vs class)

Grepped all of `fsi-app` for `new Date()` / `Date.now()` in `*.test.mjs` files (24 files hit).
Read every hit in context. Classified:

- **Safe, opaque `now` input, no day-distance assertion**: `effective-confidence.test.mjs`,
  `automate-vs-hire.test.mjs` (unpinned cases), `carbon-intensity.test.mjs`,
  `market-series-delta.test.mjs`, `register-derivation.test.mjs`. All pass `new Date()` as a
  required context field but assert only type errors, `ok`/`!ok`, or ranges (`confidence > 0 &&
  <= 1`), never an exact string or number that a real-date/fixed-date subtraction would produce.
  One test in `automate-vs-hire.test.mjs` (npv computation) already pins `now: new
  Date("2026-09-02T00:00:00Z")`, the correct pattern, already in use elsewhere in the same file.
- **Safe, self-referential same-instant comparison**: `read-and-extract.test.mjs`,
  `read-upcoming.test.mjs` (`assert.equal(iso, new Date().toISOString().slice(0,10))`). Both sides
  read the real clock at the same instant; no fixed fixture date is diffed against it.
- **Safe, timestamp stamping only, not asserted on**: `loop-run-id.test.mjs`,
  `capture-static-primaries.test.mjs`, `apply-record-briefs.test.mjs`,
  `emit-brief-export-artifact.test.mjs`, `emit-corpus-turn-artifact.test.mjs`,
  `emit-downstream-chain-artifact.test.mjs`, `emit-gate-a-rescan-artifact.test.mjs`,
  `run-population-flywheel.test.mjs`, `run-propagation-drain.test.mjs`. `new Date().toISOString()`
  used to fill a `started_at`/`searched_at`/`generated_at` fixture field; no test reads that field
  back through a day-count or age calculation.
- **Safe, unique-path generation or elapsed-wall-time perf bound**: `run-artifact.test.mjs`,
  `emit-producers-artifact.test.mjs`, `audit-finding-status.test.mjs`,
  `population-report.test.mjs` (the `Date.now()` hits, `"does-not-exist-" + Date.now()` tmp paths;
  `bucketBriefsOwedByTypeAndAge([], Date.now())` on an empty list has nothing to bucket),
  `export-census-rows.test.mjs`, `run-source-sweep.test.mjs`, `primary-fallback.test.mjs`
  (`Date.now()` before/after, asserting only `< 2000ms`, a perf bound not a calendar one).
- **Safe, structural short-circuit, date value never consulted**:
  `run-change-detection.test.mjs`'s `evaluateScrapeGate({cadence:"off"}, new Date(), ...)` asserts
  the gate closes and the date-consulting callback is never even called (`consulted === false`);
  the real date's value is irrelevant to the assertion.
  `population-report.test.mjs`'s other `bucketBriefsOwedByTypeAndAge` calls already pin
  `Date.parse("2026-09-20T00:00:00Z")` where the bucket assignment is actually asserted.
  `seed-benchmark-instruments.test.mjs`'s `currentPeriod("weekly", new Date())` only asserts
  `assert.throws` (an unrecognized cycle), never a computed period value.

**Verdict**: `timeline-math.test.mjs` was the only file in the corpus combining (a) a real-clock
read, (b) a *fixed* fixture date, and (c) an assertion on the resulting day-distance TEXT. That
combination is the hazard shape; nothing else in the 24-file hit list has all three. Class-fix
applied at the one real instance (add the `nowIso` pass-through plus pin the test); no guard script
added. The existing hazard shape (real-clock diffed against a fixed fixture, asserted as text) is
narrow enough that a cheap static grep-guard would either miss the real cases (context-dependent:
the same `new Date()` call is fine or hazardous depending on what's asserted, not on syntax alone)
or false-positive on all the "safe" categories above. Recorded here per dispatch instruction rather
than building a bespoke lint for a single historical occurrence.

## Gates run

- `node --test src/lib/detail/timeline-math.test.mjs` (from `fsi-app/`): 24/24 pass, including the
  two new boundary tests.
- Shared install resolved via the RD-85 link (`.claude/worktrees/node_modules` pointing at
  `<main>/fsi-app/node_modules`); `worktree-node-modules.sh --check` clean for this worktree.

## UX compliance

No `.tsx`/`.css` touched. `timeline-math.ts` is a plain `.ts` module (no JSX, per its own file-header
convention) and `timeline-math.test.mjs` is a test file; neither renders. No UX smoke spec change
needed.

## Open items

None outstanding for this lane.
