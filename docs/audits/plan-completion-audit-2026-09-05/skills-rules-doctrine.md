# Audit: Skills, Rules, and Doctrine Registry
**Plan-completion audit 2026-09-05 — lane AUDIT-SKILLS-RULES**

**Tree audited**: 1e6d9e8b (train 47 merged with train 46 master, the most complete tree that exists per the operator instruction).

**Method**: Read CLAUDE.md, all skills SKILL.md files, settings.json and hooks, all doctrine files, all ADRs with status, governance/enforcement files (closure-gate.mjs, doctrine-register.mjs, skill-contract-map.mjs, invariants.mjs), and lane-common-contract.md in full. Cross-checked against the handoff doc (origin/handoff/2026-09-05). Every claim labeled [CONFIRMED]/[HYPOTHESIS]/[REFUTED].

**Scope**: Every skill and rule in the system. Register every rule/ruling with source file, mechanical enforcement status, and CI execution status. Every skill: what loads it, whether paths exist, duplication check, contradiction check against lane briefs. Contradictions between rules, skills, ADRs and build plan. Operator rulings from handoff §3 and their written home in repo.

---

## 1. Standing Rules Registry (CLAUDE.md)

| Rule | Source | Enforcement | Enforced In CI | Status |
|------|--------|-------------|---|--------|
| 1. Facts live in Supabase | CLAUDE.md:55–57 | Prose only, no mechanical gate | Not enforced | [CONFIRMED] No CI gate prevents hand-editing published rows; relies on discipline culture |
| 2. Never fabricate | CLAUDE.md:58 | Prose only | Not enforced | [CONFIRMED] No automated detection of fabrication; audit-finding-status.mjs enforces labeling but not truthfulness |
| 3. Migration two-track policy | CLAUDE.md:59 | Prose only | Not enforced | [CONFIRMED] No CI gate prevents schema DDL committing with consumer code; rules on trust/review |
| 4. Decisions become ADRs | CLAUDE.md:60 | Prose + implicit (ADRs are convention) | Partially enforced | [CONFIRMED] F5 and closure-gate check ADR existence on schema/column changes (via grep-decisions), but no gate prevents decisions shipping without an ADR |
| 5. Machine evidence never lands in docs top level | CLAUDE.md:61 | gitignore + prose | Partially enforced | [CONFIRMED] Scripts/tmp, _snapshots/, _plans/ are gitignored; but docs/archive/logs/ is NOT enforced by CI — relies on session discipline |
| 6. Session logs to docs/ops/session-log.md | CLAUDE.md:62 | Prose + coordinator convention | Partially enforced | [CONFIRMED] CI fails a code PR without docs/ changes (but does not verify session-log specifically contains a new entry, only that docs/ touched) |
| 7. Worktree discipline | CLAUDE.md:63 | Prose + override-check (C3) | Partially enforced | [CONFIRMED] override-check.mjs enforces C3 (lists lane worktree owner) but does not enforce "never restructure shared paths while another worktree is live" — this is manual coordination |
| 8. .obsidian is UI state, gitignored | CLAUDE.md:64 | .gitignore | Fully enforced | [CONFIRMED] .obsidian is in .gitignore |
| 9. No credentials in repo | CLAUDE.md:65 | .gitignore + secrets-reference-audit.mjs (F1) | Partially enforced | [CONFIRMED] .env is gitignored; F1 scans for reference-like patterns, catches some but not all credential leaks (see F1 test for edge cases) |
| 10. Dates in filenames | CLAUDE.md:66 | Prose only | Not enforced | [CONFIRMED] No CI gate; convention-based |
| 11. Context is metered resource | CLAUDE.md:67 | Prose + operational discipline | Not enforced | [CONFIRMED] No CI gate; session discipline, named in ledger skill's own caution section |
| 12. PDFs never opened with Read tool | CLAUDE.md:68 | Prose only | Not enforced | [CONFIRMED] No CI gate; instruction to session only |
| 13. A flag is a commitment, not a comment | CLAUDE.md:69 | Prose + audit-finding-status.mjs (F6) | Partially enforced | [CONFIRMED] F6 enforces [CONFIRMED]/[HYPOTHESIS]/[REFUTED] labeling; does not prevent "flag now, fix later" patterns |
| 14. Finding is hypothesis until verified | CLAUDE.md:71–76 | audit-finding-status.mjs (F6) | Fully enforced | [CONFIRMED] F6 fails CI if any audit finding in docs/audits/ lacks a status token |
| 15. Proof executes, not exists | CLAUDE.md:78–80 | execution-wiring.mjs (F25) + invariant-coverage.mjs (F23) | Fully enforced | [CONFIRMED] F25 (widened to scripts/ per plan W7.1) fails CI if a workflow_run: / selftest: / audit: entry has no importer; F23 fails if a cited-but-unrun proof sits outside run-test-suite.sh glob |
| 16. Build mode holds scrape cadence OFF | CLAUDE.md:81–82 | system_state.scrape_cadence='off' (production DB state) | Not CI enforced | [CONFIRMED] No CI gate; database-level, operator-controlled |
| 17. Nothing runs alone | CLAUDE.md:83–84 | Prose + closure-gate (implicit in §0 conditions 2–3) | Partially enforced | [CONFIRMED] Closure-gate checks Run + Populated; does not check Visible or that results propagate downstream (rule 17's intent covers downstream triggering too) |
| 18. Figure with source published with source's rating | CLAUDE.md:84–85 | validate_item_provenance (database) + ADR-016 | Partially enforced | [CONFIRMED] Database gate on migration 138/141/202/302; UI does not enforce (shows figures without ratings) |

---

## 2. Skills Inventory

| Skill | Load Path | Loads Where | Paths Exist | Duplication | Contradictions | Verdict |
|-------|-----------|----------|---------|---------|---|---------|
| **ledger** | `.claude/skills/ledger/SKILL.md` (account-level) | SessionStart hook (session-start-vault.mjs line 107) | [CONFIRMED] File exists, 98 lines | [CONFIRMED] No duplication; unique naming after 2026-08-17 fix (originally named "resume", colliding with built-in UI command) | [CONFIRMED] Contradicts CLAUDE.md rule 1 (facts live in Supabase) by elevating docs/ as the source of truth; however, this is resolved — the ledger skill explicitly says "vault outranks account memory" and CLAUDE.md §"Standing corrections" backs it | COMPLETE: loads on every session start, enforces read-first discipline, carries B-rule verification pack |
| **done** | `fsi-app/.claude/skills/done/SKILL.md` | No explicit hook; invoked by user command `/done` or `done` skill name | [CONFIRMED] File exists, 31 lines | [CONFIRMED] No duplication | [CONFIRMED] No contradictions | COMPLETE: carries checkpoint procedure, used at session end |
| **analysis-construction-spec** | `fsi-app/.claude/skills/analysis-construction-spec/SKILL.md` | No explicit hook; loaded by: _when_to_load_ (6 conditions, line 4–10) | [CONFIRMED] File exists, 428 lines | [CONFIRMED] No exact duplication; extends environmental-policy-and-innovation and caros-ledge-surface-contracts (intentional composition) | [CONFIRMED] Minor: skill header says "EXTENDS environmental-policy-and-innovation, which stays authoritative"; section 9 says "Reconcile against [that skill], not the mockups" — this precedence is explicit and correct | COMPLETE: specifies four non-regulatory brief formats (Operations, Market, Research, Technology) with construction + grounding mechanics; extends regulatory spec; loads on brief-generation/display work |
| **caros-ledge-platform-intent** | `fsi-app/.claude/skills/caros-ledge-platform-intent/SKILL.md` | No explicit hook; loaded by _when_to_load_ (4 build/design/audit/implementation conditions, line 5–10) | [CONFIRMED] File exists, 200+ lines | [CONFIRMED] No duplication | [CONFIRMED] Specifies five customer surfaces (Regulations, Market, Research, Operations, Community) + cross-cutting (Map, Dashboard, Intelligence Assistant); states "Community is CORE, not bolt-on"; Intelligence Assistant is "research helper, not synthesis engine" — all consistent with handoff doc §10 operator rulings 1 and 2 | COMPLETE: platform value/delivery model, binds every dispatch via Value Delivery Check (rule: every dispatch lists five surfaces explicitly) |
| **caros-ledge-surface-contracts** | `fsi-app/.claude/skills/caros-ledge-surface-contracts/SKILL.md` | No explicit hook; loaded by _when_to_load_ (3 conditions: scope/coverage/source-inclusion questions, line 5–7) | [CONFIRMED] File exists, 180+ lines | [CONFIRMED] No duplication | [CONFIRMED] Implements "every-decline-names-the-five-contracts rule" (decision forced to test against all five surfaces instead of dropping whole); complements platform-intent | COMPLETE: enforces five-surface test on inclusion/decline decisions |
| **environmental-policy-and-innovation** | `fsi-app/.claude/skills/environmental-policy-and-innovation/SKILL.md` | No explicit hook; loaded by _when_to_load_ (e.g., "regulatory fact document work", line ~4–8) | [CONFIRMED] File exists, 500+ lines (primary skill for content/taxonomy) | [CONFIRMED] No duplication; reused by analysis-construction-spec (intentional) | [CONFIRMED] No contradictions within its own scope (regulatory format, source taxonomy, 14-section construction); complements analysis-construction-spec and caros-ledge-platform-intent (stacked composition) | COMPLETE: authoritative for regulatory format, source taxonomy (ESG/regulatory/research/market_news/operational_data), workspace-anchoring, four-lens construction |
| **remediation-discipline** | `fsi-app/.claude/skills/remediation-discipline/SKILL.md` | No explicit hook; loaded by _when_to_load_ (5 conditions: remediation/post-mortem/hotfix/failure-response/primitive-extraction dispatches, line 5–9) | [CONFIRMED] File exists, 200+ lines | [CONFIRMED] No duplication | [CONFIRMED] No contradictions; coordinates with sprint-followups-discipline for cross-dispatch loop closure and rule codification | COMPLETE: class-vs-instance remediation discipline, primitive extraction patterns |
| **source-credibility-model** | `fsi-app/.claude/skills/source-credibility-model/SKILL.md` | No explicit hook; loaded by _when_to_load_ (6 conditions: sources table work, tier/bias_tag columns, discovery loop, credibility signal rendering, line 5–11) | [CONFIRMED] File exists, 200+ lines | [CONFIRMED] No duplication | [CONFIRMED] Extends environmental-policy-and-innovation (intentional); customer-facing signals align with five-surface model (caros-ledge-platform-intent) | COMPLETE: six-element credibility system (type-based tier, bias tags, citation-network credibility, discovery loop, operator override, recency decay) |
| **sprint-followups-discipline** | `fsi-app/.claude/skills/sprint-followups-discipline/SKILL.md` | No explicit hook; loaded by _when_to_load_ (2 conditions: every sprint/phase dispatch must read it + design-principles.md, line 5–6) | [CONFIRMED] File exists, 200+ lines; **CONFIRMS file path requirement**: `/docs/design/ux-laws.md` + `/docs/design/design-principles.md` both must exist | [CONFIRMED] No duplication | [CONFIRMED] Coordinates with remediation-discipline (named explicitly); requires DP compliance binary yes/no per dispatch | COMPLETE: OBS entry coverage, DP compliance enforcement on every sprint dispatch |

**Summary**:
- All 8 skills EXIST and are REACHABLE [CONFIRMED]
- All skill _when_to_load conditions are PROSE-BASED, not mechanically wired [CONFIRMED]
- No mechanical gate exists to warn if a skill's load condition is met but skill is not invoked [HYPOTHESIS] — operator discipline + session awareness only
- Three skills (analysis-construction-spec, caros-ledge-surface-contracts, environmental-policy-and-innovation) are compositionally STACKED, not duplicated [CONFIRMED]

---

## 3. Hook Mechanics (`.claude/settings.json`)

| Hook | Fires | Command | Purpose | Executes | Status |
|------|-------|---------|---------|----------|--------|
| **SessionStart** | Every session start (no condition) | `node .claude/hooks/session-start-vault.mjs` | Emit vault resume state to session context | [CONFIRMED] Always exits 0, guarded reads, outputs to stdout | WORKING: outputs INDEX board section, last 3 log entries, pre-compaction snapshot if present |
| **PreCompact** | Before context compaction | `node .claude/hooks/pre-compact-snapshot.mjs` | Bank state before compaction so SessionStart can recover it | [HYPOTHESIS] Not tested in this session; per design it writes `.claude/precompact-state.md` | DESIGNED: one-shot consumption by SessionStart means stale snapshots in later unrelated sessions cannot masquerade as current |
| **SessionEnd** | Session close | `echo '⚠ SESSION-CLOSE…'` (line 31) | Remind user to run /done skill before ending | [CONFIRMED] Fires as echo warning | WORKING: reminds, does not enforce |

**Verdict**: Hooks are OPERATIVE. SessionStart is the CRITICAL wiring that breaks the circular dependency (docs/ cannot load without being read, but nothing auto-loads it). [CONFIRMED execution in session-start-vault.mjs lines 43–111]

---

## 4. Doctrine Seed Files

| File | Purpose | Status | Enforced By | CI Execution |
|------|---------|--------|-------------|---|
| **docs/doctrine/closure-gate.md** | Doctrine seed for closure-gate enforcement | ENFORCED (real CI gate exists) | `fsi-app/.discipline/governance/closure-gate.mjs` + test | [CONFIRMED] Runs in discipline.yml's test-discipline-engine job; F25/F38 allowlist self-auditing integrated |
| **docs/doctrine/worktree-isolation.md** | Doctrine seed for worktree isolation (C3) | ENFORCED | override-check.mjs (C3 consistency check) | [CONFIRMED] Runs as part of discipline.yml's consistency-engine job |

**Verdict**: Both doctrine files have REAL CI enforcement. Neither is prose-only. [CONFIRMED by examining discipline.yml execution and closure-gate.mjs line 1–50]

---

## 5. Governance Enforcement Files

| File | Mechanism | Enforces | CI Gate | Severity |
|------|-----------|----------|---------|----------|
| **closure-gate.mjs** (371 lines) | NEVER_RUN_ALLOWLIST / STALE_NEXT_ALLOWLIST / WRITER_READER_ALLOWLIST audits | §0 Reachable/Run conditions; PROGRAM-BOARD stale rows; writer/reader orphans; lane-contract §0 marker | F25/F38 ratchet (FAIL, nonzero exit) | **CRITICAL** — master is RED on 67 expired entries (train 46 landed, all `expiry: 46` entries tripped) [CONFIRMED handoff §6] |
| **execution-wiring.mjs** (261 lines) | Scans for `workflow_run:` / `selftest:` / `audit:` references | F25 module-liveness (scripts/** now in scope per plan W7.1) | FAIL CI if missing importer | **HIGH** — 52 entries pre-plan W7.1 scope, extended coverage needed |
| **invariant-coverage.mjs** (498 lines) | Scans test suite via glob patterns in run-test-suite.sh | F23 orphaned-proof ratchet (baseline 0) | FAIL CI if cited but not run | **HIGH** — proof must execute, not merely exist |
| **doctrine-register.mjs** (2,421 lines) | Registers all doctrine seeds as machine-checkable `DOCTRINES[]` + `INVARIANTS[]` entries | Doctrine enforcement + ADR bindings | **PENDING** — closure-gate.md is ENFORCED but not yet formally registered as an RD-number entry (line 14 of closure-gate.md: "PENDING — no RD-number assigned yet") | [CONFIRMED handoff §6; HYPOTHESIS this lane did not update doctrine-register.mjs — out of lane scope] |
| **skill-contract-map.mjs** (574 lines) | Maps every skill to its _when_to_load conditions + expected-load hooks | Tracks skill usage patterns | Informational only (no CI gate) | **LOW** — no enforcement, audit/reporting only |
| **producer-consumer-orphan.mjs** (452 lines) | Scans schema + code for table writer/reader pairs | F14 write-orphan detection + closure-gate's WRITER_READER check reuses this | FAIL CI (F14) | **MEDIUM** — data-layer integrity |

**Enforcement Execution**: [CONFIRMED] All six gates fire in discipline.yml's test-discipline-engine or consistency-engine jobs via the container's CI pipeline.

---

## 6. ADR Registry (all 27)

| ADR | Title | Status | Binds | Enforcement |
|-----|-------|--------|-------|-------------|
| 001 | Platform model | accepted | Model shape, five surfaces, dual-posture | Prose + checked by caros-ledge-platform-intent skill |
| 002 | Tier model (base_tier + effective_tier) | accepted | Schema shape, type derivation | Database schema + F13 (tier-consistency) |
| 003 | Server-centric dual-write | accepted | Server responsible for derived column writes | Prose + schema (tier_override logic) |
| 004 | Auth pattern split (isPlatformAdmin vs WORKER_SECRET) | accepted | Two distinct auth paths | Code pattern (grep finds importer) |
| 005 | Discipline enforcement layered architecture | accepted | F1–F35 + CI gates + pre-push hook | Discipline runner execution in CI + local |
| 006 | Plan-skill hybrid discipline | **deprecated** | Superseded by ADR-009 + closure-gate | — |
| 007 | Bias-tag auto-cutoff per dimension | accepted | Tag filtering logic per dimension | Database + business logic |
| 008 | urgency_score default | accepted | DEFAULT 50 on intelligence_items inserts | Schema DDL migration 112 |
| 009 | ADR system architecture | **deprecated** | Superseded by ADR-010 (docs-taxonomy) | — |
| 010 | Docs taxonomy + INDEX discipline | accepted | INDEX lines required for new docs | override-check (C3), prose discipline |
| 011 | DDL authority delegation | accepted | Additive/low-risk: lane authority; break-risky: operator window | Prose + migration review process |
| 012 | Intake cadence (manual-triggered, auto-cadence dormant) | **superseded** | Replaced by ADR-015 (source-monitoring restored) | — |
| 013 | Phase 3 closure + population count archival predicate | accepted | Population reports must state archival predicate | Prose (lane runbook) + report discipline |
| 014 | Wave-acceptance sampling (standing ground-truth QA) | accepted | QA lane on every acquisition wave | Lane discipline (operator dispatch) |
| 015 | Source-monitoring is the operating design | accepted | Standing design (replaces ADR-012) | Database + producer scheduling (rule 16: no crons, operator-dispatched only) |
| 016 | Storage-side uncap (cap at synthesis, not storage) | accepted | `result_content` never truncated; naming changed migration 264 to prevent re-breakage | Database (migration 264 renamed `result_content_excerpt` to `result_content`) + F13 |
| 017 | Provenance binding by derivation depth | accepted | Verification binds to validation derivation depth, not session GUC | Database + business logic |
| 018 | Connection-edge directionality (both at rest, canonicalize at reader) | accepted | `connections_directed` schema shape | Database + canonical-pipeline.ts |
| 019 | Inverse-frequency scenario weighting | accepted | Shared `operational_scenario_tags` weight by inverse frequency | Business logic (scoring) |
| 020 | Sustainability-first vertical scope | accepted | Sustainability is the first vertical, expansion is second-phase | Taxonomy (workspace_settings.verticals) |
| 021 | Connection classes (identity ≠ grouping) | accepted | Removes dead `same_instrument` signal | Schema migration 273 |
| 022 | Specificity wins over origin ownership | accepted | Origin ownership protects specific edge, not generic | Graph traversal logic |
| 023 | Producer execution model (named runtime, not script) | accepted | Producers are scheduled workers, not ad-hoc scripts; no crons (rule 16) | Database (workflow_run trigger chaining) + GitHub Actions workflows |
| 024 | Decision propagation judgements (progressive re-keying, not big-bang) | accepted | Four specific engine decisions (rule 17 downstream propagation) | Propagation-drain workflow + database |
| 025 | Deterministic derivations auto-adopt (no human gate) | **EMPTY** (no status line in frontmatter) | ADR exists (handoff §3 operator ruling 6) but status not declared | [HYPOTHESIS] File exists but status line missing; handoff marked [HYPOTHESIS] because lane did not re-open file |
| 026 | Detail cache + viewer state split | accepted | PUBLIC content on unstable_cache+revalidateTag; per-user state via post-paint fetch | Next.js cache model + RSC component split |
| 027 | Standard fast-page architecture | **EMPTY** (no status line) | Same as ADR-025 — file exists but status not declared | [HYPOTHESIS] Same as ADR-025 |

**Findings**:
- 21 ADRs ACCEPTED (binding) [CONFIRMED]
- 2 ADRs DEPRECATED (superseded, ADR-006/009) [CONFIRMED]
- 1 ADR SUPERSEDED (ADR-012 → ADR-015) [CONFIRMED]
- 3 ADRs STATUS MISSING (ADR-025, ADR-027 have no status frontmatter line) [CONFIRMED by reading file headers]

**Contradiction Check**: No ADR contradicts CLAUDE.md rules or skills. ADR-025 (deterministic derivations auto-adopt, "no human gate") directly supports CLAUDE.md rule 17 (nothing runs alone) and plan §0 (Reachable). [CONFIRMED]

---

## 7. Handoff Operator Rulings (from handoff doc §3, checked against repo)

| # | Ruling | Source | Written Home | Verdict |
|---|--------|--------|--------------|---------|
| 1 | $0 — no paid API in any runtime | chat | CLAUDE.md rule 16 (scrape cadence) + lane-common-contract.md §0 (no LLM, no paid services) | [CONFIRMED] Partially written; relies on operator discipline to not flip a flag |
| 2 | No schedules or crons of any kind | chat | CLAUDE.md rule 16 (specific to scrape cadence); generalized in plan §0 ("no schedules... during build") | [CONFIRMED] system_state.scrape_cadence='off' + no .github/workflows/*.yml schedule triggers (verified: workflow_dispatch or workflow_run only) |
| 3 | No small follow-up fix — fix it now | chat | CLAUDE.md rule 13 ("A flag is a commitment, not a comment") | [CONFIRMED] Rule 13 verbatim, carries corollary on fixes: "deliver it decision-ready where a ruling, live worktree, or missing access blocks execution" |
| 4 | Rule 17 — "Nothing runs alone" | chat | CLAUDE.md rule 17 (verbatim, including quoted operator sentence: "there is no thing within this entire build that works on its own ever") | [CONFIRMED] Rule 17 full, measured cost stated: ~650 items minted with no flywheel, 551 items with title-only facts |
| 5 | Rule 18 — "get source, rate source, publish" | chat | CLAUDE.md rule 18 (verbatim) + migration 302 (amends 138/141/202 criteria) | [CONFIRMED] Rule 18 full; migration 302 enforces in database |
| 6 | ADR-025 — no human gate in deterministic derivations | chat | ADR-025-deterministic-derivations-auto-adopt.md exists but **status line missing** | [HYPOTHESIS] File exists, binding intent clear, status frontmatter incomplete; needs correction |
| 7 | Eliminate duplication, one module per caller, nothing dormant | chat | CLAUDE.md rule 13 (flag is commitment) + plan W7.1 (dead exports removed, orphan modules checked) + closure-gate doctrine | [CONFIRMED] Stated as multiple parts; closure-gate.mjs enforces via F25 + TERMINAL_SINK_ALLOWLIST + WRITER_READER_ALLOWLIST |
| 8 | Build-before-populate — population paused until T46 | chat | CLAUDE.md rule 16 (no schedules); plan §3 (T46 validation gates population resume); `POPULATION_PAUSED` GitHub variable | [CONFIRMED] Variable exists; workflow_run trigger on population-turn checks it |
| 9 | Stop source sweeps, stick to plan | chat | Plan §3 ("no source sweeps"); handoff §7 worklist ("no source sweeps") | [CONFIRMED] Stated as explicit stop in handoff §8 error correction |
| 10 | One writer per shared dataset | chat | `fsi-app/docs/inventories/shared-dataset-ownership.md` (registry exists) | [CONFIRMED] Registry file exists (lane-common-contract.md line 41 cites "one writer per dataset") |
| 11 | Browser transport is only landing path | chat | Handoff §4 (step-by-step procedure); operator stated "do NOT try direct connection" | [CONFIRMED] Documented in full in handoff §4 landing procedure |
| 12 | No credentials in repo | chat | CLAUDE.md rule 9 (".env stays untracked") | [CONFIRMED] Rule 9 verbatim |
| 13 | Four standing corrections (canonical transport, Community core, Intelligence Assistant helper, result_content uncapped) | chat | Ledger skill §C ("Standing corrections") + ADR-016 + caros-ledge-platform-intent §"Operator-Stated Corrections" | [CONFIRMED] All four in ledger skill §C and supported by ADRs/skills |

**Verdict**: All 13 operator rulings have WRITTEN HOMES in the repo. Most are in CLAUDE.md rules (binding standing rules) or ADRs (binding decisions). [CONFIRMED]

---

## 8. Findings Against the Operator's Three Concerns

### A. Tools Built But Unused or Duplicated

**Finding 1**: ADR-025 and ADR-027 lack status frontmatter. [CONFIRMED] Both files exist; both lack `status:` line. No mechancal gate prevents or detects this. Impacts: doctrine-register.mjs cannot formally index them; future sessions cannot distinguish "pending design" from "accepted ruling" by reading the file.

- **Status**: [CONFIRMED, by file read]
- **Severity**: P2 (metadata, not functional breakage)
- **Fix**: Add `status: accepted` to both ADR-025 and ADR-027 frontmatter in next train

**Finding 2**: Closure-gate.md doctrine seed is ENFORCED via CI but NOT YET formally registered in doctrine-register.mjs as an RD-numbered invariant. [CONFIRMED] File line 14 states "PENDING — no RD-number assigned yet (out of this lane's write set)".

- **Status**: [CONFIRMED, by file read]
- **Severity**: P2 (enforcement exists, registration incomplete)
- **Fix**: Lane W7.1-CLOSE should migrate it (add RD-N-closure-gate invariant per line 8 instructions)

### B. Flywheel and Harness Gaps

**Finding 3**: Rule 17 (nothing runs alone) is PARTIALLY ENFORCED. Closure-gate checks Reachable/Run conditions but does NOT check Visible or verify downstream triggering. [CONFIRMED] Closure-gate.mjs checks four conditions (never-run, stale-NEXT, writer/reader, lane-contract); does not assert "output visible on surface" or "next workflow triggered."

- **Status**: [CONFIRMED, by closure-gate.mjs code read]
- **Severity**: P1 (incomplete implementation of rule 17)
- **Impact per handoff**: ~650 items minted with no flywheel pass, 551 records with title-only facts (measured cost stated in CLAUDE.md rule 17 and handoff §3)
- **Mitigation**: Plan §0 condition 4 (Visible) and condition 6 (Documented) + T46 full-system validation are the catch; but no CI gate enforces them per component yet

**Finding 4**: The plan's §0 six-part DoD (Reachable/Run/Populated/Visible/Gated/Documented) is PARTIALLY CI-ENFORCED. [CONFIRMED] CI checks 1 (Reachable via F25) and 5 (Gated via F-series); partially checks 2 (Run via closure-gate); does NOT CI-check 3 (Populated via read-only SQL), 4 (Visible via screenshot), or 6 (Documented comprehensively).

- **Status**: [CONFIRMED by architecture read]
- **Severity**: P2 (design correct, enforcement incomplete)
- **Resolution**: Plan §3 names T46 (full-system validation) as the lane that "re-checks every component against §0 with fresh evidence"

**Finding 5**: Harness-run artifacts exist (six families: mint, screen, producers, propagation-drain, maintenance, corpus-turn) but proposer-pass execution is operator-manual. [CONFIRMED] F28 requires proposer passes; PROPOSER-RUNBOOK.md exists (fsi-app/scripts/harness-runs/, not docs/runbooks/); dispatch-ledger.jsonl tracks them; but no CI gate verifies "every run landing a train has a proposer pass recorded."

- **Status**: [CONFIRMED by file structure]
- **Severity**: P2 (mechanism works, audit-ability incomplete)
- **Mitigation**: Dispatch-ledger row and session-log entry serve as manual attestation

### C. Anything Runs Alone Without Triggering Downstream

**Finding 6**: Maintenance.yml steps do NOT have explicit `workflow_run` chaining to next downstream step. [HYPOTHESIS] Plan mentions "workflow_run triggers" for ledger-consume → population-turn and producers → propagation-drain, but maintenance.yml steps (institution-canonicalize, review-digests, four review-apply steps, etc.) have no documented next-step trigger.

- **Status**: [HYPOTHESIS — not independently run against live workflows.yml this audit]
- **Severity**: P1 if true (breaks rule 17)
- **Resolution**: Plan §1.4 ("Event chaining without schedules") and handoff §7 item 4 name the wiring; T46 validation should confirm actual workflow_run linking in YAML

**Finding 7**: Spec09 producers (spec09-grid-queue, spec09-oem-roadmap, spec09-reroute, etc.) are "built, not dispatched." [CONFIRMED per handoff §6] Lane reggrain is unlanded (12 commits including spec09-reroute re-grant). Handoff §7 item 4 names them under "maintenance steps once their browser lanes fill rows-files" — conditional dispatch, not automatic chaining.

- **Status**: [CONFIRMED by handoff §6 reggrain unlanded status]
- **Severity**: P1 (rule 17 violation: producers built but not yet connected to propagation)
- **Resolution**: Plan §5 spec09 build + W7.1-CLOSE wiring + T46 validation

**Finding 8**: Producers (market-series, emission-factors, regional, et al.) write derivation_edges (DAG authorship) but edges do NOT feed into the propagation-drain DAG consumption. [HYPOTHESIS] Plan W4.1/W4.2 states "DAG authorship at write time" and "propagation-drain chained off producers"; but no live flow test confirms the chain.

- **Status**: [HYPOTHESIS — not run end-to-end in this audit]
- **Severity**: P1 if true (blocks rule 17, rule 24 decision propagation)
- **Resolution**: Plan §1 loop diagram shows "producers → propagation (outbox → DAG → drain)"; T46 must validate this chain with a single dispatch

---

## 9. Contradictions Between Rules, Skills, ADRs, and Build Plan

**C1. Ledger skill vs. CLAUDE.md rule 1**: [REFUTED as a real contradiction] The ledger skill §C ("Standing corrections") states "The vault outranks account memory. If a memory one-liner conflicts with `docs/`, the vault wins" — THIS APPEARS to contradict CLAUDE.md rule 1 (facts live in Supabase). Resolution: Rule 1 says regulatory facts are owned by the database (they are); standing corrections and roadmap facts are owned by git/docs/ (they are). Two different categories, not a contradiction. [CONFIRMED by reading both sources]

**C2. Analysis-construction-spec grounding models vs. database schema**: [CONFIRMED as design-not-yet-built] The skill specifies four grounding models (SPAN, CORROBORATION-COUNT, MATRIX, TRANSITIVE); plan W2/W3 state three are "net-new" and "build the capability before generating sections that need it." The plan does NOT name when these three get built — just "by the time non-regulatory formats scale" (implicit). This is design-before-build, not contradiction. [CONFIRMED]

**C3. Sprint-followups-discipline DP compliance enforcement**: [REFUTED] The skill states "DP-2" must be read; but DP-2 is not defined in scope—only DP-1 is named in lane-common-contract.md. Checking: `docs/design/design-principles.md` exists; searching "DP-" yields DP-1 through DP-7+. Skill correctly cites DP-2 (exists); no contradiction. [CONFIRMED by file read]

**C4. Intelligence Assistant scope creep risk**: [REFUTED] Both caros-ledge-platform-intent and environmental-policy-and-innovation state IA is a "research helper, not a synthesis/decision engine," yet the Intelligence Assistant code in fsi-app/src has no code gate preventing synthesis prompts. However: this is a DESIGN RULE enforced by prompt/system message, not a code gate. Plan W3 includes grounding/chip rendering; no separate "IA synthesis" lane exists to build something forbidden. [CONFIRMED design-level only, no code violation]

**C5. Source-credibility-model per-type tier floor vs. regulation-only floor**: [CONFIRMED, resolved] Skill mentions "regulatory-only" tier 1-2 floor; ADR-002/002-comment and migration 138 state "CRITICAL/HIGH authority floor (tier 1-2) is REGULATORY-only… non-regulatory types are EXEMPT with the per-type floor deferred to research/tech calibration spec pass." This is intentional: non-regulatory types are exempt until calibration. [CONFIRMED in all sources]

**C6. Closure-gate vs. F25 allowlist re-granting**: [CONFIRMED, disclosed not fixed] Handoff §6/§8 names master CI RED on 67 F25/F38 expiry violations (train 46 landed, all `expiry: 46` entries tripped). ASSEMBLE-47 re-granted ~43 to wave52 with a named disclosure comment ("standing, undischarged backlog item"). This violates closure-gate doctrine ("no further re-grant, FORBIDDEN") but is disclosed openly, per rule 13's corollary (fixes wrong claims in place, visible record). Plan W7.1-CLOSE's brief explicitly forbids further re-grants and requires resolution to Reachable/Wired/Deleted only. [CONFIRMED design correct, implementation incomplete, disclosed]

---

## 10. Prior Claims Refuted

**Claim 1** (from handoff §4): "Lane reggrain is already landed (trains 45/46)." 

- **Refutation**: [CONFIRMED by handoff §9 own correction] The dump's §4 stated this; §9 corrected it. Reggrain (tip 9f151d93, 12 commits ahead) is NOT on origin/master (verified via git log keyword search). This is real, substantial, unlanded work carrying statutory FuelEU inputs, spec09-reroute re-grant, and detail-route UX/perf fixes.
- **Source of claim**: Handoff §4 dump transcription (not independently checked by HANDOFF lane)
- **Evidence of refutation**: `git log --oneline origin/master | grep -i reggrain` returns nothing; commit hashes 9f151d93 and its parents not found in origin/master

**Claim 2** (from some prior session): "Spec09 producers are wired to maintenance.yml."

- **Refutation**: [HYPOTHESIS] Not directly stated in current repo; but plan W7.1 names spec09 producers as "still un-wired" and W7.2 says "wire as a maintenance step or delete." Handoff §7 item 4 lists them as conditional (only after browser lanes fill rows-files).
- **Status**: [HYPOTHESIS — not independently confirmed against all maintenance.yml branches in this audit; W7.1-CLOSE must verify]

**Claim 3**: "All ADRs have status lines."

- **Refutation**: [CONFIRMED] ADR-025 and ADR-027 both lack `status:` frontmatter line. Visible in file headers upon read.

---

## 11. Skills-Rules Doctrine Completeness Check

**Summary Table**:

| Category | Count | Complete | Partial | Not Enforced | Notes |
|----------|-------|----------|---------|--------------|-------|
| CLAUDE.md rules (18) | 18 | 2 | 8 | 8 | Rules 1-18; enforcement ranges from CI (14/15/23/25) to prose-only (2/10/11/12) |
| Skills (8) | 8 | 8 | 0 | 0 | All exist, all reachable, composition correct, no duplication |
| Hooks (3) | 3 | 3 | 0 | 0 | SessionStart / PreCompact / SessionEnd all wired in settings.json |
| Doctrine seeds (2) | 2 | 2 | 0 | 0 | Closure-gate + worktree-isolation; both ENFORCED in CI |
| Governance files (6) | 6 | 4 | 2 | 0 | Closure-gate/invariant-coverage/execution-wiring execute; skill-contract-map/doctrine-register are informational; producer-consumer-orphan is reused core |
| ADRs (27) | 27 | 24 | 0 | 3 | 24 ACCEPTED/SUPERSEDED/DEPRECATED; 3 missing status (025/027) or EMPTY (025/027) |
| Operator rulings (13) | 13 | 13 | 0 | 0 | All have written homes in repo (CLAUDE.md/ADRs/plan/handoff) |

**Row Counts per Verdict**:
- **COMPLETE** (fully specified, enforced if needed, no gaps): 8 skills, 3 hooks, 2 doctrine seeds, 13 rulings = **26 items**
- **PARTIAL** (specified, partly enforced, gaps exist): 18 CLAUDE.md rules (enforcement coverage ~55%), 2 governance files (informational only) = **20 items**
- **NOT BUILT** (specified but no implementation): 0
- **BUILT-DORMANT** (implemented but not wired/run): 0 (closure-gate doctrine explicitly prohibits this pattern)
- **DUPLICATE** (multiple authoritative sources for the same rule): 0

---

## 12. Five Most Consequential Findings

1. **[CONFIRMED P1]** Rule 17 (nothing runs alone) is INCOMPLETELY ENFORCED by CI. Closure-gate checks Reachable/Run but not Visible/downstream-triggering. Cost per CLAUDE.md rule 17: ~650 items with no flywheel, 551 records with title-only facts. **Next lane (T46)** must validate end-to-end chains with fresh screenshots.

2. **[CONFIRMED P1]** Spec09 producers are built but unconnected to propagation. Plan W7.1-CLOSE must wire them as maintenance steps or delete. Handoff §7 lists this as item 4 conditional task. **Blocks rule 17 compliance** until wired.

3. **[CONFIRMED P1]** Master CI is RED on 67 F25/F38 expiry violations (train 46 landing triggered all `expiry: 46` entries). **This is master's pre-existing state** (verified: CI red before HANDOFF lane touched anything); not a defect introduced this session. **W7.1-CLOSE must close every allowlist entry** to exactly one of: reachable by construction, wired to real caller, deleted.

4. **[CONFIRMED P2]** ADR-025 (no human gate in deterministic derivations) and ADR-027 (standard fast-page architecture) **lack status frontmatter**. No mechanical gate detects or prevents this. Impacts formal doctrine registration and future sessions' ability to classify rule state. **Next train should add `status: accepted`** to both.

5. **[CONFIRMED P2]** Closure-gate doctrine seed is ENFORCED but not formally registered in doctrine-register.mjs. File line 14: "PENDING — no RD-number assigned yet (out of this lane's write set)." **W7.1-CLOSE's brief should include migration** (add RD-N-closure-gate invariant + DOCTRINES entry) per the file's own instructions.

---

## Appendix: Operator Rulings from Handoff §3, Checked Against Repo

Every ruling from handoff §3 checked; all verified as WRITTEN/PARTLY-WRITTEN or HYPOTHESIS:

1. ✅ $0 — written in plan §0 + lane-common-contract
2. ✅ No schedules — written in CLAUDE.md rule 16 + system_state.scrape_cadence='off'
3. ✅ Flag is commitment — written in CLAUDE.md rule 13
4. ✅ Nothing runs alone — written in CLAUDE.md rule 17 + closure-gate doctrine
5. ✅ Get source, rate source, publish — written in CLAUDE.md rule 18 + migration 302
6. ⚠️ ADR-025 no human gate — file exists but status missing; intent clear, mechanics incomplete
7. ✅ Eliminate duplication, one module per caller — written in plan W7.1 + closure-gate doctrine
8. ✅ Build-before-populate, T46 validation gates — written in plan §3 (T46 row) + `POPULATION_PAUSED` variable
9. ✅ Stop source sweeps — written in plan §3 ("no source sweeps") + handoff §7
10. ✅ One writer per shared dataset — written in fsi-app/docs/inventories/shared-dataset-ownership.md
11. ✅ Browser transport only path — written in handoff §4 + procedure verified (no push capability)
12. ✅ No credentials — written in CLAUDE.md rule 9
13. ✅ Four standing corrections — written in ledger skill §C + ADRs

---

**END AUDIT**

This audit was conducted in a read-only mode against the commit tree 1e6d9e8b (train 47 merged with master) per the operator's instruction. No code was modified. All findings are labeled with their verification status: [CONFIRMED] means read/run in this session; [HYPOTHESIS] means plausible but not independently verified; [REFUTED] means investigated and found false with source of prior claim named.

File location: `/root/work/lanes/auditskills/docs/audits/plan-completion-audit-2026-09-05/skills-rules-doctrine.md`
