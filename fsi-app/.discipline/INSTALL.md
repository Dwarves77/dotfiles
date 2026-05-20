# Installing the Discipline Hooks

The Rules-as-Code discipline engine is wired to git via a local `commit-msg` hook. The hook lives as a tracked file in `fsi-app/.discipline/hooks/` and must be copied into `.git/hooks/` (which git does not track) to activate.

## Install (one command)

From the repo root:

```sh
node fsi-app/.discipline/install-hooks.mjs
```

Run this once after cloning, and again after any update to `fsi-app/.discipline/hooks/`.

Worktree-aware: the installer resolves the hooks directory via `git rev-parse --git-common-dir`, so a single install covers the primary worktree and all linked worktrees.

### Flags

- `--force` — overwrite existing hooks without creating a backup.
- `--dry-run` — report what would happen without writing anything.
- `--hooks-dir=<path>` — override the destination (used by the unit tests).

Re-running is idempotent: if the destination already matches the source, no write occurs. If a different version exists, it is backed up to `<name>.backup-<ISO-timestamp>` unless `--force` is passed.

## What the gate does

On `git commit`, the `commit-msg` hook runs:

```sh
node fsi-app/.discipline/runner.mjs --mode=commit-msg --message-file=<git-tmp>
```

The runner builds a `CheckContext` from the proposed commit message plus the currently staged files, applies all 11 binding rules, and exits with one of:

- `0` — every applicable rule PASS or SKIP. Commit proceeds.
- `1` — at least one rule FAIL. Output names the failed rule(s) and remediation; commit is aborted.
- `2` — engine error. Commit is aborted.

The hook itself only exits non-zero in two situations:

1. The runner exits non-zero (commit blocked, output already printed).
2. The hook itself fails to launch the runner. To avoid being punitive when the environment is broken, the hook returns `0` (commit allowed) and prints a diagnostic when:
   - `node` is not on `PATH`
   - the runner file cannot be located
   - `git rev-parse --show-toplevel` returns empty (unlikely outside a non-git directory)

## Emergency bypass

```sh
git commit --no-verify
```

`--no-verify` is git's standard mechanism. It bypasses both `pre-commit` and `commit-msg` hooks. Use it only for genuine emergencies; a future Phase 6 deliverable will surface bypass usage in audit reports.

## Hook strategy

For v1 we install **only** a `commit-msg` hook (no `pre-commit`). Rationale:

- The 11 binding rules check attestation lines in the commit message (`Loop-closure:`, `Value-delivery:`, `Inventory:`, etc.) plus the staged-file set.
- `commit-msg` is the only git hook that receives BOTH the proposed message and the staged-file context at the same time.
- `pre-commit` would have to be a no-op (it has no message) or duplicate work and run twice; not worth the cost for v1.

If a future rule needs to inspect content earlier (e.g., reject staged files outright before the user composes a message), a `pre-commit` hook can be added to `fsi-app/.discipline/hooks/` and the installer will pick it up automatically.

## Known limitations

- The hook only runs locally. CI-side enforcement is Agent E's deliverable (a GitHub Actions workflow that runs `--mode=ci`).
- `--no-verify` bypasses are not currently audited. Phase 6 will add detection.
- On non-POSIX shells: git on Windows runs hooks via the bundled Git Bash, so the POSIX `#!/bin/sh` shebang works without further setup.
- The hook is `.git/hooks/`-based, not `core.hooksPath`-based, so it does not interfere with other tools that may set `core.hooksPath` per-worktree.
