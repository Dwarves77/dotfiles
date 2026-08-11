# Data-audit lane — diagnosis of the failing runs (2026-08-11)

The lane was STOPPED by operator instruction on 2026-08-11 ("don't fix it, just stop the audits"). It remains
stopped. This is the diagnosis that was owed, not a change to it. Read-only investigation: run logs and the
checkout, nothing executed against the database, nothing re-enabled.

## Correction to the record, first

Every prior note — the workflow comment, the wiring census §C, the PR body for #439 — says **"eight
consecutive reds, runs #58–#65."** That is wrong and understated.

**Every run from #37 through #65 failed. Twenty-nine consecutive.** The last green run was **#36**. Only runs
#1–4, #27, #29 and #33–36 ever passed. The eight-run figure came from reading only as far back as the emails
the operator had in hand, and no one checked how much further it went. What broke at #37 was not investigated
and is outside this diagnosis.

The correction matters beyond arithmetic: a lane red for eight nights reads as a recent regression, and one
red for twenty-nine reads as a lane nobody has been able to act on for a month. The second is the true
picture, and it is the reason the stop instruction was right.

## Verdict: MIXED, and the two halves separate cleanly per-audit

The failing step is the same in every run — `Run the data-audit lane` → exit code 1 — and that exit is the
runner's own verdict, not a crash. Run #65: **`hard failures/errors: 18 | soft (informational): 0`**.

Of those 18:

### (a) NINE audits ran correctly against live data and reported real drift

These reached their assertions, queried the live corpus, and returned specific counts and row IDs. The REST
credentials are valid and unexpired — the audits returned live figures (1,093 institutions; 19,287 claims;
1,062 intelligence_items) and no auth or permission error appears anywhere in the logs.

| audit | what it reports (run #65) |
|---|---|
| one-tier-per-host | 111 of 1,093 hosts carry inconsistent `base_tier` with no `tier_override` (e.g. `eur-lex.europa.eu` = {tier1: 715, tier2: 5}) |
| claims-tier | 480 claims violate derivation-consistency: 212 FACT stored ≠ derived, 268 non-FACT carrying a stamp |
| ledger-onepass | 178 FACT stamp mismatches; 268 non-FACT stamped |
| quarantine-disposition | 110 live-quarantined; **37 undispositioned past the bound** |
| flag-age | 74 non-exempt open flags past the 30-day dwell bound, ageing to 64 days |
| deferral-hygiene | 15 flags reference deleted subjects |
| substrate-agreement | 6 items whose stored `provenance_status` disagrees with `validate()` |
| orphan-source | 2 orphans: `lacity.gov`, `houstontx.gov` |
| source-link | **1 source-less LIVE item** (`14fea5cd`) that the mint chokepoint should have rejected |

**The drift is growing, not stale.** Comparing #58 to #65: institutions 1,052 → 1,093 with violations 97 →
111; claims 18,010 → 19,287; stale-quarantined 4 → 6; undispositioned past-bound crossings **14 → 37**;
`orphan-source` flipped PASS → FAIL. Meanwhile `vocab-sync`, `unregistered-span-host`,
`canonical-key-uniqueness`, `no-generic-source` and `staged-transit` all PASS, so this is targeted, not a
blanket red.

Two of these deserve separate attention because they are invariant violations in live data, not backlog:
`source-link`'s source-less live item is exactly what F13's mint chokepoint exists to make impossible, and
`substrate-agreement`'s six disagreements mean stored status and computed status have diverged.

### (b) NINE audits failed for lane-wiring reasons and never reached an assertion

Two distinct causes, both confirmed against the checkout:

**Four hard crashes on a local-dev-only assumption.** `format-structure`, `no-names`, `routing`,
`source-vs-item` each call `process.loadEnvFile(resolve(ROOT, ".env.local"))` **unguarded**:

```
Error: ENOENT: no such file or directory, open '/home/runner/work/dotfiles/dotfiles/fsi-app/.env.local'
```

The lane runner itself wraps the identical call in `try/catch`; these four do not. `.env.local` is a
developer's file and is correctly absent from CI.

**Five exit-2 "no credentials."** `schema-drift`, `prov-guard-adversarial`, `column-existence-parity`,
`rls-credential-parity`, `pause-flag-guard-proof` need a direct-Postgres path the workflow never supplies.
`schema-drift-audit.mjs` and `rls-credential-parity.mjs` read `supabase/.temp/project-ref` and
`supabase/.temp/pooler-url` — artifacts of a local `supabase link`, absent from a fresh checkout. The workflow
injects `SUPABASE_DB_PASSWORD` but neither of those files, and injects neither `SUPABASE_DB_URL` nor
`DATABASE_URL` that `pause-flag-guard-proof.mjs` requires. The runner's own comment asserts these audits "run
for real in the secrets lane"; that assumption is simply false, and has been since they were added.

### Which came first is decisive

Runs #58 and #62 ran an older ten-audit list and were red on **drift alone** — five real failures plus one
setup error. The fourteen additional audits, carrying all four ENOENT crashes and four of the five credential
errors, were wired in around 2026-08-09/10 and first appear by #64.

**The (b) noise was added on top of an already-red lane.** The lane did not break and then start reporting
drift; it was reporting drift, and then acquired a second, unrelated failure mode that made the report harder
to read. That ordering is why "is the lane broken or is the data bad?" had no single answer.

## Setup phase vs assertions

Checkout, Setup Node and `npm ci` succeeded in every run. No dependency failure, no Node-version problem, and
no audit script named by the workflow is missing — all 24 `AUDITS` entries resolve in the checkout, so the
renamed-or-deleted-script hypothesis is ruled out. The REST-path secrets work. The direct-Postgres path is
incomplete, and those five audits bail before ever using `SUPABASE_DB_PASSWORD`, so that secret's validity
remains untested in either direction.

## Not established

- **The drift findings were not independently verified against the database.** The audits demonstrably
  executed and returned specific row IDs; whether the corpus is actually wrong was not confirmed. An
  audit-logic bug producing nine consistent false positives is not excluded by logs alone. Confirming means
  running the audits against live data, which was not done.
- **What broke at run #37** — outside the investigated window.
- **Runs #59–#61 and #63** were not individually inspected, so the exact run where the ten-audit list became
  twenty-four is not pinned (it is #63 or #64).

## Disposition

Nothing here changes the stop. The lane stays stopped, its cron stays commented out, and every audit stays
runnable on demand via `workflow_dispatch`.

Three items for the operator, in the order they matter:

1. **The (a) findings are live data defects and they are growing.** Undispositioned past-bound crossings went
   14 → 37 in a week. The source-less live item and the six substrate disagreements are invariant violations,
   not backlog. These want a decision about the corpus, independent of whether the lane ever runs again.
2. **The (b) failures are a four-line fix** — guard the `loadEnvFile` call in four scripts, the way the runner
   already does — plus a decision about whether the five direct-Postgres audits should be given a connection
   string in CI or moved out of the lane. Not done here: the instruction was stop, not fix.
3. **If the lane is ever re-armed, fix (b) first.** Eighteen failures where nine are real and nine are
   plumbing is a report nobody can act on, which is how it went unread for twenty-nine runs.

---

## RESOLUTION (same day, operator-directed): fixed and proven green — and DELIBERATELY LEFT UNSCHEDULED

The operator's follow-up instruction reversed the stop's second half: "resolve #5 — stopped by instruction,
not fixed." Everything below happened after the diagnosis above and is verified in CI, not asserted.

**The (a) drift went to zero first** (PR #443, docs/audits/data-drift-remediation-2026-08-11.md): all nine
classes resolved by deterministic SQL through the existing trigger machinery, $0 spend. Not established
above was whether the audits' findings were real or nine consistent false positives; the remediation settled
it — the findings were REAL (111 tier groups, 837 claim stamps, the source-less item, all concretely fixed),
with one nuance: the substrate disagreements and the fleet's collision flags traced to a derivation bug
(migration 255), so the constraint was right and the stored data wrong in a way the audit correctly smelled.

**The (b) wiring was a four-line fix plus one decision, exactly as §(b) predicted** (PR #444): the four
unguarded `loadEnvFile` calls got the runner's own try/catch, and the five direct-Postgres audits got ONE
shared resolver (scripts/lib/pg-conn.mjs, vocab-sync's proven candidate logic extracted) that derives a
connection from the secrets the workflow already injects — the "give them a connection string in CI"
decision, made without adding any secret.

**Dispatch run #66 — the lane's first honest execution — then did its job**: 19 PASS (including CI
confirmation of every drift fix) and 5 FAIL, each diagnosed to root cause (PR #445). Four were audit-harness
defects reaching their first real run: a stale JS mirror of the canonical-key derivation (now ONE shared,
selftest-pinned mirror), a missing `open` filter in deferral-hygiene's deleted-subject check, prov-guard
comparing pg's SQLSTATE against a condition NAME plus a multi-statement probe the extended protocol rejects,
rls-credential-parity iterating an unparsed name[] string, and column-existence-parity's three parser
defects. The fifth was the audit class working: THREE real inert reconciler grants (migration 257 adds the
missing SELECT policies) and ONE real live-code bug — source-growth.ts writing a `notes` column
provisional_sources does not have, a PostgREST silent whole-row reject that had been eating worklist upserts
invisibly.

**Run #67 was the first fully green run** — hard failures 0, block-state resolved (Layer C teeth releasing
generation). Every audit now tells the truth about the corpus.

**THE CRON STAYS STOPPED.** Operator ruling, restated after the fix landed: "i dont want nightly scans right
now, we are building the system, this is build mode." Fixed is not the same as scheduled — the schedule is
the operator's call, and a green run does not earn it. Every audit stays runnable on demand
(workflow_dispatch, or directly on the command line); only the unattended nightly firing remains off, and
re-arming is one uncommented block in the workflow whenever the build phase ends.

Of the three operator items in the diagnosis above: (1) the drift findings — done and CI-confirmed;
(2) the (b) wiring fix plus the direct-Postgres decision — done; (3) "if the lane is ever re-armed, fix (b)
first" — (b) was fixed first and green was proven, which is the precondition satisfied; the re-arm itself is
NOT taken, by operator ruling.
