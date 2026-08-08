# Main-checkout stabilization plan — 2026-08-08

Operator-directed ("fix the checkout and make it stable"). Every claim below is from
direct evidence (git object inspection on origin refs; device-side listings of the
real checkout), not from working-tree guesswork. The Linux-VM view of the checkout
shows phantom CRLF modifications and is NOT usable for state questions; the
Windows-side `git status` is ground truth.

## Audited state of `C:\Users\jason\dotfiles`

1. **Parked on `corpus-integrity/intake-census`: 1 ahead / 75 behind master.** The
   single unique commit is `35ddfe6` (census-exclude RPC, migration file
   `223_next_uncensused_portal_candidates.sql` + portal-harvest changes). Its
   migration is ALREADY APPLIED to the live DB as `20260721222204` (2026-08-02
   retraction entry). The branch ref is pushed to origin — nothing is lost by
   leaving the branch parked; only the CHECKOUT moves.
2. **Stale checker (the push-blocker):** the branch's
   `.discipline/governance/check-pretooluse-wired.mjs` (blob `4316b71`) predates the
   2026-07-26 scoped-wrapper rework (master blob `b1a83b5`). Every push from this
   checkout fails discipline 3c falsely and dangles the destructive
   `wire-pretooluse-settings.mjs --apply` suggestion. Moving the checkout to master
   kills this at the root.
3. **45 unstaged deletions, exact set derived and count-confirmed:** all 45 are
   one-shot apply/probe writes scripts under `fsi-app/scripts/tmp/` (mig083-apply,
   phase-4/5 execute, q*-apply-*, …), tracked at BOTH branch and master HEAD (the
   same 79-file tracked set). They sit on a doctrine collision: the fsi-app doctrine
   declares writes scripts audit records that "live in the repo", while standing
   rule 5 declares `scripts/tmp/` regenerable gitignored scratch. The deletions are
   local-only; the repo retains every file.
4. **4 untracked paths.** Pinned: `docs/dispatches/free-chrome-acquisition-brief-2026-07-16.md`
   (tracked on no ref). The census audit + two scripts: exact names come from local
   Claude Code's own status output (requested; zero-cost).

## The fix (local Claude Code executes; no push, so the stale pre-push hook never runs)

```
cd C:\Users\jason\dotfiles
git checkout -- fsi-app/scripts/tmp
git status --porcelain          # expect ONLY the 4 untracked lines; report them verbatim
git checkout master
git pull origin master
node fsi-app/.discipline/governance/check-pretooluse-wired.mjs   # expect wrapper-aware PASS
git status --porcelain          # expect ONLY the same 4 untracked lines
```

Why restore-then-move, ordered: restoring the 45 first (they are identical blobs on
both refs, so this is byte-neutral repo-wise) makes the branch switch clean; carrying
unstaged deletions across a checkout would smear them onto master's working tree.
The untracked 4 survive untouched — `checkout`/`pull` never touch untracked paths.
End state: main checkout on current master, wrapper-aware checker active, zero
tracked-file drift, 4 untracked files awaiting disposition, branch
`corpus-integrity/intake-census` intact on origin for archaeology.

## Deferred decisions (operator, non-urgent, tracked here)

1. **The scripts/tmp doctrine collision (class):** 79 tracked files under a
   gitignored scratch dir. Recommendation: a dedicated PR that `git rm`s them from
   the tree (history retains every byte for forensics — the audit-record doctrine's
   retrievability requirement survives) and amends the doctrine line to say so.
   Not executed in this pass.
2. **The 4 untracked files:** commit, archive, or discard once their contents are
   reviewed (names + contents surface from the fix run above).
3. **Branch `corpus-integrity/intake-census`:** its unique commit's migration is
   applied but its code changes (portal-harvest) may still be wanted — rebase-or-
   retire ruling when census work resumes.
