// RD-91: new invariant, lane R4-5 (2026-10-01/02). One entry, one file; see invariants.d/README.md.
// Id picked as the next free RD number (RD-90 was the highest at this lane's push time); no
// coordinator-assigned id was named in the dispatch for this fitness function, since the standing
// check itself was not originally in scope -- the operator's "fixed, not flagged" directive on the
// 19 live header mismatches F63 found led to writing the check. Rename on request if it collides.

export const invariant = {
  id: 'RD-91',
  skill: 'remediation-discipline',
  section: 'Section 4 - category 31: Harness-run integrity (an iterated harness\'s own run history is a class fix target too), extended to a migration file\'s own header',
  text: 'A migration file self-declares its applied status (APPLIED / NOT APPLIED / DRAFT / '
    + 'APPLIED-PENDING / NEVER APPLIED) in its leading `-- subject:` line, and that declaration MUST '
    + 'agree with the coordinator\'s own live-schema row-count export for every table the migration '
    + 'CREATEs or DROPs. [CONFIRMED, lane R4-5, 2026-10-01]: four migrations (331/335/277/261) '
    + 'self-declared NOT APPLIED while their object had been live for weeks, a drift no mechanical '
    + 'check had ever caught (CF-DATA-1, remediation-plan-2026-09-30.md Lane 4). A second live run '
    + 'surfaced 19 further mismatches, 10 of which were the check\'s own false positives (reading a '
    + 'whole stale header block instead of the one authoritative subject line) and 4 of which were the '
    + 'honest dropped-later case (a migration correctly says APPLIED and a LATER migration in the '
    + 'corpus correctly drops the same table) -- both are now exempted mechanically rather than hand '
    + 'patched per instance.',
  anchor: '### Section 4 — category 31: Harness-run integrity (an iterated harness\'s own run history is a class fix target too)', // [glyph:verbatim] byte-exact copy of the skill file's own heading, required for the anchor check
  exempt: { reason: 'RETIRED 2026-10-08 (lane GATE-3): F63 was deleted with its test. It read a gitignored live-schema export that is absent in CI, so it returned PASS for every file there (gate evaluation B section 12, confirmed in the CI log). The intent (a migration header must agree with what is live) is owned by migration-history-audit, lane MIG-HIST-1, which supersedes F63; until that lane lands the check is not run anywhere.' },
  residual: 'GATE-3 (2026-10-08): F63 was deleted, so the header-versus-live-schema check described here no longer runs anywhere. F63 self-skips (PASS, not a violation) when no fsi-app/scripts/tmp/live-schema-*.json '
    + 'export is present on disk -- this is gitignored coordinator scratch, never committed, so a '
    + 'plain CI checkout or a laptop session with no fresh export never actually exercises the live '
    + 'cross-check, only the self-skip path. The header-text fixes this lane landed (331/335/277/261 '
    + 'in CF-DATA-1, plus 151/152/153/258 found on the second live run) are themselves proof the check '
    + 'works when the export is present; there is no standing lane that refreshes the export on a '
    + 'schedule, so the live half of this invariant is exercised only when a coordinator-run lane '
    + 'copies a fresh export into the scratch path by hand, same residual F47/F24 already carry for '
    + 'their own migration-tree replay (no live pg_catalog introspection without a credentialed step).',
};
