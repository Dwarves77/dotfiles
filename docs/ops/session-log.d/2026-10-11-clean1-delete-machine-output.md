# 2026-10-11 CLEAN-1: committed machine output and archives removed

Lane clean1-delete-machine-output (build lane, Sonnet). Operator ruling, 2026-10-11: delete outright, nothing archived,
nothing kept "just in case"; a consumer that only existed to read the deleted evidence is deleted with it.

## Accomplished (work in progress, finalized before the single CI push)

- Line count before: 1,659,012 (`git ls-files -z | xargs -0 cat | wc -l`, the batched `wc -l | tail -1` form undercounts).
- Group A removed: docs/ratifications, docs/archive, docs/design/handoff-2026-09-06, docs/design/handoff-2026-09-07,
  design_handoff_2026-05, fsi-app/docs/audits.

## Read and reused

- Reused the existing gitignore, the design-audit generator and its workflow test; no new mechanism built.

## Decisions

- Pending, filled in at the end.

## NOT done

- Pending. [NOT-WORK: draft entry, finalized before the CI push]

## Open items

- Pending. [NOT-WORK: draft entry, finalized before the CI push]
