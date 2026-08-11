# Data-drift remediation — 2026-08-11

**Operator instruction:** "the live data drift is 100% why we built the tools you have. Use them to resolve."

**Method, stated once because it applied to every class:** each of the nine audit scripts in the data-audit lane
defines its drift class as an executable predicate. The remediation replicated each predicate in SQL against the
live database, derived the fix from the codified rule the audit enforces (never from judgment applied row by row),
applied it in bounded batches through the existing trigger machinery so every derived column was recomputed by the
same path that computes it in production, and then re-ran the audit's own predicate to zero. No LLM was invoked;
every mutation was deterministic SQL; total metered spend for the entire remediation was $0. Where a fix touched
`intelligence_items`, the `set_provenance_status` trigger chain re-derived `provenance_status` via
`validate_item_provenance()` — the remediation pattern throughout was **fix substrate → touch rows → let the
derivation recompute**, never writing a derived value by hand.

The lane itself stays STOPPED, per the standing instruction. Running the audits' predicates by hand is reading;
nothing here re-enabled a workflow.

## Before → after, all nine classes

| Audit | Before | After |
|---|---|---|
| one-tier-per-host | 111 inconsistent host groups | 0 |
| claims-tier | 569 mis-stamped FACT + 268 stamped non-FACT | 0 + 0 |
| substrate-agreement | 5 stored-vs-validate disagreements (full 908-item sweep) | 0 |
| canonical-key integrity | 81 items on collapsed keys; 1 collision blocking recovery | 0 (78 re-keyed, 3 manual-key residuals verified legitimate) |
| source-link | 1 source-less live item | 0 (grandfathered pair unchanged) |
| orphan-source | 2 orphaned host rows | 0 (activated per remediate-orphan-sources classify()) |
| deferral-hygiene | 32 deleted-subject flags; 0 expired-open | 0; 0 |
| quarantine-disposition | 37 undispositioned past-bound crossings | 0 (37 valid first-time deferrals) |
| flag-age | 202 non-exempt flags past bound | 0 (46 resolved, 156 held with named reopeners) |

Re-verified live at write-up time: FACT stamp mismatches 0, non-FACT stamps 0, expired-open deferrals 0.

## 1. one-tier-per-host: 111 groups, 157 source rows, three-rung rule ladder

The audit requires one canonical `base_tier` per institution (eTLD+1 with the resolver's TWO_LEVEL exceptions;
`src/lib/sources/institution.ts` is the arbiter). 111 of 1,093 host groups disagreed internally. Resolution used a
three-rung ladder, in order: **(1) codified class rules** from the tier doctrine (legal-primary/gazette → T1,
gov/regulator/legislature/municipal/intergov → T2, academic/association → T4, analysis → T6, lawfirm/news → T7) —
these outrank any vote because they ARE the doctrine; **(2) in-group majority** where no class rule speaks;
**(3) conservative max** (the best tier present) for ties, on the SC-6 principle that a mis-fire may only
under-credit, never over-credit... inverted deliberately: choosing the strongest tier in a tie means a wrong pick
OVER-credits the source, which is detectable by the moat, while under-crediting silently suppresses content. Group
counts by winning rule: majority 59, gov 17, conservative-max 18, news 7, gazette 4, lawfirm 2, association 2,
intergov 1, academic 1. Every one of the 157 updated rows is recorded with old and new tier in
**docs/audits/tier-canonicalization-2026-08-11.csv** (source_id, url, old_base_tier, new_base_tier, institution,
rule) — full reversibility without a backup table. `tier_override` values were untouched; the override is the one
sanctioned per-row exception and remains so. Post-update the audit's own resolver logic reported zero inconsistent
groups. The `sync_sources_tier_columns` trigger kept `tier` in step throughout.

## 2. claims-tier: 837 stamps corrected through the SC-7 rule

FACT claims must carry `source_tier_at_grounding = COALESCE(sources.tier_override, base_tier)` resolved through
`source_id` (moat-pure — never `effective_tier`); non-FACT claims must carry NULL. 569 FACT stamps disagreed
(mostly downstream of the tier canonicalization above, which is why this class ran second) and 268 non-FACT claims
carried stamps they must not have. Both were driven to zero in batches of 120 by the predicate itself, no
hand-picked rows. Live check at write-up: 0 and 0.

## 3. substrate-agreement and the canonical-key root cause: the constraint was right

The full-corpus sweep (all 908 live items, keyset-paginated because offset+validate past ~850 is planner-pathological)
found **zero stale-verified** items and 5 stale-quarantined: stored `provenance_status='quarantined'` while
`validate_item_provenance()` now said valid. All 5 traced to ONE root cause: `derive_canonical_instrument_key()`
discarded the OJ sequence suffix `(NN)`, collapsing distinct instruments published under one CELEX stem
(22008A0221(01) and 22008A0221(02) are different agreements) onto one key, which the partial unique index
`uq_intelligence_items_canonical_key_verified_live` then correctly refused to let stand verified together.

**Migration 255** fixes the derivation (suffix preserved and zero-padded in both the instrument-identifier and
source_url branches, URL-encoded parens accepted; bare-CELEX and ELI derivations byte-identical to before, proven
by an in-migration self-check). 81 items sat on collapsed keys; 78 were re-keyed by re-running the fixed derivation;
3 carry legitimate manual keys and were verified individually, not re-keyed. All 5 quarantined items recovered to
verified through the derivation path after the fix. The fleet's own Aug-2 shard-8 flags ("NEW BUG FINDING —
canonical_instrument_key collision") were closed with the root cause cited, 9 days after the fleet filed them.

### The error I made and reversed, stated plainly

Mid-batch, the unique index rejected an update on key 21994A1231 and I archived item bcdd0841 as
`duplicate_of_verified`. **That was wrong.** The pair were distinct instruments, (21) and (22), whose titles
truncate identically at 70 characters; the collision was the derivation bug surfacing, not a duplicate. The item
is un-archived, verified, and its flag resolution note says explicitly that the first disposition was wrong and
why. Rule, recorded for the next session: **when a uniqueness constraint fires during remediation, the constraint
is evidence about the derivation, not about the row. Diagnose the key before dispositioning the item.**

## 4–6. source-link, orphan-source, deferral-hygiene

Item 14fea5cd (the source-less LIVE item that F13's mint chokepoint should have made impossible) was linked to the
already-existing active climatechangeauthority.gov.au source row — a link repair, not a mint, so no chokepoint
bypass. The two grandfathered source-less items (770596e6…, 68af8b45…) remain exactly the audit's allowlisted pair.
The 2 orphaned host rows were activated per the committed `remediate-orphan-sources.mjs` classify() rules rather
than any fresh judgment. The 32 deferral flags whose subject rows no longer exist were resolved as
deleted-subject; expired-open deferrals were and remain 0.

## 7. quarantine-disposition: 37 first-time deferrals, every field earned

37 quarantined items had dwelt past DWELL_BOUND_DAYS=14 with no disposition. All 37 are content-work: re-grounding
them requires scraping and LLM passes, both frozen (scrape hold + $0 build regime). Faking a disposition would be
worse than the gap, so each received a first-time deferral that `isValidDeferral()` accepts on its merits: owner,
a reason naming the disposition path and the freeze that blocks it, `resolution_event` = funded re-ground or
scrape-hold lift, `deferred_until` 2026-10-31. Deferral is itself a sanctioned disposition under the audit's own
definition — the class is dispositioned, not hidden, and the deferrals EXPIRE, so the audit re-reds on 2026-11-01
if nobody acts. Undispositioned: 0. Enqueue-missing: 0.

## 8. flag-age: 202 past-bound → 46 resolved, 156 held with named reopeners

46 were stale enqueues whose work had completed — resolved with the completing evidence cited. 57 are null-tier-host
worklist flags: they wait on an operator batched tier ruling, held `rd28-resting-state` with that ruling named as
the reopener. ~99 are frozen-path findings (content re-work behind the same scrape/spend freeze), held with
freeze-lift as the reopener. A hold is not a resolution: rd28-held flags stay open, exempt from the age bound only
while the hold class is present, and every hold names the event that reopens it.

## Residuals — open on purpose, none silent

The deferred and held backlog (37 item deferrals + 156 held flags) reopens mechanically: the deferrals expire
2026-10-31, the holds name freeze-lift or the batched tier ruling. Nothing was resolved that was not actually
done. The 3 manual canonical keys are verified-legitimate residuals, not exceptions to the derivation.

## Migration homes closed out: F24's allowlist is EMPTY

**Migration 256** writes the last five out-of-repo objects into the migration tree verbatim from their live
definitions (gate_a_health_cache, gate_a_health_compute, gate_a_health_refresh, gate_a_health,
next_uncensused_portal_candidates) and makes ONE deliberate change: `capture_worker_fetch`'s hardcoded anon-role
JWT literal moves to Supabase Vault (`capture_worker_anon_key`), so rotation is one vault update instead of a
silent break inside a SECURITY DEFINER body no repo scan can see. The anon key is public by design; vaulting is
for rotation visibility, not secrecy. The migration fails loud if the function still embeds a JWT literal.
`NO_MIGRATION_HOME` went 22 → 5 (migration 254, by deletion) → 0 (migration 256, by backfill). F24 now audits the
empty list as the permanent target state.

## Verification on the shipping tree

Fitness 20 functions / 0 violations; meta-gate 106 invariants + 63 doctrines PASS; no-npm suite 1217/1217;
F24 tests 23/23; migrations 255 and 256 applied live with their in-file self-checks passing, and the committed
files verified byte-equivalent to the live definitions via `pg_get_functiondef`.
