## 2026-10-11, lane DRIFT-2 (drift2-chain-proof-green): the oracle's default-privilege check compares what the migrations govern

WIP entry, finalised before the final push.

### Review (positives and negatives, then the decision)

Fact [CONFIRMED: fire 10 schema-apply-report.json, run 38143319917]: default privileges cleared 69, declared by the dump 9, oracle after 17, extra 8; all 8 extras are in schemas `cron`, `pgsodium_masks`, `pgsodium`. pg_dump does not emit an extension's own ALTER DEFAULT PRIVILEGES, so the dump can never declare them and the check was red by construction.

- A. Compare only the entries the migrations govern (schema '' and public). Positive: the defect class DRIFT-1b exists for (342 public grants from image defaults) is exactly these entries; simple; a public or global extra stays red. Negative: a default privilege in another schema is not compared (it never could have been: pg_dump does not carry extension ones, and auth, storage and realtime are Supabase-managed, outside migrations).
- B. Exclude entries whose schema an extension created (pg_depend deptype 'e') or whose owner is supabase_admin. Positive: catalog-driven. Negative: the pgsodium schema is created by the dump's own CREATE SCHEMA, not extension-dependent, so B leaves pgsodium rows red unless an owner rule carries them, and an owner rule is a hand list by another name.
- Decision: A. `compareDefaultAcl(oracleRows, declaredRows, { schemas = ["", "public"] })` filters both sides to the schemas before the set difference and returns `out_of_scope` (oracle rows excluded). The report gains `default_acl.scope` and `default_acl.out_of_scope`, so the exclusion is visible in every run, and the console line prints it. The pre-dump clearing (DRIFT-1b) stays catalog-wide, unchanged.
