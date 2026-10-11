# 2026-10-11, lane FIX-MASTER-1 (fixmaster1-scrub-registers): registers scrubbed of personal identifiers

The 41 audit registers landed on master (AUD-LAND, #1116) after the ANON-1 scrub and carried the operator's first name, home paths and a quoted SQL expression. Two tree-wide tests in the static CI job failed on every code pull request because of them. This lane edits only the offending tokens; every other byte of each line (line numbers, counts, evidence) is unchanged.

## Accomplished

1. `node --test fsi-app/scripts/verify/no-personal-identifiers.test.mjs` before: 1 of 10 tests red, 8 files listed (7 under `docs/archive/audits/2026-10-11-complete-audit-registers/`, 1 under `docs/audits/2026-10-11-complete-audit/`), 25 lines. After: `pass 8, fail 0`. No allowlist entry added.
2. `node --test fsi-app/scripts/verify/capture-length-scan.test.mjs` before: red on 3 register lines (C3a:128, C4:509, C4:862; the brief named only C3a:128, the run named the two C4 lines as well). After: `pass 1, fail 0`. Each quoted SQL call became prose ("the length of result_content", "the length of NEW.result_content").
3. Token map applied to the 25 identifier lines: the first name became "the operator" (possessive "the operator's"); the repo path prefix became `<repo>`; the home-directory prefix of the two non-repo paths (the scratchpad and the global memory directory) became `<home>`; the project-slug form of the repo path became `<repo-slug>`. `<home>` is a deviation from the brief (which said `<repo>` for every home path): a global config file is not inside the repo, so labelling it `<repo>` would state a false location in evidence text.
4. Lines scrubbed per file (file:line):
   - A1-part1-src-app-api-2026-10-11.md: 1 (28)
   - A1-part2-src-app-pages-2026-10-11.md: 1 (28)
   - B2-part3-verify-2026-10-11.md: 4 (50, 75, 77, 81)
   - B2-part4-other-scripts-2026-10-11.md: 5 (25, 26, 71, 101, 114)
   - D2-skills-and-memory-2026-10-11.md: 5 (25, 384, 445, 798, 953)
   - F1-harness-and-flywheel-2026-10-11.md: 1 (4)
   - MEM-1-rules-and-memory-2026-10-11.md: 5 (152, 213, 225, 266, 716)
   - docs/audits/2026-10-11-complete-audit/BACKLOG-2026-10-11.md: 3 (1514, 1584, 1665)
   - SQL prose: C3a-migrations-311-350-2026-10-11.md 1 (128); C4-db-live-2026-10-11.md 2 (509, 862)
   Total 28 lines in 10 files.
5. Rule 17 tier on the merged tree: see the final entry below.

## Read and reused

Read whole: `fsi-app/scripts/verify/no-personal-identifiers.test.mjs` (202 lines, 1 read call); `capture-length-scan.test.mjs` lines 21 to 32 (the BANNED pattern). Reused the existing verifiers as the detector; built nothing new. Scan helper was a throwaway in the scratch area, not committed.

## Decisions

- BACKLOG-2026-10-11.md is outside the register directory but is on the same failing list, so it is scrubbed under the same token map; leaving it would keep the test red.
- The registers are evidence of the audit; their content was not re-verified or reworded beyond the tokens. [NOT-WORK: scope statement]

## NOT done

- Git history still holds the unscrubbed register text from the AUD-LAND commit; rewriting history is the separate ANON-1 history step. [NOT-WORK: scope statement, history rewrite is a separate operator-ruled step]

## Open items

- None. [NOT-WORK: no residual]

## Context (rule 11)

Context tokens: skill loads (two) were forced by the write gate hook and dominate the session; no sub-agents, no screenshots, no PDF reads. Fresh session recommended before any further lane work.
