# Lane M7a: the statutory writer reachable from the product; the estimates table decided (plan 6.1 row M7, data-layer half)

Coordinator brief, 2026-09-20. Executor: Sonnet. Lane id `m7a`. Read `docs/dispatches/lane-briefs/2026-09-19/brief-common-local.md` first (its Amendment 1 wins over its body), then this. Worktree and branch are named in your dispatch message; base `origin/master`.

Plan row M7 is SPLIT by the coordinator (operator steer 2026-09-20: the data-layer tools first). M7a is the two data-layer items. M7b (the grade chip on every list row and masthead, the NoticesRail proof) waits on the FactCard lane and the operator's artboard 21 and is not yours.

## Step 0

Your FIRST tool call is the Skill tool `fsi-app:environmental-policy-and-innovation` (if unknown, `environmental-policy-and-innovation`); the skill gate judges your own transcript (ADR-032). A denial after a successful load: STOP with the deny text. Before writing any `.tsx` or `.css`: read `docs/design/ux-laws.md` and `docs/design/design-principles.md`; your session-log file carries a "UX compliance" block (the discipline CI fails a surface PR without one).

## Premises, checked on master `cc038a47` by a read-only pass (2026-09-20)

- [CONFIRMED] `fsi-app/scripts/propagation/write-statutory.mjs` exports `parseRow`, `resolveOrMintEntity`, `writeOneRow` apart from its CLI main, and takes input only as `--rows-file <path>`. Its one invoker is an opt-in step of `propagation-drain.yml`; the only rows-file in the repo is a self-labelled FIXTURE, `fsi-app/scripts/_worklists/statutory-fueleu-annex-iv-2026-09-05.json`. So the writer is not reachable from the product: the plan's finding stands.
- [CONFIRMED] `fsi-app/scripts/propagation/validate-statutory-rows-file.mjs` exports three pure functions (`validateSourceBlock`, `validateRow`, `validateRowsFile`), nothing at module scope touches fs or process, and it is already the pre-flight gate in `propagation-drain.yml`.
- [CONFIRMED] the spec-09 upload flow is `fsi-app/src/app/api/workspace/spec09-upload/route.ts` plus `fsi-app/src/components/settings/Spec09CsvUpload.tsx` plus the shared contract `src/lib/spec09/csv-upload-contract.mjs`. It is workspace-scoped (org tables, member roles).
- [REFUTED] the plan row's "`estimated_values` gets its first writer": the table HAS writers, `src/lib/propagation/methods/automate-vs-hire.ts` and `scripts/propagation/seed-derived-values.mjs` (an upsert near line 286), and readers behind `admissibleFor` (`EstimatedFigure.tsx`, `AutomateVsHireCalculator.tsx`). The open question is only whether a writer is reachable and has fired.

## What lands

1. **Admin upload route** `fsi-app/src/app/api/admin/statutory-rows/route.ts`, POST, JSON body (the rows-file document). `statutory_computations` is platform data, not workspace data: guard with the platform-admin gate the other `/api/admin/**` routes use (read one sibling; fitness F2 checks this path), plus the standard rate limiter. Flow: `validateRowsFile` (the SAME module the workflow gate uses; no second validator) then, per row, `parseRow` and `writeOneRow` from `write-statutory.mjs` (the SAME functions the CLI uses; no copy). A query flag `mode=dry` is the default and writes nothing; `mode=apply` writes. Response: per-row outcome, counts, and the validator's errors verbatim on refusal (HTTP 422, nothing written). Destructure and log every Supabase `error` (the agent/run post-mortem rule in `fsi-app/.claude/CLAUDE.md`).
   - If `write-statutory.mjs` or the validator cannot be imported by a Next.js route as they stand (a top-level side effect, a path that only resolves under plain node), STOP and name the line. Do not fork the logic into `src/`.
2. **Admin panel** `StatutoryRowsUpload`, mounted on the admin surface beside the existing data-upload or propagation panels (find the mount with one grep for how `Spec09CsvUpload` or an admin panel is registered; reuse the shared parts, no new visual language). File picker, dry result table, an explicit apply button enabled only after a clean dry run of the same file, accordion closed by default if one is used. Reuse-before-construction: if `Spec09CsvUpload.tsx` has an extractable file-pick-and-preview part, extract it to one home and use it in both; if not, say why in your report.
3. **The CLI and the route stay one path.** A test asserts the route module imports `validateRowsFile`, `parseRow` and `writeOneRow` from the two script modules (attack form: a fixture route source that re-implements validation fails the assertion). Unit tests on the route handler with a fake Supabase client: refusal writes nothing; dry writes nothing; apply calls `writeOneRow` once per valid row; a non-admin gets 403.
4. **`estimated_values`: decided by evidence, no third state.** Read `seed-derived-values.mjs` (how it is invoked: grep `.github/workflows` for it) and `automate-vs-hire.ts` (who calls its write). Report, with file and line: is at least one writer reachable from a workflow or a product route WITHOUT a hand step? If yes: the plan row's premise is refuted; correct the W4 text and row M7 of `docs/plans/complete-system-build-plan-2026-09-04.md` IN PLACE with a dated [REFUTED] note, and add nothing. If no writer is reachable: STOP and report what is missing; the coordinator decides between wiring and retirement. You run NO writer and NO SQL that writes.
5. **`StatutoryFigure.tsx` has no consuming surface** (F25 LEGACY_ALLOWLIST says a FuelEU filing surface is a later lane). Not yours to build. Record it under "Owed" in your session-log file so the allowlist entry keeps a named owner: lane M7b.
6. Docs: a "Statutory rows: upload, dry, apply" section in the propagation runbook (find it under `docs/runbooks/` by grep for `write-statutory`); `docs/ops/session-log.d/<date>-m7a.md`.

## Out of scope: STOP, do not solve

Any change to `write-statutory.mjs`'s row semantics or the validator's rules; any workflow edit; the fixture file (it stays a fixture and is never applied); preparing real FuelEU rows (that is reviewed data, phase 6.3); migrations (none should be needed; if one is, STOP: the coordinator assigns the id).

## Standing constraints

Commit trailer exactly `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. No em dash, en dash or section sign in new prose. Never `git stash`, `git add -A`, `--no-verify`. Semantic colour tokens only, 44pt touch targets, rows measured at 375 px (RD-60). SELECT-only against the database from your session.

## Gates and report

`npx tsc --noEmit`; `node --test` on touched files; `node .discipline/fitness/runner.mjs` (F2, F25, F45, F49 are the ones you can trip); the override check; then the locked push gate once, last, as one background task. You commit; you do not push. Return the report and the PR body as TEXT.
