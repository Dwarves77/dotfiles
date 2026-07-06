---
name: remediation-discipline
description: Class-over-instance remediation discipline for Caro's Ledge platform engineering. When a problem surfaces, determines whether the failure is class or instance, then chooses remediation accordingly. Class-problem remediations address the class via primitive extraction, codified discipline, and refactor of known adjacent instances. Instance-only patches are appropriate only when the failure is genuinely scope-bounded; otherwise they are anti-pattern. Load on any remediation, post-mortem, hotfix, failure-response, or primitive-extraction dispatch. Provides the class-vs-instance recognition criteria, primitive extraction patterns, discipline codification thresholds, and worked examples from Caro's Ledge platform work. The principle is platform-engineering-agnostic; worked examples are session-specific because that is the available corpus, but the discipline transfers to any platform engineering remediation work. Coordinates with sprint-followups-discipline for cross-dispatch loop closure and named binding rule codification.
when_to_load:
  - "Framed as remediation, post-mortem, hotfix, or failure response"
  - "Investigating a recurring pattern across multiple instances"
  - "Extracting a primitive, library, or shared utility"
  - "Adding a new binding rule to any discipline skill"
  - "Scoping the response to a surfaced bug, regression, or production incident"
---

# Remediation Discipline

## Section 1: Purpose and Scope

This skill owns the class-over-instance principle, the recognition criteria for distinguishing class from instance failures, the primitive extraction patterns, the discipline codification thresholds, and the worked examples library.

This skill does NOT own domain-specific remediation logic. A credibility-model failure loads `source-credibility-model` alongside this skill; an admin-gating failure loads whatever applies; this skill is the META-DISCIPLINE that determines HOW to scope any remediation. Cross-skill load is additive, not exclusive.

The principle is platform-engineering-agnostic. The worked examples in Section 7 are session-specific because that is the available corpus; the discipline transfers to any platform engineering remediation work in any project (Caro's Ledge today, Pet Pursuit or future projects tomorrow). When this skill ports to another project, the principle and recognition criteria port unchanged; the worked-examples library grows with that project's instances.

## Section 2: The Class-Over-Instance Principle

**Binding statement (verbatim):**

> When a problem surfaces, determine whether the failure is class or instance. Class-problem remediations address the class via primitive extraction, codified discipline, and refactor of known adjacent instances. Instance-only patches are appropriate only when the failure is genuinely scope-bounded; otherwise they are anti-pattern.

Why this matters: ad-hoc instance patches compound. Each batch script discovers connection-pool timeouts the same way. Each sweep dispatch misses items in the same way. Each schema rename breaks consumers the same way. Patching each occurrence as it surfaces costs the same effort per occurrence, multiplied by N occurrences. Class fixes are bounded one-time investment that prevent the failure from recurring across all known and future instances of the class.

The autonomous-loop strategic frame depends on durable resilience primitives. A platform that requires operator intervention on every infrastructure variation cannot operate autonomously. The class-over-instance discipline is how the platform absorbs infrastructure realities instead of failing on them.

### Plan re-grounding (re-read the code before each phase, mechanically)

This is the silent-rot failure-class operating one level up, in the PLANNING layer. Every phase of a multi-phase program changes code that a later phase's plan was written against; relying on the agent to re-read the code before each phase is exactly the judgment-time honor-system discipline that this whole effort proved fails (it is why the rollup-insufficiency and the nightly-cadence incoherence slipped — caught only by happening to read the code, not because anything forced it). The class fix is to make the re-read mechanical: a single governing program artifact (`docs/program/GOVERNING-PROGRAM.md`) holds the decided phases, their dependency order, and per-phase the concrete code-dependencies (anchors) each plan rests on; a consistency check (C5, invariant RG-1) re-grounds the ACTIVE phase against the real code and fails the build when an anchor a prior phase invalidated no longer matches, naming the drift. The next phase does not execute on a stale plan. Keep it small — one artifact plus one forced re-ground step, not a planning bureaucracy; if it grows into ceremony it becomes the next bug-surface. The test is only "does it force re-reading the real code before a phase, and flag plan-vs-code drift." Pairs with the class-over-instance principle (this is its plan-layer instance — make the recurring failure impossible) and with edit-the-source-not-the-output (the governing artifact is the source the plan compiles from).

### Section 2.1: Quarantine Is an Open Investigation (research-or-erase)

**Binding statement (verbatim):**

> Quarantine is an open investigation, never a terminal state. An item that fails grounding is ENQUEUED for research-or-erase, not parked: research to find the real source and re-ground (RECOVER); if it is valuable but thin-sourced, actively source the real instrument's authoritative material and re-ground; if it is not valuable or genuinely ungroundable, honestly archive or register-as-source. No item may sit in quarantine without a recorded disposition; a quarantined item past the dwell bound with no recorded disposition fails a check.

Why this is a class fix, not an instance one: "research-or-erase" existed as documented design (audit #1) but the failure side was never wired — ground-failure left the item quarantined and nothing re-investigated it, so the quarantine set grew as a silent backlog. That is the documented-not-active failure this skill exists to kill, turned on itself. The mechanical form is the wiring that makes it un-skippable: entering quarantine enqueues an investigation record (the provenance trigger's integrity flag), and a live-data invariant fails when any item sits past the dwell bound or is quarantined without an enqueue record. Understanding the principle is not the fix — the active enqueue plus the invariant is. The disposition vocabulary is recovered / archived / registered / erased; each removes the item from the live-quarantined set, so "still quarantined past the bound" is exactly "no disposition recorded." Before any archive/erase the item must be researched first (investigate-before-discard, Section 2 / RD-1); title-level screening is not investigation. Enforced by `scripts/verify/quarantine-disposition-audit.mjs` (live-data invariant) + the invariant registry; the resolver is `scripts/regen-quarantined.mjs` (research → re-ground, else honest archive/register).

**Diagnostic before re-scrape (recovery-triage step).** A zero-claims item is not necessarily a zero-pool item: an earlier generate may have persisted its fetched source pool (`agent_run_searches`, the >200ch `generate-pool` rows) even when grounding never produced a claim ledger. Check for a stored pool before assuming the RECOVER step needs a fresh scrape — when one exists, recovery is Sonnet-only re-grounding (`groundBrief` reuses the pool, zero Browserless), far cheaper than re-fetching, and resumable per `[[persist-fetched-content]]` Edits A+B. (E2, 2026-06: 56 of 57 keep-ground items had stored pools; recovery was ~1 Sonnet call each, not a re-scrape — an early "all zero-ledger, network-gated" read was wrong precisely because it conflated zero-claims with zero-pool.) The sibling case — when the roadblock is the source FETCH itself, not a missing pool — is handled by the roadblock → bounded alternative-search capability (Section 4 category 8): seek a replacement before concluding the source is gone.

### Section 2.2: Deferred vs Undispositioned (a deferral is dispositioning-as-blocked, never silencing)

A past-bound quarantined item (>14d, not archived) splits into two populations, and the distinction is load-bearing: it separates a NEW un-dispositioned SLA crossing (the live alarm) from the growing standing backlog of items that are genuinely blocked. A single past-bound count cannot tell them apart, so the gauge MUST split it.

- **Undispositioned past-bound** — the item has reached no disposition AND carries no valid deferral. This is the HARD tripwire; the audit fails the lane on any undispositioned item.
- **Deferred past-bound** — the item carries a VALID time-bounded deferral. It is reported as standing backlog but does NOT fail the lane.

A deferral is dispositioning-as-BLOCKED, never silencing. It is valid ONLY when it records the positive finding that produced it: a `reason` that names the specific blocking condition AND the disposition path the item awaits, a named future `resolution_event`, a future `deferred_until`, and a real `owner`. A vague "needs review, owner TBD, until later" deferral is forbidden — that is the silent-backlog shape this invariant exists to kill, and it MUST be rejected. The write-time guard `scripts/lib/deferral.mjs` (`isValidDeferral` / `assertValidDeferral`) enforces this mechanically; the audit applies the same check on the read side.

Expired deferrals do NOT count: when `deferred_until` passes, the item re-opens as undispositioned (anti-silence self-resurrection — a deferral cannot quietly outlive its own clock). Enforced by `scripts/verify/quarantine-disposition-audit.mjs` (the undispositioned count is the live tripwire) + the invariant registry (RD-6).

## Section 3: Recognition Criteria

When a failure surfaces, evaluate five signals:

1. **Recurrence**: has this pattern surfaced before in any form? (Same root cause, different surface; same failure mode, different consumer.)
2. **Infrastructure-variation cause**: is the root cause something the platform should absorb (timeout, disconnect, rate limit, version drift, tool snapshot inconsistency)?
3. **Shared codepath**: do multiple places use the same broken pattern?
4. **Reinventing-the-wheel signal**: would another agent solving a similar problem rebuild the same patch?
5. **Preservation-argument-against-dispatch**: did an agent OR an operator propose "the existing design already handles this" against an explicit dispatch instruction or explicit caution? When this argument lands, the rationale typically survives only as a docstring or completion-report note — mechanical systems do not detect violations. The architectural decision is implicit, not enforced.

**Threshold rule:**

- 2+ signals fire → treat as class
- 0 signals fire → treat as instance
- 1 signal fires → judgment call surfaced to operator at remediation scoping

The threshold deliberately favors class-treatment when in doubt. Over-codification of one-off failures is cheaper to correct (anti-pattern 3 surfaces it; the rule retracts) than missed-class-treatment of recurring failures (every new instance costs the same patch effort).

**Signal 5 treatment (preservation-argument).** Class fix is to encode the preservation argument as a fitness function or equivalent mechanical check at the same dispatch that surfaced it. Per OBS-62 worked example (Sprint Architecture, 2026-05-20): Phase 1.5 closure proposed preserving the server-centric dual-write design via documentation comments; the rationale was sound, but absent F8 fitness function, future client code could violate the design silently. Same dispatch added F8 + fixed the 2 instances + codified Signal 5 itself. Treatment shape:

1. Recognize the preservation argument when proposing OR receiving it (either agent → operator OR operator → agent direction).
2. Ask: can this argument be mechanically expressed? If yes, encode it as a fitness function (or equivalent). If no, either re-examine whether the argument is actually sound, OR explicitly accept the gap with an OBS entry tracking the residual risk.
3. Land the mechanical check in the SAME dispatch that proposes the preservation argument. Splitting risks the encoding never happening.

The pattern applies symmetrically: agent making a preservation argument against operator dispatch (Phase 1.5 dual-write case), and operator making a preservation argument against agent caution (the REPO_ROOT "no risk" case earlier the same day where operator's confident dismissal of investigation triggered the same pattern, different domain). Both produce documentation-survives-but-no-mechanism gaps. Signal 5 covers both.

## Section 3.5: Investigation discipline (before and during a remediation)

Four principles govern HOW a remediation investigates, learned the hard way on the F1 tier work:

- **Probe-first blast radius.** Before any corpus-affecting write, run a READ-ONLY probe that quantifies the blast radius (how many rows, which items, both directions). Author the fix against the probe's numbers, never against an assumption. The F1 work ran the fake-cert probe, the per-item crosstab, the composition probe — each before a single write — and each overturned the prior estimate (32→30 flips; "all null hosts secondary" killed the registration lever).
- **Stop-and-surface on unstable inputs.** If investigation reveals the inputs to the planned fix are themselves unsound (the per-URL tier rows that made the flip count unstable; the untracked enforcement file), STOP, surface the divergence as findings, and let the operator decide scope — do NOT plow the original plan over contradicting evidence. Stopping is the discipline working, not a failure.
- **Flag-rate is not defect-rate.** A surge of integrity/quarantine flags (the 30 flips, the 220 open data_quality rows) measures the gate DOING ITS JOB, not the platform breaking. Read a flag spike as detection, then triage; never silence the gate to lower the number.
- **Clear-flags-when-satisfied.** A flag/condition that has been satisfied MUST be closed when it is satisfied — a flag that rides handoffs after its cause is gone (the rotation flag that lived for weeks; stale quarantine flags on re-verified items) breeds alarm fatigue and hides the live ones. Closing is part of the fix, not optional cleanup.

## Section 4: Remediation Strategy by Category

Eight confirmed categories with full worked examples in Section 7:

1. **Batch resilience** — long-running scripts need retry/reconnect/idempotency/rate-limit/progress primitives extracted into a shared library
2. **Sweep methodology** — sweeps must enumerate the surface (Glob, schema query, equivalent) before claiming completeness; recall-based or pattern-matched enumeration misses items silently
3. **Type-system drift** — schema-vs-code compatibility breaks require compatibility shim + per-consumer migration, not flag-day rename
4. **API contract gaps** — silent failures from format/version mismatches (URL canonicalization, timestamp normalization, identifier matching across system boundaries) need primitive extraction
5. **Tool reliability** — agent-layer tools (Glob, etc.) sometimes return inconsistent results across contexts; defensive discipline + root-cause investigation when bandwidth allows
6. **Architectural codification** — when a model exists as transcript or operator memory but not as canonical reference, encoding it as a skill is the class fix; prevents future drift and reinvention
7. **Worktree cleanup discipline** — worktree removal is multi-step (git worktree remove + filesystem rm + config registry sweep); audit dispatches that read config without filesystem validation produce false positives
8. **Roadblock resilience (source fetch)** — *roadblock → bounded alternative-search → same-floor qualification.* When a declared primary source roadblocks (timeout, JS/Cloudflare stub `<200ch`, 403/404, wrong-language-only), the pipeline must SEEK a replacement, not give up — the mechanical form of env-policy's "find replacements when canonical sources break" (Operating Principle). The non-negotiable invariant: alternative-search widens which sources you TRY, never which tier QUALIFIES — a found alternative passes the SAME `buildResolver` tier resolution + the SAME per-type authority floor, so a sub-floor alternative is a corroborator/relabel input at best, NEVER a primary (the item still honest-exits/counsel-holds). This structurally forecloses the F1 regression (primary times out → search returns a law-firm explainer → secondary grounds a reg fact): promotion is emergent from clearing the unchanged floor, never a fallback action. Bounds: ~20s/fetch, ≤3 alternatives, no retry on a roadblocked URL (retrying a dead URL is the 120s×5 waste that burned 10 min on commerce.gov.in). The roadblocked-vs-partial line is load-bearing — a real-but-partial page (`≥200ch` in-language) is an HONEST PARTIAL (use it; missing facts → counsel), not a roadblock; a false-roadblock that swaps a valid primary for a search hit is a provenance downgrade, worse than a thin real primary, so ambiguous → "primary succeeded." The counsel-hold record splits `NO_SOURCE_FOUND` (searched, nothing fetchable) vs `NO_SOURCE_QUALIFIED` (found N, all sub-floor) and records `alternatives_tried` + `best_resolved_tier` as a durable integrity_flag, so a counsel-hold provably means "searched + exhausted," not "never looked." This is the build-out of the Section 2.1 recovery-triage diagnostic (check for a stored pool / seek a replacement before concluding). Implementation: `src/lib/sources/primary-fallback.mjs` (`detectRoadblock` pure + CI-unit-tested; `fetchPrimaryWithFallback` dep-injected), wired via `canonical-pipeline.fetchPrimaryDeep` into both `generateBrief` and `phase2-reground`.

9. **Producer-consumer orphan (the half-slice defect)** — a writer with no reader (a table/column the app writes but nothing consumes — dead output) or a reader with no writer (a surface consuming a never-written field — dead input) is the HALF-SLICE defect class: a feature built on one side of the producer-consumer boundary and never closed on the other. Every prior audit found these BY HAND (`source_trust_events` written many ways read zero, the notification layer's write-only tables, the mig-007 forum layer); that hand-check is now a standing mechanical gate. The rule: a table the application writes MUST have a consumer, OR be allowlisted as a legitimate terminal sink (an append-only audit trail, or a writer that precedes the reader a named later phase builds) WITH a stated reason and a review-by-phase tag — never silently excluded, and the allowlist is itself audited (a stale entry whose table is gone or is no longer an orphan is reported). The detector is deliberately CONSERVATIVE — it gates only on high-confidence zero-reader-anywhere write-orphans (a reference in any SQL `FROM`/`JOIN`/`REFERENCES` counts as a reader, so the gate never cries wolf and never gets muted); reader-side never-written-field findings are REPORTED for phase scoping, not gated. The first-run report feeds Phase 7's zero-reader verification and does not itself authorize deletion. Implementation: `.discipline/governance/producer-consumer-orphan.mjs` (pure core + git-tracked scan + first-run report), wired as fitness function F14, invariant RD-9.

10. **The transport hold gate (fetch-primitive scrape-hold gate)** — a "scrape hold" enforced only by DELETING the credential (BROWSERLESS_API_KEY) fails SILENTLY and ambiguously: a held fetch throws "key not configured" — indistinguishable from a genuine misconfiguration — and nothing observes that the hold blocked a fetch. The class fix makes the hold a FIRST-CLASS, MECHANICAL, OBSERVABLE gate at the SINGLE canonical fetch primitive: `assertFetchAllowed(url)` throws a named `FetchHoldError` while the hold is engaged (`SCRAPE_HOLD`), so "scrape hold LIVE, zero fetches" is enforced in code, not by credential-absence. Because the fetch is single-homed (`canonical-fetch.mjs::browserlessFetch`, the "one implementation so ~10 sites cannot diverge" primitive), gating IT gates every call site at once; a raw Browserless content fetch anywhere else BYPASSES the gate and is forbidden. The hold DEFAULTS to LIFTED (an explicit operator control — engaged with `SCRAPE_HOLD∈{1,on,true,engaged}`) so wiring the gate does not silently break prod fetching; the operator LIFTS the hold (`SCRAPE_HOLD=off`) only when the scrape cadence is set, which is what unblocks seek-more and new site content. Paired with the hold: a canonical-URL pre-fetch cache (the `url-canon` single home keys the cache so equivalent URLs share one entry, with a per-source TTL) and per-run fetch telemetry (hit/miss/hold-blocked/bytes), so resumed fetching is observable and does not re-fetch what it just fetched. Implementation: `src/lib/sources/fetch-hold.mjs` (pure core, red-then-green) wired at `canonical-fetch.mjs::browserlessFetch`; fitness function F16, invariant RD-11.

## Section 4.5: Categories Where Principle Applies (Worked Examples Pending)

The principle is platform-engineering-agnostic. These categories don't have full worked examples in this session's corpus yet, but the class-over-instance lens applies identically. Promotion to a full category in Section 4 happens when a concrete instance surfaces and gets remediated. Tracking them here ensures the skill's scope is unambiguous and future failures get class-treatment from the start.

- **Cache inconsistency** — cache-and-store drift, invalidation patterns, stale read failures across services
- **Migration coordination** — schema changes vs deployed code, deployment-order dependencies, rollback strategy
- **Permission gaps** — access control sweep methodology beyond just admin gating
- **Observability gaps** — logging coverage, tracing, alerting infrastructure as platform primitive vs per-service
- **Error reporting gaps** — user-facing error handling patterns, error-state recovery
- **Configuration drift** — env-specific config management, secret rotation, credential hygiene
- **Background job orchestration** — cron, workers, queues; the underlying coordination patterns
- **Inter-service contracts** — API versioning, event schema management, deprecation patterns
- **State machine consistency** — multi-step workflows, idempotency at every step, recovery paths
- **Connection lifecycle management** — beyond pg pools: HTTP clients, websockets, third-party SDK connections

Plus two patterns emerging in this session's corpus that need root-cause investigation before promotion to full worked example:

- **Agent-permission environment**: sub-agents hitting Edit/Write/Bash permission denials on worktree paths. Main-session takeover is the consistent remediation. Surfaced 4+ times this session (Track B-doc v1, Skill encoding, remediation-discipline dispatch itself, and at least one other). Pattern hypothesis: worktree-specific permission scope in sub-agent context, OR tool-specific denial semantics. Needs systematic investigation to extract a primitive remediation (or to fix the underlying permission scope).
- **Worktree filesystem inconsistency**: sub-agents finding files differently than main session or other sub-agents at the SAME SHA. Surfaced 4+ times (Q1, Q3, Q6, Q10 reports each mention variant of "docs/sprint-1/followups.md not visible in my worktree"). Pattern hypothesis: filesystem snapshot or cache inconsistency in tool layer. Defensive discipline applied case-by-case (try direct Read when Glob returns nothing for an expected path); root cause not yet investigated.

Both emerging patterns need systematic investigation before promotion. They are tracked here so future agents apply defensive discipline and surface new instances toward eventual root-cause-investigation dispatch.

## Section 4.6: Retrieval before generation (check existing work/data before re-deriving)

Reuse-before-construction (the platform doctrine) is scoped to CODE. This is its WORK-PRODUCT / DATA sibling, the same class fix one level out: **before any generation, discovery, or re-derivation step, the first action MUST be a retrieval check — does this output already exist?** Check the obvious stores (another column on the row, the item's own `agent_run_searches` pool, `provisional_sources`, the `sources` registry) AND prior-session work; use what is found; generate only the genuine residual. Treat "the prior pass produced this" as a retrieval problem first, a regeneration problem only if retrieval comes up empty. It binds hardest before any batch that SPENDS.

**Why it earned a rule.** It slipped twice in one session (2026-06-23): a backward re-point / re-discovery was proposed for the reg corpus when the enacted-text URLs were ALREADY discovered by the prior deep-dive generate and stored as corroborators in each item's `agent_run_searches` pool — one decision from spending to re-discover URLs already in our own database; and the enacted twins were not checked until a later pass surfaced them. The principle existed but was scoped wrong: reuse-before-construction covered code, verification-before-authorization's read-only-first was framed for dispatch WRITES, diagnose-before-fixing is general spirit — none said "the answer may already exist; check before (re)generating." With no mechanical gate it slipped under execute-the-plan momentum. The class fix is to state it as its own discipline (here) + register it as invariant RD-8 + carry it in CLAUDE.md's Reuse-before-construction doctrine (extended to work-products/data, 2026-06-23).

**Recognition signals fired.** Signal 1 (recurrence: re-point + dedup-twins, two slips one session); signal 4 (reinventing-the-wheel: any future discovery/generation step would re-derive an output already persisted). Class confirmed; the fix is doctrine + invariant, not a primitive — the "retrieval check" is judgment exercised at planning time, not a single extractable function, hence RD-8 is exempt like RD-2/RD-3. The backward promote-from-pool operation is the worked example: re-point = promote the already-stored enacted URL, not re-discover.

### The spend chokepoint (generation-side dedup-before-ground) — the mechanized sibling of RD-8

RD-8 is the judgment-time retrieval check; this is its MECHANICAL enforcement one level out, at the point of SPEND. It earned a rule the same way RD-8 did — necessity was never mechanized and generation spend had no chokepoint, so every new runner started ungated (third instance in one program: a perf-wave quote, a GLEC-duplicate ground, and the proof-batch routing that produced a void $53 full-set quote — each caught only because the operator asked "did you check the free lever first?"). That question being the detection mechanism IS the defect (the autonomy principle: the platform must not need a human to ask). The class fix is a single spend client every model call routes through: it **MUST** require a SpendTicket (a ticketless call throws), it **MUST** reject a per-item ticket whose failure set is fully deterministically-resolvable (the deterministic-lever necessity gate — do the $0 thing first) OR whose standing disposition is DELETE (a held dup-loser is never paid to regenerate), and it **MUST** enforce the budget ceiling in code (the ceiling stops being relay discipline). No Anthropic API call may exist outside the spend client and its sanctioned transport, beyond a reason-bearing, review-by-phase-tagged SHRINKING allowlist that is itself audited (a stale entry is RED). Enforced by fitness F15 (grep-class, red-then-green) + the spend-guard selftest + invariant RD-10; this is the generation-side analog of the intake dedup-before-ground gate.

## Section 5: Primitive Extraction Patterns

When primitive extraction is justified:

- Recurrence threshold: 2+ confirmed instances of the same broken pattern
- Reinventing-the-wheel signal: another agent solving a similar problem would rebuild the same logic
- Bounded surface: the primitive's scope is well-defined (single concern, single responsibility)

Naming conventions:

- Verb-noun for actions (`createPgPool`, `canonicalizeUrl`)
- `with-` prefix for wrappers around async functions (`withRetry`, `withRateLimit`, `withIdempotency`)
- Helper predicates named `is<Property>` (`isAnthropicRetryable`, `isPgRetryable`)

Migration pattern:

1. Extract the primitive into the library; write header docs and unit tests for caller-impact semantics
2. Refactor the first instance to consume the primitive; verify behavior parity with smoke test
3. Refactor known adjacent instances in the SAME dispatch; ship as a bundle so the library is validated against multiple consumers
4. Codify the discipline (Section 6 thresholds) so future occurrences default to library consumption

Testing:

- Primitive: unit tests on caller-impact semantics (e.g., retry predicate logic, rate-limit interval enforcement). The cost of getting a primitive's semantics wrong is silent over-retry / under-retry / over-permissive / under-permissive at every consumer.
- Consumer: integration smoke test (e.g., `--dry-run --limit N` against live state) confirms the refactor preserves behavior.

Reference implementation: `fsi-app/scripts/lib/batch-primitives.mjs` (added 2026-05-20 as the concrete class fix for batch resilience; see Section 7 worked example 1).

## Section 5.6: Status is a cache (gate/slot migrations ship revalidation)

A derived status column (e.g. `provenance_status`) is a CACHE of a gate result, recomputed by a trigger only when the underlying row is written. So **status is a cache** that goes stale the moment you change the GATE (`validate_item_provenance`) or its inputs (`item_type_required_slots`, the tier model) without re-writing the rows: stored `verified` can silently outlive a gate that now says `quarantined` (fabricated certification left on a customer surface), or a recoverable item can sit `quarantined` after the gate would now pass it. **Standing rule:** any migration that changes a gate or a slot/tier input MUST ship a corpus revalidation in the SAME change, and stored status MUST agree with the live gate in both directions. The substrate-agreement audit (EP-8/RD-5) is the standing truth-teller; "ship the revalidation with the migration" is the prevention.

## Section 6: Discipline Codification Thresholds

When a recurring pattern earns a binding rule:

- 2+ worked examples documenting the pattern + the class fix
- Operator authorization for the rule's exact phrasing
- Rule lands in `fsi-app/.claude/skills/sprint-followups-discipline/SKILL.md` as a named binding rule (Option A pattern, consistent with source-credibility-model load-trigger rule and Sweep-discipline rule precedents)

Skill content (in Section 7 of this skill or in the relevant domain skill) can document patterns BEFORE they have rules. Rules require operator-confirmed promotion. The skill is the example library; the rule is the binding enforcement.

Where the rule lands:

- Cross-cutting discipline rules (load-trigger for a domain skill; methodology rule like Sweep-discipline): sprint-followups-discipline as a new named binding rule
- Domain-specific scoring/computation rules: the domain skill's relevant section
- Schema or migration discipline: sprint-followups-discipline (since dispatch reports need to apply it)

Anti-pattern: codification before sufficient examples (one occurrence is not a pattern; making a rule with one recurrence creates an unfilled obligation that may not generalize).

## Section 7: Worked Examples

Each example follows the template: What failed → Class problem → Class fix → Recognition signals fired.

### Example 1: Batch resilience — Q4 sources 21/22

**What failed.** The Q4 bias-classification batch script (`fsi-app/scripts/q4-bias-batch-assign.mjs`) ran 20 sources cleanly in its sample validation, then failed at sources 21+22 of the 776-source full batch with two distinct errors: Anthropic API request timed out at source 21 (Yukon Department of Environment); pg client emitted `Connection terminated unexpectedly` at source 22 (International Transport Forum), crashing the script unrecoverably. Sample validation (20 sources) didn't trigger either failure mode reliably because: Anthropic API timeouts are intermittent network events with low per-call probability; Supabase pooler disconnects idle connections after a window that 20 fast calls don't expose.

**Class problem.** Long-running batch scripts lack durable resilience primitives. Every batch reinvents retry/reconnect/rate-limit/idempotency from scratch. Q4 was the first instance to fail visibly; Q7 daily recompute would have hit the same pg-disconnect failure mode at first production run; every future LLM batch (classifier re-runs, brief regeneration) would re-discover Anthropic timeouts the same way.

**Class fix.** Extracted `fsi-app/scripts/lib/batch-primitives.mjs` with `withRetry`, `withRateLimit`, `withIdempotency`, `createPgPool`, `createProgressReporter` primitives. Refactored Q4 batch script + Q7 daily batch script to consume the library. Codified Batch-script resilience rule as 7th named binding rule in sprint-followups-discipline. Extended OBS-51 with Resolution section pointing at the library + rule + refactors.

**Recognition signals fired.** Signal 2 (infrastructure-variation: Anthropic timeout + pg disconnect are platform realities); signal 4 (reinventing-the-wheel: every future batch would rebuild). Class confirmed.

### Example 2: Sweep methodology — Build 6 admin gating

**What failed.** The Build 6 admin-gating sweep (commit 6d18773) enumerated remembered admin routes and verified each calls `isPlatformAdmin`. The sweep missed 13 routes because the dispatcher relied on recall rather than `Glob src/app/api/admin/**/*.ts`. A 2026-05-19 code-level positive-test audit (dispatched after seeding `jasonlosh@hotmail.com` with `is_platform_admin=true`) found the 13 Build-6-missed routes but ALSO missed 4 additional ungated routes under the `sources/[id]/` subtree AND miscalled 2 worker-secret cron routes as `requireAuth`-only based on directory location. Track B-code re-enumeration (commit 4c7b546) applied enumerate-first discipline (Glob the surface + grep each enumerated route) and produced a correct 15-route fix scope.

**Class problem.** Sweep dispatches that enumerate from memory or pattern-match miss items; the failure mode is invisible until a later sweep catches the gap. Pattern applies to any sweep on any surface family (route, column, constraint, file pattern).

**Class fix.** Sweep-discipline rule (4th named binding rule in sprint-followups-discipline, commit ae8734c) mandates Glob-first or schema-query-first enumeration + criterion check per enumerated item + explicit discrepancy surfacing in the dispatch report.

**Recognition signals fired.** Signal 1 (recurrence: Build 6 + 2026-05-19 audit + Track B-code, three sweeps three failure-modes); signal 4 (reinventing: any future sweep on any surface family would reinvent). Class confirmed.

### Example 3: Type-system drift — Q2 schema-vs-code break

**What failed.** Q2 migration 090 renamed `sources.tier` to `sources.base_tier` and added `sources.effective_tier`. Deployed master code (at commit 537ad38 and earlier) still read `sources.tier`. Production reads broke immediately at the PostgREST column-resolution layer. Sample validation insufficient because the codebase uses stringly-typed Supabase clients (no generated `Database` types); typecheck didn't catch the breakage at compile time, only at request time in production.

**Class problem.** Schema migrations that rename or restructure columns break deployed consumers silently when the type system doesn't surface the drift at compile time. Pattern recurs anywhere schema and code drift independently.

**Class fix.** Compatibility-shim pattern: migration 094 added `sources.tier` back as a regular column synced to `base_tier` via BEFORE INSERT OR UPDATE trigger plus CHECK constraint enforcing the lockstep. Phase 1.5 consumer migration switches each call site explicitly to `base_tier` or `effective_tier` per operator-decided default rule (customer-facing → effective; admin/system-internal → base). Shim drops via cleanup migration once Phase 1.5 verification confirms all consumers migrated.

**Recognition signals fired.** Signal 3 (shared codepath: ~50 consumer sites across ~25 files); signal 4 (reinventing: every future schema rename would face same drift). Class confirmed.

### Example 4: API contract gaps — Q10 URL canonicalization

**What failed.** Source registry lookups did exact-string URL matches across 10 resolution sites in `src/lib/sources/` and `src/app/api/admin/canonical-sources/`. Citations with trailing-slash/www/query-param drift silently failed to resolve to the registered source, instead creating duplicates in `provisional_sources`. The pattern was invisible until a deliberate duplicate scan surfaced 9 duplicate sets in `sources` + 29 cross-table collisions between `sources` and `provisional_sources`.

**Class problem.** Identifier comparisons across system boundaries need canonicalization. Same class includes timestamp normalization, jurisdiction code matching, any normalize-before-compare pattern.

**Class fix.** Extracted `canonicalizeUrl` helper at `fsi-app/src/lib/sources/url-canonicalize.ts`. Applied at all 10 enumerated resolution sites. Migration 087 backfilled existing URLs (`sources.url`, `provisional_sources.url`, AND `intelligence_items.source_url` denormalized cache; the cache was a Suspect in the Sources-schema-touch precondition audit and surfaced for resolution rather than silently broken). Q10 duplicate-merge dispatch deferred per operator (bounded operator-merge work).

**Recognition signals fired.** Signal 3 (shared codepath: 10 resolution sites with same broken pattern); signal 4 (reinventing: future source-resolution code without the helper would rebuild). Class confirmed.

### Example 5: Tool reliability — Glob filesystem snapshot inconsistency

**What failed.** Glob tool calls in different sub-agent contexts at the SAME git SHA returned different results for the same path pattern. Specifically `docs/sprint-1/followups.md` was visible in some worktree contexts and not in others. Surfaced 4+ times across Q1, Q3, Q6, Q10 sub-agent reports each mentioning a variant of "docs/sprint-1/followups.md not visible in my worktree."

**Class problem.** Agent-layer tooling occasionally returns inconsistent filesystem state across contexts. Pattern is platform-tool-layer; root cause not yet investigated. Hypothesis space: stale filesystem snapshot in tool implementation; per-worktree visibility variance; permission-scope inheritance from main session.

**Class fix (partial).** Defensive discipline encoded in dispatch briefs: "if Glob returns 'No files found' for a path you expect to exist, try direct Read of the expected path AND a Bash ls as backstop before concluding absence." No primitive extracted yet because root cause unknown. Tracked as emerging pattern (Section 4.5) pending systematic investigation. Promotion to full primitive-extraction class fix happens when root cause is understood.

**Recognition signals fired.** Signal 1 (recurrence: 4+ instances); signal 2 (infrastructure-variation: tool layer). Class confirmed; class FIX is partial.

### Example 6: Architectural codification — source-credibility-model encoding as proactive class fix

**What failed.** Not a failure in the usual sense. The six-element source credibility model existed only as a long architectural conversation transcript (2026-05-19 conversation that closed 10 questions Q1-Q10). Without canonical encoding, future dispatches would reference the model from operator memory or by re-reading transcripts, with inevitable drift as the model evolved. Build 8 (Research) would re-derive the Q9 Research signal set from scratch; effective_tier consumers would re-derive the COALESCE formula; bias vocabulary would drift across classifier prompt updates.

**Class problem.** Architectural decisions that live only in transcript become unreferenceable; future work reinvents or drifts. Pattern applies to any architectural decision: data models, design principles, vocabularies, signal sets, formulas.

**Class fix.** Encode as canonical skill: `fsi-app/.claude/skills/source-credibility-model/SKILL.md` (commit 6065dea) with the full six-element model, verbatim Q4 bias vocabulary, verbatim Q7 thresholds, verbatim Q9 signal-set table, cross-references to env-policy hierarchy + platform-intent + design-principles + the decisions doc. Plus Source-credibility-model load-trigger rule as 5th named binding rule in sprint-followups-discipline (Option A pattern) so future dispatches load the skill at the right moments.

**Recognition signals fired.** Signal 4 (reinventing: every future build touching credibility surfaces would re-derive the model from transcript). Class confirmed.

**Note.** This is a PROACTIVE class fix, not failure-driven. The class-over-instance principle applies to architectural codification too, not just bug-driven remediation. Same lens: would future work reinvent? Yes → codify.

### Example 7: Bypassing-existing-infrastructure — worktree cleanup

**What failed.** Operator audit (2026-05-20) surfaced 22+ stale git worktrees at `C:/Users/jason/dotfiles-wt-*` from merged-branch dispatches in this session and prior. Worktrees accumulated because the sibling-to-repo-root path convention this session adopted did not match the paths that `superpowers:finishing-a-development-branch` (FaDB) recognizes as eligible for automatic cleanup. FaDB only auto-cleans worktrees under `.worktrees/`, `worktrees/`, or `~/.config/superpowers/worktrees/`; sibling paths are treated as host-managed; FaDB refuses to remove them. Cleanup never ran.

**Class problem.** Not "we lack cleanup logic" — FaDB owns cleanup discipline. The actual class problem was "we built worktree creation in a way that hid our worktrees from the skill that would have cleaned them up." This is a non-obvious form of anti-pattern 5 (reinventing primitives): we weren't writing new cleanup code, we were creating a parallel convention that bypassed an existing primitive.

**Class fix.** Two-part conformance:
- Going-forward: new worktrees go under `C:/Users/jason/dotfiles/.worktrees/wt-<name>` per FaDB recognized paths. FaDB Step 6 auto-cleanup applies on dispatch completion. Convention note added to sprint-followups-discipline.
- Instance cleanup: `fsi-app/scripts/cleanup-merged-worktrees.mjs` enumerates worktrees, verifies merge state + cleanliness + push state, removes worktree + deletes branch in --execute mode. Auto-excludes protect-list. Dry-run default. Bulk-cleaned 15 session-merged worktrees at commit 261a751.

**Recognition signals fired.** Signal 1 (recurrence — 22+ instances), Signal 3 (shared codepath — every dispatch creates worktree the same way), Signal 4 (reinventing — built parallel cleanup convention to address what FaDB already solved). 3 of 4 → class confirmed.

**Meta-lesson worth surfacing.** Before building new primitives, invoke existing skills to verify nothing already owns the discipline. The using-superpowers skill mandates this; we missed it because the worktree workflow felt project-internal. The 22 stale worktrees were the compound interest on that improvisation. Adding to anti-pattern 5: "reinventing" includes inventing PARALLEL CONVENTIONS that bypass existing primitives, not just inventing new code.

**Sub-issue (OBS-53, second-order class problem).** The cleanup script's fallback path was not junction-aware. When `git worktree remove --force` failed on a specific worktree (Windows path edge case), the operator fallback `rm -rf` followed an internal `node_modules` junction back to the main repo and destroyed `C:/Users/jason/dotfiles/fsi-app/node_modules`. Required `npm install` to restore. Resolution: cleanup script extended with junction-aware fallback that removes junctions explicitly (via `rmdir` not `rm -rf`) before recursive removal. Documented in this same dispatch.

**Sub-issue (OBS-54 sub-finding, third-order class problem).** The 3-axis skill audit (commit `383974e`, 2026-05-20) reported drift across 3 worktrees; sync sub-dispatches found only 1 actually existed on disk. The other 2 paths were stale `additionalDirectories` entries in `~/.claude/settings.json` left from earlier worktree creations and never cleaned at worktree-removal time. A wider sweep found 6 total stale entries spanning 4 missing paths (`dotfiles-migration-026`, `dotfiles-hotfix-surfaces`, `dotfiles-wt-track-b-doc`, `dotfiles-wt-skill-credibility`).

**Resolution: 3-step worktree-cleanup-after-merge discipline (codified in this same dispatch).** Worktree cleanup is multi-step:

1. `git worktree remove <path>` (or `--force` if needed). Detaches the worktree from git's bookkeeping.
2. `rm -rf <worktree-path>` IF the directory persists after step 1. Use junction-aware fallback per OBS-53.
3. Remove every `additionalDirectories` entry in `~/.claude/settings.json` (and any similar config registry, including permission `allow` rules pointing into the worktree path) that references the removed worktree's path.

`finishing-a-development-branch` Step 6 handles step 1 automatically for worktrees under the recognized paths convention. Steps 2 and 3 still require explicit discipline; the convention does not subsume them. Extending `fsi-app/scripts/cleanup-merged-worktrees.mjs` to also perform step 3 (config-registry sweep) is a primitive-extraction candidate; bundle with the next worktree-cleanup-script touch.

**Binding lesson for audit dispatches.** Drift detection that relies on path registration (settings.json, config files, skill registries) without filesystem validation produces false positives. Audit dispatches that scan registered paths MUST validate filesystem presence (`test -d` or equivalent) before treating an entry as a drift instance to remediate. The 3-axis audit's AXIS 2 (load discipline + drift) is the worked instance: it reported 3 drifting worktrees from registered paths; only 1 was real. Going-forward audit-dispatch briefs include filesystem-validation as a pre-flight step.

## Section 8: Anti-Patterns

Six anti-patterns that mean the principle is loaded but not applied:

1. **Instance patches that should have been class fixes.** The Q4 original framing ("just patch the script") before operator redirected to library extraction. Symptom: the patch fits the specific failure but doesn't address the class. The same patch is about to be made again on the next batch script when it fails the same way.

2. **Over-application.** Treating genuinely one-off issues as class problems when 0 signals fire. Creates over-engineering. Data anomalies, one-time migration artifacts, account-specific config edge cases, time-bounded issues do not warrant primitive extraction or rule codification. Use Section 9 boundaries.

3. **Codification before sufficient examples.** Making a rule with one recurrence; insufficient grounding. The rule may not generalize beyond the one case; future dispatches inherit an obligation that doesn't match their reality. Wait for the 2nd confirmed instance.

4. **Skill scope creep.** Adding categories to this skill beyond what worked examples justify. The skill's worked-example library grows with evidence, not speculation. Section 4.5 captures emerging patterns; promotion to Section 4 requires a full worked example demonstrating the class fix.

5. **Reinventing primitives (concrete).** Any time an agent writes retry logic, Pool configuration, progress reporting, or rate limiting inline in a new batch script, that is reinventing. Library reference goes in the dispatch brief at scoping time. If the primitive doesn't exist for the use case, the dispatch first extracts the primitive into the library, then consumes it. Same applies to URL canonicalization (helper exists at `src/lib/sources/url-canonicalize.ts`), compatibility shim patterns (migration 094 shape is the template), and any other primitive in this skill's example library.

6. **Premature primitive extraction (counterpart to anti-pattern 3).** Extracting a primitive into the library before the second instance exists. Same evidence threshold as codification: 2+ confirmed instances before extraction. Speculative primitive design often misses generalization needs because there is only one consumer to validate the abstraction against.

## Section 9: When the Principle Doesn't Apply

Genuinely one-off remediations where class-over-instance does not apply:

- **Data anomalies in specific records.** A single source with bad data, a single user account with corrupted state, a single intelligence_item with malformed source_url. Fix the record, not a class.
- **One-time migration artifacts.** Legacy data from before a convention was established. The class no longer exists going forward.
- **Operator-specific configuration edge cases.** Account-scoped setup that doesn't generalize across the user base.
- **Time-bounded issues that will naturally resolve.** Deprecated upstream API in its sunset window; transient infrastructure events from a known platform incident.

Recognition criteria (Section 3) help draw the line. 0 signals fire → instance. The skill is deliberately not overapplied; not every failure is class-shaped.

## Section 10: Cross-References

- **`sprint-followups-discipline`**: owns the binding rules; remediation-discipline rules land here as named rules (Remediation-discipline load-trigger as 6th named rule; Batch-script resilience rule as 7th). The Sweep-discipline rule (4th named) and Source-credibility-model load-trigger rule (5th named) are remediation-discipline class fixes from earlier in this session.
- **`source-credibility-model`**: domain-specific; remediation-discipline applies to credibility failures the same as anywhere else. Worked example 6 of this skill references the source-credibility-model encoding as a proactive class fix.
- **`caros-ledge-platform-intent`**: platform architecture; doesn't overlap. Value Delivery Check binding on remediation dispatches via this skill's load.
- **`environmental-policy-and-innovation`**: domain content; doesn't overlap. Integrity rule applies to remediation work (no invented worked examples; concrete instances only).
- **`fsi-app/scripts/lib/batch-primitives.mjs`**: the concrete library that implements Section 5's primitive extraction pattern for batch-script resilience. Reference implementation.
- **`docs/sprint-1/followups.md` OBS-51**: captures the Q4 sample-scale-validation discipline note; OBS-51 Resolution section points back at this skill.
