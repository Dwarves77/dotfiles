---
name: operational-merge-deploy-workflow
description: STUB. Codifies the PR merge → apply-pending → Vercel deploy sequence for the Caro's Ledge stack. Includes branch hygiene, conflict resolution, migration application order, and post-deploy verification.
---

# Operational: Merge / Deploy Workflow

## Purpose

When PRs are ready to merge, this skill codifies the sequence:
1. Squash-merge the PR
2. Pull master locally
3. Run `apply-pending.mjs` if the PR includes migrations
4. Verify Vercel auto-deploy completes
5. Verify the visible bug fix or feature is live

## When to use

- After a PR is approved and ready
- For batch merges (multiple PRs in dependency order)
- After conflict resolution during a merge

## Pattern (proven 2026-05-15, batch of 14 PRs)

### Single PR
```bash
gh pr merge <N> --squash --delete-branch
git pull --ff-only
# If PR includes migration:
cd fsi-app && node supabase/seed/apply-pending.mjs
# Verify Vercel deploy: auto-deploys from master push
```

### Stacked PRs (e.g., #99 stacked on #98 via migration 069 stacked on 068)
1. Merge the base PR first (#98)
2. Pull master
3. Rebase the stacked PR onto current master
4. Force-push the rebased branch
5. Merge the now-rebased PR

### Batch merge
1. List all PRs to merge with stacked dependencies identified
2. Merge in dependency order
3. Apply migrations after all PRs merged
4. Verify post-deploy

### Conflict resolution
When `gh pr merge` fails with conflict (often because a sibling PR landed first):
1. The PR may auto-close on conflict (gh behavior)
2. Pull master locally
3. Check out the PR branch
4. Rebase onto origin/master
5. Resolve conflicts; build-verify
6. Force-push
7. Reopen the PR (or create new replacement PR if reopen fails)
8. Merge

## Authorization

Per [[memory feedback_pr_merge_authorization]] (operator-saved 2026-05-15): Claude can merge approved PRs directly via `gh pr merge` without per-PR confirmation when batch scope is confirmed once.

Migrations apply with `apply-pending.mjs` reading credentials from `fsi-app/.env.local`.

## Migration application order

Migrations are applied numerically by `apply-pending.mjs`. If a code PR depends on its migration being live (e.g., RPC call), there's a brief deploy-window risk where Vercel deploys the new code before the migration applies. Mitigation: apply the migration within ~1 minute of the merge.

## Post-deploy verification

- Check Vercel deploy status: `vercel ls`
- Visit the affected page in browser
- Confirm fix or feature visible
- For schema changes: query the new column via service role to verify it exists

## Inherits

- [[rule-cross-reference-integrity]] (deployed schema and code agree)

## Composition

Composed with [[operational-migration-authoring]] (writes the migration the deploy applies). Composed with [[operational-backfill-pattern]] (backfills run after migration applies).

## Audit cross-reference

- 2026-05-15 batch merge of 14 PRs followed this pattern
- Memory: `feedback-pr-merge-authorization`
