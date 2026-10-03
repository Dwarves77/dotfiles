## 2026-10-03, coordinator: pre-push trimmed to the fast steps (ADR-040)

- Operator ruling: pre-push steps 3-4 removed from every push; CI's required checks are the gate.
- Why: 10-20 min per push; passed two commits CI rejected (prerender without `next build`; F51 fork-point
  computed from merge-base locally vs PR first commit in CI).
- Steps 0-2c still run. `DISCIPLINE_PREPUSH_FULL=1` restores the full local run for one push.
- Files: `fsi-app/.discipline/hooks/pre-push`, `docs/decisions/ADR-040-ci-is-the-push-gate.md`, `docs/INDEX.md`.
