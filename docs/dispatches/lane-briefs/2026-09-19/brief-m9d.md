# Lane M9d: a harness family for the data producers (plan section 6.1, row M9; follow-on from lane M5)

Read `brief-m-common.md` first. Worktree and branch: named in your dispatch message (cut from master AFTER
lanes M9a and M9b have merged; both touch the files you extend). Lane id `m9d`.

## Why

Lane M5's report: the market and regional producers (`scripts/producers/market/*.mjs`, the regional
producers behind `run-envelope-producer.mjs`) are the loop's "data producers" box, they fire the outbox and
now author DAG edges, and they are the only loop box with NO harness-run family: `run-artifact.mjs`'s
`ALLOWED_FAMILIES` lists eleven families and none for producers, and no producer calls `writeRunArtifact`.
So a producer run leaves no artifact, F28 cannot check its staleness, F50 (M9a) cannot enforce the
`data-producers-to-propagation-drain` hop's "fired" flag, and M5's fail-closed assertion has no artifact to
record `status: "failed"` in.

## What lands

1. Family `producers` registered in `run-artifact.mjs` (`ALLOWED_FAMILIES`), `governing-files.mjs`
   (governing files: the shared author `author-market-series-delta.mjs`, `run-envelope-producer.mjs`, the
   producer modules), `CONVENTION.md` (a section: one artifact per producer run, `config.producer` names the
   producer, `config.trace` carries M5's trace when on, `outcome` carries `rows_changed`, `edges_authored`,
   `status`), and F28's coverage if it enumerates families by name.
2. Every producer run writes `producers-run-NNN.json` through the shared writer: the three market producers
   and the envelope runner (one call site each; no copy of the writer). `trigger` and `upstream_run_id`
   come from the shared writer (M9a). M5's assertion failure is recorded as `status: "failed"` with the
   reason before the non-zero exit.
3. `data-producers.yml` commits the artifact the way the other families commit theirs (copy the step).
4. `PENDING-RUN.md` for the family per the convention's rule (b); the first real artifact is the
   coordinator's dispatch.
5. Unit test: a producer run with a fake client produces an artifact object in the convention's shape;
   the M5 assertion failure yields `status: "failed"`. Session-log entry; runbook note in the propagation
   runbook's producers section.

## Acceptance (section 0)

Reachable: the `writeRunArtifact` call in each producer and the commit step in the yml (quote). Run: the
coordinator's producer dispatch after merge. Populated: `producers-run-001.json` on master. Gated: F28
covers the family; F50's producers hop can flip `enforceFired` once the artifact records `workflow_run`.
Documented: the CONVENTION section.

## Out of scope

The producers' own logic, the drain, M5's assertion (keep as is), any other workflow.
