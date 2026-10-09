# 2026-10-07 RULES-1 (lane id rules1-gate-precision): two gates that misfire are fixed at the gate

Operator ruling 2026-10-07: no workarounds. Three lanes that day routed around rule 015 and F51 check 5;
the gates were the defect. Branch `lane/rules1-gate-precision`, cut from origin/master 499ac85c.

## Accomplished

- **Rule 015 (`fsi-app/.discipline/rules/015-row-mutation-guarded-path.mjs`) now detects DATABASE writes,
  not method names.** The old detector matched any `.update(`, `.upsert(` or `.delete(` in the file text.
  `rawWriteHits(content)` (exported) masks comments and string, template and regex literal contents, then
  accepts a candidate call only when its receiver chain is a Supabase query builder: a `.from(` in the
  chain (builtin `Array/Buffer/Object/...` `.from(` excluded), a client factory call or a name bound from
  one, a name bound from a non-awaited database chain (`const q = sb.from("x"); q.delete()`, derived
  builders, `this.q = ...`), or a supabase-style receiver in a file that shows a Supabase signal. The
  receiver list and factory list are stated in the rule header and derived from `scripts/lib/db.mjs` and a
  census of `<name>.from(` over `fsi-app/src` and `fsi-app/scripts`. `GUARDED_IMPORT_RE` and the
  `Write-Guard-Override` trailer are unchanged; the rule signature is unchanged, so the pre-commit loader
  is untouched. The failure message now carries the line numbers.
- **F51 check 5 exempts generated files that equal their generator output.** New registry
  `fsi-app/.discipline/governance/generated-files.mjs`, each entry naming its generator script. A listed
  file is exempt from the concurrency violation only when its committed copy equals what the generator
  prints now on the checked tree (generator run read-only, stdout compared, nothing written). Hand-edited,
  stale, generator-failed, missing and live-sourced copies are not exempt; a non-generated shared file is
  refused exactly as before. The generator runs only for a file that already has a concurrent prior touch.
  F51 wiring: `evaluateConcurrencyViolations({ generatedCheck })` and `runCheck5(root, { generatedFiles })`.

## Read and reused

- Read in full: CLAUDE.md, `docs/dispatches/lane-common-contract.md`, the brief and COMMON.md, rule 015 and
  its test, F51 and its test (1016 lines), `scripts/lib/db.mjs` guarded writers and `readClient`,
  `generate-migrations-inventory.mjs`, `coverage-scan.mjs` (CLI and `runCoverageScan`),
  `schema-vocabulary-inventory.mjs`, PR 974 and PR 975 changed-file lists and the lines below (read-only,
  via `git show origin/lane/...`).
- Reused: the F51 concurrency definition and `ENTRY_DIRS`/`HOTSPOT_ALLOWLIST` untouched; the repo's own
  generators (migrations inventory dry mode prints to stdout; `runCoverageScan` is the function the CLI
  calls); `buildContextFromFixture` and the F51 git-fixture helpers (`tmpRepo`, `writeFile`) in the tests.
  Nothing new was built where a mechanism existed; the registry is the one new module (no equivalent
  existed: `git grep -i generated-files` found nothing).

## Decisions

- Registry is one `.mjs` list, not a `.d` directory: entries change only when a new generated file KIND
  appears, never per lane, and a `.d` directory of `.mjs` entries needs an F25 root (outside the write set).
- `db-check-constraints.json` is registered as `source: 'live'`: it is read from `pg_constraint` and stamped
  with a generation time, so equality with a generator cannot be shown offline. It is listed (generator
  named) but never exempt. `applied-migrations.json` (PR 975) has no generator script on master; its entry
  belongs with the lane that adds `sync-applied-migrations.mjs`, as a `live` entry for the same reason.
- Static receiver names (`client`, `db`, `sb`, ...) count only when the file shows a Supabase signal, so a
  bare `client.delete(url)` on an HTTP client or a Map named `db` passes.

## Evidence

- Census, 294 non-test scripts: the old rule flagged 2 files lacking the guarded import, the new rule flags
  1 (`scripts/_archive/phase2-verify-binding.mjs`, a real builder write); the dropped one is a `Map.delete`.
  Across `fsi-app/src` and `fsi-app/scripts` non-test files, 58 old-regex matching lines are no longer
  flagged: every one is a comment, a hash `.update(`, or a Map/Set `.delete(`.
- PR 974 and PR 975 files read from their branches: the new rule PASSES every `fsi-app/scripts/proof/*.mjs`
  as it stands, and PASSES them with the dodges reverted (the old rule flags the reverted files).
- `coverage-report.json` on master is STALE against its own generator (the scan finds test files the
  committed report lacks, for example `src/components/admin/corrections/loaders.test.mjs`). Not touched here
  (outside the write set); the first lane that edits it concurrently regenerates it.

## For PROOF-1 and PROOF-2: the exact lines to revert (do not edit their branches from this lane)

Line numbers are at the branch tips read on 2026-10-07: PR 974 `lane/proof2-subset` 4486b81d, PR 975
`lane/proof1-stack-and-replay` dc7ba1e6. Once this PR is merged and the branch is updated from master, rule
015 passes the plain forms.

PR 974 (PROOF-2), `fsi-app/scripts/proof/`:

- `mem.mjs`: delete the file (8 lines, the `Reflect.apply(Object.getPrototypeOf(coll).delete, ...)` wrapper)
  and its import.
- `export-subset.mjs`: delete line 38 (`import { removeKey } from "./mem.mjs";`) and revert the five calls to
  the plain method: line 194 `removeKey(remaining, t)` to `remaining.delete(t)`; line 252
  `removeKey(up, `${t}\u0000${k}`)` to `up.delete(`${t}\u0000${k}`)`; line 292
  `removeKey(m, rowKey(info, row))` to `m.delete(rowKey(info, row))`; line 356 `removeKey(m, k)` to
  `m.delete(k)`; line 364 `removeKey(subset, t)` to `subset.delete(t)`.
- The `node:crypto` `hash()` swap (needs Node 21.7 or later) back to `createHash`:
  `export-subset.mjs` line 32 import and line 380 `hash("sha256", body)`;
  `load-subset.mjs` line 31 import and line 60 `hash("sha256", body)`;
  `export-subset.test.mjs` line 4 import and line 235; `load-subset.test.mjs` line 4 import and line 17.
  Each call becomes `createHash("sha256").update(body).digest("hex")` with `import { createHash } from
  "node:crypto"`. (The test files are excluded from rule 015; revert them for consistency.)

PR 975 (PROOF-1), `fsi-app/scripts/proof/export-local-harness-runs.mjs`: line 17
`import { hash } from "node:crypto"` becomes `import { createHash } from "node:crypto"`, and line 28
`hash("sha256", String(id), "hex").slice(0, 12)` becomes
`createHash("sha256").update(String(id)).digest("hex").slice(0, 12)`.

## NOT done

- No edit to PR 974 or PR 975 branches (their lanes revert the lines above in their own PRs). [NOT-WORK: fact, no action]
- `applied-migrations.json` has no registry entry (its generator is not on master yet).
- `db-check-constraints.json` stays subject to check 5 (listed, never exempt): the brief's equality cannot
  be shown without the live database.
- `coverage-scan.mjs` has its own `WRITE_RE` (the governed-surface classifier, F23); same-name false
  positives there are a separate detector and outside this write set.
- No whole suite or fitness runner run; the touched test files were run with `node --test`, CI is the gate. [NOT-WORK: build-mode hold, COMMON rule 9]

## Open items

- Decision for the operator or coordinator: whether the maintenance workflow that commits
  `db-check-constraints.json` should be the only writer of it (then it never collides), since it cannot be
  exempted by equality.
