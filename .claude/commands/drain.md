Run one judgement drain. You are a scheduled session; the operator is not present and nothing waits on them. The drain is OFF until build is complete (CLAUDE.md rule 16 and the population ruling): STEP 0 is what keeps it off. Everything is free: author with Sonnet or Haiku sub-agents inside this session, never the metered model API. Do not create or change any scheduled task. Do not merge anything.

Read `CLAUDE.md` (repo root) first, then `scripts/harness-runs/judgement-drain/FAMILY.md`.

STEP 0, the kill switch. From `fsi-app/` run:

`node scripts/drain/plan-drain.mjs`

If it prints `drain: off`, stop here. Report that one line (it names the reason: the judgement_drain switch is off, the emergency pause is set, or fleet-budget-halt is open) and nothing else. Do not read any queue, do not open a PR, do not retry. The planner reads only the switches before it decides, and a failed read counts as off. Rule 11: every recurring worker checks its kill switch before work, and firings are expensive, so an off drain costs one command.

If it prints `drain: on`, it wrote a plan file (the path is in its last line) and took mutation leases on every item it handed out. From here on, release those leases no matter how the run ends (STEP 4).

STEP 1, read the plan. It lists kinds in the order to work them (oldest pending first), and for each kind: the batch file path the session must write (exactly one file per kind), the item ids it covers, where the exported material is (`source`: a bundle file the exporter wrote, or the queue command to read), the apply workflow, and the authoring guide. Work kinds in plan order. A kind with an `export_error` or no batches is skipped and recorded, never retried and never fabricated.

STEP 2, author each batch file, one kind at a time.
- Read that kind's authoring guide (`authoring_guide` in the plan) in full: it holds the batch schema. Read only the bundle entries for the item ids the plan lists.
- Split the item ids among Sonnet or Haiku sub-agents (about 5 to 15 items each, fewer for the heavy bundles), each given the guide, its slice of the bundle, and nothing else. A sub-agent writes entries only from material in its bundle: a figure, a span, a classification it cannot ground in that material is left out and listed as residue with the reason, never guessed (CLAUDE.md rule 2). A host or candidate it cannot place gets no entry.
- Merge the sub-agents' entries into the ONE batch file at the planned path, shaped exactly as the guide shows (batch name, generated_at, authored_by or classified_by as the guide requires, entries). Prose in new text: no em dashes, en dashes or section-sign glyphs (discipline rule 022).
- Validate the file with the kind's own validator before committing, as the guide's "validate before landing" or dry apply step names it (for theme briefs `node scripts/turns/apply-theme-briefs.mjs --briefs <file>` with no `--execute`; for question answers `node scripts/turns/apply-question-answers.mjs --answers <file>`; the other guides name theirs). A refused entry is fixed or dropped with its reason; a file that fails whole is not committed. Never edit the validator or the schema to make a batch pass.

LEDGER KIND, STALE MODE. The ledger kind (`ledger-verdicts`) has a second selection mode besides the default `pending`. A committed verdict whose `prompt_version` is not the live one is excluded from use, so its candidate stays unpromoted until a verdict under the live prompt exists. `stale` mode hands those candidates to a session to be re-authored. It is a run of its own, never mixed into the default run (two modes of one kind would be handed the same next batch path):

`node scripts/drain/plan-drain.mjs --kind ledger --mode stale` (add `--dry` to print the plan, take no lease and write no plan file)

It plans the ledger kind alone, with the same lease key (`candidate_id`), the same batch size and the same next batch path, listing candidates oldest first whose committed verdicts are all under an older prompt version. Each exported candidate carries `verdict_prompt_version`, `verdict_batch` and `verdict_classified_at` (which verdict is stale and how old), never the old classification. Authoring rules for this mode, on top of the guide named in the plan (`scripts/turns/ledger-verdicts/README.md`):
- Write each verdict FRESH from the candidate's exported text (`text`, with the prompt from `first-fetch-classify.ts`), as the guide says, stamped with the live `prompt_version`. Never copy, adapt or "carry over" the old entry's classification or rationale: the old entry is exactly what the prompt change made untrustworthy, and it is not in the export for that reason. A candidate whose export row has `fetch_ok: false` gets no entry (residue, with the reason), as in pending mode.
- The batch is a NEW file at the planned path. The old batch file is never edited: a stale entry is superseded by a current entry for the same URL (the consume run derives this and records it in its own artifact as `supersedes_stale_verdict` per item and `stale_verdicts_open` / `stale_verdicts_superseded` in its metrics).
- Validate before committing with `node scripts/turns/run-ledger-consume.mjs --check-verdicts <batch file>`. It refuses a file that is structurally invalid or carries any entry not under the live `prompt_version`, and prints how many entries supersede a stale committed verdict. It reads no database. A refused file is fixed or its entries dropped with the reason; the validator is never edited to make a batch pass.
- The apply workflow, its push trigger and the guard that holds it dry while `scrape_cadence` is off are the same as for a pending batch.

STEP 3, one PR per kind. Never commit on master or the main checkout; work in a worktree.
- Create a branch `drain/<run id>-<kind>` from `origin/master` in a new worktree.
- Stage exactly the one batch file by name (`git add <path>`), commit with a message that names the kind, the count and the plan's run id, and end it with the repo's Co-Authored-By trailer line.
- Push the branch and open a PR to master whose body lists the kind, the item count, the residue (items left out and why) and the apply workflow that will run on merge. End the body with the Claude Code generated-with line.
- Watch `gh pr checks` (poll every 60 seconds, at most 25 minutes). On any hook or CI failure: stop that kind, record the exact error in the run report, do not design a fix and do not retry by pushing again. Continue with the next kind.

Merging is NOT yours. The coordinator's executor merges each PR after CI, the same as every other lane. On merge, the kind's existing apply workflow fires on its own push trigger (each apply workflow carries a `push:` trigger limited to its own batch directory). That run goes through `scripts/lib/chained-dry-guard.mjs` with the push ref, which forces it dry while `scrape_cadence` is off, and applies only after build. So a merged batch while the cadence is off is validated and planned, never applied. This is expected, not a defect: the guard, not the trigger, holds the population ruling.

STEP 4, always last, even after a failure or a skipped kind:

`node scripts/drain/plan-drain.mjs --finish <plan file> --prs <kind>=<pr url>,<kind>=<pr url>`

It releases every lease the plan holds and writes the run's harness artifact (switch state, kinds, counts, leases held and released, PRs opened). Then land the artifact with `bash scripts/turns/deliver-artifact-branch.sh "Judgement drain: <run id>"` (a database write, no commit). A lease left unreleased goes stale and is claimable, so a lost finish never wedges an item, but it is recorded as a defect.

Final report, under 15 lines: the plan run id, per kind the exported count, the planned count, the PR url and its CI state, residue counts with reasons, lease counts held and released, and anything that failed with its exact error. Facts only.
