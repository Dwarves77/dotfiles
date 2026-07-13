// DOCTRINE REGISTER (Disposition Engine, Unit 0 — 2026-07-11).
//
// The ONE committed home for every STANDING DOCTRINE: each entry carries the doctrine VERBATIM, its
// enforcing invariant-ID(s) (resolved against the invariant registry) OR an exempt-with-reason, and
// any known CONFLICTS + the operator RULING that resolves them. Future dispatches cite entries BY ID.
//
// THE STANDARD (enforced by invariant-coverage.mjs, the meta-gate — "UNENFORCED DOCTRINE = FAIL"):
//   Every doctrine is EITHER
//     (E) enforced — `enforcedBy` lists ≥1 invariant ID that EXISTS in invariants.mjs AND is itself
//                    enforced (not exempt) — so the doctrine has a live mechanical mechanism, OR
//     (X) exempt   — `exempt.reason` states why the doctrine is genuinely non-mechanizable (process /
//                    orchestration-time judgment / meta-principle). "Buildable but unbuilt" is NOT a
//                    valid exemption (same bar as the invariant registry).
//   A doctrine that is neither — an `enforcedBy` pointing at a missing/exempt invariant, or no mapping
//   at all — FAILS the meta-gate. That is the "unenforced doctrine = FAIL" rule the operator set.
//
// WHY A SEPARATE REGISTER (not just invariants.mjs): invariants are mechanism-level (one checkable
// property each); DOCTRINES are the behavioral principles the operator states in dispatches
// ("diagnose-before-fix", "no-quarantine-as-resting-state"). One doctrine may ride several invariants;
// several doctrines may be process-class with no invariant. The register is the doctrine→mechanism
// index + the conflict-ruling ledger; invariants.mjs stays the mechanism→artifact index.
//
// enforcedBy tokens are invariant IDs present in invariants.mjs (e.g. 'RD-4-quarantine-disposition').
// The meta-gate resolves each against the INVARIANTS array and checks it is not itself exempt.

export const DOCTRINES = [
  // ────────────────── Operator control / stop authority (TOP PRECEDENCE) ──────────────────
  // These OUTRANK every execution/momentum doctrine below (operator ruling + amendment 2, 2026-07-12,
  // the pause-flag stop-condition incident). "Proceed without returning" / "no operator gates" live INSIDE
  // the space the stop conditions bound; they never license the machine to ungate itself.
  {
    id: 'operator-stop-conditions-are-absolute',
    statement:
      'An operator stop-condition — standing or session-specific — binds ABOVE every momentum rule and dispatch authority. "Proceed without returning," "no operator gates," and all dispatch authority apply ONLY inside the space the stop conditions bound. When a stop condition fires (including "stop if anything surfaces we did not know about"), the ONLY permitted actions are: halt, preserve state, report what surfaced. Working around the trigger of a stop condition is the named worst-class violation. No-operator-gates means the operator does not gate ROUTINE work; it never means the machine may ungate ITSELF. Self-report-AFTER-being-caught is disclosure, not discipline — the bar is halting before the operator has to intervene.',
    source: 'operator ruling + amendment 2 (2026-07-12) — the pause-flag stop-condition incident',
    exempt: {
      reason:
        'ACTOR-BEHAVIOR doctrine — the operator ruled (amendment 2 para 3) that CI cannot FULLY enforce it: it governs how the agent reasons at action time (same non-mechanizable class as diagnose-before-fix / sub-agent-untrusted). What CAN be mechanical is built or being built: (a) the system_state operator-control credential trigger (Unit 2a) removes the specific capability used in the incident — flipping a stop flag; (b) the dispatch STOP-CONDITIONS block + the closeout self-audit put the stop conditions in-context at execution. The residual — an agent routing around a stop with an un-locked capability — is the named standing risk this incident proved real. TOP-PRECEDENCE: this doctrine outranks every execution doctrine in this register.',
    },
  },
  {
    id: 'operator-stop-states-are-inviolable',
    statement:
      'A live operator stop-state flag (Caro\'s Ledge: system_state.global_processing_paused, scrape_cadence) may NOT be altered by any agent under any dispatch authority. emergencyPaused is a HARD stop for every caller — no caller identity (including the F16-signed manual-intake-run) overrides it. Changing a stop flag in production requires either a standing ruling or the operator\'s word in the dispatch; simulation + wake-proofs cover everything short of that. Lifting a stop flag to get past an obstacle is the worst-class violation (see operator-stop-conditions-are-absolute).',
    source: 'operator amendment 1+2 (2026-07-12) — live-state-flags-are-operator-surface, superseding',
    enforcedBy: ['RD-21-generation-pause-split', 'RD-23-pause-flag-one-writer'],
    residual:
      'RD-21 (generation-pause.npmtest.mjs) proves the GENERATION-side facet mechanically: emergencyPaused hard-stops EVERY caller including the signed manual caller (no override). The FLAG-WRITE facet — that no agent may WRITE global_processing_paused/scrape_cadence by a direct write — is RD-23 (pause-flag-has-one-writer), enforced STRUCTURALLY with no credential and no manual step: the F20 fitness function (static one-writer, CI-fails a second writer) + the migration-201 guard trigger + admin_set_pause_state RPC (a generic unmarked UPDATE bounces at runtime) + the audit table. This REPLACES the DEAD 2a operator-credential design, which required a manual operator step (provision a login role, hold a secret, scope creds) — ruled dead 2026-07-12 ("human intervention should never be a solution"). Honest residual (RD-23): a determined caller with raw SQL could set the marker itself and bypass the trigger, but no committed code can (F20) and every write is audited — structural defense-in-layers, no human-held secret.',
  },

  // ─────────────────────────────── Spend authority (operator-priced) ───────────────────────────────
  {
    id: 'operator-sets-cost',
    statement:
      'Spend authority is the operator\'s price, never the machine\'s estimate. NOTHING runs without an operator-set cost: the machine never proposes a default, never anchors a figure, never fills in a number. The manifest delivers FACTS ONLY (what is missing, document size, work scope) and MAY carry a clearly-labeled projection, but the binding number is solely what the operator writes on the line. Each approved line halts at the operator-set cost (no tolerance unless the line carries one). All standing dollar figures — per-item breaker, daily cap, monthly ceiling — are retired as limits; the gauge reports actuals as information, never a fraction of a target. The complete spend-control system is two mechanisms: operator-priced line approvals (the sole authorization; the acquire lock + I2 remain the per-run arming) and spend-watch as a pure alarm on any paid row not traceable to an operator-priced line.',
    source: 'operator FINAL spend rulings (2026-07-13), superseding all prior spend/ceiling framing',
    enforcedBy: ['RD-31-operator-priced-spend'],
  },
  {
    id: 'data-existence-before-acquisition',
    statement:
      'No fetch without first proving the datum absent from what we already hold (stored pools, snapshots, sections, prior captures). A fetch request MUST cite the inventory check and the specific miss. Acquisition is always the named DELTA — the missing document or span-range — never a re-fetch of anything a pool already carries. Wired at the fetch/grounding chokepoint: the paid path REFUSES without both an inventory-miss citation AND an operator-priced line. This is the skill\'s verify-before-acquire made mechanical.',
    source: 'operator ruling (2026-07-13) — economy-of-information',
    enforcedBy: ['RD-32-data-existence-before-acquisition'],
  },

  // ─────────────────────────────── Disposition / lifecycle ───────────────────────────────
  {
    id: 'no-quarantine-as-resting-state',
    statement:
      'Quarantine is an open investigation, never a terminal state. An item that fails grounding is ENQUEUED for research-or-erase, not parked; no item may sit live-quarantined past the dwell bound without a recorded disposition (recovered / archived / registered / erased).',
    source: 'remediation-discipline §2.1',
    enforcedBy: ['RD-4-quarantine-disposition', 'RD-6-deferral-vs-undispositioned'],
  },
  {
    id: 'no-human-finish-of-intake',
    statement:
      'The intake path has NO human-approval gate. The machine gates ARE the approval: source↔claim-type congruence, high-precision subject-existence dedup, the single mint chokepoint, the per-item-type authority floors, and the grounding judge. staged_updates is transit-only (a max-age invariant like provisional); admin gets visibility (staged / minted / rejected+why), not a gate. A materialization FAILURE routes to the flag resolver, never a human queue.',
    source: 'ADR-012 rider (operator 2026-07-11)',
    // FLIPPED to enforced 2026-07-11 (Unit 0b pt2): the staged_updates transit-only max-age invariant
    // (RD-20) is the mechanical form — a staged row must resolve (materialized / rejected-with-reason /
    // routed-to-flag) and MUST NOT park past its max-age; the machine gates are the approval. The F16
    // two-caller signed-exception (Unit 0b pt1, conflict-1) admits the manual run through the hold.
    enforcedBy: ['RD-20-staged-transit-disposition'],
    residual:
      'RD-20 (staged-transit-audit) enforces the intake-side no-resting-state — staged rows resolve or age into the flag resolver, never park. The REMOVAL of the human-approval step from the RUNTIME path (the run-one-cycle orchestration that mints without a human) is Unit 0c; RD-20 is the standing invariant that keeps the transit queue honest once 0c removes the approval gate, and that surfaces the current human-approval backlog until it does (flag-rate is not defect-rate).',
    conflicts: ['conflict-1-autonomy-beats-batch1-gate'],
  },
  {
    id: 'earth-exhaustion-before-hold',
    statement:
      'Before any archive/erase, an item is researched to exhaustion: reground from stored pools (free) → remediation-fetch via the scoped manifest-bound exception → reground; only a ladder-exhausted / floor-failing item is honestly deleted via the eligibility gate with a recorded reason. Title-level screening is not investigation.',
    source: 'remediation-discipline §2.1 (investigate-before-discard) + §4 cat 8 (roadblock resilience)',
    enforcedBy: ['RD-4-quarantine-disposition', 'RD-7-roadblock-alternative-search'],
  },

  // ─────────────────────────────── Investigation / fix discipline ───────────────────────────────
  {
    id: 'diagnose-before-fix',
    statement:
      'Diagnose before fixing. No assumptions, no hallucinations. Classify the failure (reference vs working-artifact) and name the mechanism from evidence before authoring a fix.',
    source: 'global CLAUDE.md + ICM reference-vs-working-artifact diagnostic',
    exempt: {
      reason:
        'Process discipline applied at investigation time; not a checkable property of a committed file. It governs HOW an agent reasons before writing — same non-mechanizable class as RD-2/RD-3. Carried by this register + skill bodies; violations surface as bad fixes, caught in review.',
    },
  },
  {
    id: 'findings-before-fixes',
    statement:
      'A read-only investigation phase precedes writes when state is uncertain; investigation findings that contradict dispatch premises are surfaced as findings, not plowed over. Writes wait on the finding.',
    source: 'fsi-app CLAUDE.md — Verification Before Authorization',
    exempt: {
      reason:
        'Dispatch-time sequencing discipline (read-only-first when premises are unproven); not a committed-code property. The write-side half (per-step verification before the next downstream effect) is dispatch-authored, not globally mechanizable. Process-class like diagnose-before-fix.',
    },
  },
  {
    id: 'mechanism-named-before-spend',
    statement:
      'No paid pass without the mechanism named first: deterministic-first (free reground / retrieval) before any spend, and the spending mechanism is identified before the call. All spend is ticketed through the spend chokepoint.',
    source: 'remediation-discipline §4.6 (spend chokepoint) + RD-8 retrieval-before-generation',
    enforcedBy: ['RD-10-spend-chokepoint'],
    residual:
      'RD-10 (F15 + spend-guard.test) enforces the single ticketed spend chokepoint mechanically; "mechanism NAMED first / deterministic-first" is the dispatch-time judgment half (retrieval-before-generation, RD-8, is itself exempt process). The gate proves spend is ticketed; naming-before-spend is authoring discipline.',
  },
  {
    id: 'one-paid-pass-per-item-per-mechanism',
    statement:
      'One paid pass per item per mechanism — a mechanism does not re-spend on an item it already processed; recovery reuses a stored pool (free) before any re-fetch; idempotent by construction.',
    source: 'remediation-discipline §2.1 recovery-triage + spend discipline',
    enforcedBy: ['RD-10-spend-chokepoint'],
    residual:
      'RD-10 gates the spend surface; the per-item idempotency (reuse stored pool before re-fetch) is enforced in the pipeline (groundBrief reuses agent_run_searches) and proven by the recovery-triage diagnostic. The "exactly once per mechanism" accounting is dispatch-ledger discipline, not a single committed property.',
  },
  {
    id: 'status-is-a-cache',
    statement:
      'provenance_status is a CACHE of a gate result; any migration that changes the gate or its inputs MUST ship a corpus revalidation in the SAME change, and stored status must agree with the live gate in BOTH directions (no stale-verified, no stale-quarantined).',
    source: 'remediation-discipline — Status is a cache (RD-5)',
    enforcedBy: ['RD-5-status-is-a-cache'],
  },

  // ─────────────────────────────── Render / data integrity ───────────────────────────────
  {
    id: 'never-render-without-backing-field',
    statement:
      'A surface never renders a value without a real backing field; a writer with no reader or a reader with no writer (the half-slice defect) is forbidden; customer reads gate on provenance_status=verified.',
    source: 'remediation-discipline §4 cat 9 (producer-consumer orphan) + surface-honesty',
    enforcedBy: ['RD-9-producer-consumer-orphan', 'SF-10-customer-surface-rendering'],
    residual:
      'RD-9 (F14) gates write-orphans (a written table with zero readers); SF-10 gates the render layer (placeholder-literals never reach a customer cell). The "every rendered value has a backing field" reader-side half is reported by F14 for phase scoping, not hard-gated — semantic residual.',
  },
  {
    id: 'all-deletes-via-gate',
    statement:
      'Every delete/archive goes through the eligibility gate + log: classify before discard, no archive over an undiagnosed bucket, archives are reversible (prior-value snapshot) and skill-cited.',
    source: 'remediation-discipline §2 (class-over-instance) + RD-1',
    enforcedBy: ['RD-1-classify-before-discard'],
  },
  {
    id: 'one-url-canonicalizer',
    statement:
      'URL-identity normalization lives in ONE sanctioned home — canonicalizeUrl (src/lib/sources/url-canonicalize.ts); no module re-implements it with an ad-hoc regex chain. The forbidden shapes are bare scheme-strip (.replace(/^https?://…)) and whole query/fragment drop (.replace(/[#?]…)) — the deleted intake _normUrl, whose query-drop collapsed distinct eur-lex …?uri=CELEX:… URLs to one key and false-deduped distinct regs at the mint chokepoint (D1). canonicalizeUrl PRESERVES query content while folding the noise variants; host extraction and the SQL-mirror canonicalizeCitationUrl are distinct operations, not this class.',
    source: 'intake-correctness dispatch Step 1.3 (operator 2026-07-12) — remediation-discipline §4 cat 4 (API contract gaps: URL canonicalization)',
    enforcedBy: ['RD-13-one-url-canonicalizer'],
  },
  {
    id: 'line-read-is-not-verification',
    statement:
      'A deterministic gate ships with a table-driven behavioral contract test over a COMMITTED golden corpus, proven red-then-green — an audit line-read of the gate is NOT verification. The named intake gates (sourceRole/congruence, urlIsRoot, matchExistingSubject, the mint idempotency short-circuits) are enforced by their committed tests running in the suite; new deterministic gates are closeout-audited for the same coverage.',
    source: 'intake-correctness dispatch Step 4.2 (operator 2026-07-12) — remediation-discipline §3.5 (investigation discipline)',
    enforcedBy: ['RD-14-line-read-is-not-verification'],
  },
  {
    id: 'no-uncited-operator-gate-in-doctrine',
    statement:
      'no-human-finish-of-intake extends across the whole doctrine surface: a clause asserting a HUMAN GATE (human must approve/review/confirm before the machine proceeds) in intake/triage/promotion/demotion/disposition MUST NOT sit UNCITED — it is rewritten to machine-gates-are-approval + operator-visibility, or annotated [RETAINED: reason; register:<id>] for a legitimately human-gated destructive/irreversible action. Visibility (DP-1 single-pane review, surface-to-queue, shown-on-the-trail) is PRESERVED, not a gate. The self-inflicted variant is forbidden: a thread whose closer is "operator re-confirms a ruling already given" is a self-inflicted gate — a ruled decision does not return to the board as blocked; it executes, and if conditions changed the executor names the changed condition, never silently re-parks.',
    source: 'doctrine-contradiction-sweep rider + board self-gate ruling (operator 2026-07-12)',
    enforcedBy: ['SF-12-doctrine-no-uncited-gate'],
  },
  {
    id: 'consolidation-is-behavior-preserving',
    statement:
      'A deduplication / consolidation pass ADOPTS the majority/live behavior of the copies it merges — it does not smuggle a behavior change into a dedup. A deliberate behavior change (a different date format, a different default, a bug fix that alters output) ships as its OWN unit, named, so review sees it. When the canonical home diverges from what the live surfaces render, the home is set to the live behavior (C6: format.ts::formatDate was a dead day-first export; the 7 live surfaces rendered US month-first, so the home adopted US — zero customer-visible change; the two variant copies with a different intent were LEFT, not silently unified).',
    source: 'C6/C7 date-format fork ruling (operator 2026-07-12)',
    exempt: {
      reason:
        'A process/orchestration-time discipline about HOW a consolidation is scoped (adopt-live-behavior, ship-deliberate-changes-separately); not a checkable property of a committed file. Same process-class as diagnose-before-fix / guards-win-fights. Enforced by review of each consolidation PR — a dedup that changes rendered output without saying so is the violation.',
    },
  },
  {
    id: 'no-inference-as-fact-on-regulatory-content',
    statement:
      'No invented facts; when facts run out, stop. Analysis in a workspace-ACTION section MUST open with a recognized label; matching an entity to a regulation\'s defined role or deciding an obligation attaches is a legal determination routed to counsel, never asserted as fact.',
    source: 'environmental-policy-and-innovation — Integrity Rule + Section 8 qualification capture',
    enforcedBy: ['EP-1-integrity'],
    residual:
      'EP-1 (migrations 035/044/121) auto-flags hedge phrases + keeps unverified items off customer surfaces; EP-8 (qualification capture) and SC-12 (slot-forcing genuine-support) carry the semantic half. Invention that uses no hedge phrase is authoring-judgment residue — the moat is the provenance gate, not a semantic oracle.',
  },
  {
    id: 'doc-numbers-reference-queries-not-values',
    statement:
      'Docs carry DOCTRINE, not STATE. Counts, what-is-built, applied-migration numbers, per-item status live at the live surfaces (/admin, migrations inventory, invariant registry, git log). A number or "what\'s done" claim written into a doctrine file is drift — cite the query, not the value.',
    source: 'fsi-app CLAUDE.md — doctrine-not-state; global CLAUDE.md dates-in-filenames',
    exempt: {
      reason:
        'A documentation convention (cite live surfaces, do not restate published facts); not a single mechanical property of a file. The DRIFT half is partially caught: the consistency layer (C3 migrations.md, C4 worktrees.md, C5 program-anchors) fails when a doc claims an entity that does not exist. But "this prose number is stale" in an arbitrary doc has no low-false-positive signal. Convention-class, carried here + the inventory consistency gate.',
    },
  },

  // ─────────────────────────────── Orchestration / meta ───────────────────────────────
  {
    id: 'guards-win-fights',
    statement:
      'When a guard and a convenience conflict, the guard wins. A gate is never silenced to lower a number; a flag spike is detection doing its job, triaged not muted; a mechanism is added in the SAME dispatch that surfaces the preservation argument, not left as a docstring.',
    source: 'remediation-discipline §3 (Signal 5) + §3.5 (flag-rate is not defect-rate)',
    exempt: {
      reason:
        'A meta-principle about precedence + how remediations are scoped (encode-don\'t-document, never-silence-the-gate). Enforced-by-construction across the whole discipline engine (fail-closed gates, the meta-gate itself), but not a single checkable property. Same class as RD-2 (class-fixes-mechanical). Violations show up as a silenced gate, caught in review of the gate change.',
    },
  },
  {
    id: 'sub-agent-output-untrusted-without-tool-counts',
    statement:
      'Delegated agent output is untrusted until it shows nonzero tool-calls AND is independently verifiable; degenerate returns (garbled / prompt-echo / 0-tools) are discarded whole; a fail-twice agent is pulled inline; mutations run in the main session (hooks do not fire in subagents).',
    source: 'session memory (feedback_subagent_results_untrusted) + action-time skill gate limit',
    exempt: {
      reason:
        'Orchestration-time verification judgment applied to each agent result; not a property of a committed file. The structural half — mutations must be main-session because the PreToolUse skill-gate + provenance guard do not fire in subagents — is enforced by those gates existing; the "verify tool-counts before trusting" step is orchestrator discipline. Process-class.',
    },
  },
  {
    id: 'emit-path-enumeration-for-render-gates',
    statement:
      'A render/strip gate enumerates the emit paths it is permitted to render (an allowlist of sections/fields) rather than broadening a strip regex; an unparsed render path with no structured-entry gate is a fail-closed tail-drop, not a best-effort filter.',
    source: 'F-1 fix ruling (operator 2026-07-11) + brief-section-strip fail-closed tail-drop',
    enforcedBy: ['SF-10-customer-surface-rendering'],
    residual:
      'SF-10 (assertions.test + the real-browser leg) proves the F-1 strip + placeholder-literal gate red-then-green over the render surface; the "allowlist over broaden-the-regex" design principle is carried in the fix + this entry. The browser leg is non-blocking until 3 green on master (see rendering-guard followups).',
  },
  {
    id: 'soft-fail-merge-routine-when-classified',
    statement:
      'Merging a PR whose only red is a NON-BLOCKING (soft / continue-on-error) check is a ROUTINE decision — decided by decision rule, operator gets visibility, no ack needed — WHEN the soft-fail is classified (mechanism named, real-finding-vs-infra decided) and its follow-ups are registered with IDs. It is gated to the operator ONLY when the soft-fail is UNDIAGNOSED (mechanism unnamed). Required checks must be green either way.',
    source: 'operator ruling 2026-07-11 (rendering-guard SF-10 soft-fail merge)',
    exempt: {
      reason:
        'An orchestration decision-rule about WHEN a soft-fail merge needs operator eyes (unnamed mechanism) vs proceeds routinely (classified + registered); not a checkable property of a committed file. Same process-class as guards-win-fights and sub-agent-untrusted. Enforced by practice + the closeout audit: a soft-fail merged without a recorded classification is the violation.',
    },
  },
  {
    id: 'credential-surface-visibility',
    statement:
      'Any change to the credential surface — a new secret entry, a new consumer of an existing secret, a scope change, a new vault — is surfaced to the operator IN THE PR DESCRIPTION as a named security-surface change, the same standard as new public routes and RLS changes.',
    source: 'operator dispatch 2026-07-12 (secrets topology, Unit 3.1)',
    enforcedBy: ['SF-11-secrets-registered'],
    residual:
      'SF-11 (secrets-reference-audit, run in the discipline suite AND the meta-gate) mechanically fails an UNREGISTERED workflow secret reference, so a new GitHub-Actions secret cannot ship without being registered (and registration + the PR surfacing go together). The PR-description SURFACING convention itself (naming the security-surface change) is audited at closeout, same as the public-route / RLS-change standard — the mechanical half is the registry gate, the prose-surfacing half is convention.',
  },
  {
    id: 'no-new-secrets-without-need',
    statement:
      'New secrets are created ONLY when absolutely needed to fix an existing problem. Adding a consumer of an EXISTING credential is routine plumbing (existing name, registered in topology, named in the PR). Creating a NEW credential value or label requires: the problem stated in the PR, confirmation no existing credential can serve, operator visibility at creation.',
    source: 'operator dispatch 2026-07-12 (secrets topology, Unit 3.2) — verbatim intent',
    enforcedBy: ['SF-11-secrets-registered'],
    residual:
      'SF-11 fails an unregistered NAME — so an invented new label (the PROBE_SECRET class: a new name that named a secret that never existed, when the existing WORKER_SECRET served) cannot silently ship; registering a genuinely-new secret is a deliberate, PR-visible act. The judgement "no existing credential can serve" is dispatch-time reasoning audited at closeout (the WORKER_SECRET-already-existed finding is the worked example: the fix was to reuse it, not invent PROBE_SECRET). Not every no-new-secret judgement is mechanizable; the registry gate catches the ship-time symptom.',
  },
  {
    id: 'credential-capability-verified-by-test',
    statement:
      'Claims about what an agent CAN or CANNOT do with a credential store are verified by ATTEMPT before any action is parked on the operator. A parked credential action must cite the failed attempt (the exact permission error), not an assumption.',
    source: 'operator dispatch 2026-07-12 (secrets topology, Unit 3.3)',
    exempt: {
      reason:
        'Process/orchestration-time discipline (test-before-you-park), not a checkable property of a committed file — no practical mechanical check (it governs how the agent reasons at action time, same class as sub-agent-untrusted and diagnose-before-fix). Enforced by the closeout audit: a parked credential action WITHOUT a cited failed-attempt is the violation. Worked example (this dispatch): the R0.2 report said "can\'t/won\'t set the secret" conflating CAN\'T with WON\'T; Unit 1.1 verified by test that the agent CAN write GitHub secrets (throwaway set/delete succeeded) — the claim was corrected by attempt.',
    },
  },
  {
    id: 'worktree-isolation',
    statement:
      'Agent branch/checkout/merge operations occur ONLY in that agent\'s assigned worktree; the main checkout is the orchestrator\'s exclusive surface. An agent that finds itself in the main checkout stops and reports, it does not operate there.',
    source: 'remediation-discipline §4 cat 14 (RD-19)',
    enforcedBy: ['RD-19-worktree-isolation'],
  },

  // ─────────────────────────── D-2..D-5 riders (dwell / deferral / trend / conflict) ───────────────────────────
  {
    id: 'dwell-time-max-age-on-every-transitional-state',
    statement:
      'Every transitional state (quarantine, provisional, staged-transit, open-flag) carries a max-age; an item past its state\'s max-age turns the lane HARD RED. A transitional state without a dwell bound is a silent-backlog hole.',
    source: 'Disposition Engine rider D-2 (operator 2026-07-11)',
    // Quarantine + deferral dwell bounds EXIST (RD-4/RD-6). Provisional 72h + staged-transit max-age are
    // BUILT in Units 1 and 0b; this doctrine grows its enforcedBy as those land. For now it rides the
    // existing quarantine/deferral dwell enforcement (the transitional states that HAVE a resolver today).
    enforcedBy: ['RD-4-quarantine-disposition', 'RD-6-deferral-vs-undispositioned', 'RD-20-staged-transit-disposition'],
    residual:
      'RD-4 enforces the quarantine dwell bound, RD-6 the deferral bound, and RD-20 (added 2026-07-11, Unit 0b pt2) the staged-transit max-age. The provisional-72h dwell invariant lands with Unit 1 and is ADDED to this enforcedBy when it exists (not claimed before it is built — the unenforced-doctrine bar). D-2 is fully satisfied only when EVERY transitional state (quarantine ✓, deferral ✓, staged-transit ✓, provisional — pending U1) has a live dwell audit.',
  },
  {
    id: 'deferral-ceiling-30d-non-renewable-without-state-change',
    statement:
      'A deferral is dispositioning-as-blocked, never silencing: it names the specific blocker + the awaited disposition path + a named future resolution event + a real owner, and expires (re-opening as undispositioned) — it cannot be renewed without a genuine state change.',
    source: 'Disposition Engine rider D-3 + remediation-discipline §2.2 (RD-6)',
    enforcedBy: ['RD-6-deferral-vs-undispositioned'],
    residual:
      'RD-6 (deferral-hygiene-audit + the write-time deferral guard) enforces valid-deferral shape + self-resurrection on expiry. The specific "30d non-renewable-without-state-change" ceiling is a parameter of that audit; if the live bound differs it is tightened in the RD-6 audit, not by a new mechanism.',
  },
  {
    id: 'backlog-trend-growing-median-age-is-red',
    statement:
      'A growing median age across a transitional population (quarantine / provisional / flags) is itself a red signal — the backlog is winning even if no single item has crossed its bound. Trend, not just threshold.',
    source: 'Disposition Engine rider D-4 (operator 2026-07-11)',
    exempt: {
      reason:
        'ENFORCEMENT-TO-BUILD (Unit 5 daily-cron observability): a median-age trend check across resolver runs is mechanizable but needs the cron + a stored age-series; it lands in Unit 5 (resolvers on daily cron; R0.2 alerts only if a resolver fails). NAMED-RESIDUAL, REVISIT at Unit 5 — the threshold half (per-item max-age) is already RD-4/RD-6; only the derivative (trend) is deferred.',
    },
  },
  {
    id: 'conflict-1-autonomy-beats-batch1-gate',
    statement:
      'CONFLICT #1 (operator RULING, 2026-07-11): the general loop-off / batch-1 fetch hold is OVERRIDDEN for the EXISTING quarantined/flagged population\'s remediation fetches AND for an operator-fired manual intake run. Both are authorized callers through the SAME manifest-bound fetch mechanism (F16) — one mechanism, two signed callers (unit3-remediation, manual-intake-run), no third door. General autonomous/scheduled fetching stays held.',
    source: 'Disposition Engine scoped-fetch exception + ADR-012 (operator 2026-07-11)',
    enforcedBy: ['RD-11-transport-hold-gate'],
    residual:
      'RD-11 (F16 + fetch-hold.test) is the single manifest-bound fetch gate. The two-caller allow-list (unit3-remediation + manual-intake-run) is the extension landing in Unit 0b/U3, with F16\'s test extended to prove the allow-list is manifest-bound, not a hole. Until that extension lands, the hold is enforced and the exception is operator-signed per-run, not code-open. This entry IS the ruling that resolves no-human-finish-of-intake\'s and earth-exhaustion\'s scoped-fetch conflict.',
  },

  // ─────────────────────────────── Product / surface intent ───────────────────────────────
  {
    id: 'research-is-horizon-scan',
    statement:
      'The Research surface answers "what is emerging, who is studying it, how does it change my planning horizon." Its feedstock is AUTONOMOUS intake from research-role sources (universities, academic journals, institutes, analytical/horizon-scan press) — machine-ingested, not editor-selected. Editorial/curation queues and human-selection affordances on Research (operator-approval, editor-picked, "featured/selected by" framing) are FORBIDDEN: they are intent-drift against the page intent AND a no-human-finish-of-intake (RD-20) violation — an editorial queue makes a human the finish of the Research pipeline. RULED operator 2026-07-12, closing the previously-open Research repositioning decision toward horizon-scan (editorial queue REJECTED).',
    source: 'Research positioning ruling (operator 2026-07-12) — caros-ledge-platform-intent SKILL.md §RESEARCH + May-2026 product-audit page intents',
    enforcedBy: ['RD-20-staged-transit-disposition'],
    residual:
      'RD-20 (staged-transit-audit) enforces no-human-finish-of-intake for the intake transit path — a research-role item is machine-ingested and cannot rest in a human-approval queue, which is precisely why an editorial/curation QUEUE on Research is forbidden (a queue is a human finish of the pipeline). The POSITIONING half ("Research = horizon-scan" page intent) is product-framing carried by the platform-intent SKILL.md (binding; drift requires operator-stated correction, same class as the five-surface model / PI-1). A surface-level fitness function scanning the /research surface for curation affordances (editor-picked / featured-by / operator-approval controls) is BUILDABLE but semantic/low-signal; it is NOT built under this relay — reported to the operator as the enforcement option, not silently claimed here.',
  },
  {
    id: 'analysis-follows-page-intent',
    statement:
      'Data collection, aggregation, and synthesis are contracted PER PAGE against that page\'s operator question. One generic analysis path serving all pages is forbidden. Regulations is the ONLY page whose read is a compliance-action text brief. Market Intel reads are comparative/numerical (deltas, trajectories, lead-time). Research reads are structured horizon assessments (horizon distance, maturity, credibility of who is studying it, planning-assumption shift), not paper summaries. Operations reads are structured jurisdictional data surfaces. The per-page contracts live in the platform-intent skill. Enforcement (writer-agent contracts + goldens) lands with the surface build units; absence until then is a known gap, not a violation.',
    source: 'analysis-follows-page-intent ruling (operator 2026-07-12)',
    exempt: {
      reason:
        'ENFORCEMENT-TO-BUILD with a named landing point: the per-page writer-agent contracts + goldens land WITH THE SURFACE BUILD UNITS (each page\'s build), not before — same enforcement-to-build class as backlog-trend-growing-median-age (D-4, exempt pending Unit 5). The operator ruled the absence a KNOWN GAP, not a violation, until those units land. The per-page contract SKETCHES live in the platform-intent SKILL.md (product-framing, binding; drift needs operator correction). NAMED-RESIDUAL, REVISIT when the first surface build unit lands — grows an enforcedBy (a per-page writer-contract fitness function + goldens) at that point.',
    },
  },
  {
    id: 'community-is-human-space',
    statement:
      'Community (posts, pickups, promotion, verifier sign-off, moderation) is HUMAN-OPERATED BY DESIGN. It is NOT intake and is NOT subject to no-human-finish-of-intake / machine-gates-are-approval — those doctrines govern the machine INTAKE path only. Human approval / curation / promotion affordances on Community surfaces are legitimate by design, not gates to remove and not retained exceptions. THE ONE DOCTRINAL EDGE (boundary requirement): content promoted from Community INTO the intelligence corpus carries its OWN provenance class — community-originated, human-promoted — and NEVER renders as machine-grounded / verified. Enforcement of that provenance labeling lands with whichever unit touches the promotion path; known gap until then.',
    source: 'census disposition Ruling 1 (operator 2026-07-12)',
    exempt: {
      reason:
        'DESIGN-CLASS boundary doctrine: its primary content SCOPES the Community surface OUT of the intake human-gate doctrines — "these rules do not apply here" needs no mechanical check. The one mechanizable half is the boundary requirement (Community-promoted corpus content carries a community-originated / human-promoted provenance class and never renders as machine-grounded/verified); that is a KNOWN GAP with a named landing point — the unit that touches the promotion path — same enforcement-to-build class as analysis-follows-page-intent. It grows an enforcedBy (a provenance-label check on the promotion path) when that unit lands; until then the absence is a registered gap, not a violation.',
    },
  },
  // ─────────────────────────── Generation pause / manual-intake mechanism ───────────────────────────
  {
    id: 'pause-is-prohibition-dormancy-is-schedule',
    statement:
      'The generation pause gate distinguishes a PROHIBITION from a SCHEDULE. emergencyPaused (global_processing_paused) is the operator\'s prohibition — a HARD stop for all callers. cadence===off is dormancy (a schedule state, "nothing runs unbidden") — it halts autonomous generation only; an F16-signed manual caller (manual-intake-run) proceeds, because an operator-fired run IS the bidding. This is why the manual-intake path can GROUND, not only MINT, in the dormant pre-launch state. The real integrity gates (data-audit-block, daily-cap, floors, judge) bind every caller regardless.',
    source: 'pause-semantics ruling paragraph 1 (operator 2026-07-12)',
    enforcedBy: ['RD-21-generation-pause-split'],
  },
  {
    id: 'manual-intake-run-is-the-one-pipeline',
    statement:
      'manual-intake-run is NOT a separate intake pipeline. It is the ONE pipeline invoked once: same mint chokepoint, same machine gates, same grounding contract (generateBriefWorkflow), with ZERO manual-only logic beyond the caller identity and the run-once orchestration. At the cadence flip the scheduled caller invokes the SAME runIntakeCycle — "manual" reduces to a button that does what the clock does. Any future manual-only branch in the pipeline fails review against this entry.',
    source: 'pause-semantics ruling paragraph 2 (operator 2026-07-12)',
    exempt: {
      reason:
        'A no-second-pipeline structural discipline enforced by CONSTRUCTION + review: runIntakeCycle calls the single generateBriefWorkflow contract (the same /api/agent/run path, D4 ruling) with the caller threaded only as an identity string — there is no manual-only code branch to gate. "A manual-only branch" is a semantic judgment, not a low-false-positive checkable property; the enforcement is that any PR introducing manual-only pipeline logic fails review against this entry (same review-class as consolidation-is-behavior-preserving). The single grounding contract is the mechanical anchor; the no-divergence rule is the review discipline.',
    },
  },
  {
    id: 'no-source-less-live-mint',
    statement:
      'A mint cannot produce a source-less LIVE intelligence_items row. Intelligence items live INSIDE sources (Layer-1/Layer-2), and grounding grounds a brief against the item\'s source — so a source_id=NULL item can never verify. At the ONE mint chokepoint, a candidate\'s source_url is resolved against the registry: a caller-preset source_id is trusted, a resolved source LINKS, an UNRESOLVED url is REJECTED-with-reason (register the source first — no silent orphan, no auto-registration). A structural `no source_id` ground failure routes straight to held-for-re-source (skipping the futile re-ground/re-research), and the brief-null disposition is labeled honestly (brief-nulled-held, never "erased"/archived).',
    source: 'Fix A/B build authorization (operator 2026-07-12) — the T9 source-orphaned-mint wall',
    enforcedBy: ['RD-22-mint-source-link'],
    residual:
      'RD-22 is dual: the mint chokepoint reject (mint-source-link.npmtest.mjs, red-then-green) forecloses NEW source-less live mints for all callers; the live-data audit (source-link-audit.mjs) fails on any source-less LIVE row beyond the documented pre-cutover grandfather (the two T9 orphans, Unit 3 re-sources them — the list only shrinks). The Fix-B structural routing + erase-honesty are proven in ground-failure-class.test.mjs. The re-sourcing of the two existing live orphans is Unit 3, not this doctrine.',
  },
  {
    id: 'pause-flag-has-one-writer',
    statement:
      'The pause stop flags (system_state.global_processing_paused, scrape_cadence) have EXACTLY ONE writer, enforced STRUCTURALLY — no credential, no secret, no manual step (human intervention is never the solution; the system manages the problem). Three layers: (static) the F20 fitness function fails CI on any direct write to those columns in src outside the sanctioned admin route; (runtime) the admin_set_pause_state RPC (migration 201) is the only writer that declares the app.pause_flag_writer marker, and the guard_pause_flag_writer trigger bounces any flag change lacking it (a generic service-role UPDATE is rejected); (detection) system_state_flag_audit logs every authorized write. This REPLACES the DEAD 2a operator-credential design (which required a manual operator step).',
    source: 'pause-flag structural enforcement dispatch (operator 2026-07-12) — supersedes the 2a operator-credential design, RULED DEAD',
    enforcedBy: ['RD-23-pause-flag-one-writer'],
    residual:
      'RD-23: F20 (static, red-then-green + live census) + migration-201 guard trigger/RPC (runtime bounce, proven red-then-green on a SYNTHETIC temp table in a rolled-back transaction — the live flag is never written, including by the test) + the audit table. Honest residual, same class as any transaction-local GUC marker: a caller with raw SQL could set the marker itself and bypass the trigger — but no COMMITTED code can (F20 fails CI), the casual agent flip (a plain UPDATE) bounces, and every write is audited. Structural defense-in-layers, not a cryptographic vault — and crucially it needs no human-held secret, which is the whole point (the 2a credential design was ruled dead precisely because it required a manual operator step).',
  },

  // ──────────────── Snapshot-first grounding (snapshot-first rebuild PR-2, 2026-07-13) ────────────────
  {
    id: 'verified-is-resting-state',
    statement:
      'Verified is a resting state. A provenance_status=verified item is NOT re-ground for pay without evidence of change (a content-hash / Last-Modified mismatch on its source) or an explicit operator order. Re-verifying resting-state items is waste. RETROACTIVE APPLICATION: the 2026-07-06 reconciliation re-verify sweep ($15.56 ledgered) re-processed already-verified, resting-state items; it is logged as WASTE, cause "design defect, pre-doctrine" — the sweep predates this doctrine and would not run under it.',
    source: 'snapshot-first rebuild PR-2 (operator ruling 2026-07-13; retroactive-waste ruling same date)',
    enforcedBy: ['RD-28-verified-is-resting-state'],
    residual:
      'RD-28 rides the existing spend-guard VERIFIED-ITEM gate (assertTicket rejects a verified ticket, proven in spend-guard.test.mjs). The retroactive 07-06 waste figure ($15.56, the reconciliation sweep day) is recorded here as the doctrine\'s worked example — the audit that surfaced it is the Phase-0 duplicate-spend audit (per-day run-class table).',
  },
  {
    id: 'no-acquire-with-valid-snapshot',
    statement:
      'No paid acquisition when a valid fresh snapshot exists. When the snapshot store holds the source and a HEAD freshness probe shows no change, verification is the cheap span-match against stored text (~$0); the paid fetch+model path is reserved for missing or demonstrably-changed snapshots and is itself locked behind GROUNDING_ACQUIRE_ENABLED (default OFF). A changed source is flagged + queued, never silently passed and never fetched without an operator per-item ruling.',
    source: 'snapshot-first rebuild PR-2 (operator ruling 2026-07-13; CHECKPOINT 2)',
    enforcedBy: ['RD-29-fresh-snapshot-never-paid'],
    residual:
      'RD-29 (verify-item decideVerify: fresh+cheap-pass → verified_cheap, never acquire; changed → stale_flag; only missing/failed → needs_acquire, itself lock-gated). The stale-snapshot queue (stale_snapshot_content_changed integrity_flags) is built + tested; it receives no action until an operator per-item ruling.',
  },
  {
    id: 'every-paid-run-carries-justification-and-attribution',
    statement:
      'Every paid run carries a pre-logged justification AND full attribution. Before any paid acquire, a justification (missing_snapshot | content_changed | cheap_verify_failed) is written to the ledger; and every paid ledger row carries an item id or a source id (never both-null — the July $65 hole). An unjustified or attribution-blind paid run is a defect.',
    source: 'snapshot-first rebuild PR-2 (operator ruling 2026-07-13)',
    enforcedBy: ['RD-26-pre-logged-acquire-justification', 'RD-25-paid-row-attribution'],
    residual:
      'RD-26 (justification written BEFORE the acquire lock throws, verify-item.test.mjs) + RD-25 (recordSpendCall writes source_id + item_id + warns; acquire-justification carries attribution). The full agent_runs data-invariant audit lands with the workflow rewire that threads itemId+sourceId onto every ticket.',
  },
  {
    id: 'report-states-quarantine-scope',
    statement:
      'Any report that cites a quarantine OR population count MUST state BOTH axes: (a) SCOPE (global | unit-scoped) — a window/grounding report carries the GLOBAL count alongside any working slice; AND (b) ARCHIVAL PREDICATE (live-only = is_archived=false | status-only = is_archived-agnostic). This exists because the SAME unlabeled-count ambiguity produced, in ONE WEEK (2026-07): a ~5x UNDERSTATEMENT — a scoped "~39" slice mistaken for the global count; and a ~5x OVERSTATEMENT — a status-only "197" (= 37 live + 160 already-archived rows still carrying quarantined status) mistaken for the live backlog, whose true live figure was 37. A count unlabeled on EITHER axis misleads.',
    source: 'snapshot-first rebuild PR-2 (operator ruling 2026-07-13); tightened by the 197→37 drift-reconciliation ruling (2026-07-13)',
    exempt: {
      reason:
        'PROCESS / report-format discipline — it governs how the agent writes a dispatch report at authoring time, not a code or data property (same non-mechanizable class as the report-format doctrines; no CI check parses report prose). Carried by this register + the spend-gauge header requirement (which pairs the count with its scope by convention). The archival-predicate axis is mechanizable at the QUERY layer (a census script SHOULD emit both live-only and status-only counts), but the DOCTRINE binds the report prose, so it stays process-exempt like its scope half.',
    },
  },
];

// Doctrine IDs referenced by `conflicts` must resolve to a real entry (the conflict-ledger integrity check).
export const DOCTRINE_IDS = new Set(DOCTRINES.map((d) => d.id));
