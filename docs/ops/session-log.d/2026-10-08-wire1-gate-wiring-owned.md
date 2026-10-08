# 2026-10-08, lane WIRE-1 (wire1-gate-wiring-owned): the action-time gate's user-level wiring is owned, installed and verified by the repo

Operator, 2026-10-08, verbatim: "Nothing is on me. Find and fix the issue. Not a work around. A fix." The defect: the gate wiring's content lived outside the repo (the wrapper file under the user hooks directory, the matcher in the user settings file), so each gate change (GATE-7 left two) became a hand step, and the in-repo applier was stale for the wrapper.

## Accomplished

1. `fsi-app/.discipline/governance/pretooluse-user-shim.mjs` (new): the TEMPLATE of `~/.claude/hooks/pretooluse-fsi-app-scope.mjs`, a permanent delegator with no decision logic. It imports the entry by a path placeholder (`__PRETOOLUSE_ENTRY_PATH__`) and prints the fail-closed `ask` if the import fails.
2. `fsi-app/.discipline/governance/pretooluse-entry.mjs` (new): what the GATE-7 replacement block held. `decide(raw)` parses, asks `inScope` (from `pretooluse-scope.mjs`) failing TOWARD the gate, calls `runGate`, allows an out-of-scope call; `runEntry()` reads stdin. A routed tool the gate does not classify as mutating is allowed by the gate (`other-tool`).
3. `wire-pretooluse-settings.mjs` (rewritten, now importable): exports `MATCHER` (negative form: every tool name except the closed read-only list of 13), `renderShim`, `canonicalCommand`, `wireSettings` (pure), `mainCheckoutRoot`, `applyWiring`. Edits only the one gate entry (a legacy direct unscoped gate hook is migrated into it; a non-gate hook sharing the entry keeps its own matcher), passes everything else through, keeps the file's indentation, backs up first, prints no content, idempotent. `--apply` also installs the shim (backup if different). The entry path and template come from the main checkout (`git rev-parse --git-common-dir`).
4. `install-hooks.mjs`: after the git hooks it runs `applyWiring` (new exported seam `installGateWiring`); skips with a note when settings.json is absent; `--dry-run` passes through; `--settings=` and `--user-hooks-dir=` exist for fixtures.
5. `check-pretooluse-wired.mjs`: `wrapperSourceDelegates` gained the entry-shim shape (imports the entry, awaits `runEntry()`, fail-closed ask) and accepts `if (inScope) return await ...` in the entry source (the original awaited form still passes, an un-awaited call still fails). `verifyWrapperDelegates` follows the shim to the entry and the entry to the gate before the behavioral fire. New `checkInstalledShim` (byte compare against the rendered template) and `verifyWiring` (skip, pass, fail with problems): fails on shim bytes differing, a matcher other than `MATCHER`, a command other than the canonical one, `SomeNewTool` not routed, a missing tool in REQUIRED, or a direct (unscoped) gate hook. REQUIRED is unchanged.
6. `OUT-OF-REPO-BOUNDARY.md`: table row updated, dated section stating the contract. GATE-7 session log: addendum before its "NOT done" section (its text untouched).

## Read and reused

Read in full: COMMON, the brief, `CLAUDE.md`, `lane-common-contract.md`, `OUT-OF-REPO-BOUNDARY.md`, `wire-pretooluse-settings.mjs`, `check-pretooluse-wired.mjs` and its test, `pretooluse-honest-forms.test.mjs`, `pretooluse-scope.mjs`, `pretooluse-skill-gate.mjs` (header, `evaluateCore`, `runGate`), `install-hooks.mjs` and its test, the GATE-7 session log, the remediation-discipline skill, pre-push step 3c, the F25 dispatch-root sources (the boundary tables are Source 7). Reused: `pretooluse-scope.mjs` `inScope`, the gate's `runGate` and its `other-tool` allow, `wrapperSourceDelegates` and the behavioral fire (extended, not replaced), `matcherMatches`, `isMainModule`, the installer's backup and idempotence conventions, the GATE-7 shim text (its logic moved into the entry unchanged in behavior). Nothing duplicated: the shim text exists once (the template); the old inline wrapper in the GATE-7 log is superseded by it.

## Decisions

- **Template and entry come from the main checkout, not the running checkout.** The installed shim points at the main checkout's entry, so the expected bytes are rendered from the main checkout's template too. A branch that edits the template is therefore not blocked at its own pre-push by an install it cannot make before merge; after the main checkout pulls the change, the verifier fails until the installer is re-run (that is the drift contract).
- **A direct (unscoped) gate hook is now a verifier failure and an applier migration.** The 2026-07-26 scoping decision made the scoped shim the only accepted shape; the old applier would have re-added the direct hook.
- **Backups**: the settings backup uses the old applier's name pattern (`settings.json.bak-<stamp>`); the shim backup is `<shim>.bak-<stamp>`; neither is written when nothing changes.

## NOT done

- Nothing under the user home was read or written (settings.json holds credentials). The installer is run by the executor after merge: `node fsi-app/.discipline/install-hooks.mjs` from the main checkout, which must first hold this merge (the applier refuses with a clear message if the entry or template is missing there).
- `hooks/pre-push` step 3c failure text still names the applier (`wire-pretooluse-settings.mjs --apply`), which now also installs the shim; the verifier's own output names the installer. Left as is (not in the write set).
- Not run locally per COMMON rule 9: the whole suite, the fitness runner, tsc. The five touched test files were run (below).

## Evidence (`node --test <file>`; red = the new tests against the pre-change implementation files)

| File | Old code | New code |
|---|---|---|
| `governance/check-pretooluse-wired.test.mjs` | cannot import (no `ENTRY_PLACEHOLDER` export) | 27 pass |
| `governance/pretooluse-honest-forms.test.mjs` | cannot import `pretooluse-entry.mjs` | 79 pass |
| `install-hooks.test.mjs` | cannot import `installGateWiring` | 14 pass |
| `governance/pretooluse-skill-gate.test.mjs` (untouched, rerun) | | green |

## Open items

- After merge, the executor runs the one install command from the main checkout; step 3c then passes on the operator machine.
- Whether an already-running Claude Code session picks up the new matcher without a restart was not tested here.

## Follow-up (coordinator grants, same lane, rule 13: close own residue)

1. `fsi-app/.discipline/hooks/pre-push` step 3c: the failure text now names `node fsi-app/.discipline/install-hooks.mjs` (the one installer), not the applier. Text only.
2. `.claude/hooks/vault-sync.mjs` (+ `vault-sync.test.mjs`): after a fast-forward that changed any file under `fsi-app/.discipline/` (full before and after shas compared with `git diff --name-only`, new export `disciplineFilesChanged`) it runs the vault's own `install-hooks.mjs` (new export `runInstaller`, `deps.runInstaller` seam) and appends a second line with the installer's Summary and gate wiring lines; a failure prints `installer FAILED: <first line>` and never throws. No `.discipline/` change, a SKIPPED sync and an up-to-date sync never run it. This removes the "until the installer is re-run" gap: the installed shim and matcher follow master. Recorded in OUT-OF-REPO-BOUNDARY.md's contract section.
3. Evidence: `.claude/hooks/vault-sync.test.mjs` red on the old hook (cannot import `disciplineFilesChanged`), green with 7 new tests (installer runs from the vault with a summary; no `.discipline/` change means no run; SKIPPED and up-to-date never run; failure reported; the default runner executes a fixture installer and reports its Summary line; a missing or failing installer is reported; the path filter). Both vault-sync test files: 20 pass. The "NOT done" bullet above about the pre-push text is closed by item 1. The installer's own first run on the executor machine still happens through this mechanism or by hand once; not exercised here (nothing under the user home is touched by tests).
