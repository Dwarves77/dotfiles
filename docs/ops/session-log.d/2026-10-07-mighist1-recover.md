## 2026-10-07, lane MIG-HIST-1 (mighist1-recover): the repo describes the database again, verbatim where the record exists, labelled where it does not

Operator rulings 2026-10-07 (no workarounds; "If you don't know what the files did, how are you rebuilding them?"), then the coordinator's three narrowing rulings: retroactive capture not wholesale recreation, schema residue only, and the fixed APPLIED-MAP shape. Facts below were run or read in this lane. No database was queried; the source is the 2026-10-07 read-only export of `supabase_migrations.schema_migrations`.

### Accomplished
- `fsi-app/scripts/migrations/migration-compare.mjs` (new): the one comparison of "stored statements vs file", statement level, ignoring comments (also inside dollar-quoted bodies), whitespace, semicolons and a BEGIN/COMMIT wrapper; tolerates the stray comment fragments the CLI leaves when it splits a comment containing a semicolon. Classes identical, comments-only, code-differs.
- `fsi-app/scripts/migrations/build-applied-map.mjs` (new) generates `fsi-app/supabase/migrations/APPLIED-MAP.json` from the reconciliation JSON and the export: an object keyed by ledger version, `{name, file, class, superseded_by?, note?}`, plus `files_without_row`. The coordinator rulings for the 45 file-less rows and the 11 row-less files are data in that generator, each with its reason. Output reproduces byte for byte.
- Map, 352 rows: identical 109, comments-only 10, code-differs 74, statements-null 112, apply-record-stub 6, recovered 5, superseded-by 6, data-only 27, comment-only 3. Files without a row: outside-ledger 7, duplicate-prefix 3, never-applied 1. The two extra classes beyond the coordinator's list (`statements-null`, `apply-record-stub`) exist because 118 matched rows have nothing to compare.
- Recovered files (schema residue only, F6 names, ledger version in the header, body verbatim after a marker line with a SHA-256 in the header): 241 `next_uncensused_portal_candidates_grant` (residue: the one GRANT), 242 `enable_pg_net_for_capture_worker`, 243 `enable_pg_cron_extension` (residue: the extension line only; the cron.schedule call is not reproduced), 245 `census_findings_recovery_sweep_schema`, 247 `profiles_auth_users_fk`. No NULL-statement file-less rows exist, so no RECOVERY-PENDING placeholders.
- Header-only edits: a one-line `/* status: ... */` first line on 16 files (11 without a ledger row, 5 `APPLIED UNDER LEDGER VERSION`); the stale NOT APPLIED text on 351 to 357 and 182 corrected (subject lines and header lines). The block-comment form is used because the inventory generator and C3 require line 1 to be the subject line or one block comment before it.
- `fsi-app/scripts/verify/migration-history-audit.mjs` (new, `// data-audit: label=migration-history hard=true`, registered by its marker in `run-data-audit-lane.mjs`'s derived list) with invariant `RD-93-migration-history`. It fails on: ledger row not in map, map row not in ledger, missing file or superseder, file not accounted, status-header mismatch, stored statements differing from the file in code, stale map class, recovered body not matching its hash or the ledger. Outside-ledger files are reported as findings "objects unverified", never a pass. Exit 2 without credentials.
- `docs/inventories/migrations.md` regenerated (328 rows).

### Expected result of the first live run
FAIL: 74 CODE_DIFFERS (73 matched pairs plus migration 207 against ledger version 20260801004400) until lane MIG-HIST-2 reconciles them. Simulated against the export: the only failure class is CODE_DIFFERS, 74 rows.

### Read and reused
Read: COMMON.md, mighist1.md, CLAUDE.md, lane-common-contract, the export (`index.json`, `reconciliation.json`, `reconciliation.md`, every file-less row), the forensics file, `F51`, `F6`, `F25`, `F63`, `C3`, the inventory generator, `run-data-audit-lane.mjs`, `spec09-org-rls-adversarial-audit.mjs` and `prov-guard-adversarial-audit.mjs` (models), `invariants.d` README and RD-75/RD-92, `execution-wiring.mjs`, rules 012 and 022, migrations 207, 222, 223, 225, 248, 254, 256, 273. Reused: `scripts/lib/is-main.mjs`, `scripts/lib/pg-conn.mjs`, `scripts/lib/env-file.mjs`, the export's own normalisation idea (reconcile.mjs), the generator's subject-line contract, F51's id scheme, 256 and 273 as covering files rather than recreating their objects.

### Decisions (coordinator-ruled unless marked)
- Data-only rows from the closed Session C lane are recorded in the map, not reproduced (standing rule 1). Objects created then dropped (232, 233 gate_a shadow functions; the result_content_excerpt comment) are `superseded-by`.
- Recovered numbers 241, 242, 243, 245, 247 are the free gap numbers; unnumbered rows take the lowest free gap; the ledger version is in each header.
- Counts, both recorded (coordinator ruling: the measured counts replace the brief's). The brief's estimate, taken from the export's text comparison: 61 code-differs pairs plus 207 vs 20260801004400, 28 comments-only, 99 identical. Measured here by the statement-level comparison in `migration-compare.mjs`: 74 code-differs (73 matched pairs plus 207), 10 comments-only, 109 identical. Reason: the export compared normalised text and read comments inside function bodies as code (5 pairs it called DIFFERENT are statement-identical: 203, 208, 212, 214, 240), and its 22 "db-text-contained" pairs include 16 (migrations 027 to 049, and 334) whose file carries statements the ledger never stored, which is code, not comments. Detail in the audit document, finding 2.
- The audit document is NOT committed: F51 check 4 fails any lane/ branch change under docs/audits/. It stays in the session scratchpad for the coordinator's docs pass, file `mighist1-audit-migration-history-2026-10-07.md` (target name docs/audits/migration-history-2026-10-07.md).
- The six `35x_*.test.mjs` migration tests that asserted the stale NOT APPLIED text were updated to assert the corrected status (consequence of the header fix).

### What is NOT done
- The 74 code-differs rows are not edited (no body edit of any existing migration, no apply).
- Outside-ledger objects are not verified; the ledger INSERTs are staged in the audit document, not run. Wiring F24's object check into the audit is owed.
- MIG-HIST-2 (replay and diff residue) is not started.

### Open items
- Coordinator to land the audit document and rule on the Session C question (objects have consumers or not) and the 74 rows.
