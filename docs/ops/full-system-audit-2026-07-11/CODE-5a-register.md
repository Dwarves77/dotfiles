# CODE-5a Register — `fsi-app/scripts/**` (code files)

Audit date: 2026-07-11 · Baseline: master `71bcbd46` · Branch: `audit/full-system-2026-07-11`
Agent: CODE-5a (Scripts). READ-ONLY audit; zero fetches; zero script executions with write flags; one SELECT-only DB verification query.

Slice per `_manifest_files.tsv`: **541 code files / 54,472 lines** under `fsi-app/scripts/`
(root 157 / _diag 251 / lib 47 / tmp 46 / verify 18 / _reconciliation-2026-07-11 11 / archive 6 / cron 1 / workflows 1 / migrate 1 / _reground 1 / _dataops 1).

Method: full line-by-line read of `lib/**`, `verify/**`, `cron/`, `workflows/`, `migrate/`, `_reground/`, `_dataops/`, `archive/`, `_reconciliation-2026-07-11/`, and the load-bearing root runners (regen-quarantined, audit-skill-conformance, funded-pass, batch1-runner, apply-4c-plan, apply-funded-releases*, apply-migrations, measure-bundles, block4-retroground-runner, run-4c-relabel, research-deepdive-batch, reg-source-repoint, restore-jolt, step3-reset-jolt, q7-daily-recompute + remediation trio in verify/). Every remaining file was classified by a mechanical full-text scan (write-ops / dry-run gate / interlock / credential reads / LLM+network egress / empty-catch / TODO) plus header purpose extraction — the manifest-sanctioned "lighter but complete pass" for one-shot dirs. Scanner: session scratchpad `classify.mjs` (read-only); its output reconciles 541/541 against the manifest slice (0 missing).

---

## 1. LIVE-scripts inventory (what actually runs from CI / hooks / package.json / cron)

| Trigger | Script(s) | Mode |
|---|---|---|
| `.github/workflows/bug-class-guard.yml` — HARD job (push/PR to master) | `scripts/lib/{inconclusive-probe,type-consumer-probe,reachability,entity-gate,fetch-now-decision,check-sources-decision,verification-decision,error-drop-probe}.selftest.mjs` via `node --test` | fail-the-build |
| `.github/workflows/bug-class-guard.yml` — SOFT job | `scripts/lib/inconclusive-report.mjs`, `scripts/lib/type-consumer-probe.mjs`, `scripts/lib/error-drop-probe.mjs` (each `|| true`) | report-only |
| `.github/workflows/data-audit-lane.yml` (nightly 06:00 UTC + manual; repo secrets incl. SUPABASE_SERVICE_ROLE_KEY) | `scripts/verify/run-data-audit-lane.mjs` → spawns 8 HARD audits (`one-tier-per-host`, `claims-tier`, `substrate-agreement`, `ledger-onepass`, `vocab-sync`, `orphan-source`, `quarantine-disposition`, `unregistered-span-host`) + 1 SOFT (`scripts/audit-skill-conformance.mjs`) | fail job on hard red; writes/resolves the Layer-C block row in `integrity_flags` via guarded path |
| `.discipline/run-test-suite.sh` (pre-push step 3 AND CI discipline.yml — parity by construction) | `scripts/lib/db.test.mjs`, `scripts/lib/funded-release-plan.test.mjs`, `scripts/lib/batch1-orchestrate.test.mjs` | fail-the-push/build |
| `package.json` `perf:bundles` | `scripts/measure-bundles.mjs` | manual, read-only over `.next/` |
| Discipline governance (invariants.mjs enforcement pointers; meta-gate wiring) | `scripts/verify/{no-names,routing,source-vs-item,format-structure,orphan-source-audit,one-tier-per-host-audit,claims-tier-audit,quarantine-disposition-audit,substrate-agreement-audit}.mjs`, `scripts/regen-quarantined.mjs` (named resolver), `scripts/lib/deferral.mjs`, `scripts/lib/anthropic.mjs` (rule 016 canonical site), `scripts/lib/db.mjs` (rule 015 guarded path) | referenced/enforced, not scheduled |
| Other workflows (source-monitoring, trust-recompute, spot-check-monthly) | none — they curl deployed API routes, not scripts | n/a |
| vercel.json | **no crons** (empty of `crons` block) | n/a |

Everything else under `scripts/` (≈510 files) is operator-invoked: one-shot audit records, dated data-ops, or standing reusable tools.

## 2. `scripts/lib/**` — deep read (47/47 files)

**`db.mjs` (guarded write path — rule 015 target).** Sound design: unexported raw write client; every write requires `{cite:{skill,reason}}`; prior-value snapshot to `_snapshots/` before mutate; `readAll` pagination (fixes the 1,000-row PostgREST cap that caused the 27-duplicate incident); `reclassifyToSource` register→read-back-verify→archive ordering (the source-registration invariant, tested in db.test.mjs). Findings:
- **F-5a-1 (medium) `readClient()` is the write client.** `db.mjs:59-61` — `readClient()` returns `writeClient()` (the full service-role client). Any script can do `readClient().from(t).update(...)` and bypass the cite/snapshot guard entirely; several scripts do raw writes on clients obtained this way or via their own `createClient` (see §7). The guard is honest about this residual (header lines 18-20; rule 015 catches it at commit for `scripts/**` — but `tmp/`, `_diag/` one-shots and gitignored files never reach commit review). Candidate: rename to `serviceClient()` + have rule 015 also flag `readClient().from(...).update|insert|delete` shapes.
- **F-5a-2 (low) snapshot reversibility artifacts are gitignored.** Guarded-write snapshots land in `scripts/_snapshots/` which is gitignored (root `.gitignore:64`) — the reversal record for production mutations exists only on the operator machine (see §11). Tension with the stated purpose ("restore from change record").
- `registerSource` dedups by canonical host via full paginated read — correct; insert path snapshots after insert (reversal = delete returned id) — correct.

**`batch-primitives.mjs`** — clean, pure resilience wrappers (withRetry/withRateLimit/withIdempotency/createPgPool/createProgressReporter + 3 retryable-error predicates); unit-tested (batch-primitives.test.mjs); consumed by batch scripts. No writes, no creds. Deliberate absences (withReconnect/withCheckpoint) documented.

**`deferral.mjs`** — write-time+read-time deferral validator (RD-6): reason ≥30 chars + disposition-path keyword, future date, named owner, named resolution event. Selftest covers each rejection. Consumed by quarantine-disposition-audit (lane) + renew-deferrals. Wired invariant. Clean.

**`funded-release-plan.mjs`** — pure deletion-moat gates (`instrumentIdentityBucket` 3-bucket identity, `isDeletableLoser`, operator-ruled `isOperatorValueDeletable`, plan builder + schema validator incl. loser==survivor refusal). Red-then-green tested (funded-release-plan.test.mjs, in the canonical suite). Clean; this is the right shape for destructive-op gating.

**`anthropic.mjs`** — the rule-016 sanctioned script-side Anthropic call site (`canonicalGenerate`); streams above 8,192 max_tokens (the buffered-hang fix). Reads ANTHROPIC_API_KEY from env only. Clean. Note: several one-shots still call `api.anthropic.com` directly (block4-retroground-runner.mjs:480; predates this wrapper) — rule 016 exemptions apply to the wrapper, not those; they are one-shot records, not live.

**`net-agent.mjs`** — side-effect undici global dispatcher (short keep-alive, 4-conn cap) for sandbox network instability. Import-order-sensitive by design; documented.

**`urgency.mjs` / `fetch-quality.mjs`** — declared **mirror copies** of `src/lib/urgency.ts` and `src/lib/sources/fetch-quality.ts` ("keep in lockstep"). Two-homes risk acknowledged in-file; no mechanical sync guard exists for either (vocab-drift-guard covers vocab, not these). **F-5a-3 (low)**: candidate — a drift test comparing the .mjs mirrors to the TS SoT (jiti import + deep-equal), same pattern as vocab-sync-audit.

**D3 engine family** (`verify.mjs`, `drift-check.mjs` + reconstruction, `surface-registry.mjs` + reconstruction, `exclusion-audit.mjs` + reconstruction, `liveness.mjs` + reconstruction, `decision-anchors.mjs`, `decision-log-audit.mjs`, `block1-reaudit.mjs`, `bootstrap-test1.mjs`) — the verification-primitive library: outcome assertions (read-back, fetchOk non-2xx→INCONCLUSIVE), AST behavioral drift predicates (lazy `typescript` require — the npm-ci-free CI fix), surface-class enumeration with mandatory coverage blocks, exclusion cross-product, four-verdict decision anchors (48 rows incl. row-48 self-guard), heartbeat liveness with fail-closed consumer view. All selftests are pure `node:test` (no DB). Findings:
- **F-5a-4 (HIGH, dangerous-by-default) `lib/block1-reaudit.mjs` writes to prod on bare invocation.** Seeds SENTINEL sources/items/sections/claims, `UPDATE ... SET provenance_status='verified'` probes, and `DELETE ... WHERE legacy_id LIKE 'SPRINT4_D3_TEST2%'` / `name LIKE ...` cleanup (lines 38-41, 87), via raw pg with the **postgres pooler owner password** — no `--apply` flag, no interlock. Sentinel-scoped and self-cleaning, but a bare `node scripts/lib/block1-reaudit.mjs` mutates production. Same class: `lib/verify-reconstruction.mjs` (sentinel item + UPDATE + DELETE; also fires a real bad-key request at the live REST endpoint) and `lib/liveness-reconstruction.mjs` (INSERT/UPDATE/DELETE a sentinel `integrity_flags` row). Candidate: require an explicit `--live` flag on all three (they are re-runnable acceptance tests, not one-shots).
- **F-5a-5 (low) stale L3 expectation:** `lib/surface-registry-reconstruction.mjs` asserts vercel.json schedules `q7-daily-recompute` (`schedulesQ7`, near end of file) — vercel.json now has **no crons**, so this L3 fails if re-run; and its DRIFT_FILES known-answer list includes `scripts/wave1-api-discovery.mjs`, which is **gitignored** (root `.gitignore:40`) — absent on a fresh checkout. Same class: `lib/fetch-negative-probe.mjs` KNOWN_ANSWERS references tracked files only (ok). Candidate: refresh the L3 fixtures or mark them dated audit records.
- **F-5a-6 (info)** `decision-anchors.mjs` `loadContext` probes `.env.local` for `SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_DB_PASSWORD` (the row-43 residual signal) — intentional, read-only.

**Bug-class detectors** (`inconclusive-probe.mjs` forms 1-4 + `fetch-negative-probe.mjs` form 1 + `type-consumer-probe.mjs` read-side + `error-drop-probe.mjs` + `inconclusive-report.mjs`) — LIVE in CI (§1). Honest-residual disclosures in-file; discrimination selftests in the HARD job. `error-drop-probe` escape hatch = `// error-intentionally-ignored`. Clean.

**`batch1-orchestrate.mjs`** — pure dep-injected batch-1 decision core (batch-class selection, outcome classification, per-item pipeline, envelope estimate); tested in canonical suite. Clean.

**Unit/selftest files (18)** — all import `node:test` + relative modules only (glob-portability rule); `db.test.mjs` injects a fake client via `__setWriteClientForTest` (never touches real DB; snapshots redirected via `DISCIPLINE_SNAP_DIR`).

## 3. `scripts/verify/**` — the audit lane (18/18 files read; invariant mapping)

| Script | Invariant / governing claim | Wired where | Writes? |
|---|---|---|---|
| run-data-audit-lane.mjs | lane runner + Layer-C block row (mirrors `src/lib/agent/audit-gate.ts` DATA_AUDIT_BLOCK) | CI nightly | guardedInsert/guardedUpdate of the block flag (idempotent, resolve-on-green) |
| one-tier-per-host-audit.mjs | SC-6 one canonical tier per host (uses live `institution.ts` via jiti) | lane HARD + invariants.mjs | no |
| claims-tier-audit.mjs | SC-7 claims-tier derivation consistency (stored stamp == COALESCE(tier_override, base_tier); non-FACT ⇒ NULL; moat-pure) | lane HARD + invariants.mjs | no |
| substrate-agreement-audit.mjs | EP-8 status-is-a-cache: stored provenance_status == validate_item_provenance() both directions (per-item RPC loop) | lane HARD + invariants.mjs | no |
| ledger-onepass-audit.mjs | E1 composed JS cross-check of the SQL gate (resolver fidelity + per-type floor mirror of migrations 141/145) | lane HARD | no |
| vocab-sync-audit.mjs | metadata-vocab DB_*_VALUES == live CHECK constraints (pg-direct catalog read; hardcoded region-candidate pooler list) | lane HARD | no |
| orphan-source-audit.mjs | source-registration invariant (twin of rule 019 + migration 135 + db.mjs reclassifyToSource) | lane HARD + invariants.mjs | no |
| quarantine-disposition-audit.mjs | research-or-erase: enqueue + 14-day dwell + valid-deferral logic (consumes lib/deferral.mjs); resurrection vs fresh-crossing legibility | lane HARD + invariants.mjs | no |
| unregistered-span-host-audit.mjs | register-step trend monitor vs `_baselines/unregistered-span.json`; fails only on regression; `--rebaseline` writes the baseline FILE | lane HARD | baseline file only |
| no-names.mjs | EP workspace-anchoring (blocklist from live orgs + skill wrong-examples; fire-tested matcher) | invariants.mjs | no |
| routing.mjs | five-surface routing / format mapping (flags OFF-MODEL Technology 6th surface) | invariants.mjs | no |
| source-vs-item.mjs | source≠item, title-anchored (fire-tested; reuses live entity-gate urlIsRoot) | invariants.mjs | no |
| format-structure.mjs + _fmt-present.mjs | brief-completeness v2 (skill-derived always-present sets; noted-omission vs silent absence) | invariants.mjs | no |
| surface-visibility-audit.mjs | verified-item-hidden class (PPWR 2026-07-08): no_surface / cross_surface | **NOT in lane, NOT in invariants.mjs** | guardedInsert idempotent flags |
| remediate-orphan-sources.mjs | remediation for orphan-source-audit; DRY-RUN default, --apply, --limit, halt-on-first-failure | manual | guarded |
| cleanup-dup-sources.mjs | deletes the 27 self-created dup sources; DRY-RUN default; zero-active-host abort guard | manual (one-shot, done) | guardedDelete |
| remediate-reclassify-proposal.mjs | AUTH-GATED proposal doc only (writes docs/RECLASSIFY-PROPOSAL.md, no DB writes) | manual | file only |

Findings:
- **F-5a-7 (medium) `surface-visibility-audit.mjs` is unwired.** It enforces a named invariant class (the PPWR hidden-item incident), has run at least once (56 `integrity_flags` rows with `created_by='surface-visibility-audit'` live — SELECT-verified 2026-07-11), but is in neither `run-data-audit-lane.mjs` AUDITS nor `.discipline/governance/invariants.mjs`. Per the invariant-coverage doctrine ("wired" is per-invariant), this is a drift-prone gap: nothing re-runs it. Candidate: add to the lane (hard or soft) + register the invariant.
- **F-5a-8 (low)** `ledger-onepass-audit.mjs` + `unregistered-span-host-audit.mjs` + `vocab-sync-audit.mjs` are lane-wired but have no invariants.mjs entry (enforcement without registry linkage — the meta-gate can't see them as an invariant's mechanism). Candidate: registry entries.
- **F-5a-9 (info)** `substrate-agreement-audit.mjs` runs one `validate_item_provenance` RPC per checkable item (~600+ sequential RPCs nightly) — fine at current corpus size; O(n) cost note for scale.
- Lane runner's `reflectBlockState` is best-effort by design (a reflect failure never changes the lane verdict) and correctly captures `error` on its read (no error-drop).

## 4. Small directories (all files fully read)

**`cron/q7-daily-recompute.mjs` (412)** — **F-5a-10 (medium): superseded + stale-schema, still write-capable.** Dry-run default with `--execute`; raw service-role writes (predates db.mjs). Header says "Pre-Q2: writes `tier`" — code writes the legacy `tier` column (line ~308) and `tier_override = null // Pre-Q5`, while the live schema has `base_tier`/`effective_tier`/`tier_override` (SELECT-verified all four columns exist). The Q7 recompute now lives in `src/lib/trust.ts` + an `/api/admin/q7-daily-recompute` route; nothing schedules this script (vercel.json cronless — yet `lib/surface-registry-reconstruction.mjs` still expects it scheduled, F-5a-5). Running `--execute` today would mutate the legacy `tier` column outside the current tier model. Candidate: retire to `archive/` (or delete) + fix the L3 fixture. Also a declared logic-mirror of trust.ts ("keep in sync" — two-homes).

**`workflows/all-surfaces-deepdive-build.mjs` (148)** — Claude-Code dynamic-workflow definition (agent()/pipeline() DSL): 5 worktree author agents + adversarial reviews for the all-surfaces deep-dive build. One-shot dispatch record; invoking it dispatches model-calling agents (NOT run in this audit). No direct DB writes. Keep as record.

**`migrate/reclassify-fold.mjs` (101)** — keystone item_type correction (groups A/B/C + flag-only), DRY-RUN default, guarded writes + item_changelog reversal rows + per-item read-back, portal screens verbatim from source-vs-item. Executed 2026-06-07; re-run is plan-recomputed (semi-idempotent). Good exemplar of the doctrine shape.

**`_reground/reconcile-revalidate.mjs` (65)** — reconciler-credential revalidation: requires `--only=<ids>` (refuses unscoped), DRY-RUN default, asserts `current_user='reconciler'`, never sets provenance_status directly (touch-updated_at → trigger). Uses RECONCILER_DB_PASSWORD + pooler URL. This is the current best-practice write shape in the repo.

**`_dataops/interlock.mjs` (44)** — re-run interlock for already-executed data ops: refuses unless `CONFIRM_RERUN=<name>`; runs before any DB connect. **Imported by only 7 scripts** (phase2-build-binding, phase2-reconcile, recheck-fabrication-16, reclassify-portals-content-gate, recovery-readmit, roleaudit-reclassify, tier-reconcile). See F-5a-11.

**`archive/` (6)** — parked one-shots from the 2026-05-10 wave: 3 read-only previews (deletion-preview-title-only, task4-backfill-preview, task6-source-inserts-preview), 1 doc generator (write-deletion-preview-v2 — reads a tmp JSON, writes a docs/ markdown), 1 raw-pg INSERT executor (`phase2-step1-task6-inserts.mjs` — executes `scripts/tmp/task6-inserts-v2.sql` in a transaction on bare invocation; no gate, no interlock — executed long ago, non-idempotent), 1 auth'd smoke (`smoke-run-task3.mjs` — mints an admin token via generateLink/verifyOtp and POSTs `/api/agent/run` = paid model call on bare invocation; hardcoded operator email `jasonlosh@hotmail.com`). Directory role is correct (parked audit records) but the two live-fire ones would still fire if run. Candidate: interlock or neuter (exit-0 header) anything in archive/.

## 5. Root `scripts/` (157 one-shot + standing runners)

Pattern census (mechanical scan + spot reads): 197 of 541 files contain DB write ops; 88 of those have a dry-run/apply gate or interlock; the ungated remainder is dominated by the dated "authorized-writes" one-shot family (see §7). Root breaks into:
- **Standing/reusable runners (dry-run default, spend-guarded):** funded-pass.mjs (ground-only; deletes BROWSERLESS_API_KEY, 4 stop-layers, emits plans to `_plans/`, zero guarded writes from loader context — binding 3b), batch1-runner.mjs (fetching twin; `--execute` + scrape-hold + key assertions; zero-mint, guarded pool/exhaustion inserts), regen-quarantined.mjs (RD-4 resolver; DRY-RUN default; HOLD_TYPES gate), block4-retroground-runner.mjs (`--execute --confirm` double gate; per-item transaction, commit-only-if-valid, halt-on-readback-mismatch; direct anthropic call predating lib/anthropic.mjs), run-4c-relabel.mjs (paid judge, plan-emitter, no DB writes) + apply-4c-plan.mjs / apply-funded-releases.mjs (pure-node appliers: plan schema validation, drift-check, guardedUpdate, fresh-client read-back, halt-on-mismatch), audit-skill-conformance.mjs (lane SOFT; persist gated behind --apply), apply-migrations.mjs (arg-driven DDL executor — "does what you tell it", no dry-run; acceptable for its role but unguarded), measure-bundles.mjs (read-only perf tool; hardcoded ROUTES list needs manual upkeep).
- **Dated authorized-writes one-shots** (tier1-* ×13, wave1/2/5-*, sprint3-*, pr-a1/a2, source-classification-step1/2, iso-backfill, topic-backfill, phase-2b, phase-5-backfill, eu-3-disposition, …): investigate → operator authorization → execute with per-step read-back (the PR-A1 pattern). They are the audit record required by the code-vs-data-state doctrine. Most predate both the dry-run doctrine and the interlock: **write-on-bare-invocation, no re-run protection** (§7).
- **Interlocked one-shots (7):** phase2-build-binding, phase2-reconcile, recheck-fabrication-16, reclassify-portals-content-gate, recovery-readmit, roleaudit-reclassify, tier-reconcile — refuse re-run without `CONFIRM_RERUN`.
- **Read-only investigations/audits** (~50): *-investigate.mjs, audit-*.mjs, recovery-measure, spotcheck-*, proof-*, etc.

Full per-file classification (Flags: W=DB-write-ops present, G=dry-run/apply gate, I=interlock; Creds = env credentials read) — root:

See Appendix A (all 157 root files).

## 6. One-shot directories — light-but-complete pass

### `_diag/` (251 code files, 10,922 lines; tracked)
Role: dated diagnostic probes + proof scripts + small guarded one-off fixes; the durable evidence trail for dispatch verification. Mostly read-only (service-role or pooler reads); a minority perform small guarded writes on bare invocation (e.g. `_e2-archive8.mjs`, `_e2-reclassify.mjs`, `_register-2083.mjs`, `_phase41-null.mjs`, `_scrape-hold-stop.mjs`, `_clean-stale-trunc-flags.mjs`, `inst-reclassify.mjs`, `_50c-resolve-deferral.mjs` — all one-shots already executed; write-on-run without gate → covered by F-5a-11). `gf-classify.mjs` (348) is an LLM-calling classifier probe. gitignore-consistent: fully tracked, 0 ignored strays; `_conformance.json` (auditor output) is tracked *and* rewritten by the lane's soft audit — shows as a perpetually-modified working-tree file (currently modified; minor hygiene: gitignore it or stop tracking).

### `tmp/` (46 tracked code + 33 tracked data; 139 ignored-on-disk files)
Role: dispatch-execution scratch — migration apply helpers (mig083/085-097, stage2), rollback helpers (phase-5-rollback), smoke bundles (_drain-bundle/_checksrc-bundle — vendored route-code copies with a Next stub), RLS diagnostics, seed helpers. `.gitignore:25` ignores `fsi-app/scripts/tmp/` but 79 files were tracked before the rule landed → **split-brain**: some of the audit record is versioned, the rest (139 files incl. later apply scripts) exists only on the operator machine. The tracked `tmp/*-apply-*.mjs` family executes migration SQL via pooler-owner creds on bare invocation (no gates — one-shots, already applied). `tmp/seed-platform-admin-hotmail.mjs` hardcodes the operator email (not a secret; hygiene only). Load-bearing exceptions to "scratch": `run-4c-relabel`'s plan flow and `research-deepdive-batch --from-screen` read inputs from `_diag/`, and `archive/phase2-step1-task6-inserts.mjs` reads `tmp/task6-inserts-v2.sql` (tracked — ok).

### `_reconciliation-2026-07-11/` (11 files, 702 lines)
Role: the in-flight reconciliation working set (dated same day as this audit): deterministic label repairs, floor-class re-home/flip/deferral scripts, reconciler RLS diagnostics, mig-163 proof, pool-winnability probe, register-and-restamp-hosts. Most are DRY-RUN-default/guarded (floor-rehome-verified, flip-and-defer-floor-class, renew-deferrals, q3-casino-delete-and-sweep, register-and-restamp-hosts); three write raw on invocation given args (`flip-touch-service.mjs` — sanctioned trigger-touch path; `fix-analysis-labels.mjs`, `fix-label-syntax-68e05861.mjs` — manual-snapshot then raw service-role writes, **bypassing db.mjs**). Four of these files are byte-near duplicates of `tmp/` copies (flip-touch-service, mig163-proof, rls-diag-reconciler, renew-deferrals) — copied from ignored scratch into a tracked record dir (acceptable as record-keeping; note the two-homes edit hazard while the reconciliation is live). gitignore-consistent: tracked, 0 strays.

Per-file classification — `_diag/`, `tmp/`, `_reconciliation-2026-07-11/`, `lib/`, `verify/`, small dirs, `archive/`:

See Appendix B (all 384 subdirectory files).

## 7. DANGEROUS-BY-DEFAULT list (bare `node <script>` performs writes; no dry-run flag, no interlock)

Doctrine target: dry-run default everywhere. 109 write-capable files have neither a `--apply/--execute` gate nor the interlock. Removing false positives (lib/db.mjs = the guard itself; db.test.mjs = fake client; selftests; `verify/run-data-audit-lane.mjs` + `verify/surface-visibility-audit.mjs` = flag-reflect audits, intended; SQL text files), the enumerated dangerous-by-default set is:

**Live-risk today (standing, re-runnable, would mutate current prod state):**
1. `lib/block1-reaudit.mjs`, `lib/verify-reconstruction.mjs`, `lib/liveness-reconstruction.mjs` — sentinel seed/UPDATE/DELETE on prod via pooler-owner password (F-5a-4).
2. `step3-reset-jolt.mjs`, `restore-jolt.mjs` — targeted delete/reset/rebuild of the JOLT item + subject-source convergence counters on bare run (operator-authorized then; still armed).
3. `reg-source-repoint.mjs` — writes with **default args** (bare run re-points the PPWR item; idempotent no-op when already pointed, but a typo'd prefix arg writes immediately).
4. `research-deepdive-batch.mjs` — bare run with `--ids` immediately deletes the item's claim ledger then spends (self-capped $15) — spend + destructive prep with no dry-run.
5. `_reconciliation-2026-07-11/{flip-touch-service,fix-analysis-labels,fix-label-syntax-68e05861}.mjs` (+ their `tmp/` twins) — raw service-role writes given ids.
6. `archive/phase2-step1-task6-inserts.mjs`, `archive/smoke-run-task3.mjs` — archived but still executable (raw INSERT batch; token-mint + paid route POST).
7. `apply-migrations.mjs` — arg-driven DDL against prod (role-appropriate, but nothing stops re-applying a non-idempotent migration).

**Executed one-shots with no re-run protection (double-apply hazard class — the interlock exists but covers only 7 scripts):**
`tier1-us-{northeast,south,west,midwest,cities,dc-territories}-execute`, `tier1-{eu-western-nordic,eu-southern-eastern,eu-2-clean-inserts,uk-nations,ca-provinces,au-apac,intl-cities}-execute`, `tier1-us-cities-fix-la`, `eu-3-disposition-execute`, `iso-backfill-2026-05-08-execute`, `pr-a1-execute`, `pr-a2-execute`, `source-classification-step{1,2}-execute`, `sprint3-a15-step{1,2,3}-*`, `sprint3-a16-apply`, `sprint3-a3-profiles-backfill`, `sprint3-a5-backfill`, `sprint3-a6-find-new`, `topic-backfill-execute`, `wave1-last-scanned-backfill`, `wave2-cleanup-execute`, `wave5-design-questions-flags-write`, `phase-2b-flag-ingest-errors`, `phase-5-backfill`, `backfill-classify-batch`, `test-integrity-flags-write`, plus the `tmp/*apply*.mjs` migration executors and the write-bearing `_diag/` one-offs listed in §6.

**F-5a-11 (HIGH, class finding):** the re-run interlock (`_dataops/interlock.mjs`) was built precisely for this class but was only retrofitted onto 7 Sprint-4 scripts. Everything in the second list is an already-executed prod mutation that re-executes on a bare `node` call. Candidate class fix: a tiny `assertExecutedDataOp` import (name + ledger entry) across the executed set, or a directory-level convention (move executed one-shots under an `executed/` dir whose scripts all import the interlock; archive/ should get the same treatment).

## 8. Credential handling

- **No hardcoded secrets found** in any of the 541 files (mechanical scan for JWT prefixes `eyJ…`, `sk-ant-…`, and inline passworded connection strings — the only connection-string hits interpolate `process.env` values).
- Patterns in use: `process.loadEnvFile(.env.local)` + `SUPABASE_SERVICE_ROLE_KEY` (≈259 references — the dominant script credential), `SUPABASE_DB_PASSWORD` + `supabase/.temp/{project-ref,pooler-url}` → **postgres owner** pooler conn (≈134 refs — migration appliers, D3 recon files, phase-5, block4 runner), `RECONCILER_DB_PASSWORD` (13 refs — `_reground/reconcile-revalidate.mjs`, mig163-proof, rls-diag*: the bound-credential path, asserts `current_user='reconciler'`), `ANTHROPIC_API_KEY` (60), `BROWSERLESS_API_KEY` (55; funded-pass/run-4c-relabel actively **delete** it to enforce zero-fetch), anon key (22, smokes).
- **F-5a-12 (standing, cross-referenced):** the owner-password path (SUPABASE_DB_PASSWORD) remains the majority write credential in scripts — the row-43 residual (operator credential-hygiene: remove/rotate owner + service-role creds from the agent env) is visible from this slice too; `decision-anchors.mjs` deliberately tracks it as `unrestrictedCredInEnv`. Only the `_reground` revalidator + mig163/rls diags use the bound reconciler credential. Not new; recorded for the master gap register.
- `vocab-sync-audit.mjs` + `apply-migrations.mjs` iterate a hardcoded 8-region pooler-host candidate list with `ssl.rejectUnauthorized:false` — pragmatic; low risk (server certs unverified on a password-bearing connection is a (low) MITM-surface note).

## 9. Error-swallow

- The dominant `catch {}` shape is `try { process.loadEnvFile(...) } catch {}` — deliberate CI-vs-local env fallback; benign, ~30 files.
- Real swallow shapes found in full reads: `block4-retroground-runner.mjs:477` `fetchText` catch→`{ok:false}` (fetch failure silently becomes "no source content" — form-1-adjacent, but the item is then SKIPPED not negatively classified, and the runner is a superseded one-shot); `batch1-runner.mjs:334` webSearch fallback `catch { return []; }` (open-web candidates silently empty on error — acceptable-by-design: deterministic candidates remain, exhaustion record persists the attempt); `withClient` `finally { try { await c.end(); } catch {} }` (benign).
- The `{ data }`-without-`error` destructure class is **guarded live** by `lib/error-drop-probe.mjs` in CI (soft). Instances remain in one-shot scripts (e.g. `step3-reset-jolt.mjs` reads, `no-names.mjs`/`routing.mjs` `{ data: items }` reads without error capture — a failed read reads as 0 items = a **vacuous PASS** shape in those two verifiers). **F-5a-13 (medium):** `verify/no-names.mjs` and `verify/routing.mjs` drop `error` on their main reads AND have no non-zero exit on failure (they print results but always exit 0 implicitly) — as invariant *enforcements* (invariants.mjs points at them) they cannot fail a lane. Today they're not in the nightly lane (registry-only), so the teeth are notional. Candidate: capture `error`, `process.exit(1)` on violations, and lane-wire them.

## 10. Dead / superseded

- `cron/q7-daily-recompute.mjs` — superseded by trust.ts + admin route; stale pre-Q2 semantics (F-5a-10). Header itself says wiring deferred; never wired.
- `archive/*` — declared parked; two still-armed (see §4/§7).
- `nrel-to-nlr-rewrite.mjs`, `tier1-us-cities-fix-la.mjs`, dated `sprint3/sprint4/wave/tier1/pr-a*` families — executed one-shot records; not dead code in the harmful sense (they are the audit trail the CLAUDE.md code-vs-data doctrine requires in-repo), but all carry the F-5a-11 re-run hazard.
- `lib/*-reconstruction.mjs` L3 fixtures reference retired/ignored artifacts (F-5a-5) — partially stale as re-runnable tests.
- `tmp/_drain-bundle.mjs`/`_checksrc-bundle.mjs` — vendored copies of route code with a Next stub (868/276 lines): superseded by the live routes; two-homes only if re-used (they're smoke bundles; leave archived).
- Duplicated pairs: `tmp/{flip-touch-service,mig163-proof,rls-diag-reconciler,renew-deferrals}.mjs` == `_reconciliation-2026-07-11/*` (tracked copies of ignored scratch — the tracked copy is the record; fine).
- No script in the slice is referenced by CI/hooks and missing; no LIVE reference points at a deleted file. The gitignored-but-referenced set is the inverse problem (F-5a-14).

## 11. Data-artifact directory dispositions + gitignore consistency (manifest deviation 2)

| Directory | Role | Tracked | Ignored-on-disk | gitignore-consistent? |
|---|---|---|---|---|
| `_snapshots/` | prior-value JSONL snapshots written by db.mjs guarded writes = the **reversal record** for prod mutations | 1,144 | 1,211 | **NO — split-brain (F-5a-15, medium).** `.gitignore:64` ignores the dir but 1,144 pre-rule files remain tracked; all newer snapshots (1,211) exist only on this machine. Either they're regenerable scratch (then untrack the 1,144) or they're the reversibility record (then they need a durable home — they are NOT regenerable: they capture prior row values). CLAUDE.md rule 5 says gitignored scratch; db.mjs's stated purpose says restore-record. Contradiction to surface for operator ruling. |
| `_plans/` | plan files emitted by funded-pass/batch1 (input to the pure-node appliers) | 12 | 6 | Same split-brain, lower stakes: an applied plan is an audit record (tracked ones are); unapplied plans local-only. Acceptable; note only. |
| `_diag/` (data) | probe outputs / JSON evidence (27 data files incl. `_test-one/`) | 278 total | 0 | Yes — tracked evidence. Exception: `_conformance.json` is auditor-rewritten output that stays perpetually dirty in the working tree (currently modified vs baseline); candidate: untrack. |
| `tmp/` (data) | dispatch scratch: SQL previews, JSON dumps | 33 data | 139 (all kinds) | **NO — split-brain** (ignore rule postdates tracking). The tracked set is fine as record; going forward the rule makes all new tmp artifacts invisible to review — consistent with "scratch", inconsistent with how tmp has actually been used (apply scripts + their SQL are audit records per doctrine). |
| `verify/_baselines/` | trend baseline (`unregistered-span.json`) — load-bearing for the nightly regression check | 1 | 0 | Yes — must stay tracked (a fresh CI checkout needs it; it is present). |
| `lib/`, `verify/`, `migrate/`, `_reground/`, `_dataops/`, `cron/`, `workflows/`, `archive/`, `_reconciliation-2026-07-11/` | code-only (covered above) | all | 0 | Yes. |
| root (data/code strays) | 12 gitignored code files on disk (`audit-data-*`, `audit-leadtime-*`, `audit-relationships`, `audit-schema`, `jurisdiction-audit-*`, `backfill-classify-metadata-batch-*`, `wave1-api-discovery*`) | 157 code tracked | 12 | **Partially (F-5a-14, medium): ignored files are load-bearing references.** `.discipline/governance/coverage-report.json` lists `scripts/audit-data-sufficiency.mjs` + `scripts/backfill-classify-metadata-batch-1.mjs` + `scripts/jurisdiction-audit-2026-05-11.mjs` (all ignored → absent on fresh checkout), and `lib/surface-registry-reconstruction.mjs` KNOWN-ANSWERs `scripts/wave1-api-discovery.mjs` (ignored). Local-vs-CI divergence of exactly the class the "CI green means GitHub" feedback flagged. Candidate: track the referenced four or update the referents. |

## 12. Findings summary (severity · candidate next action)

| # | Sev | Finding | Candidate action |
|---|---|---|---|
| F-5a-4 | HIGH | 3 re-runnable lib/ reconstruction/acceptance scripts write to prod (sentinel-scoped) on bare invocation via owner creds | add `--live` gate |
| F-5a-11 | HIGH | interlock covers 7 of ~45 executed write-one-shots; the rest re-execute on bare `node` (double-apply class) | class fix: interlock import or executed/ dir convention (incl. archive/) |
| F-5a-1 | MED | `readClient()` returns the service-role write client — guard bypass is one property-access away; several scripts bypass db.mjs entirely | rename + extend rule 015 patterns |
| F-5a-7 | MED | surface-visibility-audit built + run (56 flags live) but wired nowhere | add to lane + invariants.mjs |
| F-5a-10 | MED | cron/q7-daily-recompute superseded, writes legacy `tier` column under `--execute`, unscheduled but armed | retire/archive |
| F-5a-13 | MED | no-names.mjs + routing.mjs: `{data}` without `error` + no failing exit code → vacuous-pass-capable enforcements | capture error, exit 1, lane-wire |
| F-5a-14 | MED | tracked governance/test artifacts reference gitignored scripts (coverage-report.json ×3, surface-registry-reconstruction ×1) | track or re-point |
| F-5a-15 | MED | `_snapshots/` split-brain: reversal records (not regenerable) gitignored since rule landed; 1,144 stale tracked | operator ruling: durable home vs untrack |
| F-5a-5 | LOW | L3 reconstruction fixtures stale (vercel.json q7 cron expectation; ignored known-answer file) | refresh fixtures |
| F-5a-3 | LOW | urgency.mjs / fetch-quality.mjs declared mirrors of TS SoT with no drift guard | mirror-drift test |
| F-5a-8 | LOW | 3 lane-wired audits missing invariants.mjs registry entries | add entries |
| F-5a-2 | LOW | guarded-write snapshots (reversibility) only exist locally | fold into F-5a-15 ruling |
| F-5a-9 | INFO | substrate-agreement O(n) per-item RPC nightly | scale note only |
| F-5a-6 | INFO | decision-anchors env probe (row-43 residual signal) intentional | none |
| F-5a-12 | INFO (standing) | owner-password remains the majority script write credential (row-43 residual, already tracked) | master gap register cross-ref |

Positive assurance worth recording: no hardcoded secrets in 541 files; the guarded-path + dry-run + plan/applier + interlock + reconciler-credential architecture is real and its newest scripts (funded-pass, batch1-runner, apply-*, _reground, most of _reconciliation) consistently follow it — the dangerous-default set is dominated by *pre-doctrine* one-shots, not new regressions.

## 13. Check-off, tool calls, deviations

**Manifest check-off: 541/541 code files** (mechanical scan reconciled against the `_manifest_files.tsv` kind=code slice — 0 in-manifest unscanned; 110 extra on-disk files were all confirmed gitignored/untracked and are covered in §11, not the slice) **+ 6/6 data-directory dispositions** (`_snapshots`, `_plans`, `_diag` data, `tmp` data, `verify/_baselines`, root strays) per manifest deviation 2.

Depth split (declared): ~90 files full line-by-line (all of lib/ main modules, verify/, cron, workflows, migrate, _reground, _dataops, archive, _reconciliation headers-plus-bodies, and 20+ load-bearing root runners); the remaining one-shot files classified by full-text mechanical scan (every line machine-scanned for the audit dimensions) + header purpose — the manifest-sanctioned lighter pass for one-shot dirs. lib selftest/test files: read to header + assertion level with full-text scan (pure node:test, no DB — verified by grep for client/env constructs).

**Tool calls: 47** (Read ×11, Bash ×27, Write ×2, Edit ×1, ToolSearch ×2, Supabase execute_sql ×1 SELECT-only, TodoWrite ×3).

**Deviation log:**
1. One scratchpad classifier script (`classify.mjs`) was written OUTSIDE the repo (session scratchpad) and run read-only over the tree — no repo file touched.
2. One SELECT-only query against live Supabase (integrity_flags counts by created_by + sources tier-column presence) to verify F-5a-7/F-5a-10 — within the DB-verification allowance.
3. `node --test` / script executions: none (constraint honored; even dry-run invocations skipped since several "dry-run" paths still open DB connections).
4. `scripts/_diag/_conformance.json` was already modified in the working tree at audit start (auditor output churn) — noted in §11, not caused by this audit.

---

## Appendix A — per-file classification, root `scripts/` (Flags: W=write-ops, G=dry-run/apply gate, I=interlock)

| File | Lines | Flags | Creds | Purpose (header) |
|---|---|---|---|---|
| `apply-4c-plan.mjs` | 78 | WG- | - | 4c PLAN APPLIER (PURE NODE — standing dispatch step 3a, ruling 2026-07-04). Consumes a p |
| `apply-errorbody-remediation.mjs` | 61 | WG- | - | ERROR-BODY CLAIM REMEDIATION — APPLIER (PURE NODE). Dispatch item 1 (2026-07-06). Consum |
| `apply-funded-releases.mjs` | 92 | WG- | - | FUNDED-PASS RELEASE/DELETION APPLIER (PURE NODE — standing dispatch item 1, binding 3b,  |
| `apply-migrations.mjs` | 43 | --- | db_password | Apply migration SQL files faithfully via a direct Postgres connection (DDL-capable). |
| `apply-t5-value-rulings.mjs` | 84 | WG- | - | T5 OPERATOR-RULED value-delete + reclassify applier (dispatch 2026-07-06, Jason's ruled  |
| `audit-optionc-reachability.mjs` | 206 | --- | - | PART 1 B audit — reachability + page-content check. |
| `audit-optionc-sources.mjs` | 243 | --- | - | Read-only audit of the 80 Option C URL-anchor outputs. |
| `audit-skill-conformance.mjs` | 136 | WG- | - | READ-ONLY skill-conformance audit (ZERO Browserless, ZERO LLM). Per project_corpus_rever |
| `backfill-claim-tiers-pg.mjs` | 105 | WG- | db_password | A6 BACKFILL (pg-direct, robust). Re-stamp every FACT claim's source_tier_at_grounding +  |
| `backfill-classify-batch.mjs` | 503 | W-- | service_role | backfill-classify-batch.mjs — Caro's Ledge source 5-axis classification backfill. |
| `backfill-item-timelines.mjs` | 122 | WG- | - | scripts/backfill-item-timelines.mjs |
| `backfill-sections.mjs` | 69 | WG- | - | SECTION BACKFILL (guarded-by-design, NON-DESTRUCTIVE, dry-run default): recover missing |
| `batch1-runner.mjs` | 205 | WG- | browserless | BATCH-1 RUNNER (PAID, one-time) — the hold-lift re-collection of the RETRIEVAL-class ite |
| `block4-retroground-runner.mjs` | 223 | WG- | db_password+anthropic | block4-retroground-runner.mjs — DURABLE retro-grounding batch runner. |
| `bulkimport-consumer-verify.mjs` | 58 | --- | - | 6 bulk-import — verified at the CONSUMER's decision (which deterministically drives the |
| `canonical-pipeline-proof.mjs` | 46 | --- | service_role | Prove the canonical pipeline lib fns by DIRECT execution (not blind, not via the runtime |
| `canon-sinir-tier.mjs` | 47 | WG- | - | CANONICALIZE sinir.gov.br to ONE institutional tier (source-credibility-model §3 — "one  |
| `clean-undefined-pollution.mjs` | 57 | WG- | - | CLEAN "undefined " POLLUTION (PURE NODE — standing dispatch step 6 + self-inflicted-dama |
| `cleanup-merged-worktrees.mjs` | 271 | -G- | - | cleanup-merged-worktrees.mjs |
| `completeness-workorder.mjs` | 76 | WG- | - | RE-FETCH WORK ORDER + completeness-exposure flags (dispatch items 4/5, 2026-07-06). Read |
| `correct-d5-deferral.mjs` | 68 | WG- | - | DEFERRAL CORRECTION for d5ee6ab8 (standing dispatch item 2, 2026-07-06) — pure-node GUAR |
| `d1-pilot-dispositions.mjs` | 79 | WG- | - | D1 PILOT DISPOSITIONS (research-or-erase, Jason's content-grounded rulings 2026-06-09). |
| `d2-revalidate-stale-verified.mjs` | 46 | WG- | - | D2: revalidate the STALE 'verified' items (Jason 2026-06-08, option a — honest surface). |
| `d3-run.mjs` | 164 | WG- | db_password | D3 ORCHESTRATOR — the single entrypoint that makes D3 a verification LAYER, not a |
| `d3-runs.ddl.sql` | 29 | --- | - | D3 heartbeat store — DEFINED, NOT APPLIED (no deploy target yet; additive fences hold). |
| `dedup-2026-07-07-enact.mjs` | 115 | WG- | - | scripts/dedup-2026-07-07-enact.mjs |
| `deepdive-test.mjs` | 45 | --- | service_role | Evaluate the DEEP-DIVE generate by OUTPUT QUALITY (not plumbing). Runs the new generateB |
| `e2-phase3-ground.mjs` | 153 | -G- | - | E2 PHASE 3 — ground the 57 confirmed KEEP-GROUND survivors (stored-pool-reuse aware). |
| `eu-3-disposition-execute.mjs` | 452 | W-- | service_role | eu-3-disposition-execute.mjs — EU 3 already-exist disposition writes. |
| `extract-fabricated-items.mjs` | 49 | --- | - | Read-only — extract the 16 items from the B audit report that have >=1 |
| `fix-named-breaches.mjs` | 67 | WG- | - | IMMEDIATE GUARDED FIX for the two named fabricate-via-error-page breaches (dispatch item |
| `flag-fabricated-items.sql` | 91 | W-- | - | One-shot insert of 16 integrity_flags rows for the items archived |
| `forkb-defer.mjs` | 117 | WG- | - | FORK-B DEFERRAL PASS ($0, guarded, ZERO mints — standing funded-pass dispatch item 2, ru |
| `funded-pass.mjs` | 201 | WG- | browserless | FUNDED PASS, BATCHED (PAID — standing dispatch item 3, ruling 2026-07-04). Runs the grou |
| `iso-backfill-2026-05-08-execute.mjs` | 260 | W-- | service_role | iso-backfill-2026-05-08-execute.mjs — authorized writes for the ISO tag |
| `iso-backfill-2026-05-08-investigate.mjs` | 476 | --- | service_role | iso-backfill-2026-05-08-investigate.mjs — read-only investigation for the |
| `lane4-dispose.mjs` | 100 | WG- | - | Lane-#4 disposition execution — STEP 2 (resolve-now: 2 register-as-source + 1 delete) +  |
| `lane4-reground-stored.mjs` | 127 | -G- | browserless | STORED-POOL RE-GROUND RUNNER — durable tooling for fetch-free recovery of quarantined it |
| `measure-bundles.mjs` | 129 | --- | - | usr/bin/env node |
| `nrel-to-nlr-rewrite.mjs` | 83 | WG- | service_role | nrel-to-nlr-rewrite.mjs — guarded host rewrite nrel.gov -> nlr.gov on source rows. |
| `offdomain-archive-pass.mjs` | 103 | WG- | service_role | offdomain-archive-pass.mjs — guarded archive pass over the 19 portal-shell items. |
| `phase0prime-apply.mjs` | 110 | WG- | - | PHASE 0' APPLY — canonical institutional tier per host group. GOVERNING: source-credibil |
| `phase2-analysis-relabel.mjs` | 243 | WG- | db_password | STAGE C — Phase 2 (b)-NARROW per-fact ANALYSIS relabel (per docs/PHASE2-FLAGSHIP-REGROUN |
| `phase-2b-flag-ingest-errors.mjs` | 183 | W-- | service_role | phase-2b-flag-ingest-errors.mjs — Phase 2B writes (2026-05-25). |
| `phase2-binding-probe.mjs` | 71 | --- | db_password | Phase 2 #43 binding — READ-ONLY introspection probe. Zero writes. |
| `phase2-build-binding.mjs` | 79 | --I | db_password+reconciler | Phase 2 #43 binding — BUILD step. Applies migration 118 (the binding schema) and |
| `phase2-preflight.mjs` | 96 | --- | service_role+db_password+anthropic+browserless | PHASE 2 PRE-FLIGHT — read-only lane readiness check (NO writes, NO --apply, NO secret va |
| `phase2-reconcile.mjs` | 99 | WGI | reconciler | Phase 2 — provenance reconciliation THROUGH THE BOUND reconciler credential. |
| `phase2-reground.mjs` | 182 | WG- | - | STAGE C — Phase 2 flagship RE-GROUND (per docs/PHASE2-FLAGSHIP-REGROUND-RUNBOOK.md). |
| `phase2-verify-binding.mjs` | 108 | W-- | service_role+db_password+reconciler | Phase 2 #43 binding — VERIFY BY CONSTRUCTION (3-layer). All probes are NON-COMMITTING |
| `phase3-generate.mjs` | 52 | --- | service_role | Phase 3 — scale the deep dive across a surface's in-scope items, AFTER its exemplar veri |
| `phase-5-backfill.mjs` | 731 | W-- | db_password | Sprint 1 Phase 5 implementation: jurisdictions/jurisdiction_iso backfill |
| `pr-a1-acf-trace.mjs` | 82 | --- | service_role | pr-a1-acf-trace.mjs — read-only follow-up: find the ACF priority origin. |
| `pr-a1-execute.mjs` | 276 | W-- | service_role | pr-a1-execute.mjs — authorized writes for PR-A1 California test pattern. |
| `pr-a1-investigate.mjs` | 294 | --- | service_role | pr-a1-investigate.mjs — read-only investigation for PR-A1. |
| `pr-a2-execute.mjs` | 292 | W-- | service_role | pr-a2-execute.mjs — authorized writes for PR-A2 (Tier 1 US states |
| `pr-a2-investigate.mjs` | 306 | --- | service_role | pr-a2-investigate.mjs — read-only investigation for PR-A2. |
| `pr-a2-investigate-deeper.mjs` | 124 | --- | service_role | pr-a2-investigate-deeper.mjs — broader content scan for retag |
| `proof-sample-5c.mjs` | 101 | -G- | browserless | PROOF SAMPLE 5c (operator ruling 2026-07-04). Runs the GROUND-ONLY pass (groundBrief = r |
| `q4-bias-batch-assign.mjs` | 625 | WG- | db_password+anthropic | Q4 bias-tag batch assignment for existing sources. |
| `recheck-fabrication-16.mjs` | 98 | WGI | service_role | 5A cleanup — re-adjudicate the 16 b-audit "fabrication" archives through the CLASS-FIXED |
| `reclassify-portals-content-gate.mjs` | 116 | WGI | service_role+db_password+anthropic | 156/231-portal cleanup — ONE consistent criterion: the LIVE content gate (firstFetchClas |
| `reclassify-suspects.mjs` | 92 | WG- | db_password+anthropic | reclassify-suspects.mjs — item_type accuracy pass (authorized 2026-06-04, data-pull appr |
| `reconcile-4c-judge-ledger.mjs` | 43 | WG- | - | LEDGER RECONCILIATION (standing dispatch step 1b, ruling 2026-07-04). The 4c judge-runne |
| `recovery-1c.mjs` | 85 | --- | - | ~347 recovery — PHASE 1c: resolve the remaining INCONCLUSIVE bucket. After this the |
| `recovery-measure.mjs` | 152 | --- | db_password | ~347 recovery — PHASE 1 / 1b (read-and-validate) + PHASE 2 (classify the mix). |
| `recovery-readmit.mjs` | 98 | WGI | service_role+db_password | Phase 3 — re-admit the 90 SYSTEMATIC recoveries to PROVISIONAL. The FIRST corpus |
| `recovery-reverify.mjs` | 74 | --- | - | RETROACTIVE re-verification of THE 90 (the number we acted on by re-admitting 90 sources |
| `redo-conformance.mjs` | 96 | -G- | - | CORPUS SKILL-CONFORMANCE REDO — regenerate the flagged items under the FIXED canonical p |
| `regen-quarantined.mjs` | 80 | -G- | - | TIER-2 RE-GROUND batch (F6 docstring corrected 2026-06-12): drive quarantined items towa |
| `register-lovdata-enova.mjs` | 48 | WG- | - | Register two authoritative sources surfaced by the Lane-#4 03b5f234 grounding diagnosis  |
| `register-ucr.mjs` | 20 | WG- | - | 1d registration (operator ruling 2026-07-04): ucr.gov @ T2 — Unified Carrier Registratio |
| `reground-quarantine-free.mjs` | 64 | -G- | - | FREE quarantine remediation (ZERO Browserless): for quarantined items that already have  |
| `reground-tier1.mjs` | 50 | -G- | - | GROUNDING TIER-1 (free re-ground; zero Browserless): re-run groundBrief on QUARANTINED i |
| `reg-source-repoint.mjs` | 41 | W-- | - | RE-POINT a regulation item's primary source from a portal / landing page to the ENACTED  |
| `remediate-errorbody-judge.mjs` | 69 | --- | - | ERROR-BODY CLAIM REMEDIATION — JUDGE (jiti, READ-ONLY, emits plan). Dispatch item 1 (202 |
| `research-deepdive-batch.mjs` | 64 | W-- | service_role | Deep-dive batch runner for the screened research_finding items. Runs the PROVEN canonica |
| `restore-jolt.mjs` | 71 | W-- | service_role | RESTORE JOLT 388b2ce8 to its original RICH researched exemplar from version history. |
| `roleaudit-reclassify.mjs` | 71 | WGI | db_password | Role-audit reclassification — TWO separately-verified data-ops (role + tier), from the |
| `routing-by-item-type.mjs` | 66 | WG- | db_password | routing-by-item-type.mjs — guarded RPC re-route (authorized 2026-06-04). |
| `run-4c-relabel.mjs` | 108 | W-- | browserless | 4c JUDGE + PLAN-EMITTER (PAID ~$0.19 Haiku, standing dispatch step 3, ruling 2026-07-04) |
| `seed-community-regional-rooms.mjs` | 121 | WG- | - | seed-community-regional-rooms.mjs |
| `semantic-screen-conformant.mjs` | 59 | WG- | - | SEMANTIC skill-quality screen (cheap Haiku) over the MECHANICALLY-conformant items — pas |
| `source-becq-url-fix.mjs` | 36 | WG- | db_password | Guarded single-row URL fix (authorized 2026-06-04): CNMI BECQ stored host becq.cnmi.gov  |
| `source-classification-step1-execute.mjs` | 439 | W-- | service_role | source-classification-step1-execute.mjs — authorized writes for Step 1 |
| `source-classification-step2-execute.mjs` | 291 | W-- | service_role+anthropic | source-classification-step2-execute.mjs — Step 2 of source classification |
| `source-eia-price-board.mjs` | 166 | WG- | - | source-eia-price-board.mjs |
| `sourcefix-link-create.mjs` | 134 | WG- | db_password | sourcefix-link-create.mjs — close the no-source_id gap. |
| `source-growth-jolt.mjs` | 38 | --- | service_role | Prove source-growth on the REAL JOLT brief (not isolation math). Parses item 388b2ce8's |
| `source-institution-backfill.mjs` | 82 | WG- | db_password | source-institution-backfill.mjs — guarded data-op. Seeds the institutions table from act |
| `source-label-backfill.mjs` | 64 | WG- | db_password | source-label-backfill.mjs — guarded data-op. (1) Classifies the NULL source_roles via |
| `source-merge-canonical-url.mjs` | 86 | WG- | db_password | source-merge-canonical-url.mjs — guarded data-op. Merges the SAFE duplicate set only: |
| `source-relevance-apply.mjs` | 89 | WG- | db_password | source-relevance-apply.mjs — guarded data-op applying the AUTHORIZED relevance/cleanup s |
| `source-role-cleanup.mjs` | 50 | WG- | db_password | source-role-cleanup.mjs — #3 source-classification cleanup (authorized 2026-06-04). |
| `source-state-min-wage.mjs` | 138 | WG- | - | source-state-min-wage.mjs |
| `source-type-categories-investigate.mjs` | 310 | --- | service_role+anon | source-type-categories-investigate.mjs — READ-ONLY investigation |
| `span-repoint.mjs` | 66 | WG- | - | SPAN RE-POINT (item 3, operator ruling 2026-07-04). DETERMINISTIC guarded fix for fact_s |
| `spotcheck-stored-vs-fresh.mjs` | 65 | -G- | - | SPOT-CHECK: for a few verified-legacy items needing redo, regenerate BOTH ways and compa |
| `sprint3-a15-step1-takedown-published.mjs` | 150 | W-- | service_role | sprint3-a15-step1-takedown-published.mjs — URGENT A1.5 Step 1. |
| `sprint3-a15-step2-takedown-remaining.mjs` | 118 | W-- | service_role | sprint3-a15-step2-takedown-remaining.mjs — A1.5 Step 2. |
| `sprint3-a15-step3-pause-sources.mjs` | 137 | W-- | service_role | sprint3-a15-step3-pause-sources.mjs — A1.5 Step 3. |
| `sprint3-a15-step4-broader-sweep.mjs` | 226 | --- | service_role | sprint3-a15-step4-broader-sweep.mjs — A1.5 Step 4. |
| `sprint3-a15-step6-revised-manifest.mjs` | 236 | --- | - | sprint3-a15-step6-revised-manifest.mjs — A1.5 Step 6. |
| `sprint3-a15-vendor-source-sweep.mjs` | 157 | --- | service_role | sprint3-a15-vendor-source-sweep.mjs — Sprint 3 A1.5 commercial-vendor |
| `sprint3-a16-apply.mjs` | 186 | W-- | service_role | sprint3-a16-apply.mjs — A1.6 apply (per-row-class atomic). |
| `sprint3-a16-reconciliation.mjs` | 208 | --- | service_role | sprint3-a16-reconciliation.mjs — Cross-surface count reconciliation |
| `sprint3-a1-a3-investigation.mjs` | 285 | --- | service_role | sprint3-a1-a3-investigation.mjs — Sprint 3 prework investigation |
| `sprint3-a1-haiku-batch.mjs` | 322 | --- | service_role+anthropic | sprint3-a1-haiku-batch.mjs — Sprint 3 A1 classifier-quality batch. |
| `sprint3-a1-masthead-verify.mjs` | 201 | --- | service_role | sprint3-a1-masthead-verify.mjs — A1 verification gate (READ-ONLY) |
| `sprint3-a1-spotcheck-sample.mjs` | 113 | --- | - | sprint3-a1-spotcheck-sample.mjs — Build operator 10% spot-check sample. |
| `sprint3-a3-profiles-backfill.mjs` | 236 | W-- | service_role | sprint3-a3-profiles-backfill.mjs — Sprint 3 A3 profiles projection backfill. |
| `sprint3-a5-backfill.mjs` | 242 | W-- | service_role | sprint3-a5-backfill.mjs |
| `sprint3-a5-corpus-scan.mjs` | 111 | --- | service_role | sprint3-a5-corpus-scan.mjs — Pre-step for A5 Path C lock. |
| `sprint3-a5-q2-spotcheck.mjs` | 69 | --- | service_role | sprint3-a5-q2-spotcheck.mjs — A5 Q2 read-only spot-check |
| `sprint3-a5-sonnet-backfill.mjs` | 202 | -G- | service_role | sprint3-a5-sonnet-backfill.mjs |
| `sprint3-a6-find-new.mjs` | 307 | W-- | service_role+anthropic | sprint3-a6-find-new.mjs |
| `sprint3-corpus-reclassify-audit.mjs` | 354 | --- | service_role | sprint3-corpus-reclassify-audit.mjs — Sprint 3 CORPUS-RECLASSIFY-SOURCES. |
| `sprint3-corpus-reclassify-crosscheck.mjs` | 202 | --- | service_role | sprint3-corpus-reclassify-crosscheck.mjs |
| `sprint3-corpus-reclassify-dryrun.mjs` | 211 | WG- | service_role | sprint3-corpus-reclassify-dryrun.mjs |
| `sprint3-customer-view-investigation.mjs` | 151 | --- | service_role | sprint3-customer-view-investigation.mjs — Pre-step for RPC-MASTHEAD |
| `sprint3-e1-payload-measure.mjs` | 189 | --- | service_role | sprint3-e1-payload-measure.mjs — Sprint 3 E1 /map cache-payload investigation. |
| `sprint4-114-spancheck-test.mjs` | 42 | --- | - | sprint4-114-spancheck-test.mjs — task 1.14 unit test, NO dev server needed. |
| `sprint4-17-prompt-audit.mjs` | 242 | --- | service_role+anthropic | sprint4-17-prompt-audit.mjs  (Sprint 4 Block 1 — task 1.7 auto-test) |
| `sprint4-18-parser-check.mjs` | 105 | --- | - | sprint4-18-parser-check.mjs  (Sprint 4 Block 1 — task 1.8 synthetic check) |
| `sprint4-hc1-verify.mjs` | 55 | --- | - | sprint4-hc1-verify.mjs — HARD CHECKPOINT 1 verification orchestrator. |
| `sprint4-provenance-reconcile.mjs` | 168 | WG- | service_role | sprint4-provenance-reconcile.mjs  (Sprint 4 Block 1 — task 1.9) |
| `step1-integrity-confirm.mjs` | 90 | --- | db_password | step1-integrity-confirm.mjs — the load-bearing honesty check on the provenance arc. |
| `step3-reset-jolt.mjs` | 57 | W-- | service_role | STEP 3 prep — reset the JOLT item (388b2ce8) to a clean 0-state so the route pull |
| `step3-route-pull.mjs` | 125 | --- | service_role+anon | STEP 3 — prove the canonical chain AUTO-TRIGGERS through the real route. |
| `test-integrity-flags-write.mjs` | 279 | W-- | service_role | test-integrity-flags-write.mjs — end-to-end smoke test for the |
| `tier1-au-apac-execute.mjs` | 691 | W-- | service_role | tier1-au-apac-execute.mjs — Tier 1 Wave B writes for Australia + APAC. |
| `tier1-ca-provinces-execute.mjs` | 505 | W-- | service_role | tier1-ca-provinces-execute.mjs — authorized writes for Tier 1 Wave B |
| `tier1-ca-provinces-investigate.mjs` | 148 | --- | service_role | tier1-ca-provinces-investigate.mjs — read-only preflight for Tier 1 Wave B |
| `tier1-eu-2-clean-inserts-execute.mjs` | 470 | W-- | service_role | Tier 1 Wave A — EU 2 clean inserts |
| `tier1-eu-southern-eastern-execute.mjs` | 840 | W-- | service_role | tier1-eu-southern-eastern-execute.mjs — authorized writes for Tier 1 Wave B |
| `tier1-eu-western-nordic-execute.mjs` | 750 | W-- | service_role | tier1-eu-western-nordic-execute.mjs — authorized writes for Tier 1 |
| `tier1-intl-cities-execute.mjs` | 569 | W-- | service_role | tier1-intl-cities-execute.mjs — Tier 1 Wave C writes for international |
| `tier1-uk-nations-execute.mjs` | 302 | W-- | service_role | tier1-uk-nations-execute.mjs — authorized writes for Tier 1 Wave B |
| `tier1-us-cities-execute.mjs` | 533 | W-- | service_role | tier1-us-cities-execute.mjs — Tier 1 Wave C writes for US major cities. |
| `tier1-us-cities-fix-la.mjs` | 210 | W-- | service_role | tier1-us-cities-fix-la.mjs — corrective fixup for the US-LA collision. |
| `tier1-us-cities-investigate.mjs` | 238 | --- | service_role | tier1-us-cities-investigate.mjs — read-only investigation for Tier 1 Wave C |
| `tier1-us-cities-precheck.mjs` | 64 | --- | service_role | tier1-us-cities-precheck.mjs — pre-flight URL collision check |
| `tier1-us-dc-territories-execute.mjs` | 371 | W-- | service_role | tier1-us-dc-territories-execute.mjs — Tier 1 Wave A writes for |
| `tier1-us-midwest-execute.mjs` | 577 | W-- | service_role | tier1-us-midwest-execute.mjs — authorized writes for Tier 1 US Midwest |
| `tier1-us-northeast-execute.mjs` | 316 | W-- | service_role | tier1-us-northeast-execute.mjs — authorized writes for Tier 1 Wave A |
| `tier1-us-south-execute.mjs` | 388 | W-- | service_role | tier1-us-south-execute.mjs — Tier 1 Wave A writes for US South region |
| `tier1-us-west-execute.mjs` | 427 | W-- | service_role | tier1-us-west-execute.mjs — authorized writes for Tier 1 Wave A |
| `tier-reconcile.mjs` | 79 | WGI | db_password | Tier reconcile — Decision 2 (A canonical: news=T6) + the clean Class-1 mis-tiers. |
| `topic-backfill-execute.mjs` | 211 | W-- | service_role | topic-backfill-execute.mjs — authorized writes for Wave 5 topic backfill. |
| `topic-backfill-investigate.mjs` | 406 | --- | service_role | topic-backfill-investigate.mjs — read-only audit of intelligence_items.category |
| `url-cleanup-content-md.mjs` | 72 | WG- | - | URL-NORMALIZATION CLEANUP (1c, operator ruling 2026-07-04). Strips trailing markdown-emp |
| `wave1-cold-start.mjs` | 576 | WG- | service_role+anthropic+browserless | wave1-cold-start.mjs, Wave 1a foundation cold-start backfill. |
| `wave1-last-scanned-backfill.mjs` | 179 | W-- | service_role | wave1-last-scanned-backfill.mjs — one-shot data backfill for Wave 1a step 1. |
| `wave2-cleanup-execute.mjs` | 629 | W-- | service_role+anthropic | wave2-cleanup-execute.mjs — authorized writes for Wave 2 critical cleanups. |
| `wave2-cleanup-investigate.mjs` | 353 | W-- | service_role | wave2-cleanup-investigate.mjs — read-only investigation for Wave 2 data cleanups. |
| `wave2-reachability-restore.mjs` | 75 | WG- | service_role | wave2-reachability-restore.mjs — reverse wave2-cleanup-execute's false-negatives. |
| `wave5-design-questions-flags-write.mjs` | 397 | W-- | service_role | wave5-design-questions-flags-write.mjs — Wave 5 design-questions dispatch. |

## Appendix B — per-file classification, subdirectories

| File | Lines | Flags | Creds | Purpose (header) |
|---|---|---|---|---|
| `_dataops/interlock.mjs` | 45 | --I | - | ── RE-RUN INTERLOCK for ALREADY-EXECUTED Sprint-4 data-op scripts ── |
| `_diag/_03b-check.mjs` | 9 | --- | - | import { resolve, dirname } from "node:path"; |
| `_diag/_03b-eligible.mjs` | 18 | --- | - | import { resolve, dirname } from "node:path"; |
| `_diag/_50c-gate.mjs` | 36 | --- | - | READ-ONLY: the exact provenance verdict for 50ccd5cc + the claim-kind/derived-tier distr |
| `_diag/_50c-post.mjs` | 26 | --- | - | import { resolve, dirname } from "node:path"; |
| `_diag/_50c-resolve-deferral.mjs` | 41 | WG- | - | CLOSEOUT (run at Step-2b ship): re-record 50ccd5cc's disposition. The item is now proven |
| `_diag/_50c-state.mjs` | 46 | --- | - | READ-ONLY state of 50ccd5cc before any re-ground. Establishes the verification contract: |
| `_diag/_allstatus-rederive.mjs` | 17 | W-- | db_password | import pg from "pg";import{readFileSync}from"node:fs";import{resolve,dirname}from"node:p |
| `_diag/_anthropic-err.mjs` | 18 | --- | anthropic | import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url"; |
| `_diag/_archive-e44.mjs` | 22 | WG- | - | import { resolve, dirname } from "node:path"; |
| `_diag/_assess-quarantine.mjs` | 29 | --- | - | READ-ONLY: tally the validate_item_provenance failure classes across all live quarantine |
| `_diag/_backlog-dispose.mjs` | 111 | WG- | - | BACKLOG TRIAGE + DISPOSE (within-bound + crossed quarantined items not yet deferred). |
| `_diag/_backward-scope.mjs` | 73 | --- | service_role | READ-ONLY backward-batch scoping (no writes, no spend). Measures the unified-operation b |
| `_diag/_batch1-flip-projection.mjs` | 39 | --- | - | READ-ONLY batch-1 FLIP PROJECTION (owed item 3). For each of the 47 non-verified items,  |
| `_diag/_batch1-quote-refresh.mjs` | 44 | --- | - | READ-ONLY refreshed BATCH-1 quote (post-T1). Scope = the full current non-verified non-a |
| `_diag/_batch-candidates.mjs` | 31 | --- | - | READ-ONLY: classify the 70 quarantined items by failure class + whether a STORED POOL ex |
| `_diag/_blast-radius.mjs` | 71 | --- | - | BLAST-RADIUS (read-only): how many currently-VERIFIED reg-family items would re-quaranti |
| `_diag/_bl-test.mjs` | 12 | --- | browserless | import { readFileSync } from "node:fs";import { resolve, dirname } from "node:path";impo |
| `_diag/_build-gate-check.mjs` | 58 | --- | service_role | READ-ONLY build-gate check (retrieval-before-construction applied to the build). Answers |
| `_diag/_cascade-progress.mjs` | 13 | --- | - | import { resolve, dirname } from "node:path"; |
| `_diag/_cascade-scope.mjs` | 43 | --- | - | READ-ONLY: the ground-only-eligible cascade set + cost estimate. Eligible = quarantined, |
| `_diag/_cat2-classify5.mjs` | 34 | --- | - | READ-ONLY: classify the 5 remaining cat-2 quarantined items by their BLOCKING path so th |
| `_diag/_cat2-remaining.mjs` | 25 | --- | - | READ-ONLY: of the cat-2 oversize-section set, how many QUARANTINED remain to re-ground t |
| `_diag/_cat3b.mjs` | 62 | --- | - | READ-ONLY: Category-3B — mid-band (2–12KB) pool rows that are FLOOR-QUALIFYING primaries |
| `_diag/_cat-audit.mjs` | 80 | --- | - | READ-ONLY ($0) CATEGORIZATION-INTEGRITY AUDIT. The GLEC case revealed a class: a news pa |
| `_diag/_cbam-fail-detail.mjs` | 44 | --- | service_role | READ-ONLY: why did CBAM (51b2c91e) quarantine after re-ground? Uses the AUDITED schema: |
| `_diag/_cbam-pool-2083.mjs` | 32 | --- | service_role | RD-8 RETRIEVAL CHECK (read-only): before adding/fetching Reg (EU) 2025/2083 for CBAM, is |
| `_diag/_cbam-prove.mjs` | 85 | --- | service_role | PROVE-ON-ONE harness for the BACKWARD promote-from-pool operation, on the live CBAM item |
| `_diag/_check-cat2b.mjs` | 12 | --- | - | import { resolve, dirname } from "node:path"; |
| `_diag/_check-d5.mjs` | 15 | --- | - | import { resolve, dirname } from "node:path"; |
| `_diag/_check-happy.mjs` | 12 | --- | - | import { resolve, dirname } from "node:path"; |
| `_diag/_clean-stale-trunc-flags.mjs` | 29 | W-- | - | One-off cleanup: delete the STALE synthesis-budget coverage_gap flags the PRE-refinement |
| `_diag/_closeout-notes.mjs` | 28 | --- | - | import { resolve, dirname } from "node:path"; |
| `_diag/_completeness-extract.mjs` | 51 | --- | - | READ-ONLY: extract the per-category completeness lists → _plans/completeness-audit.json  |
| `_diag/_convergence-strand-check.mjs` | 44 | --- | service_role | READ-ONLY: is the convergence engine's output stranded (effective_tier never diverges) o |
| `_diag/_counsel-split.mjs` | 35 | --- | - | READ-ONLY: full untruncated hold reasons + created_by for every counsel/NO_SOURCE-held n |
| `_diag/_csrd-gate-proof.mjs` | 95 | W-- | - | PROOF: Layer B (cross-item write-path gate) + Layer C (block-next-run + disposition) end |
| `_diag/_decision-package-dump.mjs` | 57 | --- | - | READ-ONLY decision-package dump (Earth-Exhaustion doctrine). Emits, for EVERY non-verifi |
| `_diag/_defer-clock.mjs` | 12 | --- | - | import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url"; |
| `_diag/_deferral-forensic.mjs` | 44 | --- | service_role | READ-ONLY forensic: are the standing deferrals genuine individual dispositions or a bulk |
| `_diag/_discovery-recovery-check.mjs` | 67 | --- | - | READ-ONLY: where do discovered ENACTED-TEXT URLs already live? Before any re-discovery,  |
| `_diag/_dup-classification-map.mjs` | 81 | --- | service_role | READ-ONLY duplicate-CLASSIFICATION map (no merges). Uses the CANONICAL resolver grouping |
| `_diag/_dup-e44.mjs` | 19 | --- | - | import { resolve, dirname } from "node:path"; |
| `_diag/_dwell-dist.mjs` | 17 | --- | - | import { resolve, dirname } from "node:path"; |
| `_diag/_e2-archive8.mjs` | 45 | W-- | - | E2: archive the 8 operator-confirmed destructive archives (4 dup-of-verified + 4 off-ver |
| `_diag/_e2-defer59.mjs` | 96 | WG- | - | E2: record a VALID 14-day Lane-#4 deferral on the 59 keep+reg items genuinely blocked on |
| `_diag/_e2-erase-evidence.mjs` | 42 | --- | - | READ-ONLY: dump full evidence for the 10 ERASE candidates + 2 RELABEL regs (title, url,  |
| `_diag/_e2-reclassify.mjs` | 31 | W-- | - | E2 reclassify-to-source (2 items): register the portal as a scannable source + archive t |
| `_diag/_e2-triage.mjs` | 133 | -G- | - | READ-ONLY E2 triage DRY-RUN (no mutations, no network — DB reads + validate RPC only). |
| `_diag/_endstate.mjs` | 36 | -G- | - | Authoritative end-state from the DB (not run logs): KEEP-57 + flagships + the 2 regs. |
| `_diag/_entity-live-proof.mjs` | 31 | --- | - | READ-ONLY live proof of the entity resolver against the REAL corpus (no writes). Confirm |
| `_diag/_entity-probe.mjs` | 24 | --- | - | import { resolve, dirname } from "node:path"; |
| `_diag/_errorbody-blast.mjs` | 57 | --- | - | READ-ONLY BLAST RADIUS (dispatch item 2): every FACT claim whose grounded capture is an  |
| `_diag/_eudr-t3-diag.mjs` | 47 | --- | service_role | READ-ONLY: WHY are EUDR's sub-floor (T3) FACT claims T3, and is the fix INTERNAL or a TA |
| `_diag/_eurlex-probe.mjs` | 29 | --- | - | 1-unit Browserless probe: does the CSRD enacted-text page (EUR-Lex CELEX:32022L2464) roa |
| `_diag/_failure-class-diag.mjs` | 94 | --- | - | DIAGNOSE-BEFORE-BATCH (read-only). Separates the two failure classes behind the 78 cross |
| `_diag/_find-csrd.mjs` | 10 | --- | - | import { resolve, dirname } from "node:path"; |
| `_diag/_find-happy-candidate.mjs` | 12 | --- | - | import { resolve, dirname } from "node:path"; |
| `_diag/_find-ppwr.mjs` | 13 | --- | - | import { resolve, dirname } from "node:path"; |
| `_diag/_fix-type-split.mjs` | 76 | --- | service_role | READ-ONLY three-way fix-type split for the backward floor problem (no spend, no fetch).  |
| `_diag/_fix-type-split2.mjs` | 59 | --- | service_role | READ-ONLY tightened three-way fix-type split (v2). Firms the v1 heuristic before a hard  |
| `_diag/_funded-preflight.mjs` | 68 | --- | - | READ-ONLY funded-pass preflight probe (item 8 investigation-first). Establishes LIVE gro |
| `_diag/_gate-verdict-proof.mjs` | 42 | --- | - | READ-ONLY proof of the Layer B gate's verdict on REAL verified items (no Sonnet spend).  |
| `_diag/_glec-compare.mjs` | 36 | --- | - | READ-ONLY: full side-by-side of the two GLEC items so the operator can decide keep-vs-ar |
| `_diag/_glec-edges.mjs` | 47 | --- | - | READ-ONLY ground truth: are the GLEC-cluster ITEMS actually connected in the live cross- |
| `_diag/_glec-quote.mjs` | 41 | --- | - | READ-ONLY: (1) characterize 4939b133 "GLEC (Air Freight)" vs the cluster (distinct cut o |
| `_diag/_glectest.mjs` | 12 | --- | - | const U = "https://www.smartfreightcentre.org/en/our-programs/emissions-accounting/globa |
| `_diag/_ground-flagships.mjs` | 31 | --- | - | 2 (high-value slice): ground CSRD + ETS-maritime (now whole briefs) to customer-ready vi |
| `_diag/_ground-one.mjs` | 26 | --- | - | THROWAWAY: isolate ONE streamed groundBrief call to confirm it RETURNS (vs the non-strea |
| `_diag/_ground-only.mjs` | 41 | --- | service_role | Ground-only re-run (no regenerate) + claim inspection, for the WS1 prove-on-one. The bri |
| `_diag/_grow-diagnose.mjs` | 31 | --- | - | Diagnose what the grow pass added so it can be precisely reversed if needed. |
| `_diag/_grow-pass.mjs` | 26 | --- | - | Run the GROW step (registerCitedSources + compound) that the ad-hoc reground/regen runne |
| `_diag/_grow-revert.mjs` | 25 | WG- | - | Revert the batch grow-pass over-registration: delete the 135 provisional sources it crea |
| `_diag/_happy-path-proof.mjs` | 54 | W-- | - | HAPPY-PATH proof: a CLEAN item completes through the FULL gated workflow — grounds (per- |
| `_diag/_host-tiers.mjs` | 9 | --- | - | import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url"; |
| `_diag/_icc.mjs` | 8 | --- | db_password | import pg from "pg";import{readFileSync}from"node:fs";import{resolve,dirname}from"node:p |
| `_diag/_ledger-check.mjs` | 10 | --- | - | import { resolve, dirname } from "node:path"; |
| `_diag/_legal-guard-blast.mjs` | 33 | --- | service_role | READ-ONLY blast-radius probe for the criterion-4 legal-line guard (WS1 edit 4). The guar |
| `_diag/_libbl.mjs` | 16 | --- | - | import { resolve, dirname } from "node:path"; |
| `_diag/_libtest.mjs` | 13 | --- | - | const U = "https://www.smartfreightcentre.org/en/skills/library/measuring-and-reporting- |
| `_diag/_loop-proof.mjs` | 59 | W-- | service_role | LOOP PROOF: take a real, currently-untracked regulation through the FULL generateBriefWo |
| `_diag/_mergestate.mjs` | 15 | --- | db_password | import pg from "pg";import{readFileSync}from"node:fs";import{resolve,dirname}from"node:p |
| `_diag/_named-breach.mjs` | 23 | --- | - | import { resolve, dirname } from "node:path"; |
| `_diag/_nonfact-stamp-diag.mjs` | 42 | --- | service_role | DIAGNOSTIC (read-only). (A) characterize non-FACT-stamped claims (claims-tier violations |
| `_diag/_nullrole.mjs` | 8 | --- | db_password | import pg from "pg";import{readFileSync}from"node:fs";import{resolve,dirname}from"node:p |
| `_diag/_pathb-batch.mjs` | 73 | --- | service_role | PATH B BATCH — the 9 enacted clean-win items. Per item: generateBriefRefreshPrimary (ful |
| `_diag/_pause-gate-verify.mjs` | 63 | --- | service_role | READ-ONLY Phase 0.1 proof + forcing-function candidate. |
| `_diag/_pdf-probe.mjs` | 52 | --- | - | PROBE (scratch): confirm unpdf extracts text in THIS node before wiring it into the tran |
| `_diag/_persistence-confirm.mjs` | 57 | --- | - | import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url"; |
| `_diag/_phase1-cycle-proof.mjs` | 65 | W-- | - | Phase 1 TRIGGER proof (reversible): reputation recompute is now an END-OF-CYCLE STEP in |
| `_diag/_phase1-e2e-proof.mjs` | 95 | W-- | - | Phase 1 END-TO-END proof (reversible). Proves, against the LIVE DB + the REAL code: |
| `_diag/_phase1-moat-resolver-test.mjs` | 29 | --- | - | Phase 1 STEP 1 proof (pure, no DB): the reg-fact resolver (buildResolver/resolveSpan) is |
| `_diag/_phase2-reground.mjs` | 71 | --- | - | Phase 2 RE-GROUND probe (read-only) + 50ccd5cc details. Grounds the hierarchy plan in re |
| `_diag/_phase2-salvage.mjs` | 48 | --- | - | 50ccd5cc salvageability test (operator-sanctioned). (1) what did its generation STORE as |
| `_diag/_phase41-null.mjs` | 36 | W-- | - | Phase 4.1 DATA fix: NULL source_tier_at_grounding on the errant non-FACT claims (SC-7).  |
| `_diag/_phase41-probe.mjs` | 44 | --- | - | READ-ONLY Phase 4.1 blast-radius probe. SC-7: a non-FACT claim's source_tier_at_groundin |
| `_diag/_phase4-blast.mjs` | 88 | --- | - | Phase 4 READ-ONLY blast-radius probe (verification-before-authorization). |
| `_diag/_phase4-confirm.mjs` | 47 | --- | - | Phase 4 END-TO-END production confirm (read-only). Calls the LIVE validate_item_provenan |
| `_diag/_phase4-item-check.mjs` | 29 | --- | - | import { resolve, dirname } from "node:path"; |
| `_diag/_portal-promotable.mjs` | 47 | --- | service_role | READ-ONLY: for the PORTAL-sourced sub-floor items, does the pool contain a PROMOTABLE en |
| `_diag/_ppwr-exceptions.mjs` | 26 | --- | - | import { resolve, dirname } from "node:path"; |
| `_diag/_ppwr-exceptions2.mjs` | 23 | --- | - | import { resolve, dirname } from "node:path"; |
| `_diag/_ppwr-prove.mjs` | 78 | --- | service_role | PROVE-ON-ONE harness for the truncation fix, on the live PPWR item (efdb3390, type=regul |
| `_diag/_ppwr-snippets.mjs` | 25 | --- | - | import { resolve, dirname } from "node:path"; |
| `_diag/_primary-hunt.mjs` | 19 | --- | - | import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url"; |
| `_diag/_primary-hunt2.mjs` | 23 | --- | anthropic | import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url"; |
| `_diag/_primary-hunt3.mjs` | 20 | --- | - | import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url"; |
| `_diag/_probe-e44.mjs` | 24 | --- | - | import { resolve, dirname } from "node:path"; |
| `_diag/_quarantine-classes.mjs` | 29 | --- | - | import { readClient } from "../lib/db.mjs"; |
| `_diag/_quarantine-why.mjs` | 26 | --- | - | import { readClient } from "../lib/db.mjs"; |
| `_diag/_quote-reconcile.mjs` | 47 | --- | - | READ-ONLY quote-scope reconciliation: the 45 completeness-exposure flags vs the re-fetch |
| `_diag/_recon-exists.mjs` | 18 | --- | db_password | import pg from "pg";import{readFileSync}from"node:fs";import{resolve,dirname}from"node:p |
| `_diag/_refetch-quote.mjs` | 32 | --- | - | import { resolve, dirname } from "node:path"; |
| `_diag/_reg-dedup-match.mjs` | 103 | --- | - | DEDUP-MATCH (read-only, FREE): split the re-point universe into the three exact sub-ops  |
| `_diag/_regen-one.mjs` | 24 | --- | - | Empirical test: does the FROM-STORED regen path fix an analysis_missing_label_syntax ite |
| `_diag/_register-2083.mjs` | 28 | W-- | - | Register Reg (EU) 2025/2083 (CBAM amending regulation, enacted EU law on EUR-Lex). Guard |
| `_diag/_reg-promote-from-pool.mjs` | 100 | WG- | - | PROMOTE-FROM-POOL (default: READ-ONLY DRY-RUN). The enacted URLs were ALREADY discovered |
| `_diag/_reground-item.mjs` | 77 | --- | service_role | REUSABLE backward-batch re-ground runner (one item). Optional guarded promote-from-pool  |
| `_diag/_reground-probe.mjs` | 10 | --- | - | import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url"; |
| `_diag/_reg-source-audit.mjs` | 54 | --- | - | READ-ONLY corpus diagnostic: how many regulation-family items have a PORTAL / LANDING-pa |
| `_diag/_reg-source-stage0.mjs` | 89 | --- | - | STAGE 0 (read-only, FREE — no fetch, no LLM): firm the backward scope. Refined URL class |
| `_diag/_reg-state.mjs` | 14 | --- | - | import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url"; |
| `_diag/_restore-ets.mjs` | 23 | --- | - | Restore ETS-maritime (erased over an ungrounded cited URL) through the fixed workflow: c |
| `_diag/_s3test.mjs` | 12 | --- | - | const U = "https://smart-freight-centre-media.s3.amazonaws.com/documents/240129_EV_Emiss |
| `_diag/_salvage2.mjs` | 15 | --- | browserless | import { resolve, dirname } from "node:path"; |
| `_diag/_schema-audit.mjs` | 33 | --- | service_role | READ-ONLY SCHEMA AUDIT: enumerate the actual columns (+ a sample value's type) of every  |
| `_diag/_scp-cols.mjs` | 9 | --- | - | import { resolve, dirname } from "node:path"; |
| `_diag/_scrape-hold-check.mjs` | 45 | --- | service_role | READ-ONLY: is the scraping HOLD actually honored RIGHT NOW? The hold is data-gated: |
| `_diag/_scrape-hold-stop.mjs` | 38 | W-- | - | STOP THE SCRAPE — honor the operator HOLD (2026-06-28), authorized by Jason. |
| `_diag/_scrape-schedule-test.mjs` | 54 | --- | - | Unit test for the PURE scrape-schedule logic (no DB). Proves scrapeWindowOpen + nextScra |
| `_diag/_scrape-schedule-verify.mjs` | 67 | W-- | - | END-TO-END proof that the global scrape SCHEDULE governs behavior (not just renders). Gu |
| `_diag/_sonnet-big.mjs` | 6 | --- | anthropic | const ROOT=new URL("../../",import.meta.url).pathname.replace(/^\//,""); try{process.loa |
| `_diag/_source-count-breakdown.mjs` | 40 | --- | service_role | READ-ONLY: is 1185 sources inflated? break down by status/admin_only/base_tier + institu |
| `_diag/_src-url-check.mjs` | 25 | --- | service_role | READ-ONLY: of the sub-floor reg items, how many have an ENACTED source_url vs a PORTAL s |
| `_diag/_stream-vs-nonstream.mjs` | 59 | --- | anthropic | THROWAWAY DIAGNOSTIC (uncommitted). Discriminates WHY the real grounding call (non-strea |
| `_diag/_subfloor-split.mjs` | 54 | --- | service_role | READ-ONLY corpus-wide sub-floor diagnosis (no spend, no fetch). For every reg-family ite |
| `_diag/_system-proof.mjs` | 66 | --- | service_role | SYSTEM-LEVEL PROOF that #158 stopped the NULL-stamp ERROR CLASS (not an item-level proof |
| `_diag/_t1-selector.mjs` | 48 | --- | - | READ-ONLY T1 selector: the chokepoint-re-ground set = quarantined + not-archived + pool> |
| `_diag/_test-aster.mjs` | 50 | --- | db_password | Test the ASTERISK-OPTIONAL label regex BEFORE another migration apply: does it (a) fix t |
| `_diag/_timing-probe.mjs` | 14 | --- | anthropic | import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url"; |
| `_diag/_truncation-exposure.mjs` | 69 | --- | - | TRUNCATION EXPOSURE (read-only): how many VERIFIED items were synthesised/grounded again |
| `_diag/_truncation-scope.mjs` | 51 | --- | - | READ-ONLY: scope the truncation exposure in CAPTURED pool data + grounding inputs across |
| `_diag/_tryboth.mjs` | 20 | --- | - | import { resolve, dirname } from "node:path"; |
| `_diag/_twopass-proof.mjs` | 34 | --- | - | PROOF: regenerate CSRD + ETS-maritime through the new 2-pass generation (ledger dropped) |
| `_diag/_two-reg-state.mjs` | 16 | --- | - | import { readClient } from "../lib/db.mjs"; |
| `_diag/_unreg-span-diag.mjs` | 59 | --- | service_role | READ-ONLY root-cause check for the unregistered-span-host FAIL. Hypothesis: FACT spans a |
| `_diag/_verify-142.mjs` | 43 | --- | db_password | READ-ONLY verification of migration 142 (legal-line guard). Confirms: (1) the function c |
| `_diag/_verify-143.mjs` | 51 | --- | db_password | Verify migration 143: (1) the variant-tolerant label regex compiles + behaves (tolerant  |
| `_diag/_wave-dedup.mjs` | 90 | --- | - | READ-ONLY ($0) wave dedup analysis. Before spending ANYTHING on re-grounding the quarant |
| `_diag/_wave-dedup2.mjs` | 46 | --- | - | READ-ONLY ($0) SHARPER dedup: the 0.6-jaccard pass MISSED 50ccd5cc==3581c084 (verbose ne |
| `_diag/_wave-dedup3.mjs` | 81 | --- | - | READ-ONLY ($0) DEFINITIVE entity-level dedup. Matches on REGULATION/ENTITY IDENTITY, not |
| `_diag/artifact-check.mjs` | 40 | --- | service_role | Rule-4 artifact check (fixed id matching + error capture). */ |
| `_diag/built-coverage.mjs` | 17 | --- | - | import { resolve, dirname } from "node:path"; |
| `_diag/c4-fail.mjs` | 13 | --- | service_role | import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url";  |
| `_diag/c4-sample.mjs` | 17 | --- | service_role | Criterion-4 fix sample validation: 5 quarantined REGs + 2 quarantined NON-REG (market+re |
| `_diag/cell-inventory.mjs` | 56 | --- | db_password | cell-inventory.mjs — READ-ONLY master inventory: every table, every cell (column), |
| `_diag/census-enum.mjs` | 16 | --- | db_password | import pg from "pg"; import { readFileSync, writeFileSync } from "node:fs"; import { res |
| `_diag/classify-institutions.mjs` | 125 | --- | - | PHASE 0' tier sheet (read-only). GOVERNING: source-credibility-model. |
| `_diag/classify-quarantine.mjs` | 60 | --- | - | READ-ONLY quarantine classifier (no writes, no Browserless). Classify-before-spend: |
| `_diag/col-check.mjs` | 7 | --- | service_role | import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url";  |
| `_diag/connection-completeness.mjs` | 193 | W-- | db_password | connection-completeness.mjs — READ-ONLY. |
| `_diag/content-45.mjs` | 42 | --- | - | READ-ONLY: dump the ACTUAL stored content of each of the 45 flips (from the snapshot ori |
| `_diag/diag-update-error.mjs` | 18 | W-- | - | import { resolve, dirname } from "node:path"; |
| `_diag/enumerate-institutions.mjs` | 71 | --- | - | PHASE 0' data backbone (read-only). Enumerate every claim-grounding host, grouped to ins |
| `_diag/exemplar-content.mjs` | 10 | --- | service_role | import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url";  |
| `_diag/fix-test-bucket.mjs` | 59 | --- | - | FIX RUN — TEST ONE PER BUCKET (Jason condition 1). Research-or-erase resolver attempt on |
| `_diag/flags-detail.mjs` | 16 | --- | - | import { resolve, dirname } from "node:path"; |
| `_diag/flags-peek.mjs` | 12 | --- | - | import { resolve, dirname } from "node:path"; |
| `_diag/forced-rpc-error-test.mjs` | 36 | --- | service_role+db_password | Forced RPC-error verification of the fail-CLOSED fix. Breaks get_research_items (RAISE), |
| `_diag/gf-after.mjs` | 10 | --- | service_role | import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url";  |
| `_diag/gf-classify.mjs` | 349 | --- | service_role | READ-ONLY: Classify guidance/framework items as KEEP (genuinely regulatory) |
| `_diag/guard-exposure.mjs` | 23 | --- | db_password | guard-exposure.mjs — READ-ONLY: is the provenance flip-guard actually enforcing? */ |
| `_diag/handoff-counts.mjs` | 9 | --- | - | import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url"; |
| `_diag/identity-and-shells.mjs` | 56 | --- | db_password | identity-and-shells.mjs — READ-ONLY: (1) how is regulation identity stored? (2) why do e |
| `_diag/important-sources-state.mjs` | 22 | --- | db_password | READ-ONLY. Registry state of the operator-flagged important sources: are they registered |
| `_diag/ingestion-state-readers.mjs` | 47 | --- | db_password | ingestion-state-readers.mjs — READ-ONLY: every function/view/trigger body + matview |
| `_diag/institution-diagnose.mjs` | 36 | --- | db_password | READ-ONLY. WHY 432 institutions? Size distribution, the singleton tail, and whether the |
| `_diag/institution-resort.mjs` | 53 | --- | db_password | READ-ONLY. Re-sorts multi-source institutions into (i) DISTINCT documents (keep, tagged) |
| `_diag/inst-reclassify.mjs` | 17 | W-- | service_role | import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url";  |
| `_diag/investigate-45-flips.mjs` | 102 | --- | - | READ-ONLY recoverability investigation for the redo's verified->quarantined flips. |
| `_diag/item-cols.mjs` | 12 | --- | - | import { resolve, dirname } from "node:path"; |
| `_diag/label-coherence.mjs` | 19 | --- | db_password | READ-ONLY. Does the label follow from what the source IS? Show role vs category vs |
| `_diag/mistitle-scan.mjs` | 117 | --- | db_password | mistitle-scan.mjs — READ-ONLY: detect title-vs-regulation mismatches. No mutations. |
| `_diag/mistitle-verified-probe.mjs` | 48 | --- | db_password | mistitle-verified-probe.mjs — READ-ONLY deep-dive on the 4 verified flags + the 2025/40  |
| `_diag/mit-ground-diag.mjs` | 28 | --- | service_role | Diagnose MIT Climate Machine (88c3a053) 0-FACT grounding: was the stored generate pool e |
| `_diag/off-domain-candidates.mjs` | 52 | --- | service_role | READ-ONLY: surface likely OFF-DOMAIN items (off the freight-sustainability |
| `_diag/off-domain-detail.mjs` | 48 | --- | service_role | READ-ONLY: fuller detail on the 13 off-domain candidates — content excerpt, |
| `_diag/offdomain-surface.mjs` | 34 | --- | service_role | offdomain-surface.mjs — READ-ONLY: surface active off-domain/off-vertical archive candid |
| `_diag/ops-0fact-diag.mjs` | 14 | --- | service_role | import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url";  |
| `_diag/persistence-coverage.mjs` | 34 | --- | - | import { resolve, dirname } from "node:path"; |
| `_diag/plumbing.mjs` | 22 | --- | db_password | import pg from "pg"; import { readFileSync } from "node:fs"; import { resolve, dirname } |
| `_diag/probe-corrected.mjs` | 47 | --- | - | CORRECTED substrate + 45-flip probe. Counts claims/sections via PAGINATED full-table rea |
| `_diag/probe-dup-host-regexposure.mjs` | 47 | --- | - | Does the duplicate-source-row / inconsistent-tier defect affect the REG flip count, or o |
| `_diag/probe-f1-canonical.mjs` | 58 | --- | - | A3: honest flip set under the CANONICAL institution resolver reading ACTUAL DB tiers (po |
| `_diag/probe-f1-crosstab.mjs` | 85 | --- | - | P0-1 flags 5 + 6: per-item x real-tier crosstab for the F1 blast radius, plus the T7 sub |
| `_diag/probe-f1-crosstab2.mjs` | 91 | --- | - | P0-1 correction 5: CORRECTED corpus-wide crosstab. GOVERNING: remediation-discipline. |
| `_diag/probe-f1-fake-tier.mjs` | 110 | --- | - | P0-1 (F1 FAKE CERTIFICATION) read-only probe. GOVERNING: remediation-discipline. |
| `_diag/probe-f1-host-triage.mjs` | 56 | --- | - | P0-1 PHASE 0a triage worksheet (read-only). GOVERNING: source-credibility-model. |
| `_diag/probe-f1-sim.mjs` | 78 | --- | - | P0-1 PHASE 0a SIMULATION (read-only). GOVERNING: source-credibility-model + remediation- |
| `_diag/probe-f1-t7bulk.mjs` | 52 | W-- | - | P0-1 correction 7 (read-only): registry sources at T7/default tier, esp. bulk register-a |
| `_diag/probe-live-checks.mjs` | 26 | --- | db_password | READ-ONLY: dump the LIVE CHECK constraint definitions on intelligence_items straight fro |
| `_diag/probe-live-constraints.mjs` | 33 | --- | - | READ-ONLY probe: resolve the migration-vs-snapshot discrepancy on intelligence_items.sev |
| `_diag/probe-nonreg-floor-calibration.mjs` | 47 | --- | - | READ-ONLY: ground the Stage-D1 non-reg authority-floor calibration. Per non-reg item_typ |
| `_diag/probe-phase0-prep.mjs` | 38 | --- | - | P0-1 PHASE 0 write-input prep (read-only). Gathers exactly what the guarded execute scri |
| `_diag/probe-phase2-composition.mjs` | 58 | --- | - | STAGE C step 2 — COMPOSITION PROBE across the 30 flip items (read-only). Per item, count |
| `_diag/probe-reg-family-buckets.mjs` | 62 | --- | - | READ-ONLY spot-check for migration-137 carry-condition A (Jason): the slot×item_type mat |
| `_diag/probe-relabel-shape.mjs` | 94 | --- | - | READ-ONLY probe (Phase 2 (b)-NARROW build): for the 30 flip items, inspect every below-f |
| `_diag/probe-summary-contamination.mjs` | 58 | --- | - | READ-ONLY: detect cross-contaminated `summary` fields (the ReFuelEU 6f1e6615 class — sum |
| `_diag/probe-verified-substrate.mjs` | 51 | --- | - | READ-ONLY: is the corpus-wide 'verified' label backed by a real grounding ledger, or sta |
| `_diag/proof-promote-guard.mjs` | 34 | --- | db_password | READ-ONLY. Replicates the EXACT promote dedup-guard logic against test URLs to prove a |
| `_diag/provenance-substrate-probe.mjs` | 103 | --- | service_role | provenance-substrate-probe.mjs  — READ-ONLY diagnostic. |
| `_diag/reclassify-gf.mjs` | 22 | WG- | service_role | Reclassify mis-typed guidance/framework items + archive portal artifacts (Agent-1 correc |
| `_diag/reconcile-verify.mjs` | 31 | W-- | service_role | Integration test: recordItemChange writes intelligence_changes (the writer-less table),  |
| `_diag/reconcile-worker-verify.mjs` | 51 | W-- | service_role | End-to-end verify of the reconcile worker against the LIVE Supabase: inject a simulated |
| `_diag/recon-gapfill.mjs` | 54 | --- | db_password | recon-gapfill.mjs — READ-ONLY: inventory + create-path constraints + provenance-freshnes |
| `_diag/recon-mechanisms-probe.mjs` | 53 | --- | service_role | recon-mechanisms-probe.mjs — READ-ONLY rowcounts for reconciliation mechanisms. */ |
| `_diag/reground.mjs` | 17 | --- | service_role | import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url";  |
| `_diag/rerun-items.mjs` | 22 | --- | service_role | import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url";  |
| `_diag/research-sections-check.mjs` | 8 | --- | service_role | import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url";  |
| `_diag/revalidate-141.mjs` | 36 | -G- | db_password | Corpus revalidation after migration 141 (status-is-a-cache). Captures research_finding + |
| `_diag/rotation-verify.mjs` | 32 | --- | service_role | Rotation verify-then-clear: mechanically confirm the CURRENT service-role key was NEVER  |
| `_diag/rpc-health.mjs` | 11 | --- | service_role | import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url";  |
| `_diag/screen-stored-pools.mjs` | 64 | --- | - | READ-ONLY stored-pool quality screen over the redo queue (skill-conformance-audit flagge |
| `_diag/sections-cols.mjs` | 11 | --- | - | import { resolve, dirname } from "node:path"; |
| `_diag/skill-version-dist.mjs` | 20 | --- | - | import { resolve, dirname } from "node:path"; |
| `_diag/source-dup-diagnosis.mjs` | 28 | --- | db_password | READ-ONLY. WHY do duplicate sources exist + at what scale. Shows the flagged dupes in |
| `_diag/source-health.mjs` | 78 | --- | service_role | source-health.mjs — Browserless liveness audit of the source registry. |
| `_diag/source-host-reachability.mjs` | 113 | --- | service_role | Zero-unit reachability sweep across ALL active sources. |
| `_diag/source-merge-measure.mjs` | 47 | --- | db_password | READ-ONLY. Splits the duplicate problem into the SAFE auto-merge set (rows sharing the |
| `_diag/source-relevance-audit.mjs` | 177 | --- | service_role | READ-ONLY source relevance audit. Writes NOTHING to the DB. |
| `_diag/source-relevance-grounded.mjs` | 81 | --- | - | Grounded keep/cut sheet — applies the PER-JURISDICTION freight-sustainability-lawmaking |
| `_diag/sources-classification-state.mjs` | 25 | --- | db_password | sources-classification-state.mjs — READ-ONLY. What classification already exists on the |
| `_diag/sources-finalize-gap.mjs` | 34 | --- | db_password | sources-finalize-gap.mjs — READ-ONLY. The exact unfinalized set: NULL source_role, low/n |
| `_diag/source-vs-item-screen.mjs` | 37 | --- | - | READ-ONLY source-vs-item screen (source-credibility-model). Flags quarantined intelligen |
| `_diag/spotcheck-pulse.mjs` | 16 | --- | - | import { resolve, dirname } from "node:path"; |
| `_diag/status-by-sections.mjs` | 52 | --- | service_role | READ-ONLY: cross-tab provenance_status × has-sections for active items. */ |
| `_diag/status-rundown.mjs` | 37 | --- | service_role | status-rundown.mjs — READ-ONLY corpus + source snapshot for a status report. */ |
| `_diag/surface-exemplars.mjs` | 48 | --- | service_role | Build-contract exemplar validation: ONE item per surface (Market, Technology, Operations |
| `_diag/table-inventory.mjs` | 60 | --- | db_password | table-inventory.mjs — READ-ONLY: list all public tables with column count + row count. * |
| `_diag/tech-candidates.mjs` | 7 | --- | service_role | import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url";  |
| `_diag/tech-quarantine-diag.mjs` | 15 | --- | service_role | import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url";  |
| `_diag/test-metadata-persist.mjs` | 17 | --- | - | import { resolve, dirname } from "node:path"; |
| `_diag/test-one-metadata.mjs` | 87 | -G- | - | TEST-ONE (operator directive "before we run all of them we must test one"): run the REDO |
| `_diag/tier-map.mjs` | 67 | --- | - | Ratified canonical institutional tiers (Jason 2026-06-11), per source-credibility-model. |
| `_diag/tool-triage.mjs` | 19 | --- | service_role | Slot-fit triage (read-only): categorize item_type='tool' items -> institutional-body (-> |
| `_diag/triage-45-value.mjs` | 62 | --- | - | READ-ONLY value triage for the 45 flip pilot (research-or-erase audit #1, value-first). |
| `_diag/vacuous-check.mjs` | 22 | --- | - | import { resolve, dirname } from "node:path"; |
| `_diag/verify-137.mjs` | 45 | --- | - | READ-ONLY post-apply verification for migration 137. Asserts: |
| `_diag/verify-conformance-flags.mjs` | 18 | --- | - | import { resolve, dirname } from "node:path"; |
| `_diag/verify-failclose-flip.mjs` | 45 | --- | service_role | READ-ONLY: verify by OUTCOME that the stored provenance_status distribution |
| `_diag/wave2-impact.mjs` | 55 | --- | service_role | wave2-impact.mjs — READ-ONLY assessment of wave2-cleanup-execute's Step-1 damage. |
| `_diag/what-we-pull.mjs` | 22 | --- | db_password | READ-ONLY. What type of information are we pulling from every source? That = the label. |
| `_reconciliation-2026-07-11/fix-analysis-labels.mjs` | 76 | WG- | service_role | Deterministic analysis_missing_label_syntax repair (zero spend), generalized from the |
| `_reconciliation-2026-07-11/fix-label-syntax-68e05861.mjs` | 59 | WG- | service_role | Phase 1.2 — deterministic label-syntax repair for 68e05861 (Japan MLIT), zero spend. |
| `_reconciliation-2026-07-11/flip-and-defer-floor-class.mjs` | 95 | WG- | service_role | Phase 1.4 disposition — honest quarantine + RD-6 deferral for the unrecovered floor-clas |
| `_reconciliation-2026-07-11/flip-touch-service.mjs` | 24 | W-- | service_role | Service-role revalidation touch (the sanctioned app path for verified<->quarantined; the |
| `_reconciliation-2026-07-11/floor-rehome-verified.mjs` | 110 | WG- | - | Phase 1 — FREE 4b re-home over the VERIFIED-but-failing floor-class population ($0, no m |
| `_reconciliation-2026-07-11/mig163-proof.mjs` | 59 | W-- | reconciler | Migration 163 post-apply proof (read-only effect: every write rolled back). |
| `_reconciliation-2026-07-11/pool-winnability-probe.mjs` | 49 | --- | - | Phase 1 probe #2 — pool WINNABILITY for the verified floor-class 62 ($0, read-only). |
| `_reconciliation-2026-07-11/q3-casino-delete-and-sweep.mjs` | 45 | WG- | - | Q-3 (site-gap register): value-delete the casino off-domain signal via the eligibility g |
| `_reconciliation-2026-07-11/register-and-restamp-hosts.mjs` | 64 | WG- | - | Unregistered-span-host fix (lane hard check): register the 4 hosts today's re-grounds |
| `_reconciliation-2026-07-11/renew-deferrals.mjs` | 86 | WG- | service_role | Phase 2.1 — drive UNDISPOSITIONED to 0: for every quarantined non-archived item lacking  |
| `_reconciliation-2026-07-11/rls-diag-reconciler.mjs` | 46 | W-- | reconciler | Diagnose the reconciler RLS WITH CHECK failure on intelligence_items (all rolled back).  |
| `_reground/reconcile-revalidate.mjs` | 66 | WG- | reconciler | RE-GROUND RECONCILIATION — reconciler-credential re-validation (2026-07-09, conservation |
| `archive/deletion-preview-title-only.mjs` | 84 | --- | service_role | _deletion-preview-title-only.mjs |
| `archive/phase2-step1-task6-inserts.mjs` | 88 | --- | db_password | _phase2-step1-task6-inserts.mjs |
| `archive/smoke-run-task3.mjs` | 149 | --- | service_role+anon | _smoke-run-task3.mjs |
| `archive/task4-backfill-preview.mjs` | 105 | --- | service_role | _task4-backfill-preview.mjs |
| `archive/task6-source-inserts-preview.mjs` | 89 | W-- | service_role | _task6-source-inserts-preview.mjs |
| `archive/write-deletion-preview-v2.mjs` | 158 | W-- | - | import { readFileSync, writeFileSync } from "node:fs"; |
| `cron/q7-daily-recompute.mjs` | 413 | WG- | service_role | q7-daily-recompute.mjs |
| `lib/anthropic.mjs` | 68 | --- | anthropic | Canonical Anthropic call site for SCRIPTS — the sanctioned direct-call wrapper. |
| `lib/batch1-orchestrate.mjs` | 143 | -G- | browserless | @ts-check |
| `lib/batch1-orchestrate.test.mjs` | 128 | --- | - | @ts-check |
| `lib/batch-primitives.mjs` | 283 | --- | - | batch-primitives.mjs |
| `lib/batch-primitives.test.mjs` | 163 | --- | - | Unit tests for batch-primitives. Run with: node --test fsi-app/scripts/lib/batch-primiti |
| `lib/block1-reaudit.mjs` | 227 | W-- | db_password | D3 Acceptance Test 2 — Block-1 re-audit by OUTCOME. READ-ONLY except SENTINEL rows |
| `lib/bootstrap-test1.mjs` | 161 | -G- | - | D3 Acceptance Test 1 — bootstrap suite. Re-catch this session's KNOWN failures, but |
| `lib/check-sources-decision.selftest.mjs` | 35 | --- | - | COMPOSITION fixture for check-sources' assessAndUpdateSource — asserts the eviction deci |
| `lib/db.mjs` | 245 | W-- | service_role | Guarded write helper — the PATH OF LEAST RESISTANCE for script row-mutations. |
| `lib/db.test.mjs` | 127 | W-- | - | Unit tests for the guarded source-registration helpers (db.mjs). Proves the load-bearing |
| `lib/decision-anchors.mjs` | 239 | --- | service_role+db_password | D3 section 3 — full decision-log anchoring (gap #3 wiring). FOUR verdicts. |
| `lib/decision-anchors.selftest.mjs` | 74 | --- | - | D3 section 3 — decision-anchor engine LAYER 1 (known-answer) + LAYER 2 (mutation). |
| `lib/decision-log-audit.mjs` | 110 | --- | db_password | D3 section 3 — full decision-log audit LAYER 3 (real run over the live log). READ-ONLY. |
| `lib/deferral.mjs` | 112 | --- | - | DEFERRAL GUARD (write-time validator + read-side validity helper) for the research-or-er |
| `lib/deferral.selftest.mjs` | 84 | --- | - | Discrimination proof for the deferral guard (research-or-erase / quarantine-disposition  |
| `lib/drift-check.mjs` | 99 | --- | - | D3 — drift-check engine (intent-vs-code). |
| `lib/drift-check.selftest.mjs` | 47 | --- | - | D3 drift-check — LAYER 1 (known-answer pairs) + LAYER 2 (mutation). |
| `lib/drift-check-reconstruction.mjs` | 56 | --- | - | D3 drift-check — LAYER 3 (real-artifact reconstruction). READ-ONLY (reads source). |
| `lib/entity-gate.selftest.mjs` | 93 | --- | - | Durable known-answer + mutation selftest for the entity gate (the portal-as-item leak fi |
| `lib/error-drop-probe.mjs` | 113 | --- | - | ── The `const { data } = await supabase…` WITHOUT `error` bug-class detector ── |
| `lib/error-drop-probe.selftest.mjs` | 59 | W-- | - | Discrimination selftest for the Supabase error-drop probe (HARD job — must pass). |
| `lib/exclusion-audit.mjs` | 109 | --- | - | D3 (c) — exclusion-surface x unreliable-method cross-product.  THE hard requirement. |
| `lib/exclusion-audit.selftest.mjs` | 66 | --- | - | D3 (c) — exclusion-audit LAYER 1 (known-answer pairs) + LAYER 2 (mutation). |
| `lib/exclusion-audit-reconstruction.mjs` | 79 | --- | db_password | D3 (c) — exclusion-audit LAYER 3 (real-artifact reconstruction). READ-ONLY (SELECTs). |
| `lib/fetch-negative-probe.mjs` | 157 | --- | - | D3 living-set probe — the "non-answer-as-negative" bug class. |
| `lib/fetch-now-decision.selftest.mjs` | 59 | --- | - | COMPOSITION fixture for the fetch-now route's FORM-1 + FORM-3 fix — replaces the prod-to |
| `lib/fetch-quality.mjs` | 59 | --- | - | Fetch-quality pre-filter, non-LLM. Mirror of |
| `lib/funded-release-plan.mjs` | 126 | --- | - | @ts-check |
| `lib/funded-release-plan.test.mjs` | 110 | --- | - | @ts-check |
| `lib/inconclusive-probe.mjs` | 249 | --- | - | ── THE BUG-CLASS DETECTOR — "non-answer resolved to a definitive answer" ── |
| `lib/inconclusive-probe.selftest.mjs` | 64 | W-- | - | Discrimination proof for the bug-class detector: each form FLAGS its known-bad shape and |
| `lib/inconclusive-report.mjs` | 35 | --- | - | Focused instance report for the bug-class detector: CANDIDATE_CORRUPT in LIVE paths only |
| `lib/liveness.mjs` | 64 | --- | - | D3 section 3 — self-liveness (the meta-level of the whole investigation). |
| `lib/liveness.selftest.mjs` | 57 | --- | - | D3 section 3 — self-liveness LAYER 1 (known-answer pairs) + LAYER 2 (mutation). |
| `lib/liveness-reconstruction.mjs` | 90 | W-- | db_password | D3 section 3 — self-liveness LAYER 3 (real-artifact reconstruction). READ-MOSTLY: |
| `lib/net-agent.mjs` | 20 | --- | - | Bounded-pool undici dispatcher (operator correction 2026-06-13) to tame the transient sa |
| `lib/reachability.selftest.mjs` | 63 | --- | - | Durable verification for the D1-interpretation fix (the reachability SSOT), to the |
| `lib/surface-registry.mjs` | 170 | --- | - | D3 (b) — Surface registry + coverage block. |
| `lib/surface-registry.selftest.mjs` | 77 | --- | - | D3 (b) — surface registry LAYER 1 (known-answer pairs) + LAYER 2 (mutation). |
| `lib/surface-registry-reconstruction.mjs` | 111 | --- | - | D3 (b) — surface registry LAYER 3 (real-artifact reconstruction). READ-ONLY. |
| `lib/type-consumer-probe.mjs` | 111 | --- | - | ── READ-SIDE MIRROR of the bug-class detector — unguarded type-map consumers ── |
| `lib/type-consumer-probe.selftest.mjs` | 33 | --- | - | Discrimination proof for the read-side type-consumer probe: flags index-then-deref witho |
| `lib/urgency.mjs` | 37 | --- | - | Shared urgency mapping for intelligence_items inserts from .mjs scripts. |
| `lib/verification-decision.selftest.mjs` | 28 | --- | - | COMPOSITION fixture for verifyCandidate's reachability gate — asserts the short-circuit |
| `lib/verify.mjs` | 81 | --- | - | D3 Component A — outcome-assertion primitives. |
| `lib/verify.selftest.mjs` | 97 | --- | - | D3 Component A — verification LAYER 1 (known-answer pairs) + LAYER 2 (mutation). |
| `lib/verify-reconstruction.mjs` | 98 | W-- | db_password | D3 Component A — verification LAYER 3 (real-artifact reconstruction). |
| `migrate/reclassify-fold.mjs` | 102 | WG- | - | KEYSTONE MIGRATION (guarded, snapshotted, dry-run default): item_type corrections. |
| `tmp/apply-097.mjs` | 60 | W-- | db_password | Apply migration 097: D1 Option B retroactive retune of Q4 bias tags. |
| `tmp/backfill-finance-ec-europa.mjs` | 175 | W-- | service_role+anthropic+browserless | One-off: backfill the 2026-05-09 smoke-test stub row |
| `tmp/check-task6-sources.mjs` | 55 | --- | service_role | One-off: list Task 6 source URLs + their auto_run_enabled + |
| `tmp/d6-apply-and-verify.mjs` | 181 | W-- | db_password | D6: apply migration 084, verify parity (counts of items routed per surface). |
| `tmp/d6-preflight-baseline.mjs` | 90 | --- | db_password | D6 pre-flight: capture baseline routing (counts + sample ids per category) |
| `tmp/flip-task6-remaining-9.mjs` | 381 | W-- | service_role+anthropic+browserless+anon | Process the remaining 9 Task 6 sources after the iiconservation smoke |
| `tmp/mig070-snapshot.mjs` | 107 | --- | db_password | Migration 070 reconstruction: snapshot live-DB state of the 3 RPCs that |
| `tmp/mig083-apply.mjs` | 127 | W-- | db_password | Migration 083 apply: executes the migration SQL as a single client call, |
| `tmp/mig083-postflight.mjs` | 120 | --- | db_password | Migration 083 post-flight: confirm trigger derive + one-shot backfill |
| `tmp/mig083-preflight.mjs` | 104 | --- | db_password | Migration 083 pre-flight: confirm row counts before applying the |
| `tmp/phase1.5-preflight.mjs` | 90 | --- | db_password | Pre-flight DB schema check for Phase 1.5 consumer migration. |
| `tmp/phase-2-dedup-introspect.mjs` | 229 | --- | db_password | Sprint 1 Phase 2 introspection. |
| `tmp/phase-3-classify.py` | 118 | --- | - | import json, sys, re |
| `tmp/phase-3-jurisdiction-introspect.mjs` | 81 | --- | db_password | Sprint 1 Phase 3 introspection. |
| `tmp/phase-4a-amendment-preflight.mjs` | 103 | --- | db_password | Phase 4a SQL-review amendment pre-flight: |
| `tmp/phase-4b-dryrun.mjs` | 180 | WG- | db_password | Phase 4b dry-run: execute migration 082 inside a transaction, run |
| `tmp/phase-4b-post-apply-verify.mjs` | 56 | -G- | db_password | Phase 4b post-apply verification: confirm prod DB state matches the |
| `tmp/phase-4b-schema-introspect.mjs` | 116 | --- | db_password | Phase 4b pre-flight: introspect intelligence_items schema for source |
| `tmp/phase-4-prework-introspect.mjs` | 115 | --- | db_password | Sprint 1 Phase 4 prework: ICAO/CORSIA/aviation counts + staged_updates |
| `tmp/phase-5-design-preflight.mjs` | 262 | --- | db_password | Phase 5 design pre-flight introspection. |
| `tmp/phase-5-implementation-preflight.mjs` | 136 | --- | db_password | Phase 5 implementation pre-flight (2026-05-18, post-Phase-4b apply). |
| `tmp/phase-5-mid-execute-state.mjs` | 60 | --- | db_password | Phase 5 mid-execute state check after backfill exited. |
| `tmp/phase-5-rollback.mjs` | 137 | W-- | db_password | Phase 5 turn-2 UPSERT rollback (NOT TRUNCATE CASCADE). |
| `tmp/phase-5-toggle-pause.mjs` | 38 | W-- | db_password | Phase 5 helper: toggle system_state.global_processing_paused |
| `tmp/q10-apply-087.mjs` | 77 | W-- | db_password | Q10: apply migration 087 (canonicalize sources.url + provisional_sources.url |
| `tmp/q10-duplicate-scan.mjs` | 110 | --- | db_password | Q10: scan sources + provisional_sources for URLs that would canonicalize |
| `tmp/q1-apply-089.mjs` | 129 | W-- | db_password | Q1: apply migration 089 (intelligence_item_citations edge table + backfill). |
| `tmp/q2-apply-090.mjs` | 121 | W-- | db_password | Q2: apply migration 090 (tier schema split: rename tier -> base_tier, |
| `tmp/q2-probe-sources.mjs` | 63 | --- | db_password | Q2 pre-flight probe: inspect sources tier-related columns + tier distribution + check co |
| `tmp/q2-probe-views.mjs` | 40 | --- | db_password | Q2 pre-flight: inspect the two views that depend on sources.tier |
| `tmp/q3-apply-091.mjs` | 185 | W-- | db_password | Q3 migration 091 apply: creates public.source_tier_opinions table, |
| `tmp/q4-review-queue-distribution.mjs` | 103 | --- | db_password | D1 investigation: distribution of review-queue rows for Q4 bias tags. |
| `tmp/q5-apply-093.mjs` | 186 | W-- | db_password | Migration 093 apply: executes the migration SQL as a single client call, |
| `tmp/q8-apply-088.mjs` | 115 | W-- | db_password | Migration 088 apply: executes the migration SQL as a single client call, |
| `tmp/q8-citation-stats-check.mjs` | 132 | -G- | db_password | Q8 pre-flight: verify citation_count + recency v1 semantics on live DB. |
| `tmp/q8-citation-stats-union-check.mjs` | 61 | -G- | db_password | Q8 pre-flight refinement: verify UNION semantic of citation_count. |
| `tmp/q8-recency-column-probe.mjs` | 28 | --- | db_password | Q8 probe: discover the intelligence_items column suited for recency. |
| `tmp/q8-topref-check.mjs` | 23 | --- | db_password | import { readFileSync } from "node:fs"; |
| `tmp/retry-agent-run.mjs` | 57 | --- | service_role+anon | Retry /api/agent/run for a single sourceUrl. Used to retry icom-cc |
| `tmp/shim-apply-094.mjs` | 69 | W-- | db_password | Apply migration 094: compatibility shim restoring sources.tier as a synced |
| `tmp/smoke-drain-iiconservation.mjs` | 354 | W-- | service_role+anthropic+browserless+anon | Smoke test for the patched Wave 1b drain worker. |
| `tmp/stage2-apply.mjs` | 242 | W-- | db_password | Sprint 2 Build 1 — Stage 2 apply |
| `tmp/stage2-preflight.mjs` | 150 | --- | db_password | Sprint 2 Build 1 — Stage 2 preflight verification |
| `tmp/tier1-eu-western-nordic-investigate.mjs` | 209 | --- | service_role | Tier 1 Wave B — EU Western + Nordic investigation (read-only). |
| `tmp/track-a-apply-086.mjs` | 93 | W-- | db_password | Track A E2: apply migration 086 (analytical press routing) to live DB, |
| `tmp/track-a-check-8-sources.mjs` | 108 | --- | db_password | Track A pre-flight A1: live DB check for the 8 analytical-press sources. |
| `verify/_fmt-present.mjs` | 16 | --- | - | Section-presence primitive: a required section is PRESENT if a heading line carries its  |
| `verify/claims-tier-audit.mjs` | 56 | --- | - | DATA-AUDIT (CI-with-secrets lane). GOVERNING SKILLS: source-credibility-model + remediat |
| `verify/cleanup-dup-sources.mjs` | 63 | WG- | - | CLEANUP (guarded, snapshotted): remove the DUPLICATE sources created 2026-06-06 by the c |
| `verify/format-structure.mjs` | 79 | --- | service_role | VERIFIER (read-only, ZERO Browserless): format structure — RECONCILED with the integrity |
| `verify/ledger-onepass-audit.mjs` | 115 | --- | - | E1 — ONE-PASS LEDGER VERIFIER (read-only, deterministic; no LLM, no network). |
| `verify/no-names.mjs` | 51 | --- | service_role | VERIFIER (read-only, 0 Browserless): workspace-anchoring / NO NAMES. |
| `verify/one-tier-per-host-audit.mjs` | 39 | --- | - | DATA-AUDIT (CI-with-secrets lane). GOVERNING SKILLS: source-credibility-model + remediat |
| `verify/orphan-source-audit.mjs` | 51 | W-- | service_role | VERIFIER (read-only, 0 Browserless): SOURCE-REGISTRATION INVARIANT over live data. |
| `verify/quarantine-disposition-audit.mjs` | 166 | --- | service_role | VERIFIER (read-only, 0 Browserless): RESEARCH-OR-ERASE / QUARANTINE-DISPOSITION INVARIAN |
| `verify/remediate-orphan-sources.mjs` | 79 | WG- | service_role | REMEDIATION (guarded, snapshotted, per-step verified): drive the source-registration inv |
| `verify/remediate-reclassify-proposal.mjs` | 56 | --- | service_role | PROPOSAL ONLY (read-only) — RECLASSIFY+RE-HOME the format-drift items. Cross-surface ite |
| `verify/routing.mjs` | 70 | --- | service_role | VERIFIER (read-only, 0 Browserless): routing — item_type -> format -> surface. |
| `verify/run-data-audit-lane.mjs` | 89 | W-- | - | DATA-AUDIT LANE runner (CI-with-secrets / nightly). GOVERNING: remediation-discipline. |
| `verify/source-vs-item.mjs` | 60 | --- | service_role | VERIFIER (read-only, 0 Browserless): source != item. |
| `verify/substrate-agreement-audit.mjs` | 43 | --- | - | DATA-AUDIT (CI-with-secrets lane). GOVERNING SKILLS: environmental-policy-and-innovation |
| `verify/surface-visibility-audit.mjs` | 117 | W-- | service_role | VERIFIER (read-only reads + flag-writes only): SURFACE-VISIBILITY INVARIANT over live da |
| `verify/unregistered-span-host-audit.mjs` | 52 | --- | - | DATA-AUDIT (CI-with-secrets lane). GOVERNING SKILLS: source-credibility-model + remediat |
| `verify/vocab-sync-audit.mjs` | 60 | --- | db_password | DATA-AUDIT (CI-with-secrets lane). GOVERNING SKILLS: environmental-policy-and-innovation |
| `workflows/all-surfaces-deepdive-build.mjs` | 149 | --- | - | export const meta = { |
