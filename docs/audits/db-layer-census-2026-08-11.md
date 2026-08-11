# Database-layer census — 2026-08-11

The last unswept layer. The wiring census of the same morning
(`wiring-census-2026-08-11.md` §D) named the database as the one surface no audit had ever covered:
"a dead SQL subgraph can hide orphans." This is that sweep, its findings, and the standing gate that
now holds them.

Everything below is measured, not inferred. Where a thing is uncertain it says so.

## Method

Read-only. `pg_catalog` + `pg_get_*def()` only — no application row was read, nothing was written, no
DDL was run, no network call was made, nothing was scheduled. Three passes:

1. **Catalog → repo.** Every object in the live `public` schema, checked against `git ls-files` for a
   code reference and against `fsi-app/supabase/migrations/**` for a defining `CREATE`/`ALTER`/`DROP`.
2. **Repo → catalog.** Every `.from("…")` and `.rpc("…")` literal in the tree, checked for an object
   that actually exists.
3. **Catalog → catalog.** Every function body, view definition and RLS policy expression, checked for
   `public.<relation>` references to relations that no longer exist. This is the pass nothing before it
   ran, and it is where the sharpest finding came from.

Reproduce the capture with `fsi-app/.discipline/governance/db-catalog-refresh.sql`.

**One methodological correction, recorded because it changed a conclusion.** Pass 1 was first run with
`docs/` excluded from the reference corpus, the same exclusion the code-side census uses. That produced
a false orphan: `capture_worker_fetch` looked dead because no repo *code* calls it. It is in fact the
sanctioned document-fetch path, invoked by hand from the fleet-charter runbooks. For database objects,
a human running SQL out of a runbook is a real invocation path, and prose is a legitimate wiring
surface. Docs were added back and the finding retracted before it was written down.

## What is there

| | count |
|---|---|
| tables | 88 |
| views | 2 |
| functions (non-extension) | 91 — 71 callable, 20 trigger functions |
| triggers | 30 |
| RLS policies | 179 |
| indexes | 339 |
| **pg_cron scheduled jobs** | **0** (live-verified: `cron.job` is empty) |

Installed extensions: ltree, **pg_cron**, **pg_net**, pg_stat_statements, pg_trgm, pgcrypto, pgjwt,
pgsodium, plpgsql, supabase_vault, uuid-ossp.

Every one of the 20 trigger functions has at least one trigger attached. There are no orphan trigger
functions, and no trigger points at a missing function. That half of the layer is clean.

## Finding 1 — 22 of 181 objects exist in production with no committed migration

Two tables and twenty functions are created by no migration in the repo. They exist only in the live
database.

This class already had a name: the 2026-07-19 structure audit called it **out-of-repo DDL** and flagged
a single instance (`hold_resolution_queue`) for a ruling. Nobody ever counted it, so it kept growing,
and it is the direct cause of both defects below. The mechanism is simple and worth stating plainly:
**the migration tree is the only surface a reviewer, a diff, or a gate can inspect.** DDL that lives
only in the database is doctrine nobody can read and duplication nobody can detect.

Now gated by **F24 (`db-object-migration-home`)** with a reason-bearing entry per object. Every one of
the 22 says why it has no migration and what phase retires it.

## Finding 2 — a four-function API left callable after its table was dropped

`hrq_enqueue`, `hrq_escalate`, `hrq_exit`, `hrq_record_attempt` all read and write
`public.hold_resolution_queue`. That table was **dropped by migration 219**, applied 2026-07-19, as a
deliberate and well-evidenced cleanup (superseded by `drain_worklist`; 32 of 39 rows already present
there, 6 verified, 1 gone, 0 needing migration).

The table went. The four functions stayed. Each is still grantable, still callable, and throws on a
missing relation the moment it runs. `CONFIRMED` — 0 relations matching `hrq%` exist, and
`hold_resolution_queue` is absent from the catalog.

Why no review caught it: the reviewer reads migration 219, sees a clean content-gated `DROP TABLE`,
and **cannot see the callers, because the callers are not in the repo.** This is what finding 1 costs
in practice.

## Finding 3 — Gate A is implemented twice, and the second copy is invisible

Fifteen `gate_a_*` SQL functions (`gate_a_scan`, `gate_a_scan_and_store`, `gate_a_norm`,
`gate_a_ws_class`, `gate_a_extract_tokens`, `gate_a_deadline_tokens`, `gate_a_figure_tokens`,
`gate_a_contains_token`, `gate_a_collapse_pct`, `gate_a_is_citation_line`, `gate_a_obligation_near`,
`gate_a_derived_covered`, and the health trio) re-implement the prose-fact grounding scan that
`fsi-app/src/lib/agent/gate-a-scan.mjs` already implements in TypeScript.

- Both carry the version literal **`2026-07-30.1`**. They agree today. Nothing enforces that they
  agree tomorrow — it is a hand-copy across two languages, one of which is not in the repo.
- The SQL copy writes `item_gate_a_state`. So does `canonical-pipeline.ts`, **directly**, and that is
  the path that actually runs (984 rows, newest 2026-08-09, matching the newest `intelligence_items`
  update).
- Nothing calls the SQL copy. `gate_a_scan_and_store` and `gate_a_extract_tokens` — the two entry
  points — have zero callers in code, docs, migrations, other database objects, or pg_cron.

This is the **shadow-capability** class the remediation-discipline skill already forbids in words:
*when the real mechanism is wired, the inferior duplicate folds into it or dies, never both left
standing.* Both were left standing for exactly one reason: one of them was not in the repo to be read.

Proposed for deletion as one unit. Deleting them is not a behaviour change — the live path is
TypeScript. The 430-row `gate_a_route_b_baseline` table, referenced by **nothing anywhere** (no code,
no migration, no doc, no other database object), goes with it, subject to an operator ruling on whether
the 430 rows are a record worth keeping.

## Finding 4 — two capabilities that sit outside every repo-side gate

`pg_net` and `pg_cron` are installed. The database can therefore make outbound HTTP calls and schedule
its own work, neither of which any repo-side gate can see — not F15 (spend chokepoint), not F16
(transport hold), not the fitness runner.

Today this is a capability, not an incident, and both halves are live-verified:

- **`cron.job` is empty.** Nothing is scheduled inside the database.
- **One function uses `pg_net`:** `capture_worker_fetch`, which `SECURITY DEFINER`-posts to the
  project's own `capture-worker` edge function. It has zero automated invokers; the runbooks call it by
  hand and name it as the *no-metered-spend* capture path.

Two things about it still need an operator decision, and neither is urgent:

1. It carries a **hardcoded anon-role JWT literal in the function body**. The anon key is public by
   design, so this is not a secret leak — but a credential literal inside a `SECURITY DEFINER` body
   means a key rotation breaks the function silently, and it is invisible to any repo-side secret scan.
2. Database-originated egress is ungoverned in principle. Nothing prevents a future function from
   calling `net.http_post` to anywhere.

Recorded as an open item. Not fixed here: fixing it means either a migration home plus a vault
reference, or a policy that database-side egress must route through one audited wrapper — both are
operator calls, not hygiene.

## Findings retracted after checking — three things that looked broken and are not

Written down because the checking is the point. Each of these would have been a false alarm in the
report if the census had stopped at "no caller found".

| looked like | actually |
|---|---|
| `gate_a_health_refresh` has no caller, and `gate_a_health()` returns an error right now (`cache stale since 2026-08-10 09:20`, 23h23m at time of measurement) | **Deliberate.** Its pg_cron job was unscheduled 2026-08-10 by operator ruling ("health checks on an unfinished system are noise, halt until needed"). The 30-minute staleness gate exists precisely so the dormancy shows as an explicit error rather than silently stale numbers. Re-arm with `SELECT public.gate_a_health_refresh();`. Recorded in `runtime-clock-inventory-2026-08-10.md`. |
| `capture_worker_fetch` has no caller | **Runbook-invoked** (see the methodological correction above). |
| `src/lib/d3/hooks.mjs` writes to `d3_runs`, which does not exist | **Handled by design.** The code skips-with-log on a missing table and `hooks.selftest.mjs` proves it. Defined-not-applied, on purpose. |

## Dormant and dead data, named not swept

Left as operator decisions — none of it is breaking anything today.

| object | rows | state |
|---|---|---|
| `gate_a_route_b_baseline` | 430 | Referenced by nothing anywhere. Out-of-repo DDL. Proposed for deletion. |
| `drain_worklist` | 66 | Referenced **only** by scripts on the dead-code manifest. Goes fully orphan the moment the sweep lands — it is a real hold-tracking record, so it needs a ruling, not a reflex. |
| `taxonomy_nodes` | 38 | Migration-defined, zero live code readers. Pre-adoption. |
| `case_studies` + `case_study_endorsements` | 6 / 0 | Reachable only through their own count trigger. A community feature that was built and never wired to a surface. |
| `notification_subscriptions` | 0 | Empty, migration-defined, no live reader. Part of a notification family whose other tables are live. |
| `next_uncensused_portal_candidates` | — | Portal-census pagination RPC, zero callers anywhere. Dormant capability, not breakage: adopt or drop. |

## What now holds this layer

**F24 — `db-object-migration-home`**, registered as invariant **RD-53**, proven by
`F24-db-object-migration-home.test.mjs` (16 behavioural tests against constructed catalogs, not against
the live tree).

It holds a committed catalog snapshot (`governance/db-catalog.json`) against the migration tree using
**filesystem reads only** — no credential, no network, no schedule, no model call. It fails when:

- an object in the snapshot has no defining migration and no reason-bearing entry;
- an allowlist entry's object has *since gained* a migration (stale entry, delete it);
- an allowlist entry names an object no longer in the snapshot (stale entry, delete it);
- the snapshot records a broken DB-internal reference nobody has explained;
- any entry is missing its `reason` or `reviewByPhase`.

The allowlist is the ceiling and it shrinks by construction. There is no number to nudge upward.

The credentialed step is **refreshing** the snapshot, never checking it. That is deliberate: the
always-on lanes hold no database secret, because a gate that needs a secret cannot run on a fork PR and
stops running silently the day the secret expires.

## Residuals — named, not implied away

1. **Snapshot staleness is a real hole and F24 does not close it.** DDL applied out-of-repo *after* the
   last refresh is invisible until someone re-runs the refresh. F24 makes out-of-repo DDL impossible to
   keep **silently**; it does not make it impossible to create. Live detection requires a credentialed
   lane — a separate decision with a separate cost, deliberately not taken here.
2. **Database-side egress and scheduling are ungoverned in principle** (finding 4). Zero active today,
   live-verified; the capability stands.
3. **Column-level and row-level dead space were not censused.** This pass covers objects, not columns.
   A never-written column on a live table would not appear here.
4. **RLS policies were read as a reference surface, not audited as policies.** Whether the 179 policies
   are individually correct is a security review, not a wiring census, and was not attempted.
