# Last proposer pass — meta-harness

Per `PROPOSER-RUNBOOK.md` §2's attestation format. `meta-harness` now has **six** artifacts
(`meta-harness-run-001` … `meta-harness-run-006`); F28's rule (d) requires this file to name the latest
verbatim: **meta-harness-run-006**.

**Artifacts read:** meta-harness-run-001, -002, -003, -004, -005.

**Full traces read:** `scripts/harness-runs/CONVENTION.md` and `PROPOSER-RUNBOOK.md` in full,
`scripts/lib/run-artifact.mjs`, `.discipline/fitness/functions/F28-harness-run-integrity.mjs` (including
its KEEP IT HONEST section), the new family's `PROTOCOL.md`, `scripts/forward-events/DRY-RUN-REPORT.md`,
and `forward-events-run-001.json` with its own `full_trace_refs`.

**Hypotheses (verified, with basis):**

1. **Self-application produced a real finding for the second consecutive cycle, not ceremony.** Run-003's
   pass found the emission gap (F28 cannot see a run that never wrote its artifact). This cycle,
   registering a fifth family edited `run-artifact.mjs` and `F28` — both of which are in meta-harness's
   OWN `GOVERNING_FILES` — so F28 immediately demanded a meta-harness artifact recording why its harness
   changed. That is the gate working on the hand that edits it. Basis: ran the fitness runner and read the
   violation text.

2. **A coordinator assertion was refuted by a lane reading the implementation.** The brief for lane FE-3
   claimed F28 rule (b) fires on the presence of a family *directory*, so withholding the directory would
   avoid a red. FE-3 read `auditFamilyPresence` and showed rule (b) iterates `ALLOWED_FAMILIES`: the
   registration itself raises NO ARTIFACTS, directory or not. The lane reported the contradiction instead
   of routing around it. Recorded in run-004's `defects_found[0]`. The durable lesson is the one this
   registry keeps re-teaching: read the implementation, do not assert from the design.

3. **`hashHarnessVersion` throws rather than degrades on an absent governing file.** FE-3 ran it directly
   against the not-yet-landed forward-events paths and got a raw ENOENT. Nothing crashes today only
   because rule (c) skips families with zero valid artifacts, which happens to shield the intermediate
   state. That is protection by ordering luck, not by design, and it is the sharpest open item on this
   substrate.

4. **The fifth family is complete on the first cycle, unlike the first three.** `forward-events` landed
   with an extractor, execution-wired tests, a protocol, a migration, a registration, and a first real run
   over 322 live items in one wave — where mint, screen and fetch-drain were all retrofitted into this
   convention after the fact. That is the substrate paying off: a new harness now has a shape to be born
   into.

**Proposal for the next cycle:**

1. **Make `hashHarnessVersion` fail with a named error, not a raw ENOENT** — a governing file listed but
   absent is a registration bug worth a sentence that says so, and the current behaviour is only safe by
   accident of evaluation order (hypothesis 3).
2. **Give F28 a rule for the ordering trap this wave walked into**: registering a family in
   `ALLOWED_FAMILIES` without its first artifact in the same commit is always a red, and the message
   should say "land the first artifact in this commit" rather than leaving the author to discover the
   coupling by running the gate (hypothesis 2's class, made mechanical).
3. **No change proposed to the artifact schema.** Four families have now written artifacts against it
   without needing a field it lacks; forward-events fit its metrics into `metrics` unchanged.

**Family gates status:** the landing commit carries `meta-harness-run-004.json`, the new family's first
artifact, and the two test updates (`run-artifact.test.mjs`'s `ALLOWED_FAMILIES` assertion and F28's own
CONVENTION-parity row count), which together take F28 from the two violations the registration raised
back to green.


---

## Pass over meta-harness-run-005 (2026-09-01, coordinator)

**Artifacts read:** all five. **Full traces read:** `docs/audits/system-review-2026-09-01.md`, both
`PENDING-RUN.md` markers (mint, source-sweep), `source-sweep/PROTOCOL.md`, `CORPUS-TURN-RUNBOOK.md`,
`record-tier-population-plan-2026-09-01.md`, and the six lane reports summarized in Addendum 81.

**Hypotheses (verified, with basis):**
1. **The runtime layer is the highest-leverage change this harness has produced**, because it removes
   the session as a dependency for every family at once. Basis: every blocked step on 2026-09-01 traced to
   the sandbox's limits, not to the tools.
2. **Agents report intended state.** One lane reported a commit it had not made; another reported a
   registration the code refuted. Both were caught by running the tools, not by reading the reports.
   Proposal, implemented: every lane brief now requires `git log -1` in the report and every claim is
   checked against the merged fitness run before acceptance.

**Proposal:** discharge both PENDING-RUN markers by real runs through the GitHub runtime on the next
cycle; until then no further edits to the mint or source-sweep governing files.

**Family gates status:** suite green except the F28 staleness this pass resolves; fitness runner green.


---

## Pass over meta-harness-run-006 (2026-09-01, coordinator)

**Artifacts read:** all six. **Full traces read:** `forward-events-run-002.json`,
`source-sweep-run-001.json` and its raw result (moved to `traces/` this landing), the four GitHub Actions
job logs (corpus-turn #1–#3, source-sweep #1), the live EUR-Lex daily view for 30 August 2026 in the
browser, and `forward-events-run-001.json`'s metrics.

**Hypotheses (verified, with basis):**
1. **Run-005's proposal ("discharge both markers by real runs") was executed and it worked as a gate
   should.** The runtime ran; the artifacts landed; reading them against reality found eight defects,
   seven authored in a sandbox that could not execute the code (`PENDING-RUN.md`'s own admission for
   source-sweep). Basis: run-006's `defects_found`, each with the log line or page that showed it.
2. **Dry-first is the discipline that mattered.** Every wrong write the defects would have caused
   (~210 chrome rows, 2 duplicate-edition re-persists) was in source-sweep apply mode, which never ran.
   The corpus-turn apply run wrote only through code that had already run for real once (discover,
   analyze) or wrote nothing (extraction, 0 events). Basis: the job logs.
3. **A claim ahead of its evidence recurred and was caught by the same habit run-005 named.** The
   coordinator reported "shape mismatch" to the operator, then read run-001 and retracted within
   minutes. The mechanism is unchanged: read the artifact before stating the finding. Recorded in
   run-006 `per_item[4]` so it is not smoothed over.
4. **F28's family-level glob is a contract, and the source-sweep driver violated it on first run.**
   `<runId>.raw-result.json` beside the artifact was reported as an INVALID ARTIFACT — the right call —
   and the fix is structural (`traces/` subdirectory, documented in CONVENTION.md), not an allowlist.

**Proposal for the next cycle:**
1. **source-sweep-run-002 (dry re-walk of 25–31 Aug)** to discharge the marker; assert
   `days_duplicate_edition = 2` and single-digit `extracted` per weekday before the first apply walk.
2. **Skip-reason histogram in forward-events metrics** (see `forward-events/LAST-PROPOSER-PASS.md`).
3. **Operator: enable "Allow GitHub Actions to create and approve pull requests"** — the one defect this
   session cannot close; every turn and sweep PR is hand-opened until then.

**Family gates status:** this landing edits `CONVENTION.md` (a meta-harness governing file), which is why
run-006 exists; with it, F28 is green on the merged tree (checked by the landing train's fitness run).
