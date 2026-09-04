# Last proposer pass — meta-harness

Per `PROPOSER-RUNBOOK.md` §2's attestation format. `meta-harness` now has **eight** artifacts
(`meta-harness-run-001` … `meta-harness-run-008`); F28's rule (d) requires this file to name the latest
verbatim: **meta-harness-run-008**.

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

---

## Pass over meta-harness-run-007 (coordinator, 2026-09-02, system-completion train)

**Artifact read:** meta-harness-run-007 in full, plus the nine lane reports it summarises and the two
re-pinned first-run markers it names.

**Hypotheses (verified, with basis):**

1. **The registry's gates caught 5 of 14 defects; reading caught 9.** Basis: run-007's `per_item`
   evidence, each entry naming which mechanism surfaced the defect. The shared-writer registry, the
   secrets-reference audit, F15's stale-allowlist check and rule 016 all fired on real problems; the
   join-class defects (units, PK shape, coverage, stale pins) had no gate and were found by a lane or the
   coordinator reading the consumer or the primary source.
2. **Self-application fired for the third consecutive cycle and was answered with a record, not a
   narrowed hash.** Basis: F28 rule (c) on the meta-harness family after `run-artifact.mjs`, F28 and
   CONVENTION.md changed; run-007 carries the current hash; the marker Lane SPEND wrote is deleted.
3. **Lane-time hash pins do not survive integration when siblings share governing files.** Basis: two of
   three new markers were stale by the time the train assembled (first-fetch-classify.ts edited by SPEND
   after CONSUME pinned it; run-change-detection.mjs edited by CD's own second commit).

**Proposal carried into the next cycle:** a JOIN CHECK line in every lane brief and a coordinator re-hash
of every `PENDING-RUN.md` after the final merge (run-007 `proposer_notes`). Implemented this cycle: the
family-list tests now derive from `ALLOWED_FAMILIES` (Lane SPEND), the one proposal from the run-006 pass
that was actionable inside this train.

---

## Pass over meta-harness-run-008 (coordinator, 2026-09-04, trains 23-34 / PRs #570-#581)

**Artifacts read:** meta-harness-run-001 through -007 (per §1's "read every artifact in full"; -001
through -005 previously summarized in this file's own prior passes, re-read here alongside -006 and -007
in full). **Full traces read:** `docs/ops/session-log.md` Addendum 85 postscripts 30-45 in full (lines
9372-9781), `git log --oneline 697be18e^..f13bc362`, `git show f13bc362 --stat` and `git show 443b70fd
--stat`, `fsi-app/scripts/harness-runs/meta-harness/PENDING-RUN.md` (read before deletion),
`.discipline/fitness/functions/F28-harness-run-integrity.mjs` in full, `CONVENTION.md` and
`PROPOSER-RUNBOOK.md` in full, `docs/PROGRAM-BOARD.md` line 1796.

**Hypotheses (verified, with basis):**

1. **A fix landing in a copy instead of the source recurred, one wave after the same class was already
   on record.** Basis: GATE-A-TOKENS' harvest fix landed in `scripts/mint/lib/gate-a-scan.mjs` (the
   hand-mirrored kit copy), not `src/lib/agent/gate-a-scan.mjs` (what `write-item.ts`, the heal and the
   pipeline actually import) — the lane's own honest scope note caught it before landing, and the
   coordinator's single-source collapse (kit files become `export *` re-exports) is what moved
   `meta-harness`'s own governing-file hash and produced this run. This is the same drift class an
   earlier train's harvest fix had already committed to the copy only, silently, per this file's own
   `LAST-PROPOSER-PASS.md` history — reading the full trace, not the summary, is what surfaced it again.
2. **Hand-built namespaces and resolvers drift from the module or corpus they wrap, and tests do not
   catch it.** Basis: `defects_found[7]` (IN-CHUNK-2, the coordinator's own miss — a chunked writer
   switched in but never added to the flywheel driver's hand-built `db` namespace, caught only by a live
   run, not by the 73 tests that inject a fake `db`); `defects_found[0]` and `[8]` (LEGACY-3 then
   LEGACY-4, a legacy-artifact resolver measured against one of three real id shapes, twice).
3. **Every defect this wave surfaced through a live run failing or a lane/coordinator reading real data,
   never through a pre-existing gate — with one exception.** Basis: `metrics.gate_catch_rate` — of 17
   code defects, only RETEXT-COLLIDE's was caught by an existing automated check (the DB's own
   `uq_item_forward_events_dedupe` unique index refusing a duplicate write); the rest were found live.
4. **Run-007's second proposal (coordinator re-hash of every `PENDING-RUN.md` after the last merge) was
   followed through this wave; its first (a JOIN CHECK line in every lane brief) cannot be confirmed
   implemented from the postscripts alone**, and the join-class defects above suggest that if it was
   added, it is not yet catching them before they surface live. Basis: `metrics.run_007_proposal_status`.

**Proposal for the next cycle:** require a lane whose diff touches a hand-maintained copy, a hardcoded
namespace object, or a resolver's input-shape assumption to grep the actual call sites or live data for
every OTHER shape that assumption excludes before landing — the same discipline BACKLOG-LEGACY's
"11/11" measurement, IN-CHUNK-2's `db` namespace, and the Gate-A kit copy all lacked, made mechanical
rather than left to a lane's own honesty (run-008 `proposer_notes`).

**Family gates status:** green. `node .discipline/fitness/runner.mjs` reports 0 violations both before
this change (`PENDING-RUN.md` present, F28 passing on the acknowledged marker) and after
(`PENDING-RUN.md` deleted, `meta-harness-run-008.json` present, F28 rule (c) satisfied by the matching
`harness_version`, rule (d) satisfied by this file naming `meta-harness-run-008`); `node --test
.discipline/governance/*.test.mjs .discipline/fitness/*.test.mjs .discipline/*.test.mjs` green.
