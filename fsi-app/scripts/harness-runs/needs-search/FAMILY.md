# needs-search family

Registered by lane G5-SEARCH, 2026-10-07 (buildout plan Stage 5 last clause, "How model judgement runs").
Two runtimes, one family:
`scripts/turns/export-needs-for-search.mjs` (read-only: lists the open source needs of the four kinds and writes
the bundle a session lane finds URLs from) and `scripts/turns/apply-need-urls.mjs` (validates a committed
`needs-search-NNN.json` batch, registers each source at its class-table tier, creates the census_worklist row or
portal candidate the need kind calls for, and resolves the need flag). `.github/workflows/needs-search.yml`
dispatches both (`workflow_dispatch`, plus a push trigger on the batch path that the chained dry guard holds dry
while build mode is live; no schedule). The batch contract is `scripts/turns/needs-search/README.md`.

Each run writes one artifact (`scripts/turns/needs-search/artifact.mjs`); `config.action` is `export` or `apply`.
The workflow's final step lands it into `harness_runs` (`scripts/turns/deliver-artifact-branch.sh`).

**Standing metric.** Export: open needs by kind, how many were listed, skipped (a url already in flight, no
absent parent) or unparseable. Apply: entries applied versus refused (every refusal reason in `per_item`),
sources registered or reused, census rows and portal candidates created, flags resolved, so a proposer pass sees
whether authored batches pass the validator and which refusal class recurs (an unrated host without a verdict is
the expected one).

`pending/2026-10-07-g5-search.md` records why the family starts at zero artifacts.
