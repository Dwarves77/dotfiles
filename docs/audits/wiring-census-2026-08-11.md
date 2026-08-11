# Wiring census — 2026-08-11 (operator full-wiring ruling)

The durable record of the whole-system unwired-code discovery, the dispositions taken, and the items
deliberately left as operator decisions. Written because the operator asked: "If we have failed to
navigate items not wired or possibly not wired... Discover them now" — and because the previous audits
had each missed a real class (see `docs/ops/session-log.md`, entries of 2026-08-11).

## Method

Reference-graph fixpoint over `git ls-files`, with generated artifacts (`coverage-report.json`, the
session ledger, `docs/`) excluded as reference sources — counting a generated report as a "reference"
was exactly how the first census undercounted. Execution reachability measured with
`.discipline/governance/execution-wiring.mjs`, the SAME resolver the invariant meta-gate uses, so this
census and the meta-gate cannot disagree about what "wired" means.

Re-run any battery:

```
node fsi-app/.discipline/governance/coverage-scan.mjs          # governed-surface gaps (now a CI gate, F23)
node fsi-app/.discipline/governance/invariant-coverage.mjs      # invariant/doctrine meta-gate
node fsi-app/.discipline/fitness/runner.mjs                     # all fitness functions incl. F23 ratchet
bash fsi-app/.discipline/run-test-suite.sh                      # the no-npm proof suite
```

## Findings and dispositions

### 1. 495 dead one-shot scripts — IDENTIFIED AND ENUMERATED; deletion is one operator command
`fsi-app/scripts/**` held 532 one-shot-style scripts (excluding `lib/`, `verify/`, tests). Fixpoint
analysis: **495 referenced by nothing** (or only by other dead scripts / generated artifacts / the F22
allowlist that existed to grandfather them), 38 genuinely referenced. All 495 are listed verbatim in
`dead-code-manifest-2026-08-11.txt`. Includes all 15 direct-Anthropic-API dead callers (the unticketed
spend exposure), all 16 F22-grandfathered region-population scripts, `scripts/tmp/`, `scripts/archive/`,
`scripts/remediation/` (dead subset), and ~195 `_diag/` probes.

**The files are NOT yet deleted, and that is a delivery constraint, not an unfinished analysis.** This
session commits through the GitHub web UI, which deletes one file per commit; and the repo's Actions
token is set to **read-only** (Settings → Actions → Workflow permissions), so a workflow cannot push the
deletion either. Loosening a repo-wide security setting to perform a one-time deletion is the wrong
trade, so it was not done. The deletion is one command wherever the repo is checked out:

```
xargs -a docs/audits/dead-code-manifest-2026-08-11.txt git rm -q --ignore-unmatch
git commit -m "Dead-code sweep: remove 495 dead one-shot scripts (manifest in docs/audits)"
```

Then, in that same commit, remove the allowlist entries tagged `reviewByPhase: 'dead-code-sweep'` from
F15 and F22, retire the `ingestion_control_log` entry in `producer-consumer-orphan.mjs`, and set
`GAP_BASELINE` to 0/0/0/0 in F23. Every one of those is stale-audited, so if the files go and an entry
stays, the build REDs and tells you exactly which — that RED is the designed handoff signal.

### 2. 24 proofs run by NOTHING — WIRED
177 tracked proof files; 153 executed by a CI surface; **24 executed by nothing** — green, portable,
and invisible, among them `db-register-source-role.test.mjs` (the red-test for the F22 registerSource
wiring itself). Root cause: `run-test-suite.sh`'s scripts/lib entries were a drifted hand list (5
listed, 21 present) and four src directories had no glob. Fixed with directory globs + named entries;
named exclusions documented in the suite header (`institution.selftest.mjs` and
`source-growth.selftest.mjs` import jiti and are execution-wired as F10 fitness sentinels in the
npm-ci job). Suite grew 1065 → 1220 tests, all green.

### 3. ORPHANED-PROOF semantics — REDEFINED
The old predicate ("no rule cites this test's basename") flagged 113 ordinary unit tests CI already
ran, while missing all 24 real orphans. Now `isExecutionWired()`. A citation census is not a wiring
census.

### 4. F15 spend gate blind to scripts/ — SCOPE WIDENED
`enumerate()` covered only `src/**`; 17 scripts made direct Anthropic API calls outside it.
Disposition: 16 deleted (see §1), `scripts/lib/anthropic.mjs` added to SANCTIONED as the ONE
script-side call site (rule 016's sanctioned wrapper). A new script-side bypass is now RED at PR time.

### 5. Governed-surface gaps 156 → 24, orphaned proofs to ZERO
Doctrine-governed write modules mapped to their actual skills in `skill-map.mjs` (directory mappings:
`agent/`, `intake/` → environmental-policy-and-innovation; `sources/`, `connections/` →
source-credibility-model; `llm/`, `d3/`, funded-pass lease/lock → remediation-discipline);
user-account plumbing exempted per-surface with reasons (profile / settings / notifications /
telemetry / auth-provisioning). `GAP_BASELINE` is now **0 orphaned-proofs, 20 unmapped-writes,
2 unmapped-model, 2 unmapped-routing**.

**Orphaned proofs are at hard zero and stay there** — that is the half that did not depend on the
deletion, and it is the half that matters most: every tracked proof is now executed by a CI surface.
The remaining 24 gaps are all files on the deletion manifest; they go to zero in the operator's sweep
commit (§1). The ratchet already bites in both directions, so the moment those files leave, the build
tells you to lower the ceiling.

### 6. F14 stale allowlist entry — RETIRED
Deleting `wave1-cold-start.mjs` removed `ingestion_control_log`'s only writer; F14's own staleness
audit caught it within one suite run. Entry retired. **Open DB question (operator):** the table's
2026-07-03 control-run rows still exist — ratify as historical audit trail or drop the table.

## Discovered, deliberately NOT acted on (operator decisions)

### A. src modules imported by nothing — MECHANIZED (F25), same day
The list below was the grep's answer. Re-measured with a real import graph (every import / require /
dynamic-import specifier extracted and resolved through the tsconfig `@/` alias and the real extension
list, the way the bundler resolves), the true figure is **54 unimported modules of 383 in scope**, A and
B combined. Now gated by **F25 (module-liveness)** / invariant **RD-54**, with all 54 carried as
reason-bearing entries that name the ruling each one waits on.

The graph earned its keep twice over the grep. It found `src/lib/verification.ts` — a 1.2 KB helper
sitting one directory above the 50 KB W2.F pipeline `src/lib/sources/verification.ts`, imported by
nothing, which basename matching had masked. And it forced the entry-point list to be right, which
caught a near-miss worth recording: **`src/proxy.ts` has zero importers and looks exactly like dead
code. It is the Next 16 middleware entry point and gates authentication for every route in the
application.** A liveness gate that reported it dead would have invited someone to delete the auth
boundary. Framework entry points are invoked by convention, never imported; that list is load-bearing.

A coupled gap was closed alongside: F15's `SANCTIONED` set was the one list in the suite that was NOT
stale-audited, so a deleted sanctioned path would have left the spend chokepoint permanently exempting
a ghost. It now REDs — which matters immediately, because `scripts/lib/anthropic.mjs` (the sole
sanctioned script-side call site) is imported only by manifest scripts and loses every consumer the
moment the sweep lands.

The original grep list, kept for the record:

Unmounted UI components + dormant lib modules. Two deserve attention beyond dead-code cleanup:
`src/lib/llm/spend-regime.mjs` (spend-regime doctrine code with zero importers — the seek-more
dormant-capability class) and `src/lib/d3/hooks-reconstruction.mjs`. Full list:

```
components/credibility/JurisdictionChip.tsx  components/credibility/ProvenancePanel.tsx
components/credibility/SignalStrength.tsx    components/regulations/BulkSelectBar.tsx
components/regulations/ConfidenceFacet.tsx   components/regulations/SectorChipFilter.tsx
components/regulations/SortRow.tsx           components/regulations/ViewToggles.tsx
components/resource/SectorSynopsis.tsx       components/shell/SectionHeader.tsx
components/shell/StatStrip.tsx               components/sources/SourceProvenanceBadge.tsx
components/ui/Pill.tsx  components/ui/RowCard.tsx  components/ui/Tag.tsx
components/ui/Toggle.tsx  components/ui/Tooltip.tsx
lib/agent/extract-research-sections.ts       lib/d3/hooks-reconstruction.mjs
lib/dashboard/credibility.ts                 lib/dashboard/critical-items.ts
lib/llm/spend-regime.mjs
```

This is the P4 liveness-gate backlog (ts-prune / unmounted-component scan) — mechanize before deleting.

### B. scripts/lib modules with no non-test consumer — MECHANIZED (F25), same day
Folded into F25 with §A above (17 of the 54). Original list, kept for the record:

Proven (selftests now wired) but consumed by nothing: block1-reaudit, bootstrap-test1,
decision-log-audit, drift-check-reconstruction, error-drop-probe, exclusion-audit-reconstruction,
funded-release-plan, inconclusive-report, liveness-reconstruction, net-agent,
surface-registry-reconstruction, type-consumer-probe, urgency, verify-reconstruction. Dormant
capability vs delete-with-tests: per-module operator call.

### C. Scheduled workflows — one STOPPED this session, two left running
| workflow | schedule | state |
|---|---|---|
| `source-monitoring.yml` | hourly | **disabled** — acquisition freeze, operator ruling 2026-07-13 |
| `spot-check-monthly.yml` | monthly | **disabled** — acquisition freeze, operator ruling 2026-07-13 |
| `data-audit-lane.yml` | nightly 06:00 UTC | **STOPPED 2026-08-11 (operator ruling)** — see below |
| `uptime-probes.yml` | daily 09:00 UTC | running — spend watch only |
| `trust-recompute.yml` | monthly | running |

**The data-audit lane is stopped, not fixed — by explicit instruction.** It had failed on EVERY
nightly run from at least Aug 4 through Aug 11 (runs #58–#65, eight consecutive reds), emailing the
operator each morning. Stopped two ways: disabled in the Actions UI (immediate) AND the `schedule:`
block commented out in the workflow file (durable — re-enabling in the UI does not resurrect the
cron). Every audit script under `scripts/verify/` remains in the tree and remains runnable on demand
via `workflow_dispatch`; only the unattended nightly firing is stopped. **OPEN ITEM: the underlying
failure is undiagnosed.** Eight straight reds on a live-data lane means either the audits are
genuinely finding corpus drift nobody is reading, or the lane itself is broken (expired secret,
schema drift, a renamed script). Both readings matter; neither has been established.

`uptime-probes.yml` was re-shaped 2026-08-10 (before this session): its `*/30` surfaces cron was
removed for exactly this recurring-red-email reason, leaving only the daily **spend watch**, which
fails only on a post-freeze paid `agent_runs` row that does not trace to an operator-priced line.
That one is the untraceable-spend alarm and was deliberately left running.

### D. The database side — SWEPT, same day (was "the one unswept layer")
Run, findings recorded in `db-layer-census-2026-08-11.md`, standing gate shipped as **F24
(db-object-migration-home)** / invariant **RD-53**. Headline: **22 of 181 catalog objects exist in
production with no committed migration** — the "out-of-repo DDL" class the 2026-07-19 structure audit
named and nobody ever counted. Two live defects fell straight out of it:

- **A four-function API left callable after its table was dropped.** Migration 219 dropped
  `hold_resolution_queue` on 2026-07-19; `hrq_enqueue` / `hrq_escalate` / `hrq_exit` /
  `hrq_record_attempt` stayed, and each throws on a missing relation. The reviewer read a clean DROP and
  could not see the callers, because the callers were not in the repo.
- **Gate A is implemented twice.** Fifteen `gate_a_*` SQL functions duplicate
  `src/lib/agent/gate-a-scan.mjs`, share its version literal `2026-07-30.1` by hand-copy with nothing
  enforcing the equality, and are called by nothing. The TypeScript copy is what runs. This is the
  shadow-capability class the doctrine already forbids in words; both were left standing because one of
  them was not in the repo to be read.

Also live-verified and worth the record: `cron.job` is **empty** (nothing is scheduled inside the
database), every trigger function has a trigger, and three apparent orphans were **retracted after
checking** — `gate_a_health_refresh` (deliberately unscheduled by operator ruling 2026-08-10),
`capture_worker_fetch` (invoked by hand from the fleet-charter runbooks), and the `d3_runs` write
(defined-not-applied, skips-with-log, selftest-proven). Open operator items: `pg_net` + `pg_cron` are
installed, so database-originated egress and scheduling sit outside every repo-side gate — zero active
today, capability ungoverned.

### E. Docs-tree duplication
~65k lines of markdown across `docs/` and `fsi-app/docs/` with parallel `design`/`designs`/`audits`
trees and the frozen `fsi-app/docs/ops/session-log.md` fork (rule 020 guards the fork). Historical
record, not wiring debt; consolidation is editorial, not mechanical.

## The wall, going forward

Every class this census found now has a standing gate: dead spend callers (F15, widened), unexecuted
proofs (F23 orphaned-proofs at 0 via execution-wiring), ungoverned writes/model/routing (F23 at 0),
unregistered mechanisms (invariant meta-gate, orphan-mechanism check), stale allowlists (F14/F15/F24/F25
staleness audits), out-of-repo DDL (F24), unwired modules (F25). **Every class this census found is now
mechanized.** A, B and D were all closed the same day they were named.

What is left is not a missing gate; it is a set of RULINGS the gates are holding open and reporting:
the 495-file deletion (one operator command), the disposition of the 54 unwired modules, the 22
out-of-repo database objects, and the undiagnosed data-audit lane. Each is enumerated with its reason
and its review phase in the gate that holds it, so none of them can go quiet.
