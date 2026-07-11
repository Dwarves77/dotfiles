# Wave-α Correction — Closeout & Traceability Matrix (2026-07-11)

Dispatch: FULL-SYSTEM CORRECTION, COMPLETE, ZERO OPERATOR GATES + WAVE-BETA R0 rider.
Integration branch: `fix/wave-alpha-2026-07-11` (from audit tip `42a4479`; master baseline `71bcbd4`).
Companion evidence: [`ddl-application-evidence.md`](ddl-application-evidence.md) · [`c7-outcome.md`](c7-outcome.md) ·
[`deletions-log.md`](deletions-log.md) · [`baseline.md`](baseline.md) · `../backup-posture.md`.

Constraints held throughout: loop OFF · cadence off · SCRAPE_HOLD LIVE (made airtight, C5) · zero fetches ·
zero mints · batch-1 worktree untouched · all deletes via eligibility gate + log · all spend ticketed.

## Headline
- **7 agent tracks** executed (B, A1, A2, A4, A5, R0.2, A3) + orchestrator DDL/merge/C7. All accepted with nonzero tool counts.
- **22 migrations applied to prod** under the DDL protocol (per-migration snapshot → apply → proof → committed rollback), baseline dump drill-proven FIRST.
- Combined tree GREEN: **tsc 0 · discipline suite 573/0 · fitness 12/0 · meta-gate 57/57 invariants wired · data-audit lane 8/8 hard PASS**.
- **Spend $6.68** (C7 only) of the **$32** dispatch ceiling; month **$50.01 / $75** code ceiling.
- Backups live + drill-proven (private repo); observability authored (activation deps listed).

## Traceability matrix — every dispatch register item

### Track B — Tenancy & credential integrity (DDL, applied first)
| Item | Status | Evidence |
|---|---|---|
| b1 org-gate on get_market_intel_items | ✅ APPLIED+PROVEN (mig 164) | assert present, LANGUAGE plpgsql, non-member→42501 |
| b2 profiles self-write + anon PII | ✅ APPLIED+PROVEN (mig 165) | anon denied on email/linkedin_sub/is_platform_admin; display_name/avatar OK |
| b3 provisional queue restore | ✅ APPLIED (mig 166) + code (fetchProvisionalSources→service client + error capture) | SELECT policy present |
| b4 reviewer_notes column + idempotency + stuck row | ✅ APPLIED (mig 167) + code + row reconciled | b631762e → pointer to ccee10a4 (dup-safe) |
| b5 aux-table parent gates | ✅ APPLIED+PROVEN (mig 168) | anon quarantined-parent rows 774→0 |
| b6 reconciler RLS repair | ✅ APPLIED+PROVEN (mig 169) | reconciler reads 3126/8686/48 (were 0); RLS-parity CLEAN (A3 audit) |
| b7 mig-099 ruling | ✅ APPLY (mig 099) | dismiss affordance restored; source_tier_opinions policies added |
| b8 ledger repair 15 versions | ✅ APPLIED+PROVEN (mig 170) | 107,108,109,110,111,112,115,118,128-134 ledgered |
| b9/A8 brief-presence criterion | ✅ APPLIED+PROVEN (mig 171) + RD-5 reval | 5 NULL-brief items quarantined w/ deferrals |

### Track A — Customer surface seal (code)
| Item | Status | Evidence |
|---|---|---|
| A1a verified-gate on related rails + class sweep | ✅ FIXED | +2 leaks swept (ask FTS, metadata route); 3 RPCs cleared as false-positive |
| A1b seed-on-timeout | ✅ FIXED | fallback→empty+_error; March demo rows date-gated |
| A1c /api/agent/run gate + sweep | ✅ FIXED | isPlatformAdmin + rate limit; spend-adjacent routes swept |
| A1d stale 202 + F-04 auto-resolve swallow + 3 siblings | ✅ FIXED | auto-resolve path removed; read-side swallow list → Track-E rider |
| A1e /account, redirect, /privacy, not-found, discover | ✅ FIXED | sanitizeReturnPath; PUBLIC_ROUTES; not-found.tsx |
| A1f NULL-brief honest state | ✅ FIXED | "brief not yet available" card |

### Track C — Pipeline contract (code) — C7 gate
| Item | Status | Evidence |
|---|---|---|
| C1 slot enforcement (12 types) | ✅ FIXED | requiredSlotsFor + buildSlotDirective + retry; PROVEN correct at C7 (6/8 satisfied slots) |
| C2 label vocab 1-home + ruling | ✅ FIXED | analysis-labels.mjs; ruling STOP-EMIT (validator tolerant of legacy) |
| C3 theme vocab unify | ✅ FIXED | metadata-vocab SoT; backfill authored (~2 derivable) |
| C4 mint fail-closed | ✅ FIXED | probe error → throw before INSERT |
| C5 hold airtight + cache | ✅ FIXED | all 4 transports gated; RD-16; fetch cache injected |
| C6 generation hygiene | ✅ FIXED | W2.F base_tier; eraseStep scoped; discovery/tier→ledger |
| $75 monthly ceiling | ✅ FIXED | guardMonthlyCeiling in spend-client; PROVEN live (enforced this dispatch) |

### Track D — Community pre-adoption
| Item | Status | Evidence |
|---|---|---|
| d1 counter integrity | ✅ APPLIED (mig 190) + recount | 3 fns→DEFINER; weekly_post_count writer; 1 drift repaired |
| d2 ban re-join block | ✅ APPLIED (mig 191) + app check | trigger present + checkOrgBan |
| d3 email invitations | ✅ built (seam, deviation: no provider) | honest not-configured state; accept path fixed E2E |
| d4 forum layer ruling | ✅ DROP (mig 192) | zero code paths proven; 17 seed rows archived |
| d5 case-study honesty | ✅ reset | 4 unearned peer_validated → submitted |

### Track E — Dead-weight erase
| Item | Status | Evidence |
|---|---|---|
| e1 domains trio | ✅ deleted | 1,514 lines fabrication risk |
| e2 38 unmounted components + chains | ✅ deleted | ~9,573 lines, per-file zero-importer proof |
| e3 vendor family | ✅ APPLIED (mig 181) | 4 tables (0 rows) + trigger |
| e4 q7 cron + L3 fixture | ✅ deleted | superseded legacy-tier writer |
| e5 dead modules/endpoints/RPCs/views | ✅ deleted + APPLIED (mig 180) | 2 RPCs + 5 views + 3 routes; 0 callers verified |
| e6 user_profiles mirror | ✅ APPLIED (mig 182→183) | 3 RLS arms repointed; table+triggers dropped |
| e7 ingestion pair | ✅ APPLIED (mig 184) | exported to private repo FIRST, then dropped |
| e8 snapshots ruling | enacted | 1,142 reversal records → private repo relocate; 2 regenerable stay ignored |
| e9 dead columns | ✅ APPLIED (mig 185) | 7 all-NULL columns; conservative slice |
| e10 cosmetics | ✅ | masthead, dup CSS, tier legend under guard, doc drifts |

### R0 — Safety net (Wave-β rider, ran FIRST)
| Item | Status | Evidence |
|---|---|---|
| R0.1a backup posture | ✅ + operator screenshot requested | plan/PITR ambiguous → not inferred; `../backup-posture.md` |
| R0.1b nightly dump + baseline | ✅ LIVE | private repo, 08:17 UTC cron; baseline pre-DDL committed |
| R0.1c restore drill | ✅ PROVEN | run 29153549948, 35s measured restore + manifest verify |
| R0.1d RPO/RTO | ✅ | RPO 24h, RTO 35s measured |
| R0.2a error tracking (first-party) | ✅ APPLIED (mig 195) | Sentry-equivalent (no external acct); deviation recorded |
| R0.2b uptime+honesty probes | ✅ authored | /api/health/surfaces + workflow; needs PROBE_SECRET + deploy |
| R0.2c spend watch | ✅ authored | /api/health/spend; 80% alert |

### A3 — Guards/CI + governance riders
| Item | Status | Evidence |
|---|---|---|
| g1 consistency CI backstop + rule-014 real | ✅ | always-on consistency-backstop job |
| g1b pre-push override parsing | ✅ | hook now parses Consistency-Override trailers |
| g1c F6-marker review | ✅ | orchestrator F6 fix reviewed correct + 4 tests |
| g1d predicates repo-root robustness | ✅ | marker-based, not "dotfiles" substring |
| g2 skill-map additions | ✅ | mint-item, spend-client, fetch-hold governed |
| g2b scoped-slug gate fix | ✅ | scoped + bare skill names both detected |
| g3 readClient write-guard + lib-test --live | ✅ | Proxy throws on writes; ~20-script Track-E rider list |
| g4 new invariants | ✅ | RD-17 RLS-parity, RD-18 column-parity, EP-10 vocab-sync, deferral-hygiene, 4 lane audits registered |

### C7 — Paid recovery + C8/merges
| Item | Status | Evidence |
|---|---|---|
| C7 zero-fetch resynth (45 COVERED) | ⚠️ 1/9 verified, HALTED per ruling | floor-wall pool-insufficiency (NOT C1 gap); rest→disposition-engine Unit 3; see c7-outcome.md |
| C8 canonical key + uniqueness invariant (mig 200, EP-11) | ✅ APPLIED+PROVEN | deriver+trigger+partial-UNIQUE(verified-live); backfill 20/21; EP-11 uniqueness PASS 0 collisions |
| C7.3 guarded merges | ✅ APPLIED | 2 item twins (HDV CO2 2019/1242, FuelEU 2023/1805) + 8 registry URL-dups + 4 EcoVadis suspended; 3 register twins found already-merged 2026-07-07 (stale register); 3ae89ce6 + keepers → disposition-engine (operator rulings) |

## Deviations log
1. **C7 mechanism divergence** — dispatch premised "resynth 45 → recover"; reality = ~11% yield, pool-insufficiency (COVERED measured text volume, not fact-coverage). Halted paid batch per ruling; rest→batch-1. NOT a contract bug (C1 works).
2. **R0.2 error tracking** — first-party (no external Sentry acct; signups forbidden).
3. **d3 email** — honest not-configured seam (no provider exists).
4. **F6 marker** — completed F6's advertised-but-unimplemented silence hatch (guard-correctness fix), acknowledged intentional reserved-lane migration gaps.
5. **reconciler RLS (b6)** — root cause was missing SELECT policies (mig 169) + the WITH-CHECK half already fixed by mig 163; 3 policies, not a WITH-CHECK change.
6. **readAll orderBy** — junction tables (composite keys, no id) needed an order key; backward-compatible param added.

## Open units register (expected residue, per dispatch "deliberately NOT in scope")
- **batch-1 refetch set**: the ~44 quarantined COVERED items (recovery = refetch, gated behind the deliberate hold) + the PORTAL-SOURCE re-points. Ride Jason's hold-lift.
- **Deferral hygiene**: 47 expired-open + 5 deleted-subject flags (A3 audit found; report-only — a later disposition dispatch resolves).
- **Track-E riders**: read-side error-swallow list (A1); ~20 readClient-write scripts to migrate to guarded helpers (A3 g3); generation-config.ts skill-map (operator call).
- **Operator activation deps**: set PROBE_SECRET=WORKER_SECRET + deploy (R0.2 probes); confirm APP_URL; the backup-posture screenshot.
- **Switches (untouched)**: loop/cadence flip, batch-1 execution, triage throughput, Research repositioning, community peer acquisition.

## Exit test (dispatch-binding)
- data-audit lane GREEN ✅ · required checks (run on the master PR) — at PR · 6+ new/widened invariants GREEN ✅ (RD-16/17/18, EP-10, EP-11, deferral-hygiene, F6) · meta-gate 58 invariants wired ✅ · zero open P1 (all 12 fixed+applied) ✅ · P2 items each fixed/deviated/blocked-with-owner ✅ · **23 migrations applied+proven** · spend $6.68 / $32.

## Queued follow-ons (operator-dispatched, sequence after this PR merges)
1. **Chrome layout + F-1 escape** (`fix/chrome-layout-f1-2026-07-11`, running): L-1..L-6 + V-07/08/09 + F-1 fail-closed allowlist. Own PR. Then the **overflow+hydration GUARD** (Playwright fixtures wired as invariant).
2. **Autonomous Disposition Engine** (Units 0–5 + Doctrine rider): Unit 0 = doctrine register (15-seed, verbatim + enforcing-invariant/exemption, meta-gate FAILs unenforced doctrine, dispatches cite by ID); Unit 1 = 489-provisional triage resolver; Unit 2 = flag resolver (859+); Unit 3 = the 62 quarantine → recover-or-delete zero-survivors (scoped remediation-fetch exception, manifest-bound, $25 ceiling w/ month-pacing); Unit 4 = queue honesty; Unit 5 = standing cron autonomy. Absorbs the C7 batch-1 set + the 3ae89ce6/FuelEU-keeper hand-offs. Depends on this PR + the fetch-exception F16 extension.
