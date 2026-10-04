## 31. `spec09-auxiliary-energy-csv`

**New this runbook, lane ASSEMBLE-47, 2026-09-05** (plan section W5.1); narrowed by lane EXTERNAL-ONLY,
2026-10-03 (ADR-042). Targets `scripts/spec09/auxiliary-energy-producer.mjs` / `auxiliary_energy_profiles`.

**Purpose**: dispatches the CLI for an OPERATOR-SUPPLIED rows file of external public-source data (never
customer data; the app has no upload route). This is the ADR-023 operator-dispatch ingest path.

**Upstream**: `scripts/spec09/lib/operator-rows-contract.mjs` (`parseOperatorRows`) and
`scripts/spec09/lib/cli-csv-args.mjs` (`readCliCsvArgs`, the shared `--csv`/`--org-id` argv reader).

**Dispatch**: `arg` is `<csv-path>,<org-id>` (csv-path a repo-relative path to a reviewed rows file checked
into the repo; org-id the receiving org's uuid, dispatcher-supplied, never read from the file). `mode=dry`
parses and reports accept/reject counts, writing nothing. `mode=apply` calls
`guardedInsertMany("auxiliary_energy_profiles", ...)` for every accepted row.

**No-arg dry-all fixture proof** (lane W71-A, 2026-09-05): when `mode=dry, step=all` (or this step alone) runs
with NO `arg`, this step runs `node scripts/spec09/run-fixture-import.mjs` instead of skipping: the
deps-injected, DB-less proof that both operator-rows tables' parse, org-stamp, insert, read-back pipeline works
end to end against the checked-in fixture CSVs (`scripts/spec09/fixtures/*.csv`), with no live Supabase
credentials. This makes `run-fixture-import.mjs` a real dispatch root. The indexation step (section 32) just
skips with a note pointing back here on a no-arg run, so the proof runs once per dispatch.

**Artifact / read back**: this step's own console output, or (no-arg dry-all runs) the fixture-proof JSON
written to `$OUT_ROOT/spec09-operator-rows/fixture-import-<timestamp>.json`. Confirm a real apply against
`SELECT count(*) FROM auxiliary_energy_profiles`.

---

