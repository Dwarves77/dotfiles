# CODE-2 Register — Guards & Validation (fsi-app/.discipline/**, .github/workflows/**, src/lib/trust.ts)

Audit: full-system-audit-2026-07-11 · Baseline master `71bcbd46a30e6b4e5f953a4949c3b8e276dacf8b` · Branch `audit/full-system-2026-07-11`
Agent: CODE-2 · READ-ONLY (no file modified outside this register; only read-only node evals run — the meta-gate CLI, `git ls-files`, grep; zero fetches, zero DB, zero --apply).

**Headline: no named-but-missing enforcer exists.** Every one of the 53 registry invariants resolves to a real,
git-tracked artifact, and the meta-gate passes live (run during this audit): `53 invariants | ENFORCED 41 EXEMPT 12 — meta-gate PASS`.
The material findings are wiring asymmetries (local-only vs CI-only enforcement), two-homes drift between rule 016
and F15, a stale ungated coverage-report with 55 gaps, and skill-map lag behind the newest chokepoints.

---

## 1. Invariant registry enumeration (focus a)

Source: `fsi-app/.discipline/governance/invariants.mjs` (622 lines, 53 entries + RD-15 comment-only residual).
Every `enforcedBy` token verified against disk + `git ls-files` + the three manifests. Verification key:
R=rule in manifest.mjs, F=fitness in fitness/manifest.mjs, C=consistency in consistency/manifest.mjs,
A=audit file tracked + GOVERNING cite (all 9 confirmed, grep count 1 each), S=selftest tracked, M=migration file tracked.

| Invariant | enforcedBy | Verified |
|---|---|---|
| EP-1-integrity | migration:035, 044, 121 | M,M,M (035_agent_integrity_flags, 044_integrity_flag_trigger_tune, 121_uniform_promotion_no_human_tick) |
| EP-2-workspace-anchored | audit: scripts/verify/no-names.mjs | A |
| EP-3-format-mapping | audit: scripts/verify/routing.mjs | A |
| EP-4-source-not-item | audit: scripts/verify/source-vs-item.mjs | A |
| EP-5-cross-format-lens | audit: scripts/verify/format-structure.mjs | A |
| EP-6-cause-effect | EXEMPT (semantic half; structural half = 112/114/121) | reason present |
| EP-7-severity-labels | EXEMPT (data-verified: no clean bound; 224/361 validly multi-label) | reason present |
| EP-8-qualification-capture | EXEMPT (semantic; structural prereq = truncation fix; REVISIT selftest) | reason present |
| EP-9-single-mint-chokepoint | fitness:F13 | F (residual: mig 146 file EXISTS/tracked; applied-state = DB question, out of slice) |
| SC-1-syndication-math | fitness:F10 + selftest source-growth.selftest.mjs | F,S |
| SC-2-source-registration | rule:019 + audit orphan-source-audit.mjs + migration:135 | R,A,M |
| SC-3-effective-tier-formula | fitness:F11 + selftest trust.selftest.mjs | F,S (see finding 6 note: residual text slightly stale — a JS COALESCE surface now exists) |
| SC-4-bias-external-only | migration:092 | M |
| SC-5-domain-int-ssot | EXEMPT (mechanizable-via-branded-type, deferred, REVISIT) | reason present |
| SC-6-one-tier-per-host | audit: one-tier-per-host-audit.mjs | A |
| SC-7-claims-tier | audit: claims-tier-audit.mjs | A |
| SC-8-authority-floor | migration:141 | M |
| SC-9-moat-base-tier-only | fitness:F12 | F (sentinel institution.selftest.mjs tracked — verified) |
| SC-10-floor-source-complete | selftest: agent/source-blocks.test.mjs | S + in suite glob |
| SC-11-floor-first-attribution | selftests: floor-attribution.test.mjs + null-tier-flag.test.mjs | S,S + in suite glob |
| SC-12-slot-forcing-genuine-support | selftest: slot-forcing.test.mjs | S + in suite glob |
| AC-1-section-construction | audit: format-structure.mjs | A |
| AC-2-grounding-models | EXEMPT (model-label semantic; claim grounding gated 112/114) | reason present |
| AC-3-per-format-design-before-scale | EXEMPT (process) | reason present |
| AC-4-no-vacuum | EXEMPT (semantic half; fields structural via mig 021) | reason present |
| PI-1-five-surface | rule:018 | R |
| PI-2-regulations-only-on-regulations | audit: routing.mjs | A |
| PI-3-community-coequal | EXEMPT (product axiom) | reason present |
| PI-4-assistant-research-helper | EXEMPT (architectural axiom) | reason present |
| RD-1-classify-before-discard | rule:015, rule:019 | R,R |
| RD-2-class-fixes-mechanical | EXEMPT (meta-rule) | reason present |
| RD-3-primitive-thresholds | EXEMPT (judgment threshold) | reason present |
| RD-4-quarantine-disposition | audit: quarantine-disposition-audit.mjs | A |
| RD-5-status-is-a-cache | audit: substrate-agreement-audit.mjs | A |
| RD-6-deferral-vs-undispositioned | audit: quarantine-disposition-audit.mjs | A |
| RD-7-roadblock-alternative-search | selftest: sources/primary-fallback.test.mjs + migration:141 | S,M |
| RD-8-retrieval-before-generation | EXEMPT (process; heterogeneous stores, no clean signal) | reason present |
| RG-1-plan-reground | consistency:C5 | C (but see finding 2: C5 has no CI lane) |
| RD-9-producer-consumer-orphan | fitness:F14 | F |
| RD-10-spend-chokepoint | fitness:F15 + selftest llm/spend-guard.test.mjs | F,S |
| RD-11-transport-hold-gate | fitness:F16 + selftest sources/fetch-hold.test.mjs | F,S |
| RD-12-size-cap-doctrine | fitness:F17 + selftest agent/section-grounding.test.mjs | F,S |
| RD-13-error-body-groundability-gate | selftests: entity-gate.test.mjs + spend-guard.test.mjs | S,S |
| RD-14-transport-escalation-write-gate | selftests: transport-escalation + transport-runtime + entity-gate .test.mjs | S,S,S |
| (RD-15) | comment-only registered residual (invariants.mjs:531-543) — deliberately NOT build-failing until mig 147 + batch-1 go-line; seek-more.test.mjs tracked | as designed |
| SF-1-inventory-consistency | rule:014 + consistency:C3 + C4 | R,C,C (see finding 2) |
| SF-2-migration-ordering | fitness:F6 | F |
| SF-3-admin-gating | fitness:F2 | F |
| SF-4-client-server-tier-boundary | fitness:F8 | F (see finding 11: detector weaker than invariant text) |
| SF-5-build-compiles | fitness:F9 | F |
| SF-6-no-hardcoded-user-path | rule:012 | R |
| SF-7-worktree-convention | consistency:C4 | C (see finding 2) |
| SF-8-canonical-anthropic-path | rule:016 | R (see finding 1) |
| SF-9-generation-config-no-raw-env | rule:017 | R |

Meta-gate mechanics verified (`invariant-coverage.mjs`): CI-faithful `git ls-files` keying (lines 59-73) including
the migration list derived from the TRACKED set, not readdir; checks 1-6 all present; the pure core
`auditInvariants()` is negative-tested (invariant-coverage.test.mjs: UNWIRED / UNRESOLVED / CONTRADICTORY /
ANCHOR DRIFT / EMPTY-EXEMPTION / zero-false-positive control). Check-5 orphan-mechanism inverse and check-6
rule-fire-test floor both live. Marker baselines (MARKER_SOURCE regex; 6 skills) hold at run time.
Named caveat (already registered in-file at :19-24): check 6 proves test EXISTENCE not non-vacuousness; additionally
the marker baseline is a LINE-COUNT — an add-one-remove-one rewording holds the count and slips triage (INFO).

## 2. Findings

### F-1 (MEDIUM) Rule 016 vs F15: two-homes drift on the sanctioned direct-Anthropic list
`rules/016-canonical-anthropic-path.mjs:20-32` (PERMITTED) and `fitness/functions/F15-spend-chokepoint.mjs:27-43`
(LEGACY_ALLOWLIST) encode the same fact in two homes and have diverged. Verified against current code: three
F15-allowlisted files contain rule-016 `DIRECT_CALL_RE` matches but are NOT in 016's PERMITTED list —
`src/lib/llm/haiku-classify.ts` (2 hits), `src/lib/sources/recommend-source-tier.ts` (1), `src/lib/sources/discovery.ts` (1).
Rule 016 fires only on STAGED files, so the divergence is latent: the next commit that touches any of the three
fails commit-msg with no override trailer (016 has none — only `--no-verify`). `api-fetch.ts` has x-api-key only
(F15-regex hit, not 016-regex) so it does not trip 016. This is the exact two-homes class run-test-suite.sh:7-10 documents.
Next action: make rule 016 consume F15's SANCTIONED + LEGACY_ALLOWLIST (one home), or add the three files to PERMITTED
with the same shrink discipline.

### F-2 (MEDIUM) Consistency layer (C3/C4/C5 → SF-1, SF-7, RG-1) has no CI backstop; rule 014 is structurally vacuous in CI mode
- No workflow step runs `consistency/runner.mjs` (grep across `.github/` = zero hits). Enforcement is pre-push step 2
  only (`hooks/pre-push:75`) — a `git push --no-verify` has no server-side catch for inventory/worktree/program-anchor drift.
- `C5-program-anchors-reality.mjs:9` claims "runs in pre-push step 2 + CI" — the CI half is false.
- Rule 014's CI path cannot fire: `trigger()` requires `ctx.isOnMaster` (`rules/014-inventory-consistency.mjs:26`), but
  in `--mode=ci` the branch comes from `currentBranch()` which returns null on GitHub's detached-HEAD checkout
  (`lib/context.mjs:168-176`) → `isOnMaster=false` → SKIP for every commit validate-commits examines.
- Note pre-push's own header ("mirror the CI workflow's gating jobs", `hooks/pre-push:10`) is now inverted: pre-push runs
  MORE than CI here.
Next action: add a secret-less `node fsi-app/.discipline/consistency/runner.mjs` step to discipline.yml
(test-discipline-engine job), and fix the C5/pre-push comments. Optionally derive isOnMaster in ci mode from
`GITHUB_REF`/commit ancestry instead of `rev-parse --abbrev-ref`.

### F-3 (MEDIUM) Governed-surface coverage scan: unwired detector + stale committed report with 55 open gaps
`governance/coverage-scan.mjs` is a manual CLI (writes `coverage-report.json`); nothing in pre-push or any workflow runs it.
The committed report was last generated 2026-06-06 (commit a1c66f5) and records
`{governed_files:335, covered:266, exempt:14, gaps:55}` — 21 orphaned proofs, 22 unmapped writes, 5 unmapped model,
11 unmapped routing (sampled: discovery.ts UNMAPPED-WRITES+MODEL, provision-personal-workspace.ts, settingsStore.ts,
many scripts/lib selftests as orphaned proofs). Its own doctrine ("wire-or-exempt each; the scan re-run must show zero
gaps", coverage-scan.mjs:16) has no enforcement loop, and a month of tree changes (F13-F17 era files) is not reflected.
Also note the scan walks the WORKING TREE (readdirSync), not the tracked set — inconsistent with the meta-gate's
CI-faithfulness rule. Next action: either wire it (report-only CI step, or diff-gate on NEW gaps like bug-class-guard's
stated promotion path) or archive the JSON as a dated point-in-time artifact so it stops presenting as live state.

### F-4 (MEDIUM) skill-map.mjs lags the new chokepoint files — action-time gate lets them be edited skill-free
`governance/skill-map.mjs:19-83` GOVERNED files omit the load-bearing chokepoints added since 2026-07:
`src/lib/intake/mint-item.ts` (EP-9 single-mint chokepoint), `src/lib/llm/spend-client.ts` + `spend-guard.mjs` (RD-10),
`src/lib/sources/canonical-fetch.mjs` + `fetch-hold.mjs` (RD-11), `src/lib/agent/generation-config.ts` (F17 registry input,
rule 017's sanctioned env home). All exist (verified) and all are exactly the files whose edits most need
remediation-discipline / source-credibility context, yet the PreToolUse gate tags an Edit on them `edit-ungoverned → allow`
(pretooluse-skill-gate.mjs:111-112). Mapping completeness vs the current tree is otherwise good: all 12 mapped paths exist
(canonical-pipeline, system-prompt, parse-output, format-spec, extract-registry, formats/, src/app/, Sidebar.tsx, trust.ts,
source-pool.ts, types/source.ts, docs/inventories/, supabase/migrations/). `source-pool.ts` is listed and still on disk
though CLAUDE.md marks it retired (harmless over-coverage; rule 017's GEN_FILES also still lists it at :40).
Ops regexes cover the mutation classes (intelligence_items / item_type / provenance_status / tier fields / archive/delete).
Next action: add the chokepoint files to GOVERNED (G/M classes) in the same change that next touches any of them.

### F-5 (LOW-MEDIUM) Q7 "daily" recompute has no scheduler anywhere
`/api/admin/q7-daily-recompute` (F2 worker-secret allowlist entry, comment "Q7 daily cron") has no caller: none of the
6 workflows hit it and `fsi-app/vercel.json` defines no crons (verified — file is framework/regions only). Only
`trust-recompute.yml` (monthly, calls `/api/admin/recompute-trust` = computeOverallScore Bayesian blend) is scheduled.
So the effective_tier network-promotion/decay path (`trust.ts:912 recomputeEffectiveTier`) runs only on manual dispatch.
Given the moat seals effective_tier out of claim grounding (SC-9/F12), impact is display/source-health-side only, but the
"daily cron" labels in F2-admin-routes-isPlatformAdmin.mjs:12-13 and the route are drift. Next action: schedule it
(workflow_dispatch+cron like trust-recompute) or relabel as manual-only.

### F-6 (LOW) trust.ts dormant/dead paths (focus e)
Consumers (verified by grep): `api/admin/q7-daily-recompute/route.ts`, `api/admin/recompute-trust/route.ts`,
`src/lib/sources/source-growth.ts`, `src/lib/supabase-server.ts`; behavioral gate = trust.selftest.mjs via F11.
Zero external consumers for: `evaluatePromotion`, `evaluateDemotion`, `evaluateProvisionalSource`,
`computeConflictResolutionImpact` (the promotion/demotion evaluation engine, trust.ts:342-577 — dormant since the
source-health UI era), and `computeCitationComponentFromRows` (trust.ts:311 — the "canonical per-row formula" whose
in-code comment says the daily batch "will migrate" to it; never wired, aggregate path still live).
Also: invariant SC-3's residual text ("no JS unit surface" for the COALESCE precedence) is now slightly stale —
`recomputeEffectiveTier` (trust.ts:952-953) IS a JS COALESCE surface and could be cheaply unit-asserted, upgrading part
of the pgTAP-deferred residual. Next action: Phase-7-style disposition on the four dead evaluators; add a COALESCE
precedence case to trust.selftest.mjs.

### F-7 (LOW) adr-loader.mjs is dead-but-tested (216 lines)
Only importer anywhere in .discipline/scripts/src is its own test (`lib/adr-loader.test.mjs`). Its consumer (the "13th
binding rule" ADR cross-reference) was deleted in the 2026-05-21 slim. Next action: delete with its test, or annotate
as reserved-for-reuse so the next audit doesn't re-find it.

### F-8 (LOW) Dead variable in wire-pretooluse-settings.mjs
`canonicalCommand` (line 38, the pathToFileURL form) is constructed and never used — `cmdWin` (line 40) is what ships.
Cosmetic; remove on next touch.

### F-9 (LOW) Stale documentation layer contradicts the repo's own doctrine-not-state rule
All four READMEs + INSTALL describe the pre-slim engine: `.discipline/README.md` (11 rules 001-011, retired predicates
`commitMessageHasLine`/`isSubstantialDispatch`/`touchedInventorySurfaces`, rule examples that no longer exist),
`fitness/README.md` (F1-F8 file list; "fitness-check runs after validate-commits"), `consistency/README.md` (C1-C10 file
list; ".test.mjs per check" — no check tests exist, only runner-level), `INSTALL.md` ("all 11 binding rules",
attestation lines), plus in-code stragglers: `hooks/pre-push:15` ("C1-C10 drift"), `rules/014:22` ("10 C-checks"),
`discipline.yml:5` ("11 binding rules"), `fitness runner CI comment` ("F1-F9 function suite" at discipline.yml:131).
Next action: one doc-sweep commit; or replace README content with pointers to the manifests (the live SoT).

### F-10 (LOW) F6 gap check: comment/behavior mismatch (currently dormant)
`F6-migrations-numeric-ordering.mjs:102-116` says gaps are "report (but do not fail)" yet emits a `violation()` when
gapCount>10 — which FAILS the runner (exit 1). Current state: 156 distinct numbers across 001-163 → 7 gaps (verified),
so it cannot fire today; four more squashed/renumbered migrations trip a hard failure wearing "tolerated" framing.
Also the holistic pass re-invokes `enumerate()` per file (O(n²) reads, mitigated by the content cache) and only runs on
the lexicographically lowest migration — correct but fragile if 001 is ever renamed. Next action: align comment and
behavior (either downgrade to console report or admit it is a gate).

### F-11 (LOW) F8 detector shape is weaker than invariant SF-4's text (stale-pattern risk, focus b)
`F8-client-server-tier-boundary.mjs`: pattern 1 requires the receiver to be literally named `body`
(`/\bbody\.(tier|...)\s*=/`); pattern 2 (`OBJECT_LITERAL_TIER_RE`) only matches a SINGLE-LINE `{ ... tier: ... }` literal
— the common multi-line `fetch(..., { body: JSON.stringify({\n  tier: x,\n ...})})` shape is invisible to both.
The 5-line look-AHEAD window helps only when the literal itself is one line. Enforcement is real but narrow; the
invariant registry does not carry this as a residual. Next action: add a per-line `^\s*(tier|base_tier|effective_tier)\s*:`
check inside a JSON.stringify/fetch window, or register the narrowness as a named residual on SF-4.

### F-12 (LOW) F2 worker-secret allowlist has no deletion-stale audit
`F2-admin-routes-isPlatformAdmin.mjs:20-24`: if an allowlisted route file is deleted, its entry lingers silently
(the stale-entry-is-RED discipline exists in F14/F15 but not here). Current entries verified healthy: all 3 exist and
reference x-worker-secret (recompute-trust 1, q7-daily-recompute 3, spot-check/recurring 1). Next action: add the F15-style
allowlist audit to F2's test.

### F-13 (INFO) CI workflows — what each executes; vacuous-pass audit (focus c)
- **discipline.yml** (push/PR to master, 3 jobs): validate-commits (runner --mode=ci, commit or origin/base..HEAD range);
  test-discipline-engine (`run-test-suite.sh` — single-home test list, then the meta-gate CLI); fitness-check
  (npm ci → `fitness/runner.mjs` all 12 functions incl. F9 tsc → npmtest glob step). Vacuous-pass check: the npmtest step's
  empty-glob branch prints "no npmtest files" and passes — currently NON-vacuous (4 files match `fsi-app/src/**/*.npmtest.mjs`,
  verified via git ls-files); if the naming convention ever drifts this step goes silently green (candidate: assert
  non-empty like glob-portability does for the main list). The PR-range `git fetch ... || true` is a benign defensive re-fetch.
- **bug-class-guard.yml** (push/PR): HARD job = 8 selftests, gating. SOFT job = 3 scans with `|| true` — deliberate,
  documented report-only with an in-file promotion criterion (harden lexicon → diff-gate). Not a defect; flagged so the
  promotion doesn't rot.
- **data-audit-lane.yml** (nightly cron + manual, secrets): runs `scripts/verify/run-data-audit-lane.mjs` (the CI-with-secrets
  home of the 7 hard live-data audits + soft skill-conformance the invariant registry leans on for EP-2..5, SC-2/6/7, RD-4/5/6).
  No pull_request trigger = fork-secret isolation. Correctly fail-open-nothing: audits gate the job.
- **source-monitoring.yml** (hourly cron): check-sources + drain-first-fetch worker POSTs; fails on non-2xx/curl-fail; missing
  secrets fail step 1 explicitly. Note it ticks hourly against prod while the scrape hold is the sole mint protection (context
  from RD-14 cadence gate) — behavior gated app-side by auto_run_enabled/SCRAPE_HOLD, out of this slice.
- **spot-check-monthly.yml** (monthly): non-idempotent POST with --retry 0 (correct), 429→exit 0 documented cooldown-skip
  (deliberate inconclusive-not-fail), 502→fail as the FP-rate alarm. CLAUDE.md's "monthly cron (currently disabled)" note
  contradicts the live cron line — disabled-state, if true, lives in GitHub UI (out-of-repo); flag for the X-agent
  contradiction sweep.
- **trust-recompute.yml** (monthly): recompute-trust POST, fail on non-2xx. Fine.
- **Required-vs-advisory** is GitHub Settings state (out-of-repo, not verifiable from the tree — same boundary class as
  OUT-OF-REPO-BOUNDARY.md). From the tree: only discipline.yml + bug-class-guard.yml run on PRs and can be required checks;
  the four ops lanes are schedule/dispatch-only.

### F-14 (INFO) Pre-push vs CI parity map (focus c/d)
Pre-push (hooks/pre-push, installed and byte-identical to tracked source on this machine — verified): step 1 untracked-critical
gate (migrations/api/decisions/inventories/rules/fitness/consistency/governance), step 2 consistency runner, step 3 canonical
test suite (same entrypoint as CI — parity by construction), step 3b meta-gate, step 3c pretooluse-wiring check (SKIP w/o
settings.json), step 4 tsc. CI-only: fitness/runner.mjs full scan (so F2/F6/F8/F13 tree-scans and the F10/F11/F12
selftest-spawning gates run ONLY in the CI fitness-check job — pre-push covers F14-F17 partially via their live-tree test
assertions inside the suite), validate-commits, npmtest job. Local-only: consistency runner (finding F-2), step 3c.
The commit-msg hook fails OPEN on missing node/runner (documented posture, commit-msg:19-36); pre-push fails CLOSED (exit 2).
Rule-list vs commit-msg wiring (focus d): manifest.mjs registers exactly 7 rules (012, 014-019); the hook invokes
runner.mjs --mode=commit-msg which iterates that manifest; trigger-throw and check-throw are converted to engine-level FAILs
(runner.mjs:113-127 — no swallow). All 7 rules have committed fire-tests (meta-gate check 6 floor holds).

### F-15 (INFO) PreToolUse skill gate + wiring (focus f)
Gate logic (pretooluse-skill-gate.mjs) verified fail-closed at every seam: no stdin/empty/unparseable → ask; skill-map
import failure → edits fail closed (`map-fail`), Bash falls back to a default skill demand; no transcript → deny.
Fire-test (pretooluse-skill-gate.test.mjs) asserts efficacy incl. abs-path suffix matching and per-op skill naming.
Wiring proof = check-pretooluse-wired.mjs (pre-push 3c; REQUIRED list includes dispatch tools + 3 representative github
MCP writes; matcher semantics mirrored). Audit log append-swallow is by design (:36 "never block on logging");
`.gate-audit.log` confirmed gitignored (fsi-app/.gitignore:57). Residuals worth naming: (1) the "deliberately loaded"
check is an exact-serialization substring (`"name":"Skill","input":{"skill":"..."` at :72) — a harness transcript-format
change degrades to always-DENY (fails safe but noisy; the fire-test would catch it only if the fixture format is updated
in lockstep); (2) MCP verb heuristic: anything not clearly read-only routes to the write gate (fail-closed — correct);
(3) the subagent/workflow bypass is a documented platform floor (OUT-OF-REPO-BOUNDARY.md:27-50) with dispatch-point ask
as the compensating control. Skill-map completeness gap = finding F-4.

### F-16 (INFO) Selftest-token semantics: tracked ≠ run — cross-checked, all named selftests DO run somewhere
The meta-gate's `selftest:` resolver proves git-tracked only (invariant-coverage.mjs:93-95). Cross-check performed:
every `*.test.mjs` selftest named in the registry sits inside run-test-suite.sh's directory globs
(src/lib/{sources,agent,llm}/*.test.mjs — lines 47-52) → runs at pre-push AND CI; the three `*.selftest.mjs` gates
(source-growth, trust, institution) run via F10/F11/F12 subprocess spawns → CI fitness-check job only (not pre-push;
see F-14). No named selftest is tracked-but-never-executed. A future selftest landed OUTSIDE the globbed directories
would satisfy the meta-gate while never running — candidate meta-gate check 7: assert each selftest path is covered by
the suite globs or an F-gate.

### F-17 (INFO) Allowlist/registry freshness sweeps (focus b) — all reconciled against current code
- F15 LEGACY_ALLOWLIST: 9 entries, all files exist, all still contain direct calls (verified; the F15 test enforces this
  stale-audit in CI). Shrink ledger in comments (12→11→10→9) matches.
- F17 CAP_REGISTRY: 5/5 entries match the constants actually declared in generation-config.ts / section-grounding.mjs
  (verified by grep); no silent-grounding status. One-direction residual: a registry entry whose constant is deleted from
  code is not flagged (low risk). Note the caps are `Number(process.env.X || default)` — env can retune values at runtime
  (out-of-repo boundary class; the registry classifies the constant, not the live value).
- F16: primitive carries assertFetchAllowed (canonical-fetch.mjs:37) and RAW_BROWSERLESS_RE matches the primitive's own
  endpoint forms (chrome.browserless.io + BROWSERLESS_BASE_URL at :48-50) — detector matches current code shape.
- F14 TERMINAL_SINK_ALLOWLIST: 4 entries, all reason+reviewByPhase bearing; live-tree GREEN asserted by its own test.
- F13: FROM+INSERT 4-line window matches supabase-js chain shape; scripts/ deliberately out of scope (registered residual
  on EP-9). Chokepoint file exists.
- F6 KNOWN_HISTORICAL_DUPLICATES: 5 files, all still on disk.

### F-18 (INFO) Error-swallow inventory for this slice (all bounded / by-design, none load-bearing silent)
`C4-worktrees-reality.mjs:23` gitWorktreeList catch→[] (git failure silently empties the live side — the missing-claim
direction goes vacuous; consider a MALFORMED drift on exec failure); `lib/context.mjs:168-176` currentBranch catch→null
(feeds finding F-2); `parseNumstat` stamps status 'M' always → deletion-blindness, mitigated by content-null guards in
rules 012/015/018/019 (018 documents it at :61-65); `fitness/lib/file-content.mjs` returns null on missing file and the
runner `continue`s (race-tolerant, fine); pretooluse audit-log append swallow (by design); commit-msg hook fail-open
(documented). Rule 018's `relevant()` mixes && / || precedence (:42) — harmless because of the second status filter and
numstat's always-'M', but worth parenthesizing on next touch.

### F-19 (INFO) Dispatch subsystem + trailer ecosystem
dispatch/start.mjs + audit.mjs are operator tooling reading OPTIONAL trailers (post-slim: Loop-closure/Skill-loaded etc.
are audit-only, per manifest.mjs:14-17 — consistent with the skill-map NOTE that trailers are not gates). audit.mjs
README claims a bypass-usage heuristic ("whether --no-verify was used") that the code does not implement — doc drift,
fold into F-9. Both have tests; both are wired into the suite globs.

## 3. Focus-area verdicts (summary)

- (a) Invariant registry: 53/53 wired or exempt-with-reason; every named artifact exists, is tracked, and (for audits)
  carries the GOVERNING cite; meta-gate PASS reproduced live. Top-finding class (named-but-missing enforcer): NONE FOUND.
- (b) F-series: 12 functions, all registered, all mapped to invariants (check 5 guarantees no orphan). Detector-vs-code-shape
  checks done per function; weaknesses named at F-10 (F6 comment/behavior), F-11 (F8 multi-line blindness), F-12 (F2 stale
  audit gap). F14/F15/F17 allowlists/registries are stale-audited and currently clean; F2's is not (clean today, verified).
- (c) CI: no `|| true`/continue-on-error on any GATING step; the only report-only lane is deliberate and labeled; one
  latent vacuous-pass shape (npmtest empty glob) currently non-vacuous; meta-gate git ls-files keying confirmed in code.
  Required-check status is out-of-repo GitHub state.
- (d) Engine rule list (7 rules) ↔ commit-msg hook wiring intact; the CI leg of rule 014 is vacuous (F-2).
- (e) trust.ts: 973 lines read; consumers = 2 admin routes + source-growth + supabase-server; F11 gates the math; Q7 decay
  path DORMANT for lack of any scheduler (F-5); 5 dead exports (F-6); moat interaction consistent with SC-9/F12
  (evaluateCandidatePromotion's effective_tier?? base_tier read is the SEALED source-level side, never the reg-fact stamp).
- (f) pretooluse gate + skill-map: fail-closed verified, wiring check sound, subagent floor documented; mapping lags the
  four new chokepoint files (F-4) — the concrete "governed path that moved" instance in this slice.

## 4. Manifest check-off

**Manifest check-off: 95/95 files read** (list reconciled against `_manifest_files.tsv` slice: 6 `.github/workflows/*.yml`
+ 88 `fsi-app/.discipline/**` rows (tsv lines 302-389) + `fsi-app/src/lib/trust.ts`). Reconciliation note: manifest §A
header says "87 files / 9,202 lines" for CODE-2; the tsv slice enumerates 95 rows = 86 code-kind + 9 data-kind
(READMEs, INSTALL, OUT-OF-REPO-BOUNDARY, coverage-report.json, 2 hooks) — the §A figure counts approximately the
code-kind subset; all 95 were read regardless. `coverage-report.json` (3,844-line generated JSON data artifact) was
audited by full summary + complete gap-list extraction + generation-commit dating rather than line-by-line, per the
manifest's data-artifact deviation (§A deviation 2).

## 5. Tool-call count and deviation log

- **Tool calls: 111** (Read 88, Bash 15 read-only shells incl. one execution of the meta-gate CLI and one `node -e` JSON
  summary, Grep 1, Glob 1, plus this register Write). Zero DB calls (slice is code-only; no DB question arose).
- Deviations:
  1. Slice-size reconciliation as stated in §4 (95 tsv rows vs "87" header; treated the tsv as authoritative and read all rows).
  2. Ran `node fsi-app/.discipline/governance/invariant-coverage.mjs` (read-only CLI, exit-status + report) to verify the
     meta-gate live rather than only statically — within the read-only mandate (no --apply, no writes, no model calls, no fetches).
  3. coverage-report.json sampled-structurally as described (data artifact, not line-by-line).
  4. `predicates.test.mjs` was read in two passes (limit/offset) — full line coverage achieved.
  5. Required-vs-advisory GitHub check status not verifiable from the tree (out-of-repo GitHub Settings state) — recorded
     as such rather than queried, to stay within the zero-external-calls posture.
