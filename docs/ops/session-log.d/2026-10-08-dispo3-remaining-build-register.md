# DISPO-3: the remaining-build register is landed and every finding in it is dispositioned (2026-10-08)

Branch `coord/dispo3-remaining-build-register`, cut from origin/master e207047a1 (PR 1060).

## Accomplished

- The three scratch registers that DOCS-3 had already landed were confirmed duplicates and deleted from the main checkout (filesystem delete, no git; the files were gitignored): `obl1-obligations-register-2026-10-08.md`, `verify1-register-unknowns-2026-10-08.md`, `aud-at2-route-guard-register-2026-10-08.md` under `fsi-app/scripts/tmp/`. Method: each scratch file was diffed against `git show origin/master:docs/audits/<same name>` with disposition and status tokens stripped. The only differences were the DOCS-3 landing note and, in verify1, status tokens DOCS-3 added to four lines. The scratch files held no content the landed copies lack.
- `fsi-app/scripts/tmp/remaining-build-register-2026-10-06.md` (428 lines, 47 findings) is landed as `docs/audits/remaining-build-register-2026-10-06.md`: body verbatim, a DOCS-3-style landing note under the title, and only tokens added.
- All 47 finding lines carry one disposition token. `node fsi-app/scripts/verify/audit-finding-status.mjs --all` reports 0 undispositioned and 0 unlabeled [CONFIRMED: run on this branch after the edits].
- Rule 14: on nine lines the register's own `[C]`/`[H]` marks were rewritten as `[CONFIRMED: ...]`/`[HYPOTHESIS: ...]`, because the checker reads only those words; four lines that had no status mark (owed item 11 and three section 7/appendix lines) received a `[HYPOTHESIS: ...]` mark stating that the line was not re-derived here.
- INDEX line and a board thread row added.

## Disposition counts (47)

- CLOSED 14 (PRs 959, 965, 1046, 1026, 1023 twice, 980, 977, 960, 996, 963, 978, 1034, 984).
- WORK 19: DORMANT-1 8 (lines 44, 305, 307, 312, 352, 390, 392, 416), PLAN-2 3 (items 34, 39, 40), DFIX-1 3 (items 18, 19, 21), DOCS-5 2 (items 14, 27), RULES-X-1 1 (item 29), DEAD-1c 1 (item 35), MIG-HIST-2 1 (item 3).
- NOT-WORK 14: Stage 9 precondition 6 (items 6 to 11), operator item 3 (items 16, 33, 37), fact 2 (items 2, 25), build-mode hold 2 (items 20, 28), smoke account repaired per board 1 (item 24).
- Counts taken from the landed file by grep of the tokens [CONFIRMED: sum 47].

## Evidence for the CLOSED tokens (git log --oneline origin/master, and the PROGRAM-BOARD owed list)

- Item 1 PR 959 (G5-TERMS merged; migration 355 applied). Item 5 PR 965 (G5-READ, migration 357). Item 4 PR 1046 (migration 374 applied; the file holds both the GIN index on `cited_item_ids` and `signposts.lifecycle_applied_at`, built by PR 1014). Item 12 PR 1026 (L4-E, migration 373). Items 13 and 17 PR 1023 (CHAIN-4). Item 15 PR 980 (`trust-recompute.yml` is absent from `.github/workflows`). Item 22 PR 977 (RULES-1: F51 check 5 exempts generated files). Item 23 PR 960 (AUTH-2). Item 30 PR 996 (DEAD-3; the board records the INDEX and runbook lines as checked). Item 31 PR 963 (C-TOGGLE removed the toggle). Item 32 PR 978 (layout-guard expiry and renewal paused under BUILD_MODE; `closure-gate.mjs` line 212 carries `workflow:layout-baseline-renewal.yml` with a build-mode reason until 2026-11-30). Item 36 PR 1034 (DAUDIT-1 fixed the DetailShell mounts; its session log names the cause). Item 38 PR 984, with S5-2 PR 965, S5-3 PR 964, S5-4 PR 984, G7-UI PR 962 and G5-TERMS PR 959 named on the line.

## Read and reused

- Read: CLAUDE.md, COMMON.md, dispo1.md, `fsi-app/scripts/verify/audit-finding-status.mjs` (token grammar), `docs/plans/buildout-plan-2026-10-04.md`, the PROGRAM-BOARD 2026-10-07 and 2026-10-08 pointers (the owed list copied verbatim, with corrections), the register itself, `docs/inventories/migrations.md` rows 299 and 315, DISPO-1's table in `2026-10-09-dispo1-dispositions.md` (lane precedents), the DORMANT-1 and DFIX-1 briefs.
- Reused: DOCS-3's landing-note form; DISPO-1/DISPO-2 lane precedents for equivalent lines (seek-more comments to DOCS-5, ProvisionalReviewCard text to DOCS-5, hops 12 and 13 `enforceFired` to RULES-X-1, plan-drain fakes as a build-mode hold, personal workspaces as a fact).

## Decisions

- Items 6 to 11 (population-stage repairs and measurements) are `[NOT-WORK: Stage 9 precondition, CLAUDE.md rule 16]` per the lane assignment for producer population residue.
- Items 18, 19 and 21 go to DFIX-1: its brief names chips ellipsing at 768 and citation titles as text; item 19 (sources grid bias) is the same component family.
- Items 44, 305, 307, 312, 352 (item 26), 390, 392 and 416 go to DORMANT-1: its brief empties `NEVER_RUN_DORMANT` (which today lists `layout-baseline-renewal`) and runs every never-run workflow.

## Rows I could not place with certainty (provisional token applied, coordinator to confirm)

| line | finding | token applied | why not certain |
|---|---|---|---|
| 342 (item 16) | GUARD-1 token (ADR-016 item b); `+strip-unprovable` opt-in | NOT-WORK: operator item | ADR-016 records item b as a finding for operator ruling; g6-gates kept the token for that reason; this conflicts with the no-human-gates ruling, so it may be a ruling to take |
| 305 (second half) | `spot-check-monthly` most recent run failed | WORK: DORMANT-1 | `gh run list`: one run only, 2026-06-01 schedule, failure; `data-audit-lane` latest run 2026-08-11 is a success, so that half is stale; spot-check-monthly has no owner |
| 365 (item 35) | `regional_data_facts` and `estimated_values` have no consumer | WORK: DEAD-1c | `regional_data_facts` is read by `supabase-server.ts` and `api/ask/route.ts`; the claim holds only for `estimated_values` (ADR-043: no registered writer, not dropped) |
| 325 (item 3) | 299 and 315 not found in the ledger by name | WORK: MIG-HIST-2 | 299 is NEVER APPLIED, a data INSERT held by R14; 315 header reads APPLIED OUTSIDE LEDGER [HYPOTHESIS] |
| 346 (item 20) | per-claim tier matching against live rows unverified | NOT-WORK: no live read | needs a live read; SMOKE-2 content checks might cover it |
| 373 (item 39) | all of Stage 8 | WORK: PLAN-2 | built since: S8-1/2 PR 988, S8-3 PR 981, S8-4 PR 979, S8-8 PR 990, S8-10 PRs 989 and 983, S8-6 PR 947; left: S8-9 (producers E1, E5, E6 merged, the remainder of the five domains not), S8-5 not found |
| 374 (item 40) | L18 to L28 no PR found | WORK: PLAN-2 | L18 is PR 990; L19 is PR 1017; L20 pieces PR 974, 975, 987, 992 (chain proof still red at replay per the board; CHAIN-5 owns it); L21 to L28 remain |
| 340 (item 14) | `seek-more.mjs` still names `operator-priced-only` at lines 207 and 298 | WORK: DOCS-5 | confirmed present on master; DOCS-5 follows DISPO-1's precedent, but the file is governing for two harness families, so DEAD-1c could own it |
| 353 (item 27) | `ProvisionalReviewCard.tsx` line 291 still says "pending operator confirm (confidence 0.65-0.79)" | WORK: DOCS-5 | confirmed present on master; DISPO-1 precedent is DOCS-5; DFIX-1 is the component lane |
| 355 (item 29) | `loop-fired-evidence` for hops 12 and 13 | WORK: RULES-X-1 | DISPO-1 precedent is RULES-X-1; CHAIN-5 could own the first chained row |

## NOT done

- The legs tokened WORK in the register are not executed here; each is owned by the lane its token names. [NOT-WORK: scope statement, this lane dispositions and lands only]
- No live read was made; the register's counts (23,709 untyped edges, 1,222 NULL `origin_class`) are not re-derived. [NOT-WORK: build-mode hold, COMMON rule 5]
- The full suite and the fitness runner were not run locally; CI is the gate. [NOT-WORK: build-mode hold, COMMON rule 9]

## Open items

- The ten provisional rows above await the coordinator's confirmation of lane. [WORK: coordinator-disposition-batch]
