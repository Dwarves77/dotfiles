# 2026-10-10, lane TESTS-2 (tests2-owed-tests-residue): routes ATTACKED and the owed test residue

Rows: the `[WORK: TESTS-2]` lines on origin/master (AUD-AT-1 to AUD-AT-5 owed legs, r11-checks, s8b, s8c, audit-catalogue, daudit1, daudit2, routes1, sec4). Write set held: new `*.test.mjs`, `fsi-app/scripts/verify/attacks/**`, `fsi-app/scripts/verify/fixtures/**`, workflow files that only add a job or step, this log. One interrupt killed the first run; this entry covers both runs (the branch carries every WIP commit).

## Accomplished

1. Routes ATTACKED: `fsi-app/scripts/verify/attacks/routes-attacked.mjs` with personas in `fsi-app/scripts/verify/fixtures/route-personas.mjs`. It reads the AT2 register, sends one request per route method per persona (and one per page) to `next start` on the local stack, and holds the COVERAGE, TOKENS, ANON, ADMIN, WORKER and WRITES invariants. Unit tests attack the attacker for each leak (`routes-attacked.test.mjs`). Runs in the new workflow `.github/workflows/route-and-view-attacks.yml` (shape test `scripts/proof/route-and-view-attacks-workflow.test.mjs`). Closes aud-at2:73, aud-at2:75, routes1:80.
2. Views and functions leg of the RLS attack: `rls-view-function-attacks.mjs` (+ test), the two pollution-barrier views, the five system-only writers, the SECURITY DEFINER census. Closes aud-at1:71.
3. The same workflow runs the existing PROOF-4 attacks `sec4-accept-invitation-keeps-role` and `s8-c-count-rpcs-membership-gate` (ids in `scripts/proof/attacks/attacks.json`) on a stack with real memberships on every PR that touches the schema. Closes sec4:69 and s8c:31.
4. Workflow mutation attacks (`scripts/proof/workflow-mutation-attacks.test.mjs`): each shape test of migration-proof.yml, chain-proof.yml, route-and-view-attacks.yml and gate-step-attacks.yml is run in a scratch tree against a mutated workflow and must go red. Closes aud-at5:240 and aud-at5:248.
5. `.github/workflows/gate-step-attacks.yml` (+ shape test): `npm ci` refusals (DS23), the exact `npm run lint -- --max-warnings=0` command refuses a warning and an error (DS24), F9 refuses a type error on the real app project (`attacks/f9-real-project-attack.mjs`). Static F9 halves on the real tree: `fitness/functions/F9-real-project.test.mjs`. Closes aud-at5:241 and aud-at4:457.
6. `.discipline/consistency/override-check-cli.test.mjs`: the override-check CLI attacked through its own entry. Closes aud-at5:244.
7. `.discipline/hooks/pre-push-step-attacks.test.mjs` (aud-at3:510) and `.discipline/runner-ci-forms.test.mjs` (the validate-commits CI forms, aud-at3:514).
8. `.discipline/governance/self-skip-loudness.test.mjs`: every `process.exit(2)` self-skip says why, the lane runners never read exit 2 as green, no test returns early on a missing credential. Closes r11-checks:144.
9. `src/lib/tags/ledger-tag-wiring.test.mjs`: each of the five list surfaces mounts the one tags hook, narrows by it and hands tags to the row. Closes s8b:24.
10. This resume: `attacks/forbid-fires-attack.mjs` (+ test) and one added step in `.github/workflows/design-audit.yml`. The D-M4 forbid selector (one selector, 14 specs, 90 occurrences repaired by DAUDIT-2) is run in the container's chromium against all eight subsets of the three value cells: the four rows with two or more absence tokens must be matched, the four with fewer must not. The step follows the upload so a red attack never loses the audit artifact. Closes daudit2:173.

## Row dispositions (file:line -> token; the executor applies them)

- aud-at1:71 -> [CLOSED: this PR]; aud-at1:73 -> [WORK: owed]
- aud-at2:73 -> [CLOSED: this PR]; aud-at2:74 -> [WORK: owed]; aud-at2:75 -> [CLOSED: this PR]
- aud-at3:510 -> [CLOSED: this PR]; aud-at3:514 -> [CLOSED: this PR]
- aud-at4:457 -> [CLOSED: this PR]
- aud-at5:240 -> [CLOSED: this PR]; aud-at5:241 -> [CLOSED: this PR]; aud-at5:244 -> [CLOSED: this PR]; aud-at5:247 -> [CLOSED: PR 1042]; aud-at5:248 -> [CLOSED: this PR]
- r11-checks:144 -> [CLOSED: this PR]; s8b:24 -> [CLOSED: this PR]; s8c:31 -> [CLOSED: this PR]; sec4:69 -> [CLOSED: this PR]; routes1:80 -> [CLOSED: this PR]
- audit-catalogue:43 -> [WORK: owed]; daudit1:196 -> [WORK: owed]; daudit1:203 -> [WORK: owed]
- daudit2:173 -> [CLOSED: this PR]; daudit2:174 -> [WORK: owed]; daudit2:175 -> [WORK: owed]

## Read and reused

Read: CLAUDE.md, COMMON.md and the TESTS-1 and TESTS-2 briefs, the TESTS-1 session log, the AT1 to AT5 registers' owed sections, the session logs of the rows above, `attack-engine.mjs`, `fixtures.mjs`, `rls-personas.mjs`, `rls-view-function-attacks.mjs`, `design-audit.yml` and `design-audit-workflow.test.mjs`, `run-audit.mjs` (forbid probe), `compose-08-operations-list.json` (D-M4 forbid), `ListRow.tsx` and `Absence.tsx` (markup the fixture mirrors), `run-goldens.test.mjs` and `run-rendering-guard.test.mjs`.
Reused instead of built: the attack engine and persona fixtures for the views leg; the existing PROOF-4 attacks (`attacks.json`) for sec4:69 and s8c:31 instead of a second copy; the shared local-stack composite action; `is-main.mjs`; the design-audit job's Playwright container and install step for the forbid attack; the existing `run-goldens.test.mjs` and `run-rendering-guard.test.mjs` (aud-at5:247 was already closed by GATE-9, nothing built).

## Red then green

Every new test file has an attack on the attacker (a scripted leak turns the attack red) alongside the control that passes. Run at the head of this branch: `node --test` over all 15 changed `*.test.mjs` files, 244 tests, 244 pass, 0 fail. The forbid test turns red for a vacuous matcher (4 violations), a blanket matcher (4), and a matcher covering one pair of three (2); the real specs are asserted to carry one selector in 14 files.

## Decisions

- sec4:69 and s8c:31 are closed by running the existing attacks in the new workflow, not by a second script.
- The forbid attack appends to design-audit.yml after the upload step: the shape test's `problems()` constrains step order only among its named steps, so an appended step needs no edit to an existing step.
- aud-at5:247 (run-goldens and run-rendering-guard unattacked) was already false on master: both have sibling tests that execute or attack them (PR 1042). Recorded, nothing built.

## NOT done

- The browser leg of the forbid attack and the stack legs (routes, views, accept_invitation, count RPCs, gate-step attacks) cannot run in a lane: no chromium, no Docker stack, no `npm ci`. They are proven by unit tests against fakes here and execute for the first time in this PR's CI. [NOT-WORK: CI is the gate, COMMON rule 9; a red job is read from its log]
- aud-at1:73 and aud-at2:74: the six lenses other than ATTACKED for subsystem 11 and the other lenses for subsystem 13 are audit registers (read-only fact lanes writing under docs/audits/), not tests. [WORK: owed]
- audit-catalogue:43: the 47 empty and 31 partial cells (O-001 to O-047, P-001 to P-031) are fact lanes, one per cell, outside a test write set. [WORK: owed]
- daudit1:196 and daudit1:203: the HARNESS ROT group (fixture props for factcard, impactmeter valueVisible, research severity, community room name; DetailHeader-era selectors) needs edits to `.discipline/rendering/audit/mounts.mjs` and spec JSON plus one regeneration, none of which is in this write set (NEEDS WRITE-SET EXPANSION). [WORK: owed]
- daudit2:174: the stale `td:not(:has(.cl-absence))` exclusion clause in `operations-matrix.json` is a spec JSON edit outside the write set. [WORK: owed]
- daudit2:175: whether `open-state-sweep.mjs` and `overflow-sweep.mjs` should sweep `page-frame-1440-full-brief` is an edit to two non-test modules outside the write set. [WORK: owed]

## Open items

- The forbid fixture mirrors the ListRow markup by class name; a test pins the class names against `ListRow.tsx` and `Absence.tsx`, but a markup change that keeps the names and breaks the selector would be seen only by the audit's own forbid row. [NOT-WORK: scope statement, the audit row on the real mount is the second guard]
