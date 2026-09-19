# Lane briefs, 2026-09-19 (plan section 6.8, dispatched from the cloud)

Briefs written by the local coordinator (N0, N2, the local common brief) and the cloud coordinator (T2, N1, N3,
N4, N5, N6). Amendments are appended in place, never rewritten, so a refuted premise stays visible with its
correction. Each lane was a Sonnet agent under `../2026-09-18/brief-common-cloud.md` and the repo gate wrapper
`fsi-app/scripts/coordinator/lane-gate-cloud.sh`.

| Brief | Lane | Outcome |
|---|---|---|
| brief-common-local.md | all | the local common brief (operator's machine); superseded for cloud lanes by the cloud common brief |
| brief-n0.md | N0 | PR #741 merged; Amendment 1: cloud contract, ceiling line forbidden, memory gate independent of the caller's directory |
| brief-n2.md | N2 | PR #743 merged; Amendment 2: one predicate for run-artifact filenames |
| brief-t2.md | T2 | PR #742 merged; Amendment 1 scoped check (c); Amendment 2 re-stamped nine markers by hand under the old convention |
| brief-n1.md | N1 | PR #745 merged; derived manifest, test globs, npm-test glob, audit markers |
| brief-n3.md | N3 | PR #746 merged; Amendment 1: the verification audit report reads the pending directory |
| brief-n4.md | N4 | PR #748 merged; Amendment 1: the raw NUL bytes in execution-wiring.mjs |
| brief-n5.md | N5 | PR #747 merged; Amendment 1: rebase under N3 and the subject line in every migration; Amendment 2: glyphs out of the subject lines |
| brief-n6.md | N6 | PR #749 merged; Amendment 1: RD-76 assigned, post-N5 facts; Amendment 2: the two historical migration prefixes allowlisted, the hotspot window anchored after the conversion |

Related: [the 2026-09-18 briefs](../2026-09-18/README.md), [the lane contract](../../lane-common-contract.md),
[the build plan, section 6.8](../../../plans/complete-system-build-plan-2026-09-04.md).
