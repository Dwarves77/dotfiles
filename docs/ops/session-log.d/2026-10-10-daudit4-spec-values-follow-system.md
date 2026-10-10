# DAUDIT-4 (lane id daudit4-spec-values-follow-system): three design-audit spec values follow the system's seven-dimension count, 2026-10-10

Branch `lane/daudit4-spec-values-follow-system`, cut from origin/master 76bec7b28. Row closed: `docs/ops/session-log.d/2026-10-08-dfix1-surface-defects.md:59` -> [CLOSED: this PR].

## Accomplished

- Rule 20 applied, the system's counts govern. `ALL_OPERATIONS_DIMENSIONS` in `fsi-app/src/lib/agent/formats/operations-matrix.ts` lists seven keys (grid_intensity added by S8-E5, PR 1029); `OperationsLedger.tsx` `DIMENSIONS` maps all seven; the audit mount (`mounts.mjs`) imports that export (PR 1059). Read from the files, not run.
- Three spec rows set to the system's values, each with its evidence in the row's `note` field:
  - `spec/operations-matrix.json` dimension rows: count 6 -> 7.
  - `spec/operations-matrix.json` unsourced-cell dash: count 22 -> 27 (8 sourced of 5 x 7 = 35 cells).
  - `spec/operations-matrix-six-regions.json` header hint: text "8 of 36 cells sourced, 22%" -> "8 of 42 cells sourced, 19%" (8 sourced of 6 x 7 = 42; 8/42 = 19%).
- Both edited files parse as JSON (node JSON.parse). No dash or section-sign glyph in the added text.

## Read and reused

- The three spec files, mounts.mjs lines 515 to 600, results.json (committed pre-1059 oracle), the DFIX-1 log's NOT done section, `.github/workflows/design-audit.yml` header. Reused the existing `note` field on spec rows; no new mechanism.

## Decisions

- `results.json` and the AUDIT document are not touched: they are CI-generated (DAUDIT-3, generated-on.test.mjs). The before and after MISMATCH counts are the design-audit job's, read from the PR run.
- Not run locally: the audit needs node_modules and a browser; COMMON rule 9, CI is the gate.

## NOT done

- Two spec row NAMES in `operations-matrix.json` still say the old counts: the "region column sub-line ... 'N/6 sourced'" row (its selector counts 5 region headers and still matches) and the "ACCEPTANCE C" row ("Twenty-two of the thirty cells ... eight are scores"; its value 8 is unchanged and correct). Text only, outside the three-row write set. [WORK: owed]
- Local red-then-green of the audit rows: not possible without the CI image; the job's before and after counts stand in. [NOT-WORK: COMMON rule 9, CI is the gate]

## Open items

- The seventh dimension row (D7 grid_intensity) is not on artboard 08, which draws six: a DESIGN CHANGE OWED to Claude Design (rule 20, S8-E5). [NOT-WORK: design change recorded for Claude Design, no build action]
