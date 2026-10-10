## 2026-10-10, lane PROOF-8: roles filter accepts the real shape of the roles dump

### Accomplished

- Defect [CONFIRMED, fire 7 run 38020216226, step "Apply the production schema dump to the oracle cluster"]: `dump-roles filter: unrecognised statement in the roles dump (starts "RESET ALL;"): refused`.
- Root cause [CONFIRMED, `supabase db dump --role-only --dry-run` on CLI 2.95.4 prints the script]: the CLI runs the server's roles-only dump through sed and then `echo "RESET ALL;"` AFTER the pipeline. So `RESET ALL;` is the trailing line of the file, not a preamble (the brief called it a preamble). The filter's only session-statement allowance was the regex `^SET [^;]*;$`, which accepted any single-line SET (including SET ROLE) and had no RESET.
- Fix in `fsi-app/scripts/proof/dump-roles.mjs`: new exported `isSessionStatement`, an explicit grammar: `RESET ALL;` or `RESET <guc>;`; `SET [SESSION] <guc> = | TO <value list>;` (values are single-quoted literals with `''` escapes or bare words, comma separated); `SELECT pg_catalog.set_config('<n>', '<v>', true|false);`. `SET ROLE` and `SET SESSION AUTHORIZATION` are refused (identity changes). `filterRoles` passes accepted session statements through in dump order and still refuses every other statement. Output is still empty when no role needs creating. PASSWORD strip and the role-presence filter are unchanged.
- Other forms the CLI can emit [CONFIRMED from the dry-run script]: the Postgres roles dump's leading `SET default_transaction_read_only`, `SET client_encoding`, `SET standard_conforming_strings` (already in the test fixture); `\restrict` / `\unrestrict` lines are turned into `--` comments and then deleted by the CLI's own `/^--/d`; the filter also skips `--` and `\` lines. All are covered by the grammar or the existing skip rules. The exact leading lines of fire 7's raw file are [HYPOTHESIS]: the raw file is not retained (see below), so only `RESET ALL;` is quoted from the fire.
- Raw roles file in the artifact [CONFIRMED by reading chain-proof.yml and the downloaded artifact]: the raw file is written to `$RUNNER_TEMP/schema-dump/production-roles.sql`; the uploaded artifact path is `$RUNNER_TEMP/chain-proof-out` only, and the downloaded artifact (`fsi-app/scripts/tmp/chain-proof-38020216226/chain-proof-report`) holds six JSON files with no roles SQL and no PASSWORD string. The CLI also runs pg_dumpall with `--no-role-passwords`. No workflow change was needed. The filtered `oracle-roles.sql` (passwords stripped, asserted by `passwordProblems`) is the only roles file written under the artifact dir.
- Tests in `fsi-app/scripts/proof/dump-roles.test.mjs`: real-shape fixture (leading SET lines, CREATE/ALTER/GRANT, trailing `RESET ALL;`); session-only dump writes an empty file; grammar accept and refuse tables; attack tests (`DROP ROLE`, `ALTER SYSTEM`, `COPY ... PROGRAM`, `SET x = 1; DROP ROLE ...`, `RESET ALL; DROP ROLE ...`, `set_config(...); DROP ROLE ...`) refused at both the head and the tail of a real-shape dump; PASSWORD strip still runs on a real-shape dump. Red (new tests against the old module): 4 failed, 15 passed. Green: dump-roles.test.mjs 19/19; with chain-proof-workflow.test.mjs and apply-schema-dump.test.mjs 71/71, 0 failed.

### Read and reused

- Read `dump-roles.mjs`, `dump-roles.test.mjs`, `chain-proof.yml` (export, filter and upload steps), the fire-7 artifact directory, `chain-proof-workflow.test.mjs` shape checks (it forbids the word for a local dump client in dump-roles.mjs, so none is named). Reused `filterRoles`, `stripPasswords`, `passwordProblems`, `RAW` fixture and `EXISTING` set; extended the existing filter rather than adding a second one.

### UX compliance

- No `.tsx` or `.css` touched. [NOT-WORK: no customer surface in this lane]

### Not done

- The chain-proof fire has not been re-run with this fix; a fire is the coordinator's dispatch and the NEVER_RUN_DORMANT entry for chain-proof.yml stays until a fire passes. [NOT-WORK: build mode, every runtime by explicit dispatch]
- The CLI used for the dry-run is the local 2.95.4; the CI pin may differ and the exact sed pipeline of that version was not read. The grammar is version-independent for the statements named above; any further new statement in a newer CLI would be refused loudly by the filter and recorded by the next fire. [NOT-WORK: a fact with no action until a fire shows a new statement]
