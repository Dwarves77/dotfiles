## Appendix: `holdings-audit` - wired via the data-audit lane, not this runtime

**New this runbook, lane ONESHOTS, 2026-09-06** (F25 expiry-52 disposition). `scripts/holdings-audit.mjs`
is a READ-ONLY capture-quality audit (operator dispatch 2026-07-14) - classifying every stored capture
(`raw_fetches` snapshots + `agent_run_searches` pool aggregates) against known defect classes, $0, no
LLM/Browserless. Unlike the 35 steps above, it is **not** a `.github/workflows/maintenance.yml` step -
it is registered in `scripts/verify/run-data-audit-lane.mjs`'s own `AUDITS` table (label
`holdings-audit`, SOFT/informational, self-skip exit 2 without DB creds - same convention as
`wave-acceptance-audit.mjs`), dispatched via `.github/workflows/data-audit-lane.yml`'s existing nightly/
CI-with-secrets run. This registration runs only the script's default DRY/report path (never `--write`
- `holdings_quality` gets a row only when an operator runs the script by hand with `--write`, and even
then only once, guarded against double-writing). `docs/inventories/shared-dataset-ownership.md`'s
TO-VERIFY note on the 2026-07-14 dispatch's write completion state is UNCHANGED by this wiring - settling
it needs a live `SELECT count(*) FROM holdings_quality`, not a dispatch root.

**First dispatch** (coordinator): none needed to add - `data-audit-lane.yml`'s next scheduled/manual run
picks up the new `holdings-audit` entry automatically; confirm the run's own printed summary shows a
`holdings-audit` line (PASS/FAIL/ERROR, `[soft]`).

---

