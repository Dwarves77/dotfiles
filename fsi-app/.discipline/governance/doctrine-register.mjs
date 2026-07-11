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
    // ENFORCEMENT-TO-BUILD in Unit 0b (manual-intake wiring): the staged-transit max-age invariant +
    // the F16 two-caller signed-exception. Until 0b lands this doctrine is EXEMPT (process/design), NOT
    // falsely marked enforced — flipped to enforcedBy the transit-max-age invariant when 0b ships.
    exempt: {
      reason:
        'ENFORCEMENT-TO-BUILD, Unit 0b (manual-intake wiring). The mechanical form is the staged_updates transit-only max-age invariant + the F16 signed-exception second-caller; those land in 0b, at which point this flips to enforcedBy that invariant. Interim: the design is fixed (ADR-012 rider) and the current human-approval path is being retired, not relied on. NAMED-RESIDUAL, REVISIT at 0b — not a permanent exemption.',
    },
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
    enforcedBy: ['RD-4-quarantine-disposition', 'RD-6-deferral-vs-undispositioned'],
    residual:
      'RD-4 enforces the quarantine dwell bound and RD-6 the deferral bound TODAY. The provisional-72h and staged-transit max-age invariants land with Units 1 and 0b and are ADDED to this enforcedBy when they exist (they are NOT claimed here before they are built — that would violate the unenforced-doctrine bar). D-2 is fully satisfied only when every transitional state has a live dwell audit.',
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
];

// Doctrine IDs referenced by `conflicts` must resolve to a real entry (the conflict-ledger integrity check).
export const DOCTRINE_IDS = new Set(DOCTRINES.map((d) => d.id));
