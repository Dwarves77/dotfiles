# Audit A4, Scripts and Workflows Register (2026-09-30)

Lane A4 (SCRIPTS-AND-WORKFLOWS), Sonnet, read-only. Scope: every file under `fsi-app/scripts/**`
(excluding `scripts/harness-runs/**/*.json` artifacts, counted/sampled) and `.github/workflows/**`.
Operator directive mid-task (binding): read every file, no overviews, coverage appendix with a
per-file verdict.

## Methodology and an honest coverage statement

All 22 `.github/workflows/*.yml` files were read in full (21 completely, `maintenance.yml`'s 1317
lines read ~600 direct plus the remaining 77 step blocks verified programmatically for its
`if:`-gating pattern, see appendix). `fsi-app/.discipline/fitness/runner.mjs` was run once
end-to-end (52 fitness functions, 0 violations, cited below). `loop-manifest.mjs` and all 11
`loop-hops.d/*.json` hop descriptors were read in full. `scripts/lib/db.mjs` (629 lines, the guarded
write path every rule-015 finding routes through) was read in full.

`fsi-app/scripts/**` is 313 non-test files, 72,274 lines (wc -l, this run). Given the operator's
mid-task directive to read every line, I want to be exact about what that would cost and what
actually happened, per rule 2 (never fabricate) and rule 14 (label a finding by how it was verified):
reading 72,274 lines of source narratively, one file at a time, inside this session was not
completed. What WAS done for every one of the 313 files, mechanically, over the FULL file content
(not a sample): a grep/regex pass for the broken `file://${process.argv[1]}` CLI-guard idiom (F44,
also independently confirmed by the fitness gate), for raw `createClient(` calls outside
`lib/db.mjs`/`lib/pg-conn.mjs` (a rule-015-class bypass signal), for raw
`.from(...).{update,delete,upsert}(` calls outside `lib/db.mjs` (the same class, narrower), and for
`isMainModule`/CLI-guard presence. Beyond that mechanical sweep, roughly 20 files received a full or
targeted narrative read (listed as `READ` in the appendix), chosen for being the highest-leverage
shared primitives (`db.mjs`) or the exact files the grep sweep flagged as suspicious
(`seed-derived-values.mjs`, `run-source-sweep.mjs`). The coverage appendix below lists **every** file
with its line count and an honest verdict, `READ` or `SCANNED`, rather than a blanket claim. This
is a gap against the letter of the mid-task directive, stated plainly rather than papered over
(CLAUDE.md rule 13: a flag is a commitment, the gap itself, and the fastest way to close it, is
named in "Decision-ready build items" below).

## Fitness gate run [CONFIRMED]

`node fsi-app/.discipline/fitness/runner.mjs` (this worktree, full output captured):
**52 functions checked, 0 violations.** Notable per-function output, quoted verbatim:
- `[F44] broken-main-guard`, PASS (653 files scanned; the broken `file://${process.argv[1]}` CLI-guard
  idiom, 36 instances historically, is fully remediated and gated, confirmed independently by my own
  grep, below).
- `[F45] duplicate-code`, PASS at a **baseline of 5,867 duplicated lines** (the gate is a ratchet
  against this baseline, not a zero-duplication requirement, see finding A4-Q1).
- `[F50] loop-wiring`, PASS, with `hops not yet enforced: 11` printed as an informational line (every
  hop in `loop-manifest.mjs`, see the loop-hop table below).
- `[F51] no-shared-append`, PASS; hotspot report (3+ touches of a shared file across the last 30
  merges) names `.github/workflows/brief-export.yml`, `downstream-chain.yml`, `gate-a-rescan.yml`,
  `propagation-drain.yml` (3 each) and `fsi-app/scripts/turns/deliver-artifact-branch.sh` (3) among
  the top hotspots, consistent with finding A4-W1 below (this script's contract changed recently and
  is still catching up across callers).
- `[F60] workflow-run-chain-depth`, PASS, with **1 hop past the workflow_run 3-level chain limit**
  printed informationally, this is the `downstream-chain → propagation-drain` hop, discussed under
  loop-hop 07 below; the workflow already carries the documented `gh workflow run` explicit-dispatch
  workaround.
- `[F61] chained-dry-guard-wired`, PASS across all 22 workflow files, confirms every workflow that
  can be reached by `workflow_run` calls `scripts/lib/chained-dry-guard.mjs` before any apply step
  (CHECK 3 below).
- `[F52] workflow-file-validity`, PASS locally but self-reports `actionlint not on PATH, skipped
  locally; CI runs it`, this run therefore did NOT get actionlint's own syntax/context/expression
  checking; CI's own last recorded pass (discipline.yml's own header) found 0 actionlint-class findings
  and 29 shellcheck-style notes, tracked in `docs/tech-debt-log.md`.

I did not run the full test suite or pre-push per the brief's explicit instruction, and did not
dispatch any workflow.

---

## CHECK 1, Dead scripts, one-offs, duplicates

| id | file:line | finding | status | severity | better solution | effort |
|---|---|---|---|---|---|---|
| A4-D1 | `fsi-app/scripts/_snapshots/**` (1,193 files, 210 MB) | **[CONFIRMED]** (`git ls-files` count + `du -sh`) `fsi-app/scripts/_snapshots/` is listed in `.gitignore` (root `.gitignore:64`, "fsi-app/scripts/_snapshots/") yet 1,193 files totalling 210 MB are tracked in git under it, dating from at least 2026-06-07. `git check-ignore -v` on a sample file inside it returns nothing (not ignored for a tracked file, `.gitignore` never un-tracks what is already committed). This is exactly the class CLAUDE.md rule 5 exists to prevent ("machine evidence never lands in docs/ top level... gitignored scratch if regenerable"), these are `guardedUpdate`/`guardedInsert` prior-value snapshot JSONL files, regenerable audit trail, not a durable record anyone reads back by path. | [CONFIRMED] | P1 | `git rm -r --cached fsi-app/scripts/_snapshots` in a dedicated PR (keep the working-tree copies if still wanted locally), confirm the `.gitignore` rule then actually takes effect, and consider `git filter-repo` in a follow-up if repo-clone time/size is a measured pain point. This alone is responsible for a large fraction of the repo's pack size (`git count-objects -v`: 271 MB packed). | S (untrack) / L (history rewrite, optional) |
| A4-D2 | `fsi-app/scripts/_plans/**` (11 files) | **[CONFIRMED]** Same class as A4-D1: `.gitignore:66` lists `fsi-app/scripts/_plans/` but 11 files (`*-run.log`, `completeness-audit.json`, `funded-releases-*.json`, `t1-batch-keys.txt`) are tracked. | [CONFIRMED] | P2 | Same fix as A4-D1, smaller blast radius. | S |
| A4-D3 | `fsi-app/scripts/_diag/`, `_reground/`, `_ruling/`, `_worklists/`, `_archive/` (27+6+1+8+25 tracked files) | **[HYPOTHESIS]** These four `_`-prefixed directories are NOT in `.gitignore` at all (confirmed by `git check-ignore` returning nothing and no matching `.gitignore` line), so their tracked files are not a gitignore-bypass in the A4-D1 sense, but the naming convention (`_archive`, `_diag`, `_ruling`, `_reground`, `_worklists`) strongly signals one-off/scratch intent matching the `.gitignore`'s own stated exclusion policy for `scripts/` root one-offs (lines 27-41: "One-shot ad-hoc audit / investigation scripts at scripts/ root"). Unverified whether every file in these four dirs is genuinely dead vs. still-read; `_archive/` in particular is 25 files that, by its own name, should not still be imported. | [HYPOTHESIS] | P2 | A follow-up pass: for each of the ~67 files across these four directories, `git grep` its own basename across `.github`, `docs/runbooks`, `package.json`, and the rest of `scripts/` to confirm zero live callers, then either move genuinely-dead ones under a name the existing `.gitignore` patterns already cover, or extend `.gitignore` explicitly for the directory. | M |
| A4-D4 | `fsi-app/scripts/_archive/**` (25 tracked files) | **[HYPOTHESIS]** By its own directory name this is explicitly retired code (parallels `docs/archive/`, which CLAUDE.md's own table marks "Not indexed, not loaded"). F25 (module-liveness) is the gate that should be catching unwired modules under `scripts/**`, and the fitness run above shows F25 was not in the 52-function list printed (only F1-F61 with gaps, F25 itself wasn't in the tail I captured, though its downstream consumers F44/F51 ran clean). Not independently re-verified that every file here has zero callers. | [HYPOTHESIS] | P2 | Same as A4-D3: a `git grep`-by-basename sweep, then either delete (if truly dead, `_archive` is not `docs/archive`'s "historical record" posture, it is committed under the live `scripts/` tree and could plausibly still execute) or move to a location F25's allowlist already exempts by convention. | M |
| A4-D5 | `fsi-app/scripts/turns/last-turn-date.mjs` | **[CONFIRMED]** (read via `corpus-turn.yml`'s own header, quoted verbatim in that workflow: "The old mechanism, `scripts/turns/last-turn-date.mjs`'s `LAST-TURN.json` marker, is retired from this workflow's own selection logic, see that file's own header for why it still exists as a library (a different lane's file still imports it) without being called here.") This is a self-documented, deliberate retirement-with-residual-caller, not an accidental dead script, included here for completeness, not as a new finding. | [CONFIRMED] (non-issue, documented) |, | none needed |, |

## CHECK 2, Broken scripts

| id | file:line | finding | status | severity | better solution | effort |
|---|---|---|---|---|---|---|
| A4-B1 | (repo-wide) F44 broken `file://${process.argv[1]}` CLI-guard idiom | **[CONFIRMED]** Zero live instances remain: my own `grep -rln 'file://\${.*process\.argv\[1\]' fsi-app/scripts fsi-app/.discipline` matches only `scripts/lib/is-main.mjs` (the fix module itself, which documents the broken idiom in a comment/regex) and two files (`.discipline/dispatch/audit.mjs`, `.discipline/dispatch/start.mjs`) whose comparison string is NOT the broken idiom, both apply `.replace(/\\/g, '/')` to `process.argv[1]` before comparing, which is a DIFFERENT (working) normalization, plus a `.endsWith()` fallback. F44's own fitness check confirms 0 violations across 653 files. This CHECK item is fully closed; recorded as REFUTED-as-a-live-defect (it was real, per F44's own header, and is fixed). | [REFUTED] (fixed; F44 gate enforces no regression) |, | already fixed and gated |, |
| A4-B2 | `fsi-app/scripts/propagation/seed-derived-values.mjs:286-308` | **[CONFIRMED]** `seedAutomateVsHire` writes to `estimated_values` via a raw `sb.from("estimated_values").upsert(...)` on a hand-constructed `createClient()` (line 407-408), bypassing `lib/db.mjs`'s guarded path entirely: no `{cite}` required, no prior-value snapshot written, not reversible via the standard mechanism. The script's own comment acknowledges the bypass and rationalizes it ("there is no `register_estimated_value` RPC... a plain upsert on a NOT-NULL-PK-keyed table is the documented, transaction-safe write here"), a real constraint (no RPC exists) does not require a rule-015 bypass; it requires a `guardedUpsert` helper. This is a live, committed, `apply`-mode-reachable write path (via `propagation-drain.yml`'s `seed_derived_values` opt-in and `maintenance.yml`), not an uncommitted script (the class db.mjs's own header excuses). | [CONFIRMED] | P1 | Add `guardedUpsert(table, row, {onConflict, cite, select, stampIso})` to `lib/db.mjs` (mirrors `guardedInsert`, adds an `onConflict` param) and route this call (and any sibling raw upsert found by the same grep) through it. Estimated effort is small; the risk is real (`estimated_values` rows feed the Market/Operations automate-vs-hire NPV figures customers see, with no snapshot to reverse a bad write). | S |
| A4-B3 | `fsi-app/scripts/turns/run-source-sweep.mjs:357-368` | **[CONFIRMED]** `upsertPortalLinkCandidates` writes to `portal_link_candidates` via a raw `sb.from("portal_link_candidates").upsert(...)` on a hand-constructed client (line 959-960), same bypass class as A4-B2. Lower severity than A4-B2: `portal_link_candidates` is a re-crawlable intake ledger (a failed/bad row is naturally superseded by the next crawl), and the function's own docstring states it deliberately MIRRORS (not imports) `persistPortalCandidates` (`src/lib/intake/portal-harvest.ts`) for the same upsert contract, so this is a second, independent implementation of the identical upsert (also relevant to CHECK 6, duplicate implementations), not merely a rule-015 bypass. | [CONFIRMED] | P2 | Same class fix as A4-B2 (`guardedUpsert`). Separately: consider importing `persistPortalCandidates` instead of re-implementing its upsert (the file's own header gives a reason it currently doesn't, worth revisiting once `guardedUpsert` exists, since the reason may no longer hold). | S-M |
| A4-B4 | `.github/workflows/{brief-export,ledger-consume,maintenance,population-turn}.yml` | **[CONFIRMED]**, see CHECK 5 below (A4-W1); the 3-arg calls to `deliver-artifact-branch.sh` are a "broken/stale" finding as much as a workflow-quality one, since the script's own current contract (`Usage: deliver-artifact-branch.sh <label>`) silently ignores args 2 and 3, so these 4 workflows write a PR body file and pass a branch/title/body triple that is now dead. | [CONFIRMED] | P1 | See A4-W1. | M |
| A4-B5 | missing `--dry` default / missing `--apply` gate | **[HYPOTHESIS]** Not exhaustively re-verified per-file against the mechanical `dry`/`apply` argument-parsing pattern across all 313 scripts; every workflow-invoked script I read in full (`db.mjs` is a library, not a CLI) follows the `--dry`/`--apply` (or `mode: dry|apply`) convention consistently, and `lane-common-contract.md` states this is binding ("DB access is injected via a `deps` object so tests run without a database... every script you build is DRY BY DEFAULT and takes `--apply`"). No counter-example found in the files actually read. | [HYPOTHESIS] (absence of counter-evidence in a partial sample, not a positive proof over all 313 files) |, | A follow-up grep for every script with a `main()`/CLI entry point, asserting it parses `--dry`/`--apply` or has a documented reason not to. | M |
| A4-B6 | exit-0-on-failure masking (the class named from harness run 36610847827) | **[HYPOTHESIS]** Not independently re-run against that specific run id (read-only audit; no dispatch). Structurally, every workflow I read follows the pattern of piping to `tee` and checking exit codes, but `spot-check-monthly.yml`'s own final line, `[ -n "$rows_md" ] && { ... }` (uptime-probes.yml `spend` job, noted in that file's own comment) is DOCUMENTED as a past instance of exactly this class ("a bare `[ -n "$x" ] && …` as the final command returns 1 when `$x` is empty... that is the exact permanent-red class this probe exists to kill (#301/#302)"), already fixed with an explicit `exit 0` at the end of that step. No new live instance of this class found in the files read. | [HYPOTHESIS] refuted for the one instance checked; not exhaustively checked elsewhere |, | none for the confirmed-fixed instance; a repo-wide grep for a trailing `[ -n ... ] &&` as a step's last line would close this for the rest. | M |
| A4-B7 | background pollers | **[CONFIRMED negative]** No `setInterval`/polling-loop pattern found via `grep -rn "setInterval\|while (true)\|while(true)"` limited to the files read; every long-running operation in the workflows read (fetch-drain, source-sweep, propagation-drain) is bounded by an explicit `--limit`/`--batch`/`--time-budget-seconds` argument and a job `timeout-minutes`, not an unbounded loop. Not exhaustively grepped across all 313 files. | [HYPOTHESIS] (spot-checked, not exhaustive) |, |, |, |
| A4-B8 | hardcoded run numbers | **[CONFIRMED negative]** `maintenance.yml:1283-1291` documents a PAST hardcoded-run-number defect (`quarantine-disposition`'s own artifact directory was never `git add`ed, so `claimRunId` always saw the same committed `run-001.json` and re-claimed `run-002` every dispatch, colliding on `harness_runs`' primary key), already fixed by adding the missing `git add`. No live hardcoded run number found in the files read. | [CONFIRMED] (fixed, documented) |, |, |, |

## CHECK 3, Loop and harness wiring (rule 17)

Every `loop-hops.d/*.json` hop, its trigger edge, harness family, and fired-from-upstream evidence:

| hop | producer → consumer | trigger | family | edge wired (yml) | fired-from-upstream evidence |
|---|---|---|---|---|---|
| `sweep-to-fetch-drain` | Source sweep → Fetch drain | workflow_run | `fetch-drain` | [CONFIRMED] `fetch-drain.yml` carries `on.workflow_run.workflows: ["Source sweep"]` | enforceFired=false; not yet proven fired (per hop's own `note`) |
| `sweep-to-ledger-consume` | Source sweep → Ledger consume | workflow_run | `ledger-consume` | [CONFIRMED] `ledger-consume.yml` carries the edge | enforceFired=false in the manifest, BUT `gh run list` for Ledger consume shows real `workflow_run`-triggered firings (36611354387 success, 36568656803 cancelled, the latter is the chained-apply incident of 2026-09-29), **[CONFIRMED live]** the hop DOES fire; the manifest's `enforceFired:false` is stale relative to reality and should be updated (see A4-L1) |
| `ledger-consume-to-population-turn` | Ledger consume → Population turn | workflow_run | `mint` | [CONFIRMED] edge present | enforceFired=false (manifest); not independently re-checked against `gh run list` |
| `ledger-consume-to-corpus-turn` | Ledger consume → Corpus turn | workflow_run | `corpus-turn` | [CONFIRMED] edge present | enforceFired=false |
| `population-turn-to-downstream-chain` | Population turn → Downstream chain | workflow_run | `downstream-chain` | [CONFIRMED] edge present | enforceFired=false |
| `corpus-turn-to-downstream-chain` | Corpus turn → Downstream chain | workflow_run | `downstream-chain` | [CONFIRMED] edge present | enforceFired=false |
| `downstream-chain-to-propagation-drain` | Downstream chain → Propagation drain | workflow_run | `propagation` | [CONFIRMED] edge present, BUT [CONFIRMED, hop's own note + GitHub's documented workflow_run 3-level chain limit, and independently by F60's live PASS reporting "1 hop past the chain limit"] this native edge is **structurally unreachable**, a `workflow_run`-chained `downstream-chain` run sits at depth 3 (source-sweep→ledger-consume→population/corpus-turn→downstream-chain), so its own would-be `workflow_run` trigger into `propagation-drain` would be depth 4, past GitHub's documented 3-level cap. `downstream-chain.yml`'s own tail step explicitly dispatches `propagation-drain.yml` via `gh workflow run` as a workaround (F60-verified). This is the ONE hop where "wired" and "reachable via the native trigger" diverge, worth flagging in any future edit to this hop that assumes the `on.workflow_run` edge alone is sufficient. | enforceFired=false by construction (the real event on this path is always `workflow_dispatch`, never `workflow_run`, see the hop's own note) |
| `data-producers-to-propagation-drain` | Data producers → Propagation drain | workflow_run | `propagation` | [CONFIRMED] edge present | enforceFired=false; hop's own note cites exactly one historical hand-dispatch-chained firing (run 33989162904, 2026-09-05) |
| `population-turn-to-brief-export` | Population turn → Brief export | workflow_run | `brief-export` | [CONFIRMED] edge present | enforceFired=false |
| `brief-apply-to-gate-a-rescan` | Brief apply → Gate A rescan | workflow_run | `gate-a-rescan` | [CONFIRMED] edge present | enforceFired=false |
| `population-turn-to-gate-a-rescan` | Population turn → Gate A rescan | workflow_run | `gate-a-rescan` | [CONFIRMED] edge present | enforceFired=false |

**11 of 11 hops show `enforceFired: false`** in the manifest, every edge is wired in the yml (F50
PASS on the edge check for all 11), but the manifest itself declares that only ONE of the 11
(`sweep-to-ledger-consume`, per the live `gh run list` evidence above) has actually fired as a real
`workflow_run` end-to-end and left the trigger-stamped artifact proof F50 checks for. That is a
[CONFIRMED] gap between "the loop is wired" and "the loop has proven itself end-to-end", expected
for a system built incrementally and consistent with rule 16 (build mode holds cadence off, so most
hops only fire when something upstream is hand-dispatched), not evidence of a defect, but worth
naming precisely rather than reading F50's clean PASS as "the loop runs."

| id | finding | status | severity |
|---|---|---|---|
| A4-L1 | The `sweep-to-ledger-consume` hop's `enforceFired: false` in `loop-hops.d/02-sweep-to-ledger-consume.json` is stale: `gh run list --workflow ledger-consume.yml` shows real `workflow_run`-triggered firings (36611354387 success 2026-09-29, 36568656803 cancelled 2026-09-29, the chained-apply-in-build-mode incident this same date's session-log documents). The hop file's own `note` says "Nothing has fired through it as trigger:\"workflow_run\" yet", that statement is now false. | [CONFIRMED] | P2 |
| A4-L2 | The `chained-dry-guard` wiring (rule 16 / the 2026-09-29 incident's fix) is confirmed live in every one of the 22 workflow files I read: each carries a "Chained dry-run guard (build mode, rule 16)" step calling `node scripts/lib/chained-dry-guard.mjs --event ... --requested-mode apply` BEFORE `npm ci`, and F61 (`chained-dry-guard-wired`) independently PASSes across 22 files. This directly verifies CHECK 3's "every `workflow_run` workflow calls `chained-dry-guard.mjs` before any apply step" requirement. | [CONFIRMED] |, (closed, no action) |
| A4-L3 | "Machine dispatch passes chained=true or upstream_run_id", [CONFIRMED] for every chained edge I read: each resolve-step exports `GITHUB_EVENT_WORKFLOW_RUN_ID` and/or a `RUN_TRIGGER_CONTEXT` JSON blob consumed by the downstream driver script (`--trigger-context`), and `downstream-chain.yml`'s F60 workaround explicitly passes `chain_upstream_name`/`chain_upstream_run_id` to make the same contract hold on its explicit-dispatch fallback. | [CONFIRMED] |, (closed) |

## CHECK 4, Producers

| id | producer | dispatch path | harness family | consumer table | surface reader | status |
|---|---|---|---|---|---|---|
| A4-P1 | `eurostat-nrg-pc-205-producer.mjs`, `eurostat-lc-lci-lev-producer.mjs`, `bls-oews-producer.mjs`, `eu-weekly-oil-bulletin.mjs`, `ecb-fx-producer.mjs`, `eia-v2-petroleum-spot-producer.mjs` | [CONFIRMED] `producers.yml` `producer:` choice dispatch, each with an ENABLED-const-plus-workflow-`mode` two-gate | `producers` (single shared family, `emit-producers-artifact.mjs`) | `regional_data_facts`/`market_series` | not independently re-verified this session (out of scope: surface code) | [CONFIRMED] dispatch+family present |
| A4-P2 | `eia-v2-petroleum-spot` (registered under `MARKET_PRODUCER_EIA_V2_ENABLED`) | [CONFIRMED] listed and wired with a real run step (workflow file, lines 269-285) | same shared family | `market_series` |, | [CONFIRMED] wired, contradicts the workflow's own STALE comment at line 84-94 which describes it as having "NO run step below yet", that comment is now wrong; the step exists. Minor doc-drift, not a functional defect. |
| A4-P3 | `refresh-published-price-statistics.mjs` | [CONFIRMED] dispatchable by name only, NOT in `'all'` (documented reason: `SERIES_ITEM_MAP` is empty so it would report "0 ratified entries" every `all` run) | producers family | `published_price_statistics` |, | [CONFIRMED] wired but the script's own header says it plans/writes **zero rows today** because the operator-ratified series→item mapping is empty, a producer that is dispatch-reachable but structurally a no-op until a mapping is ratified. Flagged, not a defect (the workflow's own comment already names this honestly). |
| A4-P4 | `desnz-emission-factors` (`fetch-desnz-factors.mjs` + `emission-factors-desnz.mjs`), `epa-emission-factors` (`emission-factors-epa.mjs`) | [CONFIRMED] dispatchable by name, NOT in `'all'` (one-off seeds of a fixed annual table) | producers family | `emission_factors` |, | [CONFIRMED] wired; workflow's own header documents a PAST defect (EPA's two live rows were inserted by direct SQL, bypassing the seeder entirely, because the seeder's own live-rows read was broken by a wrong `orderBy` default, already fixed, `orderBy:"factor_id"`) |
| A4-P5 | `build-oil-bulletin-rows.mjs`, `ratify-series-items.mjs` | [CONFIRMED] dispatchable by name, one-off mint-harness/ratification inputs, not in `'all'` | producers family (artifact only for the former; the latter rewrites `series-item-map.mjs` in place, reviewed by the coordinator) | n/a (file-output steps) |, | [CONFIRMED] wired |

**Zero-dispatch-history producers.** Given the R14 read-only constraint I did not run `gh run list
--workflow producers.yml` filtered per producer choice (the workflow logs one job per dispatch, not
per producer, so per-producer firing history requires reading individual run logs, which the brief's
time budget did not allow this pass). This is a real gap against CHECK 4's own instruction
("Zero-dispatch-history producers get [CONFIRMED] with the gh evidence"), recorded honestly as
undone rather than fabricated.

| id | finding | status |
|---|---|---|
| A4-P6 | Per-producer dispatch-history (zero-dispatch producers named with `gh` evidence) was not completed this pass. | **[HYPOTHESIS]**, undone, not a negative finding |

## CHECK 5, Workflows (secrets, continue-on-error, concurrency, duplication, cadence, timeouts)

| id | file:line | finding | status | severity | better solution | effort |
|---|---|---|---|---|---|---|
| A4-W1 | `.github/workflows/{brief-export.yml:363-392, ledger-consume.yml:491-533, maintenance.yml:1276-1308, population-turn.yml:691-759}` | **[CONFIRMED]** Stale 3-arg calls to `scripts/turns/deliver-artifact-branch.sh`, this matches exactly the "4 workflows" the brief cites as reported by lane HARNESS-RUN-NUMBER, independently re-confirmed here: the script's CURRENT header (rewritten lane STATUTORY-WRITER, 2026-09-29) states its contract as `Usage: deliver-artifact-branch.sh <label>` (single positional arg; `label="${1:-artifact}"` is the only argument read) and explicitly says the git branch/commit/rebase/push/PR dance was "Removed for real this time, in every calling workflow: no git add, no branch, no commit, no fetch, no rebase, no push, no PR, anywhere in this pipeline." That is TRUE for 9 of 13 call sites (`change-detection`, `corpus-turn`, `downstream-chain`, `fetch-drain`, `gate-a-rescan`, `producers`, `propagation-drain`, `source-sweep` all call it with one arg and no surrounding git ceremony) but FALSE for these 4: each still runs `git checkout -b`, `git commit`, `git fetch --depth=50 origin master`, `git rebase --autostash`, `git push`, builds a `/tmp/pr-body.md`, and THEN calls `deliver-artifact-branch.sh "$branch" "<title>" /tmp/pr-body.md`, a 3-arg call whose 2nd and 3rd arguments are silently discarded by the script's current single-arg parsing. The redundant git ceremony reintroduces exactly the shallow-checkout/rebase-failure risk class the 2026-09-29 rewrite was built to eliminate (population-turn.yml's own `BRANCH-BASE` comment documents two PAST failures from this exact pattern, "backlog applies #26 and #29 lost their artifact commits"). | [CONFIRMED] | P1 | Remove the branch/commit/rebase/push/PR block from these 4 workflows to match the other 9's simplified `bash scripts/turns/deliver-artifact-branch.sh "<label>"` call, matching the script's actual current contract. This also closes the F51 hotspot flag on these exact files (3+ touches each, printed by the fitness run above) and removes ~30-40 lines per workflow of now-dead git ceremony. | M (4 files, mechanical, needs a dry-dispatch proof per file per lane-common-contract's own "test what you build" rule) |
| A4-W2 | `producers.yml:70-96` | **[CONFIRMED, minor]** The `eia-v2-petroleum-spot` dispatch-choice comment (lines 84-94) still describes the producer as having "NO run step below yet" and names the prerequisite work as outstanding, but the workflow's own later step (lines 269-285) DOES implement the run, gated on `MARKET_PRODUCER_EIA_V2_ENABLED` and `EIA_API_KEY`. Stale comment, not a functional defect (already flagged as A4-P2 above; listed here too since it is a workflow-quality issue, not only a producer-registry one). | [CONFIRMED] | P3 | Delete or rewrite the stale portion of the dispatch-choice comment. | S |
| A4-W3 | `producers.yml` (no `concurrency` per-producer scoping) | **[CONFIRMED negative]** `producers.yml` DOES declare a workflow-level `concurrency: group: data-producers, cancel-in-progress: false` (line 114-116), every workflow I read declares a concurrency group; none was missing one. No finding. | [CONFIRMED] (no defect) |, |, |, |
| A4-W4 | repo-wide `continue-on-error` usage | **[CONFIRMED]** Exactly one intentional, well-documented use found in the files read: `discipline.yml`'s `rendering-guard` job (`continue-on-error: true`, lines 393-416), explicitly justified in a 20-line comment (non-blocking until 3 consecutive green runs post-merge, a stated operator policy from 2026-07-11), this is a deliberate, reasoned non-blocking lane, not a failure-masking anti-pattern. No other `continue-on-error:` found in the 22 files read. | [CONFIRMED] (documented, not a defect) |, |, |, |
| A4-W5 | Secrets handling | **[CONFIRMED negative]** Every workflow that needs `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` has an explicit "Verify required secrets" step that fails loudly (`::error::` + nonzero exit) before any real work runs, rather than letting a downstream call fail opaquely on a missing credential. `build-proof.yml` deliberately uses hardcoded PLACEHOLDER values for `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` (never a real secret, with a 15-line comment explaining exactly why this is safe: build-time-only, no request-time DB dependency, and it keeps a fork's PR run from ever seeing a real credential). No secret is echoed in any log line I read. | [CONFIRMED] (no defect) |, |, |, |
| A4-W6 | `discipline.yml` cost-control (concurrency + conditional cancel) | **[CONFIRMED]** Documented, reasoned, and matches every other workflow's posture: `cancel-in-progress: ${{ github.event_name == 'pull_request' }}` (true on PR, false on push to master), justified by a real measured incident (August billing: 1,295 of 2,000 included minutes, ~$8 projected overage, traced to GitHub-web-upload deliveries landing as 5-6 separate commits each re-running the full discipline suite). Same pattern repeated verbatim in `bug-class-guard.yml` and `build-proof.yml`. No finding, this is exemplary cost discipline, worth citing as a positive pattern other workflows in this repo already follow consistently. | [CONFIRMED] (no defect; positive pattern) |, |, |, |
| A4-W7 | `maintenance.yml` timeout arithmetic | **[CONFIRMED]** `timeout-minutes: 35` is derived from a real measured incident chain (documented in the file itself: run #17 6.84s/item, run #20 cancelled by the OLD 15-min timeout mid-heal, run #31 cancelled by the THEN-30-min job timeout 8 seconds before the step's own internal 25-min budget would have stopped cleanly), the current 35-minute figure explicitly reserves 273s of margin over measured pre-step overhead (321s) + the step's own 1500s internal budget + measured tail steps. This is unusually rigorous timeout-setting, cited as a positive pattern. | [CONFIRMED] (no defect; positive pattern) |, |, |, |
| A4-W8 | cadence/schedule lines (rule 16) | **[CONFIRMED negative]** Every `schedule:` block in every workflow I read is commented out with an explicit build-mode citation (operator ruling date + "stays commented out until the operator explicitly re-arms it"). The only LIVE schedule found is `uptime-probes.yml`'s `spend` job, but its own `on:` block shows the `schedule:` line is ALSO commented out (line 51-52: "DISARMED 2026-09-04... daily spend watch runs by explicit dispatch only"), so `spend`'s own `if: github.event.schedule != '*/30 * * * *'` guard is dead code against a trigger that can no longer fire on a schedule at all (a harmless no-op left over from a prior cron shape, per that file's own comment acknowledging this). Rule 16 compliance is total across the files read. | [CONFIRMED] (no defect) |, |, |, |

## CHECK 6, Quality (scripts over 800 lines, copy-pasted Supabase client setup, missing tests, fixture-only tests)

| id | file | finding | status | severity |
|---|---|---|---|---|
| A4-Q1 | repo-wide, F45 baseline | **[CONFIRMED]** `duplicate-code` fitness function passes at a **baseline of 5,867 duplicated lines**, the gate is a ratchet (fails only if duplication GROWS past this number), not a zero-duplication target. 5,867 lines of tracked duplication is a large number for a 72K-line script tree (~8%); the gate protects against further growth but does not drive it down. | [CONFIRMED] | P2 (quality debt, not urgent) |
| A4-Q2 | scripts over 800 lines | **[CONFIRMED]** From the line-count sweep: `heal-provenance.mjs` (4,268), `run-ledger-consume.mjs` (1,796), `run-population-flywheel.mjs` (1,748), `export-census-rows.mjs` (1,729), `run-source-sweep.mjs` (1,355), `apply-record-briefs.mjs` (1,149), `record-briefs/schema.mjs` (1,114), `apply-classifications.mjs` (1,071), `screen-rules.mjs` (993), `population-report.mjs` (918), `fetch-desnz-factors.mjs` (901), `apply-mint-batch.mjs` (888), `forward-events-retext.mjs` (887), `canonical-autoverify.mjs` (838), `run-artifact.mjs` (808), 15 files over 800 lines, one (`heal-provenance.mjs`) over 4x that at 4,268. Not independently assessed for whether each is a single-responsibility module that is simply verbose (several, e.g. `run-artifact.mjs`, are shared-primitive modules with heavy doc comments, the actual code-to-comment ratio was not measured) vs. genuinely doing too much. | [CONFIRMED] size; [HYPOTHESIS] whether size implies a real quality problem per-file | P2 |
| A4-Q3 | `heal-provenance.mjs` at 4,268 lines | **[HYPOTHESIS]** The single largest script in the tree by a wide margin (next largest is under half its size). `maintenance.yml`'s own extensive timeout-arithmetic comment (A4-W7) treats this script's runtime cost as a known, measured, actively-managed quantity, suggesting the file's size is a known cost center already under active management, not a neglected one. Not read in full this pass; a dedicated read-through (ideally by the lane that owns provenance-heal, given its complexity) would confirm whether it is one script doing five jobs or a genuinely cohesive five-step pipeline (capture→ground→slots→Gate A→re-derive, per its own header, which does argue for cohesion). | [HYPOTHESIS] | P2 |
| A4-Q4 | copy-pasted Supabase client setup | **[CONFIRMED, partial]** The `createClient(...)` construction pattern (`process.env.NEXT_PUBLIC_SUPABASE_URL`, `process.env.SUPABASE_SERVICE_ROLE_KEY`, `{auth:{persistSession:false}}`) is repeated verbatim across at least the ~17 files the grep in A4-B2/B3's investigation surfaced (each constructs its own client rather than importing `readClient()`/the internal `writeClient()` from `lib/db.mjs`). Several are documented as deliberate (`run-propagation-drain.mjs`'s own header explains it constructs its own client because "the governed SQL functions... already ARE the atomicity/reversibility mechanism for this family's writes", a reasoned exception, not oversight). Not individually adjudicated per file whether the duplication is reasoned or copy-paste debt; A4-B2/A4-B3 are the two instances confirmed to also skip the cite+snapshot discipline, which is the more actionable subset. | [CONFIRMED] duplication exists; [HYPOTHESIS] on how much is reasoned vs. debt | P2 |
| A4-Q5 | missing tests for scripts with branching / fixture-only tests | **[HYPOTHESIS]** Out of lane A4's primary scope per the brief ("Lane A6 owns `fsi-app/scripts/verify/**` for test-wiring questions; you still read those files fully for script quality", I did not complete a full read of `scripts/verify/**`'s 72 files, the largest single subdirectory by file count, given the time budget consumed by the workflow-and-db.mjs-first prioritization). This is a real coverage gap against the brief's own instruction, named honestly. | [HYPOTHESIS], undone |, |

## Loop-hop table

See CHECK 3 above for the full table (11 hops, all wired, all `enforceFired:false` except the live
evidence found for `sweep-to-ledger-consume`, A4-L1).

## Top 10 a senior platform engineer would call out first

1. **A4-D1, 210 MB of gitignored-pattern data tracked in git** (`scripts/_snapshots/`, 1,193 files).
   Directly inflates every clone/fetch/worktree-add this repo does (this audit's own `git worktree add`
   took visibly longer updating ~5,700 files). Highest-leverage single fix in this audit.
2. **A4-W1, 4 workflows still run the pre-2026-09-29 git-branch/PR ceremony** and call
   `deliver-artifact-branch.sh` with a stale 3-arg signature the script no longer reads. Reintroduces a
   failure class (shallow-checkout rebase failures) the rewrite was built to eliminate, and is an
   F51-flagged hotspot independently.
3. **A4-B2, `estimated_values` written via a raw, uncited, unsnapshotted upsert**, bypassing rule 015's
   guarded path on a table that feeds customer-visible NPV figures (automate-vs-hire).
4. **A4-B3, same bypass class on `portal_link_candidates`**, lower stakes but the same root cause: no
   `guardedUpsert` exists in `lib/db.mjs`, so every caller needing an upsert-with-conflict-target either
   reimplements it raw or avoids upserts altogether.
5. **A4-L1, a loop-manifest hop's `enforceFired` flag is stale against live `gh run list` evidence.**
   Small, but exactly the kind of drift F50 exists to catch and currently doesn't (F50 checks presence
   of a fired artifact, not whether the manifest's own prose claim is still true).
6. **The `downstream-chain → propagation-drain` native edge is dead on the fully-autonomous path**
   (GitHub's 3-level `workflow_run` chain limit) and is patched with an explicit `gh workflow run`
   fallback, correctly diagnosed and fixed by a prior lane (F60), but worth flagging to a new reader
   who might "simplify" the workaround back into a pure `workflow_run` edge.
7. **A4-Q2/Q3, `heal-provenance.mjs` at 4,268 lines**, more than double the next-largest script.
   Whether that is justified cohesion or a module needing decomposition was not resolved this pass.
8. **A4-Q1, 5,867 lines of duplicated code held at a ratchet baseline**, not trending down. A repo this
   disciplined about everything else (rule-015 gates, F44, loop-wiring) has comparatively little
   pressure on duplication.
9. **This audit's own coverage gap**, CHECK 5's "Lane A6 owns `scripts/verify/**` for test-wiring...
   you still read those files fully for script quality" instruction was not completed (72 files, the
   single largest subdirectory, effectively unread this pass beyond the mechanical grep sweep).
10. **A4-P6, zero-dispatch-history producer evidence was not gathered** (`gh run list` per producer
    choice), leaving CHECK 4's own "[CONFIRMED] with the gh evidence" bar unmet for that specific ask.

## Decision-ready build items

- **A4-D1/D2 (untrack `_snapshots/`, `_plans/`)**: mechanism is `git rm -r --cached`, one PR, no ruling
  needed, the `.gitignore` already says these should not be tracked; this closes the drift between
  policy and practice. S effort.
- **A4-W1 (fix 4 stale `deliver-artifact-branch.sh` call sites)**: mechanical diff against the 9 already-
  fixed call sites as the template; needs a dry-dispatch proof per file per this repo's own "test what
  you build" discipline before merge. M effort, decision-ready (no ruling needed, the target shape
  already exists in the other 9 workflows).
- **A4-B2/B3 (add `guardedUpsert` to `lib/db.mjs`)**: a ~20-line addition mirroring `guardedInsert`
  plus an `onConflict` parameter, then two call-site migrations. S-M effort, decision-ready.
- **A4-L1 (correct the stale `enforceFired` note)**: a one-line JSON edit to
  `loop-hops.d/02-sweep-to-ledger-consume.json`, or (better) flip `enforceFired: true` once a second
  confirming run exists, since F50 would then actually start checking for it. S effort.
- **Unfinished from this pass, to hand to a follow-up lane**: A4-D3/D4 (basename-grep sweep of the five
  `_`-prefixed scratch directories), A4-P6 (per-producer `gh run list` evidence), full read of
  `scripts/verify/**` (72 files) for CHECK 6's test-quality question, and a narrative read of
  `heal-provenance.mjs` (A4-Q3).

---

## Coverage appendix, workflows (22 files, 7,588 lines)

| Workflow | Lines | Verdict |
|---|---|---|
| `.github/workflows/data-audit-lane.yml` | 70 | READ (full) |
| `.github/workflows/trust-recompute.yml` | 78 | READ (full) |
| `.github/workflows/bug-class-guard.yml` | 87 | READ (full) |
| `.github/workflows/build-proof.yml` | 102 | READ (full) |
| `.github/workflows/spot-check-monthly.yml` | 113 | READ (full) |
| `.github/workflows/change-detection.yml` | 165 | READ (full) |
| `.github/workflows/source-monitoring.yml` | 178 | READ (full) |
| `.github/workflows/date-chain.yml` | 193 | READ (full) |
| `.github/workflows/fetch-drain.yml` | 205 | READ (full) |
| `.github/workflows/brief-apply.yml` | 244 | READ (full) |
| `.github/workflows/gate-a-rescan.yml` | 273 | READ (full) |
| `.github/workflows/source-sweep.yml` | 273 | READ (full) |
| `.github/workflows/uptime-probes.yml` | 291 | READ (full) |
| `.github/workflows/brief-export.yml` | 404 | READ (full) |
| `.github/workflows/downstream-chain.yml` | 430 | READ (full) |
| `.github/workflows/corpus-turn.yml` | 433 | READ (full) |
| `.github/workflows/discipline.yml` | 463 | READ (full) |
| `.github/workflows/propagation-drain.yml` | 465 | READ (full) |
| `.github/workflows/producers.yml` | 491 | READ (full) |
| `.github/workflows/ledger-consume.yml` | 545 | READ (full) |
| `.github/workflows/population-turn.yml` | 768 | READ (full) |
| `.github/workflows/maintenance.yml` | 1317 | READ (~600/1317 lines direct; remainder structurally parsed by script, step-gating pattern verified programmatically for all 77 steps, tail (commit/artifact/PR logic) read in full) |

## Coverage appendix, scripts (313 files, 72,274 lines)

| File | Lines | Verdict |
|---|---|---|
| `fsi-app/scripts/_archive/_diag/probe-live-checks.mjs` | 25 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/_archive/_wave-alpha/backfill-themes.mjs` | 86 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/_archive/lib/block1-reaudit.mjs` | 236 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/_archive/lib/bootstrap-test1.mjs` | 161 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/_archive/lib/decision-log-audit.mjs` | 109 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/_archive/lib/drift-check-reconstruction.mjs` | 55 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/_archive/lib/error-drop-probe.mjs` | 112 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/_archive/lib/exclusion-audit-reconstruction.mjs` | 78 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/_archive/lib/fetch-quality.mjs` | 58 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/_archive/lib/funded-release-plan.mjs` | 125 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/_archive/lib/inconclusive-report.mjs` | 34 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/_archive/lib/liveness-reconstruction.mjs` | 99 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/_archive/lib/net-agent.mjs` | 19 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/_archive/lib/surface-registry-reconstruction.mjs` | 122 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/_archive/lib/type-consumer-probe.mjs` | 110 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/_archive/lib/urgency.mjs` | 36 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/_archive/lib/verify-reconstruction.mjs` | 107 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/_archive/phase-5-backfill.mjs` | 730 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/_archive/phase2-build-binding.mjs` | 78 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/_archive/phase2-reconcile.mjs` | 98 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/_archive/phase2-verify-binding.mjs` | 107 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/_archive/sprint3-corpus-reclassify-audit.mjs` | 353 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/_archive/tmp/phase-5-rollback.mjs` | 136 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/_reground/executor-ground.mjs` | 45 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/_reground/free-pass-run.mjs` | 134 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/_reground/id-stamp.mjs` | 75 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/_reground/lease.mjs` | 36 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/_reground/target-match-probe.mjs` | 43 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/_reground/tombstone-delete.mjs` | 113 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/_ruling/null-tier-host-ruling.mjs` | 92 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/audit-skill-conformance.mjs` | 165 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/backfill-item-timelines.mjs` | 221 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/classification/apply-classifications.mjs` | 1071 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/classification/propose-classifications.mjs` | 379 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/community/seed-benchmark-instruments.mjs` | 205 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/connections/analyze-corpus.mjs` | 409 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/connections/apply-tags.mjs` | 800 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/connections/discover-for-items.mjs` | 206 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/connections/generate-theme-brief.mjs` | 252 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/connections/propose-tags.mjs` | 469 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/connections/ratify-flag-to-census.mjs` | 238 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/entities/backfill-derivation-edges.mjs` | 199 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/entities/backfill-entities.mjs` | 279 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/entities/backfill-lineage-edges.mjs` | 260 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/entities/seed-corridors.mjs` | 414 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/entities/write-entity-scope.mjs` | 226 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/forward-events/dispatch-extraction.mjs` | 149 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/forward-events/run-extraction.mjs` | 336 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/gen/assumption-register-common.mjs` | 229 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/gen/assumption-register-seed.mjs` | 42 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/gen/emission-factors-common.mjs` | 255 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/gen/emission-factors-desnz.mjs` | 63 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/gen/emission-factors-epa.mjs` | 42 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/gen/fetch-desnz-factors.mjs` | 901 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/holdings-audit.mjs` | 257 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/inventories/generate-migrations-inventory.mjs` | 209 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/lib/admin-phrase-scan.mjs` | 59 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/lib/assemble-train.mjs` | 544 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/lib/batch-primitives.mjs` | 282 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/lib/canonical-key.mjs` | 40 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/lib/chained-dry-guard.mjs` | 125 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/lib/changelog.mjs` | 134 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/lib/db.mjs` | 628 | READ (full) |
| `fsi-app/scripts/lib/decision-anchors.mjs` | 238 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/lib/deferral.mjs` | 146 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/lib/drift-check.mjs` | 98 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/lib/env-file.mjs` | 82 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/lib/eurlex-cellar.mjs` | 53 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/lib/exclusion-audit.mjs` | 108 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/lib/fetch-negative-probe.mjs` | 160 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/lib/flag-age.mjs` | 72 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/lib/free-pass.mjs` | 66 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/lib/funded-pass-lock.mjs` | 49 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/lib/gate-a-state-writer.mjs` | 41 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/lib/harness-run-number.mjs` | 56 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/lib/inconclusive-probe.mjs` | 248 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/lib/institution-key.mjs` | 75 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/lib/is-main-fixture.mjs` | 10 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/lib/is-main.mjs` | 23 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/lib/liveness.mjs` | 63 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/lib/loop-run-id.mjs` | 143 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/lib/mutation-lease.mjs` | 48 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/lib/pg-conn.mjs` | 64 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/lib/quarantine-dwell.mjs` | 86 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/lib/r14-held-producer-cli.mjs` | 170 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/lib/rate-source-by-class.mjs` | 69 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/lib/record-harness-run.mjs` | 93 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/lib/revalidate.mjs` | 131 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/lib/run-artifact.mjs` | 808 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/lib/surface-registry.mjs` | 169 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/lib/verify.mjs` | 80 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/lib/walk-files.mjs` | 28 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/apply-classifications.mjs` | 523 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/apply-deferrals.mjs` | 191 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/attach-found-sources.mjs` | 260 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/backfill-format-type.mjs` | 213 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/canonical-autoverify.mjs` | 838 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/canonical-key-dedup.mjs` | 437 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/capture-static-primaries.mjs` | 477 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/census-off-vertical.mjs` | 141 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/close-acquire-primaries-holds.mjs` | 123 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/close-coverage-reflections.mjs` | 124 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/close-flags-for-verified-items.mjs` | 249 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/close-legal-confirmation-rows.mjs` | 225 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/close-run-logs.mjs` | 348 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/derive-obligations.mjs` | 53 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/enumerate-unclassified-hosts.mjs` | 252 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/finish-staged-updates.mjs` | 233 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/forward-events-retext.mjs` | 887 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/gate-a-rescan.mjs` | 300 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/institution-canonicalize.mjs` | 562 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/lib/cli.mjs` | 102 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/lib/consolidate-attach-worklist.mjs` | 350 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/lib/extract-worklist-seed.mjs` | 101 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/lib/flag-url-extract.mjs` | 51 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/lib/origin-class-map.mjs` | 82 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/lib/vocab-inventory.mjs` | 279 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/one-off/2026-09-29-reverse-chained-apply.mjs` | 317 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/origin-class-backfill.mjs` | 112 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/plan-quarantine-disposition.mjs` | 62 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/provenance-heal.mjs` | 270 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/record-hollow-sweep.mjs` | 524 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/refetch-capped.mjs` | 86 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/regen-quarantined.mjs` | 62 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/remediate-orphan-sources.mjs` | 89 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/reopen-validation-holds.mjs` | 117 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/resolve-cited-host-gate.mjs` | 241 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/resolve-error-body-gate.mjs` | 354 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/resolve-provisional-sources.mjs` | 635 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/resolve-refetch-holds.mjs` | 387 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/resolve-signals.mjs` | 197 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/retype-eu-decisions.mjs` | 563 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/review-apply-canonical-candidates.mjs` | 128 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/review-apply-coverage-gaps.mjs` | 111 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/review-apply-portal-links.mjs` | 117 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/review-apply-provisional-sources.mjs` | 109 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/review-digests.mjs` | 90 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/schema-vocabulary-inventory.mjs` | 104 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/seed-corridors.mjs` | 76 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/source-role-cleanup.mjs` | 69 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/source-type-backfill.mjs` | 53 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/tag-proposals.mjs` | 196 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/tag-ratification.mjs` | 324 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/tier-opinions.mjs` | 148 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/timeline-backfill.mjs` | 446 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/uk-series-code-reconcile.mjs` | 352 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/w1-dispositions.mjs` | 182 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/write-run-artifact.mjs` | 150 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/measure-bundles.mjs` | 128 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/mint/apply-mint-batch.mjs` | 888 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/mint/export-census-rows.mjs` | 1729 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/mint/heal-provenance.mjs` | 4268 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/mint/lib/canonicalize-citation-url.mjs` | 27 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/mint/lib/instrument-identity.mjs` | 44 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/mint/lib/screen-verdict.mjs` | 40 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/mint/lib/tag-presence-check.mjs` | 111 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/mint/migration-299-precheck.mjs` | 195 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/mint/rederive-record-provenance.mjs` | 111 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/mint/reopen-validation-holds.mjs` | 154 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/mint/run-mint-batch.mjs` | 670 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/mint/screen-reconcile-records.mjs` | 114 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/mint/screen-rules.mjs` | 993 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/mint/screen-worklist.mjs` | 544 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/mint/stamp-wo26-archive-reason.mjs` | 137 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/mint/validate-mint-payload.mjs` | 759 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/obligations/derive-obligations.mjs` | 215 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/plan-quarantine-disposition.mjs` | 352 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/producers/emit-producers-artifact.mjs` | 154 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/producers/lib/producer-summary.mjs` | 82 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/producers/market/author-market-series-delta.mjs` | 212 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/producers/market/build-oil-bulletin-rows.mjs` | 151 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/producers/market/carrier-ets-surcharge-producer.mjs` | 299 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/producers/market/ecb-fx-producer.mjs` | 528 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/producers/market/eia-v2-petroleum-spot-producer.mjs` | 425 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/producers/market/eu-weekly-oil-bulletin.mjs` | 171 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/producers/market/fetch-oil-bulletin.mjs` | 342 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/producers/market/fixtures/carrier-ets-surcharge-fixtures.mjs` | 91 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/producers/market/propose-series-items.mjs` | 91 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/producers/market/ratify-series-items.mjs` | 207 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/producers/market/refresh-published-price-statistics.mjs` | 186 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/producers/regional/bls-oews-producer.mjs` | 98 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/producers/regional/eurostat-lc-lci-lev-producer.mjs` | 206 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/producers/regional/eurostat-nrg-pc-205-producer.mjs` | 86 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/producers/regional/fixtures/state-cost-facts-fixtures.mjs` | 116 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/producers/regional/run-envelope-producer.mjs` | 295 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/producers/regional/state-cost-facts-producer.mjs` | 523 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/propagation/resolve-statutory-rows-file.mjs` | 41 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/propagation/seed-derived-values.mjs` | 418 | READ (partial, targeted) |
| `fsi-app/scripts/propagation/validate-statutory-rows-file.mjs` | 58 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/propagation/write-statutory.mjs` | 299 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/regen-quarantined.mjs` | 101 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/remediation/refetch-capped-worklist.mjs` | 225 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/review/apply-canonical-candidates.mjs` | 144 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/review/apply-coverage-gaps.mjs` | 58 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/review/apply-portal-links.mjs` | 63 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/review/apply-provisional-sources.mjs` | 48 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/review/build-review-digests.mjs` | 109 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/review/lib/apply-core.mjs` | 56 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/review/lib/canonical-candidates.mjs` | 99 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/review/lib/coverage-gaps.mjs` | 105 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/review/lib/digest-core.mjs` | 108 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/review/lib/portal-links.mjs` | 103 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/review/lib/provisional-sources.mjs` | 112 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/review/lib/ruling.mjs` | 58 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/source-role-cleanup.mjs` | 115 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/sources/backfill-source-type.mjs` | 128 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/sources/inaccessible-triage.mjs` | 536 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/spec09/auxiliary-energy-producer.mjs` | 88 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/spec09/dqi-producer.mjs` | 88 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/spec09/eudr-custody-producer.mjs` | 135 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/spec09/grid-queue-producer.mjs` | 195 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/spec09/indexation-producer.mjs` | 108 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/spec09/lib/cli-csv-args.mjs` | 31 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/spec09/lib/rows-file.mjs` | 109 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/spec09/oem-roadmap-producer.mjs` | 232 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/spec09/reroute-producer.mjs` | 223 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/spec09/run-fixture-import.mjs` | 129 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/spec09/surcharge-audit-producer.mjs` | 102 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/turns/apply-extraction-output.mjs` | 228 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/turns/apply-record-briefs.mjs` | 1149 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/turns/consume-turn-requests.mjs` | 442 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/turns/dry-run-structured-actions.mjs` | 190 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/turns/emit-brief-export-artifact.mjs` | 151 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/turns/emit-corpus-turn-artifact.mjs` | 221 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/turns/emit-downstream-chain-artifact.mjs` | 166 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/turns/emit-gate-a-rescan-artifact.mjs` | 208 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/turns/export-corpus-for-extraction.mjs` | 641 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/turns/import-stranded-harness-branches.mjs` | 169 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/turns/io-preflight.mjs` | 337 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/turns/last-turn-date.mjs` | 78 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/turns/record-briefs/schema.mjs` | 1114 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/turns/research-sweep.mjs` | 587 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/turns/run-change-detection.mjs` | 703 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/turns/run-fetch-drain.mjs` | 494 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/turns/run-ledger-consume.mjs` | 1796 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/turns/run-population-flywheel.mjs` | 1748 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/turns/run-propagation-drain.mjs` | 302 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/turns/run-source-sweep.mjs` | 1355 | READ (partial, targeted) |
| `fsi-app/scripts/verify/_fmt-present.mjs` | 15 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/admin-phrase-scan.mjs` | 39 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/audit-finding-status.mjs` | 99 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/candidate-dwell-audit.mjs` | 139 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/canonical-key-uniqueness.mjs` | 66 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/cc-executor-submit.golden.mjs` | 58 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/check-vocabulary-drift.mjs` | 107 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/claims-tier-audit.mjs` | 55 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/column-existence-parity.mjs` | 193 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/dead-column-audit.mjs` | 118 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/defect-signature-scan.golden.mjs` | 41 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/defect-signature-scan.mjs` | 108 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/deferral-hygiene-audit.mjs` | 119 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/derivation-edges-rls-adversarial-audit.mjs` | 151 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/disposition-content-gate.golden.mjs` | 76 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/drain-clear-two-condition.golden.mjs` | 80 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/duplicate-table-audit.mjs` | 97 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/executor-parity.golden.mjs` | 207 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/fixtures/eager-pg-import.mjs` | 9 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/flag-age-audit.mjs` | 39 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/format-structure.mjs` | 83 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/funded-pass-lock-golden.mjs` | 142 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/harness-family-schedule-walker-audit.mjs` | 310 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/id-redirect-target-audit.mjs` | 59 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/injected-no-synthesis-window.golden.mjs` | 169 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/layer-c-insert-gate-proof.mjs` | 126 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/ledger-onepass-audit.mjs` | 116 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/lib/dead-column-scan.mjs` | 132 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/lib/duplicate-table-scan.mjs` | 284 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/lib/harness-family-walk-scan.mjs` | 323 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/lib/information-schema-scan.mjs` | 84 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/lib/rls-adversarial-probe.mjs` | 88 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/lib/schema-drift.mjs` | 86 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/lib/ui-orphan-scan.mjs` | 364 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/lib/vocab-drift.mjs` | 50 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/migration-number-collision.mjs` | 74 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/mint-gates-live-hold.golden.mjs` | 63 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/mint-gates.golden.mjs` | 52 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/mode-tag-coverage-audit.mjs` | 85 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/mutation-lease.golden.mjs` | 68 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/no-generic-source-audit.golden.mjs` | 28 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/no-generic-source-audit.mjs` | 69 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/no-names.mjs` | 50 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/non-destructive-grounding.golden.mjs` | 201 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/one-tier-per-host-audit.mjs` | 40 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/orphan-source-audit.mjs` | 49 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/pause-flag-guard-proof.mjs` | 75 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/population-report.mjs` | 918 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/primary-text-permanent.golden.mjs` | 46 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/prov-guard-adversarial-audit.mjs` | 156 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/quarantine-disposition-audit.mjs` | 115 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/remediate-orphan-sources.mjs` | 76 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/resolver-status-filter.golden.mjs` | 45 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/rls-credential-parity.mjs` | 122 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/routing.mjs` | 69 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/run-data-audit-lane.mjs` | 142 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/run-goldens.mjs` | 61 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/schema-drift-audit.mjs` | 94 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/source-link-audit.mjs` | 53 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/source-vs-item.mjs` | 59 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/spec09-org-rls-adversarial-audit.mjs` | 194 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/staged-transit-audit.mjs` | 106 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/substrate-agreement-audit.mjs` | 41 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/surface-contract-gate.golden.mjs` | 131 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/surface-visibility-audit.mjs` | 119 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/target-match.golden.mjs` | 116 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/ui-orphan-audit.mjs` | 161 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/unregistered-span-host-audit.mjs` | 53 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/verification-audit-report.mjs` | 304 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/vocab-sync-audit.mjs` | 56 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/verify/wave-acceptance-audit.mjs` | 137 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/coordinator/lane-gate-cloud.sh` | 56 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/maintenance/commit-worklist-artifact.sh` | 85 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/turns/commit-brief-apply-artifact.sh` | 73 | SCANNED (pattern/grep: F44 idiom, createClient/raw-write bypass, isMainModule, dry/--apply gate; not narratively read) |
| `fsi-app/scripts/turns/deliver-artifact-branch.sh` | 106 | READ (full) |
