// RD-38-funded-pass-run-lock: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'RD-38-funded-pass-run-lock',
    skill: 'remediation-discipline',
    section: 'Section 4 — category 23: Funded-pass run-lock (no concurrent worklist driver)',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    text: 'A funded-pass process MUST hold an exclusive DB-level run-lock before driving a worklist; a second concurrent acquisition is refused and the second process exits with ZERO spend. This forecloses the 2026-07-15 concurrent-race (two funded passes on one worklist double-inserted claims on 6 items and, on a kill mid-write, zeroed 2). The lock (migration 205: funded_pass_runlock + atomic acquire/heartbeat/release) is acquired at process start, heartbeat between items, released at clean exit, with a stale-holder takeover (>300s) so a crashed holder cannot wedge the lane. Paired with the emergencyPaused between-item poll so an operator STOP is a flag-flip, never a mid-write kill.',
    anchor: 'Funded-pass run-lock (no concurrent worklist driver); second-instance refused, zero spend',
    enforcedBy: ['selftest:fsi-app/scripts/verify/funded-pass-lock-golden.mjs', 'migration:205'],
    residual: 'The golden proves second-instance rejection, stale takeover, heartbeat ownership, and clean release against the live acquire/heartbeat/release SQL functions; wired in scripts/funded-pass.mjs (acquire before the armed loop -> exit 6 on a live holder; between-item heartbeat + emergencyPaused poll; release in finally) via scripts/lib/funded-pass-lock.mjs. PROVEN LIVE 2026-07-15 (a second --apply launch while pid 38616 held the lock was refused zero-spend; a set emergency-pause halted the run gracefully and released the lock). NAMED RESIDUAL: the lock gates the funded-pass entrypoint only; a DISPOSITION-class actor (archive/reclassify) on a raw client is NOT yet gated — closed by the hardening unit H5 (mutation leases) + H6 (attribution + raw-write-path gate).',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
  };
