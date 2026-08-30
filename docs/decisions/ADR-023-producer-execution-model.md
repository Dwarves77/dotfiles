---
id: ADR-023
title: Producers are scheduled workers with a named runtime, not scripts someone remembers to run
status: accepted
date: 2026-08-30
scope: fsi-app data producers — WO-16 market_series, WO-17 regional_data_facts envelope, WO-18 emission-factor seeders, and every producer added after them
supersedes: nothing; this SUPPLIES a layer the producer design never had
related: WO-16, WO-17, WO-18, WO-9 layer 2 (the reader that had nothing to read), CLAUDE.md rule 11 (recurring workers check a kill switch), rule 015 (guarded write path), ADR-020 (vertical scope)
---

# ADR-023 — Producers are scheduled workers with a named runtime

## Context

Waves 4 through 7 built, for three separate stores, the complete vertical slice minus one layer:

| Store | Migration | Producer | Reader | Rows |
|---|---|---|---|---|
| `market_series` | 268, applied | EU Weekly Oil Bulletin | market series board | **0** |
| `regional_data_facts` envelope | 267, applied | Eurostat `nrg_pc_205`, BLS OEWS | matrix indexed layer (WO-9 L2) | 75 rows, **0 enveloped** |
| `emission_factors` | 258, applied | DESNZ + EPA seeders | `/admin/factors` | **0** (until 2026-08-30) |

Schema applied, producers written and fixture-tested, readers built and rendering. Three surfaces
showed a finished container with nothing in it, and every gate in the repo was green while that was
true — the suite, `tsc`, the fitness functions and the discipline engine all answer *"is the code
correct?"* and none of them answers *"is there anything to show?"*

The cause was not caution and not an unfinished producer. **The producers were correct and
unrunnable.** The environment that authors this codebase has no outbound access to the sources they
read (`ec.europa.eu`, `energy.ec.europa.eu`, `api.bls.gov` — all HTTP 000 under the org egress
policy, confirmed by `curl` 2026-08-30) and none to the Supabase host either. There was no
environment anywhere in which a producer could execute. Nothing in the design said where one should.

That is the hole. A producer's design specified its parser, its fixture, its idempotency key, its
guarded write path and its kill switch — everything except **where it runs and when**. Its own kill
switch comment ("so a scheduled invocation can never silently turn this producer on") presumes a
scheduled invocation that was never built. The producer layer was designed as *scripts a person
remembers to run*, and no person and no schedule was ever named.

## Decision

**A producer is not complete until it has a named runtime and a schedule. Store, producer, reader and
runner ship together, or the work order is not done.**

1. **The runtime is GitHub Actions** (`.github/workflows/producers.yml`). It is the only environment
   in this program that has outbound access to the sources *and* holds the two secrets a producer
   needs (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — the pair `data-audit-lane.yml`
   already uses), *and* leaves a log an operator can read after the fact. It is free on this repo,
   and every source is an open, unauthenticated, licence-cleared API: $0 in the standing sense — no
   metered call, no key, no per-request charge.

2. **BUILD-MODE AMENDMENT (operator ruling 2026-08-30, supersedes the schedule half of this decision
   until build mode ends):** while the site is being built, producers run by EXPLICIT DISPATCH only —
   dry, plan read, then apply. The `schedule:` block is removed from producers.yml (left in place as a
   commented block with its exact crons), because a schedule that applies unreviewed writes into a
   system still being assembled is the wrong risk order: populate first, observe, then automate. The
   runtime, both gates, and the cadence rationale below all stand; re-arming is that one commented
   block, restored in one reviewed diff, when the operator ends build mode.

3. **Each producer runs on a schedule matched to its source's real publication cadence** (deferred by
   the amendment above), not a
   convenient round number. The EU Weekly Oil Bulletin publishes Thursdays, so it runs Fridays.
   Eurostat `nrg_pc_205` is bi-annual and BLS OEWS annual, so they run monthly — often enough to
   catch a release within weeks, rarely enough that the run is almost always a no-op upsert.
   Over-polling an open API is not free in goodwill even when it is free in money.

4. **Two gates, guarding two different questions, and they stay separate.**
   - The producer's source-level `const ENABLED` answers *"has a human reviewed this producer and
     agreed it may ever write?"* It is a reviewed-code-change gate: flipping it appears in
     `git diff`. This is what stops a schedule from silently arming a producer nobody vetted.
   - The workflow's `mode` input answers *"is THIS run allowed to write?"* Manual dispatch defaults
     to `dry`. Scheduled runs apply, because a schedule that only ever dry-runs is theatre.
   - **Fast disarm** is the Actions tab: disabling the workflow stops every producer immediately
     with no deploy. That matters more than fast arming, and the source constant alone could not
     provide it — you cannot stop a misbehaving worker with a pull request.

5. **First live run is dry, inspected, then applied.** These producers have parser tests against
   committed fixtures, never a live endpoint. A fixture proves the parse; it does not prove the
   endpoint still returns that shape. The first `apply` follows a `dry` whose plan a human read.

6. **Population is a reported state, not something anyone has to notice.**
   `scripts/verify/population-report.mjs` prints, for every store: rows, the non-null count of the
   column that decides whether its reader shows anything, the reader's name, and the producer that
   would fill it. It runs before and after every producer run and on every PR.

   It is **not** pass/fail by default, deliberately. Mid-build, empty is the *correct* state — you
   build the place to put the information before you populate it, and a gate that went red for being
   mid-build would be switched off inside a week. `--strict` is for the one caller where empty is
   genuinely a failure: the step immediately after a producer's `--apply`.

   The state it exists to catch is not "empty". It is **`ROWS_NO_VALUES`** — `regional_data_facts`
   sat at 75 rows and 0 enveloped values, so every count-based check read as healthy while the
   reader over it rendered nothing. Row count was the wrong question; that distinction is now pinned
   by a test.

## Consequences

- The three WO-17/WO-16 producers are armed and scheduled. `emission_factors` was populated
  2026-08-30 from the EPA fixture (offline, primary-verified) and is FILLED at 2 rows.
- **Definition of done changes for every future producer WO.** "Producer written and fixture-tested"
  is no longer done. Done is: written, fixture-tested, armed, scheduled, run once, and the store
  observed non-empty by the population report.
- A store that is legitimately mid-build now says so out loud on every PR instead of looking
  finished.
- **The first live run earned its keep immediately, which is the point.** Run #1 (dry, 2026-08-30)
  showed both regional producers fetching and parsing their live sources correctly — 283 and 3
  candidate rows, full envelopes — and showed the EU Weekly Oil Bulletin producer had no input at all:
  it is a parser with `--input`, never a fetcher. Run #2 (`apply`, eurostat) then failed at its first
  row with `null value in column "value" ... violates not-null constraint`, because the orchestrator
  passed parser OBSERVATIONS straight to the guarded insert and never called `buildEnvelopeRow`, the
  one home that derives that NOT-NULL column. Both defects had been in `master` since Wave 4 with
  every gate green.
- **Fixture tests prove layers; only a live run proves a seam.** Each layer here had a passing proof —
  parser against a fixture, `buildEnvelopeRow` against a hand-built observation, `planUpsert` against
  `buildEnvelopeRow` output — and the seam that joined them had no proof at all, so a chain of correct
  parts could not write a row. The orchestrator now has `run-envelope-producer.test.mjs`, and its
  assertion is against the live table's NOT-NULL column set rather than against "the field exists":
  a candidate row that satisfies the planner but not the table is precisely the failure that occurred.
- **Recorded, not fixed here:** the DESNZ seeder stays unarmed. Its four `ttw_co2e` values came from
  a third-party republication, not the primary DESNZ workbook (403 to the sandbox; the file is
  `.xlsx`, which the fetch tool cannot parse). Arming a producer whose numbers are UNCONFIRMED would
  be exactly the failure this ADR is meant to prevent, in the other direction — populated, visible,
  and wrong is worse than empty.

## Alternatives rejected

- **Manual-dispatch-only workflow.** Considered and rejected as a button rather than a fix: it
  leaves "does the site have data" depending on someone remembering, which is the condition that
  produced three empty stores in the first place.
- **Vercel cron.** The app already deploys there, but producers are batch data jobs with no HTTP
  caller, and routing them through an API route to satisfy a cron shape adds an auth surface and a
  timeout ceiling for nothing.
- **Run producers from the authoring sandbox.** Not available: no egress to the sources or to the
  database. This is the constraint that created the problem; it cannot also be the solution.
- **Make the kill switch purely a runtime env var.** Faster to arm, but it removes the property the
  source constant exists for — that arming a producer is visible in a diff. Keeping both, with the
  workflow toggle as the fast-disarm path, preserves each without the weakness of either.
