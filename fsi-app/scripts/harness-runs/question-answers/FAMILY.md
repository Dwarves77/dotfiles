# question-answers family

Registered by lane L4-B, 2026-10-05 (ADR-044). Two runtimes, one family:
`scripts/turns/export-questions-for-answers.mjs` (read-only: lists the open question flags that held source text
could still answer and writes the bundle a session lane authors from) and
`scripts/turns/apply-question-answers.mjs` (validates a committed `question-answers-NNN.json` batch, writes the
first inference for an answered question and closes its flag, or records on the flag that holdings cannot answer
it). `.github/workflows/question-answers.yml` dispatches both (no schedule; chained since lane CHAIN-4,
2026-10-08 off "Population turn" and "Propagation drain", export only, forced dry in build mode). The batch contract is `scripts/turns/question-answers/README.md`.

Each run writes one artifact (`scripts/turns/question-answers/artifact.mjs`); `config.action` is `export` or
`apply`. The workflow's final step lands it into `harness_runs` (`scripts/turns/deliver-artifact-branch.sh`).

**Standing metric.** Export: open questions, how many were listed, skipped (item not citable, unanswerable with
the pool unchanged) or unparseable, and what the character budget omitted. Apply: entries applied versus refused
(every refusal reason in `per_item`), inferences written, questions closed, unanswerable outcomes recorded,
holdings-need targets raised, refreshed and closed, so a proposer pass sees whether authored
batches pass the validator and which refusal class recurs.

`pending/2026-10-05-l4b.md` records why the family starts at zero artifacts.
