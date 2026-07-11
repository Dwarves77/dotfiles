# Correction Plan — Full-System Audit (2026-07-11)

**Lens (operator ruling, 2026-07-11): the hold is deliberate — build-first.** Freshness/intake gaps ride
the flip (Jason's switch) and are NOT in this plan. This plan makes the build RIGHT before ongoing
updates: seal the customer surface, make every credential path honest, fix the generation contract so
future briefs pass the gate by construction, clear the adoption blockers, erase the dead weight, and
wire the invariants that would have caught this audit's classes automatically.

Findings-before-fixes was honored: nothing below has been executed. Each item: mechanism · effort
(hrs/day/dispatch) · dependency. Sequencing: **A and B start immediately (parallel); C before any
generation resumes; D before the second org; E rolling behind A–D.** Spend appears ONLY in C-7 and is
quoted, not authorized.

## Track A — Seal the customer surface (pure code, zero-spend, ~2 days)

| # | Fix | Mechanism | Effort |
|---|---|---|---|
| A1 | Verified-gate on related rails | Add `provenance_status='verified'` to research/[slug] + operations/[slug] + regulations resourceLookup service-role selects; lane-wire `surface-visibility-audit`; add X.5 #4 grep-fitness | hrs |
| A2 | Seed-on-timeout leak | fetchDashboardData fallback → empty+`_error` (SF-2 pattern, siblings already do it); delete the seed tuple import | hrs |
| A3 | /api/agent/run gate | requirePlatformAdmin + rate limiter; fix CLAUDE.md cooldown claims | hrs |
| A4 | Stale sync contract | regenerate-brief + integrity-regenerate handle the 202 `{runId}` contract; kill dead `bypassPause`; fix auto-resolve to poll-or-defer (also clears the F-04 error-swallow-with-write) | day |
| A5 | /account 404 links (×2), CoverageMatrix "discover" dead affordance, stale "C4" copy | Point links at /profile; wire or remove the discover action; copy fix | hrs |
| A6 | Open redirects | Same-origin allowlist on `next`/`redirect` in auth callback + login | hrs |
| A7 | /privacy public + not-found.tsx | Add to PUBLIC_ROUTES; add app/not-found.tsx | hrs |
| A8 | NULL-brief verified items (5) | Add brief-presence criterion to `validate_item_provenance` (ships with corpus revalidation per RD-5 — rides the Track-B DDL window); the 5 quarantine honestly w/ deferrals or regenerate in C-7 | hrs + window |

## Track B — Tenancy & credential integrity (ONE operator DDL window, batched)

All RLS/policy work is break-risky class (ADR-011) → batch it into a single reviewed window with proof
per item. Prepare all migrations now (author-only), apply together.

| # | Fix | Mechanism | Effort |
|---|---|---|---|
| B1 | Org gate on get_market_intel_items | Migration: re-add `_assert_org_membership(p_org_id)` + `, id ASC`; post-apply pg_proc probe; wire X.5 #3 invariant | hrs |
| B2 | profiles policies | Self INSERT/UPDATE policies; SELECT qual tightened (self + same-org; PII off anon); post-apply proof = the UserProfilePage/Onboarding write round-trips | hrs |
| B3 | Provisional queue restore | EITHER admin-scoped SELECT policy OR (cheaper, no DDL) switch fetchProvisionalSources + the F-15 anon-read cluster to the service client; ALWAYS capture `error` (do the code half regardless) | hrs |
| B4 | reviewer_notes phantom column | Migration adds the column (approve flow already writes it); idempotency guard in approve; disposition the one stuck approved-unmaterialized row | hrs |
| B5 | Aux-table anon leaks | Parent-gate quals on item_timelines / item_cross_references / item_disputes / item_supersessions / item_changelog (EXISTS verified-parent) | hrs |
| B6 | Reconciler RLS repair (carried from 2026-07-11 dispatch) | SELECT policies on validator inputs + root-cause the WITH CHECK refusal; re-validate reconcile-revalidate.mjs end-to-end | day |
| B7 | mig-099 decision | Apply it (restores dismiss affordance + tier-opinion policies) or archive it and delete the dismiss UI — pick one, stop the limbo | hrs |
| B8 | Ledger repair | Batch-insert the 15 unledgered versions (107–134) mirroring the 136–157 repair; register the 4 pre_phase5 tables in a migration (or schedule their drop in E); document the 7 out-of-band policies | hrs |
| B9 | Records truth | Migrations inventory + CODE-5b F10 + project memory corrected: **mig-158 APPLIED+LEDGERED** (blast radius already discharged 2026-07-11); 101/149/152/153/157 stale headers fixed | hrs |

## Track C — Pipeline contract BEFORE the tap opens (the build-first core)

| # | Fix | Mechanism | Effort |
|---|---|---|---|
| C1 | Slot enforcement in synthesis | `synthesiseAndWriteBrief` (canonical-pipeline.ts:569-688) reads `item_type_required_slots` and injects per-type slot requirements into the prompt (all 12 types, not just reg-family) | day |
| C2 | Label contract 3-home unify | Drop the 4th label ("Per the workspace's reading") from system-prompt + ledger prompt, or add it to validator/kept-filter/4c — ONE vocabulary; add the 3-home drift test (url-canon.test pattern) | hrs |
| C3 | Theme vocab unify | Parser vocab = DB CHECK vocab (metadata-vocab.ts as SoT); themes start persisting | hrs |
| C4 | Mint fail-closed | Idempotency probes + thinning guard throw on read error instead of minting/thinning through it | hrs |
| C5 | Hold airtight + cache wired | `assertFetchAllowed` in direct-HTTP/API/RSS/api-fetch transports; widen F16; inject the built fetch-cache into buildLiveTransports (stops double-paying at flip time) | day |
| C6 | Generation-side hygiene | W2.F writes base_tier + real domains; eraseStep clears harvested timelines + stops clobbering unrelated flags; discovery/recommend-source-tier route through the ledger (or F15-allowlist with tickets) | day |
| C7 | **Zero-fetch corpus recovery (PAID — go-line required)** | AFTER C1–C4: resynth the 45 pool-COVERED items through lane4 --mode=resynth (now passing labels+slots by construction). QUOTE: 45 × ~$0.35 ≈ **$16 ± 5** (over the $5 line). The 8 PARTIAL: case-by-case after the 45 prove the fix. The 9 NOT-COVERED: stay deferred to batch-1 (incl. archiving the GRI cookie-policy artifact). Also merges: PPWR both-verified twin pair FIRST, then the 6 cross-format identifier pairs + 8 registry URL dups + 5-way EcoVadis (guarded merges, zero-spend) | dispatch |
| C8 | Identifier canonicalization | CELEX-derived canonical key + normalizing trigger + uniqueness lane audit (X.5 #6); backfill the 3 remaining derivable | day |

## Track D — Community pre-adoption bundle (BEFORE the second org)

| # | Fix | Mechanism | Effort |
|---|---|---|---|
| D1 | profiles writes (B2) | — the same fix; Community + onboarding both unblock | (B2) |
| D2 | Counter integrity | Count-maintenance triggers → SECURITY DEFINER (or nightly recount job); weekly_post_count gets a writer or leaves the UI | hrs |
| D3 | Ban re-join block | Membership insert checks org_member_bans | hrs |
| D4 | Invitations | Email delivery (currently copy-URL only) + stale copy fix (A5) | day |
| D5 | Forum layer + case studies ruling | OPERATOR: drop the seeded-never-used forum layer (17 sections) or schedule its build; reset the 4 unearned `peer_validated` labels | ruling + hrs |

## Track E — Dead-weight erase + records truth (rolling; erase-migration discipline)

| # | Scope | Mechanism |
|---|---|---|
| E1 | 38 unmounted components (~10K lines) + domains/* trio + dead src modules + TabBar/types/seed chains | Delete via reviewed PR waves (the trio FIRST — fabrication risk); CLAUDE.md Key Files corrected (source-mapping gone, **browserless.ts is LIVE not retired**) |
| E2 | Vendor family (4 tables + triggers + type residue) | Drop migration (operator window; removed-from-scope ruling already exists) |
| E3 | user_profiles mirror retirement | Re-point the 3 policy arms to profiles.is_platform_admin → drop table + mirror triggers (window) |
| E4 | notification v1 trio, bulk_imports, ingestion_state+control_log, 2 orphan RPCs, 5 zero-consumer views, ~30 dead columns | Phase-7-style disposition list: keep-with-named-future / drop; each gets a one-line ruling, then erase migrations |
| E5 | q7-daily-recompute + L3 fixture | Delete the superseded cron script (writes legacy `tier`!) + fix the fixture asserting a vercel.json cron that doesn't exist |
| E6 | Interlock + snapshots ruling | Extend the interlock convention to the ~40 executed one-shots + `--live` flag on the 3 bare-invocation lib tests; OPERATOR: track (commit) the 1,211 ignored non-regenerable reversal snapshots or move them off-repo |
| E7 | Stale docs | 4 discipline READMEs, ingest docs, "2,325 summaries" → live counts per doctrine (docs reference queries, not values) |

## Governance riders (make this audit's classes self-catching)

1. **RLS-credential parity invariant** (X.5 #1) — nightly lane audits the (table, op, credential) map vs pg_policies; CODE-3's select-map is 80% of the input. Would have caught P1 #2, #3 automatically.
2. **Column-existence parity** (X.5 #2) — `supabase gen types` + tsc gate. Would have caught reviewer_notes + dismissed_*.
3. **Consistency layer CI backstop** — run consistency/runner.mjs in a workflow; fix rule-014's vacuous CI leg; resolve rule-016 vs F15 drift (add the 3 files to 016 PERMITTED or migrate them now).
4. **Skill-map additions** — mint-item.ts, spend-client.ts, fetch-hold/canonical-fetch, generation-config.ts become governed files.
5. **Deferral flag-side expiry audit** + integrity-flag hygiene sweep (47 expired-open + 62 deleted-subject flags resolved as superseded).
6. Register the 4 lane audits missing invariants.mjs entries (meta-gate blind spot).

## What is deliberately NOT in this plan

Loop/cadence flip · batch-1 re-fetch (the 9 NOT-COVERED + PORTAL-SOURCE re-points ride it) · monthly
budget ratification · triage-queue throughput (operator-owned) · Research repositioning (operator
decision — but make it: the surface can't finish either way until it's made) · community peer
acquisition. All ride Jason's switches, per the standing doctrine that they are switches, not tasks.

## Suggested execution shape

Wave-α (now, parallel): A1–A8 + C1–C6 as one remediation dispatch (pure code + tests, zero spend);
B1–B9 authored in the same dispatch, applied in ONE operator DDL window.
Wave-β (after α green): C7 go-line ($16±5 quote) + C8; D2–D5.
Wave-γ (rolling): E1–E7 + governance riders 1–6.
Exit test for "build right": data-audit lane GREEN + the 6 new/widened invariants GREEN + zero P1/P2
open in this register + INTENT verdicts re-graded ≥ DELIVERS-on-build-axes for all five surfaces
(content axes re-grade at flip).
