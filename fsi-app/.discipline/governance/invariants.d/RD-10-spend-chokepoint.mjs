// RD-10-spend-chokepoint: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'RD-10-spend-chokepoint',
    skill: 'remediation-discipline',
    section: 'Section 4.6 — the spend chokepoint (generation-side dedup-before-ground)',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    text: 'Every model call MUST route through the ONE spend client, which requires a SpendTicket; a ticketless call throws, a per-item ticket whose failure set is fully deterministically-resolvable OR whose standing disposition is DELETE is REJECTED, and the budget ceiling is enforced in code. No Anthropic API call / client instantiation may exist outside the spend client and its sanctioned transport, beyond a reason-bearing, review-by-phase-tagged SHRINKING allowlist that is itself audited (a stale entry is RED).',
    anchor: 'The spend chokepoint (generation-side dedup-before-ground)',
    enforcedBy: ['fitness:F15', 'selftest:fsi-app/src/lib/llm/spend-guard.test.mjs'],
    residual: 'F15 (grep-class, red-then-green: a simulated direct-API bypass in a non-allowlisted file is RED with file:line; the A2 allowlist is stale-audited by the test) gates the STRUCTURAL guarantee — no ungated call site. spend-guard.test.mjs proves the PURE guard red-then-green: ticketless throws, deterministically-resolvable rejected (deterministic-lever), DELETE-disposition rejected, ceiling throws. NAMED RESIDUAL: the allowlist is NON-EMPTY (live count/home = LEGACY_ALLOWLIST in F15-spend-chokepoint.mjs — never cache the number here; it shrinks per migration, was 12 at ship) — each reason-bearing + reviewByPhase-tagged; the shrink plan migrates them to spendStream/spendSearch (classifiers via standingClass). The necessity gate is only as good as the ticket the caller supplies (failureClasses/necessity/disposition); the runner computes them from live provenance. Telemetry single-homed in spend-client.logSpendRun (the 4f relocation).',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
  };
