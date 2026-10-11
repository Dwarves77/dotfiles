Status: Phase 0 landed by lane CI-MIN-0 (PR on branch coord/cimin0-phase0-minutes); Phase 1 (lane CI-MIN-1) is next. Decision: [ADR-047](../decisions/ADR-047-metered-ci-free-tier.md).
Date: 2026-10-10

# Plan: zero-cost CI on a private GitHub repo (2026-10-10)

Goal: stay on GitHub, pay nothing (spending limit $0; Pro's $4 is the operator's last resort, not a plan input), keep
every check that catches bad code before master, keep the post-merge signal. Budget: 2,000 min/month = 65 min/day.

Measured 2026-10-10: 918 runner-minutes on the last build day, ~384 runs; one PR run ~25 runner-min (rendering guard ~8).
Multipliers: every push runs everything; every job runs regardless of whether the PR touched its inputs.

## Phase 0 (today)
1. WIP pushes never run CI: `[skip ci]` on save-point commits (COMMON rule 15); a commit-msg rule enforces it.
2. One PR, one run: `concurrency: cancel-in-progress` per PR; no re-push to re-run; red jobs read from logs.
3. Master pushes run only what the PR could not: drop bug-class guard on push (strict protection ran it on the exact
   merge result); keep discipline job, live smoke on deploy, chain proof on dispatch.
4. Executor batches: one tokens/refresh PR per three merges; merges grouped so deploys (and live smoke) batch.

## Phase 1 (one lane): jobs run only when their inputs changed
5. Every job declares what it governs, derived from the governing-file manifests (chain-proof family / docs-only
   classifier mechanism), never a hand list. Untouched inputs -> recorded "inputs unchanged" pass; changed -> full run.
   Attack: touching one governed file runs the job. Expected ~25 -> ~8-10 min per typical PR; docs/token PRs ~2.
6. Cache node modules, Playwright browsers, Supabase stack Docker images (GitHub cache, free).

## Phase 2: measure
7. Month-to-date minutes (billing endpoint) in every executor report against 2,000; at 1,500 the coordinator pauses
   non-essential lanes.
8. Weekly job-level breakdown so the next cut is aimed.

## Phase 3: production fits the free tier
9. Production = scheduled workers + live smoke on production deploys + monthly chain proof; measure from the harness
   ledger before go-live; target <= 500 min/month (rule 11: fewer firings, larger batches).
10. Live smoke on PR previews decided then with measured headroom.

Untouched: per-PR full run on changed inputs, local pre-commit/pre-push on the PC, strict protection, standing-red
gate, git as backup. Timeline: batch 2b, five build lanes, drift reconciliation, then Stage 9 (1-2 weeks): early-to-mid
November go-live.
