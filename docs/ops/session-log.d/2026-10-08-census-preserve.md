## 2026-10-08, executor EXEC-2 (coord/census-preserve): unmerged census work from 2026-07-21 preserved on a branch

- Four scripts (census-audit-gate-30, census-ecfr-stock-enumerate, census-eurlex-stock-enumerate, census-uk-stock-enumerate under fsi-app/scripts/) were committed on the old July branch census/classify-full-enum (local commit 407efdb9) that cannot pass pre-push. Copied verbatim onto a fresh branch from origin/master and pushed to refs/heads/census/classify-full-enum; no PR, nothing merged; retained for the Stage 9 census step.
- The only change to the content: 26 lines carrying an existing dash or section-sign glyph got the same-line `glyph:verbatim` marker (rule 022), as the coordinator directed. No logic edited.
- The memory gate (pre-push step 2b) required a vault record of the range; this file is that record.
