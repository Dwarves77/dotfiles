# 2026-10-11, lane ANON-1 (anon1-working-tree-scrub): working tree made anonymous

Operator ruling 2026-10-11: the repository becomes anonymous before it is made public. This lane covers the working tree only. Author and committer fields in git history are a separate step; `.git` was not touched.

## Accomplished

1. **Verifier** `fsi-app/scripts/verify/no-personal-identifiers.test.mjs`, registered as `A-no-personal-identifiers` in `fsi-app/.discipline/registry.mjs` (audit row, runs static, attack test `ATTACK first name in prose is a violation`). It scans every tracked text file for the first name as a word or handle head, the surname as a word, and webmail addresses. The name is assembled from fragments, so the file needs no allowlist entry of its own. An allowlist entry is exact (a count of matching lines) and stale entries fail, so the lists can only shrink. Red run against master before any edit: 235 violating files. Green after the scrub: 8 tests pass.
2. **Prose scrub**, 219 files changed: docs 155, fsi-app/scripts 22, fsi-app/docs 19, fsi-app/src 9, fsi-app/.discipline 8, fsi-app/.claude 5, .claude 1. One reviewed sed over the file list, then a node pass that capitalised sentence starts only on changed lines (14 lines), then hand fixes. Rules applied: the first name used as the operator's name becomes "the operator" or "the operator's"; a parenthetical first name after operator, admin, owner or ruling is dropped; hyphenated status tokens carrying the name became the operator form; a quoted database display name became "(redacted first name)".
3. **Paths** (extension of the brief, see Decisions): the home-directory segment in `C:\Users\<name>\...`, `/c/Users/<name>/`, `C--Users-<name>-` slugs and the same inside JSON harness-run evidence became `USER`. 21 harness-run JSON files and 8 other JSON files (audit manifests, backfill logs, rendering specs and results) were rewritten; all changed JSON parses.
4. **Addresses**: the two personal webmail addresses in prose became "the operator's hotmail address" and "the operator's gmail address" (the two accounts are different people-facing facts in the AUTH-IDENTITY records, so the provider word is kept); a curl example uses `OPERATOR_EMAIL`, a User-Agent example uses `<contact address>`, a SQL probe uses `<operator-email-fragment>`; a masked address in DB-4 no longer shows its first letters.
5. **Checks run on the merged tree** (rule 17): `eslint --max-warnings=0` on the changed code files clean; `node fsi-app/.discipline/fitness/runner.mjs` 44 functions, 0 violations, registry 125 rows; the verifier 8 of 8; the full no-npm suite once, which found two regressions of mine (the skill-slim conservation pins and the generated migrations page, both restored, see FUNCTIONAL and NOT done).

## Read and reused

Read: COMMON rules 1, 4, 11, 12, 15 to 19; CLAUDE.md standing rules; `fsi-app/.discipline/registry.mjs` header and the `A-audit-finding-status` row (the model for a verifier that is also its own attack test); `execution-wiring.mjs` header (a `scripts/verify/*.test.mjs` file is executed by `run-test-suite.sh` through `discoverTests`, so no new wiring); rule 022 and rule 012 headers (an edited line carrying a dash glyph is not charged; the rule 012 pattern fires on literal home paths, which is why the verifier assembles its fixtures from fragments). Reused instead of building: the registry row shape, the existing test discovery, the existing `USER` style of placeholder, `git grep` for enumeration.

## Decisions

- **Paths are in scope.** The brief names the first name used as the operator's name; the verifier clause is "the name as a word", and a home path contains it as a word. Leaving ~100 doc paths would have meant a ~100 file allowlist for prose. They are rewritten to `USER` except where the path is a program input (below). [CONFIRMED: grep after the scrub shows zero occurrences outside the lists]
- **Surname and webmail addresses are checked too**, not only the account handle: the verifier's shapes are first name, surname, and `@gmail`, `@hotmail`, `@outlook` and the common siblings. Only the two known personal addresses existed. [CONFIRMED: grep for the provider list]
- **Fixture values were left**, per the brief: sample member names, sample brief titles, a stubbed account name and a sample org user email stay because smokes and tests assert on them. They are listed below.
- **Harness-run JSON was rewritten** because the run-integrity gate (F28) hashes the governing files of a family, not the artifact bodies. [CONFIRMED: fitness runner, 0 violations]

## FUNCTIONAL occurrences (left unchanged; for the operator)

Each is in the verifier's `FUNCTIONAL` map with an exact line count. file:line, what it does:

- `fsi-app/.claude/settings.json` lines 5, 8, 10, 16: permission rules that match this machine's paths; changing the text stops the rules matching.
- `fsi-app/.claude/settings.local.json` lines 4, 5, 9, 10, 16, 20, 23: the same kind of permission rules. This is a local settings file that is tracked; untracking it is a history-step decision.
- `fsi-app/.discipline/governance/doctrine-contradiction.mjs` line 58: `SELF_GATE_RE`, a pattern over doc text with the first name in two alternations. After this scrub the docs say "the operator", which the first alternation already matches; the name alternations are now dead and can be deleted.
- `fsi-app/.discipline/rendering/audit/mounts.mjs` lines 1602, 1648, 1714 (sample org user email), 1778, 1822, 1900, 2133, 2383, 2402 (sample member names and brief title), 1901, 2384 (a display_name fixture holding an address): rendering fixtures the audit asserts on.
- `fsi-app/.discipline/rendering/smoke/command-bar-search-portal-smoke.mjs` lines 56, 76; `masthead-balance-smoke.mjs` line 37: the sample brief title the smokes assert on.
- `fsi-app/.discipline/rendering/smoke/stub-supabase-browser-account.mjs` line 27: stubbed account `full_name` that derives the sample brief title.
- `fsi-app/.discipline/rules/012-hardcoded-user-path.mjs` lines 50, 51: the rule's patterns; the hardcoded home path of this machine is what the rule exists to catch. `012-hardcoded-user-path.test.mjs` lines 17 to 21, 44, 49, 200, 204, 223, 224: its attack fixtures.
- `fsi-app/.discipline/rules/018-new-surface-five-model.test.mjs` line 75: a commit-message trailer fixture.
- `fsi-app/src/app/admin/parts/masthead/page.tsx` line 70: the sample brief title on the admin parts gallery (visible in the product UI), asserted by the masthead smoke.
- `fsi-app/src/components/dashboard/brief-title.npmtest.mjs` lines 9, 10, 22, 26: expectations for the brief title derivation.
- `fsi-app/supabase/seed/perf-capture.mjs` lines 39, 63: a default test-account email read from the environment first, and a report output path.

- Four skill files whose lines `skill-slim.test.mjs` pins verbatim against the pre-split commit (CONSERVATION): `fsi-app/.claude/skills/done/SKILL.md` line 28 (a vault path), `remediation-discipline/references/categories-1-17-and-retrieval.md` line 24 (a checkout path), `remediation-discipline/references/worked-examples.md` lines 17, 69, 74, 81 (an address and paths), `sprint-followups-discipline/references/anti-patterns-worktree-integration.md` lines 17, 19, 26, 32 (paths). I scrubbed them first and the suite went red (`CONSERVATION: ... 5 pre-split line(s) are gone`), so those lines were restored. The sanctioned alternative is an `ACKNOWLEDGED_LINE_CHANGES` entry in the test, which holds the old line verbatim and so keeps the name anyway.

17 files. A neutral sample name across mounts.mjs, the three smokes, the stub, the parts page and the title test would remove the largest block in one change; that is a code change with test updates and is owed, below.

## NOT done

- Prose outside this lane's write set still names the operator: `docs/inventories/migrations.md` (a generated page; rows 137 and 138 copy the `-- subject:` header of migrations 137 and 138, so it equals the generator output only while those two stay as they are: regenerate it in the change that scrubs them; I scrubbed it by hand first and C3 went red, so it was restored), 8 `design_handoff_2026-05/*.html` files (sample username in the artboards), `fsi-app/STATUS.md` (2 lines), 6 applied migrations 048, 075, 077, 137, 138, 164 (SQL comments), `fsi-app/supabase/seed/audit-tier-h-spot-check.mjs` (a comment path), `install.sh` (a banner echoed into a shell profile). 18 files, held in the verifier's `PENDING_SCRUB` map so CI is green; each entry must be deleted in the change that scrubs its file. NEEDS WRITE-SET EXPANSION for `design_handoff_2026-05/`, `fsi-app/STATUS.md`, `fsi-app/supabase/` and `install.sh`. Migration comment edits need a check that no applied-ledger comparison reads migration bytes (none found in the fitness and consistency checks). [WORK: owed]
- The 17 FUNCTIONAL files: replace the fixture names and the dead alternations in the pattern with a neutral sample name, updating the smokes, the audit mounts and their expectations together; decide whether `fsi-app/.claude/settings.local.json` stays tracked. [WORK: owed]
- Git history (author, committer and trailer fields, and every prior commit that carried the strings) is untouched. [NOT-WORK: separate step by the operator ruling]
- The GitHub account and repository owner name in remote URLs and in `Dwarves77/dotfiles` mentions (142 files) is a handle, not the first name or an address; whether it counts as identifying is the operator's ruling. [NOT-WORK: scope statement]
- Client and workspace names (the sample org in fixtures and docs) are not the operator's name and were not changed. [NOT-WORK: scope statement]

## Open items

- None beyond the NOT done lines above; each carries its token. [NOT-WORK: scope statement]
