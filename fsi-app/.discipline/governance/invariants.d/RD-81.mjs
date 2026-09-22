// RD-81: registered by lane G4 (pr-g4.md, 2026-09-22). One entry, one file; see
// invariants.d/README.md.

export const invariant = {
  id: 'RD-81',
  skill: 'remediation-discipline',
  section:
    'Section 4 - category 50: a golden that touches shared live state is isolated per run and idempotent at start',
  text:
    'A behavioral golden that writes rows into a LIVE shared table (not a synthetic table, not a ' +
    'rolled-back transaction) MUST NOT reuse one fixed fixture identity across invocations, and MUST ' +
    'clear its own leftover fixture state at the START of every run, not only at the end. ' +
    '[CONFIRMED, lane G4, 2026-09-22, by reading the live funded_pass_runlock row then reproducing]: ' +
    'funded-pass-lock-golden.mjs used a single fixed test key (funded-pass-golden-test) and a ' +
    'cleanup() that selected a column named "id" on a table whose primary key is lock_key -- there is ' +
    'no "id" column, PostgREST returned error 42703 on every call, and cleanup() dropped the `error` ' +
    'field from its destructure (the exact error-swallow anti-pattern CLAUDE.md\'s agent/run ' +
    'post-mortem names) so `ids` was always `[]` and guardedDelete never ran. Every invocation, not ' +
    'only an OS-killed one, left its fixture holder (pid 990001) live forever; the next run\'s first ' +
    'acquisition correctly took over that stale holder and failed the golden\'s own first assertion ' +
    '(expected ok=true/takeover=false, got ok=true/takeover=true). A second, independent defect: the ' +
    'one fixed key meant two gates running the golden concurrently on the same machine drove the same ' +
    'row and raced each other. The fix is two-part and belongs IN THE GOLDEN, never in the RPCs\' ' +
    'behaviour, an allowlist, or a skip: (1) each run generates its own lock_key under a shared fixture ' +
    'prefix (`<prefix>-<random>`), so concurrent runs cannot collide with each other or with the live ' +
    'production key; (2) at start, the golden sweeps fixture-prefix rows whose heartbeat is older than ' +
    'a threshold well above the golden\'s own run time (30s here, against a real run time of low ' +
    'single-digit seconds) -- age-gated so the sweep can never delete a concurrently-running sibling\'s ' +
    'fresh row, only genuine leftovers from a killed prior run. End-of-run cleanup deletes only the ' +
    'run\'s own key, for the identical reason. A rolled-back transaction (the pause-flag proof\'s ' +
    'pattern) is the alternative when the golden calls the protected functions over a persistent raw ' +
    'Postgres session; it is NOT available to a golden that means to prove the actual production ' +
    'integration path when that path is a stateless PostgREST transport (supabase-js `.rpc()`), because ' +
    'every `.rpc()` call auto-commits as its own transaction and there is no supported way to hold one ' +
    'BEGIN open across separate HTTP requests through that client.',
  anchor:
    'Section 4 - category 50: a golden that touches shared live state is isolated per run and idempotent at start',
  enforcedBy: [
    'selftest:fsi-app/scripts/verify/funded-pass-lock-golden.mjs',
  ],
  residual:
    'Proven by attack, this lane, 2026-09-22: two sequential runs PASS; two concurrent runs ' +
    '(`node golden & node golden; wait`) both PASS with no shared-row interference; a planted stale ' +
    'fixture row (via the golden\'s own guardedInsert helper, FUNDED_PASS_GOLDEN_PLANT_STALE=1, never ' +
    'hand SQL) is cleared by the idempotent-start sweep and the run still PASSes. The live ' +
    'funded_pass_runlock table held one stale row (lock_key funded-pass-golden-test, pid 990001, ' +
    'heartbeat ~2026-09-22T17:29:16Z, ~11 minutes stale when read) before this fix landed; it read ' +
    'empty immediately after. NAMED RESIDUAL: mutation-lease.golden.mjs is the one other golden that ' +
    'writes a live shared table (mutation_leases); it already sweeps its own fixture id at START (not ' +
    'the funded-pass shape this invariant fixes) but uses one FIXED sentinel item id across every run, ' +
    'so it is not yet safe under two concurrent gates -- tracked as owed, not fixed by this lane (a ' +
    'different-shaped gap: isolation-only, not idempotency-only, so it is not the "identical shape" ' +
    'mechanical fix this lane\'s scope covers).',
};
