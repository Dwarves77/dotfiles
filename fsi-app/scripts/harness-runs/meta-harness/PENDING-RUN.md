# Pending run — meta-harness

F28 rule (c) (staleness coupling, `.discipline/fitness/functions/F28-harness-run-integrity.mjs`): the
`meta-harness` family's governing files re-hash to a value no landed artifact records. This marker
acknowledges the change and names the planned run that supersedes it, per that rule's own escape hatch —
the exact "named risk of self-application" `CONVENTION.md` already documents for this family (its
governing files ARE this file and `PROPOSER-RUNBOOK.md`, the two documents almost every wave that extends
the substrate is most likely to touch).

**What changed:** Lane SPEND (system-completion train, 2026-09-02) edited two of `meta-harness`'s four
governing files as part of routing `first-fetch-classify.ts`'s Haiku call through the spend chokepoint
and making the harness-family registration surface derive from `ALLOWED_FAMILIES` instead of a hardcoded
list in three places (`run-artifact.mjs`'s own gate, `run-artifact.test.mjs`, and this file's own
CONVENTION-TABLE-PARITY test):
- `scripts/harness-runs/CONVENTION.md` — the `harness_version` table gained two PRE-REGISTRATION rows
  (`ledger-consume`, `change-detection`, staged ahead of the lanes that register them in
  `ALLOWED_FAMILIES`/`GOVERNING_FILES`) plus the explanatory paragraph naming them as such.
- `.discipline/fitness/functions/F28-harness-run-integrity.mjs` — untouched by this edit (only its
  sibling `F28-harness-run-integrity.test.mjs` changed: the CONVENTION-TABLE-PARITY row-count assertion
  now derives from `ALLOWED_FAMILIES` instead of a hardcoded "6", per the same one-line-registration goal
  above; test files are not governing files, so this alone would not have moved the hash).

No rule in F28 itself changed (no new check, no narrowed check, no behavior difference in `check()`) —
this is a documentation-table addition, exactly the class of edit `CONVENTION.md`'s own "named risk of
self-application" section says is NOT treated as a defect to fix by narrowing the whole-file hash.

**harness_version at write time:** `sha256:d5da7d6f22e64624`

**The planned run that supersedes this marker:** the next real meta-harness wave (whichever lane next
extends the harness-runs substrate — a new fitness rule, a new family shape, a CONVENTION.md schema
change) writes `meta-harness-run-007.json` recording its own real work. If that run's harness_version
happens to re-hash to this same value (no further governing-file edit lands before it runs), its artifact
already accounts for this drift and this marker becomes stale-by-match — delete it per F28's reverse-audit
the moment that artifact lands, same as `mint/PENDING-RUN.md` and `screen/PENDING-RUN.md` already do for
their families.
