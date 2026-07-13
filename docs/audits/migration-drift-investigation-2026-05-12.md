# Migration 070 drift investigation

Date: 2026-05-12
Investigator: agent session
Scope: PR #100 (`feat/phase1-routing-restructure`) migration `070_phase1_routing_rpcs.sql` vs live DB definitions of `get_market_intel_items`, `get_research_items`, `get_operations_items`.

## TL;DR

**No drift exists.** The prior agent's surfaced claim that "live DB includes a `summary` column that the on-disk backup `scripts/tmp/070_old.sql` omits" is incorrect on both halves: the backup file contains `summary`, the branch file contains `summary`, and the live DB returns `summary`. All three are functionally identical. No commit was made to PR #100 because nothing needed correcting.

## Evidence

### Step 1: Files compared

| Artifact | Path | `summary` column present? |
|---|---|---|
| Live DB (`pg_get_functiondef`) | dumped to `fsi-app/scripts/tmp/072-live-get_*.sql` | yes (column 4, all 3 RPCs) |
| Backup file (prior agent) | `fsi-app/scripts/tmp/070_old.sql` | yes (lines 59, 146, 234 — column decl; lines 89, 176, 264 — SELECT-list) |
| PR #100 branch file | `fsi-app/supabase/migrations/070_phase1_routing_rpcs.sql` @ `feat/phase1-routing-restructure` | yes (lines 59, 146, 234 — column decl; lines 89, 176, 264 — SELECT-list) |

`diff scripts/tmp/070_old.sql scripts/tmp/branch_070.sql` returns **byte-identical** — the backup IS the branch file.

### Step 2: Semantic equivalence check (live DB vs branch file)

Normalization rules applied (`fsi-app/scripts/tmp/072-normalize-and-diff.mjs`):
- lowercase
- collapse whitespace
- canonicalize `$function$` ↔ `$$`
- drop `public.` schema prefix
- canonicalize type aliases (`INT` → `integer`, `TIMESTAMPTZ` → `timestamp with time zone`)
- canonicalize parenthesis/comma spacing

Result after normalization:

| RPC | Live length | Branch length | Difference |
|---|---|---|---|
| `get_research_items` | 1719 | 1720 | trailing `;` before closing `$$` (cosmetic) |
| `get_market_intel_items` | 1582 | 1583 | trailing `;` before closing `$$` (cosmetic) |
| `get_operations_items` | 1523 | 1524 | trailing `;` before closing `$$` (cosmetic) |

The 1-byte difference in each case is a trailing semicolon Postgres strips when storing the function body. **The function bodies and signatures are semantically identical.**

### Verbatim diff of the formatting differences

These are the *only* differences between branch file and live DB output. They are all artifacts of `pg_get_functiondef` rendering, not source-of-truth divergence:

```
--- branch (070_phase1_routing_rpcs.sql)
+++ live (pg_get_functiondef)

@@ signature header @@
-CREATE OR REPLACE FUNCTION get_research_items(p_org_id UUID)
-RETURNS TABLE (
-  id                       UUID,
-  legacy_id                TEXT,
-  title                    TEXT,
-  summary                  TEXT,
-  ...
-) LANGUAGE sql STABLE SECURITY DEFINER AS $$
+CREATE OR REPLACE FUNCTION public.get_research_items(p_org_id uuid)
+ RETURNS TABLE(id uuid, legacy_id text, title text, summary text, ...)
+ LANGUAGE sql
+ STABLE SECURITY DEFINER
+AS $function$

@@ body trailer @@
-    ii.added_date DESC;
-$$;
+    ii.added_date DESC;
+$function$
```

Same pattern repeats for `get_market_intel_items` and `get_operations_items`.

Postgres' `pg_get_functiondef` always re-emits in canonical form (lowercase types, schema-qualified name, `$function$` dollar-quote, RETURNS TABLE column list on one line). None of these is real drift — Postgres applied them at `CREATE OR REPLACE FUNCTION` time.

### Step 3: Prior agent's evidence reproduced

The prior agent's own captured live defs (`fsi-app/scripts/tmp/071-live-defs.json`) contain `summary text` in column 4 of all three routing RPCs. The same JSON file is the source of "live has summary" — so the second half of the claim is correct. What is wrong is the assertion that `070_old.sql` omits it. Direct read of `070_old.sql`:

```
$ grep -n "summary" scripts/tmp/070_old.sql
39:-- populated from summary like the slim variant retains it.
59:  summary                  TEXT,        -- get_research_items decl
89:    ii.summary,                          -- get_research_items SELECT
146:  summary                  TEXT,        -- get_market_intel_items decl
176:    ii.summary,                         -- get_market_intel_items SELECT
234:  summary                  TEXT,        -- get_operations_items decl
264:    ii.summary,                         -- get_operations_items SELECT
```

7 references, exactly mirroring the live definition.

## Root cause

**Case (c): neither (a) nor (b).** The prior agent's investigation report was wrong. There is no drift between live DB and PR #100. Most likely the prior agent confused this with commit `0c8f0d3 fix(064): retain summary column in dashboard RPC`, which IS a real instance of the "missing summary" defect, but on migration 064 (dashboard RPC), not 070 (routing RPCs).

Evidence against (a) "live got hotfixed after 070 applied":
- `git log --all --since="2026-05-09" -- 'fsi-app/supabase/migrations/070*'` returns only one commit: `651ae78` (the original migration).
- No reflog entries for routing changes.
- Live def matches branch file modulo Postgres canonical rendering.

Evidence against (b) "backup captured incomplete":
- Backup file contains `summary` in all expected positions.
- Backup file is byte-identical to branch file (`diff` returns nothing).

## Resolution

**No commit made to PR #100.** The branch file already matches the live DB. Modifying it would either (i) re-apply the same content, producing an empty commit, or (ii) introduce the canonical-rendered form of the function which is strictly less readable than the operator-authored form (uppercase types, aligned columns, indented RETURNS TABLE). The operator-authored form is the source of truth on disk; Postgres' rendered form is the source of truth in the database. Both encode the same function.

PR #100 is correct as-is for migration 070.

## Workflow recommendation

Migration 068 IS a real instance of the missing-file defect: commit `70bb558` originally tracked `fsi-app/supabase/migrations/068_workspace_intelligence_aggregates.sql`, but the file is no longer in `master` or `feat/phase1-routing-restructure`'s tree; it exists only as an untracked file in the operator's working directory. That is a real gap to close.

For 070-class concerns (file vs live drift, where neither is missing), the open question is: how do we *automatically* know when a file and a live function definition diverge semantically (not just textually, since `pg_get_functiondef` always reformats)?

Recommendation: **hybrid — apply-time fingerprinting + lint rule, no in-DB-only changes by convention.**

1. **Fingerprinting (technical).** Extend `apply-pending.mjs` to compute SHA256 of each migration file's content and store it in `schema_migrations` alongside the version. Add a `verify-drift.mjs` script that re-parses each `CREATE OR REPLACE FUNCTION` block from each applied migration, runs it through the same Postgres canonical-form rendering (or compares via a SQL-level `pg_get_functiondef` query), and reports semantic drift. Run in CI on every PR that touches `supabase/migrations/`. This catches the real drift case (live got changed without a file update).

2. **No in-DB-only changes (process).** Operator discipline backed by the CI check above: if `verify-drift.mjs` flags a function whose canonical form differs from any migration file's canonical form, the PR fails. This makes the "I edited it in the Supabase studio and forgot to write a migration" path detectable rather than relying on convention.

Why hybrid: pure fingerprinting catches file-vs-DB drift but not whether *all* in-DB changes routed through a file. Pure convention catches the routing question but can't catch silent drift. The pair closes both gaps and reuses the same Postgres canonical-form normalizer this investigation just authored.

## Artifacts

- `fsi-app/scripts/tmp/072-dump-routing-defs.mjs` — live def dumper
- `fsi-app/scripts/tmp/072-live-get_research_items.sql` — live `get_research_items` def
- `fsi-app/scripts/tmp/072-live-get_market_intel_items.sql` — live `get_market_intel_items` def
- `fsi-app/scripts/tmp/072-live-get_operations_items.sql` — live `get_operations_items` def
- `fsi-app/scripts/tmp/072-live-routing.json` — combined live def JSON
- `fsi-app/scripts/tmp/072-normalize-and-diff.mjs` — semantic equivalence checker
- `fsi-app/scripts/tmp/072-diff-report.json` — normalized diff output
- `fsi-app/scripts/tmp/branch_070.sql` — PR branch file extract for comparison

## Related

- [caros-ledge-supabase-schema-audit-2026-05-15](./caros-ledge-supabase-schema-audit-2026-05-15.md) — Both audit live Supabase RPC/function definitions (get_*_items routing RPCs) against the on-disk schema
- [migrations](../inventories/migrations.md) — The migration 068 missing-tracked-file gap this doc surfaces is a defect in the migrations inventory's file-vs-applied ledger
- [jurisdiction-normalization-audit-2026-05-11](./jurisdiction-normalization-audit-2026-05-11.md) — shares migration 068
