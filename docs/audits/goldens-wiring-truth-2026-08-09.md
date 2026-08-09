# Wiring-truth sweep — do our goldens and audits actually run? (2026-08-09)

Operator question (verbatim): "are our rules and goldens actually working the way they should? I don't
think so." Answer: they were not. This is the evidence, method, and the fix. Governing skills:
remediation-discipline, sprint-followups-discipline. Every finding carries a rule-14 status token.

## Method

Every behavioral golden and every registry-cited audit was EXECUTED (not read-and-assumed — the exact
failure mode rule 14 exists to prevent). Goldens ran in the sandbox; live-DB audits were classified by
their self-skip behavior and wired to run in the secrets lane. The invariant-coverage meta-gate's
resolution logic was read line-by-line.

## Findings

1. [CONFIRMED — ran all 15; zero are referenced by any workflow/glob/hook. run-test-suite.sh globs
   `scripts/verify/lib/*.test.mjs` but never `scripts/verify/*.golden.mjs` one directory up.] **All 15
   behavioral goldens executed by NOTHING.** They were `selftest:`-cited as invariant enforcement,
   git-tracked, and never run. Documentation wearing a test costume.

2. [CONFIRMED — ran it; real detection bug, FIXED] **`surface-contract-gate.golden.mjs` was silently
   RED.** Its PART B detector tested RAW migration source (comments included), so migration 222 (the
   census-rollup artifact, which only NAMES `coverage_gap_candidates` + `surface_test` in prose comments
   as a contrast) was mis-detected as "Session C's migration," and the comment-stripped assertions then
   failed on a migration that was never C's. Fixed to detect over comment-stripped source and require the
   real `surface_test jsonb` column signature. Verified live: `coverage_gap_candidates` has neither
   `surface_test` nor `disposition` and no in-tree migration adds them — so the correct state is PENDING-C,
   which the golden now prints. (Edit-the-source discipline: the detector was the bug, not the fixtures.)

3. [CONFIRMED — ran them; crash-class, FIXED] **3 proofs CRASHED on absent creds instead of self-skipping**
   (`mutation-lease.golden.mjs`, `funded-pass-lock-golden.mjs`, `canonical-key-uniqueness.mjs`): unguarded
   `process.loadEnvFile` / `readClient()` threw a stack trace = exit 1, indistinguishable from a real FAIL.
   All three now self-skip (exit 2, "cannot verify here") like the sibling audits, so a no-cred run is
   diagnosable.

4. [CONFIRMED — cross-referenced the `audit:` tokens against run-data-audit-lane.mjs AUDITS] **13
   registry-cited audits ABSENT from the lane.** canonical-key-uniqueness, column-existence-parity,
   deferral-hygiene, flag-age, format-structure, no-generic-source, no-names, pause-flag-guard-proof,
   rls-credential-parity, routing, source-link, source-vs-item, staged-transit — each an `audit:` enforcer
   of a live invariant, none in the run list. Now wired (hard).

5. [CONFIRMED — read invariant-coverage.mjs:89-99] **The meta-gate rubber-stamped the gap.** `audit:`
   tokens resolved on tracked + a GOVERNING cite; `selftest:` tokens on tracked alone. Neither checked
   EXECUTION, so classes 1 and 4 passed the very gate built to catch unwired enforcement.

6. [CONFIRMED — the mig-118 case, see ADR-017] **Even checks that DID run asserted presence, not
   behavior.** The phase-2 build script verified the provenance guard triggers EXISTED and were ENABLED.
   Nobody attacked the guard. It existed, it fired, and it fell to one `set_config` call.

## Fix (shipped this commit)

- `scripts/verify/run-goldens.mjs` — runs every golden (glob-by-construction), cred-aware (PASS/FAIL/SKIP);
  wired into the CI fitness-check job (after `npm ci`, since some goldens use jiti).
- The 13 audits added to `run-data-audit-lane.mjs` (hard); first real execution is the secrets lane.
- `.discipline/governance/execution-wiring.mjs` + `.test.mjs` — resolves "is this proof actually RUN?"
  from the real runners (6 execution surfaces). The meta-gate now requires `selftest:`/`audit:` tokens to
  be execution-wired; a cited-but-unrun proof FAILS. End-to-end proven: removing one audit from the lane
  turns the gate red with the exact remediation message.
- `scripts/verify/prov-guard-adversarial-audit.mjs` — the class-6 template: an adversarial proof wired into
  the lane, attacking the mig-250 guard (forged-GUC escalation, direct escalation, ON CONFLICT) under
  rollback. See ADR-017.
- CLAUDE.md rule 15 codifies both: execution-over-existence, and attack-don't-assert-presence.

## Status after fix

Full no-npm discipline suite: 978/978 pass. Meta-gate: green with execution-wiring enforced (101
invariants + 63 doctrines wired, each by a mechanism that actually runs). Goldens runner: 13 pass, 2
live-DB self-skip. The two jiti self-tests (trust, source-growth) were found already execution-wired via
fitness sentinels F11/F10 (which `spawnSync` them and pass iff exit 0) — a false gap, corrected here.
