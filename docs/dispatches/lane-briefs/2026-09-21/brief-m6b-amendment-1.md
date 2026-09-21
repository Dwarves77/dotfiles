# Lane M6b, Amendment 1 (coordinator, 2026-09-21): continuation. Read after `brief-m6b.md`; where they disagree this file wins.

The first M6b agent built item 1 only and stopped at about 250k tokens: commit `007e2f86` on `lane/m6b-gate-a-rescan` in `C:/Users/jason/dotfiles/.worktrees/wt-l25-slot-mirror` (the shared writer `scripts/lib/gate-a-state-writer.mjs`, `provenance-heal.mjs` delegating to it; fitness 0 violations, suite green). You are its replacement, not a resume. Do NOT redo or re-verify item 1. Continue on that branch from that commit with items 2 to 8, in this order, one commit per numbered group:

1. Items 2 and 3 together (the script, the family descriptor files, the emitter, their tests).
2. Item 4 (attach-found-sources filter and flags, tests).
3. Items 5 and 7 (the workflow, its wiring test, the attack-chain extension).
4. Item 8 checks, then item 6 (fetch, rebase, hop files if `loop-hops.d/` exists), then the FULL fitness runner, then the locked push gate once.

Token discipline, binding: read ONLY what a step needs. Read these and nothing wider unless a test fails: `src/lib/intake/write-item.ts` lines 50 to 99; `src/lib/agent/gate-a-derived.mjs` (whole, short); `scripts/mint/rederive-record-provenance.mjs` (the touch call only); `scripts/turns/emit-brief-export-artifact.mjs` and its test (your emitter's model); `scripts/harness-runs/brief-export/family.json` and `FAMILY.md` (your family's model); `.github/workflows/brief-export.yml` (your workflow's model); the `FAMILY_BY_WORKFLOW_NAME` block and the last attack-chain test in `scripts/lib/loop-run-id.test.mjs`; `scripts/maintenance/attach-found-sources.mjs` from its imports to the end (skip the header). Do not read `heal-provenance.mjs` beyond the signature of `main()`. Do not run the full test suite after every edit: run the tests of the files you touched, and the full suite and full fitness runner once at the end.

If you reach about 300k tokens with work left, commit what is green, and report exactly which numbered group is done. Report shape as in the brief: ONE final report, five lines maximum, no interim messages.
