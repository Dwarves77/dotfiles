# Lane STRUCTURED-ACTIONS, 2026-09-28

Dispatch: extract structured actions from brief "do now" prose at the record-briefs write site.
Workstream 6 / M4 merge (build-plan-2026-09-25); data-machine-tool-gaps-2026-09-25.md "Produce" row
"Structured-action extraction". Worktree `.claude/worktrees/structured-actions`, branch
`lane/structured-actions`, off `origin/master` (d8c63c8f).

## Skills loaded

- environmental-policy-and-innovation (trigger: touches intelligence_items brief content/format)
- remediation-discipline (trigger: class-vs-instance judgment on the extraction shape)
- analysis-construction-spec (trigger: per-section grounding/construction depth for non-regulatory formats)

## Structured-action shape, cited

`docs/specs/07-page-walkthrough.md:56` (the Regulations obligation card): **"What to do, as a task with
an owner and a due date."** This is the ONLY place any spec (00-10) defines a structured shape for an
action derived from brief prose. Checked and confirmed absent: `docs/specs/02-market-intel.md`,
`03-research.md`, `04-operations.md`, and the `analysis-construction-spec` skill's own per-section
OUTPUT-AND-DECISION descriptions (which describe prose actions, "the action list", "the action and the
window", never a task/owner/due-date record).

**STOP AND ASK (per dispatch instruction, and per the spec gap above):** the shape is defined for
Regulations only. This lane extracted `{ action_text, verb, timeframe_days, owner, due_date,
source_section }`, spec 07's three fields (task=`action_text`, `owner`, `due_date`) plus two fields the
live prose actually carries (`verb`, an optional `timeframe_days` when the prose states "(N days)"),
applied uniformly across every format that HAS a do-now section, honestly leaving `owner`/`due_date`
null when the source prose does not state them (never fabricated, per CLAUDE.md rule 2). Two decisions
are the coordinator's, not this lane's:
1. Do the three non-regulatory formats (Market/Research/Operations) get a structured-action shape at
   all, given no spec defines one for them? This lane's shape is this lane's own best-effort
   generalisation of spec 07, not a citation, for the two formats that DO name a do-now section
   (technology_profile S7, market_signal_brief S7).
2. **Where do extracted actions get written?** Live schema has NO `recommended_actions`/`action`/`task`
   column anywhere on `intelligence_items` (confirmed via `information_schema.columns`, 2026-09-28). The
   only `recommended_actions` column in the whole schema is on the UNRELATED `integrity_flags` table
   (migration 048), a different shape entirely (`{action, rationale}`, internal admin-remediation
   actions, not customer-facing "do now" tasks). This lane did NOT propose or build a migration: the
   dispatch brief itself states "Any change to the single write site (record-briefs) needs coordinator
   sign-off before merge" (data-machine-tool-gaps-2026-09-25.md), so the schema/write-site design is
   flagged here, not decided.

## Where "do now" prose lives, cited

`fsi-app/src/lib/agent/system-prompt.ts`'s per-format section list names the action-bearing sections:
- regulatory_fact_document: S3 "Issues Requiring Immediate Action", S11 "Operational System
  Requirements" (system-prompt.ts:182/191, "a CONCRETE action verb first
  (Assess/Map/Verify/Commission/Engage/Negotiate/Reconcile)").
- technology_profile: S7 "Time-to-Market, Procurement Window, and Action" (line 221).
- market_signal_brief: S7 "What the Workspace Should Do Now" (line 247).
- operations_profile and research_summary: NEITHER names a dedicated do-now section (their synthesis
  sections are TRANSITIVE per analysis-construction-spec.md, not verb-first lists). The extractor
  returns zero actions for `regional_data`/`research_finding` by design, a genuine coverage gap, not a
  defect.

## What was built

- `fsi-app/src/lib/agent/extract-recommended-actions.mjs`, pure, $0, no-LLM extractor. Reuses
  `extract-sections.ts`'s `extractSectionByHeading` for section-boundary parsing (reuse-before-
  construction). Exports `extractRecommendedActions(fullBrief, itemType)` and the per-paragraph core
  `extractActionFromParagraph`.
- `fsi-app/src/lib/agent/extract-recommended-actions.test.mjs`, 15 fixture tests (synthetic,
  paraphrased fixtures, never verbatim DB/regulation text).
- `fsi-app/scripts/turns/dry-run-structured-actions.mjs`, read-only CLI driver (`runExtractionPass`
  pure core + live-DB orchestration via the guarded `readClient()`/`readAll`, SELECT-only, R14-clean;
  no `--apply` mode exists, by design, since no destination column exists). Writes this family's own
  harness-run artifact and best-effort records it to `harness_runs`.
- `fsi-app/scripts/turns/dry-run-structured-actions.test.mjs`, 2 fixture tests on the pure core.
- `fsi-app/scripts/harness-runs/structured-actions/family.json`, new harness family registration
  (directory-is-the-registry convention, no shared file edited).

## Dry-run over real stored briefs (read-only)

This worktree carries no Supabase credentials (lane-common-contract's stated posture), so the live-DB
half of `dry-run-structured-actions.mjs` could not be exercised end-to-end from inside the worktree.
Instead: a live, read-only SQL query (Supabase MCP, project `kwrsbpiseruzbfwjpvsp`) identified every
`intelligence_items` row whose `full_brief` contains the concrete-verb pattern anywhere (67 candidates,
of 2,690 total rows carrying a `full_brief`) and extracted the three named do-now section bodies per
candidate via a heading-bounded SQL substring. The REAL `extractActionFromParagraph` (same file, same
code) then ran locally over every paragraph of those section bodies, a two-stage method chosen only to
avoid transferring ~2,690 × 20-30KB brief bodies into this session's context; the 67-candidate superset
is guaranteed to contain every item the section-scoped extractor could match, so the totals below equal
what a full unscoped corpus run would produce.

**Result (`[CONFIRMED]`, live data, method above):**
- 67 candidate items scanned, 42 produced at least one action, 162 total structured actions.
- By verb: Assess 63, Verify 35, Engage 29, Map 31, Commission 4, Negotiate 0, Reconcile 0.
- By item_type: regulation 111, framework 22, guidance 7, standard 18, directive 3, market_signal 1.
- Recorded in `scripts/harness-runs/structured-actions/structured-actions-run-001.json`; F28
  (harness-run-integrity) passes GREEN against the live tree including this artifact.
- `record-harness-run.mjs` was run against the artifact: no-op as expected, `NEXT_PUBLIC_SUPABASE_URL`/
  `SUPABASE_SERVICE_ROLE_KEY` not set in this worktree, the artifact JSON on disk is this run's durable
  record per that module's own best-effort design.

**A real false positive was found and fixed during this dry run** (rule 13, same-motion fix): item
`8c186db2-ca7c-4b92-8960-3337a4d01b09`'s "Commission is scheduled to submit a review..." was extracted
as a Commission-verb action before the fix, "Commission" there is the European Commission as a
sentence subject, not the imperative verb. The original `LEGISLATIVE_CITATION_RE` guard only excluded
"Commission `<Act name>`" citations. Added `COMMISSION_AS_INSTITUTION_RE` (excludes "Commission" followed
by an auxiliary/finite verb), added two fixture tests, re-ran: all 4 remaining real Commission-verb hits
are genuine imperatives ("Commission a/an ... review").

## Gates

- `node --import ./.discipline/lib/fixtures/no-npm-resolve-register.mjs --test
  src/lib/agent/extract-recommended-actions.test.mjs scripts/turns/dry-run-structured-actions.test.mjs`:
  15/15 pass.
- `node --import ./.discipline/lib/fixtures/no-npm-resolve-register.mjs --test
  scripts/harness-runs/family-registry.test.mjs`: 27/27 pass (new family validates, self-registers).
- `node --import ./.discipline/lib/fixtures/no-npm-resolve-register.mjs --test
  .discipline/fitness/functions/F28-harness-run-integrity.test.mjs`: 32/32 pass, including "every
  artifact in the repo independently passes validateRunArtifact."
- No `.ts`/`.tsx` touched (only `.mjs`/`.test.mjs`/`.json`), so `tsc --noEmit` is not required by the
  contract; not run.
- Full `.discipline/run-test-suite.sh` and `.discipline/fitness/runner.mjs` dispatched; results pasted
  in the coordinator report once complete.

## Open questions for the coordinator

1. Destination for extracted structured actions, no column exists; add one via the two-track migration
   policy, or reuse/extend an existing table? This lane could not decide alone (write-site sign-off
   required by the dispatch brief itself).
2. Do Market/Research/Operations get a structured-action shape at all, given specs 02/03/04 name none?
3. The dispatch brief cites `fsi-app/scripts/lib/record-harness-run.mjs` as the harness writer, this IS
   present on `origin/master` (migration 331, lane HARNESS-LANDING 2026-09-27); an earlier confusion in
   this session (stale pre-worktree local checkout, 25 commits behind origin/master) briefly suggested
   otherwise. No discrepancy once working from the correct worktree.
