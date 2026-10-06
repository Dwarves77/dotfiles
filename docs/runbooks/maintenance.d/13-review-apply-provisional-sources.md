## 13. `review-apply-provisional-sources` (RETIRED)

**Status**: retired by lane G6-GATES (2026-10-05), coordinator ruling. The step, its option in
`maintenance.yml`, its wrapper (`fsi-app/scripts/maintenance/review-apply-provisional-sources.mjs`), the
apply script (`fsi-app/scripts/review/apply-provisional-sources.mjs`), the digest library
(`fsi-app/scripts/review/lib/provisional-sources.mjs`) and their tests are deleted, and the digest builder
(section 6) no longer builds a provisional-sources queue.

**Why**: the step only ever wrote `sources.status` (`keep` to `active`, `suspend` to `suspended`) from an
operator group ruling. `keep` is a strict subset of what section 46 (`resolve-provisional-sources`) already
does on promote: that step activates every provisional `sources` row whose host the class table or an
existing institution resolves, writes the class tier and bias tags, and records an unreachable host as a
status, never a rejection. `suspend` is refused outright: the accessibility counters it read are pre-hold
evidence (CLAUDE.md rule 16) and the 2026-09-06 ruling declined it for that reason.

**Where the work lives now**: section 46, `resolve-provisional-sources`, chained in
`.github/workflows/source-resolution.yml`. The coordinator may drop this index line when the runbook index
is next edited.

---
