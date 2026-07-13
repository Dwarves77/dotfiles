---
id: ADR-011
title: DDL apply authority — delegated for additive/low-risk classes, operator-window for break-risky classes
status: accepted
date: 2026-07-08
scope: fsi-app database change management (Supabase prod, project kwrsbpiseruzbfwjpvsp)
supersedes: the blanket "migrations are committed files until the operator's apply window" posture (dispatch constraint, 2026-07-07)
related: ADR-009, docs/inventories/migrations.md, .discipline C3 consistency gate
---

# ADR-011 — DDL apply authority

## Decision (operator ruling, dispatch 2026-07-08, transmitted-as-written)

Claude Code MAY apply **ADDITIVE / read-derive / low-risk** migrations directly to prod. Three
conditions are BINDING per apply:

1. **Identity confirmation recorded in the ledger row** — `supabase_migrations.schema_migrations.statements`
   carries an `apply-record:` line naming the method (e.g. claude.ai Supabase MCP `execute_sql`),
   the project ref (`kwrsbpiseruzbfwjpvsp`), and how identity was confirmed (org/project listing +
   env-URL host match). The ledger INSERT rides the same transaction as the DDL.
2. **Read-back smoke tests per apply** — object-existence read-backs plus a behavioral probe where
   the change has behavior; recorded in the migrations inventory row.
3. **BREAK-RISKY classes remain the operator's explicit window**: RLS/policy changes, drops,
   customer-read-path changes, and the 56-fn search_path batch (migration 160). These are authored
   + committed only; the apply decision travels WITH the blast-radius figures.

### Amendment (2026-07-08, later same-day dispatch) — the DELEGATED-WITH-PROOF tier

A break-risky migration MAY be applied by the agent when the operator names it **delegated-with-proof**
in a dispatch. That is a per-migration reclassification, not a change to the default (the classes in
condition 3 stay operator-window unless individually delegated). The bar is higher than the additive
path: a **before/after proof** exercising the actual blast-radius surface (for 160: the customer
read-path RPCs via a simulated authed member, plus the advisor lint delta) must pass, with rollback
readied; a regression rolls back and surfaces instead of recording. Migration 160 was applied under
this tier on 2026-07-08 — the first and (so far) only use. See its ledger row 160 and header for the
proof.

## Context

The 2026-07-07 "nothing is on me" delegation moved applies/merges to the agent; migrations
157/158/159/161/162 were applied under it with per-apply verification but the identity record
lived only in docs. The 2026-07-08 dispatch ratified the practice and hardened it: the identity
record now lives IN the ledger row (retro-recorded for 157–162), and the break-risky boundary is
named as a class list rather than case-by-case.

## Consequences

- Additive schema (new tables/columns/indexes/functions with pinned search_path) ships at the
  speed of the work, with an auditable apply trail inside the database itself.
- Migration 160 (search_path pin on the 56 app-owned functions — ALTER FUNCTION configuration
  change, break-risky by the ruling's named class) was APPLIED 2026-07-08 under the delegated-with-proof
  amendment above. Proof passed: app-owned unpinned functions 56→0; customer read path unchanged
  (listings/active_items 251→251, market 78→78, research 43→43); non-gated FTS + provenance gate +
  intersections unchanged; advisor `function_search_path_mutable` 168→0. Reversible per function
  (`ALTER FUNCTION … RESET search_path`). Ledger row 160 carries the identity apply-record.
- A future architecture split (separate dev/prod projects) re-opens this ADR per the
  Migration-File-Discipline rule.

## Related

- [ADR-009-adr-system-architecture](./ADR-009-adr-system-architecture.md) — the ADR storage/frontmatter convention this decision follows
- [migrations](../inventories/migrations.md) — the migrations inventory where each apply's read-back smoke tests and identity apply-record are recorded
- [ADR-012-intake-cadence-and-launch-exit-test](./ADR-012-intake-cadence-and-launch-exit-test.md) — successor decision that builds on this delegation posture
