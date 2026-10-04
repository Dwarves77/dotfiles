## 37. `source-role-cleanup`

**New this runbook, lane ONESHOTS, 2026-09-06** (F25 expiry-52 disposition). Written from
`scripts/source-role-cleanup.mjs`'s own header. `docs/ops/session-log.md` is explicit and current: 874
registry-wide `source_role IS NULL` rows remain and this script is "the durable path" to fix them.

**Purpose**: the #3 source-classification cleanup (authorized 2026-06-04). Re-runs the deterministic
`classifySourceRole` (name+url, no LLM/Browserless, $0) over `sources`; where it confidently disagrees
with the stored `source_role`, proposes the fix. Default scope is EVERY row (not just `status='active'`,
fixed 2026-08-11 - a row is most likely to be missing its role precisely because it was demoted/suspended
before anyone classified it). The migration-123 trigger re-derives `category`/`intelligence_types` on
UPDATE.

**What it does NOT do**: never guesses a role for a row `classifySourceRole` cannot confidently resolve;
never writes a row whose `source_role` changed under it since the plan was computed (the
`IS NOT DISTINCT FROM` WHERE guard + read-back - see counts below).

**Upstream**: `src/lib/sources/classify-source-role.ts` (pure classifier, unmodified). Connection FIX this
lane also made (rule 13): the script previously hardcoded a LOCAL-ONLY `supabase link` connection path
with no CI fallback (an unguarded `readFileSync` that would ENOENT-crash the moment this ran from GitHub
Actions, the only place with DB credentials) - now uses the shared `scripts/lib/pg-conn.mjs` resolver
every other pg-direct tool in this repo uses, and self-skips (exit 2) rather than crashing when no
candidate connects.

**Ruling**: authorized 2026-06-04 (the #3 source-classification cleanup, per the script's own header).

**Dispatch**: needs a DIRECT Postgres connection (`scripts/lib/pg-conn.mjs`'s resolution order:
`SUPABASE_DB_URL`/`DATABASE_URL` → a local `supabase link` → `NEXT_PUBLIC_SUPABASE_URL`+
`SUPABASE_DB_PASSWORD`-derived candidates) - **not** the REST creds `maintenance.yml`'s "Verify required
secrets" step checks. `SUPABASE_DB_PASSWORD` must be set as a repo secret for `apply` to connect in CI;
`arg=active-only` narrows scope to `status='active'` sources (the pre-2026-08-11 scope); omit for the full
registry-wide scope. `mode=dry` reports mismatches, writes nothing. `mode=apply` writes each confident
mismatch via `UPDATE ... WHERE source_role IS NOT DISTINCT FROM <old>` + read-back.

**Artifact / read back**: `summary.json` under `$OUT_ROOT/source-role-cleanup/` (total rows, mismatches,
by-transition counts, applied/halted). Confirm against `SELECT count(*) FROM sources WHERE source_role IS
NULL` before/after (874 as of 2026-09-06, session-log.md).

**First dispatch** (coordinator): `mode=dry`, `step=source-role-cleanup`, no `arg` - the full registry-wide
mismatch report (no DB write either way) to see the real transition counts before any apply.

---

